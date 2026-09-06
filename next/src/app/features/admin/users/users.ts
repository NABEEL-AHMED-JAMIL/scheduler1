import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_META, ROLE_RANK, isUserRole } from '../../../core/auth/auth.models';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { StatTile } from '../../../shared/ui/stat-tile';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { Avatar } from '../../../shared/ui/avatar';
import { createSort } from '../../../shared/ui/sort';
import { UserDialog } from './user-dialog';
import { PromptDialog } from '../../objects/dialogs/prompt-dialog';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';

/** What one user owns and how their runs have gone, from dashboard.json/userStatistics. */
export interface UserStatistic {
  appUserId: number;
  jobCount: number;
  activeJobs: number;
  /** Distinct tasks this user's jobs point at -- tasks carry no owner of their own. */
  taskCount: number;
  runCount: number;
  completedCount: number;
  failedCount: number;
}

export interface AppUser {
  /** E.164, validated against the same metadata on both sides. */
  phoneNumber?: string | null;

  /** The author's id, so "Only mine" matches on identity rather than display text. */
  createdBy?: number | null;

  /** Filled in by the server on the way out; absent on rows that predate the audit columns. */
  createdByName?: string | null;
  updatedByName?: string | null;
  appUserId: number;
  uuid?: string;
  username: string;
  fullName?: string;
  /** Job title. Separate from userRole, which is the permission level. */
  position?: string | null;
  userRole: string;
  status: string;
  tenantId?: number;
  tenantName?: string;
  tenantActive?: boolean;
  avatarBucket?: string | null;
  avatarKey?: string | null;
  dateCreated?: string;
  lastLoginAt?: string;
}

@Component({
  selector: 'app-users',
  imports: [MineFilter, ViewToggle, StatTile, DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Icon, Avatar, Pagination],
  templateUrl: './users.html',
})
export class Users implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly users = signal<AppUser[]>([]);
  readonly stats = signal<Record<number, UserStatistic>>({});
  readonly tenants = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly statusFilter = signal('');
  readonly tenantFilter = signal('');
  /** Which contact line was just copied, as '<userId>:<field>'. One signal rather than one
      per row, since only the most recent copy needs confirming. */
  readonly copiedKey = signal<string | null>(null);

  readonly busy = signal<number | null>(null);
  readonly focusedTenantId = signal<number | null>(null);

  readonly sort = createSort<AppUser>('fullName');

  readonly canPickTenant = this.auth.isPlatformAdmin;
  readonly currentUserId = computed(() => this.auth.user()?.appUserId ?? null);

  readonly focusedTenantName = computed(() => {
    const id = this.focusedTenantId();
    if (id === null) return '';
    const fromTenants = this.tenants().find(t => t.tenantId === id);
    if (fromTenants) return fromTenants.tenantName;
    return this.users().find(u => u.tenantId === id)?.tenantName ?? `Tenant ${id}`;
  });

  readonly roles = computed(() =>
    [...new Set(this.users().map(u => u.userRole).filter(Boolean))].sort());

  // Every control that narrows the list belongs here, including Only mine. Leaving it out meant
  // somebody could filter down to nothing, press Clear, and still see nothing.
  readonly hasFilters = computed(() =>
    !!(this.search() || this.roleFilter() || this.statusFilter() || this.tenantFilter()
       || this.focusedTenantId() !== null || this.onlyMine()));

  /** Tenants that actually have users, so the filter never offers an empty result. */
  readonly tenantOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const user of this.users()) {
      if (user.tenantId != null) seen.set(user.tenantId, user.tenantName ?? `Tenant ${user.tenantId}`);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Table for scanning many at once, cards when the picture and role matter more. */
  readonly view = signal<'table' | 'cards'>('table');

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const focusedTenant = this.focusedTenantId();
    const tenant = this.tenantFilter();
    const rows = this.users().filter(user => {
      if (focusedTenant !== null && user.tenantId !== focusedTenant) return false;
      if (tenant && String(user.tenantId) !== tenant) return false;
      if (role && user.userRole !== role) return false;
      if (status && user.status !== status) return false;
      if (!term) return true;
      // Phone lost its own column when identity was merged into one cell, so search is the only
      // way to reach it. Separators come off both sides, since a stored +12025550143 would
      // otherwise never match somebody typing 202 555.
      //
      // Guarded on the stripped term being non-empty. Without that, a text search like "aisha"
      // strips to "" -- and every string contains "" -- so the clause matched every user who had
      // a phone at all, and searching anything returned the whole list.
      const digits = term.replace(/[^0-9+]/g, '');
      return (user.username ?? '').toLowerCase().includes(term)
        || (user.fullName ?? '').toLowerCase().includes(term)
        || (user.position ?? '').toLowerCase().includes(term)
        || (!!digits && (user.phoneNumber ?? '').replace(/[^0-9+]/g, '').includes(digits))
        || (user.tenantName ?? '').toLowerCase().includes(term);
    });
    return this.sort.apply(this.mine(rows), (row, key) => (row as any)[key]);
  });

  readonly pager = createPager<AppUser>();
  readonly paged = computed(() => this.pager.slice(this.filtered()));

  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  readonly summary = computed(() => {
    const focusedTenant = this.focusedTenantId();
    const tenant = this.tenantFilter();
    const list = focusedTenant === null
      ? this.users()
      : this.users().filter(u => u.tenantId === focusedTenant);
    return {
      total: list.length,
      active: list.filter(u => u.status === 'Active').length,
      admins: list.filter(u => isUserRole(u.userRole) && ROLE_RANK[u.userRole] > ROLE_RANK.TENANT_USER).length,
      neverSignedIn: list.filter(u => !u.lastLoginAt).length,
    };
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const raw = params.get('tenantId');
      const parsed = raw === null ? null : Number(raw);
      this.focusedTenantId.set(parsed !== null && Number.isFinite(parsed) ? parsed : null);
    });
    this.load();
    this.loadTenants();
  }

  clearTenantFocus(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.loadStats();
    this.http.get<ApiResponse<AppUser[]>>(`${API_BASE}/appUser.json/listUsers`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.users.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load users.');
      },
    });
  }

  /**
   * Per-user workload, from the aggregate endpoint rather than counted in the browser.
   *
   * The user list has no idea what anyone owns, and fetching each user's jobs to find out
   * would be one request per row. This is a single grouped query, and it is keyed by id so a
   * row can read its own numbers without scanning.
   */
  private loadStats(): void {
    this.http.get<ApiResponse<UserStatistic[]>>(`${API_BASE}/dashboard.json/userStatistics`)
      .subscribe({
        next: response => {
          if (response.status !== API_SUCCESS) return;
          const byUser: Record<number, UserStatistic> = {};
          for (const row of response.data ?? []) byUser[row.appUserId] = row;
          this.stats.set(byUser);
        },
        // Counts are an enrichment: the list is still perfectly usable without them.
        error: () => { /* left silent on purpose */ },
      });
  }

  statFor(user: AppUser): UserStatistic | null {
    return this.stats()[user.appUserId] ?? null;
  }

  /** Of the runs that reached a verdict; queued and skipped are neither pass nor fail. */
  successRate(stat: UserStatistic): number | null {
    const finished = (stat.completedCount ?? 0) + (stat.failedCount ?? 0);
    return finished ? Math.round(((stat.completedCount ?? 0) / finished) * 100) : null;
  }

  private loadTenants(): void {
    if (!this.canPickTenant()) return;
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.tenants.set(response.data ?? []);
      },
    });
  }

  create(): void {
    this.dialog.open<boolean>(UserDialog, {
      data: { tenants: this.tenants(), canPickTenant: this.canPickTenant() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(user: AppUser): void {
    this.dialog.open<boolean>(UserDialog, {
      data: { user, tenants: this.tenants(), canPickTenant: this.canPickTenant() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  /**
   * Whether a row is a platform admin, asked of the row rather than of the signed-in user.
   *
   * A method rather than the role literal repeated in the template: this is a fact about somebody
   * else's account, so it cannot go through AuthService like every other role decision now does,
   * and a bare string comparison in markup is the shape that gets missed when a role is renamed.
   */
  reachesEveryTenant(user: AppUser): boolean {
    return user.userRole === 'PLATFORM_ADMIN';
  }

  /** Signing yourself out of the application is not a mistake worth allowing by accident. */
  isSelf(user: AppUser): boolean {
    return this.currentUserId() !== null && user.appUserId === this.currentUserId();
  }

  /**
   * Whether this administrator can act on the row at all.
   *
   * The same question the server's scopedFind answers: a platform admin reaches every account, a
   * tenant admin reaches the tenant users in its workspace, and anybody reaches their own row.
   * Asked here because listUsers still returns the peer administrators -- so without it the row
   * offers Edit, Reset password, Deactivate and Delete, and every one of them comes back "user
   * not found" about a row that is plainly on screen.
   */
  canManage(user: AppUser): boolean {
    return this.auth.isPlatformAdmin() || this.isSelf(user) || user.userRole === 'TENANT_USER';
  }

  /** Said on the row in place of the controls, so the absence is a rule rather than a gap. */
  readonly managedByPlatformOnly = 'Only a Platform Admin can manage another Tenant Admin.';

  async toggleStatus(user: AppUser): Promise<void> {
    const activating = user.status !== 'Active';
    const ok = await confirmWith(this.dialog, {
      title: activating ? 'Activate user' : 'Deactivate user',
      body: activating
        ? `${user.fullName || user.username} will be able to sign in again.`
        : `${user.fullName || user.username} will be signed out and unable to sign in. Their work and history are kept.`,
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      danger: !activating,
    });
    if (!ok) return;

    this.changeStatus(user, activating ? 'Active' : 'Inactive');
  }

  async deleteUser(user: AppUser): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${user.fullName || user.username}?`,
      body: 'The account is removed from this list and can no longer sign in. Deactivate instead if you only want to block access for now — a deactivated account can be switched back on, a deleted one cannot.',
      confirmLabel: 'Delete user',
      danger: true,
    });
    if (!ok) return;
    this.changeStatus(user, 'Delete');
  }

  private changeStatus(user: AppUser, status: string): void {
    this.busy.set(user.appUserId);
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/changeUserStatus`,
      { appUserId: user.appUserId, status }).subscribe({
      next: response => {
        this.busy.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          this.load();
        } else { this.toast.error(response.message); }
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'Could not change the status.');
      },
    });
  }

  resetPassword(user: AppUser): void {
    this.dialog.open<string>(PromptDialog, {
      hasBackdrop: true,
      data: {
        title: `Reset password for ${user.fullName || user.username}`,
        label: 'New password',
        placeholder: 'At least 8 characters',
        confirmLabel: 'Reset password',
        hint: 'They will need this to sign in. It is stored hashed and cannot be read back.',
      },
    }).closed.subscribe(password => {
      if (!password) return;
      if (password.length < 8) {
        this.toast.error('Use at least 8 characters.');
        return;
      }
      // The dialog is already gone by this point (it closes on submit, before this fires), so
      // `busy` is what the row's own Edit/Reset/status/delete buttons key off of -- without it,
      // this action alone gave no in-flight feedback anywhere and its own [disabled] guards
      // (users.html:242-245, :426-428) were checking a signal this method never set.
      this.busy.set(user.appUserId);
      this.http.put<ApiResponse>(`${API_BASE}/appUser.json/resetPassword`,
        { appUserId: user.appUserId, password }).subscribe({
        next: response => {
          this.busy.set(null);
          response.status === API_SUCCESS
            ? this.toast.success(response.message)
            : this.toast.error(response.message);
        },
        error: err => {
          this.busy.set(null);
          this.toast.error(err?.error?.message || 'Could not reset the password.');
        },
      });
    });
  }

  roleLabel(role: string): string {
    return (role || '').replace(/_/g, ' ').toLowerCase();
  }

  rolePill(role: string): string {
    return this.metaFor(role).pill;
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
    this.statusFilter.set('');
    this.tenantFilter.set('');
    this.onlyMine.set(false);
    // The tenant focus counts towards hasFilters, so leaving it behind meant Clear left the list
    // filtered and the button on screen -- it looked broken because it was. It lives in the URL,
    // so clearing it means navigating; otherwise a refresh brings it straight back.
    if (this.focusedTenantId() !== null) {
      this.clearTenantFocus();
    }
    this.pager.reset();
  }

  /**
   * Applies the "Only mine" toggle.
   *
   * Kept pure -- it runs inside a computed, and writing a signal from there is not allowed. The
   * count of what survives is already on the table header, so nothing needs to be recorded.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }

  /**
   * Copies a contact detail and confirms it on the line that was clicked.
   *
   * Keyed by user and field so two cards showing the same address cannot both light up, and so
   * copying an email does not tick the phone beside it.
   */
  copyContact(userId: number, field: 'email' | 'phone', value: string): void {
    copyText(value).then(ok => {
      if (!ok) {
        this.toast.error('Could not copy that.');
        return;
      }
      const key = `${userId}:${field}`;
      this.copiedKey.set(key);
      // Only clear if nothing else was copied in the meantime, or a slow first copy would wipe
      // the tick off a second, faster one.
      setTimeout(() => { if (this.copiedKey() === key) this.copiedKey.set(null); }, 1500);
    });
  }

  /**
   * The colour of a card's top rule, keyed to privilege.
   *
   * The point is scanning: across a grid of thirty-five people the two admins should be findable
   * without reading a single pill. A plain user gets a quiet rule rather than none, so every card
   * keeps the same anatomy and the eye is not caught by a structural difference instead.
   */
  roleAccent(role: string): string {
    return this.metaFor(role).accent;
  }

  /** A row's role comes off the wire as a string, so an unrecognised one reads as the quietest
      of the three rather than crashing the cell it is drawn in. */
  private metaFor(role: string) {
    return isUserRole(role) ? ROLE_META[role] : ROLE_META.TENANT_USER;
  }

  /** Ring around the avatar: the same fact the status pill carries, said in the portrait. */
  statusRing(status: string): string {
    return status === 'Active' ? 'var(--color-ok-500)' : 'var(--text-muted)';
  }
}
