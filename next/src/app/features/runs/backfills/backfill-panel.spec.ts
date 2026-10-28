import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { BackfillPanel, defaultRange } from './backfill-panel';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * MIG-347: "Backfill…" -- the inputs ask the server for a preview (the periods, which already completed, the estimate), and
 * Start sends the same request; a refusal is said in the panel, which stays open.
 */
const PREVIEW = {
  jobId: 51, jobName: 'Synthetic daily intake', zone: 'America/Chicago', step: 'DAILY', from: '2026-09-29', to: '2026-10-12', periods: 14,
  alreadyCompleted: 2, willRun: 12, rerunCompleted: false, concurrency: 2, maxConcurrency: 4, maxPeriods: 366,
  dates: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, start: `2026-10-${String(i + 1).padStart(2, '0')}T05:00:00Z`,
    end: 'x', completed: i < 2 })),
  parameters: [{ name: 'region', type: 'choice', choices: ['north', 'south'], default: 'north' }],
  values: { region: 'north' }, warnings: [], openBackfills: 0, maxOpen: 3,
  estimate: { perRun: 0.1, total: 1.2, currency: 'USD', basis: 'The average of 5 billed run(s) of this schedule in the last 30 days x 12 run(s).' },
};

function panel() {
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [BackfillPanel], providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: { jobId: 51, jobName: 'Synthetic daily intake', readsCosts: true } },
    { provide: DialogRef, useValue: { close } }] });
  const fixture = TestBed.createComponent(BackfillPanel);
  fixture.detectChanges();
  return { fixture, close, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

describe('Backfill…', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks for a preview of the fourteen days before today, and shows what will run and cost', () => {
    const { fixture, http, el } = panel();
    vi.advanceTimersByTime(300);
    const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/backfills/preview'));
    expect(ask.request.body).toEqual({ jobId: 51, ...defaultRange(), preset: undefined, step: 'DAILY', concurrency: 2, rerunCompleted: false,
      parameters: null });
    ask.flush({ status: API_SUCCESS, data: PREVIEW });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="backfill-will-run"]')!.textContent!.trim()).toBe('12');
    expect(el.querySelectorAll('.bf-date.is-done')).toHaveLength(2);
    expect(el.querySelector('[data-test="backfill-estimate"]')!.textContent).toContain('$1.20');
    expect(el.querySelector('[data-test="run-parameters"]')).toBeTruthy();
    const start = el.querySelector<HTMLButtonElement>('[data-test="backfill-start"]')!;
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain('Start: 12 days');
  });

  it('starts it with the values chosen and closes with the backfill', () => {
    const { fixture, http, el, close } = panel();
    vi.advanceTimersByTime(300);
    http.expectOne(r => r.url.endsWith('/backfills/preview')).flush({ status: API_SUCCESS, data: PREVIEW });
    fixture.detectChanges();
    const region = el.querySelector<HTMLSelectElement>('#backfill-param-region')!;
    region.value = 'south';
    region.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    const again = http.expectOne(r => r.url.endsWith('/backfills/preview'));
    expect(again.request.body.parameters).toEqual({ region: 'south' });
    again.flush({ status: API_SUCCESS, data: { ...PREVIEW, values: { region: 'south' } } });
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-test="backfill-start"]')!.click();
    const start = http.expectOne(r => r.url.endsWith('/backfills/start'));
    expect(start.request.body.parameters).toEqual({ region: 'south' });
    start.flush({ status: API_SUCCESS, data: { backfillId: 12, total: 14 } });
    expect(close).toHaveBeenCalledWith({ backfillId: 12, total: 14 });
  });

  it('says why when the server refuses, and offers no Start', () => {
    const { fixture, http, el } = panel();
    vi.advanceTimersByTime(300);
    http.expectOne(r => r.url.endsWith('/backfills/preview'))
      .flush({ status: 'ERROR', message: 'The schedule is switched off; switch it on to backfill it.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="backfill-problem"]')!.textContent).toContain('switched off');
    expect(el.querySelector<HTMLButtonElement>('[data-test="backfill-start"]')!.disabled).toBe(true);
  });

  it('offers no Start when the workspace has as many open backfills as it may', () => {
    const { fixture, http, el } = panel();
    vi.advanceTimersByTime(300);
    http.expectOne(r => r.url.endsWith('/backfills/preview')).flush({ status: API_SUCCESS, data: { ...PREVIEW, openBackfills: 3,
      warnings: ['This workspace has 3 open backfills, the most it may have at once; wait for one to finish or cancel one.'] } });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="backfill-warning"]')!.textContent).toContain('3 open backfills');
    expect(el.querySelector<HTMLButtonElement>('[data-test="backfill-start"]')!.disabled).toBe(true);
  });
});

describe('Backfill… preview -- Try again (owner 2026-10-27)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the same preview again from the problem line', () => {
    const { fixture, http, el } = panel();
    vi.advanceTimersByTime(300);
    http.expectOne(r => r.url.endsWith('/backfills/preview')).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="backfill-problem"]')!.textContent).toContain('could not be worked out');
    ([...el.querySelectorAll('[data-test="backfill-problem"] button')].find(b => b.textContent!.trim() === 'Try again') as HTMLButtonElement).click();
    vi.advanceTimersByTime(300);
    http.expectOne(r => r.url.endsWith('/backfills/preview')).flush({ status: API_SUCCESS, data: PREVIEW });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="backfill-problem"]')).toBeNull();
  });
});
