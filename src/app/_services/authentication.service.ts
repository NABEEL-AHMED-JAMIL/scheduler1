import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthResponse } from '@/_models';

@Injectable({ providedIn: 'root' })
export class AuthenticationService {

    private currentUserSubject: BehaviorSubject<AuthResponse>;
    public currentUser: Observable<AuthResponse>;

    constructor(private http: HttpClient) {
        this.currentUserSubject = new BehaviorSubject<AuthResponse>(
            JSON.parse(localStorage.getItem('currentUser')));
        this.currentUser = this.currentUserSubject.asObservable();
    }

    public get currentUserValue(): AuthResponse {
        return this.currentUserSubject.value;
    }

    public signInAppUser(username: any, password: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/auth.json/signInAppUser`, { username, password })
            .pipe(map(response => {
                // store user details and jwt token in local storage to keep user logged in between page refreshes
                if (response.data) {
                    localStorage.setItem('currentUser', JSON.stringify(response.data));
                    this.currentUserSubject.next(response.data);
                }
                return response;
            }));
    }

    public signupAppUser(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/auth.json/signupAppUser`, payload);
    }

    public forgotPassword(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/auth.json/forgotPassword`, payload);
    }

    public resetPassword(payload: any): Observable<any> {
        return this.http.post<any>(`${config.apiUrl}/auth.json/resetPassword`, payload);
    }

    public tokenVerify(token: any): Observable<any> {
        return this.http.get<any>(`${config.apiUrl}/appUser.json/tokenVerify`, {
            headers: {'Authorization': token}
         });
    }

    public logout() {
        let refreshToken = JSON.parse(localStorage.getItem('currentUser')).refreshToken;
        let payload = {
            refreshToken: refreshToken
        };
        return this.http.post<any>(`${config.apiUrl}/auth.json/logoutAppUser`, payload)
        .pipe(map(response => {
            // store user details and jwt token in local storage to keep user logged in between page refreshes
            localStorage.clear();
            this.currentUserSubject.next(null);
            return response;
        }));
    }
}