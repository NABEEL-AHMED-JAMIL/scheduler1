import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { InlineStatus, loadErrorText } from '../../../shared/ui/loading';
import { SENSITIVITY_TEXT } from '../../../shared/ui/sensitivity';
import { ModelConnection } from '../../ai/ai-providers';
import { DataPolicyApi } from './data-policy.api';
import {
  LevelDraft, MODEL_RULES, ModelChoice, ModelRule, PolicyLevel, allowedText, defaultLevel, draftOf, draftProblem, isChanged,
  levelsOf, modelChoices, policyState, ruleBlocks, ruleOf, saveBody,
} from './data-policy.model';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { ReviewPolicyCard } from './review-policy-card';
import { RetentionCard } from './retention-card';
import { Dialog } from '@angular/cdk/dialog';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { NeedsWorkspace } from '../../../shared/ui/needs-workspace';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { RetentionPlatformPanel } from './retention-platform-panel';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { CatalogModel, ModelCatalogApi } from '../../ai/model-catalog/model-catalog';

type Switch = 'aiWriteTools' | 'minFieldsWarning';

/** The service writes its dashes as "--"; the console shows an em dash. */
const readable = (text: string | null | undefined) => (text ?? '').replace(/\s--\s/g, ' — ');

/**
 * Administration › Data policies (MIG-254 over MIG-243): for each level of data, which models may see it, how long a
 * run keeps it, and whether the AI Assistant may change things with it. A workspace administrator edits; every member
 * holding the Prompts page reads it (the service reads it for TENANT_USER), so a person can see why a model or a tool
 * was refused. Delivery options are stored by the service for Destinations, which are not built: not shown, not sent.
 */
@Component({
  selector: 'app-data-policies',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, Icon, LoadError, BlurLoader, RouterLink, ReviewPolicyCard, RetentionCard, NeedsWorkspace, InlineStatus,
    AdvancedSelect],
  templateUrl: './data-policies.html',
  styles: `
    .policy-table { table-layout: fixed; min-width: 56rem; }
    .policy-table .policy-setting-col { width: 15rem; }
    .policy-table tbody th { text-align: left; vertical-align: top; text-transform: none; letter-spacing: normal; font-weight: 400;
      padding: 0.625rem 1rem; border-bottom: 1px solid var(--border-subtle); }
    .policy-table td { vertical-align: top; }
  `,
})
export class DataPolicies implements OnInit {
  private readonly api = inject(DataPolicyApi);
  private readonly catalogApi = inject(ModelCatalogApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly canEdit = computed(() => this.auth.isTenantAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly rules = MODEL_RULES;
  readonly text = SENSITIVITY_TEXT;
  /** The levels as the table's columns, Sensitive (PHI) first (UX review B8, DP1); `i` is the level's index in drafts(). */
  readonly columns = computed(() => {
    const rank: Record<string, number> = { sensitive: 0, internal: 1, public: 2 };
    return this.drafts().map((d, i) => ({ d, i })).sort((a, b) => (rank[a.d.sensitivity] ?? 9) - (rank[b.d.sensitivity] ?? 9));
  });

  /**
   * ZT-A12 follow-up (owner 2026-10-21, "Managed session only"): a workspace's data policy, review policy and retention
   * are its own, read and changed in "Work in this workspace"; the platform administrator's own sign-in is told so
   * (NeedsWorkspace) and reads none of them. The platform's retention minimums, for every workspace, stay here.
   */
  readonly ownSignIn = computed(() => isOwnPlatformSignIn(this.auth));
  private readonly dialog = inject(Dialog);
  readonly tenantId = signal<number | null>(this.ownSignIn() ? null : inject(WorkspaceDirectory).remembered());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly rule = signal('');
  readonly levels = signal<PolicyLevel[]>([]);
  readonly drafts = signal<LevelDraft[]>([]);
  readonly connections = signal<ModelConnection[]>([]);
  readonly connectionsError = signal('');
  /**
   * Owner 2026-10-27: the model list's own state, so each level says "Loading model connections…" rather than "No model
   * connections in this workspace yet." while the list is on its way, and a failed read can be tried again.
   */
  readonly connectionsLoading = signal(false);
  readonly connectionsLoaded = signal(false);

  /** Owner 2026-11-02: the platform's list of models (the ones switched on), which every allowed model is chosen from. */
  readonly catalog = signal<CatalogModel[]>([]);
  readonly catalogError = signal('');

  readonly state = computed(() => policyState(this.levels()));
  readonly choices = computed(() => modelChoices(this.connections(), this.tenantId(), this.catalog()));
  readonly problems = computed(() => this.drafts().map(d => draftProblem(d)));
  readonly changed = computed(() => this.drafts().map((d, i) => !!this.levels()[i] && isChanged(d, this.levels()[i])));
  readonly changedCount = computed(() => this.changed().filter(Boolean).length);
  /** A platform administrator reads a workspace's policy only once one is picked. */
  readonly waitingForWorkspace = computed(() => this.isPlatformAdmin() && this.tenantId() == null);

  ngOnInit(): void {
    // A platform administrator reads the workspace picked (this session's choice, owner #5); a workspace's own people theirs.
    if (this.ownSignIn() || (this.isPlatformAdmin() && this.tenantId() == null)) return;
    this.load();
  }

  /** The platform's retention minimums, for every workspace (setting.json/retention/platform): the own sign-in's to set. */
  openPlatformMinimums(): void {
    this.dialog.open<boolean, unknown, RetentionPlatformPanel>(RetentionPlatformPanel, sidePanelConfig({}, 'narrow', 'right'));
  }

  pickWorkspace(value: string): void {
    if (this.ownSignIn()) return;
    const id = Number(value);
    this.tenantId.set(value && Number.isFinite(id) ? id : null);
    this.saveError.set('');
    if (this.tenantId() == null) { this.levels.set([]); this.drafts.set([]); return; }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get(this.tenantId()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'The data policy could not be read.'); return; }
        this.rule.set(readable(r.data?.rule));
        this.show(levelsOf(r.data));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The data policy could not be read.'); },
    });
    if (this.canEdit() && !this.connections().length) this.loadConnections();
    else if (!this.catalog().length) this.loadCatalog();
  }

  /** The platform's list of models (the ones switched on): every member reads it, so a chosen model reads by its name. */
  loadCatalog(): void {
    this.catalogError.set('');
    this.catalogApi.list().subscribe({
      next: r => {
        if (r.status === API_SUCCESS) this.catalog.set(Array.isArray(r.data) ? r.data : []);
        else this.catalogError.set(loadErrorText(r, 'The platform\'s list of models could not be read.'));
      },
      error: err => this.catalogError.set(loadErrorText(err, 'The platform\'s list of models could not be read.')),
    });
  }

  loadConnections(): void {
    this.connectionsLoading.set(true);
    this.connectionsError.set('');
    this.loadCatalog();
    this.api.connections().subscribe({
      next: r => {
        this.connectionsLoading.set(false);
        if (r.status === API_SUCCESS) { this.connections.set(r.data ?? []); this.connectionsLoaded.set(true); }
        else this.connectionsError.set(loadErrorText(r, 'The model connections could not be read.'));
      },
      error: err => { this.connectionsLoading.set(false); this.connectionsError.set(loadErrorText(err, 'The model connections could not be read.')); },
    });
  }

  private show(levels: PolicyLevel[]): void {
    this.levels.set(levels);
    this.drafts.set(levels.map(draftOf));
  }

  private patch(i: number, change: Partial<LevelDraft>): void {
    this.saveError.set('');
    this.drafts.update(list => list.map((d, j) => (j === i ? { ...d, ...change } : d)));
  }

  setRule(i: number, value: string): void { this.patch(i, { modelRule: value as ModelRule }); }
  setRetention(i: number, raw: string): void { this.patch(i, { retention: raw }); }
  setSwitch(i: number, which: Switch, on: boolean): void { this.patch(i, { [which]: on }); }

  toggleModel(i: number, value: string, on: boolean): void {
    const now = this.drafts()[i].allowedModels.filter(v => v !== value);
    this.patch(i, { allowedModels: on ? [...now, value] : now });
  }

  isDefault(i: number): boolean {
    const d = this.drafts()[i];
    return !!d && !isChanged(d, defaultLevel(d.sensitivity));
  }

  useDefaults(i: number): void { this.patch(i, draftOf(defaultLevel(this.drafts()[i].sensitivity))); }

  discard(): void { this.saveError.set(''); this.drafts.set(this.levels().map(draftOf)); }

  save(): void {
    if (!this.canEdit() || this.saving()) return;
    if (this.problems().some(Boolean)) { this.toast.error('Check the highlighted retention.'); return; }
    const body = saveBody(this.drafts(), this.levels(), this.isPlatformAdmin() ? this.tenantId() : null);
    if (!body.levels.length) { this.toast.info('Nothing has changed.'); return; }
    this.saving.set(true);
    this.saveError.set('');
    this.api.save(body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.saveError.set(r.message); this.toast.error(r.message); return; }
        this.toast.success(r.message);
        if (r.data?.rule) this.rule.set(readable(r.data.rule));
        this.show(levelsOf(r.data));
      },
      error: err => {
        this.saving.set(false);
        const message = err?.error?.message || 'The data policy could not be saved.';
        this.saveError.set(message);
        this.toast.error(message);
      },
    });
  }

  // -------------------------------------------------------------------------------------------- reading

  ruleText(rule: string): string { return ruleOf(rule).label; }
  ruleExplain(rule: string): string { return ruleOf(rule).explain; }
  blocked(rule: ModelRule, choice: ModelChoice): string | null { return ruleBlocks(rule, choice); }
  /** Saved entries no choice offers (a connection since deleted, or one the list could not show), kept so they can be unticked. */
  unknownAllowed(i: number): string[] {
    const offered = new Set(this.choices().map(c => c.value));
    return (this.drafts()[i]?.allowedModels ?? []).filter(v => !offered.has(v));
  }
  allowedName(entry: string): string { return allowedText(entry, this.connections(), this.catalog()); }

  /**
   * Owner 2026-11-02: what a level's "Add a model" offers -- each connection whole, then each listed model it runs, grouped
   * by connection; one the level's rule would never allow is shown greyed with why; one already chosen is left out.
   */
  optionsFor(i: number): AdvancedOption[] {
    const d = this.drafts()[i];
    if (!d) return [];
    return this.choices().filter(c => !d.allowedModels.includes(c.value)).map(c => {
      const why = ruleBlocks(d.modelRule, c);
      return {
        value: c.value, label: c.label, group: c.connectionName, sample: c.model ?? undefined, mono: false,
        description: c.model ? (c.local ? 'Local' : c.baa ? 'Hosted, BAA-marked connection' : 'Hosted') : 'Every model on the list this connection runs',
        badge: why ?? (c.local ? 'Local' : c.baa ? 'BAA' : 'Hosted'), badgeTone: why ? 'warn' : c.local ? 'ok' : 'info',
        keywords: `${c.connectionName} ${c.model ?? ''}`, disabled: !!why,
      } as AdvancedOption;
    });
  }

  /** Why a chosen entry can never be used under the level's rule (it stays chosen until removed), or null. */
  chosenBlocked(i: number, entry: string): string | null {
    const d = this.drafts()[i];
    const choice = this.choices().find(c => c.value === entry);
    return d && choice ? ruleBlocks(d.modelRule, choice) : null;
  }

  addModel(i: number, picked: AdvancedOption | null): void {
    if (picked && !picked.disabled) this.toggleModel(i, picked.value, true);
  }
  retentionText(d: LevelDraft): string {
    const days = d.retention.trim();
    return days ? `${days} day${days === '1' ? '' : 's'}` : 'The pipeline\'s own';
  }
}
