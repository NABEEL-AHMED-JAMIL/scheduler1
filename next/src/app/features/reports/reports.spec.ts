import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { BillingApi } from '../billing/billing.service';
import { Reports, reasonKey } from './reports';
import { ReportPivot } from './report-pivot';
import { NO_DURATION, RunData, RunRow, humanSeconds } from './pivot';

function reportsFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      // ngOnInit is never called, so nothing is fetched: every test seeds rawData() and
      // failures() with exactly what the two endpoints would have returned.
      { provide: HttpClient, useValue: { get: () => of({ status: 'ERROR', message: '' }), post: () => of({ status: 'ERROR', message: '' }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      // The model-calls cost line asks billing only for an admin; these tests are not about it.
      { provide: AuthService, useValue: { isTenantAdmin: () => false, isPlatformAdmin: () => false } },
      { provide: BillingApi, useValue: { usageByMeter: () => of({ status: 'ERROR', message: '' }) } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Reports());
}

const empty = { job: [], tenant: [] as string[] };

/**
 * A batch caught mid-flight: three runs queued or running, one finished.
 *
 * Runs that have not ended carry -1 for both durations -- job_queue stamps start_time at ENQUEUE
 * and leaves end_time null -- so they pass the `start_time is not null` filter and arrive here
 * untimed. [taskIdx, statusIdx, ownerIdx, dayIdx, seconds, jobName, runId, tenantIdx, execSeconds]
 */
const inFlight: RunData = {
  ...empty,
  task: ['nightly-load'],
  status: ['Completed', 'Running'],
  owner: ['Ada'],
  day: ['2026-08-01'],
  rows: [
    [0, 0, 0, 0, 44, 'job a', 1, 0, 3],
    [0, 1, 0, 0, -1, 'job a', 2, 0, -1],
    [0, 1, 0, 0, -1, 'job a', 3, 0, -1],
    [0, 1, 0, 0, -1, 'job a', 4, 0, -1],
  ] as RunRow[],
};

/**
 * "Median duration 0s" was the page's flattest contradiction: it sat beside a histogram whose
 * empty message correctly reads "No run has finished in this range yet", and said something
 * different about the same runs.
 */
describe('the median duration tile', () => {
  it('reports no duration, not 0s, once the Outcome filter leaves only unfinished runs', () => {
    const reports = reportsFor();
    reports.rawData.set(inFlight);
    reports.statusFilter.set('Running');

    expect(reports.timedRuns().length).toBe(0);
    expect(reports.medianDuration()).toBe(NO_DURATION);
    expect(humanSeconds(reports.medianDuration())).toBe('—');
  });

  it('agrees with the histogram beside it about whether anything finished', () => {
    const reports = reportsFor();
    reports.rawData.set(inFlight);
    reports.statusFilter.set('Running');

    // The histogram draws its empty state off durations(); the tile must not claim a figure the
    // histogram is saying it has no data for.
    expect(reports.durations()).toEqual([]);
    expect(humanSeconds(reports.medianDuration())).toBe('—');
  });

  it('still reports a median when something did finish', () => {
    const reports = reportsFor();
    reports.rawData.set(inFlight);

    expect(reports.medianDuration()).toBe(44);
    expect(humanSeconds(reports.medianDuration())).toBe('44s');
  });
});

/**
 * Two workspaces, as a platform administrator sees them: tenantClause() is empty for that role, so the
 * runs feed merges every workspace and the Workspace filter is the only thing separating them.
 */
const twoWorkspaces: RunData = {
  job: [],
  task: ['acme-load', 'globex-load'],
  status: ['Failed'],
  owner: ['Ada'],
  day: ['2026-08-01'],
  tenant: ['Acme', 'Globex'],
  rows: [
    [0, 0, 0, 0, 12, 'acme job', 101, 0, 1],
    [1, 0, 0, 0, 15, 'globex job', 201, 1, 2],
    [1, 0, 0, 0, 15, 'globex job', 202, 1, 2],
  ] as RunRow[],
};

const failure = (jobQueueId: number, task: string, job: string) => ({
  jobQueueId, jobId: 7, job, task, status: 'Failed',
  message: 'connection refused', when: '2026-08-01 10:00:00', seconds: 12,
});

/**
 * The failures table is fed by fetchLogs, which was never told about the workspace and is never
 * refetched when a filter changes -- so it held the whole-range, all-workspace set and listed it
 * under a "Filtered to Workspace: Acme" chip, with a header count that contradicted the Failed
 * tile directly above it.
 */
describe('the failures table honours the Workspace filter', () => {
  it('lists only the selected workspace\'s failures', () => {
    const reports = reportsFor();
    reports.rawData.set(twoWorkspaces);
    reports.failures.set([
      failure(101, 'acme-load', 'acme job'),
      failure(201, 'globex-load', 'globex job'),
      failure(202, 'globex-load', 'globex job'),
    ]);
    reports.tenantFilter.set('Acme');

    expect(reports.visibleFailures().map(f => f.jobQueueId)).toEqual([101]);
  });

  it('agrees with the Failed tile it sits under', () => {
    const reports = reportsFor();
    reports.rawData.set(twoWorkspaces);
    reports.failures.set([
      failure(101, 'acme-load', 'acme job'),
      failure(201, 'globex-load', 'globex job'),
      failure(202, 'globex-load', 'globex job'),
    ]);
    reports.tenantFilter.set('Acme');

    // The table header prints visibleFailures().length; the tile prints counts().failed. They
    // describe the same runs, so they have to be the same number.
    expect(reports.visibleFailures().length).toBe(reports.counts().failed);
  });

  it('honours the workspace in combination with another filter too', () => {
    // Workspace alone used to hit the early return and leave the table entirely unfiltered;
    // Workspace + Outcome fell through to a predicate that had no tenant test in it. Both paths
    // leaked, so both are checked.
    const reports = reportsFor();
    reports.rawData.set(twoWorkspaces);
    reports.failures.set([
      failure(101, 'acme-load', 'acme job'),
      failure(201, 'globex-load', 'globex job'),
    ]);
    reports.tenantFilter.set('Globex');
    reports.statusFilter.set('Failed');

    expect(reports.visibleFailures().map(f => f.jobQueueId)).toEqual([201]);
  });

  it('leaves the table whole when no workspace is picked', () => {
    const reports = reportsFor();
    reports.rawData.set(twoWorkspaces);
    reports.failures.set([
      failure(101, 'acme-load', 'acme job'),
      failure(201, 'globex-load', 'globex job'),
    ]);

    expect(reports.visibleFailures().length).toBe(2);
  });

  it('attributes a workspace from the raw feed, not from the narrowed one', () => {
    // runIndex() is built from data(), which the workspace filter has already narrowed -- reusing
    // it here would make every failure belong to whichever workspace is selected. This lookup
    // reads rawData(), so a Globex failure stays a Globex failure while Acme is selected.
    const reports = reportsFor();
    reports.rawData.set(twoWorkspaces);
    reports.failures.set([failure(201, 'globex-load', 'globex job')]);
    reports.tenantFilter.set('Acme');

    expect(reports.visibleFailures()).toEqual([]);
  });
});

/** One run, on one day, which is all runsByDay() needs to draw the whole selected range. */
const oneRun: RunData = {
  ...empty,
  task: ['nightly-load'],
  status: ['Completed'],
  owner: ['Ada'],
  day: ['2024-06-15'],
  rows: [[0, 0, 0, 0, 44, 'job a', 1, 0, 3]] as RunRow[],
};

/**
 * "Showing the most recent N days." exists for one purpose: to tell the reader that older days
 * are missing. daysCapped() re-derived it from the bar count as `length >= MAX_DAYS` instead of
 * keeping the flag daySeries() already returns, and the two disagree at exactly MAX_DAYS.
 */
describe('the truncation caption', () => {
  it('stays quiet for a 366-day range, which is drawn whole', () => {
    const reports = reportsFor();
    reports.rawData.set(oneRun);
    reports.startDate.set('2024-01-01');
    reports.endDate.set('2024-12-31');          // a leap year: 366 days, and none of them cut

    expect(reports.runsByDay().length).toBe(366);
    expect(reports.daysCapped()).toBe(false);
  });

  it('still fires when the range really was cut short', () => {
    const reports = reportsFor();
    reports.rawData.set(oneRun);
    reports.startDate.set('2023-01-01');
    reports.endDate.set('2024-12-31');

    expect(reports.runsByDay().length).toBe(366);
    expect(reports.daysCapped()).toBe(true);
  });

  it('says nothing at all when there is no axis', () => {
    const reports = reportsFor();
    reports.startDate.set('2024-01-01');
    reports.endDate.set('2024-12-31');

    expect(reports.runsByDay()).toEqual([]);
    expect(reports.daysCapped()).toBe(false);
  });
});

describe('reasonKey', () => {
  it('folds the job id, the wording of the prefix and every number into one reason', () => {
    const a = reasonKey('Job 2477 failed due to AI step <summary> failed: Daily token budget reached on "Ollama" (9,941 of 9,657 today). No call was made.');
    const b = reasonKey('Job 2476: AI step <summary> failed: Daily token budget reached on "Ollama" (16,801 of 1 today). No call was made.');
    expect(a).toBe(b);
    expect(a).toBe('AI step <summary> failed: Daily token budget reached on "Ollama" (# of # today). No call was made.');
  });
  it('keeps a message with no job prefix, and names an empty one', () => {
    expect(reasonKey("Task payload for F768926 could not be parsed; check the task's XML"))
      .toBe("Task payload for F# could not be parsed; check the task's XML");
    expect(reasonKey('Job 2489 failed in the queue because the main job is deleted or inactive.'))
      .toBe('failed in the queue because the main job is deleted or inactive.');
    expect(reasonKey('   ')).toBe('(no message)');
    expect(reasonKey(undefined)).toBe('(no message)');
  });
});

/**
 * The builder is kept alive with [hidden] so that collapsing it does not throw away the reader's
 * dimensions, measure, chart and drill-down -- but it sat inside the loading/error @if, so every
 * Refresh, date change or Try again destroyed it and reset all of that anyway.
 */
describe('Reports builder across a reload', () => {
  it('is the same builder, settings and all, after the page reloads', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: () => of({ status: 'ERROR', message: '' }), post: () => of({ status: 'ERROR', message: '' }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: { isTenantAdmin: () => false, isPlatformAdmin: () => false } },
      { provide: BillingApi, useValue: { usageByMeter: () => of({ status: 'ERROR', message: '' }) } },
    ] });
    const fixture = TestBed.createComponent(Reports);
    fixture.detectChanges();
    const reports = fixture.componentInstance;
    const settle = () => { reports.loading.set(false); reports.error.set(''); reports.rawData.set(inFlight); fixture.detectChanges(); };
    settle();
    reports.showBuilder.set(true);
    fixture.detectChanges();
    const before = fixture.debugElement.query(By.directive(ReportPivot))?.componentInstance;
    expect(before).toBeTruthy();

    reports.loading.set(true);
    fixture.detectChanges();
    settle();

    expect(fixture.debugElement.query(By.directive(ReportPivot))?.componentInstance).toBe(before);
  });
});
