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
