import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Dashboard } from './dashboard';
import { DashboardService, JobBreakdown } from './dashboard.service';
import { ToastService } from '../../shared/ui/toast.service';
import { JobEventsService } from '../../core/socket/job-events.service';
import { AuthService } from '../../core/auth/auth.service';

function dashboardFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DashboardService, useValue: {} },
      { provide: HttpClient, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
      { provide: AuthService, useValue: { canOpen: () => true } },
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
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
        { provide: AuthService, useValue: { canOpen: () => true } },
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
          hourly: () => answer(refused),
        } },
        { provide: HttpClient, useValue: { get: () => answer({ status: 'SUCCESS', data: 0 }) } },
        { provide: ToastService, useValue: { success: () => {}, error: (m: string) => errors.push(m), info: () => {} } },
        { provide: Router, useValue: { navigate: () => {} } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
        { provide: AuthService, useValue: { canOpen: () => true } },
      ],
    });
    const dashboard = TestBed.runInInjectionContext(() => new Dashboard());

    dashboard.load();

    expect(dashboard.error()).toBe('Invalid date -- expected yyyy-MM-dd.');
    expect(errors).toEqual([]);
    expect(dashboard.loading()).toBe(false);
  });
});

/**
 * Nine status columns, most of them zero in any given hour, pushed Total and Breakdown off the
 * right edge at tablet and phone widths. Only the statuses the hour actually has are shown, and
 * Total is pinned to the right.
 */
describe('which status columns the drill-down shows', () => {
  it('leaves out a status with no runs anywhere in the hour', () => {
    const dashboard = dashboardFor();
    dashboard.breakdown.set([
      row({ jobId: 1, jobName: 'Alpha', completed: 3, total: 3 }),
      row({ jobId: 2, jobName: 'Beta', failed: 1, completed: 1, total: 2 }),
    ]);
    expect(dashboard.visibleColumns()).toEqual(['failed', 'completed']);
  });

  it('does not change the columns while the search narrows the rows', () => {
    const dashboard = dashboardFor();
    dashboard.breakdown.set([
      row({ jobId: 1, jobName: 'Alpha', completed: 3, total: 3 }),
      row({ jobId: 2, jobName: 'Beta', failed: 1, total: 1 }),
    ]);
    dashboard.breakdownSearch.set('alpha');
    expect(dashboard.visibleColumns()).toEqual(['failed', 'completed']);
  });

  it('keeps every column while there is nothing to judge by', () => {
    const dashboard = dashboardFor();
    expect(dashboard.visibleColumns()).toEqual(dashboard.columns);
  });

  it('still sums every status into the footer, shown or not', () => {
    const dashboard = dashboardFor();
    dashboard.breakdown.set([row({ jobId: 1, jobName: 'Alpha', completed: 3, total: 3 })]);
    expect(dashboard.breakdownTotal()!.total).toBe(3);
  });

  async function template(): Promise<string> {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    return fs.readFileSync(`${root}/src/app/features/dashboard/dashboard.html`, 'utf8');
  }

  it('pins Total to the right and drops the Breakdown bar below md (layout the test DOM cannot measure)', async () => {
    const html = await template();
    // Head, body and foot cells of each column.
    expect(html.match(/<t[hd] class="[^"]*col-pin-right[^"]*"/g)).toHaveLength(3);
    expect(html.match(/<t[hd] class="[^"]*hidden md:table-cell[^"]*"/g)).toHaveLength(3);
    expect(html).not.toContain('column of columns;');
  });
});

describe('the job status donut', () => {
  it('paints statuses in their status colours, so Inactive is not a Failed-like pink', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/dashboard/dashboard.html`, 'utf8');
    expect(html).toMatch(/<app-donut \[data\]="statusCategories\(\)"[^>]*\[colorFor\]="outcomeColor"/);
    expect(dashboardFor().outcomeColor('inactive')).toBe('var(--series-warn-soft)');
  });
});

/**
 * The counts drill into Run history, which is the Jobs page. A tenant user whose access profile
 * leaves Jobs out got clickable counts that all landed on /unauthorized; for them they are figures.
 */
describe('drill-down counts for someone without the Jobs page', () => {
  function withAccess(canOpenJobs: boolean) {
    const navigated: unknown[][] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DashboardService, useValue: {} },
        { provide: HttpClient, useValue: {} },
        { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
        { provide: Router, useValue: { navigate: (path: unknown[]) => { navigated.push(path); } } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
        { provide: AuthService, useValue: { canOpen: (page: string) => page === 'jobs' ? canOpenJobs : true } },
      ],
    });
    return { dashboard: TestBed.runInInjectionContext(() => new Dashboard()), navigated };
  }

  it('does not link the counts', () => {
    const { dashboard, navigated } = withAccess(false);
    expect(dashboard.canOpenJobs()).toBe(false);
    dashboard.openCount(row({ jobId: 42, jobName: 'Nightly', completed: 3 }), 'completed', 3);
    dashboard.openTotal('Total', 3);
    expect(navigated).toEqual([]);
  });

  it('keeps them links for someone who may open Jobs', () => {
    const { dashboard, navigated } = withAccess(true);
    expect(dashboard.canOpenJobs()).toBe(true);
    dashboard.openCount(row({ jobId: 42, jobName: 'Nightly', completed: 3 }), 'completed', 3);
    expect(navigated).toHaveLength(1);
  });

  it('renders plain figures rather than buttons in the table (template)', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/dashboard/dashboard.html`, 'utf8');
    // The four count sites: row statuses, row Total, footer statuses, footer Total.
    expect(html.match(/@if \(canOpenJobs\(\)\)/g)).toHaveLength(4);
  });
});

