import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TabCounts } from '../../core/nav/tab-counts';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { GeneratedService } from '../documents/generated/generated.service';
import { ReportStudioApi } from './report-studio.api';
import { ReportOverview } from './overview';

/**
 * Owner 2026-10-27: the Overview's Recent reports and Generation jobs sort by their columns (over the recent rows the
 * service sends); the Connected pipelines card says it is looking, or that the schedules could not be read, instead of
 * "their schedules are not ones you can open".
 */
const figures = { versionsThisMonth: 1, reports: 1, publishedTemplates: 1, templatesWithDrafts: 0, templates: 1, jobsFinishedThisMonth: 1,
  jobsSucceededThisMonth: 1, failedLast7Days: 0, running: 0, waitingForApproval: 0, publishRequests: 0 };
const recentReports = [
  { reportId: 'R1', name: 'Wound summary', currentVersion: 3, status: 'GENERATED', updatedAt: '2026-10-20T09:00:00Z' },
  { reportId: 'R2', name: 'Admission note', currentVersion: 12, status: 'FAILED', updatedAt: '2026-10-22T09:00:00Z' },
  { reportId: 'R3', name: 'Discharge letter', currentVersion: null, status: 'GENERATED', updatedAt: '2026-10-21T09:00:00Z' },
];
const recentJobs = [
  { jobId: 'J1', label: 'JOB-0009', reportId: 'R1', status: 'SUCCEEDED', createdAt: '2026-10-20T09:00:00Z' },
  { jobId: 'J2', label: 'JOB-0010', reportId: 'R2', status: 'FAILED', createdAt: '2026-10-22T09:00:00Z' },
];
const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

function overview(opts: { schedules?: () => Observable<unknown>; runs?: () => Observable<unknown>; pipelineRuns?: unknown[] } = {}) {
  const auth = { canOpen: () => true, isPlatformAdmin: () => false, user: signal({ appUserId: 4640, tenantId: 2960 }) };
  const api = { overview: vi.fn(() => of({ figures, recentReports, recentJobs, failedJobs: [], templateActivity: [], pipelineRuns: opts.pipelineRuns ?? [] })),
    assets: vi.fn(() => of({ counts: {} })), jobs: vi.fn(() => of({ jobs: [] })), report: vi.fn(() => of(null)) };
  const generated = { schedules: vi.fn(opts.schedules ?? (() => of([]))), runs: vi.fn(opts.runs ?? (() => of([]))) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthService, useValue: auth },
    { provide: ReportStudioApi, useValue: api }, { provide: GeneratedService, useValue: generated },
    { provide: TabCounts, useValue: { set: vi.fn() } }, { provide: WorkspaceDirectory, useValue: { remembered: () => null } }] });
  TestBed.overrideComponent(ReportOverview, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(ReportOverview);
  fixture.detectChanges();
  return fixture.componentInstance;
}

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Overview -- the recent lists sort (owner 2026-10-27)', () => {
  it('keeps the service\'s order, then sorts the reports by version both ways, no version last', () => {
    const o = overview();
    expect(o.sortedReports().map(r => r.reportId)).toEqual(['R1', 'R2', 'R3']);
    o.reportSort.toggle('version');
    expect(o.sortedReports().map(r => r.reportId)).toEqual(['R2', 'R1', 'R3']);
    o.reportSort.toggle('version');
    expect(o.sortedReports().map(r => r.reportId)).toEqual(['R1', 'R2', 'R3']);
    o.reportSort.toggle('updated');
    expect(o.sortedReports().map(r => r.reportId)).toEqual(['R2', 'R3', 'R1']);
  });

  it('sorts the jobs by when they started, newest first, and leaves the service\'s list as it was', () => {
    const o = overview();
    o.jobSort.toggle('started');
    expect(o.sortedJobs().map(j => j.jobId)).toEqual(['J2', 'J1']);
    expect(o.data()!.recentJobs.map(j => j.jobId)).toEqual(['J1', 'J2']);
  });
});

describe('Overview -- Connected pipelines: loading, empty, error (owner 2026-10-27)', () => {
  const used = [{ pipelineRunId: 9001, templateIds: ['T1'] }];

  it('is looking, not "not ones you can open", while the schedules come', () => {
    const o = overview({ pipelineRuns: used, schedules: () => NEVER });
    expect(o.pipelinesLoading()).toBe(true);
    expect(o.pipelinesError()).toBe('');
  });

  it('is empty once the schedules answer with none', () => {
    const o = overview({ pipelineRuns: used });
    expect(o.pipelinesLoading()).toBe(false);
    expect(o.pipelines()).toEqual([]);
  });

  it('says the schedules could not be read', () => {
    const o = overview({ pipelineRuns: used, schedules: failed });
    expect(o.pipelinesLoading()).toBe(false);
    expect(o.pipelinesError()).toBe('The schedules could not be read.');
  });

  it('lists a pipeline once all its runs have answered', () => {
    const o = overview({ pipelineRuns: used, schedules: () => of([{ jobId: 77, jobName: 'Nightly wounds', lastJobRun: '2026-10-22T09:00:00Z' }]),
      runs: () => of([{ jobQueueId: 9001, jobStatus: 'Completed' }]) });
    expect(o.pipelinesLoading()).toBe(false);
    expect(o.pipelines().map(p => p.jobId)).toEqual([77]);
  });
});
