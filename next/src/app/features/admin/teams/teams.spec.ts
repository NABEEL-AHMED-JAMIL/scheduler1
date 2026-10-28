import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Team, TeamsApi } from '../../../core/teams/teams.api';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkflowsApi } from '../../workflows/workflows.api';
import { Teams } from './teams';
import { TeamUsage, TeamUsageReader } from './teams-usage';

/**
 * F4 (MIG-401): Administration › Teams -- an administrator makes teams and names leads; a lead changes members only.
 * UX2 (2026-10-26): the teams are a table (search, lead / member / status filters, avatar stacks, where each is used) and
 * a row opens its team in the side panel over the right, where every one of those rules still holds.
 */

const WOUND: Team = {
  teamId: 6, tenantId: 1001, name: 'Wound care', description: 'Field nurses', status: 'ACTIVE', memberCount: 2, leadCount: 1,
  createdAt: '2026-10-21T15:00:00Z',
  members: [{ appUserId: 41, teamRole: 'LEAD', fullName: 'Ana Lead' }, { appUserId: 42, teamRole: 'MEMBER', fullName: 'Ben Nurse' }],
};
const BILLING: Team = { teamId: 7, tenantId: 1001, name: 'Billing', status: 'ACTIVE', memberCount: 0, leadCount: 0, members: [] };
const OLD: Team = { teamId: 5, tenantId: 1001, name: 'Old intake', status: 'ARCHIVED', memberCount: 1, leadCount: 0,
  members: [{ appUserId: 42, teamRole: 'MEMBER', fullName: 'Ben Nurse' }] };

const FULL_USAGE: TeamUsage = {
  known: ['workflow', 'approval', 'alert', 'reports'],
  byTeam: new Map([[6, [
    { kind: 'workflow', label: 'Wound follow-up', link: '/workflows/designer', queryParams: { key: 'wound-follow-up' } },
    { kind: 'approval', label: 'Leave request › Manager approval', link: '/workflows/designer', queryParams: { key: 'leave' } },
    { kind: 'approval', label: 'Supply order › Charge nurse', link: '/workflows/designer', queryParams: { key: 'supply' } },
    { kind: 'alert', label: 'Runs failed', link: '/settings/alerts' },
    { kind: 'reports', label: 'Report Studio reviewers', link: '/reports/settings' },
  ]]]),
};

function mount(opts: { admin?: boolean; me?: number; teams?: Team[]; usage?: TeamUsage; query?: Record<string, string>;
  listAnswer?: () => Observable<unknown>; usageAnswer?: () => Observable<TeamUsage> } = {}) {
  const admin = opts.admin ?? true;
  const teams = opts.teams ?? [WOUND, BILLING];
  const api = {
    list: vi.fn((_t: unknown, withArchived: boolean) => opts.listAnswer?.() ?? of({ status: API_SUCCESS, message: '', data: withArchived ? [...teams, OLD] : teams })),
    create: vi.fn(() => of({ status: API_SUCCESS, message: 'Team "Intake" made.', data: { ...BILLING, teamId: 8, name: 'Intake' } })),
    addMember: vi.fn(() => of({ status: API_SUCCESS, message: 'Cara is in "Wound care" as member.', data: { ...WOUND, memberCount: 3,
      members: [...WOUND.members, { appUserId: 43, teamRole: 'MEMBER', fullName: 'Cara Clerk' }] } })),
    removeMember: vi.fn(() => throwError(() => ({ error: { message: 'Only a workspace administrator names a team\'s leads; its lead adds and removes members.' } }))),
    archive: vi.fn(() => of({ status: API_SUCCESS, message: 'Team archived.', data: { ...WOUND, status: 'ARCHIVED' } })),
    update: vi.fn(),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: TeamsApi, useValue: api },
    { provide: WorkflowsApi, useValue: { colleagues: () => of({ status: API_SUCCESS, message: '', data: [
      { userId: 41, fullName: 'Ana Lead', username: 'ana@x' }, { userId: 42, fullName: 'Ben Nurse', username: 'ben@x' },
      { userId: 43, fullName: 'Cara Clerk', username: 'cara@x' }] }) } },
    { provide: TeamUsageReader, useValue: { read: () => opts.usageAnswer?.() ?? of(opts.usage ?? FULL_USAGE) } },
    { provide: ToastService, useValue: toast },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(opts.query ?? {}) } } },
    { provide: AuthService, useValue: { isTenantAdmin: signal(admin), isPlatformAdmin: signal(false), user: signal({ appUserId: opts.me ?? 1 }),
      canOpen: () => true } },
  ] });
  const fixture = TestBed.createComponent(Teams);
  fixture.detectChanges();
  return { fixture, api, toast, el: fixture.nativeElement as HTMLElement };
}

/** The side panel opens in the overlay, outside the page's element. */
const panel = () => document.querySelector('.cdk-overlay-container app-side-panel') as HTMLElement | null;
const inPanel = (selector: string) => panel()?.querySelector(selector) as HTMLElement | null;

function choose(root: ParentNode, selector: string, value: string) {
  const select = root.querySelector(selector) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function openRow(fixture: { detectChanges(): void }, el: HTMLElement, teamId: number) {
  (el.querySelector(`[data-team="${teamId}"]`) as HTMLButtonElement).click();
  fixture.detectChanges();
}

/** A confirm dialog's answer: its danger (or primary) button. */
async function confirmIt(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges();
  const yes = document.querySelector('.cdk-overlay-container app-confirm .btn-danger') as HTMLButtonElement;
  expect(yes, 'a destructive confirm is a btn-danger').not.toBeNull();
  yes.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

afterEach(() => document.querySelector('.cdk-overlay-container')?.replaceChildren());

describe('Teams', () => {
  it('lists the teams in a table with their lead, members and count, and a row opens the team in the side panel', () => {
    const { fixture, el, api } = mount();
    expect(el.querySelector('[data-row="6"]')!.textContent).toContain('Ana Lead');
    expect(el.querySelector('[data-row="7"]')!.textContent).toContain('No lead');
    expect(el.querySelector('[data-count="6"]')!.textContent).toContain('2 people');
    expect(el.querySelectorAll('[data-row="6"] .avatar-stack app-avatar').length).toBe(2);
    expect(el.querySelector('app-table-shell h2')!.textContent).toContain('(2 of 2)');
    expect(panel(), 'nothing opens by itself').toBeNull();

    openRow(fixture, el, 6);
    expect(panel()!.textContent).toContain('Wound care');
    expect(inPanel('[data-testid="members"]')!.textContent).toContain('Ben Nurse');
    const options = [...panel()!.querySelectorAll('[data-testid="add-person"] option')].map(o => o.textContent!.trim());
    expect(options).toEqual(['Choose someone', 'Cara Clerk']);
    choose(panel()!, '[data-testid="add-person"]', '43');
    choose(panel()!, '[data-testid="add-role"]', 'LEAD');
    fixture.detectChanges();
    inPanel('[data-testid="add"]')!.click();
    expect(api.addMember).toHaveBeenCalledWith(6, 43, 'LEAD');
    fixture.detectChanges();
    expect(inPanel('[data-testid="members"]')!.textContent).toContain('Cara Clerk');
  });

  it('says a team without a lead is changed by an administrator only', () => {
    const { fixture, el } = mount();
    openRow(fixture, el, 7);
    expect(inPanel('[data-testid="no-lead"]')).not.toBeNull();
    expect(inPanel('[data-testid="no-lead"]')!.textContent).toContain('only an administrator changes who is in it');
  });

  it('makes a team from New team, in the side panel', () => {
    const { fixture, el, api } = mount();
    (el.querySelector('[data-testid="new-team"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(panel()!.textContent).toContain('New team');
    const name = inPanel('[data-testid="team-name"]') as HTMLInputElement;
    name.value = 'Intake';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    inPanel('[data-testid="create-team"]')!.click();
    expect(api.create).toHaveBeenCalledWith('Intake', '');
  });

  it('lets a lead add and remove members only, and says why a refusal came', async () => {
    const { fixture, el, api, toast } = mount({ admin: false, me: 41 });
    expect(el.querySelector('[data-testid="new-team"]')).toBeNull();
    expect(el.querySelector('[data-testid="show-archived"]'), 'archived teams are an administrator\'s').toBeNull();
    openRow(fixture, el, 6);
    expect(inPanel('[data-testid="add-role"]')).toBeNull();
    expect(inPanel('[data-role="42"]')).toBeNull();
    expect(inPanel('[data-testid="edit-team"]'), 'renaming is an administrator\'s').toBeNull();
    expect(inPanel('[data-testid="archive-team"]'), 'archiving is an administrator\'s').toBeNull();
    expect(inPanel('[data-remove="41"]'), 'never a lead').toBeNull();
    inPanel('[data-remove="42"]')!.click();
    await confirmIt(fixture);
    expect(api.removeMember).toHaveBeenCalledWith(6, 42);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('names a team\'s leads'));
    choose(panel()!, '[data-testid="add-person"]', '43');
    fixture.detectChanges();
    inPanel('[data-testid="add"]')!.click();
    expect(api.addMember).toHaveBeenCalledWith(6, 43, 'MEMBER');
  });

  it('shows a member who leads nothing the teams, and nothing to change', () => {
    const { fixture, el } = mount({ admin: false, me: 42 });
    openRow(fixture, el, 6);
    expect(inPanel('[data-testid="members"]')!.textContent).toContain('Ana Lead');
    expect(inPanel('[data-testid="add-member"]')).toBeNull();
    expect(inPanel('[data-remove="42"]')).toBeNull();
    expect(inPanel('[data-role="41"]')).toBeNull();
  });

  it('UX2: searches by team, description or person, and filters by lead, by member and by the "Without a lead" tile', () => {
    const { fixture, el } = mount();
    const rows = () => [...el.querySelectorAll('[data-row]')].map(r => r.getAttribute('data-row'));
    const search = el.querySelector('[data-testid="team-search"]') as HTMLInputElement;
    search.value = 'nurses';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows()).toEqual(['6']);
    search.value = 'ben';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows()).toEqual(['6']);
    (el.querySelector('button.btn-ghost') as HTMLButtonElement).click(); // Clear
    fixture.detectChanges();
    expect(rows()).toEqual(['7', '6']);

    choose(el, '[data-testid="lead-filter"]', '41');
    fixture.detectChanges();
    expect(rows()).toEqual(['6']);
    choose(el, '[data-testid="lead-filter"]', 'none');
    fixture.detectChanges();
    expect(rows()).toEqual(['7']);
    choose(el, '[data-testid="lead-filter"]', '');
    choose(el, '[data-testid="member-filter"]', '42');
    fixture.detectChanges();
    expect(rows()).toEqual(['6']);
    choose(el, '[data-testid="member-filter"]', '');
    fixture.detectChanges();

    const unled = [...el.querySelectorAll('[data-testid="team-stats"] button')].find(b => b.textContent!.includes('Without a lead')) as HTMLButtonElement;
    unled.click();
    fixture.detectChanges();
    expect(rows()).toEqual(['7']);
    expect(unled.getAttribute('aria-pressed')).toBe('true');
  });

  it('UX2: an administrator lists archived teams by status, and an empty search says so', () => {
    const { fixture, el, api } = mount();
    choose(el, '[data-testid="show-archived"]', 'ARCHIVED');
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(null, true);
    expect([...el.querySelectorAll('[data-row]')].map(r => r.getAttribute('data-row'))).toEqual(['5']);
    expect(el.querySelector('[data-row="5"]')!.textContent).toContain('Archived');
    choose(el, '[data-testid="show-archived"]', 'ACTIVE');
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(null, false);

    const search = el.querySelector('[data-testid="team-search"]') as HTMLInputElement;
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('No teams match the filters.');
    expect(el.querySelector('[data-testid="no-teams"]')!.textContent).toContain('Clear filters');
  });

  it('UX2: with no teams at all, says so and offers an administrator New team', () => {
    const { el } = mount({ teams: [] });
    expect(el.textContent).toContain('No teams yet.');
    expect(el.textContent).toContain('Make one, then name who is in it.');
    expect(el.querySelector('[data-testid="no-teams"]')!.textContent).toContain('New team');
    const { el: member } = mount({ teams: [], admin: false });
    expect(member.textContent).toContain('An administrator makes them.');
    expect(member.querySelector('[data-testid="no-teams"] button')).toBeNull();
  });

  it('UX2: shows where each team is used, in the row and in the panel with links, and never says "not used" about what it could not read', () => {
    const { fixture, el } = mount();
    const used = el.querySelector('[data-used="6"]')!.textContent!.replace(/\s+/g, ' ');
    expect(used).toContain('1 workflow');
    expect(used).toContain('2 approvals');
    expect(used).toContain('1 alert');
    expect(used).toContain('Report Studio');
    expect(el.querySelector('[data-used="7"]')!.textContent).toContain('Not used yet');
    openRow(fixture, el, 6);
    const links = [...panel()!.querySelectorAll('[data-testid="team-used"] a')].map(a => [a.textContent!.trim(), a.getAttribute('href')]);
    expect(links).toContainEqual(['Leave request › Manager approval', '/workflows/designer?key=leave']);
    expect(links).toContainEqual(['Runs failed', '/settings/alerts']);

    const { el: partial } = mount({ admin: false, usage: { known: ['workflow', 'approval'], byTeam: new Map() } });
    expect(partial.querySelector('[data-used="7"]')!.textContent).toContain('Nothing you can open');
  });

  it('UX2: a ?team= link opens that team in the panel', () => {
    mount({ query: { team: '7' } });
    expect(panel()!.textContent).toContain('Billing');
  });

  it('UX2: archiving is a crit-intent trigger confirmed with a danger button, and the archived team leaves the list', async () => {
    const { fixture, el, api } = mount();
    openRow(fixture, el, 6);
    const trigger = inPanel('[data-testid="archive-team"]')!;
    expect(trigger.className).toContain('btn-default');
    expect(trigger.className).toContain('btn-intent-crit');
    trigger.click();
    await confirmIt(fixture);
    expect(api.archive).toHaveBeenCalledWith(6);
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});

describe('Teams -- sorting (owner 2026-10-27)', () => {
  it('keeps active-then-name until a heading is picked, then sorts by members both ways', () => {
    const { fixture } = mount();
    const page = fixture.componentInstance;
    expect(page.paged().map(t => t.name)).toEqual(['Billing', 'Wound care']);
    page.sort.toggle('members');
    expect(page.paged().map(t => t.memberCount)).toEqual([2, 0]);
    page.sort.toggle('members');
    expect(page.paged().map(t => t.memberCount)).toEqual([0, 2]);
  });

  it('puts a team without a lead last when sorting by lead', () => {
    const { fixture } = mount();
    const page = fixture.componentInstance;
    page.sort.toggle('lead');
    expect(page.paged().map(t => t.name)).toEqual(['Wound care', 'Billing']);
  });
});

describe('Teams -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, with placeholder tiles and no "No teams yet", until the list answers', () => {
    const { fixture, el } = mount({ listAnswer: () => NEVER, usageAnswer: () => NEVER });
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.loaded()).toBe(false);
    expect(fixture.componentInstance.usageLoading()).toBe(true);
    expect(el.textContent).not.toContain('No teams yet');
  });

  it('says there is no team once an empty list answers', () => {
    const { fixture, el } = mount({ teams: [] });
    expect(fixture.componentInstance.loaded()).toBe(true);
    expect(el.textContent).toContain('No teams yet');
  });

  it('says the list could not be read in the table (no toast as well), and a failed usage read is not "used nowhere"', () => {
    const { fixture, el, toast } = mount({ listAnswer: () => throwError(() => new HttpErrorResponse({ status: 500 })),
      usageAnswer: () => throwError(() => new Error('down')) });
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBe('The teams could not be read.');
    expect(el.textContent).toContain('The teams could not be read.');
    expect(toast.error).not.toHaveBeenCalled();
    expect(fixture.componentInstance.usageError()).toBe('Where the teams are used could not be read.');
  });
});
