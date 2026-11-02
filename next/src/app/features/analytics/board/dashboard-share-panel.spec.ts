import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { DashboardSharePanel, DashboardSharePanelData, audienceWords } from './dashboard-share-panel';
import { AnalyticsService, Dashboard, DashboardAccessView } from '../analytics.service';
import { TeamsApi } from '../../../core/teams/teams.api';

/** Owner 2026-11-02: who a dashboard is for, in the words its card, its header and its Share panel use. Synthetic board. */
describe('audienceWords', () => {
  it('names everyone for a board of the workspace, and an older server that sends no audience', () => {
    expect(audienceWords({ audience: 'WORKSPACE' })).toBe('Everyone in the workspace');
    expect(audienceWords({})).toBe('Everyone in the workspace');
  });
  it('names one team, one person, or counts several', () => {
    expect(audienceWords({ audience: 'SHARED', shares: [{ kind: 'TEAM', id: 6, name: 'Reviewer', access: 'VIEW' }] }))
      .toBe('Shared with the Reviewer team');
    expect(audienceWords({ audience: 'SHARED', shares: [{ kind: 'PERSON', id: 9, name: 'Alex Morgan, RN', access: 'VIEW' }] }))
      .toBe('Shared with Alex Morgan, RN');
    expect(audienceWords({ audience: 'SHARED', shares: [
      { kind: 'TEAM', id: 6, name: 'Reviewer', access: 'VIEW' }, { kind: 'PERSON', id: 9, name: 'A', access: 'EDIT' },
      { kind: 'PERSON', id: 10, name: 'B', access: 'VIEW' }] })).toBe('Shared with the Reviewer team and 2 people');
  });
  it('says a board shared with nobody is its owner\'s and the admins\'', () => {
    expect(audienceWords({ audience: 'SHARED', shares: [] })).toBe('Only its owner and admins');
  });
});

function mount(board: Dashboard, canAsk: boolean, view?: DashboardAccessView) {
  const closed: unknown[] = [];
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DashboardSharePanel],
    providers: [
      { provide: DIALOG_DATA, useValue: { board, canAsk } satisfies DashboardSharePanelData },
      { provide: DialogRef, useValue: { close: (v: unknown) => closed.push(v) } },
      { provide: AnalyticsService, useValue: {
        fetchDashboardAccess: () => { asked.push('access'); return of({ status: 'SUCCESS', data: view }); },
        fetchSharePeople: () => of({ status: 'SUCCESS', data: [{ appUserId: 9, fullName: 'Alex Morgan, RN', username: 'alex@riverside.test' }] }),
        saveDashboardAccess: () => of({ status: 'SUCCESS', data: view }),
      } },
      { provide: TeamsApi, useValue: { list: () => of({ status: 'SUCCESS', data: [{ teamId: 6, tenantId: 1, name: 'Reviewer', status: 'ACTIVE',
        memberCount: 1, leadCount: 0, members: [] }] }) } },
    ],
  });
  const fixture = TestBed.createComponent(DashboardSharePanel);
  fixture.detectChanges();
  return { fixture, panel: fixture.componentInstance, closed, asked, text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
}

const board: Dashboard = { analyticsDashboardId: 61, dashboardName: 'Wound care weekly', audience: 'SHARED', workspaceAccess: 'EDIT',
  shares: [{ kind: 'TEAM', id: 6, name: 'Reviewer', access: 'VIEW' }], yourAccess: 'VIEW', createdByName: 'Riverside Health admin' };

describe('DashboardSharePanel', () => {
  it('a reader with Saved Analyses alone reads who it is for from the board, asks nothing and changes nothing', () => {
    const { asked, text, fixture } = mount(board, false);
    expect(asked).toEqual([]);
    expect(text()).toContain('Only its owner (Riverside Health admin) or a workspace administrator changes who can see it.');
    expect(text()).toContain('The Reviewer team');
    expect(text()).toContain('Can view');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test=share-save]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#share-add')).toBeNull();
  });

  it('the owner adds a person, and Save sends the whole audience', () => {
    const view: DashboardAccessView = { analyticsDashboardId: 61, dashboardName: 'Wound care weekly', audience: 'SHARED', workspaceAccess: 'EDIT',
      shares: [{ kind: 'TEAM', id: 6, name: 'Reviewer', access: 'VIEW' }], owner: { appUserId: 1, name: 'Riverside Health admin' },
      yourAccess: 'MANAGE', history: [] };
    const { panel, closed } = mount({ ...board, yourAccess: 'MANAGE' }, true, view);
    expect(panel.canManage()).toBe(true);
    expect(panel.changed()).toBe(false);
    expect(panel.addOptions().map(o => o.value)).toEqual(['PERSON:9']);
    panel.add('PERSON:9');
    expect(panel.shares().map(s => `${s.kind}:${s.id}:${s.access}`)).toEqual(['TEAM:6:VIEW', 'PERSON:9:VIEW']);
    expect(panel.changed()).toBe(true);
    panel.setAccess(panel.shares()[1], 'EDIT');
    panel.save();
    expect(closed).toHaveLength(1);
  });
});
