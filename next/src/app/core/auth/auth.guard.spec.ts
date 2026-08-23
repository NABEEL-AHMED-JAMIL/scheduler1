import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { roleGuard, authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { routes } from '../../app.routes';

/** Enough of a snapshot for a guard: it only ever reads `data` and `url`. */
const snapshotWith = (data: any) => ({ data, url: [] }) as any;

function runGuard(guard: any, role: string | null, data: any) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isLoggedIn: () => role !== null, role: () => role } },
      { provide: Router, useValue: { createUrlTree: (c: any[]) => ({ toString: () => c.join('/') }) as UrlTree } },
    ],
  });
  return TestBed.runInInjectionContext(() => guard(snapshotWith(data), {} as any));
}

describe('roleGuard', () => {
  it('sends a role that is not on the list to /unauthorized', () => {
    const result = runGuard(roleGuard, 'TENANT_USER', { roles: ['PLATFORM_ADMIN'] });
    expect(String(result)).toBe('/unauthorized');
  });

  it('lets a listed role through', () => {
    expect(runGuard(roleGuard, 'PLATFORM_ADMIN', { roles: ['PLATFORM_ADMIN'] })).toBe(true);
  });

  it('lets everyone through a route that names no roles', () => {
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

describe('route table', () => {
  // The original bug: `roles` was declared on children while the only guard sat on the
  // parent, so the check read a key that was never on its own snapshot and passed everyone.
  // A route that declares roles and does not run the guard itself is unprotected.
  it('runs roleGuard on every route that declares roles', () => {
    const offenders: string[] = [];
    const walk = (rs: any[], prefix = '') => {
      for (const r of rs) {
        const path = `${prefix}/${r.path ?? ''}`;
        if (r.data?.roles?.length && !(r.canActivate ?? []).includes(roleGuard)) {
          offenders.push(path);
        }
        if (r.children) walk(r.children, path);
      }
    };
    walk(routes);
    expect(offenders).toEqual([]);
  });

  it('keeps the admin-only routes matching the legacy app', () => {
    const byPath: Record<string, string[]> = {};
    const walk = (rs: any[]) => {
      for (const r of rs) {
        if (r.data?.roles) byPath[r.path] = r.data.roles;
        if (r.children) walk(r.children);
      }
    };
    walk(routes);
    expect(byPath['admin/tenants']).toEqual(['PLATFORM_ADMIN']);
    for (const p of ['admin/users', 'admin/storage', 'settings/lookup', 'settings/task-types', 'ai/models']) {
      expect(byPath[p]).toEqual(['PLATFORM_ADMIN', 'TENANT_ADMIN']);
    }
  });
});
