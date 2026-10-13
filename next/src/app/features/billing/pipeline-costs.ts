import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { BillingApi, PipelineCostRow, PipelineCosts as Costs, RunCost, RunCostRow, UsageQuery } from './billing.service';
import { formatMoney, moneyDigits } from './billing-format';

const RUNS_PAGE = 25;

/** A run's meters in words, the costliest first: "Model tokens in $0.41 · Pipeline runs $0.002" (at most three). */
export function meterSummary(row: RunCostRow, currency = 'USD'): string {
  const meters = [...(row.meters ?? [])].sort((a, b) => b.cost - a.cost);
  const shown = meters.slice(0, 3).map(m => `${m.label} ${formatMoney(m.cost, currency, moneyDigits([m.cost]))}`);
  return shown.join(' · ') + (meters.length > 3 ? ` · ${meters.length - 3} more` : '');
}

/** The share of the total a pipeline's cost is, as a whole percent (0 when there is no total). */
export function shareOf(cost: number, total: number): number {
  return total > 0 ? Math.round((cost / total) * 100) : 0;
}

/**
 * UX review B9 (BL1): what each pipeline and each run cost, in Cost & usage. The figures are Billing's own share-out of
 * the same priced lines the page lists above (billing.json/pipelineCosts): every line's amount split over the runs that
 * used it, so the runs plus "not tied to a run" add up to the month's total -- and, for a closed month, the invoice. A run
 * opened from its run page (?run=) is shown on its own first (billing.json/runCost).
 */
@Component({
  selector: 'app-pipeline-costs',
  imports: [Icon, TableShell, StatusPill, ServerTimePipe, RouterLink],
  template: `
    <section class="flex flex-col gap-3" data-test="pipeline-costs" aria-labelledby="pipeline-costs-heading">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="pipeline-costs-heading" class="section-title">Cost by pipeline</h2>
        @if (costs(); as c) {
          <p class="text-xs text-[color:var(--text-muted)]" data-test="costs-reconcile">
            {{ money(c.attributed) }} of {{ money(c.total) }} came from pipeline runs; {{ money(c.notTiedToRun) }} is not tied to a run
            (storage kept, analytics, the console's own reads, API calls). Together they are this month's total.
          </p>
        }
      </div>

      @if (run(); as r) {
        <div class="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-test="run-cost">
          <span class="stat-glyph"><app-icon name="history" /></span>
          <div class="min-w-0 mr-auto">
            <p class="text-sm"><b>Run #{{ r.jobQueueId }}</b>@if (r.pipeline) { · {{ r.pipeline }} }@if (r.schedule) { <span class="text-[color:var(--text-muted)]">({{ r.schedule }})</span> }</p>
            <p class="text-xs text-[color:var(--text-muted)]">{{ r.meters.length ? meterSummary(r) : 'Nothing billed for this run yet.' }}</p>
          </div>
          <span class="text-lg font-semibold tabular">{{ money(r.cost) }}</span>
          @if (r.jobId) {
            <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.jobQueueId, 'logs']"><app-icon name="file" />Open the run</a>
          }
        </div>
      } @else if (runError()) {
        <p class="text-xs text-crit-500" role="alert">{{ runError() }}</p>
      }

      <div class="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
        <app-table-shell heading="By pipeline" [shown]="pipelines().length" [loading]="loading() && !costs()" [error]="error()" (retry)="load()"
                         [isEmpty]="!pipelines().length" emptyMessage="No pipeline run was billed in this month yet." emptyIcon="layers">
          <table class="table-modern" data-test="cost-by-pipeline">
            <thead>
              <tr><th>Pipeline</th><th class="text-right">Runs</th><th class="text-right">Cost</th><th class="w-28">Share</th></tr>
            </thead>
            <tbody>
              @for (p of pipelines(); track p.taskDetailId ?? $index) {
                <tr>
                  <td class="max-w-64">
                    @if (p.taskDetailId) {
                      <a class="link-inline font-medium block truncate" [routerLink]="['/pipelines', p.taskDetailId, 'edit']" [title]="p.pipeline ?? ''">{{ p.pipeline || 'Pipeline #' + p.taskDetailId }}</a>
                    } @else { <span class="text-[color:var(--text-muted)]">Pipeline not named</span> }
                    @if (p.lastRunAt) { <span class="block text-[11px] text-[color:var(--text-muted)]">last run {{ p.lastRunAt | serverTime: 'recent' }}</span> }
                  </td>
                  <td class="text-right tabular">{{ p.runs }}</td>
                  <td class="text-right tabular font-medium" [title]="exact(p.cost)">{{ money(p.cost) }}</td>
                  <td>
                    <div class="flex items-center gap-2" [title]="share(p) + '% of the month'">
                      <div class="h-1.5 flex-1 rounded-full overflow-hidden bg-sunken"><div class="h-full rounded-full bg-[color:var(--chart-0)]" [style.width.%]="share(p)"></div></div>
                      <span class="text-[11px] tabular text-[color:var(--text-muted)] w-8 text-right">{{ share(p) }}%</span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </app-table-shell>

        <app-table-shell heading="By run" [shown]="runs().length" [total]="runsTotal()" [loading]="loading() && !costs()" [error]="error()" (retry)="load()"
                         [isEmpty]="!runs().length" emptyMessage="No pipeline run was billed in this month yet." emptyIcon="history">
          <table class="table-modern" data-test="cost-by-run">
            <thead>
              <tr><th>Run</th><th>Pipeline</th><th>Started</th><th class="w-28">Status</th><th class="text-right">Cost</th></tr>
            </thead>
            <tbody>
              @for (r of runs(); track r.jobQueueId) {
                <tr [class.is-focused]="r.jobQueueId === runId()">
                  <td class="mono whitespace-nowrap">
                    @if (r.jobId) { <a class="link-inline" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.jobQueueId, 'logs']">#{{ r.jobQueueId }}</a> }
                    @else { #{{ r.jobQueueId }} }
                  </td>
                  <td class="max-w-72">
                    <span class="block truncate" [title]="r.pipeline ?? ''">{{ r.pipeline || '—' }}</span>
                    <span class="block text-[11px] text-[color:var(--text-muted)] truncate" [title]="meterSummary(r)">{{ meterSummary(r) }}</span>
                  </td>
                  <td class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ r.startedAt ? (r.startedAt | serverTime: 'recent') : '—' }}</td>
                  <td class="w-28">@if (r.status) { <app-status [label]="r.status" [quiet]="true" /> }</td>
                  <td class="text-right tabular font-medium" [title]="exact(r.cost)">{{ money(r.cost) }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (moreRuns()) {
            <div class="flex justify-center px-4 py-2">
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

  readonly costs = signal<Costs | null>(null);
  readonly runs = signal<RunCostRow[]>([]);
  readonly runsTotal = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly run = signal<RunCost | null>(null);
  readonly runError = signal('');
  readonly pipelines = computed<PipelineCostRow[]>(() => this.costs()?.pipelines ?? []);
  readonly moreRuns = computed(() => this.runs().length < this.runsTotal());
  readonly meterSummary = (r: RunCostRow) => meterSummary(r, this.costs()?.currency ?? this.currency());
  private page = 1;
  private reading?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reading?.unsubscribe());
    effect(() => { this.query(); untracked(() => this.load()); });
    effect(() => {
      const id = this.runId();
      const q = this.query();
      untracked(() => this.loadRun(id, q.tenantId ?? null));
    });
  }

  money(value: number): string {
    const currency = this.costs()?.currency ?? this.currency();
    return formatMoney(value, currency, value !== 0 && Math.abs(value) < 0.01 ? 4 : 2);
  }

  exact(value: number): string { return formatMoney(value, this.costs()?.currency ?? this.currency(), 5); }
  share(p: PipelineCostRow): number { return shareOf(p.cost, this.costs()?.total ?? 0); }

  load(): void {
    this.reading?.unsubscribe();
    this.page = 1;
    this.loading.set(true);
    this.error.set('');
    this.reading = this.api.pipelineCosts(this.query(), 1, RUNS_PAGE).subscribe({
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

  loadMore(): void {
    this.loadingMore.set(true);
    this.api.pipelineCosts(this.query(), this.page + 1, RUNS_PAGE).subscribe({
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
