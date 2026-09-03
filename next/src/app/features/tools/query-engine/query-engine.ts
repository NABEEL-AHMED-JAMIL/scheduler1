import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { DbConnectionDialog } from './db-connection-dialog';
import { QueryDialog } from './query-dialog';
import { QueryScheduleDialog } from './query-schedule-dialog';
import { DbConnection, QueryDefinition, QueryExecution, QuerySchedule } from './types';

type Tab = 'connections' | 'queries' | 'executions';

@Component({
  selector: 'app-query-engine',
  imports: [StatTile, DatePipe, TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './query-engine.html',
})
export class QueryEngine implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  /**
   * Public because the template gates on it. Reading connections, queries, schedules and runs
   * is TENANT_USER, and so is executing a saved query -- that half of the page is the same for
   * everyone. Only the definitions are TENANT_ADMIN, which is why the route stays open and the
   * gate sits on the controls that write.
   */
  readonly auth = inject(AuthService);

  readonly tab = signal<Tab>('queries');
  readonly connections = signal<DbConnection[]>([]);
  readonly queries = signal<QueryDefinition[]>([]);
  readonly executions = signal<QueryExecution[]>([]);
  readonly schedules = signal<QuerySchedule[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly running = signal<number | null>(null);

  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'queries', label: 'Queries', icon: 'file' },
    { id: 'connections', label: 'Connections', icon: 'database' },
    { id: 'executions', label: 'Runs', icon: 'history' },
  ];

  readonly summary = computed(() => ({
    queries: this.queries().length,
    connections: this.connections().length,
    scheduled: this.schedules().filter(s => s.status === 'Active').length,
    failed: this.executions().filter(e => (e.status || '').toUpperCase() === 'FAILED').length,
  }));

  readonly filteredQueries = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.queries();
    return this.queries().filter(q =>
      `${q.queryName} ${q.queryText}`.toLowerCase().includes(term));
  });

  readonly filteredConnections = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.connections();
    return this.connections().filter(c =>
      `${c.profileName} ${c.host} ${c.databaseName}`.toLowerCase().includes(term));
  });

  readonly filteredExecutions = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.executions();
    return this.executions().filter(e =>
      `${e.queryName ?? ''} ${e.outputKey ?? ''}`.toLowerCase().includes(term));
  });

  ngOnInit(): void {
    this.loadAll();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.search.set('');
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');
    let pending = 4;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    const get = <T>(path: string, sink: (rows: T[]) => void) =>
      this.http.get<ApiResponse<T[]>>(`${API_BASE}/queryEngine.json${path}`).subscribe({
        next: r => { if (r.status === API_SUCCESS) sink(r.data ?? []); done(); },
        error: () => { this.error.set('Some Query Engine data could not be loaded.'); done(); },
      });

    get<DbConnection>('/connections/fetchAll', rows => this.connections.set(rows));
    get<QueryDefinition>('/queries/fetchAll', rows => this.queries.set(rows));
    get<QueryExecution>('/executions/fetchAll', rows => this.executions.set(rows));
    get<QuerySchedule>('/schedules/fetchAll', rows => this.schedules.set(rows));
  }

  connectionName(id?: number): string {
    if (id === undefined || id === null) return '—';
    return this.connections().find(c => c.databaseConnectionProfileId === id)?.profileName ?? `#${id}`;
  }

  scheduleFor(query: QueryDefinition): QuerySchedule | null {
    return this.schedules().find(s => s.queryId === query.queryId) ?? null;
  }

  addConnection(): void {
    this.dialog.open<boolean>(DbConnectionDialog, { data: {} }).closed
      .subscribe(saved => { if (saved) this.loadAll(); });
  }

  editConnection(connection: DbConnection): void {
    this.dialog.open<boolean>(DbConnectionDialog, { data: { connection } }).closed
      .subscribe(saved => { if (saved) this.loadAll(); });
  }

  async removeConnection(connection: DbConnection): Promise<void> {
    const dependents = this.queries().filter(
      q => q.databaseConnectionProfileId === connection.databaseConnectionProfileId).length;
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${connection.profileName}?`,
      body: dependents
        ? `${dependents} ${dependents === 1 ? 'query runs' : 'queries run'} against this connection and will have nowhere to execute.`
        : 'No queries use this connection.',
      confirmLabel: 'Delete connection',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/queryEngine.json/connections/delete`,
      { params: new HttpParams().set('databaseConnectionProfileId', connection.databaseConnectionProfileId) })
      .subscribe({
        next: r => {
          if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadAll(); }
          else this.toast.error(r.message);
        },
        error: e => this.toast.error(e?.error?.message || 'The connection could not be deleted.'),
      });
  }

  addQuery(): void {
    if (!this.connections().length) {
      this.toast.error('Add a database connection before writing a query.');
      this.setTab('connections');
      return;
    }
    this.dialog.open<boolean>(QueryDialog, { data: { connections: this.connections() } }).closed
      .subscribe(saved => { if (saved) this.loadAll(); });
  }

  editQuery(query: QueryDefinition): void {
    this.dialog.open<boolean>(QueryDialog, { data: { query, connections: this.connections() } }).closed
      .subscribe(saved => { if (saved) this.loadAll(); });
  }

  async removeQuery(query: QueryDefinition): Promise<void> {
    const scheduled = this.scheduleFor(query);
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${query.queryName}?`,
      body: scheduled
        ? 'This query is scheduled. Deleting it stops the schedule as well; past runs and their output are kept.'
        : 'Past runs and their output are kept.',
      confirmLabel: 'Delete query',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/queryEngine.json/queries/delete`,
      { params: new HttpParams().set('queryId', query.queryId) }).subscribe({
      next: r => {
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadAll(); }
        else this.toast.error(r.message);
      },
      error: e => this.toast.error(e?.error?.message || 'The query could not be deleted.'),
    });
  }

  runQuery(query: QueryDefinition): void {
    this.running.set(query.queryId);
    this.http.post<ApiResponse>(`${API_BASE}/queryEngine.json/executions/execute`,
      { queryId: query.queryId }).subscribe({
      next: r => {
        this.running.set(null);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.setTab('executions'); }
        else this.toast.error(r.message);
        this.loadAll();
      },
      error: e => {
        this.running.set(null);
        this.toast.error(e?.error?.message || 'The query could not be run.');
      },
    });
  }

  schedule(query: QueryDefinition): void {
    const existing = this.scheduleFor(query);
    this.dialog.open<boolean>(QueryScheduleDialog,
      { data: { query, schedule: existing ?? undefined } }).closed
      .subscribe(saved => { if (saved) this.loadAll(); });
  }

  async removeSchedule(query: QueryDefinition): Promise<void> {
    const existing = this.scheduleFor(query);
    if (!existing) return;
    const ok = await confirmWith(this.dialog, {
      title: `Stop scheduling ${query.queryName}?`,
      body: 'The query stays and can still be run by hand. Output already written is kept.',
      confirmLabel: 'Remove schedule',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/queryEngine.json/schedules/delete`,
      { params: new HttpParams().set('scheduleId', existing.scheduleId) }).subscribe({
      next: r => {
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadAll(); }
        else this.toast.error(r.message);
      },
      error: e => this.toast.error(e?.error?.message || 'The schedule could not be removed.'),
    });
  }
}
