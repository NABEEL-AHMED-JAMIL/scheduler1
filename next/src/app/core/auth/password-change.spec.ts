import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.models';

/**
 * Changing your own password keeps this session and ends every other one.
 *
 * Reported 2026-09-24: after a password change every screen of the session that made it stopped
 * working until its owner signed in again. The server now ends every token the person holds and
 * hands this session a fresh sign-in pair in the change's response; the console has to put that
 * pair in place before anything else goes out -- including the requests that were already out
 * when the change landed -- and, against a server that hands back no pair, sign out cleanly and
 * say why rather than leave a session whose every call fails.
 */

const ME = 7;
const CHANGE = '/api/v1/appUser.json/changeOwnPassword';
const RESET = '/api/v1/appUser.json/resetPassword';

interface Sent {
  req: HttpRequest<unknown>;
  answer: Subject<HttpEvent<unknown>>;
}

function world() {
  let user: Partial<AuthUser> | null = {
    appUserId: ME, username: 'me@example.com', accessToken: 'old-access', refreshToken: 'old-refresh',
    mustChangePassword: true,
  };
  const log: string[] = [];
  const auth = {
    get accessToken() { return user?.accessToken ?? null; },
    user: () => user,
    adoptSession: (session: Partial<AuthUser>) => { log.push('adopted'); user = { ...user, ...session }; },
    passwordChanged: () => { log.push('debt-cleared'); },
    signOutAfterPasswordChange: () => { log.push('signed-out-with-notice'); user = null; },
    // The change has ended the old refresh token, so a refresh presenting it is refused.
    refresh: () => { log.push('refresh'); return of({ status: 'ERROR', message: 'Refresh token is invalid or expired' }); },
    logout: () => { log.push('logout'); user = null; },
  };

  const sent: Sent[] = [];
  const next = (req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> => {
    const answer = new Subject<HttpEvent<unknown>>();
    sent.push({ req, answer });
    return answer;
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });

  const send = (method: 'GET' | 'PUT', url: string, body: unknown = null) => {
    const outcome = { body: undefined as unknown, status: undefined as number | undefined };
    TestBed.runInInjectionContext(() => authInterceptor(
      method === 'GET' ? new HttpRequest('GET', url) : new HttpRequest('PUT', url, body),
      next as any,
    )).subscribe({
      next: event => { if (event instanceof HttpResponse) outcome.body = event.body; },
      error: (err: HttpErrorResponse) => { outcome.status = err.status; },
    });
    return outcome;
  };

  const ok = (i: number, body: unknown) => {
    sent[i].answer.next(new HttpResponse({ status: 200, body }));
    sent[i].answer.complete();
  };
  const unauthorized = (i: number) => sent[i].answer.error(new HttpErrorResponse({ status: 401, url: sent[i].req.url }));
  const bearer = (i: number) => sent[i].req.headers.get('Authorization');

  return { auth, log, sent, send, ok, unauthorized, bearer, user: () => user };
}

const NEW_PAIR = {
  status: 'SUCCESS', message: 'Your password has been changed.',
  data: { appUserId: ME, username: 'me@example.com', accessToken: 'new-access', refreshToken: 'new-refresh', mustChangePassword: false },
};
const NO_PAIR = { status: 'SUCCESS', message: 'Your password has been changed.' };

describe('changing your own password', () => {
  it('puts the new pair in place before the next request goes out', () => {
    const w = world();

    const change = w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.ok(0, NEW_PAIR);

    expect(change.body).toEqual(NEW_PAIR);
    expect(w.log).toEqual(['adopted', 'debt-cleared']);
    expect(w.user()?.accessToken).toBe('new-access');
    expect(w.user()?.refreshToken).toBe('new-refresh');

    w.send('GET', '/api/v1/jobs.json/list');
    expect(w.bearer(1)).toBe('Bearer new-access');
  });

  it('signs out cleanly, and says why, when the server hands back no pair', () => {
    const w = world();

    const change = w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.ok(0, NO_PAIR);

    expect(change.body).toEqual(NO_PAIR);
    expect(w.log).toEqual(['signed-out-with-notice']);
    expect(w.user()).toBeNull();
  });

  it('changes nothing when the change is refused', () => {
    const w = world();

    w.send('PUT', CHANGE, { currentPassword: 'wrong', newPassword: 'y' });
    w.ok(0, { status: 'ERROR', message: 'That is not your current password.' });

    expect(w.log).toEqual([]);
    expect(w.user()?.accessToken).toBe('old-access');
  });

  it('never adopts a pair that names somebody else', () => {
    const w = world();

    w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.ok(0, { ...NEW_PAIR, data: { ...NEW_PAIR.data, appUserId: 99 } });

    expect(w.log).toEqual(['signed-out-with-notice']);
  });

  /*
   * The race the report hides: a screen's request goes out on the old token, the server makes the
   * change (ending that token), and the request's 401 arrives before the change's own answer. A
   * refresh then would present the refresh token the change just ended, be refused, and sign the
   * person out -- the broken session all over again.
   */
  it('holds a request refused mid-change until the new pair lands, then retries it on the new token', () => {
    const w = world();

    const inFlight = w.send('GET', '/api/v1/jobs.json/list');
    w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.unauthorized(0);

    expect(w.sent.length).toBe(2);
    expect(w.log).toEqual([]);

    w.ok(1, NEW_PAIR);
    expect(w.sent.length).toBe(3);
    expect(w.bearer(2)).toBe('Bearer new-access');
    w.ok(2, { status: 'SUCCESS', message: 'ok', data: ['job'] });

    expect(inFlight.body).toEqual({ status: 'SUCCESS', message: 'ok', data: ['job'] });
    expect(w.log).toEqual(['adopted', 'debt-cleared']);
    expect(w.log).not.toContain('refresh');
    expect(w.log).not.toContain('logout');
  });

  it('retries a request refused after the pair was adopted on the new token, without a refresh', () => {
    const w = world();

    const inFlight = w.send('GET', '/api/v1/jobs.json/list');
    w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.ok(1, NEW_PAIR);
    w.unauthorized(0);

    expect(w.bearer(2)).toBe('Bearer new-access');
    w.ok(2, { status: 'SUCCESS', message: 'ok' });
    expect(inFlight.body).toEqual({ status: 'SUCCESS', message: 'ok' });
    expect(w.log).toEqual(['adopted', 'debt-cleared']);
  });

  it('fails a request held mid-change without a refresh when the server handed back no pair', () => {
    const w = world();

    const inFlight = w.send('GET', '/api/v1/jobs.json/list');
    w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.unauthorized(0);
    w.ok(1, NO_PAIR);

    expect(inFlight.status).toBe(401);
    expect(w.sent.length).toBe(2);
    // One sign-out, the one that tells the person why; no refresh, and no second, silent logout.
    expect(w.log).toEqual(['signed-out-with-notice']);
  });

  it('lets a request held mid-change refresh as usual when the change was refused', () => {
    const w = world();

    w.send('GET', '/api/v1/jobs.json/list');
    w.send('PUT', CHANGE, { currentPassword: 'wrong', newPassword: 'y' });
    w.unauthorized(0);
    expect(w.log).toEqual([]);

    w.ok(1, { status: 'ERROR', message: 'That is not your current password.' });
    expect(w.log[0]).toBe('refresh');
    expect(w.log).toContain('logout');
    expect(w.log).not.toContain('signed-out-with-notice');
  });

  it('does not refresh, or sign out again, for a request that had no session to send', () => {
    const w = world();
    w.send('PUT', CHANGE, { currentPassword: 'x', newPassword: 'y' });
    w.ok(0, NO_PAIR);

    // What the profile screen used to do next: re-read itself, with no token left.
    const after = w.send('GET', '/api/v1/appUser.json/me');
    w.unauthorized(1);

    expect(after.status).toBe(401);
    expect(w.log).toEqual(['signed-out-with-notice']);
  });
});

describe('an administrator resetting a password', () => {
  it('keeps their session on the pair the server hands back when the password is their own', () => {
    const w = world();

    w.send('PUT', RESET, { appUserId: ME, password: 'y' });
    w.ok(0, { ...NEW_PAIR, message: 'Password reset for "me@example.com".' });

    expect(w.log).toEqual(['adopted']);
    expect(w.user()?.accessToken).toBe('new-access');
  });

  it('signs out cleanly when their own reset comes back without a pair', () => {
    const w = world();

    w.send('PUT', RESET, { appUserId: ME, password: 'y' });
    w.ok(0, { status: 'SUCCESS', message: 'Password reset for "me@example.com".' });

    expect(w.log).toEqual(['signed-out-with-notice']);
  });

  it('leaves their own session alone when the password is somebody else\'s', () => {
    const w = world();

    w.send('PUT', RESET, { appUserId: 42, password: 'y' });
    w.ok(0, { status: 'SUCCESS', message: 'Password reset for "them@example.com".' });

    expect(w.log).toEqual([]);
    expect(w.user()?.accessToken).toBe('old-access');
  });
});
