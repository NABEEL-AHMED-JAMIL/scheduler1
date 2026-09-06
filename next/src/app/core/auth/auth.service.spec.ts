import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthUser, UserRole } from './auth.models';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

const STORAGE_KEY = 'etl_auth_user';

/**
 * A token shaped like the server's, carrying only the claim the client reads. Nothing here is
 * signed and nothing needs to be: the browser never verifies the signature, it only reads the
 * payload, and the server checks the real one on every call.
 */
function tokenWithRole(role: string | null): string {
  const claims: Record<string, unknown> = { sub: 'someone@example.com', appUserId: 7 };
  if (role !== null) claims['userRole'] = role;
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.unsigned`;
}

function storedUser(claimedRole: string, tokenRole: string | null): void {
  const user: Partial<AuthUser> = {
    username: 'someone@example.com',
    userRole: claimedRole as UserRole,
    appUserId: 7,
    accessToken: tokenWithRole(tokenRole),
    refreshToken: 'refresh',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function service(): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      // The avatar effect is the only thing that reaches for either of these.
      { provide: HttpClient, useValue: { get: () => ({ subscribe: () => undefined }) } },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
    ],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService.role', () => {
  useMemoryStorage();

  it('reads the role from the access token', () => {
    storedUser('TENANT_ADMIN', 'TENANT_ADMIN');
    expect(service().role()).toBe('TENANT_ADMIN');
  });

  // The escalation this closes: the stored blob is editable from devtools, and promoting
  // yourself in it used to unfold the whole platform-admin menu.
  it('ignores a stored role the token does not agree with', () => {
    storedUser('PLATFORM_ADMIN', 'TENANT_USER');
    const auth = service();
    expect(auth.role()).toBe('TENANT_USER');
    expect(auth.isPlatformAdmin()).toBe(false);
    expect(auth.isTenantAdmin()).toBe(false);
  });

  it('grants nothing when the token cannot be read', () => {
    storedUser('PLATFORM_ADMIN', null);
    expect(service().role()).toBeNull();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      username: 'someone@example.com', userRole: 'PLATFORM_ADMIN', appUserId: 7,
      accessToken: 'not-a-token', refreshToken: 'refresh',
    }));
    expect(service().role()).toBeNull();
  });

  it('refuses a role the server does not issue', () => {
    storedUser('TENANT_USER', 'SUPER_ADMIN');
    expect(service().role()).toBeNull();
  });

  it('has no role at all when nobody is signed in', () => {
    const auth = service();
    expect(auth.role()).toBeNull();
    expect(auth.hasAtLeast('TENANT_USER')).toBe(false);
  });
});

describe('AuthService.hasAtLeast', () => {
  useMemoryStorage();

  it('reads the hierarchy downwards, as the server does', () => {
    storedUser('PLATFORM_ADMIN', 'PLATFORM_ADMIN');
    const platform = service();
    expect(platform.hasAtLeast('PLATFORM_ADMIN')).toBe(true);
    expect(platform.hasAtLeast('TENANT_ADMIN')).toBe(true);
    expect(platform.hasAtLeast('TENANT_USER')).toBe(true);

    storedUser('TENANT_ADMIN', 'TENANT_ADMIN');
    const tenantAdmin = service();
    expect(tenantAdmin.hasAtLeast('PLATFORM_ADMIN')).toBe(false);
    expect(tenantAdmin.hasAtLeast('TENANT_ADMIN')).toBe(true);
    expect(tenantAdmin.canManageTasks()).toBe(true);
    expect(tenantAdmin.canManageTenants()).toBe(false);

    storedUser('TENANT_USER', 'TENANT_USER');
    const tenantUser = service();
    expect(tenantUser.hasAtLeast('TENANT_ADMIN')).toBe(false);
    expect(tenantUser.hasAtLeast('TENANT_USER')).toBe(true);
    expect(tenantUser.canManageTasks()).toBe(false);
    expect(tenantUser.canManageAgents()).toBe(false);
  });
});

describe('AuthService.mustChangePassword', () => {
  useMemoryStorage();

  function storedUserOwing(owes: boolean): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      username: 'someone@example.com', userRole: 'TENANT_USER', appUserId: 7,
      accessToken: tokenWithRole('TENANT_USER'), refreshToken: 'refresh',
      mustChangePassword: owes,
    }));
  }

  it('reports the debt the sign-in response carried', () => {
    storedUserOwing(true);
    expect(service().mustChangePassword()).toBe(true);
  });

  // An older session was stored before the field existed, and an account that owes nothing
  // omits it: neither is a debt.
  it('treats a missing flag as nothing owed', () => {
    storedUserOwing(false);
    expect(service().mustChangePassword()).toBe(false);

    storedUser('TENANT_USER', 'TENANT_USER');
    expect(service().mustChangePassword()).toBe(false);
  });

  // Persisted, not just held in the signal: a reload otherwise brings the debt back and pins
  // the session to the profile screen again.
  it('clears the debt for good once the password has been changed', () => {
    storedUserOwing(true);
    const auth = service();
    auth.passwordChanged();
    expect(auth.mustChangePassword()).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mustChangePassword).toBe(false);
  });
});
