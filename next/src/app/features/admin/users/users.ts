import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { toneClass } from '../../../shared/ui/tone';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_META, ROLE_RANK, isUserRole, roleLabel as labelOf } from '../../../core/auth/auth.models';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { CopyButton } from '../../../shared/ui/copy-button';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { Avatar } from '../../../shared/ui/avatar';
import { createSort } from '../../../shared/ui/sort';
import { UserDialog } from './user-dialog';
import { AccessProfile, AccessProfilesService } from '../access-profiles/access-profiles.service';
import { ResetPasswordData, ResetPasswordDialog, ResetPasswordResult } from './reset-password-dialog';
import { announceReset } from './reset-password-announce';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AccountSecurityApi, PersonStanding } from '../../account/account-security.api';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';

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
  /** MIG-274: their manager in the workspace, and the manager's name. */
  managerId?: number | null;
  managerName?: string | null;
  pageAccessProfileId?: number | null;
  pageAccessProfileName?: string | null;
  /** From the server's batched summary: pages the person opens, exceptions they carry. */
  pageCount?: number | null;
  pageExceptionCount?: number | null;
  defaultProfileName?: string | null;
  /** A one-time password still to be replaced: a new account's, or after an administrator's reset. */
  mustChangePassword?: boolean;
  userRole: string;
  status: string;
  tenantId?: number;
  tenantName?: string;
  tenantActive?: boolean;
  /** The version of their profile picture; null or absent when they have none. */
  avatarVersion?: string | null;
  dateCreated?: string;
  lastLoginAt?: string;
}

@Component({
  selector: 'app-users',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, MineFilter, ViewToggle, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill, Icon, CopyButton, Avatar, Pagination, StatStrip],
  templateUrl: './users.html',
})
export class Users implements OnInit {
  /** The class that paints a colour helper's token (MIG-257); see shared/ui/tone.ts. */
  readonly toneClass = toneClass;
  private readonly http = inject(HttpClient);
  private readonly profilesApi = inject(AccessProfilesService);
  private readonly dialog = inject(Dialog);
  private readonly security = inject(AccountSecurityApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly users = signal<AppUser[]>([]);
  readonly stats = signal<Record<number, UserStatistic>>({});
  readonly tenants = signal<any[]>([]);
  /**
   * The workspace's access profiles, for the dialog's picker. Loaded only for a tenant administrator:
   * profiles belong to a workspace, and a platform administrator has none to list -- so a platform
   * admin creates people onto the workspace default and the workspace's own admin picks.
   */
  readonly accessProfiles = signal<AccessProfile[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly statusFilter = signal('');
  readonly tenantFilter = signal(String(inject(WorkspaceDirectory).remembered() ?? ''));
  /** '' = any, 'default' = on the workspace default, else a profile name. */
  readonly profileFilter = signal('');
  /** Which contact line was just copied, as '<userId>:<field>'. One signal rather than one
      per row, since only the most recent copy needs confirming. */
  readonly copiedKey = signal<string | null>(null);

  readonly busy = signal<number | null>(null);
  /** Owner 2026-10-19 #30: the card the list is narrowed to ('' = none). */
  readonly cardFilter = signal<UserCard | ''>('');
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

  /** The profiles actually in use on the list, so the filter never offers an empty result. */
  readonly profileOptions = computed(() =>
    [...new Set(this.users().filter(u => u.userRole === 'TENANT_USER').map(u => u.pageAccessProfileName).filter(Boolean))].sort() as string[]);
  readonly anyOnDefault = computed(() =>
    this.users().some(u => u.userRole === 'TENANT_USER' && !u.pageAccessProfileName));

  /** The catalogue's size, for "4 of 10 pages": an admin's count is the whole catalogue. */
  readonly totalPages = computed(() => Math.max(0, ...this.users().map(u => u.pageCount ?? 0)));

  // Every control that narrows the list belongs here, including Only mine. Leaving it out meant
  // somebody could filter down to nothing, press Clear, and still see nothing.
  readonly hasFilters = computed(() =>
    !!(this.search() || this.roleFilter() || this.statusFilter() || this.tenantFilter() || this.profileFilter()
       || this.focusedTenantId() !== null || this.onlyMine() || this.cardFilter()));

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
    const profile = this.profileFilter();
    const focusedTenant = this.focusedTenantId();
    const tenant = this.tenantFilter();
    const card = this.cardFilter();
    const standing = this.standing();
    const rows = this.users().filter(user => {
      if (card && !cardHolds(card, user, standing[String(user.appUserId)])) return false;
      if (focusedTenant !== null && user.tenantId !== focusedTenant) return false;
      if (tenant && String(user.tenantId) !== tenant) return false;
      if (role && user.userRole !== role) return false;
      if (status && user.status !== status) return false;
      if (profile) {
        if (user.userRole !== 'TENANT_USER') return false;
        if (profile === 'default' ? !!user.pageAccessProfileName : user.pageAccessProfileName !== profile) return false;
      }
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
    // Both tenant narrowings, as filtered() applies them: the tiles ignored the combobox and
    // counted every tenant while the list below showed one.
    const list = this.users().filter(u =>
      (focusedTenant === null || u.tenantId === focusedTenant)
      && (!tenant || String(u.tenantId) === tenant));
    return {
      total: list.length,
      active: list.filter(u => u.status === 'Active').length,
      admins: list.filter(u => isUserRole(u.userRole) && ROLE_RANK[u.userRole] > ROLE_RANK.TENANT_USER).length,
      neverSignedIn: list.filter(u => !u.lastLoginAt).length,
    };
  });

  /**
   * Owner 2026-10-19 #30: the cards over the list -- who is here, who can get in, how they get in, and who uses it --
   * each one the filter it counts (aria-pressed; again to clear). Counted over the same workspace narrowing as the list.
   */
  readonly cards = computed<StatStripItem[]>(() => {
    const focusedTenant = this.focusedTenantId();
    const tenant = this.tenantFilter();
    const list = this.users().filter(u => (focusedTenant === null || u.tenantId === focusedTenant) && (!tenant || String(u.tenantId) === tenant));
    const standing = this.standing();
    const picked = this.cardFilter();
    return USER_CARDS.map(card => {
      const count = list.filter(u => cardHolds(card.key, u, standing[String(u.appUserId)])).length;
      return { label: card.label, value: count, icon: card.icon, tone: count ? card.tone : 'muted', hint: card.hint,
        foot: card.key === 'all' ? `${list.length} in ${this.canPickTenant() && !tenant && focusedTenant === null ? 'every workspace' : 'this workspace'}`
          : list.length ? `${Math.round((count / list.length) * 100)}% of people` : '',
        clickable: true, pressed: card.key === 'all' ? !picked : picked === card.key, quiet: !count };
    });
  });

  pickCard(item: StatStripItem): void {
    const card = USER_CARDS.find(c => c.label === item.label);
    if (!card) return;
    this.cardFilter.set(card.key === 'all' || this.cardFilter() === card.key ? '' : card.key);
    this.pager.reset();
  }

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
    this.loadStanding();
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

  /**
   * Fetched the first time a dialog needs them, not on every visit to the list: most visits
   * never open one. A platform administrator's dialog fetches per tenant on its own.
   */
  private accessProfilesLoaded = false;
  private withAccessProfiles(open: (profiles: AccessProfile[]) => void): void {
    if (this.canPickTenant() || this.accessProfilesLoaded) { open(this.accessProfiles()); return; }
    this.profilesApi.list().subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.accessProfiles.set(response.data ?? []);
        this.accessProfilesLoaded = true;
        open(this.accessProfiles());
      },
      error: () => open([]),
    });
  }

  create(): void {
    this.withAccessProfiles(accessProfiles => this.dialog.open<boolean>(UserDialog, {
      data: { tenants: this.tenants(), canPickTenant: this.canPickTenant(), accessProfiles, people: this.users() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); }));
  }

  /** Owner 2026-10-19 #31: a person is edited on a page of their own, not in a dialog. */
  edit(user: AppUser): void {
    void this.router.navigate(['/administration/users', user.appUserId]);
  }

  /**
   * Whether a row is a platform administrator, asked of the row rather than of the signed-in user.
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
   * The same question the server's scopedFind answers: a platform administrator reaches every account, a
   * tenant administrator reaches the tenant users in its workspace, and anybody reaches their own row.
   * Asked here because listUsers still returns the peer administrators -- so without it the row
   * offers Edit, Reset password, Deactivate and Delete, and every one of them comes back "user
   * not found" about a row that is plainly on screen.
   */
  canManage(user: AppUser): boolean {
    return this.auth.isPlatformAdmin() || this.isSelf(user) || user.userRole === 'TENANT_USER';
  }

  /** Said on the row in place of the controls, so the absence is a rule rather than a gap. */
  readonly managedByPlatformOnly = 'Only a platform administrator can manage another workspace administrator.';

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

  // ---- MIG-353: each person's sign-in standing -- a lock, two-factor -- and an administrator's unlock and reset ----

  /** {appUserId: {lockedUntil, failedSignIns, mfaEnabled, ...}} from tenant.json/security/people. */
  readonly standing = signal<Record<string, PersonStanding>>({});

  private loadStanding(): void {
    this.security.people().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.standing.set(r.data ?? {}); },
      error: () => { /* the list stands without it */ },
    });
  }

  lockedUntil(user: AppUser): string | null {
    return this.standing()[String(user.appUserId)]?.lockedUntil ?? null;
  }

  mfaOn(user: AppUser): boolean {
    return !!this.standing()[String(user.appUserId)]?.mfaEnabled;
  }

  unlock(user: AppUser): void {
    this.busy.set(user.appUserId);
    this.security.unlock(user.appUserId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadStanding(); } else this.toast.error(r.message);
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not unlock the account.'); },
    });
  }

  async resetMfa(user: AppUser): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Reset two-factor login for ${user.fullName || user.username}?`,
      body: 'Their authenticator app and recovery codes stop working and they are signed out everywhere. If the workspace requires '
        + 'two-factor login they set it up again at their next sign-in. Do this only when you are sure it is them asking.',
      confirmLabel: 'Reset two-factor login',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(user.appUserId);
    this.security.resetMfa(user.appUserId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadStanding(); } else this.toast.error(r.message);
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not reset two-factor login.'); },
    });
  }

  /** The toast of the last reset that happened: a new reset takes it, and its password, away first. */
  private resetToast: number | null = null;

  resetPassword(user: AppUser): void {
    // The dialog makes the call and stays open until the server accepts the password: a refusal (a recent password,
    // a common one) is said under its field, in the server's words. It used to close on submit and leave the call to
    // this screen, whose toast was the only sign a reset had been refused -- and was easy to miss (2026-10-13).
    if (this.resetToast !== null) this.toast.dismiss(this.resetToast);
    this.resetToast = null;
    const data: ResetPasswordData = {
      appUserId: user.appUserId,
      name: user.fullName || user.username,
      tenantId: user.tenantId ?? null,
      own: this.isSelf(user),
    };
    this.dialog.open<ResetPasswordResult>(ResetPasswordDialog, { hasBackdrop: true, data }).closed.subscribe(done => {
      // A toast at the top right like every notice (owner 2026-10-19 #29), two minutes, with "Copy password".
      if (done) this.resetToast = announceReset(this.toast, done);
    });
  }

  roleLabel(role?: string | null): string {
    return labelOf(role);
  }

  rolePill(role: string): string {
    return this.metaFor(role).pill;
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
    this.statusFilter.set('');
    this.tenantFilter.set('');
    this.profileFilter.set('');
    this.onlyMine.set(false);
    this.cardFilter.set('');
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
    // ROLE_META carries the dark-safe --accent-mark for the tenant administrator now, so there
    // is no local override to drift from it.
    return this.metaFor(role).accent;
  }

  /** A row's role comes off the wire as a string, so an unrecognised one reads as the quietest
      of the three rather than crashing the cell it is drawn in. */
  private metaFor(role: string) {
    return isUserRole(role) ? ROLE_META[role] : ROLE_META.TENANT_USER;
  }

  /**
   * The access line a row shows: which profile (or the default), how many pages that comes to,
   * and whether any exception was made for this person. An admin opens everything, and that
   * is said plainly rather than as "10 of 10".
   */
  accessLabel(user: AppUser): string {
    if (user.userRole !== 'TENANT_USER') return 'All pages';
    if (user.pageAccessProfileName) return user.pageAccessProfileName;
    return user.defaultProfileName ? `Default · ${user.defaultProfileName}` : 'Default';
  }

  accessDetail(user: AppUser): string {
    if (user.userRole !== 'TENANT_USER' || user.pageCount == null) return '';
    const total = this.totalPages();
    return total ? `${user.pageCount} of ${total} pages` : `${user.pageCount} pages`;
  }

  /** Straight to this person's row in the People × pages grid. */
  openPageAccess(user: AppUser): void {
    void this.router.navigate(['/administration/access-profiles'], {
      queryParams: { view: 'people', q: user.username, tenantId: this.canPickTenant() ? user.tenantId : null },
    });
  }

  /** Ring around the avatar: the same fact the status pill carries, said in the portrait. */
  /**
   * Which picture to show: the version the list carries, or null when the person has none -- then app-avatar asks for
   * nothing. Asking for everyone sent a request per person per load, most of them 404s.
   */
  avatarVersionOf(user: AppUser): string | null {
    return user.avatarVersion || null;
  }

  /** Moderation: an administrator removes someone's picture; their initials show instead, everywhere. */
  async removePicture(user: AppUser): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Remove ${user.fullName || user.username}'s profile picture?`,
      body: 'Their initials are shown instead, everywhere their name appears. They can upload a new one. The removal is recorded '
        + 'in the sign-in history with your name.',
      confirmLabel: 'Remove picture',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(user.appUserId);
    this.http.delete<ApiResponse>(`${API_BASE}/appUser.json/avatar`, { params: { appUserId: user.appUserId } }).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) {
          this.users.update(list => list.map(u => (u.appUserId === user.appUserId ? { ...u, avatarVersion: null } : u)));
          this.toast.success(r.message);
        } else {
          this.toast.error(r.message);
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not remove the picture.'); },
    });
  }

  statusRing(status: string): string {
    return status === 'Active' ? 'var(--color-ok-500)' : 'var(--text-muted)';
  }
}

/** The Users screen's cards (owner 2026-10-19 #30): each is a count and the filter it counts. */
export type UserCard = 'all' | 'active' | 'inactive' | 'invited' | 'locked' | 'mfa' | 'noMfa' | 'sso' | 'admins' | 'members'
  | 'recent' | 'never';

export const USER_CARDS: { key: UserCard; label: string; icon: string; tone: 'ok' | 'warn' | 'crit' | 'info' | 'muted'; hint: string }[] = [
  { key: 'all', label: 'People', icon: 'users', tone: 'info', hint: 'Everyone on the list; shows them all again' },
  { key: 'active', label: 'Active', icon: 'checkCircle', tone: 'ok', hint: 'Can sign in' },
  { key: 'inactive', label: 'Deactivated', icon: 'pause', tone: 'warn', hint: 'Switched off: cannot sign in until activated' },
  { key: 'invited', label: 'Invited', icon: 'mail', tone: 'info', hint: 'Given a one-time password and not signed in yet' },
  { key: 'locked', label: 'Locked', icon: 'lock', tone: 'crit', hint: 'Locked out after failed sign-ins; an administrator can unlock' },
  { key: 'mfa', label: '2FA on', icon: 'shield', tone: 'ok', hint: 'Sign in with a code from an authenticator app' },
  { key: 'noMfa', label: '2FA off', icon: 'shield', tone: 'warn', hint: 'Sign in with a password alone' },
  { key: 'sso', label: 'Single sign-on', icon: 'key', tone: 'info', hint: 'Last signed in through the workspace\'s identity provider (OpenID Connect or SAML)' },
  { key: 'admins', label: 'Administrators', icon: 'shield', tone: 'info', hint: 'Workspace and platform administrators: Page access does not apply' },
  { key: 'members', label: 'Members', icon: 'user', tone: 'info', hint: 'Workspace members: their Page access profile decides what they open' },
  { key: 'recent', label: 'Signed in · 30 days', icon: 'history', tone: 'ok', hint: 'Signed in at least once in the last 30 days' },
  { key: 'never', label: 'Never signed in', icon: 'clock', tone: 'warn', hint: 'Has not signed in since the account was made' },
];

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Whether a person is counted by a card -- the one rule the count and the filter share. */
export function cardHolds(card: UserCard, user: AppUser, standing?: PersonStanding | null, now = Date.now()): boolean {
  switch (card) {
    case 'all': return true;
    case 'active': return user.status === 'Active';
    case 'inactive': return user.status !== 'Active';
    case 'invited': return user.status === 'Active' && !!user.mustChangePassword && !user.lastLoginAt;
    case 'locked': return !!standing?.lockedUntil;
    case 'mfa': return !!standing?.mfaEnabled;
    case 'noMfa': return !standing?.mfaEnabled;
    case 'sso': return standing?.lastSignInMethod === 'SSO' || standing?.lastSignInMethod === 'SAML';
    case 'admins': return isUserRole(user.userRole) && ROLE_RANK[user.userRole] > ROLE_RANK.TENANT_USER;
    case 'members': return user.userRole === 'TENANT_USER';
    case 'recent': {
      if ((standing?.signIns30d ?? 0) > 0) return true;
      const last = user.lastLoginAt ? Date.parse(user.lastLoginAt.replace(' ', 'T')) : NaN;
      return Number.isFinite(last) && now - last <= MONTH_MS;
    }
    case 'never': return !user.lastLoginAt;
  }
}
