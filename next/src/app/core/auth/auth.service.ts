import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';
import { AuthUser, ROLE_RANK, UserRole, isUserRole } from './auth.models';

const STORAGE_KEY = 'etl_auth_user';

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
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    // Base64url: atob wants the standard alphabet, and tolerates the missing padding.
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const role = claims?.userRole;
    return isUserRole(role) ? role : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** Signal rather than BehaviorSubject: templates read it directly with no async pipe. */
  private readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly role = computed<UserRole | null>(() => roleFromToken(this.currentUser()?.accessToken));

  /**
   * The one place the hierarchy is expressed: a platform admin has everything a tenant admin
   * has, and a tenant admin everything a tenant user has, exactly as the server's RoleHierarchy
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

  /*
   * Named for what the screen is about to do rather than for a role, so a control is gated on
   * the same fact the endpoint behind it checks. Each one names the API it stands for; when
   * that annotation moves, this is the single line that follows it.
   */

  /** sourceTask.json add/update/delete -- SourceTaskRestApi is class-level TENANT_ADMIN. */
  readonly canManageTasks = computed(() => this.hasAtLeast('TENANT_ADMIN'));
  /** aiAgent.json addAgent/updateAgent/deleteAgent. Fetching the agents is TENANT_USER. */
  readonly canManageAgents = computed(() => this.hasAtLeast('TENANT_ADMIN'));
  /** appUser.json addUser/changeUserStatus/resetPassword. */
  readonly canManageUsers = computed(() => this.hasAtLeast('TENANT_ADMIN'));
  /** tenant.json -- a tenant spans the platform, so only a platform admin touches one. */
  readonly canManageTenants = computed(() => this.hasAtLeast('PLATFORM_ADMIN'));

  readonly displayName = computed(() => {
    const user = this.currentUser();
    return user?.fullName?.trim() || user?.username || '';
  });

  private readonly avatarObjectUrl = signal('');

  /**
   * The picture as a blob URL rather than the endpoint's own URL. An <img src> cannot carry
   * the bearer token, so pointing it straight at previewObject produced an unauthenticated
   * request whose response the browser then blocked outright (ERR_BLOCKED_BY_ORB). Fetching
   * through HttpClient lets the interceptor attach the token, and the blob URL that comes
   * back is what the header and the profile screen bind to.
   */
  readonly avatarUrl = this.avatarObjectUrl.asReadonly();

  /**
   * Where the picture lives, and nothing else about the user.
   *
   * The sync below watched the whole stored user, so every write to it re-fetched: a token
   * refresh, a name change, settling the password debt. Each one revoked the blob URL and went
   * back to the server for a picture that had not moved, and the header emptied and refilled
   * while it did. Compared by value, so a new user object carrying the same location is not a
   * change at all.
   */
  private readonly avatarSource = computed(
    () => {
      const user = this.currentUser();
      return { bucket: user?.avatarBucket ?? '', key: user?.avatarKey ?? '' };
    },
    { equal: (a, b) => a.bucket === b.bucket && a.key === b.key });

  /**
   * An effect rather than a constructor call. Fetching from the constructor sent the request
   * while this service was still being instantiated -- the auth interceptor injects it, so
   * the interceptor was not in place yet and the call went out with no token and came back
   * 401. An effect defers to after the injector settles, and re-runs whenever the picture
   * changes, so signing in or replacing it refreshes without a manual call.
   */
  private readonly avatarSync = effect(() => {
    const { bucket, key } = this.avatarSource();

    const previous = untracked(() => this.avatarObjectUrl());
    if (previous) URL.revokeObjectURL(previous);
    this.avatarObjectUrl.set('');
    if (!bucket || !key) return;

    this.http.get(`${API_BASE}/storage.json/previewObject`, {
      params: { bucket, key },
      responseType: 'blob',
    }).subscribe({
      next: blob => this.avatarObjectUrl.set(URL.createObjectURL(blob)),
      error: () => this.avatarObjectUrl.set(''),
    });
  });

  /** Called by the profile screen so the header reflects an edit straight away. */
  patchUser(changes: Partial<AuthUser>): void {
    const user = this.currentUser();
    if (!user) return;
    this.persist({ ...user, ...changes });
  }

  readonly initials = computed(() => {
    const name = this.displayName();
    if (!name) return '';
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
    return letters.toUpperCase();
  });

  login(username: string, password: string): Observable<ApiResponse<AuthUser>> {
    return this.http
      .post<ApiResponse<AuthUser>>(`${API_BASE}/auth.json/login`, { username, password })
      .pipe(tap(response => {
        if (response.status === API_SUCCESS && response.data) {
          this.persist(response.data);
        }
      }));
  }

  /**
   * Called by the interceptor on a 401. Returns the new access token so the failed request can
   * be retried; anything other than success clears the session, since a refresh token the
   * server rejects is not recoverable by trying again.
   */
  refresh(): Observable<ApiResponse<AuthUser>> {
    const refreshToken = this.currentUser()?.refreshToken ?? '';
    return this.http
      .post<ApiResponse<AuthUser>>(`${API_BASE}/auth.json/refresh`, { refreshToken })
      .pipe(tap(response => {
        if (response.status === API_SUCCESS && response.data) {
          this.persist({ ...this.currentUser(), ...response.data } as AuthUser);
        } else {
          this.clear();
        }
      }));
  }

  logout(): void {
    this.clear();
    void this.router.navigate(['/login']);
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
    this.currentUser.set(null);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(STORAGE_KEY);
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
