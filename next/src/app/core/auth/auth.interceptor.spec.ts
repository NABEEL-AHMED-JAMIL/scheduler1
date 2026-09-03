import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { ApiResponse } from '../api/api.config';

/**
 * The dashboard's shape: several calls go out together, all of them meet the same expired
 * token, and only the first gets to run the refresh. The rest wait on the queue -- so what
 * happens to the queue when the refresh is refused is the whole question.
 */
function harness(refresh$: Observable<ApiResponse<unknown>>, unauthorizedCalls: number) {
  let calls = 0;
  let loggedOut = false;
  const auth = {
    accessToken: 'expired',
    refresh: () => refresh$,
    logout: () => { loggedOut = true; },
  };

  const next = (req: HttpRequest<unknown>) => {
    calls++;
    return calls <= unauthorizedCalls
      ? throwError(() => new HttpErrorResponse({ status: 401, url: req.url }))
      : of(new HttpResponse({ status: 200, body: { status: 'SUCCESS', message: 'ok' } }));
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });

  const send = (url: string) => TestBed.runInInjectionContext(
    () => authInterceptor(new HttpRequest('GET', url), next as any));

  return { send, wasLoggedOut: () => loggedOut, calls: () => calls };
}

describe('authInterceptor', () => {
  it('fails the requests queued behind a refused refresh instead of leaving them pending', () => {
    const refresh$ = new Subject<ApiResponse<unknown>>();
    const { send, wasLoggedOut } = harness(refresh$, 6);

    const errors: string[] = [];
    const settled: string[] = [];
    for (let i = 0; i < 6; i++) {
      send(`/api/v1/dashboard.json/call${i}`).subscribe({
        next: () => settled.push(`next-${i}`),
        error: () => { errors.push(`error-${i}`); settled.push(`error-${i}`); },
      });
    }

    // The refresh token has expired too, so the server answers with the error envelope.
    refresh$.next({ status: 'ERROR', message: 'Refresh token expired' });
    refresh$.complete();

    expect(errors.length).toBe(6);
    expect(settled.length).toBe(6);
    expect(wasLoggedOut()).toBe(true);
  });

  it('replays the queue once a refresh succeeds', () => {
    const refresh$ = new Subject<ApiResponse<unknown>>();
    // Three original calls meet the expired token; their retries must not.
    const { send, wasLoggedOut, calls } = harness(refresh$, 3);

    const done: number[] = [];
    for (let i = 0; i < 3; i++) {
      send(`/api/v1/dashboard.json/call${i}`).subscribe({ next: () => done.push(i) });
    }

    refresh$.next({ status: 'SUCCESS', message: 'ok' });
    refresh$.complete();

    expect(done.length).toBe(3);
    expect(calls()).toBe(6);
    expect(wasLoggedOut()).toBe(false);
  });

  it('starts a fresh queue for the next cycle rather than reusing a closed one', () => {
    const first = new Subject<ApiResponse<unknown>>();
    const firstRound = harness(first, 2);
    firstRound.send('/api/v1/a').subscribe({ error: () => undefined });
    firstRound.send('/api/v1/b').subscribe({ error: () => undefined });
    first.next({ status: 'ERROR', message: 'no' });
    first.complete();

    // A second burst, after signing in again, must be able to queue and replay as before.
    const second = new Subject<ApiResponse<unknown>>();
    const secondRound = harness(second, 2);
    const done: string[] = [];
    secondRound.send('/api/v1/c').subscribe({ next: () => done.push('c') });
    secondRound.send('/api/v1/d').subscribe({ next: () => done.push('d') });
    second.next({ status: 'SUCCESS', message: 'ok' });
    second.complete();

    // A queued request replays as soon as the token lands, which is before the request that
    // asked for the refresh gets its own retry away -- so both arrive, in either order.
    expect([...done].sort()).toEqual(['c', 'd']);
  });

  /*
   * The cycle ends a third way, and this one leaves no trace in either branch: the refresh is
   * subscribed as part of an ordinary request, so cancelling that request cancels the refresh.
   * The file chat's Stop button does exactly that to a call that may well be the one that met
   * the expired token. Nothing then releases the queue or clears the in-flight flag unless the
   * teardown does, and the flag is module-level -- so the damage outlives the request that
   * caused it and takes the rest of the session with it.
   */
  it('releases the queue when the request that started the refresh is cancelled', () => {
    const abandoned = new Subject<ApiResponse<unknown>>();
    const first = harness(abandoned, 2);

    const errors: string[] = [];
    const starter = first.send('/api/v1/fileChat.json/sendMessage')
      .subscribe({ error: () => errors.push('starter') });
    first.send('/api/v1/jobs.json/list').subscribe({ error: () => errors.push('queued') });

    starter.unsubscribe();
    expect(errors).toEqual(['queued']);

    // And the next 401 must run its own refresh rather than wait on the abandoned queue.
    const later = new Subject<ApiResponse<unknown>>();
    const second = harness(later, 1);
    const done: string[] = [];
    second.send('/api/v1/jobs.json/list').subscribe({ next: () => done.push('ok') });
    later.next({ status: 'SUCCESS', message: 'ok' });
    later.complete();

    expect(done).toEqual(['ok']);
  });

  // The console has no other way to learn the debt is settled: nothing re-reads the flag, and
  // the guard would otherwise hold the session on the profile screen until the next sign-in.
  it('clears the password debt when changeOwnPassword succeeds', () => {
    const seen: string[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{
        provide: AuthService,
        useValue: { accessToken: 'fine', passwordChanged: () => seen.push('cleared') },
      }],
    });

    const send = (url: string, body: unknown) => TestBed.runInInjectionContext(() => authInterceptor(
      new HttpRequest('PUT', url, {}),
      (() => of(new HttpResponse({ status: 200, body }))) as any,
    )).subscribe();

    send('/api/v1/appUser.json/changeOwnPassword', { status: 'SUCCESS', message: 'ok' });
    expect(seen).toEqual(['cleared']);

    // A refused change leaves the debt standing, and no other call speaks to it at all.
    send('/api/v1/appUser.json/changeOwnPassword', { status: 'ERROR', message: 'wrong password' });
    send('/api/v1/appUser.json/updateOwnProfile', { status: 'SUCCESS', message: 'ok' });
    expect(seen).toEqual(['cleared']);
  });

  // The refresh worked; the endpoint behind it is simply broken. Signing out here threw away
  // whatever the person had on screen over a fault that had nothing to do with their session.
  it('keeps the session when the retried request fails for its own reasons', () => {
    let loggedOut = false;
    let calls = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{
        provide: AuthService,
        useValue: {
          accessToken: 'expired',
          refresh: () => of({ status: 'SUCCESS', message: 'ok' } as ApiResponse<unknown>),
          logout: () => { loggedOut = true; },
        },
      }],
    });

    const status: number[] = [];
    TestBed.runInInjectionContext(() => authInterceptor(
      new HttpRequest('GET', '/api/v1/jobs.json/fetch'),
      (() => {
        calls++;
        return throwError(() => new HttpErrorResponse({ status: calls === 1 ? 401 : 500 }));
      }) as any,
    )).subscribe({ error: (err: HttpErrorResponse) => status.push(err.status) });

    expect(calls).toBe(2);
    expect(status).toEqual([500]);
    expect(loggedOut).toBe(false);
  });

  it('leaves a failure that is not a 401 to the caller', () => {
    let loggedOut = false;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{
        provide: AuthService,
        useValue: {
          accessToken: 'fine',
          refresh: () => { throw new Error('the interceptor must not refresh on a 500'); },
          logout: () => { loggedOut = true; },
        },
      }],
    });

    const status: number[] = [];
    TestBed.runInInjectionContext(() => authInterceptor(
      new HttpRequest('GET', '/api/v1/x'),
      (() => throwError(() => new HttpErrorResponse({ status: 500 }))) as any,
    )).subscribe({ error: (err: HttpErrorResponse) => status.push(err.status) });

    expect(status).toEqual([500]);
    expect(loggedOut).toBe(false);
  });
});
