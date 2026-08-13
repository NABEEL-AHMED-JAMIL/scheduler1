import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiCode, ApiResponse } from '@/_models';
import { AuthUser } from '@/_models/auth.model';

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
