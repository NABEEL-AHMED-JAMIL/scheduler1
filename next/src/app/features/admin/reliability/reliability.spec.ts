import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { Reliability, budgetLeft, dayBars, formatRate } from './reliability';
import { BillingSlo, BurnRate, PipelineRunsSlo } from './reliability.service';

/**
 * MIG-196: the Reliability page -- both 99.99% objectives from their owners' stored rows, the error budget left, what
 * the bad and the left-out runs were, and the burn rates the alert rules watch.
 */

const RUNS_URL = `${API_BASE}/reliability.json/pipelineRuns`;
const BILLING_URL = `${API_BASE}/billing.json/reliability`;
const BURN_URL = `${API_BASE}/reliability.json/burnRates`;

const RUNS: PipelineRunsSlo = {
  sli: 'pipeline_execution', from: '2026-09-01T17:00:00Z', to: '2026-09-29T17:00:00Z', target: 0.9999,
  good: 19_997, bad: 3, excluded: 44, numerator: 19_997, denominator: 20_000, successRate: 0.99985,
  budgetSpent: 1.5, errorBudgetRemaining: -0.5, errorBudgetRuns: 2,
  groups: [
    { outcome: 'Completed', reason: 'WORKER', slo: 'good', runs: 19_997 },
    { outcome: 'Failed', reason: 'DECLINED', slo: 'bad', runs: 1 },
    { outcome: 'Interrupt', reason: 'STALLED', slo: 'bad', runs: 2 },
    { outcome: 'Failed', reason: 'AI_STEP', slo: 'excluded', runs: 4 },
    { outcome: 'Skip', reason: 'SKIPPED', slo: 'excluded', runs: 40 },
  ],
  daily: [{ day: '2026-09-28', good: 700, bad: 3, excluded: 2, successRate: 700 / 703 }],
};

const BILLING: BillingSlo = {
  sli: 'billing_events_priced', from: '2026-09-01T17:00:00Z', to: '2026-09-29T17:00:00Z', asOf: '2026-09-29T17:00:00Z',
  target: 0.9999, good: 10_000, bad: 0, unpriced: 0, unrolled: 0, pending: 2, numerator: 10_000, denominator: 10_000,
  successRate: 1, budgetSpent: 0, errorBudgetRemaining: 1, errorBudgetEvents: 1,
  meters: [{ meter: 'pipeline.runs', accepted: 10_000, priced: 10_000, unpriced: 0, unrolled: 0, pending: 2 }],
  daily: [{ day: '2026-09-29', good: 10_000, bad: 0, unpriced: 0, unrolled: 0, pending: 2, successRate: 1 }],
};

const burn = (sli: string, rule: string, firing: boolean, rate: number | null): BurnRate => ({
  sli, rule, severity: rule.startsWith('PAGE') ? 'page' : 'ticket', threshold: rule === 'PAGE_1H' ? 14.4 : 6,
  asOf: '2026-09-29T17:00:00Z', firing, unmeasured: null,
  long: { window: '1h', good: 990, bad: 10, burnRate: rate }, short: { window: '5m', good: 90, bad: 10, burnRate: rate },
});

function screen() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Reliability], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Reliability);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http };
}

function answerAll(s: ReturnType<typeof screen>, burns: BurnRate[] = []) {
  s.http.expectOne(r => r.url === RUNS_URL).flush({ status: API_SUCCESS, message: '', data: RUNS });
  s.http.expectOne(r => r.url === BILLING_URL).flush({ status: API_SUCCESS, message: '', data: BILLING });
  s.http.expectOne(r => r.url === BURN_URL).flush({ status: API_SUCCESS, message: '', data: burns });
  s.fixture.detectChanges();
}

describe('Reliability', () => {
  it('asks both owners for the objective\'s own 28-day window', () => {
    const s = screen();
    const runs = s.http.expectOne(r => r.url === RUNS_URL);
    const billing = s.http.expectOne(r => r.url === BILLING_URL);
    s.http.expectOne(r => r.url === BURN_URL);
    const from = Date.parse(runs.request.params.get('from')!);
    const to = Date.parse(runs.request.params.get('to')!);
    expect(to - from).toBe(28 * 86_400_000);
    expect(billing.request.params.get('from')).toBe(runs.request.params.get('from'));
    expect(billing.request.params.get('to')).toBe(runs.request.params.get('to'));
  });

  it('shows each rate against its target, and the budget left', () => {
    const s = screen();
    answerAll(s);
    // The rate, the target and the budget lead the page in each objective's status card (redesign, 2026-10-06).
    // The counts stay with the objective's section.
    const runsStatus = s.el.querySelector('[data-testid="status-runs"]')!.textContent!;
    expect(runsStatus).toContain('99.985%');
    expect(runsStatus).toContain('target 99.990%');
    expect(runsStatus).toContain('None left');
    expect(s.el.querySelector('[data-testid="slo-runs"]')!.textContent).toContain('19,997 / 20,000');
    expect(s.el.querySelector('[data-testid="status-billing"]')!.textContent).toContain('100%');
    const billing = s.el.querySelector('[data-testid="slo-billing"]')!.textContent!;
    expect(billing).toContain('priced / accepted');
    expect(s.el.querySelector('[data-meter="pipeline.runs"]')).not.toBeNull();
  });

  it('lists the bad runs first, a decline and the stall sweep among them, and says what was left out', () => {
    const s = screen();
    answerAll(s);
    const rows = [...s.el.querySelectorAll('[data-group]')].map(r => r.getAttribute('data-group'));
    expect(rows).toEqual(['Interrupt/STALLED', 'Failed/DECLINED', 'Skip/SKIPPED', 'Failed/AI_STEP', 'Completed/WORKER']);
    const decline = s.el.querySelector('[data-group="Failed/DECLINED"]')!.textContent!;
    expect(decline).toContain('Declined by the worker');
    expect(decline).toContain('Bad');
    expect(s.el.querySelector('[data-group="Failed/AI_STEP"]')!.textContent).toContain('Left out');
  });

  it('says so when a burn rule fires, and shows every rule', () => {
    const s = screen();
    answerAll(s, [burn('pipeline_execution', 'PAGE_1H', true, 100), burn('billing_events_priced', 'PAGE_1H', false, 0)]);
    expect(s.el.querySelector('[data-testid="burn-alert"]')!.textContent).toContain('Pipeline execution is burning its error budget at 100×');
    expect(s.el.querySelector('[data-burn="pipeline_execution/PAGE_1H"]')!.textContent).toContain('Firing');
    expect(s.el.querySelector('[data-burn="pipeline_execution/PAGE_1H"]')!.textContent).toContain('14.4×');
    expect(s.el.querySelector('[data-burn="billing_events_priced/PAGE_1H"]')!.textContent).toContain('OK');
  });

  it('keeps one objective on screen when the other cannot be read', () => {
    const s = screen();
    s.http.expectOne(r => r.url === RUNS_URL).flush({ status: API_SUCCESS, message: '', data: RUNS });
    s.http.expectOne(r => r.url === BILLING_URL).flush({ message: 'Billing is down.' }, { status: 502, statusText: 'Bad Gateway' });
    s.http.expectOne(r => r.url === BURN_URL).flush({ status: API_SUCCESS, message: '', data: [] });
    s.fixture.detectChanges();
    expect(s.el.querySelector('[data-testid="status-runs"]')!.textContent).toContain('99.985%');
    expect(s.el.querySelector('[data-testid="slo-runs"]')!.textContent).toContain('19,997 / 20,000');
    expect(s.el.querySelector('[data-testid="status-billing"]')!.textContent).toContain('Billing is down.');
    expect(s.el.querySelector('[data-testid="slo-billing"]')!.textContent).toContain('Billing is down.');
  });

  it('asks again for the range chosen', () => {
    const s = screen();
    answerAll(s);
    s.component.setRange('7');
    const runs = s.http.expectOne(r => r.url === RUNS_URL);
    s.http.expectOne(r => r.url === BILLING_URL);
    s.http.expectOne(r => r.url === BURN_URL);
    expect(Date.parse(runs.request.params.get('to')!) - Date.parse(runs.request.params.get('from')!)).toBe(7 * 86_400_000);
  });
});

describe('Reliability helpers', () => {
  it('writes a rate to three places, and nothing counted as a dash', () => {
    expect(formatRate(0.9999)).toBe('99.990%');
    expect(formatRate(1)).toBe('100%');
    expect(formatRate(null)).toBe('—');
  });

  it('reads the budget left as a share, none once it is spent', () => {
    expect(budgetLeft({ ...RUNS, errorBudgetRemaining: 0.8 })).toEqual({ value: '80%', tone: 'ok' });
    expect(budgetLeft({ ...RUNS, errorBudgetRemaining: 0.1 })).toEqual({ value: '10%', tone: 'warn' });
    expect(budgetLeft({ ...RUNS, errorBudgetRemaining: -3 })).toEqual({ value: 'None left', tone: 'crit' });
    expect(budgetLeft({ ...RUNS, errorBudgetRemaining: null })).toEqual({ value: '—', tone: 'muted' });
  });

  it('draws every day of the range, good and bad stacked', () => {
    const bars = dayBars([{ day: '2026-09-28', good: 7, bad: 1 }], '2026-09-27', '2026-09-29');
    expect(bars.map(b => [b.meta, b.value])).toEqual([['2026-09-27', 0], ['2026-09-28', 8], ['2026-09-29', 0]]);
    expect(bars[1].segments!.map(x => [x.label, x.value])).toEqual([['Good', 7], ['Bad', 1]]);
  });
});
