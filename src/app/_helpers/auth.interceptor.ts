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
