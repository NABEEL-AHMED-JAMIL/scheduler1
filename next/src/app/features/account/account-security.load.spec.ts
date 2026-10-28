import { describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { AccountSecurity } from './account-security';
import { AccountSecurityApi } from './account-security.api';
import { SignInHistory } from './sign-in-history';
import { TwoFactorCard } from './two-factor-card';

/**
 * Owner 2026-10-27: "add a sort on each table" and "a loader on each component like it's loading". My security's
 * sessions sort by every column, and the sessions, the password rules, two-factor login and the older sign-ins each say
 * loading, empty or why they failed -- never "No session" or an 8-character rule before the answer.
 */
const SESSIONS = [
  { sessionId: 'a', current: true, method: 'PASSWORD', ip: '10.0.0.9', userAgent: null,
    signedInAt: '2026-10-20 09:00:00', lastActiveAt: '2026-10-27 08:00:00', idleExpiresAt: '2026-10-27 09:00:00' },
  { sessionId: 'b', current: false, method: 'SSO', ip: '10.0.0.10', userAgent: null,
    signedInAt: '2026-10-26 09:00:00', lastActiveAt: '2026-10-26 10:00:00', idleExpiresAt: '2026-10-26 11:00:00' },
];
const ok = (data: unknown) => of({ status: 'SUCCESS', message: '', data });
const fail500 = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

function setUp(api: Record<string, (...args: any[]) => Observable<unknown>>) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: vi.fn(), put: vi.fn(), post: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AccountSecurityApi, useValue: api },
      { provide: AuthService, useValue: { isLoggedIn: () => true, logout: vi.fn(), user: signal(null) } },
    ],
  });
}

function security(sessions: () => Observable<unknown>, rules: () => Observable<unknown> = () => ok({ rules: [], passwordMinLength: 10 })) {
  setUp({ myRules: rules, sessions });
  const screen = TestBed.runInInjectionContext(() => new AccountSecurity());
  screen.ngOnInit();
  return screen;
}

describe('My security -- sessions sort (owner 2026-10-27)', () => {
  it('keeps the API order, then sorts by Signed in both ways', () => {
    const screen = security(() => ok(SESSIONS));
    expect(screen.sortedSessions().map(s => s.sessionId)).toEqual(['a', 'b']);
    screen.sessionSort.toggle('signedIn');
    expect(screen.sortedSessions().map(s => s.sessionId)).toEqual(['b', 'a']);
    screen.sessionSort.toggle('signedIn');
    expect(screen.sortedSessions().map(s => s.sessionId)).toEqual(['a', 'b']);
  });

  it('sorts How by the words people read', () => {
    const screen = security(() => ok(SESSIONS));
    screen.sessionSort.toggle('how');
    expect(screen.sortedSessions().map(s => s.method)).toEqual(['PASSWORD', 'SSO']);
  });
});

describe('My security -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not empty, until the sessions answer', () => {
    const screen = security(() => NEVER, () => NEVER);
    expect(screen.sessionsState.pending()).toBe(true);
    expect(screen.sessionsLoading()).toBe(true);
    expect(screen.rulesState.loading()).toBe(true);
  });

  it('is empty once an empty list answers', () => {
    const screen = security(() => ok([]));
    expect(screen.sessionsState.pending()).toBe(false);
    expect(screen.sessionsLoading()).toBe(false);
    expect(screen.sortedSessions()).toEqual([]);
    expect(screen.minLength()).toBe(10);
  });

  it('says in plain words when the sessions or the rules could not be read', () => {
    const screen = security(fail500, fail500);
    expect(screen.sessionsLoading()).toBe(false);
    expect(screen.sessionsError()).toBe('Your sessions could not be read.');
    expect(screen.rulesState.error()).toContain('password rules could not be read');
  });
});

describe('Two-factor login card -- loading and a failure that clears (owner 2026-10-27)', () => {
  it('is loading until the status answers, and a later success clears an earlier failure', () => {
    let answer: () => Observable<unknown> = () => NEVER;
    setUp({ mfa: () => answer() });
    const card = TestBed.runInInjectionContext(() => new TwoFactorCard());
    card.ngOnInit();
    expect(card.state.pending()).toBe(true);

    answer = fail500;
    card.load();
    expect(card.state.loading()).toBe(false);
    expect(card.error()).toBe('Two-factor login could not be read.');

    answer = () => ok({ enabled: false, enrolledAt: null, recoveryCodesLeft: 0, required: false });
    card.load();
    expect(card.error()).toBe('');
    expect(card.status()?.enabled).toBe(false);
  });
});

describe('Sign-in history -- Load older says when it fails (owner 2026-10-27)', () => {
  it('keeps the rows and names the failure under the button', () => {
    const first = ok({ items: [{ id: 1, outcome: 'SUCCESS', method: 'PASSWORD', at: '2026-10-27 08:00:00' }], total: 2, limit: 50, offset: 0 });
    let call = 0;
    setUp({ myHistory: () => (call++ === 0 ? first : fail500()) });
    const history = TestBed.runInInjectionContext(() => new SignInHistory());
    expect(history.loading()).toBe(true);
    history.ngOnInit();
    expect(history.rows().length).toBe(1);
    history.loadOlder();
    expect(history.loadingMore()).toBe(false);
    expect(history.rows().length).toBe(1);
    expect(history.moreError()).toBe('The older sign-ins could not be read.');
  });
});
