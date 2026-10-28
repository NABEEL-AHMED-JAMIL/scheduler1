import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';
import { AuthUser, ManagementMode, ROLE_RANK, UserRole, isUserRole } from './auth.models';
import { PageKey, TabKey } from './page-keys';
import { ThemeService } from '../theme.service';

const STORAGE_KEY = 'etl_auth_user';

/**
 * MIG-336: the pages a tenant user holds only when their access profile names them -- not by having no profile at all.
 * Owner decision: the API docs (the developer portal) are for administrators and developers, so a workspace administrator
 * grants them to a developer by profile; everyone else does not see them. ZT-I34 (owner 2026-10-27): See personal data and
 * Download sensitive files are given, never assumed, as identity's PageKey.DENIED_BY_DEFAULT says.
 */
export const EXPLICIT_PAGES: readonly PageKey[] = ['developer-portal', 'sensitive-files', 'see-personal-data'];

/** The login page's `reason` for a session signed out because its password changed. */
export const PASSWORD_CHANGED_REASON = 'password-changed';
/** What the login page says for it. */
export const PASSWORD_CHANGED_NOTICE = 'Your password was changed. Please sign in with the new password.';

/** MIG-353: the login page's `reason` for a session ended by the workspace's idle sign-out. */
export const IDLE_REASON = 'idle';
/**
 * MIG-353: when this browser last saw its person act (epoch milliseconds), shared by every tab. The idle guard writes it;
 * a refresh sends it, so the server moves the session's idle deadline from real activity, not from the refresh itself.
 */
export const LAST_ACTIVITY_KEY = 'etl_last_activity';

/** Whether a refused refresh was the server's idle sign-out (its sentence names the inactivity). */
export function isIdleRefusal(message: string | null | undefined): boolean {
  return !!message && message.includes('inactivity');
}

/**
 * The role the server signed into the access token, or null when there is nothing readable.
 *
 * The stored blob carries a userRole field of its own, but it sits in localStorage where
 * anything on the page can rewrite it -- typing PLATFORM_ADMIN into devtools opened the entire
 * admin menu, and every call those screens made then came back 403. JwtAuthenticationFilter
 * takes the role from the token's `userRole` claim and nowhere else, so that claim is the only
 * copy worth believing. Unreadable means no role at all rather than fall back to the blob:
 * anyone who can forge the field can also break the token.
 */
function roleFromToken(token: string | null | undefined): UserRole | null {
  const role = claimsOf(token)?.['userRole'];
  return isUserRole(role as string) ? role as UserRole : null;
}

/** The access token's payload, or null when there is nothing readable. */
function claimsOf(token: string | null | undefined): Record<string, unknown> | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    // Base64url: atob wants the standard alphabet, and tolerates the missing padding.
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/**
 * MIG-254: where a platform administrator's own session waits while they work in a customer's workspace
 * (a managed-service session is the active one under STORAGE_KEY meanwhile).
 */
export const PLATFORM_SESSION_KEY = 'etl_platform_session';

/**
 * localStorage.getItem, or null when the browser refuses storage outright (blocked site data throws on
 * access): no session, rather than a console that cannot construct its AuthService.
 */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Where Exit returns a staff member: Platform › Workspaces, where "Work in this workspace" opened it (owner #20). */
export const WORK_IN_WORKSPACE_PATH = '/platform/workspaces';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly themes = inject(ThemeService);

  /** Signal rather than BehaviorSubject: templates read it directly with no async pipe. */
  private readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly role = computed<UserRole | null>(() => roleFromToken(this.currentUser()?.accessToken));

  /**
   * The one place the hierarchy is expressed: a platform administrator has everything a tenant administrator
   * has, and a tenant administrator everything a tenant user has, exactly as the server's RoleHierarchy
   * says. A screen or a route asks for the minimum it needs and never has to remember to name
   * the roles above it as well.
   *
   * Fails closed: with no readable role there is no minimum a session can meet.
   */
  hasAtLeast(minimum: UserRole): boolean {
    const role = this.role();
    return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum];
  }

  readonly isPlatformAdmin = computed(() => this.hasAtLeast('PLATFORM_ADMIN'));
  readonly isTenantAdmin = computed(() => this.hasAtLeast('TENANT_ADMIN'));

  private readonly claims = computed(() => claimsOf(this.currentUser()?.accessToken));

  /**
   * MIG-254: who builds this workspace. The token's `mgmt` claim first -- it is what every service
   * decides by -- then the sign-in answer, and SELF when neither says (a platform administrator has no
   * workspace; a session stored before MIG-244 had no mode, and every workspace was SELF then). Editing
   * the stored answer gains nothing: the server refuses the builder's writes in a MANAGED workspace
   * whatever this says.
   */
  readonly managementMode = computed<ManagementMode>(() => {
    const claim = this.claims()?.['mgmt'];
    const mode = claim === 'SELF' || claim === 'MANAGED' ? claim : this.currentUser()?.managementMode;
    return mode === 'MANAGED' ? 'MANAGED' : 'SELF';
  });

  /** MIG-254: this is our staff member's managed-service session in a customer's workspace (`msvc`). */
  readonly isManagedSession = computed(() => this.claims()?.['msvc'] === true);

  /**
   * MIG-254: the workspace is MANAGED and this is one of its own people, so the builder's writes (pipelines,
   * schedules, APIs, sources, prompts, connections, inbox settings) are ours to make, not theirs: the
   * screens show them read-only, and the server answers 403 if one is tried anyway. Our staff's session in
   * the same workspace builds.
   */
  readonly builderLocked = computed(() => this.managementMode() === 'MANAGED' && !this.isManagedSession());

  /** A workspace administrator who may build here: the admin gate the builder screens use. */
  readonly canBuild = computed(() => this.isTenantAdmin() && !this.builderLocked());

  /**
   * Whether the session still owes a password change, which passwordChangeGuard turns into
   * "the profile screen is the only page this session opens".
   *
   * Taken from the stored blob rather than the token, unlike the role. Editing this one in
   * devtools gains nothing: it only skips a prompt to replace a password its owner already
   * knows, and the server is what stops honouring the old one, once it is replaced.
   */
  readonly mustChangePassword = computed(() => this.currentUser()?.mustChangePassword === true);

  /**
   * The debt is paid. Called from the interceptor when changeOwnPassword succeeds, rather than
   * from the screen that made the call: the guard would otherwise hold the session on the
   * profile page until the next sign-in re-reported a flag the server has already cleared.
   */
  passwordChanged(): void {
    if (this.currentUser()?.mustChangePassword) this.patchUser({ mustChangePassword: false });
  }

  /**
   * A change of this person's own password ended every token they held -- on the server, a password
   * change signs the account out everywhere -- and handed this session a fresh sign-in pair. Stored
   * over the old one, with whatever else the server sent (the settled password debt among it), so the
   * next request already carries it. Called from the interceptor, before the response reaches the
   * screen that made the change.
   */
  adoptSession(session: Partial<AuthUser>): void {
    const user = this.currentUser();
    if (!user) return;
    this.persist({ ...user, ...session });
  }

  /**
   * The password changed and the server handed back no new pair (one from before it did): every
   * token this session holds is, or is about to be, refused. Signed out cleanly and told why, rather
   * than left on a screen whose every call now fails.
   */
  signOutAfterPasswordChange(): void {
    this.clear();
    void this.router.navigate(['/login'], { queryParams: { reason: PASSWORD_CHANGED_REASON } });
  }

  /*
   * Named for what the screen is about to do rather than for a role, so a control is gated on
   * the same fact the endpoint behind it checks. Each one names the API it stands for; when
   * that annotation moves, this is the single line that follows it.
   */

  /** sourceTask.json add/update/delete -- SourceTaskRestApi is class-level TENANT_ADMIN. */
  readonly canManageTasks = computed(() => this.canBuild());
  /** aiAgent.json addAgent/updateAgent/deleteAgent. Fetching the agents is TENANT_USER. */
  readonly canManageAgents = computed(() => this.canBuild());
  /** appUser.json addUser/changeUserStatus/resetPassword. */
  readonly canManageUsers = computed(() => this.hasAtLeast('TENANT_ADMIN'));
  /** tenant.json -- a tenant spans the platform, so only a platform administrator touches one. */
  readonly canManageTenants = computed(() => this.hasAtLeast('PLATFORM_ADMIN'));

  /**
   * Whether this person may open a page the access profiles govern.
   *
   * Admins always may -- the roles gate their pages and a profile cannot take anything from
   * them -- and a session with no page list (stored before profiles existed) is read as
   * unrestricted rather than as empty: the server still refuses what it should, and a menu
   * that vanished on upgrade would look like a break, not a rule. The list itself comes from
   * sign-in and from every token refresh, so a changed profile reaches the menu within the
   * access token's lifetime without anyone signing out. The EXPLICIT_PAGES are the exception: those
   * need the profile to name them.
   */
  canOpen(page: PageKey): boolean {
    if (this.hasAtLeast('TENANT_ADMIN')) return true;
    const keys = this.currentUser()?.pageKeys;
    if (!keys) return !EXPLICIT_PAGES.includes(page);
    return keys.includes(page);
  }

  /**
   * F3 (MIG-400): whether a tab of a page opens -- the page, and either none of its tab keys in the list (every tab) or this
   * one. Identity sends a restricted page's tab keys after the page keys; the gateway refuses a closed tab's own calls.
   */
  canOpenTab(page: PageKey, tab: TabKey): boolean {
    if (!this.canOpen(page)) return false;
    if (this.hasAtLeast('TENANT_ADMIN')) return true;
    const keys = (this.currentUser()?.pageKeys ?? null) as string[] | null;
    if (!keys) return true;
    const mine = keys.filter(k => k.startsWith(page + ':'));
    return mine.length === 0 || mine.includes(tab);
  }

  /** The same answer as a signal, for templates that want to react to a refresh. */
  readonly pageKeys = computed(() => this.currentUser()?.pageKeys ?? null);

  /**
   * UX review 2026-10-12: whether the person may change dashboards -- a new board, a tile saved, moved or deleted, Pin to
   * dashboard. Saved Analyses alone reads them (a viewer's profile); Edit dashboards or Analytics Studio writes. The
   * gateway refuses the writes on its own (403); this keeps the buttons from offering them.
   */
  readonly canEditDashboards = computed(() => {
    this.pageKeys();
    return this.canOpen('dashboards-edit') || this.canOpen('analytics');
  });
  /**
   * ollama.json pullModel/deleteModel. Listing them stays TENANT_ADMIN.
   *
   * There is one Ollama server for the whole platform and no tenant dimension to a model, so
   * deleting one stops every workspace configured against it, not just the caller's. Both writes
   * moved to PLATFORM_ADMIN on the server; this is the matching half, so the buttons are not
   * offered to somebody who would get a 403 for pressing them.
   */
  readonly canManageModels = computed(() => this.hasAtLeast('PLATFORM_ADMIN'));

  readonly displayName = computed(() => {
    const user = this.currentUser();
    return user?.fullName?.trim() || user?.username || '';
  });

  constructor() {
    // Another tab signed out (it removed the stored session): this tab signs out too instead of carrying on.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue === null && this.currentUser()) {
        this.currentUser.set(null);
        void this.router.navigate(['/login']);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  /** Called by the profile screen so the header reflects an edit straight away. */
  patchUser(changes: Partial<AuthUser>): void {
    const user = this.currentUser();
    if (!user) return;
    this.persist({ ...user, ...changes });
  }

  login(username: string, password: string): Observable<ApiResponse<AuthUser>> {
    return this.http
      .post<ApiResponse<AuthUser>>(`${API_BASE}/auth.json/login`, { username, password })
      .pipe(tap(response => this.signedIn(response)));
  }

  /**
   * A sign-in's answer, from the password (login) or a later step (MIG-353: a two-factor code, single sign-on): kept only
   * when it carries a session -- a two-factor challenge carries none.
   */
  signedIn(response: ApiResponse<AuthUser>): void {
    if (response.status === API_SUCCESS && response.data?.accessToken) {
      this.persist(withPictureKnown(response.data));
      // The person's theme follows them to this device: their own choice, else their workspace's default.
      this.themes.adoptSignIn(response.data.theme, response.data.workspaceTheme);
    }
  }

  /**
   * Called by the interceptor on a 401. Returns the new access token so the failed request can
   * be retried; anything other than success clears the session, since a refresh token the
   * server rejects is not recoverable by trying again.
   */
  refresh(): Observable<ApiResponse<AuthUser>> {
    const refreshToken = this.currentUser()?.refreshToken ?? '';
    const lastActivityAt = Number(readStorage(LAST_ACTIVITY_KEY)) || null;
    return this.http
      .post<ApiResponse<AuthUser>>(`${API_BASE}/auth.json/refresh`, { refreshToken, lastActivityAt })
      .pipe(tap(response => {
        if (response.status === API_SUCCESS && response.data) {
          this.persist({ ...this.currentUser(), ...response.data } as AuthUser);
        } else {
          this.clear();
        }
      }));
  }

  /**
   * Signs out everywhere this session reaches: identity-service revokes the access and the refresh token (POST
   * /auth.json/logout) -- forgetting them only in this tab left both working. Fire and forget: a server that cannot be
   * reached must not keep anyone signed in here. Other open tabs follow through the storage event (see below).
   */
  logout(reason?: string): void {
    // Already signed out (MIG-353): a request that failed after the sign-out must not navigate again -- that second
    // navigation, without a reason, replaced the idle sign-out's "you were signed out because..." on the login page.
    if (!reason && !this.currentUser() && !this.readHeldPlatformSession()) return;
    this.revoke(this.currentUser());
    // A staff member signed out inside a managed session leaves both: the platform session held aside too.
    this.revoke(this.readHeldPlatformSession());
    this.clear();
    void this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
  }

  private revoke(user: AuthUser | null): void {
    if (!user?.accessToken) return;
    this.http.post(`${API_BASE}/auth.json/logout`, { refreshToken: user.refreshToken ?? null },
      { headers: new HttpHeaders({ Authorization: `Bearer ${user.accessToken}` }) })
      .subscribe({ error: () => { /* signed out here regardless */ } });
  }

  /**
   * MIG-254: the platform session a managed-service session was opened from, waiting under
   * PLATFORM_SESSION_KEY. Two sessions are held, one is active: every request (and every refresh) uses the
   * active one, so no screen needs to know which it is, and Exit is putting the other one back.
   */
  private readonly heldPlatform = signal<boolean>(this.readHeldPlatformSession() !== null);
  readonly heldPlatformSession = this.heldPlatform.asReadonly();

  /**
   * A staff member opened a managed-service session (managedService.json/openSession answered like a
   * sign-in): their own session waits aside and this one becomes active. Only from a platform
   * administrator's own session -- opening one from inside another would lose the way back.
   */
  enterManagedSession(session: AuthUser): void {
    const own = this.currentUser();
    if (!own || !this.isPlatformAdmin() || this.isManagedSession()) return;
    localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify(own));
    this.heldPlatform.set(true);
    this.persist(withPictureKnown(session));
  }

  /**
   * Leaves the managed session: its tokens are revoked (they would otherwise stay usable until they expire)
   * and the platform session comes back, on the picker. With nothing held -- the storage was cleared in
   * between -- there is no session to return to, and this signs out.
   */
  exitManagedSession(): void {
    const held = this.readHeldPlatformSession();
    this.revoke(this.currentUser());
    localStorage.removeItem(PLATFORM_SESSION_KEY);
    this.heldPlatform.set(false);
    if (!held) {
      this.clear();
      void this.router.navigate(['/login']);
      return;
    }
    this.persist(held);
    void this.router.navigate([WORK_IN_WORKSPACE_PATH]);
  }

  /** ZT-M18: a name asked for this managed session's workspace already (one ask a session). */
  private namedWorkspace: number | null = null;

  /**
   * ZT-M18: the banner names the managed session's workspace. A session held without its name -- one restored from
   * elsewhere, an older sign-in answer -- read "workspace 1009"; Identity knows the name of the session's own workspace
   * (managedService.json/thisSession), asked once and kept with the session. Nothing to do outside a managed session or
   * when the name is there.
   */
  nameManagedWorkspace(): void {
    const user = this.currentUser();
    if (!user || !this.isManagedSession() || (user.tenantName ?? '').trim() || user.tenantId == null
      || this.namedWorkspace === user.tenantId) return;
    this.namedWorkspace = user.tenantId;
    this.http.get<ApiResponse<{ tenantId: number; tenantName: string }>>(`${API_BASE}/managedService.json/thisSession`).subscribe({
      next: r => {
        const now = this.currentUser();
        const name = (r?.data?.tenantName ?? '').trim();
        if (r?.status === API_SUCCESS && name && now && now.tenantId === r.data!.tenantId && this.isManagedSession()) {
          this.persist({ ...now, tenantName: name });
        }
      },
      error: () => { /* the banner says "this workspace" */ },
    });
  }

  private readHeldPlatformSession(): AuthUser | null {
    const raw = readStorage(PLATFORM_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      localStorage.removeItem(PLATFORM_SESSION_KEY);
      return null;
    }
  }

  get accessToken(): string | null {
    return this.currentUser()?.accessToken ?? null;
  }

  private persist(user: AuthUser): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PLATFORM_SESSION_KEY);
    this.heldPlatform?.set(false);
    this.currentUser.set(null);
  }

  private readStoredUser(): AuthUser | null {
    const raw = readStorage(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // A corrupt entry would otherwise wedge every page load behind a parse error.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}

/**
 * A sign-in's answer (and a managed session's, which is answered like one) always says whether the person has a
 * picture, but Identity leaves a null out: absent there means "none", so it is kept as null and the top bar asks
 * nothing, rather than as "unknown", which asks once per session. A refresh's answer does not carry it and is merged
 * over the session, so what the sign-in said stays.
 */
function withPictureKnown(user: AuthUser): AuthUser {
  return { ...user, avatarVersion: user.avatarVersion ?? null };
}
