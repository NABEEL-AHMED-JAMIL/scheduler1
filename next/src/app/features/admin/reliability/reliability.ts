import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { StatTile, StatTone } from '../../../shared/ui/stat-tile';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { Bar, BarChart } from '../../../shared/charts/bar-chart';
import { daySeries } from '../../../shared/charts/day-series';
import { statusColor } from '../../../shared/charts/status-color';
import { BillingSlo, BurnRate, PipelineRunsSlo, ReliabilityApi, SloWindow } from './reliability.service';

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

/** Where a reason came from, in a sentence (RunEnd on the server). */
const REASON_LABEL: Record<string, string> = {
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
  imports: [Icon, StatTile, Segmented, BarChart, DecimalPipe],
  templateUrl: './reliability.html',
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
  sloLabel(slo: string): string { return slo === 'good' ? 'Good' : slo === 'bad' ? 'Bad' : 'Left out'; }

  burnText(rate: number | null | undefined): string {
    return rate === null || rate === undefined ? '—' : `${rate >= 100 ? Math.round(rate).toLocaleString('en-US') : rate.toFixed(1)}×`;
  }

  private rateTone(slo: SloWindow | null): StatTone {
    if (!slo || slo.successRate === null) return 'muted';
    return slo.successRate >= slo.target ? 'ok' : 'crit';
  }
}
