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

  // Roles are enforced on the server too; this only decides what is worth rendering.
  const allowed = route.data?.['roles'] as UserRole[] | undefined;
  if (allowed?.length && !allowed.includes(auth.role()!)) {
    return router.createUrlTree(['/unauthorized']);
  }
  return true;
};
