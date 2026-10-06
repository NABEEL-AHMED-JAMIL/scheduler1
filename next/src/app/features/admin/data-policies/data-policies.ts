import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { Field } from '../../../shared/ui/field';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { SENSITIVITY_TEXT } from '../../../shared/ui/sensitivity';
import { ModelConnection } from '../../ai/ai-providers';
import { DataPolicyApi } from './data-policy.api';
import {
  LevelDraft, MODEL_RULES, ModelChoice, ModelRule, PolicyLevel, allowedText, defaultLevel, draftOf, draftProblem, isChanged,
  levelsOf, modelChoices, policyState, ruleBlocks, ruleOf, saveBody,
} from './data-policy.model';

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
  imports: [Icon, LoadError, BlurLoader, Combobox, Field, RouterLink],
  templateUrl: './data-policies.html',
})
export class DataPolicies implements OnInit {
  private readonly api = inject(DataPolicyApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly canEdit = computed(() => this.auth.isTenantAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly rules = MODEL_RULES;
  readonly text = SENSITIVITY_TEXT;

  readonly tenantId = signal<number | null>(null);
  readonly tenants = signal<ComboboxOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly rule = signal('');
  readonly levels = signal<PolicyLevel[]>([]);
  readonly drafts = signal<LevelDraft[]>([]);
  readonly connections = signal<ModelConnection[]>([]);
  readonly connectionsError = signal('');

  readonly state = computed(() => policyState(this.levels()));
  readonly choices = computed(() => modelChoices(this.connections(), this.tenantId()));
  readonly problems = computed(() => this.drafts().map(d => draftProblem(d)));
  readonly changed = computed(() => this.drafts().map((d, i) => !!this.levels()[i] && isChanged(d, this.levels()[i])));
  readonly changedCount = computed(() => this.changed().filter(Boolean).length);
  /** A platform administrator reads a workspace's policy only once one is picked. */
  readonly waitingForWorkspace = computed(() => this.isPlatformAdmin() && this.tenantId() == null);

  ngOnInit(): void {
    if (this.isPlatformAdmin()) {
      this.api.tenants().subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set((r.data ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName }))); },
        error: () => {},
      });
      return;
    }
    this.load();
  }

  pickWorkspace(value: string): void {
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
    if (this.canEdit() && !this.connections().length) {
      this.api.connections().subscribe({
        next: r => { if (r.status === API_SUCCESS) this.connections.set(r.data ?? []); else this.connectionsError.set(r.message); },
        error: err => this.connectionsError.set(err?.error?.message || 'The model connections could not be read.'),
      });
    }
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
  allowedName(entry: string): string { return allowedText(entry, this.connections()); }
  retentionText(d: LevelDraft): string {
    const days = d.retention.trim();
    return days ? `${days} day${days === '1' ? '' : 's'}` : 'The pipeline\'s own';
  }
}
