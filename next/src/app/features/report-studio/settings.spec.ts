import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../../shared/ui/toast.service';
import { TeamsApi } from '../../core/teams/teams.api';
import { ReportStudioApi } from './report-studio.api';
import { StudioSettings } from './report-studio.model';
import { ReportSettings, assigneeOf, choiceOf } from './settings';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Report Studio phase 7 -- Report Studio › Settings: who approves (automatic, the administrators or a team; F4), every version, two approvals and publishing by a second person -- all off by
 * default -- saved with the row version; and what retention would remove at so many days.
 */
const saved: StudioSettings = {
  approvals: { reviewers: null, everyVersion: false, secondApprover: false },
  publishing: { publishers: null, secondPerson: false }, rowVersion: 3, editable: true,
  resolved: { reviewers: { assignee: { kind: 'team', value: '1063' }, automatic: true, why: 'The one team whose people are those who may approve reports.' },
    publishers: { assignee: { kind: 'role', value: 'TENANT_ADMIN' }, automatic: true, why: 'No access profile may publish templates.' } },
};

function mount(platformAdmin = false) {
  const api = {
    settings: vi.fn(() => of(saved)),
    saveSettings: vi.fn(() => of(saved)),
    // Owner 2026-10-21: the Report size card (page-limit.spec.ts tests it).
    pageLimit: vi.fn(() => of({ tenantId: 2960, limit: 300, workspaceLimit: null, ceiling: 300, ceilingOverride: null, platformCeiling: 300,
      hardMax: 2000, raisedBy: 'PLATFORM_ADMIN', rowVersion: 3, editable: true, ceilingEditable: false })),
    retentionPreview: vi.fn(() => of({ cutoff: '', days: 30, count: 2, bytes: 2048, total: 9, versions: [{ reportId: 'R', reportLabel: 'RPT-0005',
      name: 'Wound assessment', version: 1, createdAt: '2026-10-01T10:00:00Z', bytes: 1024 }], snapshots: [], kept: { approved: 1, current: 4, waiting: 1, heldRuns: 0 } })),
  };
  const teams = { list: vi.fn(() => of({ status: 'SUCCESS', data: [
    { teamId: 1063, name: 'Reviewer', status: 'ACTIVE', members: [] }, { teamId: 1064, name: 'Viewer', status: 'ACTIVE', members: [] }] })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ReportStudioApi, useValue: api },
    { provide: TeamsApi, useValue: teams }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin, canOpen: () => true } }] });
  const fixture = TestBed.createComponent(ReportSettings);
  fixture.detectChanges();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
}

describe('Report settings (Report Studio phase 7)', () => {
  it('reads and writes whom a review goes to', () => {
    expect(choiceOf(null)).toBe('auto');
    expect(choiceOf({ kind: 'team', value: '1063' })).toBe('team:1063');
    expect(choiceOf({ kind: 'role', value: 'TENANT_ADMIN' })).toBe('admins');
    expect(assigneeOf('team:1063')).toEqual({ kind: 'team', value: '1063' });
    expect(assigneeOf('auto')).toBeNull();
    expect(assigneeOf('admins')).toEqual({ kind: 'role', value: 'TENANT_ADMIN' });
  });

  it('lists the teams, says who is asked now, and saves only what changed', async () => {
    const { fixture, api, el } = mount();
    await fixture.whenStable();
    fixture.detectChanges();
    const options = Array.from(el.querySelectorAll<HTMLOptionElement>('#rss-reviewers option')).map(o => o.textContent!.trim());
    expect(options[2]).toBe('The Reviewer team');
    expect(options[3]).toBe('The Viewer team');
    expect(el.querySelector('[data-test="reviewers-now"]')!.textContent).toContain('the Reviewer team');
    expect((el.querySelector('[data-test="settings-save"]') as HTMLButtonElement).disabled).toBe(true);
    fixture.componentInstance.secondApprover.set(true);
    fixture.detectChanges();
    (el.querySelector('[data-test="settings-save"]') as HTMLButtonElement).click();
    expect(api.saveSettings).toHaveBeenCalledWith({ approvals: { reviewers: null, everyVersion: false, secondApprover: true },
      publishing: { publishers: null, secondPerson: false }, rowVersion: 3 });
  });

  it('previews what retention would remove, and what it keeps', async () => {
    const { fixture, api, el } = mount();
    await fixture.whenStable();
    fixture.componentInstance.days.set(30);
    fixture.componentInstance.runPreview();
    fixture.detectChanges();
    expect(api.retentionPreview).toHaveBeenCalledWith(30);
    expect(el.querySelector('[data-test="retention-summary"]')!.textContent).toContain('1 approved or signed');
    expect(el.textContent).toContain('RPT-0005');
  });

  it('ZT-R17: tells a platform administrator the settings are the workspace\'s own, without asking for them (no 403 in red)', async () => {
    const { fixture, api, el } = mount(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.settings).not.toHaveBeenCalled();
    expect(el.querySelector('app-empty-state')?.textContent).toContain("The workspace's own settings");
    expect(el.querySelector('app-load-error')).toBeNull();
  });
});

/** Owner 2026-10-27: the settings say they are loading, the teams say why they could not be read, the retention tables sort. */
describe('Report settings -- loading, empty, error, sorting (owner 2026-10-27)', () => {
  const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
  const preview = { cutoff: '', days: 30, count: 3, bytes: 4096, total: 9, snapshots: [
    { snapshotId: 'S1', label: 'Run #12', takenAt: '2026-10-02T10:00:00Z', bytes: 50, why: 'No kept version uses it' },
    { snapshotId: 'S2', label: 'Upload', takenAt: '2026-10-01T10:00:00Z', bytes: 900, why: 'No kept version uses it' }],
    versions: [
      { reportId: 'R', reportLabel: 'RPT-0010', name: 'Wound assessment', version: 2, createdAt: '2026-10-02T10:00:00Z', bytes: 1024 },
      { reportId: 'R', reportLabel: 'RPT-0009', name: 'Wound assessment', version: 1, createdAt: '2026-10-01T10:00:00Z', bytes: 4096 }],
    kept: { approved: 1, current: 4, waiting: 1, heldRuns: 0 } };

  function screen(settings: () => Observable<unknown>, teams: () => Observable<unknown> = () => of({ status: 'SUCCESS', data: [] })) {
    try { localStorage.clear(); } catch { /* none */ }
    const api = { settings: vi.fn(settings), retentionPreview: vi.fn(() => of(preview)), pageLimit: vi.fn(() => NEVER) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ReportStudioApi, useValue: api },
      { provide: TeamsApi, useValue: { list: vi.fn(teams) } }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canOpen: () => true } }] });
    TestBed.overrideComponent(ReportSettings, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ReportSettings);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('is loading until the settings answer, and the teams too', () => {
    const s = screen(() => NEVER, () => NEVER);
    expect(s.loading()).toBe(true);
    expect(s.settings()).toBeNull();
    expect(s.teamsState.loading()).toBe(true);
  });

  it('says plainly when the settings or the teams could not be read', () => {
    const s = screen(failed, failed);
    expect(s.loading()).toBe(false);
    expect(s.error()).toBe('The settings could not be read.');
    expect(s.teamsState.error()).toBe('The teams could not be read.');
  });

  it('a saved team before the teams answer is "a team", not "#1063"', () => {
    const s = screen(() => of(saved), () => NEVER);
    expect(s.whoWords(saved.resolved!.reviewers)).toContain('Now: a team.');
  });

  it('sorts the retention preview\'s versions and frozen data by their columns, both ways', () => {
    const s = screen(() => of(saved));
    s.runPreview();
    expect(s.sortedRetentionVersions().map(v => v.version)).toEqual([2, 1]);
    s.retentionVersionSort.toggle('report');
    expect(s.sortedRetentionVersions().map(v => v.reportLabel)).toEqual(['RPT-0009', 'RPT-0010']);
    s.retentionVersionSort.toggle('report');
    expect(s.sortedRetentionVersions().map(v => v.reportLabel)).toEqual(['RPT-0010', 'RPT-0009']);
    s.retentionSnapshotSort.toggle('size');
    expect(s.sortedRetentionSnapshots().map(d => d.snapshotId)).toEqual(['S2', 'S1']);
  });
});
