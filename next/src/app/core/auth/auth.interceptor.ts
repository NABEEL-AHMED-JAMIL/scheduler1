import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Subject, catchError, finalize, map, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth.service';
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

function isSuccessEnvelope(event: HttpResponse<unknown>): boolean {
  return (event.body as { status?: string } | null)?.status === API_SUCCESS;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthCall = req.url.includes('/auth.json/');

  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(auth.accessToken)).pipe(
    map(event => {
      if (!(event instanceof HttpResponse)) return event;
      const response = withUsableBody(event);
      // Noticed here rather than in the screen that made the call: the guard keeps the session
      // on the profile page until the flag clears, and the response that clears it on the
      // server is the only thing the console ever hears about it.
      if (req.url.includes(CHANGE_PASSWORD_CALL) && isSuccessEnvelope(response)) {
        auth.passwordChanged();
      }
      return response;
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthCall) {
        return throwError(() => error);
      }

      if (refreshInFlight) {
        return newToken$.pipe(
          take(1),
          switchMap(token => next(withToken(token)))
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
          return next(withToken(token));
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
    })
  );
};
