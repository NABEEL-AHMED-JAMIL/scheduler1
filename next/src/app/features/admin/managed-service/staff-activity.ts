import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ActionsPage, ManagedAction, ManagedServiceApi, StaffCandidate, personName, staffOf } from './managed-service.api';

/** How many rows a page asks for: the service's default is 100 and its most 500. */
export const ACTIONS_PAGE = 50;

/**
 * MIG-254: the managed-service audit, newest first, one page at a time (paging.nextBeforeId).
 *
 * Two pages from one component, told apart by the route's `scope`: Administration › Staff activity for a platform
 * administrator (every workspace, filtered by workspace and staff member), and Our team's activity for a workspace
 * administrator (the service answers their own workspace whatever is asked, so there is no workspace to pick).
 */
@Component({
  selector: 'app-staff-activity',
  imports: [TableShell, Icon, ServerTimePipe],
  templateUrl: './staff-activity.html',
})
export class StaffActivity implements OnInit {
  private readonly api = inject(ManagedServiceApi);
  private readonly http = inject(HttpClient);

  /** From the route's data: which of the two pages this is. */
  readonly scope = input<'platform' | 'workspace'>('platform');
  readonly showWorkspace = computed(() => this.scope() === 'platform');

  readonly rows = signal<ManagedAction[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly nextBeforeId = signal<number | null>(null);
  readonly hasMore = computed(() => this.nextBeforeId() !== null);
  readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  private readonly platformStaff = signal<StaffCandidate[]>([]);
  /** Everyone the log has shown so far: a workspace administrator cannot list our staff, only see who acted. */
  private readonly seen = signal<Map<number, StaffCandidate>>(new Map());
  readonly staff = computed(() => this.showWorkspace()
    ? this.platformStaff()
    : [...this.seen().values()].sort((a, b) => personName(a).localeCompare(personName(b))));
  readonly tenantFilter = signal<number | null>(null);
  readonly staffFilter = signal<number | null>(null);
  readonly hasFilters = computed(() => !!this.tenantFilter() || !!this.staffFilter());
  readonly name = personName;

  readonly emptyMessage = computed(() => this.hasFilters()
    ? 'No change matches those filters.'
    : this.showWorkspace() ? 'Our staff have not changed anything in a customer\'s workspace yet.'
      : 'Our team has not changed anything in this workspace yet.');

  ngOnInit(): void {
    this.load();
    if (!this.showWorkspace()) return;
    this.http.get<ApiResponse<{ tenantId: number; tenantName: string; status?: string }[]>>(`${API_BASE}/tenant.json/listTenants`)
      .subscribe({
        next: r => this.tenants.set((r.status === API_SUCCESS ? r.data ?? [] : []).filter(t => t.status !== 'Delete')
          .map(t => ({ tenantId: t.tenantId, tenantName: t.tenantName })).sort((a, b) => a.tenantName.localeCompare(b.tenantName))),
        error: () => this.tenants.set([]),
      });
    this.api.users().subscribe({
      next: r => this.platformStaff.set(r.status === API_SUCCESS ? staffOf(r.data ?? []) : []),
      error: () => this.platformStaff.set([]),
    });
  }

  /** The newest page, for the filters as they are now. */
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.fetch(null, page => this.rows.set(page), () => this.loading.set(false));
  }

  loadOlder(): void {
    const before = this.nextBeforeId();
    if (before === null || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.fetch(before, page => this.rows.update(rows => [...rows, ...page]), () => this.loadingMore.set(false));
  }

  private fetch(beforeId: number | null, take: (rows: ManagedAction[]) => void, done: () => void): void {
    this.api.actions({ tenantId: this.showWorkspace() ? this.tenantFilter() : null, appUserId: this.staffFilter(), beforeId,
      limit: ACTIONS_PAGE }).subscribe({
      next: (r: ActionsPage) => {
        done();
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'The activity could not be read.'); return; }
        const page = r.data ?? [];
        take(page);
        this.nextBeforeId.set(r.paging?.nextBeforeId ?? null);
        this.remember(page);
      },
      error: err => {
        done();
        this.error.set(err?.error?.message || 'The activity could not be read.');
      },
    });
  }

  private remember(page: ManagedAction[]): void {
    const known = this.seen();
    const fresh = page.filter(a => !known.has(a.appUserId));
    if (!fresh.length) return;
    const next = new Map(known);
    for (const a of fresh) {
      next.set(a.appUserId, { appUserId: a.appUserId, username: a.username ?? '', fullName: a.fullName, userRole: 'PLATFORM_ADMIN', status: 'Active' });
    }
    this.seen.set(next);
  }

  setTenant(value: string): void { this.tenantFilter.set(value ? Number(value) : null); this.load(); }
  setStaff(value: string): void { this.staffFilter.set(value ? Number(value) : null); this.load(); }
  clearFilters(): void { this.tenantFilter.set(null); this.staffFilter.set(null); this.load(); }

  workspaceName(a: ManagedAction): string {
    return a.tenantName?.trim() || `Workspace ${a.tenantId}`;
  }
}
