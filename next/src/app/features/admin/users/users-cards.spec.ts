import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccountSecurityApi } from '../../account/account-security.api';
import { AppUser, USER_CARDS, Users, cardHolds } from './users';

/**
 * Owner 2026-10-19 #30: the Users screen's cards -- total, active, deactivated, invited, locked, 2FA on and off, single
 * sign-on, administrators and members, signed in in 30 days, never signed in -- counted by the same rule that filters
 * the list when a card is pressed.
 */
const NOW = Date.parse('2026-10-19T12:00:00Z');
const ROWS: AppUser[] = [
  { appUserId: 1, username: 'admin@w.test', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 10, lastLoginAt: '2026-10-18T09:00:00' },
  { appUserId: 2, username: 'new@w.test', userRole: 'TENANT_USER', status: 'Active', tenantId: 10, mustChangePassword: true },
  { appUserId: 3, username: 'sso@w.test', userRole: 'TENANT_USER', status: 'Active', tenantId: 10, lastLoginAt: '2026-08-01T09:00:00' },
  { appUserId: 4, username: 'off@w.test', userRole: 'TENANT_USER', status: 'Inactive', tenantId: 10, lastLoginAt: '2026-10-01T09:00:00' },
  { appUserId: 5, username: 'other@x.test', userRole: 'TENANT_USER', status: 'Active', tenantId: 20 },
];
const STANDING: Record<string, any> = {
  '1': { lockedUntil: null, mfaEnabled: true, signIns30d: 9, lastSignInMethod: 'MFA' },
  '3': { lockedUntil: '2026-10-19T13:00:00Z', mfaEnabled: false, signIns30d: 0, lastSignInMethod: 'SAML' },
  '4': { lockedUntil: null, mfaEnabled: false, signIns30d: 2, lastSignInMethod: 'SSO' },
};

function screen() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user: signal({ appUserId: 1, userRole: 'TENANT_ADMIN' }), isPlatformAdmin: () => false } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: ROWS }) } },
      { provide: AccountSecurityApi, useValue: { people: () => of({ status: 'SUCCESS', message: '', data: STANDING }) } },
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

describe('Users cards', () => {
  it('counts each kind of person by one rule', () => {
    const count = (key: Parameters<typeof cardHolds>[0]) => ROWS.filter(u => cardHolds(key, u, STANDING[String(u.appUserId)], NOW)).length;
    expect(count('all')).toBe(5);
    expect(count('active')).toBe(4);
    expect(count('inactive')).toBe(1);
    expect(count('invited')).toBe(1);
    expect(count('locked')).toBe(1);
    expect(count('mfa')).toBe(1);
    expect(count('noMfa')).toBe(4);
    expect(count('sso')).toBe(2);
    expect(count('admins')).toBe(1);
    expect(count('members')).toBe(4);
    expect(count('recent')).toBe(2);
    expect(count('never')).toBe(2);
  });

  it('draws twelve cards, every one a pressable filter, "People" pressed while nothing narrows the list', () => {
    const users = screen();
    const cards = users.cards();
    expect(cards.map(c => c.label)).toEqual(USER_CARDS.map(c => c.label));
    expect(cards).toHaveLength(12);
    expect(cards.every(c => c.clickable)).toBe(true);
    expect(cards.find(c => c.label === 'People')).toEqual(expect.objectContaining({ value: 5, pressed: true }));
    expect(cards.find(c => c.label === 'Locked')).toEqual(expect.objectContaining({ value: 1, pressed: false }));
  });

  it('narrows the list to a card when it is pressed, and back when it is pressed again or People is', () => {
    const users = screen();
    users.pickCard(users.cards().find(c => c.label === 'Single sign-on')!);
    expect(users.filtered().map(u => u.appUserId).sort()).toEqual([3, 4]);
    expect(users.hasFilters()).toBe(true);
    expect(users.cards().find(c => c.label === 'Single sign-on')!.pressed).toBe(true);
    users.pickCard(users.cards().find(c => c.label === 'Single sign-on')!);
    expect(users.filtered()).toHaveLength(5);
    users.pickCard(users.cards().find(c => c.label === 'Invited')!);
    expect(users.filtered().map(u => u.appUserId)).toEqual([2]);
    users.clearFilters();
    expect(users.cardFilter()).toBe('');
  });

  it('counts only the workspace the list is narrowed to', () => {
    const users = screen();
    users.tenantFilter.set('20');
    expect(users.cards().find(c => c.label === 'People')!.value).toBe(1);
  });
});
