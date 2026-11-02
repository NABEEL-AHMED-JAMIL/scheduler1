import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

const STORAGE_KEY = 'etl_auth_user';

/**
 * UI review, 2026-09-24 (verified): Sign out only forgot the session in this tab. It never told the server, so the
 * access and refresh tokens kept working (identity-service's POST /auth.json/logout revokes both), and other open
 * tabs stayed signed in.
 */
function signedIn(post: (url: string, body: unknown, options: { headers?: HttpHeaders }) => unknown) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: 'a@b.c', appUserId: 7, userRole: 'TENANT_ADMIN',
    accessToken: 'header.eyJzdWIiOiJhQGIuYyJ9.sig', refreshToken: 'refresh-123' }));
  const navigated: unknown[][] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => ({ subscribe: () => undefined }), post } },
    { provide: Router, useValue: { navigate: (...args: unknown[]) => { navigated.push(args); return Promise.resolve(true); } } },
  ] });
  return { auth: TestBed.inject(AuthService), navigated };
}

describe('Sign out', () => {
  useMemoryStorage();

  it('revokes both tokens on the server, then forgets the session', () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const { auth, navigated } = signedIn((url, body, options) => {
      calls.push({ url, body, auth: options?.headers?.get('Authorization') ?? null });
      return of({ status: 'SUCCESS' });
    });
    auth.logout();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/auth.json/logout');
    expect(calls[0].body).toEqual({ refreshToken: 'refresh-123' });
    expect(calls[0].auth).toBe('Bearer header.eyJzdWIiOiJhQGIuYyJ9.sig');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigated[0][0]).toEqual(['/login']);
  });

  it('still signs out when the server cannot be reached', () => {
    const { auth } = signedIn(() => throwError(() => new Error('offline')));
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
  });

  // MIG-353: the idle sign-out names its reason; a request failing a moment later must not navigate again without it.
  it('keeps the first sign-out\'s reason: a second sign-out once signed out does not navigate', () => {
    const { auth, navigated } = signedIn(() => of({ status: 'SUCCESS' }));
    auth.logout('idle');
    auth.logout();
    expect(navigated).toHaveLength(1);
    expect(navigated[0]).toEqual([['/login'], { queryParams: { reason: 'idle' } }]);
  });

  // Owner 2026-11-02: a refused refresh (the session was ended on the server) goes to Sign in -- it used to leave the page
  // up with no session, every request answering 401, because the refresh had already forgotten the session.
  it('goes to Sign in when the server refuses the refresh and the caller signs out', () => {
    const { auth, navigated } = signedIn(url => of(url.includes('/refresh')
      ? { status: 'ERROR', message: 'Refresh token is invalid or expired — please log in again.' } : { status: 'SUCCESS' }));
    auth.refresh().subscribe(response => { if (response.status !== 'SUCCESS') auth.logout(); });
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(navigated).toHaveLength(1);
    expect(navigated[0][0]).toEqual(['/login']);
  });

  it('follows another tab that signed out', () => {
    const { auth, navigated } = signedIn(() => of({}));
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: null }));
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigated[0][0]).toEqual(['/login']);
  });
});
