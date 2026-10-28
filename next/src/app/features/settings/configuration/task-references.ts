import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TaskReferenceDialog, TaskReferenceDialogData } from './task-reference-dialog';
import { TaskReference, TaskReferenceKind, TenantOption, workspaceLabel } from './configuration.models';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';

const ENDPOINT = () => `${API_BASE}/setting.json/taskReferences`;

const COPY: Record<TaskReferenceKind, { title: string; singular: string; subtitle: string; empty: string; icon: string }> = {
  HOME_PAGE: {
    title: 'Home pages', singular: 'home page', icon: 'globe',
    subtitle: 'The web addresses a task can name as its home page — where a person goes to see what the task feeds.',
    empty: 'No home pages yet. Add one, then pick it on a task.',
  },
  TASK_GROUP: {
    title: 'Task groups', singular: 'task group', icon: 'layers',
    subtitle: 'Labels that group tasks together. A task picks one in its Group field.',
    empty: 'No task groups yet. Add one, then pick it on a task.',
  },
};

/**
 * Home pages and Task groups: one screen, two routes, the kind from the route's data. Both used
 * to be sub-lookups of the generic Lookups screen; their ids carried over, so a task's
 * homePageId and groupId still point at the same rows.
 */
@Component({
  selector: 'app-task-references',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, TableShell, Icon, ServerTimePipe, SortHeader, InlineStatus],
  templateUrl: './task-references.html',
})
export class TaskReferences implements OnInit {
  /** Bound from the route's data (withComponentInputBinding). */
  readonly kind = input<TaskReferenceKind>('HOME_PAGE');

  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly copy = computed(() => COPY[this.kind()] ?? COPY.HOME_PAGE);
  readonly isHomePage = computed(() => this.kind() === 'HOME_PAGE');

  readonly rows = signal<TaskReference[]>([]);
  /** Owner 2026-10-27: the list's read, loading until its first answer. */
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  /** The workspace names (platform administrators); the New dialog's workspace choices come from here too. */
  readonly tenantsState = createLoadState(false);
  readonly search = signal('');

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly tenants = signal<TenantOption[]>([]);
  readonly tenantFilter = signal(String(inject(WorkspaceDirectory).remembered() ?? ''));
  readonly showWorkspace = computed(() => this.isPlatformAdmin() && !this.tenantFilter());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(r =>
      r.name.toLowerCase().includes(term)
      || (r.value ?? '').toLowerCase().includes(term)
      || (r.description ?? '').toLowerCase().includes(term));
  });

  /**
   * Owner 2026-10-27: every column that holds a value sorts; the API's order until one is picked. One id for both kinds:
   * the two lists have the same columns.
   */
  readonly sort = createTableSort<TaskReference>({
    id: 'task-references',
    columns: {
      name: r => r.name,
      workspace: r => this.workspaceName(r.tenantId),
      value: r => r.value,
      usedBy: { value: r => r.usedByTasks, kind: 'number' },
      changed: { value: r => r.updatedAt || r.createdAt, kind: 'date' },
    },
  });
  readonly sorted = computed(() => this.sort.apply(this.filtered()));

  ngOnInit(): void {
    if (this.isPlatformAdmin()) this.loadTenants();
    this.load();
  }

  loadTenants(): void {
    this.tenantsState.start();
    this.http.get<ApiResponse<TenantOption[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.tenantsState.fail(r, 'The workspace names could not be read.'); return; }
        this.tenants.set(r.data ?? []);
        this.tenantsState.done();
      },
      error: err => this.tenantsState.fail(err, 'The workspace names could not be read.'),
    });
  }

  setTenant(value: string | null | undefined): void {
    this.tenantFilter.set(value ?? '');
    this.load();
  }

  private ticket = 0;
  load(): void {
    const ticket = ++this.ticket;
    this.state.start();
    const params: Record<string, string> = { kind: this.kind() };
    if (this.tenantFilter()) params['tenantId'] = this.tenantFilter();
    this.http.get<ApiResponse<TaskReference[]>>(ENDPOINT(), { params }).subscribe({
      next: response => {
        if (ticket !== this.ticket) return;
        if (response.status !== API_SUCCESS) { this.state.fail(response, `The ${this.copy().title.toLowerCase()} could not be read.`); return; }
        this.rows.set(response.data ?? []);
        this.state.done();
      },
      error: err => {
        if (ticket !== this.ticket) return;
        this.state.fail(err, `The ${this.copy().title.toLowerCase()} could not be read.`);
      },
    });
  }

  workspaceName(tenantId: number | null | undefined): string { return workspaceLabel(this.tenants(), tenantId); }

  /** Only an http(s) address becomes a link; anything else stays text. */
  isLink(value: string | null | undefined): boolean { return /^https?:\/\/\S+$/i.test((value ?? '').trim()); }

  inUseSentence(row: TaskReference): string {
    const n = row.usedByTasks;
    return `${n} ${n === 1 ? 'task still uses' : 'tasks still use'} ${row.name}. Move ${n === 1 ? 'it' : 'them'} off it before deleting it.`;
  }

  create(): void {
    const tenantId = this.tenantFilter() ? Number(this.tenantFilter()) : null;
    this.open({ kind: this.kind(), tenants: this.tenants(), tenantId });
  }

  edit(row: TaskReference): void { this.open({ kind: this.kind(), row }); }

  private open(data: TaskReferenceDialogData): void {
    this.dialog.open<boolean>(TaskReferenceDialog, { data }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  async remove(row: TaskReference): Promise<void> {
    if (row.usedByTasks > 0) { this.toast.error(this.inUseSentence(row)); return; }
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${row.name}?`,
      body: `No task uses this ${this.copy().singular} now, and none can pick it once it is gone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(ENDPOINT(), { params: { id: String(row.id) } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
        this.toast.success(response.message || `${row.name} deleted.`);
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'It could not be deleted.'),
    });
  }
}
