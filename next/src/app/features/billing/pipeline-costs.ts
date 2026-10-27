import { Component, DestroyRef, LOCALE_ID, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { instantOf } from '../../core/instant';
import { BillingApi, PipelineCostRow, PipelineCosts as Costs, RunCost, RunCostMeter, RunCostRow, RunFilter, UsageQuery } from './billing.service';
import { dayHeading, formatMoney, formatMoneyCell, formatMoneyExact, formatShare, groupByDay, zonedDay, zonedStamp, zonedTime } from './billing-format';

const RUNS_PAGE = 25;
/** By pipeline shows the dearest this many, then "Show all N pipelines". */
export const PIPELINES_SHOWN = 8;
/** By run's chips: at most this many meters, then "+N". */
const CHIPS_SHOWN = 3;
/** How long the search waits after the last key before it asks again. */
const SEARCH_WAIT_MS = 300;

/** One chip of By run's "What it cost": a meter (model tokens in and out, on any model, are one) and its cost. */
export interface MeterChip { label: string; cost: number; exact: string[]; }

/** What a chip calls a meter: every model-token line is "Model tokens"; the rest keep their own label. */
function chipLabel(m: Pick<RunCostMeter, 'meter' | 'label'>): string {
  return (m.meter ?? '').startsWith('ai.tokens.') ? 'Model tokens' : m.label || m.meter;
}

/** A run's meters as chips, the costliest first, model tokens in and out folded into one. */
export function meterChips(meters: Pick<RunCostMeter, 'meter' | 'label' | 'cost'>[] | null | undefined, currency = 'USD'): MeterChip[] {
  const by = new Map<string, MeterChip>();
  for (const m of meters ?? []) {
    const label = chipLabel(m);
    const chip = by.get(label) ?? { label, cost: 0, exact: [] };
    chip.cost += Number(m.cost) || 0;
    chip.exact.push(`${m.label} ${formatMoneyExact(Number(m.cost), currency)}`);
    by.set(label, chip);
  }
  return [...by.values()].sort((a, b) => b.cost - a.cost);
}

/** A run's meters in words, the costliest first: "Model tokens $0.41 · Pipeline runs <$0.01" (at most three). */
export function meterSummary(row: RunCostRow, currency = 'USD'): string {
  const chips = meterChips(row.meters, currency);
  const shown = chips.slice(0, CHIPS_SHOWN).map(m => `${m.label} ${formatMoneyCell(m.cost, currency)}`);
  return shown.join(' · ') + (chips.length > CHIPS_SHOWN ? ` · ${chips.length - CHIPS_SHOWN} more` : '');
}

/** What a pipeline's money mostly went on, as a quiet word: "mostly model tokens" ("" when nothing is known). */
export function mostly(p: PipelineCostRow): string {
  const top = meterChips(p.meters ?? [])[0];
  if (!top || top.cost <= 0) return '';
  // Sentence case inside a sentence: "Model tokens" becomes "model tokens"; "API calls" stays as it is.
  return `mostly ${top.label.replace(/^([A-Z])(?=[a-z])/, c => c.toLowerCase())}`;
}

/** The share of the total a pipeline's cost is, as a whole percent (0 when there is no total). */
export function shareOf(cost: number, total: number): number {
  return total > 0 ? Math.round((cost / total) * 100) : 0;
}

/**
 * The reconciliation bar's figures, in cents that add up as shown: what pipeline runs took and the rest, which is the
 * month's total less it -- so "$52.91 + $152.89" reads as the "$205.80" beside it, whichever way the fifth places round.
 */
export function reconcile(total: number, attributed: number): { total: number; run: number; other: number; runShare: string; otherShare: string; runWidth: number } {
  const cents = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
  const t = cents(total);
  const run = cents(attributed);
  const other = Math.round((t - run) * 100) / 100;
  const pct = total > 0 ? (Number(attributed) / Number(total)) * 100 : 0;
  const otherPct = 100 - pct;
  const notTied = Number(total) - Number(attributed);
  return {
    total: t, run, other,
    runShare: formatShare(pct, Number(attributed)),
    otherShare: notTied > 0 && otherPct < 1 ? '<1%' : attributed > 0 && pct < 1 ? '>99%' : `${Math.round(otherPct)}%`,
    runWidth: attributed > 0 ? Math.min(99.5, Math.max(pct, 0.5)) : 0,
  };
}

/**
 * UX review B9 (BL1), redesigned 2026-10-19: what each pipeline and each run cost, in Cost & usage. The figures are
 * Billing's own share-out of the same priced lines the page lists above (billing.json/pipelineCosts): every line's amount
 * split over the runs that used it, so the runs plus "not tied to a run" add up to the month's total -- and, for a closed
 * month, the invoice. One section, stacked: a bar that says the split, By pipeline (the dearest eight, then all), and By
 * run under it -- a pipeline picked above narrows it, as do its search and status filter, on the server, so its count and
 * day headers are the filtered runs'. A run opened from its run page (?run=) is shown on its own first (billing.json/runCost).
 */
@Component({
  selector: 'app-pipeline-costs',
  imports: [Icon, TableShell, StatusPill, ServerTimePipe, RouterLink],
  styleUrl: './day-table.css',
  styles: `
    .recon { display: flex; flex-direction: column; gap: 0.5rem; }
    .recon-bar { display: flex; height: 0.5rem; border-radius: var(--radius-full); overflow: hidden; background: var(--border-strong); }
    .recon-seg.is-run { background: var(--chart-0); }
    .recon-legend { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 1.25rem; row-gap: 0.25rem; font-size: 0.75rem; color: var(--text-secondary); }
    .recon-legend b { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
    .recon-swatch { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: var(--radius-sm); margin-right: 0.375rem; vertical-align: -0.05rem; }
    .recon-swatch.is-run { background: var(--chart-0); }
    .recon-swatch.is-other { background: var(--border-strong); }
    .share-bar { height: 0.375rem; flex: 1 1 auto; min-width: 3rem; border-radius: var(--radius-full); overflow: hidden; background: var(--border-subtle); }
    .share-bar > span { display: block; height: 100%; border-radius: var(--radius-full); background: var(--chart-0); }
    .meter-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .meter-chip { display: inline-flex; align-items: baseline; gap: 0.25rem; white-space: nowrap; padding: 0.0625rem 0.4rem; font-size: 0.6875rem;
      line-height: 1.1rem; border-radius: var(--radius-full); background: var(--surface-sunken); color: var(--text-secondary); }
    .meter-chip b { color: var(--text-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
    tr.is-picked > td { background: var(--surface-sunken); }
    tr.is-picked > td:first-child { box-shadow: inset 2px 0 0 var(--chart-0); }
  `,
  template: `
    <section class="flex flex-col gap-3" data-test="pipeline-costs" aria-labelledby="pipeline-costs-heading">
      <div class="flex flex-col gap-2">
        <h2 id="pipeline-costs-heading" class="section-title">Cost by pipeline</h2>
        @if (recon(); as r) {
          <!-- The month's total, split: what pipeline runs took and what no run did. Replaces the sentence that said it. -->
          <div class="recon" data-test="costs-reconcile">
            <div class="recon-bar" role="img" [attr.aria-label]="'From pipeline runs ' + fixed(r.run) + ', ' + r.runShare + '; not tied to a run ' + fixed(r.other) + ', ' + r.otherShare">
              <span class="recon-seg is-run" [style.width.%]="r.runWidth"></span>
            </div>
            <ul class="recon-legend">
              <li data-test="recon-run"><span class="recon-swatch is-run" aria-hidden="true"></span>From pipeline runs <b>{{ fixed(r.run) }}</b> · {{ r.runShare }}</li>
              <li data-test="recon-other"><span class="recon-swatch is-other" aria-hidden="true"></span>Not tied to a run <b>{{ fixed(r.other) }}</b> · {{ r.otherShare }}
                <span class="text-[color:var(--text-muted)]">(storage kept, analytics, the console's reads, API calls)</span></li>
              <li data-test="recon-total">Month's total <b>{{ fixed(r.total) }}</b></li>
            </ul>
          </div>
        }
      </div>

      @if (run(); as r) {
        <div class="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-test="run-cost">
          <span class="stat-glyph"><app-icon name="history" /></span>
          <div class="min-w-0 mr-auto">
            <p class="text-sm"><b>Run #{{ r.jobQueueId }}</b>@if (r.pipeline) { · {{ r.pipeline }} }@if (r.schedule) { <span class="text-[color:var(--text-muted)]">({{ r.schedule }})</span> }</p>
            <p class="text-xs text-[color:var(--text-muted)]">{{ r.meters.length ? meterSummary(r) : 'Nothing billed for this run yet.' }}</p>
          </div>
          <span class="text-lg font-semibold tabular" [title]="exact(r.cost)">{{ money(r.cost) }}</span>
          @if (r.jobId) {
            <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.jobQueueId]"><app-icon name="file" />Open the run</a>
          }
        </div>
      } @else if (runError()) {
        <p class="text-xs text-crit-500" role="alert">{{ runError() }}</p>
      }

      <app-table-shell heading="By pipeline" [shown]="shownPipelines().length" [total]="pipelines().length" [loading]="loading() && !costs()" [error]="error()" (retry)="load()"
                       [isEmpty]="!pipelines().length" emptyMessage="No pipeline run was billed in this month yet." emptyIcon="layers" [scrollRows]="false">
        <ng-container toolbar>
          <span class="text-xs text-[color:var(--text-muted)]">Pick a pipeline to see its runs below.</span>
        </ng-container>
        <table class="table-modern" data-test="cost-by-pipeline">
          <thead>
            <tr><th>Pipeline</th><th class="text-right">Runs</th><th class="text-right">Cost</th><th class="text-right">Per run</th><th class="w-56">Share</th><th>Spent on</th><th class="w-24"></th></tr>
          </thead>
          <tbody>
            @for (p of shownPipelines(); track p.taskDetailId ?? $index) {
              <tr [class.cursor-pointer]="!!p.taskDetailId" [class.hover-brand]="!!p.taskDetailId" [class.is-picked]="!!p.taskDetailId && p.taskDetailId === picked()"
                  (click)="p.taskDetailId && pick(p)" data-test="pipeline-row">
                <td class="min-w-48">
                  @if (p.taskDetailId) {
                    <a class="link-inline font-medium" [routerLink]="['/pipelines', p.taskDetailId, 'edit']" (click)="$event.stopPropagation()">{{ p.pipeline || 'Pipeline #' + p.taskDetailId }}</a>
                  } @else { <span class="text-[color:var(--text-muted)]">Pipeline not named</span> }
                  @if (p.lastRunAt) { <span class="block text-[11px] text-[color:var(--text-muted)] tabular">last run {{ stamp(p.lastRunAt) }}</span> }
                </td>
                <td class="text-right tabular">{{ p.runs }}</td>
                <td class="text-right tabular font-medium" [title]="exact(p.cost)">{{ money(p.cost) }}</td>
                <td class="text-right tabular text-[color:var(--text-secondary)]" [title]="exact(perRun(p))" data-test="per-run">{{ cell(perRun(p)) }}</td>
                <td>
                  <div class="flex items-center gap-2" [title]="shareText(p) + ' of the month'">
                    <div class="share-bar" aria-hidden="true"><span [style.width.%]="p.cost > 0 ? Math.max(share(p), 1) : 0"></span></div>
                    <span class="text-[11px] tabular text-[color:var(--text-muted)] w-9 text-right">{{ shareText(p) }}</span>
                  </div>
                </td>
                <td class="text-xs text-[color:var(--text-muted)] whitespace-nowrap" data-test="mostly">{{ mostly(p) }}</td>
                <td class="text-right">
                  @if (p.taskDetailId) {
                    <button type="button" class="btn btn-default btn-xs" [attr.aria-pressed]="p.taskDetailId === picked()" data-test="pipeline-runs"
                            [attr.aria-label]="'Show the runs of ' + (p.pipeline || 'pipeline #' + p.taskDetailId)" (click)="$event.stopPropagation(); pick(p)">
                      Runs<app-icon name="chevronDown" size="0.85em" /></button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (pipelines().length > PIPELINES_SHOWN) {
          <div class="flex justify-center px-4 py-2 border-t border-subtle">
            <button type="button" class="btn btn-default btn-sm" data-test="all-pipelines" (click)="allPipelines.set(!allPipelines())">
              {{ allPipelines() ? 'Show the dearest ' + PIPELINES_SHOWN : 'Show all ' + pipelines().length + ' pipelines' }}</button>
          </div>
        }
      </app-table-shell>

      <div id="by-run" class="scroll-mt-16">
      <app-table-shell heading="By run" [shown]="runs().length" [total]="runsTotal()" [loading]="(loading() && !costs()) || runsLoading()" [error]="error()" (retry)="load()"
                       [isEmpty]="!runs().length" [emptyMessage]="narrowed() ? 'No run in this month matches.' : 'No pipeline run was billed in this month yet.'" emptyIcon="history" [scrollRows]="false">
        <ng-container toolbar>
          @if (pickedRow(); as p) {
            <span class="pill pill-brand inline-flex items-center gap-1" data-test="pipeline-chip">{{ p.pipeline || 'Pipeline #' + p.taskDetailId }} · {{ money(p.cost) }}
              <button type="button" class="btn btn-ghost btn-icon btn-xs -mr-1" (click)="pick(null)" [attr.aria-label]="'Show every pipeline\\'s runs, not only ' + (p.pipeline || 'this one')" data-test="pipeline-chip-clear"><app-icon name="close" size="0.85em" /></button>
            </span>
          }
          <div class="search-field">
            <app-icon name="search" size="0.95em" />
            <input class="input" placeholder="Search pipeline, schedule or run" aria-label="Search runs" data-test="run-search" [value]="search()" (input)="onSearch($any($event.target).value)" />
          </div>
          <select class="input max-w-48" aria-label="Status" data-test="run-status" (change)="setStatus($any($event.target).value)">
            <option value="" [selected]="!status()">All statuses</option>
            @for (s of statuses(); track s.status) {
              @if (s.status) { <option [value]="s.status" [selected]="status() === s.status">{{ s.status }} ({{ s.runs }})</option> }
            }
          </select>
        </ng-container>
        <!-- Owner review 2026-10-12: the runs by the billing day they started, a header per day, the time on each row. -->
        <div class="day-table-scroll">
        <table class="table-modern day-table" data-test="cost-by-run">
          <thead>
            <tr><th class="w-20">Started</th><th class="w-24">Run</th><th>Pipeline</th><th class="w-32">Status</th><th>What it cost</th><th class="text-right w-24">Cost</th></tr>
          </thead>
          @for (g of runGroups(); track g.day) {
          <tbody>
            <tr class="day-group" data-test="run-day-group">
              <th colspan="6" scope="colgroup"><div class="day-group-line"><span>{{ g.day ? heading(g.day) : 'Start not known' }}</span>
                <span class="day-group-sum" [title]="exact(g.cost)">{{ g.count }} {{ g.count === 1 ? 'run' : 'runs' }} · {{ money(g.cost) }}</span></div></th>
            </tr>
            @for (r of g.rows; track r.jobQueueId) {
              <tr [class.is-focused]="r.jobQueueId === runId()">
                <td class="whitespace-nowrap tabular text-[color:var(--text-secondary)]" data-test="run-started" [title]="r.startedAt ? (r.startedAt | serverTime: 'dateTime') : ''">{{ time(r) || '—' }}</td>
                <td class="mono whitespace-nowrap">
                  @if (r.jobId) { <a class="link-inline" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.jobQueueId]">#{{ r.jobQueueId }}</a> }
                  @else { #{{ r.jobQueueId }} }
                </td>
                <td class="min-w-40">{{ r.pipeline || '—' }}
                  @if (r.schedule && r.schedule !== r.pipeline) { <span class="block text-[11px] text-[color:var(--text-muted)]">{{ r.schedule }}</span> }
                </td>
                <td>@if (r.status) { <app-status [label]="r.status" [quiet]="true" /> }</td>
                <td class="min-w-56" data-test="run-meters">
                  @if (chips(r); as list) {
                    <div class="meter-chips">
                      @for (m of list.slice(0, CHIPS_SHOWN); track m.label) {
                        <span class="meter-chip" [title]="m.exact.join(' · ')">{{ m.label }} <b>{{ cell(m.cost) }}</b></span>
                      }
                      @if (list.length > CHIPS_SHOWN) {
                        <span class="meter-chip" data-test="more-meters" [title]="restOf(list)">+{{ list.length - CHIPS_SHOWN }}</span>
                      }
                    </div>
                  }
                </td>
                <td class="text-right tabular font-medium" [title]="exact(r.cost)">{{ cell(r.cost) }}</td>
              </tr>
            }
          </tbody>
          }
        </table>
        </div>
        @if (moreRuns()) {
          <div class="flex justify-center px-4 py-2 border-t border-subtle">
            <button type="button" class="btn btn-default btn-sm" data-test="more-run-costs" (click)="loadMore()" [disabled]="loadingMore()">
              {{ loadingMore() ? 'Reading…' : 'Show more runs' }}</button>
          </div>
        }
      </app-table-shell>
      </div>
    </section>
  `,
})
export class PipelineCosts {
  private readonly api = inject(BillingApi);
  /** The month on screen (the page's own range and workspace). */
  readonly query = input.required<UsageQuery>();
  /** A run to show on its own first (?run= from its run page). */
  readonly runId = input<number | null>(null);
  readonly currency = input('USD');

  readonly PIPELINES_SHOWN = PIPELINES_SHOWN;
  readonly CHIPS_SHOWN = CHIPS_SHOWN;
  readonly Math = Math;

  readonly costs = signal<Costs | null>(null);
  readonly runs = signal<RunCostRow[]>([]);
  readonly runsTotal = signal(0);
  readonly loading = signal(false);
  /** By run read again for a pipeline, a search or a status: only By run waits under its blur. */
  readonly runsLoading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly run = signal<RunCost | null>(null);
  readonly runError = signal('');

  /** By run's filter: the pipeline picked in By pipeline, the search, the status. */
  readonly picked = signal<number | null>(null);
  readonly search = signal('');
  readonly status = signal('');
  readonly narrowed = computed(() => !!this.picked() || !!this.search().trim() || !!this.status());
  readonly allPipelines = signal(false);

  readonly pipelines = computed<PipelineCostRow[]>(() => this.costs()?.pipelines ?? []);
  readonly shownPipelines = computed(() => this.allPipelines() ? this.pipelines() : this.pipelines().slice(0, PIPELINES_SHOWN));
  readonly pickedRow = computed(() => this.pipelines().find(p => p.taskDetailId !== null && p.taskDetailId === this.picked()) ?? null);
  readonly statuses = computed(() => this.costs()?.runs?.statuses ?? []);
  readonly moreRuns = computed(() => this.runs().length < this.runsTotal());
  readonly recon = computed(() => { const c = this.costs(); return c ? reconcile(Number(c.total), Number(c.attributed)) : null; });
  readonly meterSummary = (r: RunCostRow) => meterSummary(r, this.cur());
  readonly mostly = mostly;
  private readonly locale = inject(LOCALE_ID);
  /** The workspace's billing zone the period's days are counted in (H9). */
  readonly zone = computed(() => this.costs()?.zone ?? null);
  /** The runs by the billing day they started on; each header counts and totals the whole day (Billing's, every page). */
  readonly runGroups = computed(() => {
    const zone = this.zone();
    const totals = new Map((this.costs()?.runs?.days ?? []).map(d => [d.day ?? null, d]));
    return groupByDay(this.runs(), r => { const at = instantOf(r.startedAt); return at ? zonedDay(at, zone) : null; }).map(g => {
      const total = totals.get(g.day);
      return { ...g, count: total?.runs ?? g.rows.length, cost: Number(total?.cost ?? g.rows.reduce((n, r) => n + Number(r.cost), 0)) };
    });
  });
  heading(day: string): string { return dayHeading(day, this.locale); }
  /** A run's start, 24-hour, in the workspace's zone. */
  time(r: RunCostRow): string { const at = instantOf(r.startedAt); return at ? zonedTime(at, this.zone()) : ''; }
  /** A pipeline's last run, "19 Oct, 19:26", in the workspace's zone. */
  stamp(value: string | null): string { const at = instantOf(value); return at ? zonedStamp(at, this.zone()) : ''; }
  private page = 1;
  private reading?: Subscription;
  private searching?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.reading?.unsubscribe(); clearTimeout(this.searching); });
    effect(() => {
      this.query();
      untracked(() => { this.picked.set(null); this.search.set(''); this.status.set(''); this.allPipelines.set(false); this.load(); });
    });
    effect(() => {
      const id = this.runId();
      const q = this.query();
      untracked(() => this.loadRun(id, q.tenantId ?? null));
    });
  }

  private cur(): string { return this.costs()?.currency ?? this.currency(); }
  /** A total -- a day's, a pipeline's -- exactly: a sub-cent total keeps its digits. */
  money(value: number): string { const v = Number(value) || 0; return formatMoney(v, this.cur(), v !== 0 && Math.abs(v) < 0.01 ? 4 : 2); }
  /** A run's, a chip's or an average's amount: cents, "<$0.01" under a cent (the exact one on the tooltip). */
  cell(value: number): string { return formatMoneyCell(value, this.cur()); }
  exact(value: number): string { return formatMoneyExact(value, this.cur()); }
  /** The reconciliation's figures, already in cents. */
  fixed(value: number): string { return formatMoney(value, this.cur(), 2); }
  perRun(p: PipelineCostRow): number { return p.runs > 0 ? Number(p.cost) / p.runs : 0; }
  share(p: PipelineCostRow): number { return shareOf(p.cost, this.costs()?.total ?? 0); }
  /** Owner #7: "<1%" for a real cost that rounds to nothing, as By service writes it. */
  shareText(p: PipelineCostRow): string { return formatShare(this.costs()?.total ? (Number(p.cost) / Number(this.costs()!.total)) * 100 : 0, Number(p.cost)); }
  chips(r: RunCostRow): MeterChip[] { return meterChips(r.meters, this.cur()); }
  restOf(list: MeterChip[]): string { return list.slice(CHIPS_SHOWN).map(m => `${m.label} ${formatMoneyExact(m.cost, this.cur())}`).join(' · '); }

  /** A pipeline picked in By pipeline narrows By run to its runs; the same one again, or null, shows every pipeline's. */
  pick(p: PipelineCostRow | null): void {
    const id = p?.taskDetailId ?? null;
    this.picked.set(id !== null && id === this.picked() ? null : id);
    this.reloadRuns();
    if (this.picked() !== null) {
      const box = typeof document === 'undefined' ? null : document.getElementById('by-run');
      if (box && typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searching);
    this.searching = setTimeout(() => this.reloadRuns(), SEARCH_WAIT_MS);
  }

  setStatus(value: string): void { this.status.set(value); this.reloadRuns(); }

  private filter(): RunFilter { return { taskDetailId: this.picked(), q: this.search(), status: this.status() || null }; }

  load(): void {
    this.reading?.unsubscribe();
    this.page = 1;
    this.loading.set(true);
    this.error.set('');
    this.reading = this.api.pipelineCosts(this.query(), 1, RUNS_PAGE, this.filter()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.costs.set(null); this.runs.set([]); this.error.set(r.message || 'What the pipelines cost could not be read.'); return; }
        this.costs.set(r.data ?? null);
        this.runs.set(r.data?.runs?.rows ?? []);
        this.runsTotal.set(Number(r.data?.runs?.total ?? 0));
      },
      error: () => { this.loading.set(false); this.error.set('What the pipelines cost could not be read.'); },
    });
  }

  /** By run's first page again, for the filter as it is now; By pipeline and the bar stay as they are. */
  private reloadRuns(): void {
    clearTimeout(this.searching);
    this.reading?.unsubscribe();
    this.page = 1;
    this.runsLoading.set(true);
    this.reading = this.api.pipelineCosts(this.query(), 1, RUNS_PAGE, this.filter()).subscribe({
      next: r => {
        this.runsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'What the pipelines cost could not be read.'); return; }
        this.error.set('');
        this.costs.set(r.data ?? null);
        this.runs.set(r.data?.runs?.rows ?? []);
        this.runsTotal.set(Number(r.data?.runs?.total ?? 0));
      },
      error: () => { this.runsLoading.set(false); this.error.set('What the pipelines cost could not be read.'); },
    });
  }

  loadMore(): void {
    this.loadingMore.set(true);
    this.api.pipelineCosts(this.query(), this.page + 1, RUNS_PAGE, this.filter()).subscribe({
      next: r => {
        this.loadingMore.set(false);
        if (r.status !== API_SUCCESS) return;
        this.page += 1;
        this.runs.update(rows => [...rows, ...(r.data?.runs?.rows ?? [])]);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  private loadRun(id: number | null, tenantId: string | null): void {
    this.run.set(null);
    this.runError.set('');
    if (!id) return;
    this.api.runCost(id, tenantId).subscribe({
      next: r => r.status === API_SUCCESS ? this.run.set(r.data ?? null) : this.runError.set(r.message || `Run #${id}'s cost could not be read.`),
      error: () => this.runError.set(`Run #${id}'s cost could not be read.`),
    });
  }
}
