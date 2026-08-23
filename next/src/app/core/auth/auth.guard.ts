import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './auth.models';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: route.url.join('/') } });
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
