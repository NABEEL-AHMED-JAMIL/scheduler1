import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { axisTicks } from '../../../shared/charts/bar-chart';
import {
  Reliability, alertHeadline, billingSentence, objectiveHealth, plainRate, runsSentence, windowWords, worstAlert,
} from './reliability';
import { BillingSlo, BurnRate, MeterRow, PipelineRunsSlo } from './reliability.service';

/**
 * The Reliability page's design (owner, 2026-10-06: "same issue, redesign", after the Task inbox and the Workflow
 * designer). A status card per objective says in a word and a sentence how it is doing, with the budget as a bar and the
 * worst firing alert with what to do; the alert banner is one plain line per objective with the rule lines behind
 * Details; each objective is a full-width chart with a y-axis over its breakdown; billing's meters with something wrong
 * come first and every meter is behind a disclosure; the burn-rate table is for engineers, behind its own disclosure.
 * Widths are CSS; what these pin is the structure behind it.
 */

const RUNS_URL = `${API_BASE}/reliability.json/pipelineRuns`;
const BILLING_URL = `${API_BASE}/billing.json/reliability`;
const BURN_URL = `${API_BASE}/reliability.json/burnRates`;

/** The owner's numbers on 2026-10-06: 347 of 382, 35 bad, the budget long gone. */
const RUNS: PipelineRunsSlo = {
  sli: 'pipeline_execution', from: '2026-09-08T19:00:00Z', to: '2026-10-06T19:00:00Z', target: 0.9999,
  good: 347, bad: 35, excluded: 10, numerator: 347, denominator: 382, successRate: 347 / 382,
  budgetSpent: 916, errorBudgetRemaining: -915, errorBudgetRuns: 0.0382,
  groups: [
    { outcome: 'Completed', reason: 'WORKER', slo: 'good', runs: 318 },
    { outcome: 'Completed', reason: 'UNATTRIBUTED', slo: 'good', runs: 29 },
    { outcome: 'Failed', reason: 'DECLINED', slo: 'bad', runs: 15 },
    { outcome: 'Failed', reason: 'UNATTRIBUTED', slo: 'bad', runs: 10 },
    { outcome: 'Failed', reason: 'WORKER', slo: 'bad', runs: 10 },
    { outcome: 'Skip', reason: 'SKIPPED', slo: 'excluded', runs: 7 },
  ],
  daily: [{ day: '2026-10-05', good: 120, bad: 12, excluded: 1, successRate: 120 / 132 }],
};

const meter = (name: string, accepted: number, unpriced = 0, unrolled = 0): MeterRow =>
  ({ meter: name, accepted, priced: accepted - unpriced - unrolled, unpriced, unrolled, pending: 0 });

const ALL_FINE = Array.from({ length: 21 }, (_, i) => meter(`meter.${String(i).padStart(2, '0')}`, 1000 - i));

const BILLING: BillingSlo = {
  sli: 'billing_events_priced', from: RUNS.from, to: RUNS.to, asOf: RUNS.to,
  target: 0.9999, good: 40_809, bad: 0, unpriced: 0, unrolled: 0, pending: 0, numerator: 40_809, denominator: 40_809,
  successRate: 1, budgetSpent: 0, errorBudgetRemaining: 1, errorBudgetEvents: 4.08,
  meters: ALL_FINE,
  daily: [{ day: '2026-10-05', good: 4000, bad: 0, unpriced: 0, unrolled: 0, pending: 0, successRate: 1 }],
};

const burn = (sli: string, rule: string, firing: boolean, rate: number, window = '6h'): BurnRate => ({
  sli, rule, severity: rule.startsWith('PAGE') ? 'page' : 'ticket', threshold: 6,
  asOf: '2026-10-06T14:05:00', firing, unmeasured: null,
  long: { window, good: 108, bad: 7, burnRate: rate }, short: { window: '30m', good: 36, bad: 1, burnRate: rate / 2 },
});

const FIRING = [
  burn('pipeline_execution', 'PAGE_1H', false, 435, '1h'),
  burn('pipeline_execution', 'PAGE_6H', true, 609, '6h'),
  burn('pipeline_execution', 'TICKET_1D', true, 1140, '1d'),
  burn('pipeline_execution', 'TICKET_3D', true, 1122, '3d'),
  burn('billing_events_priced', 'PAGE_1H', false, 0, '1h'),
];

function screen(opts: { billing?: BillingSlo; burns?: BurnRate[] } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Reliability], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Reliability);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url === RUNS_URL).flush({ status: API_SUCCESS, message: '', data: RUNS });
  http.expectOne(r => r.url === BILLING_URL).flush({ status: API_SUCCESS, message: '', data: opts.billing ?? BILLING });
  http.expectOne(r => r.url === BURN_URL).flush({ status: API_SUCCESS, message: '', data: opts.burns ?? FIRING });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = (sel: string, root: ParentNode = el) => (root.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { fixture, el, text };
}

describe('Reliability, the design -- the status cards', () => {
  it('says how each objective is doing in a word, a budget bar and one sentence', () => {
    const { el, text } = screen();
    const runs = el.querySelector('[data-testid="status-runs"]')!;
    expect(runs.getAttribute('data-health')).toBe('failing');
    expect(text('[data-testid="health"]', runs)).toBe('Failing');
    expect(text('[data-testid="sentence"]', runs)).toBe(
      'Pipeline runs: 90.8% succeeded in the last 28 days; the target is 99.99%. 35 failed runs used the whole budget.');
    expect(runs.querySelector('[role="meter"]')!.getAttribute('aria-valuenow')).toBe('0');

    const billing = el.querySelector('[data-testid="status-billing"]')!;
    expect(text('[data-testid="health"]', billing)).toBe('Healthy');
    expect(text('[data-testid="sentence"]', billing)).toContain('100% of usage events were priced');
    expect(text('[data-testid="sentence"]', billing)).toContain('Every event was priced.');
    expect(billing.querySelector('[role="meter"]')!.getAttribute('aria-valuenow')).toBe('100');
    expect(billing.querySelector('[data-testid="what-to-do"]')).toBeNull();
  });

  it('names the worst firing alert in plain words, with what to do about it', () => {
    const { el, text } = screen();
    const runs = el.querySelector('[data-testid="status-runs"]')!;
    // A page beats a ticket however fast the ticket burns.
    expect(text('[data-testid="worst-alert"] .pill-crit', runs)).toBe('Page');
    expect(text('[data-testid="worst-alert"] span:last-child', runs)).toBe(
      'Over the last 6 hours, runs failed 609× faster than the target allows.');
    expect(text('[data-testid="what-to-do"]', runs)).toBe(
      'What to do: most failed runs were “Declined by the worker before it started” (15 of 35). See why runs failed');
  });

  it('points unpriced billing at the rate cards', () => {
    const billing = { ...BILLING, bad: 3, unpriced: 3, successRate: 0.9999, errorBudgetRemaining: 0.2,
      meters: [...ALL_FINE.slice(1), meter('ai.vision.images', 4, 3)] };
    const { el, text } = screen({ billing, burns: [] });
    const card = el.querySelector('[data-testid="status-billing"]')!;
    expect(text('[data-testid="health"]', card)).toBe('Needs attention');
    expect(text('[data-testid="what-to-do"]', card)).toContain('3 events have no rate on the rate card.');
    expect(card.querySelector('[data-testid="what-to-do"] a')!.getAttribute('href')).toBe('/billing/rates');
  });
});

describe('Reliability, the design -- the alert banner', () => {
  it('is one plain line per objective with firing rules, the severity as a chip, the rule lines behind Details', () => {
    const { el, text } = screen();
    const banner = el.querySelector('[data-testid="burn-alert"]')!;
    const lines = [...banner.querySelectorAll('[data-alert]')];
    expect(lines.map(l => l.getAttribute('data-alert'))).toEqual(['pipeline_execution']);
    expect(text('[data-alert] span:last-child', banner)).toBe(
      'Pipeline execution. Pipeline runs are failing much faster than the target allows. 3 alerts firing.');
    expect(banner.querySelector('[data-alert] .pill-crit')!.textContent!.trim()).toBe('Page');

    const details = banner.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent!.trim()).toBe('Details');
    expect(details.querySelectorAll('li').length).toBe(3);
    expect(details.textContent).toContain('Pipeline execution is burning its error budget at 609× over 6h (Sustained burn, page).');
  });

  it('is not there when nothing fires', () => {
    const { el } = screen({ burns: [] });
    expect(el.querySelector('[data-testid="burn-alert"]')).toBeNull();
  });
});

describe('Reliability, the design -- each objective', () => {
  it('draws the days full width with a y-axis, then the breakdown under it', () => {
    const { el } = screen();
    const section = el.querySelector('[data-testid="slo-runs"]')!;
    const chart = section.querySelector('app-bar-chart')!;
    expect(chart.querySelector('[data-chart-axis]')).not.toBeNull();
    // 132 on the busiest day: an axis of round counts up to the top tick.
    expect([...chart.querySelectorAll('[data-axis-tick]')].map(t => t.textContent!.trim())).toEqual(['0', '50', '100', '150']);
    // The chart comes before the table, not beside it.
    const table = section.querySelector('table')!;
    expect(chart.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the reasons in plain words, the server\'s term in the tooltip', () => {
    const { el } = screen();
    const cell = el.querySelector('[data-group="Failed/UNATTRIBUTED"] td:nth-child(2)') as HTMLElement;
    expect(cell.textContent!.trim()).toBe('Older run, reason not recorded');
    expect(cell.title).toBe('UNATTRIBUTED: Ended before reasons were recorded');
    expect(el.querySelector('[data-group="Completed/WORKER"] td:nth-child(2)')!.textContent!.trim()).toBe('The pipeline reported it');
  });

  it('keeps every table inside its own scrolling box, so a narrow screen never scrolls the page sideways', () => {
    const { el } = screen();
    const tables = [...el.querySelectorAll('table')];
    expect(tables.length).toBeGreaterThanOrEqual(3);
    for (const table of tables) {
      const wrap = table.parentElement!;
      expect(wrap.classList.contains('rel-table-wrap')).toBe(true);
      expect(getComputedStyle(wrap).overflowX).toBe('auto');
    }
  });
});

describe('Reliability, the design -- billing\'s meters', () => {
  it('says every meter is priced when all are, every meter behind "All 21 meters"', () => {
    const { el, text } = screen();
    expect(el.querySelector('[data-testid="meters-issues"]')).toBeNull();
    expect(text('[data-testid="meters-ok"]')).toContain('All 21 meters priced');
    const all = el.querySelector('[data-testid="meters-all"]') as HTMLDetailsElement;
    expect(all.open).toBe(false);
    expect(all.querySelector('summary')!.textContent!.trim()).toBe('All 21 meters');
    expect(all.querySelectorAll('tbody tr').length).toBe(21);
  });

  it('shows the meters with something not priced or not rolled up first, alone, numbers right-aligned', () => {
    const billing = { ...BILLING, bad: 5, unpriced: 3, unrolled: 2,
      meters: [...ALL_FINE.slice(2), meter('ai.vision.images', 4, 3), meter('kafka.topic_hours', 11, 0, 2)] };
    const { el, text } = screen({ billing });
    const issues = el.querySelector('[data-testid="meters-issues"]')!;
    expect([...issues.querySelectorAll('[data-meter]')].map(r => r.getAttribute('data-meter')))
      .toEqual(['ai.vision.images', 'kafka.topic_hours']);
    expect(text('[data-testid="meters-issues-note"]')).toBe('2 of 21 meters have events that were not priced or not rolled up.');
    expect(el.querySelector('[data-testid="meters-ok"]')).toBeNull();
    const cells = [...issues.querySelectorAll('tbody tr:first-child td')].slice(1);
    expect(cells.every(td => td.classList.contains('text-right') && td.classList.contains('tabular'))).toBe(true);
    expect(el.querySelector('[data-testid="meters-all"]')!.querySelectorAll('tbody tr').length).toBe(21);
  });
});

describe('Reliability, the design -- for engineers', () => {
  it('keeps the burn-rate table intact behind a closed disclosure with a one-line explanation', () => {
    const { el } = screen();
    const details = el.querySelector('[data-testid="burn-rules"]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary')!.textContent!.replace(/\s+/g, ' ');
    expect(summary).toContain('For engineers: burn-rate rules');
    expect(summary).toContain('How fast each objective is using its error budget right now');
    expect(summary).toMatch(/As of \d+ \w+, \d{2}:\d{2}\./);
    expect(details.querySelectorAll('[data-burn]').length).toBe(FIRING.length);
    expect(details.querySelector('[data-burn="pipeline_execution/PAGE_6H"]')!.textContent).toContain('Firing');
  });
});

describe('Reliability, the design -- helpers', () => {
  it('writes a rate as a person reads it, never rounding a miss up to 100%', () => {
    expect(plainRate(347 / 382)).toBe('90.8%');
    expect(plainRate(0.9999)).toBe('99.99%');
    expect(plainRate(0.99985)).toBe('99.985%');
    expect(plainRate(0.999999)).toBe('99.999%');
    expect(plainRate(1)).toBe('100%');
    expect(plainRate(null)).toBe('—');
  });

  it('reads the health from the rate, the budget and the alerts', () => {
    expect(objectiveHealth(RUNS, []).health).toBe('failing');
    expect(objectiveHealth(BILLING, []).health).toBe('healthy');
    expect(objectiveHealth(BILLING, [FIRING[1]]).health).toBe('attention');
    expect(objectiveHealth({ ...BILLING, errorBudgetRemaining: 0.2 }, []).health).toBe('attention');
    expect(objectiveHealth({ ...BILLING, successRate: null }, []).health).toBe('unknown');
  });

  it('says how much budget the bad ones used', () => {
    expect(runsSentence({ ...RUNS, bad: 1, errorBudgetRemaining: 0.6, successRate: 0.99995 }, 7))
      .toBe('Pipeline runs: 99.995% succeeded in the last 7 days; the target is 99.99%. 1 failed run used 40% of the budget.');
    expect(billingSentence({ ...BILLING, successRate: null }, 28)).toBe('Billing: no usage event was counted in the last 28 days.');
  });

  it('puts windows, headlines and the worst rule in words', () => {
    expect(windowWords('6h')).toBe('6 hours');
    expect(windowWords('1d')).toBe('day');
    expect(windowWords('30m')).toBe('30 minutes');
    expect(alertHeadline('billing_events_priced', [FIRING[2]])).toBe('Usage events are going unpriced faster than the target allows. 1 alert firing.');
    expect(worstAlert(FIRING.filter(b => b.firing))!.rule).toBe('PAGE_6H');
  });

  it('gives the bar chart round ticks up to at least the tallest bar', () => {
    expect(axisTicks(132)).toEqual([0, 50, 100, 150]);
    expect(axisTicks(13_677)).toEqual([0, 5000, 10_000, 15_000]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(0)).toEqual([0]);
    expect(axisTicks(1, false)).toEqual([0, 0.5, 1]);
  });
});
