import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TabCounts } from '../../core/nav/tab-counts';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { GeneratedService } from '../documents/generated/generated.service';
import { ReportStudioApi } from './report-studio.api';
import { ReportOverview } from './overview';
import { ReportLibraryApi } from './report-library.api';

/**
 * ZT-R23 (owner 2026-10-21): the Overview said "1 report waiting for approval" with Open Approvals to a one-administrator
 * workspace's only admin -- whose own request Approvals rightly does not list (nobody approves their own). The figure is split
 * as Approvals lists it: "waiting for you" opens Approvals; "waiting for another approver: you asked for it" opens My requests,
 * and says when no one else in the workspace can approve it (the platform administrator decides it, ZT-W2).
 */

const base = { versionsThisMonth: 1, reports: 1, publishedTemplates: 1, templatesWithDrafts: 0, templates: 1, jobsFinishedThisMonth: 1,
  jobsSucceededThisMonth: 1, failedLast7Days: 0, running: 0, waitingForApproval: 1, publishRequests: 0 };

function overview(figures: Record<string, unknown>) {
  const auth = { canOpen: () => true, isPlatformAdmin: () => false, user: signal({ appUserId: 4640, tenantId: 2960 }) };
  const api = { overview: vi.fn(() => of({ figures, recentReports: [], recentJobs: [], failedJobs: [], templateActivity: [] })),
    assets: vi.fn(() => of({ counts: {} })), jobs: vi.fn(() => of({ jobs: [] })), report: vi.fn(() => of(null)) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthService, useValue: auth },
    { provide: ReportStudioApi, useValue: api }, { provide: ReportLibraryApi, useValue: { summary: vi.fn(() => NEVER) } }, { provide: GeneratedService, useValue: { schedules: vi.fn(() => of([])), runs: vi.fn(() => of([])) } },
    { provide: TabCounts, useValue: { set: vi.fn() } }, { provide: WorkspaceDirectory, useValue: { remembered: () => null } }] });
  TestBed.overrideComponent(ReportOverview, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(ReportOverview);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('ZT-R23: what waits for approval, as Approvals lists it', () => {
  it('the maker\'s own request in a one-admin workspace is "asked by you", nobody else\'s to approve -- not "waiting for you"', () => {
    const w = overview({ ...base, approvals: { open: 1, forYou: 0, askedByYou: 1, nobodyElse: 1 },
      publishing: { open: 0, forYou: 0, askedByYou: 0, nobodyElse: 0 } }).waiting()!;
    expect(w.forYou.reports + w.forYou.templates).toBe(0);
    expect(w.asked.reports).toBe(1);
    expect(w.nobodyElse).toBe(1);
  });

  it('a reviewer\'s is "waiting for you"', () => {
    const w = overview({ ...base, approvals: { open: 2, forYou: 2, askedByYou: 0, nobodyElse: 0 },
      publishing: { open: 1, forYou: 1, askedByYou: 0, nobodyElse: 0 } }).waiting()!;
    expect(w.forYou).toEqual({ reports: 2, templates: 1 });
    expect(w.asked.reports + w.asked.templates).toBe(0);
  });

  it('Needs you: Open Approvals only for what is yours; My requests and the platform administrator\'s line for what you asked', () => {
    const asked = overview({ ...base, approvals: { open: 1, forYou: 0, askedByYou: 1, nobodyElse: 1 },
      publishing: { open: 0, forYou: 0, askedByYou: 0, nobodyElse: 0 } }).needs();
    expect(asked.map(n => n.kind)).toEqual(['asked']);
    expect(asked[0].title).toContain('waiting for another approver: you asked for');
    expect(asked[0].detail).toContain('the platform administrator will decide');
    expect(asked[0].link).toEqual(['/review/requests']);
    const mine = overview({ ...base, approvals: { open: 2, forYou: 2, askedByYou: 0, nobodyElse: 0 },
      publishing: { open: 1, forYou: 1, askedByYou: 0, nobodyElse: 0 } }).needs();
    // Before the 30-day list arrives, what is the reader's opens Approvals; templates to publish are their own line.
    expect(mine.map(n => [n.kind, n.link[0]])).toEqual([['approve', '/review/approvals'], ['publish', '/review/approvals']]);
  });
});
