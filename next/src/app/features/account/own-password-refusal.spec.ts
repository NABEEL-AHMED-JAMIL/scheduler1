import { describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { StorageService } from '../objects/storage.service';
import { Profile } from '../profile/profile';
import { AccountSecurity } from './account-security';
import { AccountSecurityApi } from './account-security.api';

const REUSED = 'You have used that password before. Choose one you have not used recently.';

/**
 * Identity answers a refused change of one's own password 400 now (it was 200 with status ERROR). Both screens that
 * change it -- Profile and Account security -- say the refusal under the password fields, in the server's words, and
 * not only as a toast.
 */
function providers(put: ReturnType<typeof vi.fn>, toast: { success: any; error: any; info: any }) {
  return [
    { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: null })), post: vi.fn(), put } },
    { provide: Dialog, useValue: {} },
    { provide: ToastService, useValue: toast },
    { provide: StorageService, useValue: {} },
    { provide: AccountSecurityApi, useValue: {} },
    { provide: AuthService, useValue: { canOpen: () => true, role: () => 'TENANT_USER', isLoggedIn: () => true, user: signal(null) } },
  ];
}

const refusal = () => throwError(() => new HttpErrorResponse({ status: 400, error: { status: 'ERROR', message: REUSED } }));

describe('Changing one\'s own password: a 400 refusal is said inline', () => {
  it('on Profile', () => {
    const put = vi.fn(refusal);
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers(put, toast) });
    const screen = TestBed.runInInjectionContext(() => new Profile());
    screen.currentPassword.set('the-current-one');
    screen.newPassword.set('Granite-Owl-7310');
    screen.changePassword();
    expect(put).toHaveBeenCalledTimes(1);
    expect(screen.passwordError()).toBe(REUSED);
    expect(screen.savingPassword()).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('on Account security', () => {
    const put = vi.fn(refusal);
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers(put, toast) });
    const screen = TestBed.runInInjectionContext(() => new AccountSecurity());
    screen.currentPassword.set('the-current-one');
    screen.newPassword.set('Granite-Owl-7310');
    screen.changePassword();
    expect(put).toHaveBeenCalledTimes(1);
    expect(screen.passwordError()).toBe(REUSED);
    expect(screen.savingPassword()).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
