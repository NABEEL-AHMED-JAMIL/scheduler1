import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ApplicationRef, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Dashboard } from './dashboard';
import { DashboardService } from './dashboard.service';
import { ToastService } from '../../shared/ui/toast.service';
import { JobEvent, JobEventsService } from '../../core/socket/job-events.service';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { AuthService } from '../../core/auth/auth.service';

type Answers = Partial<Record<'jobStatus' | 'jobRunning' | 'hourly' | 'breakdown', () => unknown>>;
const ok = () => of({ status: 'SUCCESS', data: [] });

function dashboard(answers: Answers = {}, query: Record<string, string> = {}, events = new Subject<JobEvent>(), connected = signal(true)) {
  const calls: string[] = [];
  const navigations: { commands: unknown[]; extras: any }[] = [];
  const service: Record<string, unknown> = {};
  const breakdownDates: string[] = [];
  const ranges: string[] = [];
  for (const name of ['jobStatus', 'jobRunning', 'hourly', 'breakdown'] as const) {
    service[name] = (...args: unknown[]) => {
      calls.push(name);
      if (name === 'breakdown') breakdownDates.push(String(args[0]));
      else ranges.push(`${args[0]}..${args[1]}`);
      return (answers[name] ?? ok)();
    };
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DashboardService, useValue: service },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: 0 }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: (commands: unknown[], extras: unknown) => { navigations.push({ commands, extras }); } } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: JobEventsService, useValue: { events, connected } },
      { provide: AuthService, useValue: { canOpen: () => true } },
    ],
  });
  return { dashboard: TestBed.runInInjectionContext(() => new Dashboard()), calls, breakdownDates, ranges, navigations };
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
    expect(d.errors().running).toBeTruthy();
  });

  it('keeps the server\'s sentence for a refused chart', () => {
    const { dashboard: d } = dashboard({ hourly: () => of({ status: 'ERROR', message: 'Hourly figures are unavailable.' }) });
    d.load();
    expect(d.errors().hourly).toBe('Hourly figures are unavailable.');
  });

  it('clears the error when Try again succeeds', () => {
    let fail = true;
    const { dashboard: d } = dashboard({ hourly: () => fail ? of({ status: 'ERROR', message: 'Busy.' }) : ok() });
    d.load();
    fail = false;
    d.load();
    expect(d.errors()).toEqual({});
    expect(d.error()).toBe('');
  });

  /**
   * One failed read used to replace every tile and chart with a single error card, so a slow
   * heatmap took the job counts and the Unread link down with it. Only the part that failed now
   * says so; the rest keeps its figures.
   */
  it('keeps the other figures when only one read fails', () => {
    const { dashboard: d } = dashboard({
      jobStatus: () => of({ status: 'SUCCESS', data: [{ name: 'All', value: 9 }] }),
      jobRunning: () => of({ status: 'SUCCESS', data: [{ name: 'FAILED', value: 2 }] }),
      hourly: () => throwError(() => ({ error: { message: 'Internal Server Error' } })),
    });
    d.load();
    expect(d.errors()).toEqual({ hourly: 'Internal Server Error' });
    expect(d.error()).toBe('');
    expect(d.totalJobs()).toBe(9);
    expect(d.failed()).toBe(2);
  });

  it('shows one page-level reason when every read is refused for the same reason', () => {
    const refused = () => of({ status: 'ERROR', message: 'Invalid date.' });
    const { dashboard: d } = dashboard({ jobStatus: refused, jobRunning: refused, hourly: refused });
    d.load();
    expect(d.error()).toBe('Invalid date.');
  });

  it('keeps separate reasons when the reads fail differently', () => {
    const { dashboard: d } = dashboard({
      jobStatus: () => of({ status: 'ERROR', message: 'A.' }),
      jobRunning: () => of({ status: 'ERROR', message: 'B.' }),
      hourly: () => of({ status: 'ERROR', message: 'A.' }),
    });
    d.load();
    expect(d.error()).toBe('');
    expect(d.errors()).toEqual({ status: 'A.', running: 'B.', hourly: 'A.' });
  });

  it('reads only the failed part again on its Try again', () => {
    let fail = true;
    const { dashboard: d, calls } = dashboard({ jobRunning: () => fail ? throwError(() => ({ error: {} })) : ok() });
    d.load();
    calls.length = 0;
    fail = false;
    d.retry('running');
    expect(calls).toEqual(['jobRunning']);
    expect(d.errors()).toEqual({});
    expect(d.loading()).toBe(false);
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

/**
 * The date boxes had no check: From after To answered SUCCESS with zeros that read like a quiet
 * week, a cleared box sent an empty date the server refused, and the subtitle claimed the half-typed
 * range before Apply was pressed. The page now says what is wrong and keeps showing the range it
 * last read.
 */
describe('Dashboard date range', () => {
  it('refuses an inverted range, says why, and sends nothing', () => {
    const { dashboard: d, calls } = dashboard();
    d.startDate.set('2026-09-24');
    d.endDate.set('2026-09-20');
    expect(d.rangeError()).toBe('From must be on or before To.');
    d.applyRange();
    expect(calls).toEqual([]);
  });

  it('refuses a cleared date', () => {
    const { dashboard: d, calls } = dashboard();
    d.startDate.set('');
    expect(d.rangeError()).toBe('Pick a date in both fields.');
    d.applyRange();
    expect(calls).toEqual([]);
  });

  it('keeps describing the applied range until Apply is pressed', () => {
    const { dashboard: d } = dashboard();
    const shown = d.appliedStart();
    d.startDate.set('2026-01-01');
    expect(d.appliedStart()).toBe(shown);
    d.applyRange();
    expect(d.appliedStart()).toBe('2026-01-01');
  });

  it('reads the applied range on Try again, not a half-edited one', () => {
    const { dashboard: d, ranges } = dashboard();
    d.startDate.set('2026-09-01');
    d.endDate.set('2026-09-07');
    d.applyRange();
    d.startDate.set('');
    ranges.length = 0;
    d.load();
    expect(ranges.every(r => r === '2026-09-01..2026-09-07')).toBe(true);
    expect(ranges.length).toBeGreaterThan(0);
  });
});

/**
 * Queue volume by day drew one bar per day that had runs, labelled only with the weekday: over a
 * month "Thu" appeared four times, and a quiet day simply vanished, so two bursts a week apart sat
 * side by side like steady traffic.
 */
describe('Dashboard queue volume by day', () => {
  const cell = (date: string, dayCode: string, hr: number, count: number) => ({ date, dayCode, hr, count });

  it('draws every day of the applied range, quiet days at zero', () => {
    const { dashboard: d } = dashboard({
      hourly: () => of({ status: 'SUCCESS', data: [
        cell('2026-09-18', 'Friday', 9, 4), cell('2026-09-24', 'Thursday', 22, 30), cell('2026-09-24', 'Thursday', 23, 5)] }),
    });
    d.startDate.set('2026-09-18');
    d.endDate.set('2026-09-24');
    d.applyRange();
    const bars = d.dayBars();
    expect(bars.map(b => b.value)).toEqual([4, 0, 0, 0, 0, 0, 35]);
    expect(bars[0].name).toBe('Fri 18');
    expect(bars[6].name).toBe('Thu 24');
  });

  it('names each day by its date over a longer range, so no label repeats', () => {
    const { dashboard: d } = dashboard({
      hourly: () => of({ status: 'SUCCESS', data: [cell('2026-09-03', 'Thursday', 9, 1), cell('2026-09-10', 'Thursday', 9, 2)] }),
    });
    d.startDate.set('2026-09-01');
    d.endDate.set('2026-09-30');
    d.applyRange();
    const names = d.dayBars().map(b => b.name);
    expect(names).toHaveLength(30);
    expect(new Set(names).size).toBe(30);
    expect(names[2]).toBe('09-03');
  });

  it('keeps the empty state when the range has no runs at all', () => {
    const { dashboard: d } = dashboard();
    d.load();
    expect(d.dayBars()).toEqual([]);
  });
});

/**
 * A slow read from an earlier Apply used to land after the newer one and overwrite its tiles, and
 * turn the loader off while the newer reads were still out. The same for two hour cells clicked in
 * quick succession: the first hour's jobs could fill the second hour's table.
 */
describe('Dashboard answers that arrive out of order', () => {
  it('keeps the newer range when the older one answers last', () => {
    const pending: Subject<unknown>[] = [];
    const { dashboard: d } = dashboard({ jobStatus: () => { const s = new Subject<unknown>(); pending.push(s); return s; } });
    d.load();
    d.startDate.set('2026-09-01');
    d.applyRange();
    const [older, newer] = pending;
    newer.next({ status: 'SUCCESS', data: [{ name: 'All', value: 7 }] });
    older.next({ status: 'SUCCESS', data: [{ name: 'All', value: 99 }] });
    expect(d.totalJobs()).toBe(7);
    expect(d.loading()).toBe(false);
  });

  it('stays loading while the newer reads are out, whatever the older ones do', () => {
    const pending: Subject<unknown>[] = [];
    const { dashboard: d } = dashboard({ jobStatus: () => { const s = new Subject<unknown>(); pending.push(s); return s; } });
    d.load();
    d.load();
    pending[0].next({ status: 'SUCCESS', data: [] });
    expect(d.loading()).toBe(true);
  });

  it('fills the table with the hour picked last', () => {
    const pending: Subject<unknown>[] = [];
    const { dashboard: d } = dashboard({ breakdown: () => { const s = new Subject<unknown>(); pending.push(s); return s; } });
    d.selectCell('2026-09-20', 9, 4);
    d.selectCell('2026-09-21', 10, 2);
    pending[1].next({ status: 'SUCCESS', data: [{ jobId: 2, jobName: 'B', total: 2 }] });
    pending[0].next({ status: 'SUCCESS', data: [{ jobId: 1, jobName: 'A', total: 4 }] });
    expect(d.breakdownRows().map(r => r.jobId)).toEqual([2]);
  });

  it('ignores an hour that answers after the table was closed', () => {
    const pending: Subject<unknown>[] = [];
    const { dashboard: d } = dashboard({ breakdown: () => { const s = new Subject<unknown>(); pending.push(s); return s; } });
    d.selectCell('2026-09-20', 9, 4);
    d.clearCell();
    pending[0].next({ status: 'SUCCESS', data: [{ jobId: 1, jobName: 'A', total: 4 }] });
    expect(d.breakdown()).toEqual([]);
  });
});

/**
 * The drill-down opens below the heatmap, which on a laptop is below the fold: a click seemed to do
 * nothing. The table is now brought into view and takes focus, so a keyboard or screen-reader user
 * lands on what just opened.
 */
describe('Dashboard drill-down opening', () => {
  afterEach(() => document.getElementById('dash-drill')?.remove());

  it('scrolls the table into view and moves focus to it', () => {
    const { dashboard: d } = dashboard();
    const drill = document.createElement('section');
    drill.id = 'dash-drill';
    drill.tabIndex = -1;
    const scrolled = vi.fn();
    drill.scrollIntoView = scrolled;
    document.body.appendChild(drill);

    d.selectCell('2026-09-20', 9, 4);
    TestBed.inject(ApplicationRef).tick();

    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(drill);
  });
});

/**
 * Back from a count's run history landed on a fresh dashboard: the range, the hour and the search
 * were gone, and finding the same hour again meant starting over. The view now lives in the address
 * (replacing it, so no extra history entries), and the page reads it back when it opens.
 */
describe('Dashboard view in the address', () => {
  const lastQuery = (navigations: { extras: any }[]) => navigations[navigations.length - 1].extras;

  it('writes the applied range, the hour and the search into the address, in place', () => {
    const { dashboard: d, navigations } = dashboard();
    d.startDate.set('2026-09-18');
    d.endDate.set('2026-09-24');
    d.applyRange();
    expect(lastQuery(navigations)).toMatchObject({ replaceUrl: true,
      queryParams: { from: '2026-09-18', to: '2026-09-24', date: null, hr: null, q: null } });
    d.selectCell('2026-09-24', 22, 5, 'Thursday');
    expect(lastQuery(navigations).queryParams).toMatchObject({ date: '2026-09-24', hr: 22 });
    d.onBreakdownSearch('nightly');
    expect(lastQuery(navigations).queryParams.q).toBe('nightly');
    d.clearCell();
    expect(lastQuery(navigations).queryParams).toMatchObject({ date: null, hr: null, q: null });
  });

  it('opens on the range, hour and search the address names', () => {
    const { dashboard: d, ranges, breakdownDates } = dashboard({}, {
      from: '2026-09-22', to: '2026-09-24', date: '2026-09-24', hr: '22', q: 'UI-REVIEW' });
    d.ngOnInit();
    expect(d.appliedStart()).toBe('2026-09-22');
    expect(d.startDate()).toBe('2026-09-22');
    expect(ranges[0]).toBe('2026-09-22..2026-09-24');
    expect(d.selectedCell()).toMatchObject({ date: '2026-09-24', hr: 22, day: 'Thursday' });
    expect(breakdownDates).toEqual(['2026-09-24']);
    expect(d.breakdownSearch()).toBe('UI-REVIEW');
  });

  it('lists every date of the restored cell once the hours have loaded', () => {
    const { dashboard: d } = dashboard({ hourly: () => of({ status: 'SUCCESS', data: [
      { date: '2026-09-17', dayCode: 'Thursday', hr: 22, count: 3 },
      { date: '2026-09-24', dayCode: 'Thursday', hr: 22, count: 2 },
      { date: '2026-09-24', dayCode: 'Thursday', hr: 9, count: 1 }] }) },
      { from: '2026-09-11', to: '2026-09-24', date: '2026-09-24', hr: '22' });
    d.ngOnInit();
    expect(d.selectedCell()?.dates).toEqual(['2026-09-17', '2026-09-24']);
  });

  it('ignores an address it cannot read', () => {
    const { dashboard: d, breakdownDates } = dashboard({}, { from: '2026-09-24', to: '2026-09-01', date: 'soon', hr: '31' });
    const start = d.startDate();
    d.ngOnInit();
    expect(d.startDate()).toBe(start);
    expect(d.selectedCell()).toBeNull();
    expect(breakdownDates).toEqual([]);
  });
});

/**
 * The dashboard read once and never again: Running now stayed at whatever it was when the page
 * opened, and the Unread tile kept its own copy of the count, so marking everything read in the
 * bell left it lit.
 */
describe('Dashboard staying current', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the same unread count the bell does', () => {
    const { dashboard: d } = dashboard();
    d.load();
    TestBed.inject(UnreadCountService).count.set(7);
    expect(d.unread()).toBe(7);
    TestBed.inject(UnreadCountService).clear();
    expect(d.unread()).toBe(0);
  });

  it('re-reads the figures once, quietly, after a burst of job events', () => {
    vi.useFakeTimers();
    const events = new Subject<JobEvent>();
    const { dashboard: d, calls } = dashboard({}, {}, events);
    d.load();
    calls.length = 0;
    for (let i = 0; i < 5; i++) events.next({ type: 'job.status', jobId: i });
    events.next({ type: 'job.log', jobId: 1 });
    expect(calls).toEqual([]);
    const loadingSeen: boolean[] = [];
    vi.advanceTimersByTime(2000);
    loadingSeen.push(d.loading());
    expect(calls.sort()).toEqual(['hourly', 'jobRunning', 'jobStatus']);
    expect(loadingSeen).toEqual([false]);
  });

  it('ignores log lines, which change no figure', () => {
    vi.useFakeTimers();
    const events = new Subject<JobEvent>();
    const { dashboard: d, calls } = dashboard({}, {}, events);
    d.load();
    calls.length = 0;
    events.next({ type: 'job.log', jobId: 1, message: 'line' });
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual([]);
  });

  it('polls every minute while the live feed is down, and not while it is up', () => {
    vi.useFakeTimers();
    const connected = signal(true);
    const { dashboard: d, calls } = dashboard({}, {}, new Subject<JobEvent>(), connected);
    d.ngOnInit();
    calls.length = 0;
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual([]);
    connected.set(false);
    vi.advanceTimersByTime(60_000);
    expect(calls.sort()).toEqual(['hourly', 'jobRunning', 'jobStatus']);
  });

  it('keeps the figures it has when a background read fails', () => {
    vi.useFakeTimers();
    let fail = false;
    const events = new Subject<JobEvent>();
    const { dashboard: d } = dashboard({ jobStatus: () => fail ? throwError(() => ({ error: {} })) : of({ status: 'SUCCESS', data: [{ name: 'All', value: 9 }] }) }, {}, events);
    d.load();
    fail = true;
    events.next({ type: 'job.status', jobId: 1 });
    vi.advanceTimersByTime(2000);
    expect(d.errors()).toEqual({});
    expect(d.totalJobs()).toBe(9);
  });

  it('says when the figures were last read', () => {
    const { dashboard: d } = dashboard();
    expect(d.updatedAt()).toBeNull();
    d.load();
    expect(d.updatedAt()).toBeInstanceOf(Date);
  });
});
