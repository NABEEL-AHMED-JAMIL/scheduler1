import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dashboard } from './dashboard';
import { DashboardService, JobBreakdown } from './dashboard.service';
import { ToastService } from '../../shared/ui/toast.service';

function dashboardFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DashboardService, useValue: {} },
      { provide: HttpClient, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Dashboard());
}

const row = (over: Partial<JobBreakdown>): JobBreakdown => ({
  jobId: 1, jobName: 'Job', queue: 0, start: 0, running: 0, failed: 0,
  completed: 0, skip: 0, interrupt: 0, missed: 0, total: 0, ...over,
});

/**
 * Regression test for a real reporting bug: BREAKDOWN_COLUMNS omitted 'stop' even though the
 * backend's `total` sums over it (WeeklyHrJobDimensionStatisticsDto includes a `stop` field).
 * The footer total and the per-row outcome bar both undercounted against a `total` that still
 * included stopped runs, so neither summed to what it claimed.
 */
describe('Dashboard breakdown totals', () => {
  it('includes stopped runs in the summed footer total, not just in the backend total', () => {
    const dashboard = dashboardFor();
    dashboard.breakdown.set([
      row({ jobId: 1, jobName: 'Job A', completed: 3, stop: 2, total: 5 }),
      row({ jobId: 2, jobName: 'Job B', failed: 1, stop: 1, total: 2 }),
    ]);
    const summed = dashboard.breakdownTotal()!;
    expect(summed.stop).toBe(3);
    // The per-column sum should now actually reach the backend's own total instead of falling
    // short by however many runs were stopped.
    const columnSum = dashboard.columns.reduce((sum, key) => sum + ((summed as any)[key] ?? 0), 0);
    expect(columnSum).toBe(summed.total);
  });

  it('shows a stop segment in the per-row outcome bar when the job had stopped runs', () => {
    const dashboard = dashboardFor();
    const withStops = row({ jobId: 1, jobName: 'Job A', completed: 2, stop: 2, total: 4 });
    const segments = dashboard.segmentsFor(withStops);
    const stopSegment = segments.find(s => s.key === 'stop');
    expect(stopSegment).toBeTruthy();
    expect(stopSegment!.count).toBe(2);
    // The bar's segments should account for the whole total, not silently stop short of 100%.
    const totalPct = segments.reduce((sum, s) => sum + s.pct, 0);
    expect(totalPct).toBeCloseTo(100, 5);
  });
});

/**
 * The word "undefined" must never reach a URL.
 *
 * A breakdown row whose jobId is missing produced /jobs/undefined/history -- a URL that renders
 * perfectly well, reads the literal string "undefined" back out of the path, and then hands it to
 * every link on that screen, which is how /jobs/undefined/runs/5524/logs came to exist. The
 * paramless route already means "this hour, across every job", which is the honest reading of a
 * row that cannot say which job it is.
 */
describe('drilling into an hour from the breakdown', () => {
  function dashboardRecording() {
    const navigated: unknown[][] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DashboardService, useValue: {} },
        { provide: HttpClient, useValue: {} },
        { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
        { provide: Router, useValue: { navigate: (path: unknown[]) => { navigated.push(path); } } },
      ],
    });
    return { dashboard: TestBed.runInInjectionContext(() => new Dashboard()), navigated };
  }

  it('puts the job in the path when the row names one', () => {
    const { dashboard, navigated } = dashboardRecording();
    dashboard.openCount(row({ jobId: 42, jobName: 'Nightly load', completed: 3 }), 'Completed', 3);
    expect(navigated[0]).toEqual(['/operations/jobs', 42, 'history']);
  });

  it('falls back to the cross-job view rather than writing undefined into the path', () => {
    const { dashboard, navigated } = dashboardRecording();
    dashboard.openCount(
      row({ jobId: undefined as unknown as number, jobName: 'Nightly load', completed: 3 }),
      'Completed', 3);

    expect(navigated[0]).toEqual(['/operations/jobs', 'history']);
    expect(JSON.stringify(navigated[0])).not.toContain('undefined');
  });

  it('still refuses to navigate on a zero count, which would land on an empty page', () => {
    const { dashboard, navigated } = dashboardRecording();
    dashboard.openCount(row({ jobId: 42, jobName: 'Nightly load' }), 'Completed', 0);
    expect(navigated).toEqual([]);
  });
});

/**
 * MIG-46 (DEF-128): a platform administrator's tiles add up every workspace, and the page used to
 * say nothing about it. The server now says so on each total; the subtitle repeats it.
 */
describe('whose numbers the dashboard shows', () => {
  it('says the totals cover every workspace when the server says so', () => {
    const dashboard = dashboardFor();
    dashboard.jobStatus.set([{ name: 'All', value: 351, allWorkspaces: true }]);
    expect(dashboard.scopeLabel()).toBe('all workspaces');
  });

  it('says nothing extra for one workspace, whose own numbers need no label', () => {
    const dashboard = dashboardFor();
    dashboard.jobStatus.set([{ name: 'All', value: 12, tenantId: 1004, allWorkspaces: false }]);
    expect(dashboard.scopeLabel()).toBeNull();
    dashboard.jobStatus.set([]);
    expect(dashboard.scopeLabel()).toBeNull();
  });
});

/**
 * MIG-103 (ADR-023): a request the server refuses -- a date that is not a date -- is an HTTP 200
 * carrying status ERROR and a sentence. The first load used to drop it and show empty tiles; it now
 * says why, once, and still stops the spinner. Since the UI audit it says so on the page, where
 * the tiles and charts would have been, with Try again -- not in a toast that fades.
 */
describe('a refused dashboard load', () => {
  it('shows the server sentence once and stops loading', () => {
    const errors: string[] = [];
    const refused = { status: 'ERROR', message: 'Invalid date -- expected yyyy-MM-dd.' };
    const answer = (value: unknown) => ({ subscribe: (o: { next: (v: unknown) => void }) => o.next(value) });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DashboardService, useValue: {
          jobStatus: () => answer(refused), jobRunning: () => answer(refused),
          weekly: () => answer(refused), hourly: () => answer(refused),
        } },
        { provide: HttpClient, useValue: { get: () => answer({ status: 'SUCCESS', data: 0 }) } },
        { provide: ToastService, useValue: { success: () => {}, error: (m: string) => errors.push(m), info: () => {} } },
        { provide: Router, useValue: { navigate: () => {} } },
      ],
    });
    const dashboard = TestBed.runInInjectionContext(() => new Dashboard());

    dashboard.load();

    expect(dashboard.error()).toBe('Invalid date -- expected yyyy-MM-dd.');
    expect(errors).toEqual([]);
    expect(dashboard.loading()).toBe(false);
  });
});
