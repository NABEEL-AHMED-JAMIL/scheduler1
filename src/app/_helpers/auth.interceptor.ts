import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '@/_services';

/**
 * Attaches the access token to every outgoing API request. On a 401 (expired access token),
 * tries one silent refresh-and-retry via AuthService.refreshAccessToken() before giving up and
 * forcing the user back to /login -- so a still-valid session doesn't get logged out just
 * because the short-lived access token expired mid-use.
 * @author Nabeel Ahmed
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {

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
                return this.authService.refreshAccessToken().pipe(
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
}
