import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccountSecurityApi } from '../../account/account-security.api';
import { AppUser, Users } from './users';

/**
 * Owner 2026-10-27: Users on the shared column sort (by name A to Z until a heading is picked, as before), cards that wait
 * for the answer, and a failed standing read that is said rather than read as "nobody is locked".
 */
const ROWS: AppUser[] = [
  { appUserId: 1, username: 'b@w.test', fullName: 'bea Admin', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 10, lastLoginAt: '2026-10-18 09:00:00' },
  { appUserId: 2, username: 'a@w.test', fullName: 'Ada Member', userRole: 'TENANT_USER', status: 'Active', tenantId: 10, lastLoginAt: '2026-10-20T09:00:00Z' },
  { appUserId: 3, username: 'c@w.test', fullName: 'Cy Member', userRole: 'TENANT_USER', status: 'Inactive', tenantId: 10 },
];

function screen(list: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: ROWS }),
                people: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: {} })) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user: signal({ appUserId: 1, userRole: 'TENANT_ADMIN' }), isPlatformAdmin: () => false } },
      { provide: HttpClient, useValue: { get: (url: string) => (url.includes('listUsers') ? list() : of({ status: 'SUCCESS', message: '', data: [] })) } },
      { provide: AccountSecurityApi, useValue: { people } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => 1, error: () => 1, dismiss: () => {} } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
    ],
  });
  const users = TestBed.runInInjectionContext(() => new Users());
  users.ngOnInit();
  return users;
}

describe('Users -- sorting', () => {
  it('starts by name A to Z (case does not matter), then sorts by last sign-in, newest first, and back', () => {
    const users = screen();
    expect(users.paged().map(u => u.appUserId)).toEqual([2, 1, 3]);
    users.sort.toggle('lastLoginAt');
    // Never signed in goes last both ways.
    expect(users.paged().map(u => u.appUserId)).toEqual([2, 1, 3]);
    users.sort.toggle('lastLoginAt');
    expect(users.paged().map(u => u.appUserId)).toEqual([1, 2, 3]);
  });

  it('sorts the role by its rank, the highest first on the first click', () => {
    const users = screen();
    users.sort.toggle('userRole');
    expect(users.paged()[0].userRole).toBe('TENANT_ADMIN');
    users.sort.toggle('userRole');
    expect(users.paged()[0].userRole).toBe('TENANT_USER');
  });
});

describe('Users -- loading, empty, error', () => {
  it('is loading, with no "No users yet" and the standing cards not known, until the list answers', () => {
    const users = screen(() => NEVER, () => NEVER);
    expect(users.loading()).toBe(true);
    expect(users.loaded()).toBe(false);
    expect(users.cards().find(c => c.label === 'Locked')!.value).toBe('—');
  });

  it('is empty once an empty list answers', () => {
    const users = screen(() => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(users.loading()).toBe(false);
    expect(users.loaded()).toBe(true);
    expect(users.paged()).toEqual([]);
  });

  it('says the list could not be read, in plain words, and a failed standing read is not "Locked 0"', () => {
    const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
    const users = screen(failed, failed);
    expect(users.loading()).toBe(false);
    expect(users.error()).toBe('Could not load users.');
    expect(users.standingError()).toBe('Locks and two-factor could not be read.');
    expect(users.cards().find(c => c.label === 'Locked')!.foot).toBe('not available right now');
  });
});
