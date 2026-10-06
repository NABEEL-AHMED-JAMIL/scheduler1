import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { UserDialog } from './user-dialog';

/**
 * MIG-274: a person's manager -- whom "their manager" workflow steps and escalations go to -- is picked from the
 * active people of the same workspace, never the person themself or a platform administrator.
 */
const PEOPLE = [
  { appUserId: 1, fullName: 'Sam Reviewer', username: 'sam@x', tenantId: 2924, userRole: 'TENANT_ADMIN', status: 'Active', position: 'Team Lead' },
  { appUserId: 2, fullName: 'Alex', username: 'alex@x', tenantId: 2924, userRole: 'TENANT_USER', status: 'Active' },
  { appUserId: 3, fullName: 'Gone', username: 'gone@x', tenantId: 2924, userRole: 'TENANT_USER', status: 'Inactive' },
  { appUserId: 4, fullName: 'Elsewhere', username: 'else@x', tenantId: 4414, userRole: 'TENANT_USER', status: 'Active' },
  { appUserId: 5, fullName: 'Root', username: 'root@x', tenantId: null, userRole: 'PLATFORM_ADMIN', status: 'Active' },
];

function dialogFor(user: object | undefined) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user: signal({ appUserId: 9000, userRole: 'TENANT_ADMIN' }), isPlatformAdmin: () => false } },
      { provide: DIALOG_DATA, useValue: { user, tenants: [], canPickTenant: false, accessProfiles: [], people: PEOPLE } },
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: HttpClient, useValue: { post: () => of({}), put: () => of({}), get: () => of({ status: 'SUCCESS', message: '', data: [] }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new UserDialog());
}

describe('The user form\'s Manager', () => {
  it('offers the active people of the same workspace, not the person, not a platform administrator', () => {
    const dialog = dialogFor({ appUserId: 2, username: 'alex@x', userRole: 'TENANT_USER', tenantId: 2924, managerId: 1 });
    expect(dialog.managerOptions().map(o => o.label)).toEqual(['Sam Reviewer']);
    expect(dialog.managerOptions()[0]).toMatchObject({ value: '1', hint: 'Team Lead' });
    expect(dialog.form.getRawValue().managerId).toBe(1);
  });

  it('sends no manager when the picker is cleared, which is how it is removed', () => {
    const dialog = dialogFor({ appUserId: 2, username: 'alex@x', userRole: 'TENANT_USER', tenantId: 2924, managerId: 1 });
    dialog.form.get('managerId')!.setValue(null);
    expect(dialog.form.getRawValue().managerId).toBeNull();
  });
});
