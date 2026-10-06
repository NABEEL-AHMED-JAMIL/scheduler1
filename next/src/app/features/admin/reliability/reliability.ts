import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { StatTile, StatTone } from '../../../shared/ui/stat-tile';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { Bar, BarChart } from '../../../shared/charts/bar-chart';
import { daySeries } from '../../../shared/charts/day-series';
import { statusColor } from '../../../shared/charts/status-color';
import { BillingSlo, BurnRate, PipelineRunsSlo, ReliabilityApi, RunGroup, SloWindow } from './reliability.service';

export type RangeDays = '7' | '28' | '90';

/** The success rate as the target is written: 99.99%, to three places so a miss of one in ten thousand shows. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  const pct = rate * 100;
  return `${pct === 100 ? '100' : pct.toFixed(3)}%`;
}

/** What is left of the window's error budget, in words a tile can hold. */
export function budgetLeft(slo: SloWindow | null | undefined): { value: string; tone: StatTone } {
  const left = slo?.errorBudgetRemaining;
  if (left === null || left === undefined) return { value: '—', tone: 'muted' };
  if (left <= 0) return { value: 'None left', tone: 'crit' };
  return { value: `${Math.floor(left * 100)}%`, tone: left < 0.25 ? 'warn' : 'ok' };
}

/**
 * A rate as a person reads it: one decimal place, three once it is within a tenth of a percent of 100 so 99.985% and
 * a 99.99% target stay apart. Cut rather than rounded, so a miss never reads as 100%.
 */
export function plainRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  const pct = rate * 100;
  if (pct >= 100) return '100%';
  const places = pct >= 99.9 ? 3 : 1;
  const cut = Math.floor(pct * 10 ** places) / 10 ** places;
  return `${Number(cut.toFixed(places))}%`;
}

export type Health = 'healthy' | 'attention' | 'failing' | 'unknown';

/**
 * The one word an administrator needs first. Failing: under the target, the budget gone. Needs attention: an alert
 * rule is firing, or under a quarter of the budget is left. Healthy otherwise; nothing counted yet is its own state.
 */
export function objectiveHealth(slo: SloWindow | null | undefined, firing: BurnRate[]): { health: Health; label: string; tone: StatTone } {
  if (!slo || slo.successRate === null || slo.successRate === undefined) return { health: 'unknown', label: 'Nothing counted yet', tone: 'muted' };
  const left = slo.errorBudgetRemaining;
  if (slo.successRate < slo.target || (left !== null && left !== undefined && left <= 0)) return { health: 'failing', label: 'Failing', tone: 'crit' };
  if (firing.length || (left !== null && left !== undefined && left < 0.25)) return { health: 'attention', label: 'Needs attention', tone: 'warn' };
  return { health: 'healthy', label: 'Healthy', tone: 'ok' };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** How much of the budget the bad ones used, as the end of the status sentence. */
function budgetClause(slo: SloWindow, badOne: string, badMany: string, none: string): string {
  if (!slo.bad) return none;
  const left = slo.errorBudgetRemaining;
  const bad = plural(slo.bad, badOne, badMany);
  if (left === null || left === undefined) return `${bad}.`;
  if (left <= 0) return `${bad} used the whole budget.`;
  return `${bad} used ${Math.max(1, 100 - Math.floor(left * 100))}% of the budget.`;
}

/** "Pipeline runs: 90.8% succeeded in the last 28 days; the target is 99.99%. 35 failed runs used the whole budget." */
export function runsSentence(r: PipelineRunsSlo | null, days: number): string {
  if (!r) return '';
  if (r.successRate === null) return `Pipeline runs: no run ended in the last ${days} days.`;
  return `Pipeline runs: ${plainRate(r.successRate)} succeeded in the last ${days} days; the target is ${plainRate(r.target)}. `
    + budgetClause(r, 'failed run', 'failed runs', 'No run failed.');
}

/** The same sentence for billing: events priced into their day's bill. */
export function billingSentence(b: BillingSlo | null, days: number): string {
  if (!b) return '';
  if (b.successRate === null) return `Billing: no usage event was counted in the last ${days} days.`;
  return `Billing: ${plainRate(b.successRate)} of usage events were priced in the last ${days} days; the target is ${plainRate(b.target)}. `
    + budgetClause(b, 'unpriced event', 'unpriced events', 'Every event was priced.');
}

/** "6h" as words: "6 hours", "1d" as "day". */
export function windowWords(window: string | null | undefined): string {
  const match = /^(\d+)\s*([mhd])$/.exec(String(window ?? '').trim());
  if (!match) return String(window ?? '');
  const n = Number(match[1]);
  const unit = { m: 'minute', h: 'hour', d: 'day' }[match[2] as 'm' | 'h' | 'd'];
  return n === 1 ? unit : `${n} ${unit}s`;
}

/** Page before ticket, then the fastest burn: the rule worth a person's attention first. */
export function worstAlert(firing: BurnRate[]): BurnRate | null {
  return [...firing].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'page' ? -1 : 1)
    || (b.long?.burnRate ?? 0) - (a.long?.burnRate ?? 0))[0] ?? null;
}

/** One plain line for an objective whose rules fire, for the collapsed banner. */
export function alertHeadline(sli: string, rules: BurnRate[]): string {
  const much = rules.some(r => r.severity === 'page') ? 'much faster' : 'faster';
  const what = sli === 'billing_events_priced' ? 'Usage events are going unpriced' : sli === 'pipeline_execution'
    ? 'Pipeline runs are failing' : `${SLI_LABEL[sli] ?? sli} is missing its target`;
  return `${what} ${much} than the target allows. ${plural(rules.length, 'alert', 'alerts')} firing.`;
}

/** Good and bad a day, stacked; every day of the range present, empty days as zero (daySeries). */
export function dayBars(days: { day: string; good: number; bad: number }[], from: string, to: string): Bar[] {
  const byDay = new Map(days.map(d => [d.day, d]));
  const totals = new Map(days.map(d => [d.day, d.good + d.bad]));
  return daySeries(totals, from, to).bars.map(bar => {
    const d = byDay.get(bar.meta as string);
    return {
      ...bar,
      segments: [
        { label: 'Good', value: d?.good ?? 0, color: statusColor('completed') },
        { label: 'Bad', value: d?.bad ?? 0, color: statusColor('failed') },
      ],
    };
  });
}

/** The rule's name as an on-call person says it. */
const RULE_LABEL: Record<string, string> = {
  PAGE_1H: 'Fast burn', PAGE_6H: 'Sustained burn', TICKET_1D: 'Slow burn', TICKET_3D: 'Gradual burn',
};

const SLI_LABEL: Record<string, string> = { pipeline_execution: 'Pipeline execution', billing_events_priced: 'Billing' };

/**
 * Why a run ended, in plain words (RunEnd on the server). The server's own term stays in the row's tooltip
 * (reasonTitle), so an engineer can still search the logs for it.
 */
const REASON_LABEL: Record<string, string> = {
  WORKER: 'The pipeline reported it',
  DECLINED: 'Declined by the worker before it started',
  DISPATCH: 'Could not be started, out of retries',
  STALLED: 'Stopped responding and was closed',
  TOKEN_EXPIRED: 'Reported too late to be accepted',
  REFUSED: 'Not started: its settings were refused',
  AI_STEP: 'An AI step failed before it started',
  OPERATOR: 'Closed by a person',
  SKIPPED: 'Skipped',
  MISSED: 'Missed while the platform was down',
  UNATTRIBUTED: 'Older run, reason not recorded',
};

/** The server's wording, for the tooltip: what the label used to say before it was put plainly. */
const REASON_DETAIL: Record<string, string> = {
  WORKER: 'Reported by the worker',
  DECLINED: 'Declined by the worker before it started',
  DISPATCH: 'Could not be dispatched, out of retries',
  STALLED: 'Stopped reporting; closed by the stall sweep',
  TOKEN_EXPIRED: 'Reported with an expired callback token',
  REFUSED: 'Refused on its configuration before dispatch',
  AI_STEP: 'An AI step refused or failed before dispatch',
  OPERATOR: 'Closed by a person',
  SKIPPED: 'Skipped',
  MISSED: 'Missed while the platform was down',
  UNATTRIBUTED: 'Ended before reasons were recorded',
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * MIG-196: Reliability, platform administrators only. The two 99.99% objectives over a rolling window -- the
 * pipeline execution rate (process) and the billing rate (billing-service) -- each from its owner's stored rows,
 * with the error budget left, the days, what the bad and the excluded were, and how fast the budget is burning
 * under the four alert rules (process's SloBurnAlerts notifies every platform administrator when one fires).
 */
@Component({
  selector: 'app-reliability',
  imports: [Icon, StatTile, Segmented, BarChart, DecimalPipe, NgTemplateOutlet, RouterLink, ServerTimePipe],
  templateUrl: './reliability.html',
  // Local to the page, on the console's tokens: the status cards' big word and figures, the callout, the section head
  // (text beside its two tiles, wrapping under them when narrow) and a table that scrolls inside its own box.
  styles: [`
    .rel-alert { border-left: 3px solid var(--series-crit); }
    .rel-health { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; line-height: 2rem; font-weight: 600; }
    .rel-figures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .rel-figure { margin-top: 0.25rem; font-size: 1.25rem; line-height: 1.75rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .rel-callout { border: 1px solid var(--border-subtle); background: var(--surface-inset); border-radius: var(--radius-lg);
      padding: 0.5rem 0.75rem; font-size: 0.875rem; }
    .rel-link { color: var(--accent-text); text-decoration: underline; text-underline-offset: 2px; font-weight: 500;
      margin-left: 0.25rem; white-space: nowrap; cursor: pointer; }
    .rel-section-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 1rem; }
    .rel-section-text { flex: 1 1 24rem; min-width: 0; max-width: 56rem; }
    .rel-section-tiles { flex: 0 1 32rem; min-width: min(100%, 20rem); display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
    .rel-tone-ok { color: var(--ok-text); }
    .rel-tone-warn { color: var(--warn-text); }
    .rel-tone-crit { color: var(--crit-text); }
    .rel-tone-muted, .rel-tone-info { color: var(--text-muted); }
    .rel-figures .progress { background: var(--border-subtle); }
    .rel-bar-ok { background: var(--series-ok); }
    .rel-bar-warn { background: var(--series-warn-soft); }
    .rel-bar-crit { background: var(--series-crit); }
    .rel-table-wrap { overflow-x: auto; max-width: 100%; }
    .rel-meter-table th:not(:first-child), .rel-meter-table td:not(:first-child) { width: 9.5rem; }
  `],
})
export class Reliability implements OnInit {
  private readonly api = inject(ReliabilityApi);

  readonly rangeOptions: SegmentOption<RangeDays>[] = [
    { id: '7', label: 'Last 7 days' }, { id: '28', label: 'Last 28 days' }, { id: '90', label: 'Last 90 days' },
  ];
  /** 28 days is the objective's own window; the other two are views of it. */
  readonly range = signal<RangeDays>('28');
  readonly window = signal<{ from: string; to: string }>({ from: '', to: '' });

  readonly runs = signal<PipelineRunsSlo | null>(null);
  readonly runsLoading = signal(true);
  readonly runsError = signal('');
  readonly billing = signal<BillingSlo | null>(null);
  readonly billingLoading = signal(true);
  readonly billingError = signal('');
  readonly burn = signal<BurnRate[]>([]);
  readonly burnLoading = signal(true);
  readonly burnError = signal('');

  readonly formatRate = formatRate;
  readonly runsBudget = computed(() => budgetLeft(this.runs()));
  readonly billingBudget = computed(() => budgetLeft(this.billing()));
  readonly runsTone = computed<StatTone>(() => this.rateTone(this.runs()));
  readonly billingTone = computed<StatTone>(() => this.rateTone(this.billing()));

  private readonly dayRange = computed(() => {
    const { from, to } = this.window();
    if (!from || !to) return { from: '', to: '' };
    // [from, to): the last day drawn is the one `to` falls in.
    return { from: from.slice(0, 10), to: isoDay(new Date(new Date(to).getTime() - 1)) };
  });
  readonly runBars = computed(() => dayBars(this.runs()?.daily ?? [], this.dayRange().from, this.dayRange().to));
  readonly billingBars = computed(() => dayBars(this.billing()?.daily ?? [], this.dayRange().from, this.dayRange().to));

  /** Bad first, then excluded, then good: what someone opens this page to find. */
  readonly runGroups = computed(() => {
    const order = { bad: 0, excluded: 1, good: 2 } as Record<string, number>;
    return [...(this.runs()?.groups ?? [])].filter(g => g.runs > 0)
      .sort((a, b) => order[a.slo] - order[b.slo] || b.runs - a.runs);
  });
  readonly meters = computed(() => [...(this.billing()?.meters ?? [])]
    .sort((a, b) => (b.unpriced + b.unrolled) - (a.unpriced + a.unrolled) || b.accepted - a.accepted));
  readonly firing = computed(() => this.burn().filter(b => b.firing));

  /** Meters with something not priced or not rolled up: shown first, the rest behind "All N meters". */
  readonly meterIssues = computed(() => this.meters().filter(m => m.unpriced + m.unrolled > 0));

  readonly days = computed(() => Number(this.range()));
  readonly runsFiring = computed(() => this.firing().filter(b => b.sli === 'pipeline_execution'));
  readonly billingFiring = computed(() => this.firing().filter(b => b.sli === 'billing_events_priced'));
  readonly runsHealth = computed(() => objectiveHealth(this.runs(), this.runsFiring()));
  readonly billingHealth = computed(() => objectiveHealth(this.billing(), this.billingFiring()));
  readonly runsSentence = computed(() => runsSentence(this.runs(), this.days()));
  readonly billingSentence = computed(() => billingSentence(this.billing(), this.days()));
  readonly runsWorst = computed(() => worstAlert(this.runsFiring()));
  readonly billingWorst = computed(() => worstAlert(this.billingFiring()));

  /** One line per objective whose rules fire, in the order the page lists the objectives. */
  readonly alertGroups = computed(() => ['pipeline_execution', 'billing_events_priced', ...new Set(this.firing().map(b => b.sli))]
    .filter((sli, i, all) => all.indexOf(sli) === i)
    .map(sli => ({ sli, rules: this.firing().filter(b => b.sli === sli) }))
    .filter(group => group.rules.length)
    .map(group => ({
      ...group,
      headline: alertHeadline(group.sli, group.rules),
      severity: group.rules.some(r => r.severity === 'page') ? 'page' as const : 'ticket' as const,
    })));

  /** The bad runs' commonest reason, for "What to do". */
  readonly topBadGroup = computed<RunGroup | null>(() => this.runGroups().find(g => g.slo === 'bad') ?? null);
  /** Burn rates' own clock, for "as of 14:05". */
  readonly burnAsOf = computed(() => this.burn()[0]?.asOf ?? null);

  ngOnInit(): void { this.load(); }

  setRange(days: RangeDays): void {
    this.range.set(days);
    this.load();
  }

  load(): void {
    const to = new Date();
    const from = new Date(to.getTime() - Number(this.range()) * 86_400_000);
    this.window.set({ from: from.toISOString(), to: to.toISOString() });
    this.loadRuns();
    this.loadBilling();
    this.loadBurn();
  }

  loadRuns(): void {
    const { from, to } = this.window();
    this.runsLoading.set(true); this.runsError.set('');
    this.api.pipelineRuns(from, to).subscribe({
      next: r => { this.runsLoading.set(false); if (r.status !== API_SUCCESS) { this.runsError.set(r.message); return; } this.runs.set(r.data ?? null); },
      error: err => { this.runsLoading.set(false); this.runsError.set(err?.error?.message || 'Could not read the pipeline execution figures.'); },
    });
  }

  loadBilling(): void {
    const { from, to } = this.window();
    this.billingLoading.set(true); this.billingError.set('');
    this.api.billing(from, to).subscribe({
      next: r => { this.billingLoading.set(false); if (r.status !== API_SUCCESS) { this.billingError.set(r.message); return; } this.billing.set(r.data ?? null); },
      error: err => { this.billingLoading.set(false); this.billingError.set(err?.error?.message || 'Could not read the billing figures.'); },
    });
  }

  loadBurn(): void {
    this.burnLoading.set(true); this.burnError.set('');
    this.api.burnRates().subscribe({
      next: r => { this.burnLoading.set(false); if (r.status !== API_SUCCESS) { this.burnError.set(r.message); return; } this.burn.set(r.data ?? []); },
      error: err => { this.burnLoading.set(false); this.burnError.set(err?.error?.message || 'Could not read the burn rates.'); },
    });
  }

  ruleLabel(rule: string): string { return RULE_LABEL[rule] ?? rule; }
  sliLabel(sli: string): string { return SLI_LABEL[sli] ?? sli; }
  reasonLabel(reason: string): string { return REASON_LABEL[reason] ?? reason; }
  /** The tooltip on a plain reason: the server's term and its old wording. */
  reasonTitle(reason: string): string { return REASON_DETAIL[reason] ? `${reason}: ${REASON_DETAIL[reason]}` : reason; }

  /** "Over the last 6 hours, runs failed 609× faster than the target allows." */
  alertWords(b: BurnRate | null): string {
    if (!b) return '';
    const what = b.sli === 'billing_events_priced' ? 'events went unpriced' : 'runs failed';
    return `Over the last ${windowWords(b.long?.window)}, ${what} ${this.burnText(b.long?.burnRate)} faster than the target allows.`;
  }

  budgetWidth(slo: SloWindow | null): number {
    const left = slo?.errorBudgetRemaining;
    return left === null || left === undefined ? 0 : Math.round(Math.min(1, Math.max(0, left)) * 100);
  }

  /** Brings a section into view: "What to do" points at the breakdown that answers it. */
  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  sloLabel(slo: string): string { return slo === 'good' ? 'Good' : slo === 'bad' ? 'Bad' : 'Left out'; }

  burnText(rate: number | null | undefined): string {
    return rate === null || rate === undefined ? '—' : `${rate >= 100 ? Math.round(rate).toLocaleString('en-US') : rate.toFixed(1)}×`;
  }

  private rateTone(slo: SloWindow | null): StatTone {
    if (!slo || slo.successRate === null) return 'muted';
    return slo.successRate >= slo.target ? 'ok' : 'crit';
  }
}
