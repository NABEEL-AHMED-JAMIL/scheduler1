import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';
import { AuthUser, UserRole } from './auth.models';

const STORAGE_KEY = 'etl_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** Signal rather than BehaviorSubject: templates read it directly with no async pipe. */
  private readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly role = computed<UserRole | null>(() => this.currentUser()?.userRole ?? null);

  readonly isPlatformAdmin = computed(() => this.role() === 'PLATFORM_ADMIN');
  readonly isTenantAdmin = computed(() =>
    this.role() === 'TENANT_ADMIN' || this.role() === 'PLATFORM_ADMIN');

  readonly displayName = computed(() => {
    const user = this.currentUser();
    return user?.fullName?.trim() || user?.username || '';
  });

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
