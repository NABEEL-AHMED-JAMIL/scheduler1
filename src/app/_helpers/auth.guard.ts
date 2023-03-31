import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthenticationService } from '@/_services';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
    

    constructor(
        private router: Router,
        private authenticationService: AuthenticationService
    ) {}

    public canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        const currentUser = this.authenticationService.currentUserValue;
        if (currentUser) {
            if (this.hasAccess(currentUser.roles, route.data.role)) {
                return true;
            }
            // authorised so return true
            this.router.navigate(['/404']);
            return false;
        }
        // { queryParams: { returnUrl: state.url }}
        this.router.navigate(['/login']);
        return false;
    }

    public hasAccess(userRoles: any, routeRoles: any) {
        return userRoles.some(role=> routeRoles.includes(role));
    }
}