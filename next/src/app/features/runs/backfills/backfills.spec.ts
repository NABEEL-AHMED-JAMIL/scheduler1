import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { BackfillsApi } from './backfills.api';
import { Backfills } from './backfills';
import { BackfillDetail } from './backfill-detail';
import { Backfill, doneOf, durationText, lookOf, money, periodsText, progressParts } from './backfills.api';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/** MIG-347: Runs › Backfills -- the list with its progress, the actions, the detail on the right. */
const ROW: Backfill = {
  backfillId: 12, jobId: 51, jobName: 'Synthetic daily intake', status: 'RUNNING', step: 'DAILY', from: '2026-09-29', to: '2026-10-12',
  zone: 'America/Chicago', concurrency: 2, rerunCompleted: false, parameters: { region: 'south' }, total: 14,
  counts: { pending: 6, queued: 2, completed: 4, failed: 1, skipped: 1, cancelled: 0 }, done: 6, holdReason: null, createdBy: 4640,
  createdVia: 'console', dateCreated: '2026-10-13T15:00:00Z', endedAt: null, pausedAt: null,
  eta: { seconds: 260, at: '2026-10-13T15:10:00Z', basis: '8 left' },
};

function page(query: Record<string, string> = {}, canOpen = true) {
  const opened: { component: unknown; data: any }[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Backfills],
    providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: Router, useValue: { navigate: vi.fn(), createUrlTree: () => ({}), serializeUrl: () => '', events: of() } },
      { provide: Dialog, useValue: { open: (component: unknown, config: { data: unknown }) => { opened.push({ component, data: config.data }); return { closed: of(false) }; } } },
      { provide: AuthService, useValue: { canOpen: () => canOpen } },
      { provide: ToastService, useValue: toast }],
  });
  const fixture = TestBed.createComponent(Backfills);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, opened, toast, el: fixture.nativeElement as HTMLElement };
}

describe('Runs › Backfills', () => {
  it('lists every backfill with its progress and status, newest first', () => {
    const { fixture, http, el } = page();
    const list = http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills'));
    expect(list.request.params.get('page')).toBe('1');
    expect(list.request.params.getAll('status')).toBeNull();
    list.flush({ status: API_SUCCESS, data: { rows: [ROW], total: 1, page: 1, limit: 25, maxOpen: 3, maxConcurrency: 4 } });
    fixture.detectChanges();
    const row = el.querySelector('[data-backfill="12"]')!;
    expect(row.textContent).toContain('Synthetic daily intake');
    expect(row.textContent).toContain('14 days');
    expect(row.querySelector('[data-test="backfill-progress"]')!.textContent).toMatch(/6 of 14\s*·\s*1 failed\s*·\s*2 running\s*·\s*1 skipped/);
    expect(row.querySelector('[data-test="backfill-status"]')!.textContent!.trim()).toBe('Running');
    expect(row.textContent).toContain('region = south');
    expect(row.querySelector('[aria-label="Pause backfill #12"]')).toBeTruthy();
    expect(row.querySelector('[aria-label="Retry the failed periods of backfill #12"]')).toBeTruthy();
  });

  it('pauses from its row and reads the list again', () => {
    const { fixture, http, el, toast } = page();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills')).flush({ status: API_SUCCESS, data: { rows: [ROW], total: 1, page: 1 } });
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[aria-label="Pause backfill #12"]')!.click();
    const pause = http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills/pause'));
    expect(pause.request.body).toEqual({ backfillId: 12 });
    pause.flush({ status: API_SUCCESS, message: 'Backfill paused: nothing more is queued until it is resumed.' });
    expect(toast.success).toHaveBeenCalledWith('Backfill paused: nothing more is queued until it is resumed.');
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills'));
  });

  it('offers no action to a reader without Schedules', () => {
    const { fixture, http, el } = page({}, false);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills')).flush({ status: API_SUCCESS, data: { rows: [ROW], total: 1, page: 1 } });
    fixture.detectChanges();
    expect(el.querySelector('[aria-label="Pause backfill #12"]')).toBeNull();
  });

  it('opens the backfill a link names, over the right', () => {
    const { opened } = page({ backfill: '12' });
    expect(opened).toHaveLength(1);
    expect(opened[0].component).toBe(BackfillDetail);
    expect(opened[0].data).toEqual({ backfillId: 12, canAct: true });
  });

  it('says how to start one when there is none', () => {
    const { fixture, http, el } = page();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills')).flush({ status: API_SUCCESS, data: { rows: [], total: 0, page: 1 } });
    fixture.detectChanges();
    expect(el.textContent).toContain('Backfill…');
  });
});

describe('backfill words', () => {
  it('counts periods, money, progress and time as a person reads them', () => {
    expect(periodsText(14, 'DAILY')).toBe('14 days');
    expect(periodsText(1, 'HOURLY')).toBe('1 hour');
    expect(money('1.42', 'USD')).toBe('$1.42');
    expect(money(0.00312, 'USD')).toBe('$0.0031');
    expect(money(null, 'USD')).toBe('—');
    expect(progressParts(ROW)).toEqual({ completed: 35.7, failed: 7.1, running: 14.3, waiting: 42.9 });
    expect(durationText(30)).toBe('under a minute');
    expect(durationText(260)).toBe('about 4 min');
    expect(durationText(7800)).toBe('about 2 h 10 min');
    expect(lookOf('PAUSED')).toEqual({ tone: 'warn', icon: 'pause', word: 'Paused' });
    expect(lookOf('QUEUED').word).toBe('Running');
    // A cancelled period never ran: not done.
    expect(doneOf({ counts: { ...ROW.counts, cancelled: 3 } })).toBe(6);
  });
});

describe('Runs › Backfills -- loading, empty, error (owner 2026-10-27)', () => {
  it('shows a skeleton, not an empty card, until the list answers, then says none is there', () => {
    const { fixture, http, el } = page();
    expect(el.querySelector('app-loading')).not.toBeNull();
    expect(el.querySelector('[data-test="backfills-list"]')).toBeNull();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills'))
      .flush({ status: API_SUCCESS, data: { rows: [], total: 0, page: 1, limit: 25, maxOpen: 3, maxConcurrency: 4 } });
    fixture.detectChanges();
    expect(el.textContent).toContain('No backfills');
  });

  it('says the list could not be read, with Try again', () => {
    const { fixture, http, el } = page();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills')).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain('The backfills could not be read.');
    [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Try again')!.click();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills'));
  });

  it('keeps the list when a quiet poll fails', () => {
    const { fixture, http, el } = page();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills'))
      .flush({ status: API_SUCCESS, data: { rows: [ROW], total: 1, page: 1, limit: 25, maxOpen: 3, maxConcurrency: 4 } });
    fixture.componentInstance.load(true);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills')).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('');
    expect(el.querySelector('[data-backfill="12"]')).not.toBeNull();
  });
});

describe('Backfill detail -- loading and errors (owner 2026-10-27)', () => {
  function detail(answer: () => Observable<unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: DIALOG_DATA, useValue: { backfillId: 12, canAct: true } },
      { provide: BackfillsApi, useValue: { detail: () => answer() } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ] });
    const panel = TestBed.runInInjectionContext(() => new BackfillDetail());
    panel.ngOnInit();
    return panel;
  }

  it('is loading until the backfill answers', () => {
    const panel = detail(() => NEVER);
    expect(panel.loading()).toBe(true);
    expect(panel.backfill()).toBeNull();
  });

  it('says why it could not be read, and keeps the backfill when a later filter fails', () => {
    let answer: () => Observable<unknown> = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const panel = detail(() => answer());
    expect(panel.loading()).toBe(false);
    expect(panel.error()).toBe('The backfill could not be read.');
    answer = () => of({ status: API_SUCCESS, data: { ...ROW, periods: [] } });
    panel.load();
    expect(panel.error()).toBe('');
    answer = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    panel.pick('FAILED');
    expect(panel.backfill()?.backfillId).toBe(12);
    expect(panel.error()).toBe('The backfill could not be read.');
  });
});
