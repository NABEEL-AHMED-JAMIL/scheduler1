import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, CanMatchFn, Router } from '@angular/router';
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
 * Must sit on the route that carries the `minRole` data, not on a parent: a guard only ever
 * sees its own snapshot, and route data is inherited downward, never up. Mounted on the
 * shell it read a key that was only ever declared on the children, so the check
 * silently passed for everyone and /admin/tenants opened for any signed-in user.
 *
 * A route names the single lowest role that may open it, and the hierarchy in AuthService
 * decides the rest -- the same reading the server's RoleHierarchy gives the @PreAuthorize
 * behind the page. Listing the permitted roles instead meant every admin route had to repeat
 * PLATFORM_ADMIN beside TENANT_ADMIN, and the first one to forget would have sent a platform
 * admin to /unauthorized for a page the API serves them.
 *
 * Roles are enforced on the server too; this only decides what is worth rendering.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const minimum = route.data?.['minRole'] as UserRole | undefined;
  if (minimum && !auth.hasAtLeast(minimum)) {
    return router.createUrlTree(['/unauthorized']);
  }
  return true;
};

/** The one page that can settle the debt below, and so the one page it may not close. */
const PASSWORD_CHANGE_PATH = '/profile';

/**
 * Holds a session that still owes a password change on the profile screen, where the change is
 * made. The server reports the debt at sign-in; without something acting on it, an account
 * opened with a one-time password kept working on that password indefinitely as long as nobody
 * opened the one screen that mentioned it.
 *
 * canActivateChild rather than canActivate: the shell's own guards run when the shell is
 * activated and not again, so moving between two of its children would never be checked.
 *
 * Signing out stays reachable -- it is a control in the shell rather than a child route, and
 * /login sits outside the shell entirely.
 */
export const passwordChangeGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.mustChangePassword() && !state.url.startsWith(PASSWORD_CHANGE_PATH)) {
    return router.createUrlTree([PASSWORD_CHANGE_PATH]);
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
