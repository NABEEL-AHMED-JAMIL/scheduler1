import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Queue } from './queue';
import { ToastService } from '../../shared/ui/toast.service';

function queueFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      // ngOnInit is never called here, so nothing is fetched: every test seeds `rows` and
      // `statusStats` with exactly what fetchLogs would have returned.
      { provide: HttpClient, useValue: { post: () => of({ status: 'SUCCESS', data: {} }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Queue());
}

const row = (over: any = {}): any => ({
  jobQueueId: 1,
  jobId: 10,
  jobStatus: 'Completed',
  jobStatusMessage: '',
  dateCreated: '2026-09-08T10:00:00',
  startTime: '2026-09-08T10:00:00',
  endTime: '2026-09-08T10:00:02',
  runManual: false,
  jobSend: true,
  ...over,
});

const mixedRows = [
  row({ jobQueueId: 1, jobId: 10, jobStatus: 'Completed' }),
  row({ jobQueueId: 2, jobId: 10, jobStatus: 'Completed' }),
  row({ jobQueueId: 3, jobId: 20, jobStatus: 'Completed' }),
  row({ jobQueueId: 4, jobId: 20, jobStatus: 'Failed', jobStatusMessage: 'connection refused' }),
];

const total = (series: { value: number }[]) => series.reduce((sum, s) => sum + s.value, 0);

/**
 * Regression tests for the two populations this screen used to describe at once.
 *
 * The table rendered the filtered rows while the donut read `jobStatusStatistic` -- a
 * server-side count that QueryService.fetchJobQLog builds with no date clause, no job clause
 * and no status clause -- and every other chart read the unfiltered `rows()`. Filtering the
 * table therefore left the charts above it describing a different, larger set. Everything now
 * derives from the single `data()` computed.
 */
describe('Queue charts and table describe the same messages', () => {
  it('counts the outcome ring over the rows the table is actually listing', () => {
    const queue = queueFor();
    queue.rows.set(mixedRows);
    queue.search.set('20');

    // Two rows carry job 20, and those are the two the table pages.
    expect(queue.data().length).toBe(2);
    expect(queue.paged().length).toBe(2);
    expect(total(queue.statusMix())).toBe(queue.data().length);
    expect(queue.statusMix()).toEqual([{ name: 'Completed', value: 1 }, { name: 'Failed', value: 1 }]);
  });

  it('moves the failure rate with the filter instead of quoting the whole fetch', () => {
    const queue = queueFor();
    queue.rows.set(mixedRows);
    expect(queue.failureRate()).toBe(25);

    queue.search.set('connection');
    expect(queue.data().length).toBe(1);
    expect(queue.failureRate()).toBe(100);
  });

  it('ignores the server statistic when drawing the ring, and reports it separately', () => {
    const queue = queueFor();
    // What the Failed chip produces: the server returns only Failed rows, but its statistic
    // carries no status clause and no date clause, so it still answers for all time.
    queue.selectedStatuses.set(['Failed']);
    queue.rows.set([mixedRows[3]]);
    queue.statusStats.set([{ name: 'COMPLETED', value: 48 }, { name: 'FAILED', value: 4 }]);

    // The old ring drew a 48-slice Completed segment over a table holding one Failed row and
    // called the screen 8% failed.
    expect(queue.statusMix()).toEqual([{ name: 'Failed', value: 1 }]);
    expect(queue.failureRate()).toBe(100);
    // The all-time number survives, but only as its own labelled figure.
    expect(queue.allTimeTotal()).toBe(52);
  });

  it('narrows the busiest-jobs, duration and flag charts with the same filter', () => {
    const queue = queueFor();
    queue.rows.set([
      ...mixedRows,
      row({ jobQueueId: 5, jobId: 30, runManual: true, endTime: undefined }),
    ]);
    queue.search.set('30');

    expect(queue.data().length).toBe(1);
    expect(queue.byJob()).toEqual([{ name: 'Job 30', value: 1 }]);
    // The one matching row never ended, so no duration bucket has anything in it.
    expect(queue.durations()).toEqual([]);
    const started = queue.flagSplit()[0];
    expect(started.positive).toBe(1);
    expect(started.negative).toBe(0);
  });

  it('plots volume by day from the filtered rows, gaps still filled across the range', () => {
    const queue = queueFor();
    queue.fromDate.set('2026-09-06');
    queue.toDate.set('2026-09-08');
    queue.rows.set([
      row({ jobQueueId: 1, jobId: 10, dateCreated: '2026-09-06T09:00:00' }),
      row({ jobQueueId: 2, jobId: 20, dateCreated: '2026-09-08T09:00:00' }),
    ]);
    queue.search.set('20');

    const bars = queue.byDay();
    // Three days of axis for a one-day burst: the gap filling is unchanged, the population is
    // now the filtered one.
    expect(bars.length).toBe(3);
    expect(total(bars)).toBe(1);
    expect(bars.find(b => b.meta === '2026-09-08')!.value).toBe(1);
    expect(bars.find(b => b.meta === '2026-09-06')!.value).toBe(0);
  });

  it('keeps the charts panel hidden once a filter empties the table', () => {
    const queue = queueFor();
    queue.rows.set(mixedRows);
    expect(queue.hasInsights()).toBe(true);

    queue.search.set('no such message');
    expect(queue.hasInsights()).toBe(false);
  });
});

/**
 * The status chips are the filter control, not a chart, so they stay counted over the fetched
 * rows. Counting them over `data()` would delete the chip for the selected status the moment
 * the search excluded its last row, taking away the only control that can switch it back off.
 */
describe('Queue status chips', () => {
  it('counts over the fetched rows so a selected chip cannot disappear', () => {
    const queue = queueFor();
    queue.rows.set(mixedRows);
    queue.selectedStatuses.set(['Failed']);
    queue.search.set('no such message');

    expect(queue.data().length).toBe(0);
    expect(queue.counts()).toEqual([{ status: 'Completed', count: 3 }, { status: 'Failed', count: 1 }]);
  });
});

describe('Queue active-filter strip', () => {
  it('names the search term and each selected status', () => {
    const queue = queueFor();
    queue.search.set(' 20 ');
    queue.selectedStatuses.set(['Failed']);

    expect(queue.activeFilters()).toEqual([
      { key: 'search', label: 'Search', value: '20' },
      { key: 'status:Failed', label: 'Status', value: 'Failed' },
    ]);
  });

  it('clears the search filter without refetching', () => {
    const queue = queueFor();
    queue.rows.set(mixedRows);
    queue.search.set('connection');

    queue.clearFilter({ key: 'search', label: 'Search', value: 'connection' });
    expect(queue.search()).toBe('');
    expect(queue.data().length).toBe(mixedRows.length);
  });

  it('clears a status filter by toggling it off, which reloads', () => {
    const queue = queueFor();
    queue.selectedStatuses.set(['Failed']);

    queue.clearFilter({ key: 'status:Failed', label: 'Status', value: 'Failed' });
    expect(queue.selectedStatuses()).toEqual([]);
  });
});
