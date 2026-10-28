import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { BackfillDetail } from './backfill-detail';
import { Backfill, BackfillPeriod } from './backfills.api';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * Owner 2026-10-27 ("add a sort on each table"): a backfill's periods sort on the server by Date, State, Run and Tries.
 * The calendar order (Date, oldest first) is the list's own and sends no sort; a header sends Core's column and direction
 * from the first page; the page buttons keep it and stop saying Earlier/Later; Note has no sort.
 */
const period = (n: number): BackfillPeriod => ({
  date: `2026-05-${String(n).padStart(2, '0')}`, start: `2026-05-${String(n).padStart(2, '0')}T05:00:00Z`,
  end: `2026-05-${String(n + 1).padStart(2, '0')}T05:00:00Z`, state: n % 2 ? 'COMPLETED' : 'FAILED', jobQueueId: 7000 + n, tries: 1, note: null,
  runStatus: null, runStartedAt: null, runEndedAt: null,
});

const BACKFILL = (periods: BackfillPeriod[]): Backfill => ({
  backfillId: 12, jobId: 51, jobName: 'Synthetic daily intake', status: 'RUNNING', step: 'DAILY', from: '2026-05-01', to: '2026-08-28',
  zone: 'America/Chicago', concurrency: 2, rerunCompleted: false, parameters: {}, total: 120,
  counts: { pending: 0, queued: 0, completed: 60, failed: 60, skipped: 0, cancelled: 0 }, done: 60, holdReason: null, createdBy: 4640,
  createdVia: 'console', dateCreated: '2026-10-13T15:00:00Z', endedAt: null, pausedAt: null, eta: null, periods,
} as Backfill);

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [BackfillDetail], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: DialogRef, useValue: { close: () => {} } },
    { provide: DIALOG_DATA, useValue: { backfillId: 12, canAct: false } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } }] });
  const fixture = TestBed.createComponent(BackfillDetail);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, el: fixture.nativeElement as HTMLElement, panel: fixture.componentInstance };
}

const reads = (http: HttpTestingController) => http.match(r => r.url.endsWith('/sourceJob.json/backfills/detail'));
const full = BACKFILL(Array.from({ length: 100 }, (_, i) => period(i + 1)));

describe('Backfill periods sorting (server)', () => {
  beforeEach(() => localStorage.clear());

  it('sends no sort for the calendar order, then the column and direction from the first page', () => {
    const { fixture, http, el, panel } = mount();
    const [first] = reads(http);
    expect(first.request.params.get('sort')).toBeNull();
    expect(first.request.params.get('page')).toBe('1');
    first.flush({ status: API_SUCCESS, data: full });
    fixture.detectChanges();
    panel.go(2);
    reads(http).forEach(r => r.flush({ status: API_SUCCESS, data: full }));
    fixture.detectChanges();

    (el.querySelector('th[appSort="state"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    let [read] = reads(http);
    expect(read.request.params.get('sort')).toBe('state');
    expect(read.request.params.get('dir')).toBe('asc');
    expect(read.request.params.get('page')).toBe('1');
    read.flush({ status: API_SUCCESS, data: full });
    fixture.detectChanges();
    expect(el.textContent).toContain('Next 100');
    expect(el.textContent).not.toContain('Later');

    panel.go(2);
    [read] = reads(http);
    expect(read.request.params.get('sort')).toBe('state');
    expect(read.request.params.get('page')).toBe('2');
    read.flush({ status: API_SUCCESS, data: full });
  });

  it('Date flips to newest first and back to the calendar, which sends no sort again', () => {
    const { http, panel } = mount();
    reads(http).forEach(r => r.flush({ status: API_SUCCESS, data: full }));
    expect(panel.sort.state()).toEqual({ key: 'date', direction: 'asc' });
    panel.sort.toggle('date');
    let [read] = reads(http);
    expect(read.request.params.get('sort')).toBe('date');
    expect(read.request.params.get('dir')).toBe('desc');
    read.flush({ status: API_SUCCESS, data: full });
    panel.sort.toggle('date');
    [read] = reads(http);
    expect(read.request.params.get('sort')).toBeNull();
    read.flush({ status: API_SUCCESS, data: full });
    panel.sort.toggle('run');
    expect(reads(http)[0].request.params.get('dir')).toBe('desc');
  });

  it('has sort headers on Date, State, Run and Tries, not Note', () => {
    const { fixture, http, el } = mount();
    reads(http).forEach(r => r.flush({ status: API_SUCCESS, data: full }));
    fixture.detectChanges();
    const sortable = [...el.querySelectorAll('[data-test="backfill-periods"] thead th')].filter(th => th.querySelector('button.th-sort'))
      .map(th => th.textContent?.trim());
    expect(sortable).toEqual(['Date', 'State', 'Run', 'Tries']);
  });
});
