import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { anonymousOnly, roleGuard, authGuard, passwordChangeGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ROLE_RANK, UserRole } from './auth.models';
import { routes } from '../../app.routes';

/** Enough of a snapshot for a guard: it only ever reads `data` and `url`. */
const snapshotWith = (data: any) => ({ data, url: [] }) as any;

function runGuard(guard: any, role: string | null, data: any) {
  // Reset first: a case that runs the guard more than once would otherwise reconfigure an
  // already-instantiated TestBed, which throws rather than failing on what it set out to check.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          isLoggedIn: () => role !== null,
          role: () => role,
          hasAtLeast: (minimum: UserRole) =>
            role !== null && ROLE_RANK[role as UserRole] >= ROLE_RANK[minimum],
        },
      },
      { provide: Router, useValue: { createUrlTree: (c: any[]) => ({ toString: () => c.join('/') }) as UrlTree } },
    ],
  });
  return TestBed.runInInjectionContext(() => guard(snapshotWith(data), {} as any));
}

describe('roleGuard', () => {
  it('sends a role below the minimum to /unauthorized', () => {
    const result = runGuard(roleGuard, 'TENANT_USER', { minRole: 'PLATFORM_ADMIN' });
    expect(String(result)).toBe('/unauthorized');
  });

  it('lets the named role through', () => {
    expect(runGuard(roleGuard, 'PLATFORM_ADMIN', { minRole: 'PLATFORM_ADMIN' })).toBe(true);
  });

  // The whole point of a minimum: the server's RoleHierarchy makes hasRole('TENANT_ADMIN')
  // pass for a platform admin, so a page guarded that way must open for one too.
  it('lets a higher role through a route that asks for a lower one', () => {
    expect(runGuard(roleGuard, 'PLATFORM_ADMIN', { minRole: 'TENANT_ADMIN' })).toBe(true);
    expect(runGuard(roleGuard, 'TENANT_ADMIN', { minRole: 'TENANT_USER' })).toBe(true);
    expect(runGuard(roleGuard, 'PLATFORM_ADMIN', { minRole: 'TENANT_USER' })).toBe(true);
  });

  it('sends a tenant admin away from a platform-admin route', () => {
    expect(String(runGuard(roleGuard, 'TENANT_ADMIN', { minRole: 'PLATFORM_ADMIN' }))).toBe('/unauthorized');
  });

  // Fails closed: a session whose token carries no readable role is not a tenant user.
  it('refuses a guarded route when there is no role at all', () => {
    expect(String(runGuard(roleGuard, null, { minRole: 'TENANT_USER' }))).toBe('/unauthorized');
  });

  it('lets everyone through a route that names no minimum', () => {
    expect(runGuard(roleGuard, 'TENANT_USER', {})).toBe(true);
  });
});

describe('authGuard', () => {
  it('redirects a signed-out visitor to the login page', () => {
    expect(String(runGuard(authGuard, null, {}))).toBe('/login');
  });

  it('lets a signed-in visitor through', () => {
    expect(runGuard(authGuard, 'TENANT_USER', {})).toBe(true);
  });
});

describe('passwordChangeGuard', () => {
  function runPasswordGuard(owes: boolean, url: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { mustChangePassword: () => owes } },
        { provide: Router, useValue: { createUrlTree: (c: any[]) => ({ toString: () => c.join('/') }) as UrlTree } },
      ],
    });
    return TestBed.runInInjectionContext(() => passwordChangeGuard(snapshotWith({}), { url } as any));
  }

  // The hole this closes: sign-in reports the debt, and before this nothing in the console
  // read it -- so a one-time password worked forever as long as Profile was never opened.
  it('sends a session that owes a password change to the profile screen', () => {
    expect(String(runPasswordGuard(true, '/dashboard'))).toBe('/profile');
    expect(String(runPasswordGuard(true, '/jobs/4/edit'))).toBe('/profile');
    expect(String(runPasswordGuard(true, '/admin/users'))).toBe('/profile');
  });

  // Redirecting the destination onto itself is a navigation that never settles.
  it('leaves the profile screen open, since that is where the password is changed', () => {
    expect(runPasswordGuard(true, '/profile')).toBe(true);
  });

  it('stays out of the way once nothing is owed', () => {
    expect(runPasswordGuard(false, '/dashboard')).toBe(true);
  });
});

describe('route table', () => {
  const walk = (rs: any[], visit: (route: any, path: string) => void, prefix = '') => {
    for (const r of rs) {
      const path = `${prefix}/${r.path ?? ''}`;
      visit(r, path);
      if (r.children) walk(r.children, visit, path);
    }
  };

  // The original bug: the role data was declared on children while the only guard sat on the
  // parent, so the check read a key that was never on its own snapshot and passed everyone.
  // A route that declares a minimum and does not run the guard itself is unprotected.
  it('runs roleGuard on every route that declares a minimum role', () => {
    const offenders: string[] = [];
    walk(routes, (r, path) => {
      if (r.data?.minRole && !(r.canActivate ?? []).includes(roleGuard)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it('only ever names one of the three roles as the minimum', () => {
    const offenders: string[] = [];
    walk(routes, (r, path) => {
      if (r.data?.minRole && !(r.data.minRole in ROLE_RANK)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it('keeps the admin-only routes matching the legacy app', () => {
    const byPath: Record<string, string> = {};
    walk(routes, r => { if (r.data?.minRole) byPath[r.path] = r.data.minRole; });
    expect(byPath['admin/tenants']).toBe('PLATFORM_ADMIN');
    expect(byPath['admin/tenant-requests']).toBe('PLATFORM_ADMIN');
    for (const p of ['admin/users', 'admin/storage', 'settings/lookup', 'settings/task-types',
                     'ai/models']) {
      expect(byPath[p]).toBe('TENANT_ADMIN');
    }
  });

  // Every endpoint these three reach is TENANT_ADMIN on the server, so reaching them as a
  // tenant user only ever ended in a 403 toast with the work already typed in.
  it('gates the task editor and the task bulk page on TENANT_ADMIN', () => {
    const byPath: Record<string, string> = {};
    walk(routes, r => { if (r.data?.minRole) byPath[r.path] = r.data.minRole; });
    for (const p of ['tasks/new', 'tasks/:taskDetailId/edit', 'tasks/bulk']) {
      expect(byPath[p]).toBe('TENANT_ADMIN');
    }
  });

  // Their read APIs are genuinely TENANT_USER; the writes are gated on the controls instead.
  it('leaves the task list and agents open', () => {
    const guarded: string[] = [];
    walk(routes, r => { if (r.data?.minRole) guarded.push(r.path); });
    for (const p of ['tasks', 'ai/agents', 'jobs/bulk']) {
      expect(guarded).not.toContain(p);
    }
  });

  // canActivateChild, not canActivate: a parent's canActivate does not run again while the
  // shell stays activated, so moving from one child to the next would go unchecked.
  it('runs the password gate on every child of the shell', () => {
    const shell = routes.find(r => r.path === '' && r.children);
    expect(shell?.canActivateChild).toContain(passwordChangeGuard);
    expect(shell?.canActivate).toContain(authGuard);
  });

  // Order carries the rule: the guarded route has to be tried first, or the redirect swallows
  // /login for everyone and nobody can ever sign in.
  it('keeps the sign-in form to visitors who are signed out', () => {
    const login = routes.filter(r => r.path === 'login');
    expect(login.length).toBe(2);
    expect(login[0].canMatch).toContain(anonymousOnly);
    expect(login[1].canMatch).toBeUndefined();
    expect(login[1].redirectTo).toBe('/dashboard');
  });
});
