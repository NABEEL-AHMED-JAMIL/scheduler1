import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthUser, ROLE_RANK, UserRole } from './auth.models';
import { pageGuard } from './auth.guard';
import { PAGE_LABELS, isPageKey } from './page-keys';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

const STORAGE_KEY = 'etl_auth_user';

function tokenWithRole(role: string): string {
  const claims = { sub: 'someone@example.com', appUserId: 7, userRole: role };
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.unsigned`;
}

function storedUser(role: UserRole, pageKeys?: string[]): void {
  const user: Partial<AuthUser> = {
    username: 'someone@example.com',
    userRole: role,
    appUserId: 7,
    accessToken: tokenWithRole(role),
    refreshToken: 'refresh',
    pageKeys,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function service(): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => ({ subscribe: () => undefined }) } },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
    ],
  });
  return TestBed.inject(AuthService);
}

/**
 * The console's half of access profiles: canOpen, and the guard built on it.
 *
 * The server refuses the page's API calls regardless; these only decide what is worth
 * rendering. Two things they must get right: an admin is never restricted, and a session
 * with no page list at all -- one stored before profiles existed -- reads as unrestricted
 * rather than empty, or the upgrade would look like a break.
 */
describe('AuthService.canOpen', () => {
  useMemoryStorage();

  beforeEach(() => localStorage.clear());

  it('lets a tenant user open what their profile lists and nothing else', () => {
    storedUser('TENANT_USER', ['jobs', 'queue']);
    const auth = service();
    expect(auth.canOpen('jobs')).toBe(true);
    expect(auth.canOpen('reports')).toBe(false);
    expect(auth.canOpen('analytics')).toBe(false);
  });

  it('never restricts an admin, whatever the list says', () => {
    storedUser('TENANT_ADMIN', []);
    expect(service().canOpen('reports')).toBe(true);
    storedUser('PLATFORM_ADMIN', ['jobs']);
    expect(service().canOpen('analytics')).toBe(true);
  });

  it('reads a session with no page list as unrestricted', () => {
    storedUser('TENANT_USER', undefined);
    expect(service().canOpen('reports')).toBe(true);
  });

  it('reads an empty list as dashboard-only, not as missing', () => {
    storedUser('TENANT_USER', []);
    expect(service().canOpen('jobs')).toBe(false);
  });

  it('picks up a changed list from a token refresh through patchUser', () => {
    storedUser('TENANT_USER', ['jobs']);
    const auth = service();
    expect(auth.canOpen('reports')).toBe(false);
    auth.patchUser({ pageKeys: ['jobs', 'reports'] });
    expect(auth.canOpen('reports')).toBe(true);
    expect(auth.pageKeys()).toEqual(['jobs', 'reports']);
  });
});

describe('pageGuard', () => {
  const snapshotWith = (data: any) => ({ data, url: [] }) as any;

  function run(pageKeys: string[] | undefined, role: UserRole, data: any) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            hasAtLeast: (minimum: UserRole) => ROLE_RANK[role] >= ROLE_RANK[minimum],
            canOpen: (page: string) => ROLE_RANK[role] >= ROLE_RANK['TENANT_ADMIN'] || !pageKeys || pageKeys.includes(page),
          },
        },
        { provide: Router, useValue: { createUrlTree: (c: any[], extras?: any) =>
          ({ toString: () => c.join('/') + (extras?.queryParams?.page ? '?page=' + extras.queryParams.page : '') }) as UrlTree } },
      ],
    });
    return TestBed.runInInjectionContext(() => pageGuard(snapshotWith(data), {} as any));
  }

  it('sends a tenant user without the page to /unauthorized, naming the page', () => {
    expect(String(run(['jobs'], 'TENANT_USER', { pageKey: 'reports' }))).toBe('/unauthorized?page=reports');
  });

  it('lets a tenant user through a page they hold', () => {
    expect(run(['jobs', 'reports'], 'TENANT_USER', { pageKey: 'reports' })).toBe(true);
  });

  it('lets an admin through regardless', () => {
    expect(run([], 'TENANT_ADMIN', { pageKey: 'reports' })).toBe(true);
  });

  it('lets everyone through a route that names no page', () => {
    expect(run([], 'TENANT_USER', {})).toBe(true);
  });
});

describe('page catalogue', () => {
  it('knows every key it labels and nothing else', () => {
    for (const key of Object.keys(PAGE_LABELS)) expect(isPageKey(key)).toBe(true);
    expect(isPageKey('admin-users')).toBe(false);
    expect(isPageKey(null)).toBe(false);
  });
});
