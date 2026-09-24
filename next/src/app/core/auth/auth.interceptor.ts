import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, Subject, catchError, finalize, map, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.models';
import { API_SUCCESS } from '../api/api.config';

/**
 * Shared across every request so that a burst of parallel calls hitting an expired token
 * triggers ONE refresh rather than one per call -- the old UI fired six refreshes on a single
 * dashboard load. Requests that arrive mid-refresh queue on this subject and replay once the
 * new token lands.
 *
 * A plain Subject rather than a BehaviorSubject, and replaced after each cycle: the queue has
 * to be able to FAIL. When the refresh itself was refused, only the request that started it
 * was told -- the rest stayed subscribed to a subject that would never emit again, so their
 * components sat on a spinner with no error and no way back.
 */
let refreshInFlight = false;
let newToken$ = new Subject<string | null>();

/**
 * Ninety-eight call sites read `response.status === API_SUCCESS` straight off the body. A 200
 * with an empty or non-JSON body parses to null, and every one of them then throws
 * "Cannot read properties of null" -- an uncaught error, no message on screen, no way back.
 * Giving those responses the error shape the callers already handle turns a crash into the
 * message they were written to display.
 */
function withUsableBody(event: HttpResponse<unknown>): HttpResponse<unknown> {
  if (event.body !== null && event.body !== undefined) {
    return event;
  }
  // A 204 legitimately has no body and no caller reads one from it.
  if (event.status === 204) {
    return event;
  }
  return event.clone({
    body: { status: 'ERROR', message: 'The server returned an empty response.' },
  });
}

/** The call that settles the password debt passwordChangeGuard enforces. */
const CHANGE_PASSWORD_CALL = '/appUser.json/changeOwnPassword';
/** An administrator's reset, which is a change of the caller's own password when it names them. */
const RESET_PASSWORD_CALL = '/appUser.json/resetPassword';

function isSuccessEnvelope(event: HttpResponse<unknown>): boolean {
  return (event.body as { status?: string } | null)?.status === API_SUCCESS;
}

/**
 * Whether this request changes the signed-in person's own password. The server ends every token the
 * person holds when it succeeds -- this session's included -- and hands this session a new pair.
 */
function changesOwnPassword(req: HttpRequest<unknown>, auth: AuthService): boolean {
  if (req.url.includes(CHANGE_PASSWORD_CALL)) return true;
  if (!req.url.includes(RESET_PASSWORD_CALL)) return false;
  const target = (req.body as { appUserId?: number } | null)?.appUserId;
  return target !== undefined && target !== null && target === auth.user?.()?.appUserId;
}

/**
 * The sign-in pair a password change hands back, when it did and it is this person's. Anything else
 * -- a server from before it sent one, or a pair naming somebody else -- is no pair at all.
 */
function sessionIn(event: HttpResponse<unknown>, auth: AuthService): Partial<AuthUser> | null {
  const data = (event.body as { data?: Partial<AuthUser> | null } | null)?.data;
  if (!data || typeof data.accessToken !== 'string' || !data.accessToken
      || typeof data.refreshToken !== 'string' || !data.refreshToken) {
    return null;
  }
  const me = auth.user?.()?.appUserId;
  if (data.appUserId !== undefined && me !== undefined && data.appUserId !== me) return null;
  return data;
}

/**
 * Changes of the person's own password on their way to the server, and what settles when the last
 * one is answered.
 *
 * The change ends every token the person holds the moment the server makes it, so a request this
 * session sent just before can come back 401 before the change's own answer -- carrying the new pair
 * -- has arrived. Refreshing then would present a refresh token the change has just ended, fail, and
 * sign the person out: the broken session the new pair exists to prevent. Such a 401 waits here
 * instead, and is retried with whatever the change left behind.
 */
let ownPasswordChanges = 0;
let ownPasswordChangeSettled$ = new Subject<void>();

function beginOwnPasswordChange(): void {
  ownPasswordChanges++;
}

function endOwnPasswordChange(): void {
  ownPasswordChanges = Math.max(0, ownPasswordChanges - 1);
  if (ownPasswordChanges > 0) return;
  const settled = ownPasswordChangeSettled$;
  ownPasswordChangeSettled$ = new Subject<void>();
  settled.next();
  settled.complete();
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthCall = req.url.includes('/auth.json/');
  const ownPasswordChange = changesOwnPassword(req, auth);

  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  /**
   * One attempt at this request, carrying the response handling that belongs to it.
   *
   * Every send goes through here -- the first one, the retry the refresh makes, and the replays
   * of the requests that queued behind that refresh -- because none of the handling below is
   * optional for any of them. Those retries used to call `next()` bare, so a request that
   * happened to be the one meeting an expired token silently lost both halves of it: an empty
   * or non-JSON body reached the caller as null, which is the crash withUsableBody exists to
   * prevent, and a changeOwnPassword that succeeded on the retry never told AuthService, so
   * passwordChangeGuard went on holding the session on the profile screen with the debt already
   * settled on the server and nothing left to settle it again.
   */
  const attempt = (token: string | null) =>
    next(withToken(token)).pipe(
      map(event => {
        if (!(event instanceof HttpResponse)) return event;
        const response = withUsableBody(event);
        // Noticed here rather than in the screen that made the call: the guard keeps the session
        // on the profile page until the flag clears, and the response that clears it on the
        // server is the only thing the console ever hears about it.
        if (ownPasswordChange && isSuccessEnvelope(response)) {
          // Before the screen hears of it, so nothing it sends next goes out on a token the change
          // has just ended.
          const session = sessionIn(response, auth);
          if (session) {
            auth.adoptSession(session);
            if (req.url.includes(CHANGE_PASSWORD_CALL)) auth.passwordChanged();
          } else {
            auth.signOutAfterPasswordChange();
          }
        }
        return response;
      })
    );

  const sentWith = auth.accessToken;

  /**
   * A 401 on a token this session no longer holds says nothing about the one it holds now: a password
   * change replaced it while this request was out. Retried on the new one, with no refresh; if the
   * session was signed out meanwhile there is nothing to retry with.
   */
  const retryIfReplaced = (error: HttpErrorResponse) => {
    const current = auth.accessToken;
    if (current === sentWith) return null;
    return current ? attempt(current) : throwError(() => error);
  };

  /** The refresh cycle every 401 used to go straight to: one refresh for a burst, the rest queued. */
  const refreshAndRetry = (error: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
    if (refreshInFlight) {
      return newToken$.pipe(
        take(1),
        switchMap(token => attempt(token))
      );
    }

    refreshInFlight = true;
    const queue = newToken$;
    let settled = false;
    /** Whether the token was replaced, which decides what a later failure means. */
    let refreshed = false;

    /**
     * Ends the cycle, one way or the other. The queue is handed its outcome and then
     * replaced, so a later 401 -- after signing in again, say -- starts a fresh one rather
     * than subscribing to a subject that has already closed. Runs once, whichever path
     * reaches it: a queue that requests have since subscribed to must not be discarded and
     * replaced a second time.
     */
    const settle = (token: string | null, failure?: unknown) => {
      if (settled) return;
      settled = true;
      refreshInFlight = false;
      newToken$ = new Subject<string | null>();
      if (failure !== undefined) {
        queue.error(failure);
        return;
      }
      queue.next(token);
      queue.complete();
    };

    return auth.refresh().pipe(
      switchMap(response => {
        if (response.status !== API_SUCCESS) {
          settle(null, error);
          auth.logout();
          return throwError(() => error);
        }
        const token = auth.accessToken;
        refreshed = true;
        settle(token);
        return attempt(token);
      }),
      catchError(failure => {
        if (refreshed) {
          // A failure of the retry, not of the refresh. Only a second 401 says anything about
          // the token that was just issued; any other status is the endpoint's own problem and
          // was signing people out mid-task -- a 500 from one call took the whole session with
          // it, along with whatever was on screen. The requests queued behind this refresh
          // already surface their failures untouched, and the retry belongs with them.
          if (failure instanceof HttpErrorResponse && failure.status === 401) {
            auth.logout();
          }
          return throwError(() => failure);
        }
        settle(null, failure);
        auth.logout();
        return throwError(() => failure);
      }),
      // The third way this cycle can end. The refresh is subscribed as part of an ordinary
      // request, so cancelling that request cancels the refresh with it -- the file chat's
      // Stop button unsubscribes mid-call, and so does a component torn down on navigation.
      // Neither branch above then runs, which left refreshInFlight true and this queue live
      // for the rest of the session: every later 401 subscribed to a subject nothing would
      // ever emit on again, so those requests hung with no error and no refresh was ever
      // attempted again. No-ops once the cycle has already settled.
      finalize(() => settle(null, error))
    );
  };

  if (ownPasswordChange) beginOwnPasswordChange();

  const sent = attempt(sentWith).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthCall) {
        return throwError(() => error);
      }

      const replaced = retryIfReplaced(error);
      if (replaced) return replaced;

      // No session at all: there is no refresh token to present, and whatever signed it out has
      // already taken the person to the login page -- with its own reason, which a logout here
      // would overwrite.
      if (!sentWith) return throwError(() => error);

      // A change of this person's password is on its way back: wait for it, then retry on what it
      // left. Never for the change itself, which would wait on its own answer.
      if (!ownPasswordChange && ownPasswordChanges > 0) {
        return ownPasswordChangeSettled$.pipe(
          take(1),
          switchMap(() => retryIfReplaced(error) ?? refreshAndRetry(error))
        );
      }

      return refreshAndRetry(error);
    })
  );

  return ownPasswordChange ? sent.pipe(finalize(() => endOwnPasswordChange())) : sent;

};
