import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Dashboard } from './dashboard';
import { DashboardService } from './dashboard.service';
import { ToastService } from '../../shared/ui/toast.service';

type Answers = Partial<Record<'jobStatus' | 'jobRunning' | 'weekly' | 'hourly' | 'breakdown', () => unknown>>;
const ok = () => of({ status: 'SUCCESS', data: [] });

function dashboard(answers: Answers = {}) {
  const calls: string[] = [];
  const service: Record<string, unknown> = {};
  const breakdownDates: string[] = [];
  for (const name of ['jobStatus', 'jobRunning', 'weekly', 'hourly', 'breakdown'] as const) {
    service[name] = (...args: unknown[]) => {
      calls.push(name);
      if (name === 'breakdown') breakdownDates.push(String(args[0]));
      return (answers[name] ?? ok)();
    };
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DashboardService, useValue: service },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: 0 }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  return { dashboard: TestBed.runInInjectionContext(() => new Dashboard()), calls, breakdownDates };
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Dashboard load states', () => {
  /**
   * Three of the four chart requests had no error handler and ignored a refusal, and the page
   * had no error state: a failed call left a donut or the heatmap empty, which reads exactly
   * like "no activity" (UI audit, Medium).
   */
  it('says why when a chart request fails, not just the first one', () => {
    const { dashboard: d } = dashboard({ jobRunning: () => throwError(() => ({ error: {} })) });
    d.load();
    expect(d.error()).toBeTruthy();
  });

  it('keeps the server\'s sentence for a refused chart', () => {
    const { dashboard: d } = dashboard({ weekly: () => of({ status: 'ERROR', message: 'Weekly figures are unavailable.' }) });
    d.load();
    expect(d.error()).toBe('Weekly figures are unavailable.');
  });

  it('clears the error when Try again succeeds', () => {
    let fail = true;
    const { dashboard: d } = dashboard({ hourly: () => fail ? of({ status: 'ERROR', message: 'Busy.' }) : ok() });
    d.load();
    fail = false;
    d.load();
    expect(d.error()).toBe('');
  });

  /** `loading` fell as soon as the first request answered, while three were still out. */
  it('is loading until every chart request has answered', () => {
    const slow = new Subject<unknown>();
    const { dashboard: d } = dashboard({ hourly: () => slow });
    d.load();
    expect(d.loading()).toBe(true);
    slow.next({ status: 'SUCCESS', data: [] });
    slow.complete();
    expect(d.loading()).toBe(false);
  });
});

describe('Dashboard hour drill-down', () => {
  /**
   * A failed breakdown only toasted, then the card said "No jobs ran in this hour." -- which was
   * false. It now keeps the reason, for the table shell's error state and its Try again.
   */
  it('keeps the reason a breakdown could not be read', () => {
    const { dashboard: d } = dashboard({ breakdown: () => of({ status: 'ERROR', message: 'That hour is gone.' }) });
    d.selectCell('2026-09-20', 9, 4);
    expect(d.breakdownError()).toBe('That hour is gone.');
  });

  it('reads the same hour again on Try again', () => {
    let fail = true;
    const { dashboard: d, calls } = dashboard({
      breakdown: () => fail ? throwError(() => ({ error: {} })) : of({ status: 'SUCCESS', data: [{ jobId: 1, jobName: 'A', total: 2 }] }),
    });
    d.selectCell('2026-09-20', 9, 4);
    expect(d.breakdownError()).toBeTruthy();
    fail = false;
    d.retryBreakdown();
    expect(calls.filter(c => c === 'breakdown')).toHaveLength(2);
    expect(d.breakdownError()).toBe('');
    expect(d.filteredBreakdown().length).toBe(1);
  });
});

describe('Dashboard default range', () => {
  afterEach(() => vi.useRealTimers());

  /** toISOString() is the UTC date; the range is the reader's own week (UI audit, Low). */
  it('is the last seven days of the reader\'s calendar', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const west = new Date(2026, 8, 24, 12).getTimezoneOffset() > 0;
    const now = west ? new Date(2026, 8, 24, 23, 30) : new Date(2026, 8, 24, 0, 30);
    vi.setSystemTime(now);
    const { dashboard: d } = dashboard();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6);
    expect(d.endDate()).toBe(localDay(now));
    expect(d.startDate()).toBe(localDay(weekAgo));
  });
});

/**
 * Over more than a week one heatmap cell holds several dates (every Thursday at 10pm). The
 * breakdown and the history links it opens are for one date, so the drill-down opens on the latest
 * of them and offers the others, rather than showing only whichever date happened to be drawn.
 */
describe('Dashboard drill-down into a cell covering several dates', () => {
  const thursdays = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'];

  it('opens on the latest date and lists every date in the cell', () => {
    const { dashboard: d, breakdownDates } = dashboard();
    d.onHeatCell({ day: 'Thursday', hour: 22, key: '2026-09-24', keys: thursdays, value: 28 });
    expect(d.selectedCell()).toEqual({ date: '2026-09-24', hr: 22, day: 'Thursday', dates: thursdays });
    expect(breakdownDates).toEqual(['2026-09-24']);
  });

  it('reads another of the cell\'s dates when it is picked, and keeps the heatmap cell selected', () => {
    const { dashboard: d, breakdownDates } = dashboard();
    d.onHeatCell({ day: 'Thursday', hour: 22, key: '2026-09-24', keys: thursdays, value: 28 });
    d.pickDate('2026-09-10');
    expect(d.selectedCell()?.date).toBe('2026-09-10');
    expect(breakdownDates).toEqual(['2026-09-24', '2026-09-10']);
    expect(d.selectedHeat()).toEqual({ day: 'Thursday', hour: 22 });
  });

  it('ignores a date the cell does not hold', () => {
    const { dashboard: d, breakdownDates } = dashboard();
    d.onHeatCell({ day: 'Thursday', hour: 22, key: '2026-09-24', keys: thursdays, value: 28 });
    d.pickDate('2026-09-11');
    expect(d.selectedCell()?.date).toBe('2026-09-24');
    expect(breakdownDates).toHaveLength(1);
  });
});

describe('Dashboard running-now tile', () => {
  it('counts a run the engine has started as running', () => {
    const { dashboard: d } = dashboard({
      jobRunning: () => of({ status: 'SUCCESS', data: [
        { name: 'RUNNING', value: 2 }, { name: 'START', value: 1 },
        { name: 'FAILED', value: 4 }] }),
    });
    d.load();
    expect(d.runningNow()).toBe(3);
    expect(d.failed()).toBe(4);
  });
});
