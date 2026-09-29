import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, PLATFORM_SESSION_KEY } from './auth.service';
import { AuthUser, MANAGED_WRITE_REFUSAL, isManagedRefusal } from './auth.models';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

const STORAGE_KEY = 'etl_auth_user';

function token(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify({ sub: 'someone@example.com', appUserId: 7, ...claims }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.unsigned`;
}

function session(claims: Record<string, unknown>, extra: Partial<AuthUser> = {}): AuthUser {
  return { username: 'someone@example.com', userRole: (claims['userRole'] as never) ?? 'TENANT_ADMIN', appUserId: 7,
    accessToken: token(claims), refreshToken: 'refresh-' + JSON.stringify(claims).length, ...extra };
}

interface Call { url: string; body: unknown; auth: string | null }

function service(stored: AuthUser | null, held: AuthUser | null = null) {
  if (stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  if (held) localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify(held));
  const calls: Call[] = [];
  const navigated: unknown[][] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => ({ subscribe: () => undefined }),
      post: (url: string, body: unknown, options?: { headers?: HttpHeaders }) => {
        calls.push({ url, body, auth: options?.headers?.get('Authorization') ?? null });
        return of({ status: 'SUCCESS' });
      } } },
    { provide: Router, useValue: { navigate: (...args: unknown[]) => { navigated.push(args); return Promise.resolve(true); } } },
  ] });
  return { auth: TestBed.inject(AuthService), calls, navigated };
}

describe('MIG-254: the workspace management mode in the session', () => {
  useMemoryStorage();

  it('a workspace with no mode anywhere is SELF, and nothing is locked', () => {
    const { auth } = service(session({ userRole: 'TENANT_ADMIN', tenantId: 2924 }));
    expect(auth.managementMode()).toBe('SELF');
    expect(auth.builderLocked()).toBe(false);
    expect(auth.canBuild()).toBe(true);
    expect(auth.canManageTasks()).toBe(true);
    expect(auth.canManageAgents()).toBe(true);
  });

  it('a MANAGED token locks the builder for the workspace admin, and leaves users alone', () => {
    const { auth } = service(session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'MANAGED' }));
    expect(auth.managementMode()).toBe('MANAGED');
    expect(auth.builderLocked()).toBe(true);
    expect(auth.canBuild()).toBe(false);
    expect(auth.canManageTasks()).toBe(false);
    expect(auth.canManageAgents()).toBe(false);
    expect(auth.canManageUsers()).toBe(true);
    expect(auth.isTenantAdmin()).toBe(true);
  });

  it('a MANAGED token locks a member too (their schedules are builder writes)', () => {
    const { auth } = service(session({ userRole: 'TENANT_USER', tenantId: 2924, mgmt: 'MANAGED' }));
    expect(auth.builderLocked()).toBe(true);
    expect(auth.canBuild()).toBe(false);
  });

  it('falls back to the sign-in answer when the token has no claim', () => {
    const { auth } = service(session({ userRole: 'TENANT_ADMIN', tenantId: 2924 }, { managementMode: 'MANAGED' }));
    expect(auth.managementMode()).toBe('MANAGED');
  });

  it('the token wins over the stored answer', () => {
    const { auth } = service(session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'SELF' }, { managementMode: 'MANAGED' }));
    expect(auth.managementMode()).toBe('SELF');
    expect(auth.builderLocked()).toBe(false);
  });

  it('a staff session (msvc) in a MANAGED workspace builds: it is our team', () => {
    const { auth } = service(session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'MANAGED', msvc: true }));
    expect(auth.isManagedSession()).toBe(true);
    expect(auth.builderLocked()).toBe(false);
    expect(auth.canBuild()).toBe(true);
  });

  it('a platform administrator has no workspace, so no mode', () => {
    const { auth } = service(session({ userRole: 'PLATFORM_ADMIN' }));
    expect(auth.managementMode()).toBe('SELF');
    expect(auth.builderLocked()).toBe(false);
    expect(auth.isManagedSession()).toBe(false);
  });

  it('recognises the managed refusal by status and message only', () => {
    expect(isManagedRefusal({ status: 403, error: { message: MANAGED_WRITE_REFUSAL } })).toBe(true);
    expect(isManagedRefusal({ status: 403, error: { message: 'Access denied' } })).toBe(false);
    expect(isManagedRefusal({ status: 400, error: { message: MANAGED_WRITE_REFUSAL } })).toBe(false);
    expect(isManagedRefusal(null)).toBe(false);
  });
});

describe('MIG-254: a staff member working in a managed workspace', () => {
  useMemoryStorage();

  const platform = () => session({ userRole: 'PLATFORM_ADMIN' }, { fullName: 'Staff Member', appUserId: 7 });
  const managed = () => session({ userRole: 'TENANT_ADMIN', tenantId: 2924, mgmt: 'MANAGED', msvc: true },
    { tenantName: 'Claude Demo', managementMode: 'MANAGED', managedService: true, fullName: 'Staff Member' });

  it('entering holds the platform session aside and makes the managed one active', () => {
    const { auth } = service(platform());
    auth.enterManagedSession(managed());
    expect(auth.isManagedSession()).toBe(true);
    expect(auth.role()).toBe('TENANT_ADMIN');
    expect(auth.user()?.tenantName).toBe('Claude Demo');
    expect(auth.heldPlatformSession()).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLATFORM_SESSION_KEY)!).accessToken).toBe(platform().accessToken);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).accessToken).toBe(managed().accessToken);
  });

  it('does not enter from a session that is not a platform administrator', () => {
    const { auth } = service(session({ userRole: 'TENANT_ADMIN', tenantId: 2924 }));
    auth.enterManagedSession(managed());
    expect(auth.isManagedSession()).toBe(false);
    expect(localStorage.getItem(PLATFORM_SESSION_KEY)).toBeNull();
  });

  it('survives a reload: both sessions are read back', () => {
    const { auth } = service(managed(), platform());
    expect(auth.isManagedSession()).toBe(true);
    expect(auth.heldPlatformSession()).toBe(true);
  });

  it('exit revokes the managed tokens only and puts the platform session back', () => {
    const { auth, calls, navigated } = service(platform());
    auth.enterManagedSession(managed());
    auth.exitManagedSession();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/auth.json/logout');
    expect(calls[0].auth).toBe(`Bearer ${managed().accessToken}`);
    expect(calls[0].body).toEqual({ refreshToken: managed().refreshToken });
    expect(auth.isManagedSession()).toBe(false);
    expect(auth.role()).toBe('PLATFORM_ADMIN');
    expect(auth.heldPlatformSession()).toBe(false);
    expect(localStorage.getItem(PLATFORM_SESSION_KEY)).toBeNull();
    expect(navigated.at(-1)?.[0]).toEqual(['/administration/work-in-workspace']);
  });

  it('exit with no platform session held signs out', () => {
    const { auth, navigated } = service(managed());
    auth.exitManagedSession();
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigated.at(-1)?.[0]).toEqual(['/login']);
  });

  it('signing out in a managed session ends both sessions', () => {
    const { auth, calls } = service(platform());
    auth.enterManagedSession(managed());
    auth.logout();
    expect(calls.map(c => c.auth)).toEqual([`Bearer ${managed().accessToken}`, `Bearer ${platform().accessToken}`]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PLATFORM_SESSION_KEY)).toBeNull();
  });
});
