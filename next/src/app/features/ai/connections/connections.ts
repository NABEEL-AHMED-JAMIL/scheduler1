import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { confirmWith } from '../../../shared/ui/confirm';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { ConnectionDialog } from './connection-dialog';
import { AI_PROVIDERS, ModelConnection, providerOf } from '../ai-providers';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';

/**
 * Model connections: where prompts run. The same rail-and-pane the Kafka page has, because
 * a model connection is the same kind of thing as a Kafka connection -- an endpoint, a
 * secret, a test, a default -- and a person who knows one screen knows the other.
 */
@Component({
  selector: 'app-connections',
  imports: [Icon, StatTile, StatusPill, MineFilter, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, BlurLoader, ServerTimePipe, DecimalPipe],
  templateUrl: './connections.html',
})
export class Connections implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly connections = signal<ModelConnection[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly testing = signal<number | null>(null);
  readonly search = signal('');
  readonly providerFilter = signal('');
  readonly statusFilter = signal('');
  readonly onlyMine = signal(false);
  readonly providers = AI_PROVIDERS;
  readonly canSeeWorkspace = computed(() => this.auth.isPlatformAdmin());
  private readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);

  readonly selectedId = signal<number | null>(null);
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
  }

  ngOnInit(): void {
    this.load();
    if (this.canSeeWorkspace()) {
      this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []); },
        error: () => {},
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<ModelConnection[]>>(`${API_BASE}/aiConnection.json/list`).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.connections.set(r.data ?? []);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not load the connections.'); },
    });
  }

  /** Mirrored to ?connection=, as Kafka does with ?profileId=, so a connection can be linked to. */
  select(c: ModelConnection): void {
    this.selectedId.set(c.connectionId);
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

  create(): void {
    this.dialog.open<boolean>(ConnectionDialog, { data: { tenants: this.canSeeWorkspace() ? this.tenants() : undefined } })
      .closed.subscribe(saved => { if (saved) this.load(); });
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
