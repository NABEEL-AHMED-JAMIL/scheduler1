import { Injectable } from '@angular/core';
import { Router } from '@angular/router';


/**
 * Simple client-side auth backed by localStorage.
 * Demo credentials: admin / admin
 *
 * @author Nabeel Ahmed
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

    private readonly STORAGE_KEY = 'etl_auth_user';

    constructor(private router: Router) {
    }

    public login(username: string, password: string): boolean {
        if (username === 'admin' && password === 'admin') {
            const user = {
                username: 'admin',
                name: 'Nabeel Ahmed',
                role: 'ETL Administrator',
                loggedInAt: new Date().toISOString()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
            return true;
        }
        return false;
    }

    public logout(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        this.router.navigate(['/login']);
    }

    public isLoggedIn(): boolean {
        return !!localStorage.getItem(this.STORAGE_KEY);
    }

    public get currentUser(): any {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
}
