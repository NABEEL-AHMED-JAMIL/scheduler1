import { Injectable } from '@angular/core';
import {
    CanActivate,
    Router,
    ActivatedRouteSnapshot,
    RouterStateSnapshot
} from '@angular/router';
import { AuthService } from '@/_services';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {

    constructor(private authService: AuthService, private router: Router) {
    }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
        const requiredRoles: string[] = route.data && route.data.roles;
        const requiredUsernames: string[] = route.data && route.data.exactUsernames;
        const userRole = this.authService.currentUser?.userRole;
        const username = this.authService.currentUser?.username;
        const roleOk = !requiredRoles || requiredRoles.length === 0
            || (!!userRole && requiredRoles.indexOf(userRole) > -1);
        const usernameOk = !requiredUsernames || requiredUsernames.length === 0
            || (!!username && requiredUsernames.indexOf(username) > -1);
        if (roleOk && usernameOk) {
            return true;
        }
        this.router.navigate(['/unauthorized']);
        return false;
    }
}
