import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AccessDelegation } from '../../../core/auth/access-delegation';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccessGrants, actionLabel } from './access-grants';
import { AccessPerson, AccessProfilesService } from './access-profiles.service';

/** F3 (MIG-400): granting pages and tabs to a person, delegating, and the change log. */

const PEOPLE = [{ appUserId: 41, fullName: 'Ana Analyst', username: 'ana@x' }, { appUserId: 42, fullName: 'Ben Clerk', username: 'ben@x' }] as AccessPerson[];
const EFFECTIVE = {
  appUserId: 41, keys: ['jobs', 'jobs:schedules', 'reports'],
  pages: [
    { key: 'jobs', label: 'Schedules', open: true, tabs: [
      { key: 'jobs:schedules', label: 'Schedules & triggers', open: true, apiGated: false },
      { key: 'jobs:backfills', label: 'Backfills', open: false, apiGated: true }] },
    { key: 'reports', label: 'Run analytics', open: true, tabs: [] },
    { key: 'analytics', label: 'Analytics Studio', open: false, tabs: [] },
  ],
};

@Component({ imports: [AccessGrants], template: `<app-access-grants [people]="people()" (needPeople)="asked = asked + 1" />` })
class Host {
  readonly people = signal(PEOPLE);
  asked = 0;
}

function mount(delegate: unknown = null) {
  const api = {
    effective: vi.fn(() => of({ status: API_SUCCESS, message: '', data: EFFECTIVE })),
    grant: vi.fn(() => of({ status: API_SUCCESS, message: 'Backfills is now open for Ana Analyst.', data: {} })),
    delegates: vi.fn(() => of({ status: API_SUCCESS, message: '', data: [{ delegateId: 7, delegateUserId: 42, delegateName: 'Ben Clerk', scopePeople: 'LISTED',
      people: [41], scopeKeys: null, canAssignProfiles: true, expiresAt: '2027-01-19T12:00:00Z', reason: 'month-end', status: 'ACTIVE',
      grantedBy: 1, grantedAt: '2026-10-21T12:00:00Z' }] })),
    grantDelegation: vi.fn(() => of({ status: API_SUCCESS, message: 'Ben Clerk may grant access until 19 Jan 2027.', data: {} })),
    revokeDelegation: vi.fn(() => of({ status: API_SUCCESS, message: 'Delegation ended.', data: {} })),
    changes: vi.fn(() => of({ status: API_SUCCESS, message: '', data: [{ changeId: 1, actorUserId: 42, actorName: 'Ben Clerk', delegateId: 7, targetUserId: 41,
      targetName: 'Ana Analyst', action: 'TAB_GRANTED', key: 'jobs:backfills', before: 'profile', after: 'allowed', reason: 'month-end', expiresAt: null,
      at: '2026-10-21T20:00:00Z' }] })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: AccessProfilesService, useValue: api },
    { provide: ToastService, useValue: toast }, { provide: AccessDelegation, useValue: { isDelegate: () => !!delegate, mine: () => delegate } }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, api, toast, el: fixture.nativeElement as HTMLElement };
}

function choose(el: HTMLElement, selector: string, value: string) {
  const select = el.querySelector(selector) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('Grant pages and tabs', () => {
  it('shows a person\'s pages with their tabs, and opens one tab for 30 days with a reason', async () => {
    const { fixture, el, api } = mount();
    choose(el, '[data-testid="grant-days"]', '30');
    const reason = el.querySelector('[data-testid="grant-reason"]') as HTMLInputElement;
    reason.value = 'month-end close';
    reason.dispatchEvent(new Event('input'));
    choose(el, '[data-testid="grant-person"]', '41');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.effective).toHaveBeenCalledWith(41);
    const jobs = el.querySelector('[data-page="jobs"]')!;
    expect(jobs.textContent).toContain('Some tabs');
    expect(jobs.textContent).toContain('hides the tab');
    (el.querySelector('[data-tab="jobs:backfills"]') as HTMLInputElement).click();
    expect(api.grant).toHaveBeenCalledWith(41, 'jobs:backfills', true, 30, 'month-end close');
  });

  it('delegates to a member for a list of people, lists the delegations and ends one', async () => {
    const { fixture, el, api } = mount();
    (el.querySelector('[data-testid="view-delegates"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.asked).toBeGreaterThan(0);
    expect(el.querySelector('[data-testid="delegate-list"]')!.textContent).toContain('Ben Clerk');
    choose(el, '[data-testid="delegate-person"]', '42');
    choose(el, '[data-testid="delegate-scope"]', 'LISTED');
    fixture.detectChanges();
    (el.querySelector('[data-testid="delegate-people"] input') as HTMLInputElement).click();
    const why = el.querySelector('[data-testid="delegate-reason"]') as HTMLInputElement;
    why.value = 'the director grants their team';
    why.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('[data-testid="delegate-grant"]') as HTMLButtonElement).click();
    expect(api.grantDelegation).toHaveBeenCalledWith(expect.objectContaining({ delegateUserId: 42, scopePeople: 'LISTED', people: [41], days: 90,
      canAssignProfiles: true, reason: 'the director grants their team' }));
    fixture.detectChanges();
    (el.querySelector('[data-revoke="7"]') as HTMLButtonElement).click();
    expect(api.revokeDelegation).toHaveBeenCalledWith(7, 'Ended on Page access', null);
  });

  it('shows a delegate only what they may grant, no Delegates view, and their own changes', async () => {
    const { fixture, el, api } = mount({ delegateId: 7, grantableKeys: ['jobs', 'jobs:schedules', 'jobs:backfills'], scopePeople: 'LISTED', people: [41] });
    expect(el.querySelector('[data-testid="view-delegates"]')).toBeNull();
    choose(el, '[data-testid="grant-person"]', '41');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-page="jobs"]')).not.toBeNull();
    expect(el.querySelector('[data-page="analytics"]')).toBeNull();
    expect(el.querySelector('[data-page="reports"]')).toBeNull();
    (el.querySelector('[data-testid="view-changes"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.changes).toHaveBeenCalled();
    const log = el.querySelector('[data-testid="change-log"]')!.textContent!;
    expect(log).toContain('Opened a tab');
    // Owner 2026-10-27: the tab by its menu name, never its key.
    expect(log).toContain('Schedules › Backfills');
    expect(log).not.toContain('jobs:backfills');
    expect(log).toContain("Delegate");
  });

  it('says each change in words', () => {
    expect(actionLabel('DELEGATION_REVOKED')).toBe('Ended a delegation');
    expect(actionLabel('PROFILE_ASSIGNED')).toBe('Moved to a profile');
  });

  it('names the two-factor rule changes in the change log (MIG-424)', () => {
    expect(actionLabel('PROFILE_TWO_FACTOR')).toBe('Changed a profile\'s two-factor rule');
    expect(actionLabel('WORKSPACE_TWO_FACTOR')).toBe('Changed the workspace\'s two-factor rule');
  });
});
