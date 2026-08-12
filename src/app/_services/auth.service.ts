import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiCode, ApiResponse } from '@/_models';
import { AuthUser } from '@/_models/auth.model';

/**
 * JWT-backed auth (Phase 0) -- login() calls the real backend (AuthRestApi), storing the
 * returned access+refresh tokens and user info in localStorage. AuthInterceptor attaches the
 * access token to every outgoing request and calls refreshAccessToken() on a 401 before
 * giving up and forcing a re-login (see auth.interceptor.ts).
 * @author Nabeel Ahmed
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

    private readonly STORAGE_KEY = 'etl_auth_user';

    constructor(private http: HttpClient, private router: Router) {
    }

    public login(username: string, password: string): Observable<string | null> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/auth.json/login`, { username, password })
            .pipe(
                map((response) => {
                    if (response.status !== ApiCode.SUCCESS) {
                        return response.message || 'Invalid username or password.';
                    }
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(response.data));
                    return null;
                }),
                catchError((error) => {
                    return throwError(error);
                })
            );
    }

    /** Called by AuthInterceptor when a request 401s -- swaps in a fresh access token using
     * the still-valid refresh token, without forcing the user to re-enter credentials. */
    public refreshAccessToken(): Observable<string> {
        const user = this.currentUser;
        if (!user || !user.refreshToken) {
            return throwError('No refresh token available.');
        }
        return this.http.post<ApiResponse>(`${config.apiUrl}/auth.json/refresh`, { refreshToken: user.refreshToken })
            .pipe(
                tap((response) => {
                    if (response.status === ApiCode.SUCCESS) {
                        user.accessToken = response.data.accessToken;
                        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
                    }
                }),
                map((response) => {
                    if (response.status !== ApiCode.SUCCESS) {
                        throw response.message;
                    }
                    return response.data.accessToken;
                })
            );
    }

    public logout(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        this.router.navigate(['/login']);
    }

    public isLoggedIn(): boolean {
        return !!this.accessToken;
    }

    public get accessToken(): string | null {
        const user = this.currentUser;
        return user ? user.accessToken : null;
    }

    public get currentUser(): AuthUser | null {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
}
