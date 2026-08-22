import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_SUCCESS } from '../api/api.config';

/**
 * Shared across every request so that a burst of parallel calls hitting an expired token
 * triggers ONE refresh rather than one per call -- the old UI fired six refreshes on a single
 * dashboard load. Requests that arrive mid-refresh queue on this subject and replay once the
 * new token lands.
 */
let refreshInFlight = false;
const newToken$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthCall = req.url.includes('/auth.json/');

  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(auth.accessToken)).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthCall) {
        return throwError(() => error);
      }

      if (refreshInFlight) {
        return newToken$.pipe(
          filter((token): token is string => token !== null),
          take(1),
          switchMap(token => next(withToken(token)))
        );
      }

      refreshInFlight = true;
      newToken$.next(null);

      return auth.refresh().pipe(
        switchMap(response => {
          refreshInFlight = false;
          if (response.status !== API_SUCCESS) {
            auth.logout();
            return throwError(() => error);
          }
          const token = auth.accessToken;
          newToken$.next(token);
          return next(withToken(token));
        }),
        catchError(refreshError => {
          refreshInFlight = false;
          auth.logout();
          return throwError(() => refreshError);
        })
      );
    })
  );
};
