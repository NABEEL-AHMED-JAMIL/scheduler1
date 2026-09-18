import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { confirmWith } from '../../../shared/ui/confirm';
import { Prompt } from './prompt-model';

/**
 * Prompts: what a step says to a model. Readable by everyone who can open the page (a
 * person must see what the step on their task says); New, Edit, Try it and Delete are
 * gated on auth.canManageAgents, since a try spends the workspace's tokens.
 */
@Component({
  selector: 'app-prompts',
  imports: [Icon, TableShell, StatusPill, StatTile, ViewToggle, MineFilter, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, DatePipe],
  templateUrl: './prompts.html',
})
export class Prompts implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly view = signal<'table' | 'cards'>('table');
  readonly prompts = signal<Prompt[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly outputFilter = signal('');
  readonly connectionFilter = signal('');
  readonly onlyMine = signal(false);
  readonly canManage = computed(() => this.auth.canManageAgents());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const myId = this.auth.user()?.appUserId ?? null;
    return this.prompts().filter(p =>
      (!this.statusFilter() || p.status === this.statusFilter())
      && (!this.outputFilter() || p.outputMode === this.outputFilter())
      && (!this.connectionFilter() || String(p.connectionId ?? '') === this.connectionFilter())
      && (!this.onlyMine() || isMine(p, myId))
      && (!q || `${p.name} ${p.description ?? ''} ${p.connectionName ?? ''} ${p.effectiveModel ?? ''} ${p.variables.map(v => v.name).join(' ')}`.toLowerCase().includes(q)));
  });
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.statusFilter() || !!this.outputFilter() || !!this.connectionFilter() || this.onlyMine());

  readonly summary = computed(() => {
    const list = this.prompts();
    return {
      total: list.length,
      active: list.filter(p => p.status === 'Active').length,
      json: list.filter(p => p.outputMode === 'json').length,
      runs: list.reduce((n, p) => n + (p.runCount ?? 0), 0),
      failing: list.filter(p => p.lastRunStatus === 'failed').length,
    };
  });

  ngOnInit(): void {
    const connection = this.route.snapshot.queryParamMap.get('connection');
    if (connection) this.connectionFilter.set(connection);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<Prompt[]>>(`${API_BASE}/aiPrompt.json/list`).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.prompts.set((r.data ?? []).map(p => ({ ...p, variables: p.variables ?? [] })));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not load the prompts.'); },
    });
  }

  clearFilters(): void { this.search.set(''); this.statusFilter.set(''); this.outputFilter.set(''); this.connectionFilter.set(''); this.onlyMine.set(false); }

  toggle(p: Prompt): void {
    const next = p.status === 'Active' ? 'Inactive' : 'Active';
    this.http.put<ApiResponse>(`${API_BASE}/aiPrompt.json/setStatus`, null, { params: { promptId: p.promptId!, status: next } }).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The prompt could not be changed.'),
    });
  }

  async remove(p: Prompt): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${p.name}?`,
      body: 'Runs already recorded keep their history. A pipeline step naming this prompt would stop running it.',
      confirmLabel: 'Delete prompt', danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/aiPrompt.json/delete`, { params: { promptId: p.promptId! } }).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.load(); } else this.toast.error(r.message); },
      error: err => this.toast.error(err?.error?.message || 'The prompt could not be deleted.'),
    });
  }
}
