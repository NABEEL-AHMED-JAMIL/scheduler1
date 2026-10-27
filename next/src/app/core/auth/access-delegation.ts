import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';
import { AuthService } from './auth.service';

/** F3 (MIG-400): a member's delegation to grant page and tab access, as identity answers pageAccess.json/delegates/mine. */
export interface MyDelegation {
  delegateId: number;
  scopePeople: 'ALL_MEMBERS' | 'LISTED';
  people: number[];
  scopeKeys: string[] | null;
  canAssignProfiles: boolean;
  expiresAt: string;
  reason: string | null;
  grantedByName?: string | null;
  /** The page and tab keys they may grant: what they hold, within the delegation's keys. */
  grantableKeys: string[];
}

/**
 * Whether the signed-in member is an access delegate (owner F3: "a main account, for example a CEO, grants chosen pages or
 * tabs"): read once a session, for members only -- an administrator manages access by role. The menu offers Administration ›
 * Page access to a delegate, and that page shows them the people they reach and what they may grant.
 */
@Injectable({ providedIn: 'root' })
export class AccessDelegation {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly auth = inject(AuthService);
  readonly mine = signal<MyDelegation | null>(null);
  readonly loaded = signal(false);
  private request$: Observable<MyDelegation | null> | null = null;
  readonly isDelegate = computed(() => !!this.mine() && !this.auth.isTenantAdmin());

  /** The member's delegation, read once (none for an administrator or with no HttpClient). */
  load(): Observable<MyDelegation | null> {
    if (!this.http || this.auth.isTenantAdmin() || !this.auth.isLoggedIn()) return of(null);
    if (this.loaded()) return of(this.mine());
    if (!this.request$) {
      this.request$ = this.http.get<ApiResponse<MyDelegation | null>>(`${API_BASE}/pageAccess.json/delegates/mine`).pipe(
        // Only an answer naming a delegation is one: "none" is data null, and anything else is not a delegation either.
        map(r => (r?.status === API_SUCCESS && r.data && typeof (r.data as MyDelegation).delegateId === 'number' ? r.data : null)),
        catchError(() => of(null)),
        tap(d => { this.mine.set(d); this.loaded.set(true); }),
        shareReplay(1),
      );
    }
    return this.request$;
  }

  /** Read again (a delegation was granted or revoked). */
  refresh(): Observable<MyDelegation | null> {
    this.loaded.set(false);
    this.request$ = null;
    return this.load();
  }
}
