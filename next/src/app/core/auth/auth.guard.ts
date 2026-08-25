import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './auth.models';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    // state.url is the address that was actually asked for. route.url is the segments of the
    // route the guard sits on, which for the shell is the empty path -- so every returnUrl
    // came out blank and signing in always landed on the default page.
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return true;
};

/**
 * Must sit on the route that carries the `roles` data, not on a parent: a guard only ever
 * sees its own snapshot, and route data is inherited downward, never up. Mounted on the
 * shell it read a `roles` key that was only ever declared on the children, so the check
 * silently passed for everyone and /admin/tenants opened for any signed-in user.
 *
 * Roles are enforced on the server too; this only decides what is worth rendering.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const allowed = route.data?.['roles'] as UserRole[] | undefined;
  if (allowed?.length && !allowed.includes(auth.role()!)) {
    return router.createUrlTree(['/unauthorized']);
  }
  return true;
};

/**
 * Lets the root path mean two different things without either redirecting through the other:
 * a visitor gets the landing page, someone signed in gets the console. Angular tries the
 * routes in order and skips the one whose canMatch says no, so the landing route needs
 * pathMatch 'full' -- an empty path otherwise matches every deep link as a prefix.
 */
export const anonymousOnly: CanMatchFn = () => !inject(AuthService).isLoggedIn();
