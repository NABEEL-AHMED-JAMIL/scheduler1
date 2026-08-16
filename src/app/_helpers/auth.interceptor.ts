import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap, finalize, shareReplay } from 'rxjs/operators';
import { AuthService } from '@/_services';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

    private refreshInFlight$: Observable<string> | null = null;

    constructor(private authService: AuthService) {
    }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const isAuthEndpoint = request.url.indexOf('/auth.json/login') !== -1
            || request.url.indexOf('/auth.json/refresh') !== -1;
        const token = this.authService.accessToken;
        const authorizedRequest = (!isAuthEndpoint && token)
            ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
            : request;

        return next.handle(authorizedRequest).pipe(
            catchError((error: HttpErrorResponse) => {
                if (error.status !== 401 || isAuthEndpoint) {
                    return throwError(error);
                }
                return this.refreshTokenShared().pipe(
                    switchMap((newToken) => {
                        const retried = request.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
                        return next.handle(retried);
                    }),
                    catchError((refreshError) => {
                        this.authService.logout();
                        return throwError(refreshError);
                    })
                );
            })
        );
    }

    private refreshTokenShared(): Observable<string> {
        if (!this.refreshInFlight$) {
            this.refreshInFlight$ = this.authService.refreshAccessToken().pipe(
                finalize(() => { this.refreshInFlight$ = null; }),
                shareReplay(1)
            );
        }
        return this.refreshInFlight$;
    }
}
