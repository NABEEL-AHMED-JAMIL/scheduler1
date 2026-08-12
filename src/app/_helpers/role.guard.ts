import { Injectable } from '@angular/core';
import {
    CanActivate,
    Router,
    ActivatedRouteSnapshot,
    RouterStateSnapshot
} from '@angular/router';
import { AuthService } from '@/_services';

/**
 * Gates a route to a set of roles declared on it, e.g.:
 *   { path: 'users', canActivate: [AuthGuard, RoleGuard], data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] } }
 * A route with no `data.roles`/`data.exactUsernames` is left open to any logged-in user (same as
 * before this guard existed) -- this only tightens routes that explicitly opt in. Runs after
 * AuthGuard (which handles "not logged in at all"); this only handles "logged in but not
 * allowed here", redirecting to /unauthorized rather than bouncing back to /login (the user
 * doesn't need to re-authenticate, they just can't be here).
 *
 * `data.exactUsernames` gates a route to specific account(s) by username, e.g.:
 *   { path: 'cvTailor', canActivate: [AuthGuard, RoleGuard], data: { exactUsernames: ['admin@platform.local'] } }
 * This is deliberately a *stricter* check than a role, not a substitute for one -- unlike
 * `data.roles` (any account holding that role), this names specific accounts. Used sparingly,
 * for personal/experimental tooling not meant to be delegated just by granting PLATFORM_ADMIN to
 * someone else. When both `data.roles` and `data.exactUsernames` are set on the same route, BOTH
 * must pass.
 * @author Nabeel Ahmed
 */
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
