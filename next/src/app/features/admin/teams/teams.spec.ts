import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Team, TeamsApi } from '../../../core/teams/teams.api';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkflowsApi } from '../../workflows/workflows.api';
import { Teams } from './teams';

/** F4 (MIG-401): Administration › Teams -- an administrator makes teams and names leads; a lead changes members only. */

const WOUND: Team = {
  teamId: 6, tenantId: 1001, name: 'Wound care', description: 'Field nurses', status: 'ACTIVE', memberCount: 2, leadCount: 1,
  members: [{ appUserId: 41, teamRole: 'LEAD', fullName: 'Ana Lead' }, { appUserId: 42, teamRole: 'MEMBER', fullName: 'Ben Nurse' }],
};
const BILLING: Team = { teamId: 7, tenantId: 1001, name: 'Billing', status: 'ACTIVE', memberCount: 0, leadCount: 0, members: [] };

function mount(opts: { admin?: boolean; me?: number } = {}) {
  const api = {
    list: vi.fn(() => of({ status: API_SUCCESS, message: '', data: [WOUND, BILLING] })),
    create: vi.fn(() => of({ status: API_SUCCESS, message: 'Team "Intake" made.', data: { ...BILLING, teamId: 8, name: 'Intake' } })),
    addMember: vi.fn(() => of({ status: API_SUCCESS, message: 'Cara is in "Wound care" as member.', data: { ...WOUND, memberCount: 3,
      members: [...WOUND.members, { appUserId: 43, teamRole: 'MEMBER', fullName: 'Cara Clerk' }] } })),
    removeMember: vi.fn(() => throwError(() => ({ error: { message: 'Only a workspace administrator names a team\'s leads; its lead adds and removes members.' } }))),
    archive: vi.fn(), update: vi.fn(),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const dialog = { open: vi.fn(() => ({ closed: of(true) })) };
  const admin = opts.admin ?? true;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
    { provide: TeamsApi, useValue: api },
    { provide: WorkflowsApi, useValue: { colleagues: () => of({ status: API_SUCCESS, message: '', data: [
      { userId: 41, fullName: 'Ana Lead', username: 'ana@x' }, { userId: 42, fullName: 'Ben Nurse', username: 'ben@x' },
      { userId: 43, fullName: 'Cara Clerk', username: 'cara@x' }] }) } },
    { provide: ToastService, useValue: toast },
    { provide: Dialog, useValue: dialog },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
    { provide: AuthService, useValue: { isTenantAdmin: signal(admin), isPlatformAdmin: signal(false), user: signal({ appUserId: opts.me ?? 1 }) } },
  ] });
  const fixture = TestBed.createComponent(Teams);
  fixture.detectChanges();
  return { fixture, api, toast, el: fixture.nativeElement as HTMLElement };
}

function choose(el: HTMLElement, selector: string, value: string) {
  const select = el.querySelector(selector) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('Teams', () => {
  it('lists the teams with their leads, opens the first, and an administrator adds a person as a lead or member', () => {
    const { fixture, el, api } = mount();
    expect(el.querySelector('[data-team="6"]')!.textContent).toContain('Ana Lead');
    expect(el.querySelector('[data-team="7"]')!.textContent).toContain('No lead');
    expect(el.querySelector('[data-testid="members"]')!.textContent).toContain('Ben Nurse');
    const options = [...el.querySelectorAll('[data-testid="add-person"] option')].map(o => o.textContent!.trim());
    expect(options).toEqual(['Choose someone', 'Cara Clerk']);
    choose(el, '[data-testid="add-person"]', '43');
    choose(el, '[data-testid="add-role"]', 'LEAD');
    fixture.detectChanges();
    (el.querySelector('[data-testid="add"]') as HTMLButtonElement).click();
    expect(api.addMember).toHaveBeenCalledWith(6, 43, 'LEAD');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="members"]')!.textContent).toContain('Cara Clerk');
  });

  it('says a team without a lead is changed by an administrator only', () => {
    const { fixture, el } = mount();
    (el.querySelector('[data-team="7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="no-lead"]')).not.toBeNull();
  });

  it('makes a team', () => {
    const { fixture, el, api } = mount();
    (el.querySelector('[data-testid="new-team"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const name = el.querySelector('[data-testid="team-name"]') as HTMLInputElement;
    name.value = 'Intake';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('[data-testid="create-team"]') as HTMLButtonElement).click();
    expect(api.create).toHaveBeenCalledWith('Intake', '', null);
  });

  it('lets a lead add and remove members only, and says why a refusal came', async () => {
    const { fixture, el, api, toast } = mount({ admin: false, me: 41 });
    expect(el.querySelector('[data-testid="new-team"]')).toBeNull();
    expect(el.querySelector('[data-testid="add-role"]')).toBeNull();
    expect(el.querySelector('[data-role="42"]')).toBeNull();
    expect(el.querySelector('[data-remove="41"]'), 'never a lead').toBeNull();
    (el.querySelector('[data-remove="42"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api.removeMember).toHaveBeenCalledWith(6, 42);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('names a team\'s leads'));
    choose(el, '[data-testid="add-person"]', '43');
    fixture.detectChanges();
    (el.querySelector('[data-testid="add"]') as HTMLButtonElement).click();
    expect(api.addMember).toHaveBeenCalledWith(6, 43, 'MEMBER');
  });

  it('shows a member who leads nothing the teams, and nothing to change', () => {
    const { el } = mount({ admin: false, me: 42 });
    expect(el.querySelector('[data-testid="members"]')!.textContent).toContain('Ana Lead');
    expect(el.querySelector('[data-testid="add-member"]')).toBeNull();
    expect(el.querySelector('[data-remove="42"]')).toBeNull();
  });
});
