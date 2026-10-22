import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { instantOf } from '../../../core/instant';
import { ToastService } from '../../../shared/ui/toast.service';
import { EngineDial, EngineSetting, EngineSettingChange, EngineSettingsAnswer, dialValueError } from './configuration.models';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { confirmWith } from '../../../shared/ui/confirm';
import { Dialog } from '@angular/cdk/dialog';
import { StatTile } from '../../../shared/ui/stat-tile';

const ENDPOINT = () => `${API_BASE}/setting.json/engineSettings`;

/**
 * Platform › Engine settings (MIG-167; owner #24, 2026-10-19), platform administrators only: the engine's allow-listed
 * settings -- runs claimed per dispatch pass, steps a pipeline may have, the longest step timeout, a run's memory budget,
 * the streaming batch, runs at once, and the backfill limits. Each shows its value, its default and range, when a change
 * takes effect, and -- where a workspace may have its own -- the workspaces that do. A change is digits inside the range
 * (the server checks again), audited with the old and new value; Reset puts the default back. The two cron watermarks are
 * shown and never edited. Secrets and infrastructure settings stay in the environment and are not on this page.
 */
@Component({
  selector: 'app-engine-settings',
  imports: [RefreshButton, PageHeader, Icon, ServerTimePipe, DecimalPipe, Combobox, StatTile],
  templateUrl: './engine-settings.html',
})
export class EngineSettings implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  readonly directory = inject(WorkspaceDirectory);

  readonly settings = signal<EngineDial[]>([]);
  readonly watermarks = signal<EngineSetting[]>([]);
  readonly cacheSeconds = signal(30);
  readonly history = signal<EngineSettingChange[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** The setting open for editing, and what is typed: the platform's value, and a workspace's own. */
  readonly open = signal<string | null>(null);
  readonly draft = signal('');
  readonly ownWorkspace = signal('');
  readonly ownDraft = signal('');
  readonly saving = signal(false);

  readonly openDial = computed(() => this.settings().find(s => s.key === this.open()) ?? null);
  readonly draftError = computed(() => { const d = this.openDial(); return d ? dialValueError(d, this.draft()) : null; });
  readonly ownError = computed(() => { const d = this.openDial(); return d ? dialValueError(d, this.ownDraft()) : null; });
  readonly changedCount = computed(() => this.settings().filter(s => !s.atDefault).length);
  readonly overrideCount = computed(() => this.settings().reduce((n, s) => n + s.overrides.length, 0));
  readonly workspaceOptions = computed<ComboboxOption[]>(() => {
    const taken = new Set((this.openDial()?.overrides ?? []).map(o => o.tenantId));
    return this.directory.workspaces().filter(w => !taken.has(w.tenantId))
      .map(w => ({ value: String(w.tenantId), label: this.directory.nameOf(w.tenantId), hint: w.tenantCode ?? undefined }));
  });

  ngOnInit(): void {
    this.directory.load().subscribe();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<EngineSettingsAnswer>>(ENDPOINT()).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) { this.error.set(response.message || 'Could not load the engine settings.'); return; }
        this.settings.set(response.data.settings ?? []);
        this.watermarks.set(response.data.watermarks ?? []);
        this.cacheSeconds.set(response.data.cacheSeconds ?? 30);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the engine settings.');
      },
    });
    this.loadHistory();
  }

  loadHistory(): void {
    this.http.get<ApiResponse<EngineSettingChange[]>>(`${ENDPOINT()}/history`, { params: { limit: 50 } }).subscribe({
      next: r => this.history.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.history.set([]),
    });
  }

  /** A watermark is an instant: read in the console's 24-hour format, the stored text on its tooltip (UI review U6). */
  isInstant(value: string | null | undefined): boolean {
    return !!value && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && instantOf(value) !== null;
  }

  workspaceName(id: number | null): string {
    return id == null ? 'Platform' : this.directory.nameOf(id);
  }

  toggle(dial: EngineDial): void {
    if (this.open() === dial.key) { this.open.set(null); return; }
    this.open.set(dial.key);
    this.draft.set(String(dial.value));
    this.ownWorkspace.set('');
    this.ownDraft.set('');
  }

  save(dial: EngineDial, tenantId: number | null = null): void {
    const value = tenantId === null ? this.draft() : this.ownDraft();
    const problem = dialValueError(dial, value);
    if (problem) { this.toast.error(problem); return; }
    this.saving.set(true);
    this.http.put<ApiResponse<EngineDial>>(ENDPOINT(), { key: dial.key, value, ...(tenantId === null ? {} : { tenantId }) }).subscribe({
      next: r => this.took(r, 'The setting could not be saved.'),
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The setting could not be saved.'); },
    });
  }

  saveOwn(dial: EngineDial): void {
    const id = Number(this.ownWorkspace());
    if (!Number.isFinite(id) || id <= 0) { this.toast.error('Pick the workspace first.'); return; }
    this.save(dial, id);
  }

  async reset(dial: EngineDial, tenantId: number | null = null): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: tenantId === null ? `Reset ${dial.label} to its default?` : `Reset ${this.workspaceName(tenantId)} to the platform's value?`,
      body: tenantId === null
        ? `It goes back to ${dial.defaultValue.toLocaleString('en-US')} ${dial.unit} (${dial.defaultFrom === 'built-in' ? 'the built-in default' : 'the environment\'s ' + dial.defaultFrom}). ${dial.takesEffect}`
        : `${this.workspaceName(tenantId)} goes back to the platform's ${dial.value.toLocaleString('en-US')} ${dial.unit}. ${dial.takesEffect}`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    this.saving.set(true);
    this.http.post<ApiResponse<EngineDial>>(`${ENDPOINT()}/reset`, { key: dial.key, ...(tenantId === null ? {} : { tenantId }) }).subscribe({
      next: r => this.took(r, 'The setting could not be reset.'),
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The setting could not be reset.'); },
    });
  }

  private took(r: ApiResponse<EngineDial>, failed: string): void {
    this.saving.set(false);
    if (r.status !== API_SUCCESS) { this.toast.error(r.message || failed); return; }
    if (r.data) this.settings.update(list => list.map(s => (s.key === r.data!.key ? r.data! : s)));
    this.draft.set(String(r.data?.value ?? this.draft()));
    this.ownWorkspace.set('');
    this.ownDraft.set('');
    this.toast.success(r.message);
    this.loadHistory();
  }
}
