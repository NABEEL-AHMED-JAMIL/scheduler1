import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AppUser, Users } from './users';
import { ResetPasswordDialog } from './reset-password-dialog';

const ROWS: AppUser[] = [
  { appUserId: 1, username: 'a@acme.test', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 10, lastLoginAt: '2026-09-01' } as AppUser,
  { appUserId: 2, username: 'b@acme.test', userRole: 'TENANT_USER', status: 'Inactive', tenantId: 10 } as AppUser,
  { appUserId: 3, username: 'c@globex.test', userRole: 'TENANT_USER', status: 'Active', tenantId: 20 } as AppUser,
];

function usersScreen(opened: any[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user: signal({ appUserId: 9000, userRole: 'PLATFORM_ADMIN' }), isPlatformAdmin: () => true } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: ROWS }), put: vi.fn(() => of({ status: 'SUCCESS', message: 'Reset.' })) } },
      { provide: Dialog, useValue: { open: (component: unknown, config: any) => { opened.push({ component, config }); return { closed: of(undefined) }; } } },
      { provide: ToastService, useValue: { success: () => {}, error: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Users());
  screen.ngOnInit();
  return screen;
}

describe('Users -- the KPI tiles follow the tenant filter', () => {
  it('counts only the picked tenant', () => {
    const screen = usersScreen();
    expect(screen.summary().total).toBe(3);
    screen.tenantFilter.set('10');
    expect(screen.summary()).toEqual(expect.objectContaining({ total: 2, active: 1, admins: 1, neverSignedIn: 1 }));
  });
});

describe('Users -- reset password is checked inside its dialog', () => {
  it('opens the reset dialog, not the generic text prompt', () => {
    const opened: any[] = [];
    const screen = usersScreen(opened);
    screen.resetPassword(ROWS[1]);
    expect(opened[0].component).toBe(ResetPasswordDialog);
  });

  function dialog() {
    const close = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: { name: 'b@acme.test' } },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    return { dialog: TestBed.runInInjectionContext(() => new ResetPasswordDialog()), close };
  }

  it('keeps a short password in the dialog with the field marked, rather than closing', () => {
    const { dialog: d, close } = dialog();
    d.form.setValue({ password: 'short' });
    d.submit();
    expect(close).not.toHaveBeenCalled();
    expect(d.submitted()).toBe(true);
    expect(d.form.get('password')!.hasError('minlength')).toBe(true);
  });

  it('hands back a long enough password', () => {
    const { dialog: d, close } = dialog();
    d.form.setValue({ password: 'long enough' });
    d.submit();
    expect(close).toHaveBeenCalledWith('long enough');
  });
});
