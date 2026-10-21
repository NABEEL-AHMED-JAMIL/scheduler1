import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { AccessProfilesService } from '../admin/access-profiles/access-profiles.service';
import { ReportStudioApi } from './report-studio.api';
import { StudioSettings } from './report-studio.model';
import { ReportSettings, assigneeOf, choiceOf } from './settings';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Report Studio phase 7 -- Report Studio › Settings: who approves (automatic, the administrators or an access profile, the
 * profiles that hold the page first), every version, two approvals and publishing by a second person -- all off by
 * default -- saved with the row version; and what retention would remove at so many days.
 */
const saved: StudioSettings = {
  approvals: { reviewers: null, everyVersion: false, secondApprover: false },
  publishing: { publishers: null, secondPerson: false }, rowVersion: 3, editable: true,
  resolved: { reviewers: { assignee: { kind: 'group', value: '1063' }, automatic: true, why: 'The one access profile whose people may approve reports.' },
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
  const profiles = { list: vi.fn(() => of({ status: 'SUCCESS', data: [
    { pageAccessProfileId: 1064, profileName: 'Viewer', pageKeys: ['report-library'], defaultProfile: false, userCount: 1 },
    { pageAccessProfileId: 1063, profileName: 'Reviewer', pageKeys: ['report-approve', 'report-library'], defaultProfile: true, userCount: 1 }] })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ReportStudioApi, useValue: api },
    { provide: AccessProfilesService, useValue: profiles }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin, canOpen: () => true } }] });
  const fixture = TestBed.createComponent(ReportSettings);
  fixture.detectChanges();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
}

describe('Report settings (Report Studio phase 7)', () => {
  it('reads and writes whom a review goes to', () => {
    expect(choiceOf(null)).toBe('auto');
    expect(choiceOf({ kind: 'group', value: '1063' })).toBe('group:1063');
    expect(choiceOf({ kind: 'role', value: 'TENANT_ADMIN' })).toBe('admins');
    expect(assigneeOf('group:1063')).toEqual({ kind: 'group', value: '1063' });
    expect(assigneeOf('auto')).toBeNull();
    expect(assigneeOf('admins')).toEqual({ kind: 'role', value: 'TENANT_ADMIN' });
  });

  it('lists the profiles that may approve first, says who is asked now, and saves only what changed', async () => {
    const { fixture, api, el } = mount();
    await fixture.whenStable();
    fixture.detectChanges();
    const options = Array.from(el.querySelectorAll<HTMLOptionElement>('#rss-reviewers option')).map(o => o.textContent!.trim());
    expect(options[2]).toBe('Reviewer');
    expect(options[3]).toContain('Viewer (does not hold');
    expect(el.querySelector('[data-test="reviewers-now"]')!.textContent).toContain('the access profile Reviewer');
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
