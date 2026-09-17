import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { UserRole } from '../../../core/auth/auth.models';
import { ToastService } from '../../../shared/ui/toast.service';
import { AppUser, Users } from './users';
import { UserDialog } from './user-dialog';
import { AccessProfilesService } from '../access-profiles/access-profiles.service';

/**
 * What the users screen offers has to be what the server will accept.
 *
 * AppUserServiceImpl.scopedFind lets a tenant admin reach the tenant users in its workspace and
 * its own row, and nothing else; addUser and updateUser let it grant TENANT_USER and nothing
 * else. Offering more than that costs an administrator the whole form and answers with a
 * refusal about a row they are looking at, so these are the two places the console has to agree.
 *
 * updateUser adds one rule that binds every actor including a platform admin: on your own row,
 * "You cannot change your own role" refuses any value but the one already held.
 */

const ACTING_ID = 9000;

function authFor(role: UserRole) {
  const user = signal({ appUserId: ACTING_ID, username: 'me@example.com', userRole: role });
  return { user, isPlatformAdmin: () => role === 'PLATFORM_ADMIN' };
}

function usersFor(role: UserRole): Users {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: authFor(role) },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [] }) } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Users());
}

function rowFor(appUserId: number, userRole: string): AppUser {
  return { appUserId, username: 'someone@example.com', userRole, status: 'Active', tenantId: 1 };
}

function dialogFor(role: UserRole, user?: Record<string, unknown>, accessProfiles: unknown[] = []): UserDialog {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: authFor(role) },
      { provide: DIALOG_DATA, useValue: { user, tenants: [], canPickTenant: role === 'PLATFORM_ADMIN', accessProfiles } },
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: HttpClient, useValue: { post: () => of({}), put: () => of({}), get: () => of({ status: 'SUCCESS', message: '', data: [] }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new UserDialog());
}

const grantable = (dialog: UserDialog) => dialog.roles().map(option => option.value);

describe('Users row actions', () => {
  it('lets a tenant admin act on a tenant user in its workspace', () => {
    expect(usersFor('TENANT_ADMIN').canManage(rowFor(88, 'TENANT_USER'))).toBe(true);
  });

  it('offers a tenant admin nothing on a peer administrator, which the server refuses', () => {
    expect(usersFor('TENANT_ADMIN').canManage(rowFor(77, 'TENANT_ADMIN'))).toBe(false);
  });

  it('keeps a tenant admin able to edit its own row, admin role and all', () => {
    expect(usersFor('TENANT_ADMIN').canManage(rowFor(ACTING_ID, 'TENANT_ADMIN'))).toBe(true);
  });

  it('leaves every row open to a platform admin, peers included', () => {
    const users = usersFor('PLATFORM_ADMIN');
    expect(users.canManage(rowFor(77, 'TENANT_ADMIN'))).toBe(true);
    expect(users.canManage(rowFor(78, 'PLATFORM_ADMIN'))).toBe(true);
    expect(users.canManage(rowFor(79, 'TENANT_USER'))).toBe(true);
  });
});

describe('UserDialog role picker', () => {
  it('offers a tenant admin only the role it can grant', () => {
    expect(grantable(dialogFor('TENANT_ADMIN'))).toEqual(['TENANT_USER']);
  });

  // Resubmitting the role you already hold is not a change and the server allows it, so the
  // field stays readable while you edit your own name -- but it is the only value on offer.
  it('offers a tenant admin only its own role on its own row', () => {
    expect(grantable(dialogFor('TENANT_ADMIN', { appUserId: ACTING_ID, userRole: 'TENANT_ADMIN' })))
      .toEqual(['TENANT_ADMIN']);
  });

  // The same rule, and the one a role-based filter alone would miss: nothing about being a
  // platform admin lets you post a different role onto your own row.
  it('offers a platform admin only its own role on its own row', () => {
    expect(grantable(dialogFor('PLATFORM_ADMIN', { appUserId: ACTING_ID, userRole: 'PLATFORM_ADMIN' })))
      .toEqual(['PLATFORM_ADMIN']);
  });

  it('offers a platform admin all three', () => {
    expect(grantable(dialogFor('PLATFORM_ADMIN')))
      .toEqual(['TENANT_USER', 'TENANT_ADMIN', 'PLATFORM_ADMIN']);
  });

  it('offers a platform admin all three on somebody else, whatever they are now', () => {
    expect(grantable(dialogFor('PLATFORM_ADMIN', { appUserId: 77, userRole: 'TENANT_ADMIN' })))
      .toEqual(['TENANT_USER', 'TENANT_ADMIN', 'PLATFORM_ADMIN']);
  });
});

/**
 * The access-profile picker in the user dialog: offered for a tenant user when the workspace
 * has profiles, and never for an admin -- a profile means nothing on one.
 */
describe('UserDialog access profile picker', () => {
  const profiles = [
    { pageAccessProfileId: 1, profileName: 'Operator', defaultProfile: true, pageKeys: ['jobs'], userCount: 0 },
    { pageAccessProfileId: 2, profileName: 'Analyst', defaultProfile: false, pageKeys: ['jobs', 'reports'], userCount: 0 },
  ];

  it('offers the picker for a tenant user when profiles exist, naming the default', () => {
    const dialog = dialogFor('TENANT_ADMIN', undefined, profiles);
    expect(dialog.offersProfile()).toBe(true);
    expect(dialog.defaultProfileName()).toBe('Operator');
    expect(dialog.form.get('pageAccessProfileId')!.value).toBeNull();
  });

  it('hides the picker when the workspace has no profiles yet', () => {
    expect(dialogFor('TENANT_ADMIN', undefined, []).offersProfile()).toBe(false);
  });

  it('hides the picker as soon as the role is an admin one', () => {
    const dialog = dialogFor('PLATFORM_ADMIN', undefined, profiles);
    dialog.form.get('userRole')!.setValue('TENANT_ADMIN');
    expect(dialog.offersProfile()).toBe(false);
  });

  it('fetches the picked workspace\'s profiles for a platform admin', () => {
    const dialog = dialogFor('PLATFORM_ADMIN', undefined, []);
    const api = TestBed.inject(AccessProfilesService) as any;
    api.list = vi.fn((tenantId: number) => of({ status: 'SUCCESS', message: '', data: tenantId === 7 ? profiles : [] }));
    dialog.form.get('tenantId')!.setValue(7);
    expect(api.list).toHaveBeenCalledWith(7);
    expect(dialog.accessProfiles().map((p: any) => p.profileName)).toEqual(['Operator', 'Analyst']);
    expect(dialog.offersProfile()).toBe(true);
    dialog.form.get('tenantId')!.setValue(null);
    expect(dialog.accessProfiles()).toEqual([]);
  });

  it('starts an edit on the profile the person already holds', () => {
    const dialog = dialogFor('TENANT_ADMIN', { appUserId: 44, userRole: 'TENANT_USER', tenantId: 1, pageAccessProfileId: 2 }, profiles);
    expect(dialog.form.get('pageAccessProfileId')!.value).toBe(2);
  });
});
