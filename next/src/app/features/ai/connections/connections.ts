import { Component, LOCALE_ID, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ONE_PANE_BELOW_1024 } from '../../../shared/ui/one-pane';
import { Icon } from '../../../shared/ui/icon';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { confirmWith } from '../../../shared/ui/confirm';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { ConnectionDialog } from './connection-dialog';
import { AI_PROVIDERS, ModelConnection, providerOf, providerPill, statusPill } from '../ai-providers';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { Bar, BarChart } from '../../../shared/charts/bar-chart';
import { statusColor } from '../../../shared/charts/status-color';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { readableRunError } from './run-error';
import { formatDuration } from '../../../shared/ui/time-format';
import { AppLoading, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

/**
 * Model connections: where prompts run. The same rail-and-pane the Kafka page has, because
 * a model connection is the same kind of thing as a Kafka connection -- an endpoint, a
 * secret, a test, a default -- and a person who knows one screen knows the other.
 */
@Component({
  selector: 'app-connections',
  imports: [RefreshButton, PageHeader, Icon, StatTile, StatusPill, MineFilter, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, BlurLoader, ServerTimePipe, DecimalPipe, ManagedBanner,
    BarChart, AppLoading, LoadError, SortHeader],
  styles: [ONE_PANE_BELOW_1024],
  templateUrl: './connections.html',
})
export class Connections implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  /** MIG-254: a MANAGED workspace's model connections are our team's to change; testing one still works. */
  readonly locked = computed(() => this.auth.builderLocked());
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly connections = signal<ModelConnection[]>([]);
  /** The list's read (owner 2026-10-27): the tiles and the panes wait for the first answer instead of showing 0. */
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly testing = signal<number | null>(null);
  readonly search = signal('');
  readonly providerFilter = signal('');
  readonly statusFilter = signal('');
  readonly onlyMine = signal(false);
  readonly providers = AI_PROVIDERS;
  readonly canSeeWorkspace = computed(() => this.auth.isPlatformAdmin());
  private readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  /** The workspaces a platform administrator's new connection picks from: New waits for them (see create()). */
  readonly tenantsState = createLoadState(false);

  readonly selectedId = signal<number | null>(null);
  /**
   * Review 2026-10-07 (M17): below 1024 px one pane at a time, as the task inbox: the list, or the connection opened
   * from it with "Back to list". A link naming a connection (?connection=) opens it; the automatic pick does not.
   */
  readonly pane = signal<'list' | 'detail'>(this.route.snapshot.queryParamMap.get('connection') ? 'detail' : 'list');
  readonly selected = computed(() => this.connections().find(c => c.connectionId === this.selectedId()) ?? null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const myId = this.auth.user()?.appUserId ?? null;
    return this.connections().filter(c =>
      (!this.providerFilter() || c.provider === this.providerFilter())
      && (!this.statusFilter() || c.status === this.statusFilter())
      && (!this.onlyMine() || isMine(c, myId))
      && (!q || `${c.name} ${c.provider} ${c.defaultModel} ${c.apiEndpoint ?? ''} ${c.tenantName ?? ''}`.toLowerCase().includes(q)));
  });
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.providerFilter() || !!this.statusFilter() || this.onlyMine());

  readonly summary = computed(() => {
    const list = this.connections();
    return {
      total: list.length,
      active: list.filter(c => c.status === 'Active').length,
      testedOk: list.filter(c => c.lastTestOk === true).length,
      failing: list.filter(c => c.lastTestOk === false).length,
      tokens30d: list.reduce((n, c) => n + (c.tokensIn30d ?? 0) + (c.tokensOut30d ?? 0), 0),
      runs30d: list.reduce((n, c) => n + (c.runs30d ?? 0), 0),
    };
  });

  /** What the selected connection has been doing: runs per day, its latest runs, the prompts that name it. */
  /** UX final MC1: a run's stored error as a readable sentence, the raw text kept for Details. */
  readonly runError = readableRunError;
  readonly activity = signal<ConnectionActivity | null>(null);
  readonly activityLoading = signal(false);
  readonly activityError = signal('');
  private readonly clock = new ServerTimePipe(inject(LOCALE_ID));
  readonly activityBars = computed<Bar[]>(() => (this.activity()?.days ?? []).map(d => ({
    name: this.clock.transform(d.day, 'day') ?? d.day,
    value: d.ok + d.failed,
    segments: [
      { label: 'Succeeded', value: d.ok, color: statusColor('Completed') },
      { label: 'Failed', value: d.failed, color: statusColor('Failed') },
    ],
  })));
  /**
   * Owner 2026-10-27: the recent runs sort by any column; they arrive newest first and are the latest few the service
   * keeps for the pane, so the headings say a sort covers only those.
   */
  readonly recentSort = createTableSort<ConnectionActivity['recent'][number]>({
    id: 'ai-connection-recent-runs',
    note: 'Sorts the latest runs shown',
    columns: {
      when: { value: r => r.at, kind: 'date' },
      prompt: r => r.promptName || (r.promptId ? 'Prompt ' + r.promptId : this.kindLabel(r.kind)),
      model: r => r.model,
      status: { value: r => (r.status === 'ok' ? 'Completed' : 'Failed'), kind: 'status' },
      time: { value: r => r.latencyMs, kind: 'number' },
      tokens: { value: r => (r.tokensIn ?? 0) + (r.tokensOut ?? 0), kind: 'number' },
    },
  });
  readonly sortedRecent = computed(() => this.recentSort.apply(this.activity()?.recent ?? []));
  readonly activityRuns = computed(() => (this.activity()?.days ?? []).reduce((n, d) => n + d.ok + d.failed, 0));

  constructor() {
    // Land on the linked connection, else the default, else the first, once the list is in --
    // a blank pane says nothing.
    effect(() => {
      const rows = this.filtered();
      untracked(() => {
        if (this.selectedId() !== null && rows.some(c => c.connectionId === this.selectedId())) return;
        const linked = Number(this.route.snapshot.queryParamMap.get('connection'));
        const pick = rows.find(c => c.connectionId === linked) ?? rows.find(c => c.isDefault) ?? rows[0];
        this.selectedId.set(pick?.connectionId ?? null);
      });
    });
    effect(() => {
      const id = this.selectedId();
      untracked(() => { this.loadActivity(id); this.loadHistory(id); });
    });
  }

  /** The selected connection's activity; a newer pick wins over an answer still on its way. */
  loadActivity(id: number | null): void {
    this.activity.set(null);
    this.activityError.set('');
    if (id === null) return;
    this.activityLoading.set(true);
    this.http.get<ApiResponse<ConnectionActivity>>(`${API_BASE}/aiConnection.json/activity`, { params: { connectionId: id } }).subscribe({
      next: r => {
        if (this.selectedId() !== id) return;
        this.activityLoading.set(false);
        // Each list defaults to empty: an older ai-service (or a partial answer) must not break the panel.
        if (r.status === API_SUCCESS && r.data) this.activity.set({ ...r.data, days: r.data.days ?? [], recent: r.data.recent ?? [], prompts: r.data.prompts ?? [] });
        else this.activityError.set(loadErrorText(r, 'Could not read what this connection has been doing.'));
      },
      error: err => {
        if (this.selectedId() !== id) return;
        this.activityLoading.set(false);
        this.activityError.set(loadErrorText(err, 'Could not read what this connection has been doing.'));
      },
    });
  }

  /** What ran, for a run with no prompt of its own to name. */
  kindLabel(kind: string): string {
    return ({ document: 'Document Intelligence', ask: 'Ask your data', try: 'Try it', tool: 'Assistant tool', run: 'Pipeline step' } as Record<string, string>)[kind]
      ?? kind;
  }

  /** A run's time as the list shows it, in the console's duration words ("420 ms", "1.4 sec"). */
  latency(ms: number | null | undefined): string {
    if (ms == null) return '—';
    return formatDuration(ms / 1000);
  }

  ngOnInit(): void {
    this.load();
    if (this.canSeeWorkspace()) this.loadTenants();
  }

  /** The workspaces for a new connection; `then` runs once they are in (New clicked before they arrived). */
  private loadTenants(then?: () => void): void {
    this.tenantsState.start();
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.tenantsState.fail(r, 'The workspaces could not be read.'); if (then) this.toast.error(this.tenantsState.error()); return; }
        this.tenants.set(r.data ?? []);
        this.tenantsState.done();
        then?.();
      },
      error: err => { this.tenantsState.fail(err, 'The workspaces could not be read.'); if (then) this.toast.error(this.tenantsState.error()); },
    });
  }

  load(): void {
    this.state.start();
    this.http.get<ApiResponse<ModelConnection[]>>(`${API_BASE}/aiConnection.json/list`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.state.fail(r, 'The connections could not be read.'); return; }
        this.connections.set(r.data ?? []);
        this.state.done();
      },
      error: err => this.state.fail(err, 'The connections could not be read.'),
    });
  }

  /** Mirrored to ?connection=, as Kafka does with ?profileId=, so a connection can be linked to. */
  select(c: ModelConnection): void {
    this.selectedId.set(c.connectionId);
    this.pane.set('detail');
    this.router.navigate([], { relativeTo: this.route, queryParams: { connection: c.connectionId }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  providerLabel(c: ModelConnection): string { return providerOf(c.provider).label; }
  endpointOf(c: ModelConnection): string {
    if (c.apiEndpoint) return c.apiEndpoint;
    return c.provider === 'OpenAI' ? 'api.openai.com' : c.provider === 'Anthropic' ? 'api.anthropic.com' : c.provider === 'Ollama' ? 'host.docker.internal:11434' : '—';
  }
  testTone(c: ModelConnection): { cls: string; label: string } {
    if (c.lastTestOk === true) return { cls: 'ok', label: 'Last test passed' };
    if (c.lastTestOk === false) return { cls: 'crit', label: 'Last test failed' };
    return { cls: 'muted', label: 'Not tested yet' };
  }
  budgetUsed(c: ModelConnection): number | null {
    if (!c.dailyTokenBudget) return null;
    return Math.min(100, Math.round(((c.tokensToday ?? 0) / c.dailyTokenBudget) * 100));
  }
  clearFilters(): void { this.search.set(''); this.providerFilter.set(''); this.statusFilter.set(''); this.onlyMine.set(false); }

  /**
   * Owner 2026-10-27: a platform administrator's dialog needs the workspaces -- opened before they arrived (or after the
   * read failed) it got none, hid its Workspace field and saved without one. It now waits for them, or says why not.
   */
  create(): void {
    const open = () => this.dialog.open<boolean>(ConnectionDialog, { data: { tenants: this.canSeeWorkspace() ? this.tenants() : undefined } })
      .closed.subscribe(saved => { if (saved) this.load(); });
    if (this.canSeeWorkspace() && !this.tenantsState.loaded()) { this.loadTenants(open); return; }
    open();
  }
  edit(c: ModelConnection): void {
    this.dialog.open<boolean>(ConnectionDialog, { data: { connection: c } }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  test(c: ModelConnection): void {
    this.testing.set(c.connectionId);
    this.http.post<ApiResponse<ModelConnection>>(`${API_BASE}/aiConnection.json/test`, null, { params: { connectionId: c.connectionId } }).subscribe({
      next: r => {
        this.testing.set(null);
        if (r.status === API_SUCCESS) this.toast.success(r.message); else this.toast.error(r.message);
        this.load();
      },
      error: err => { this.testing.set(null); this.toast.error(err?.error?.message || 'The test could not run.'); },
    });
  }

  /** Owner item #12: the provider's own chip colour, and the status chip. */
  providerChip(c: ModelConnection): string { return providerPill(c.provider); }
  statusChip(c: ModelConnection) { return statusPill(c.status); }

  /** Owner item #13: who last made the selected connection active or inactive, and when. */
  readonly history = signal<StatusChange[]>([]);
  readonly switching = signal<number | null>(null);

  loadHistory(id: number | null): void {
    this.history.set([]);
    if (id === null) return;
    this.http.get<ApiResponse<StatusChange[]>>(`${API_BASE}/aiConnection.json/history`, { params: { connectionId: id } }).subscribe({
      next: r => { if (this.selectedId() === id && r.status === API_SUCCESS) this.history.set(r.data ?? []); },
      error: () => undefined,
    });
  }

  /**
   * Owner item #13: Active / Inactive. Making a connection inactive stops everything that runs on it -- the assistant, Ask
   * your data, Document Intelligence, pipeline AI steps, prompts -- until it is made active again; the server refuses each
   * by name. Asked first, with the default's consequence said when it is the default.
   */
  async setActive(c: ModelConnection, active: boolean): Promise<void> {
    if (!active) {
      const ok = await confirmWith(this.dialog, {
        title: `Make ${c.name} inactive?`,
        body: 'Nothing will run on it until it is made active again: the AI Assistant, Ask your data and its charts, Document '
          + 'Intelligence, pipeline AI steps, image description and prompts are refused, naming this connection.'
          + (c.isDefault ? ' It is the workspace default, so everything that runs on the default is refused too, until you reactivate it '
            + 'or make another connection the default.' : ''),
        confirmLabel: 'Make inactive', danger: true,
      });
      if (!ok) return;
    }
    this.switching.set(c.connectionId);
    this.http.put<ApiResponse>(`${API_BASE}/aiConnection.json/setActive`, null, { params: { connectionId: c.connectionId, active } }).subscribe({
      next: r => {
        this.switching.set(null);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); this.loadHistory(c.connectionId); }
        else this.toast.error(r.message);
      },
      error: err => { this.switching.set(null); this.toast.error(err?.error?.message || 'The connection could not be changed.'); },
    });
  }

  setDefault(c: ModelConnection): void {
    this.http.put<ApiResponse>(`${API_BASE}/aiConnection.json/setDefault`, null, { params: { connectionId: c.connectionId } }).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'Could not set the default.'),
    });
  }

  async remove(c: ModelConnection): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${c.name}?`,
      body: 'Prompts that name this connection keep it from being deleted; prompts on the workspace default keep the default from going. Runs already recorded keep their history.',
      confirmLabel: 'Delete connection', danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/aiConnection.json/delete`, { params: { connectionId: c.connectionId } }).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The connection could not be deleted.'),
    });
  }
}

/** aiConnection.json/activity: the connection's last 30 days, its latest runs and its prompts. */
export interface ConnectionActivity {
  connectionId: number;
  days: { day: string; ok: number; failed: number; tokens: number }[];
  recent: {
    runId: number; at: string; kind: string; promptId?: number | null; promptName?: string | null; model?: string | null;
    status: string; latencyMs?: number | null; tokensIn?: number | null; tokensOut?: number | null; error?: string | null; jobQueueId?: number | null;
  }[];
  prompts: { promptId: number; name: string; status: string }[];
}

/** aiConnection.json/history: a connection's status changes, newest first. */
export interface StatusChange {
  action: string;
  from: string | null;
  to: string | null;
  by: number | null;
  byName: string | null;
  byRole: string | null;
  at: string | null;
}
