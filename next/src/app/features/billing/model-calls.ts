import { Component, DestroyRef, LOCALE_ID, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { instantOf } from '../../core/instant';
import { StatTile } from '../../shared/ui/stat-tile';
import { TableShell } from '../../shared/ui/data-table';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { createTableSort } from '../../shared/ui/sort';
import { SortHeader } from '../../shared/ui/sort-header';
import { loadErrorText } from '../../shared/ui/loading';
import { BillingApi, DayTotal, ModelCallModel, ModelCallRate, ModelCallSource, ModelCallSummary, RunRow, UsageQuery } from './billing.service';
import { dayHeading, formatMoney, formatMoneyCell, formatMoneyExact, formatShare, formatUnitPrice, groupByDay, moneyDigits, pluralUnit, zonedDay, zonedStamp, zonedTime } from './billing-format';

/** How many calls Every call reads at a time. */
const CALLS_PAGE = 25;
const CALLS_UNREAD = 'The model calls could not be read.';
/** By source shows the dearest this many, then "Show all N sources". */
export const SOURCES_SHOWN = 8;

export type ModelCallView = 'source' | 'every';

/** What called a model, in words, for a row of Every call: "Prompt 1075", "Tool run", "Document extraction", "Question". */
export function callerLabel(r: Pick<RunRow, 'subject_type' | 'subject_id'>): string {
  switch (r.subject_type) {
    case 'prompt': return r.subject_id && /^\d+$/.test(r.subject_id) ? `Prompt ${r.subject_id}` : 'Prompt with no saved id';
    case 'document': return 'Document extraction';
    case 'tool_run': return 'Tool run';
    case 'ask': return 'Question (Ask your data)';
    case 'ad-hoc': return 'Console call';
    case 'assistant': return 'AI Assistant';
    default: return r.subject_type || 'Model call';
  }
}

/** A saved prompt's id when the caller is one (its link), else null. */
export function promptIdOf(r: Pick<RunRow, 'subject_type' | 'subject_id'>): number | null {
  return r.subject_type === 'prompt' && r.subject_id && /^\d+$/.test(r.subject_id) ? Number(r.subject_id) : null;
}

/**
 * The rates the month's calls were priced at, said once: "in $0.40 / out $1.20 per 1,000 tokens (qwen3:8b)" for a model
 * priced on items of its own, and the meter's rate with the models it priced in brackets. From billing.json/runs/summary's
 * rates, so it is the whole month's, not the page read.
 */
export function rateSentences(rates: ModelCallRate[], models: (string | null)[], currency = 'USD'): string[] {
  const groups = new Map<string, { in: ModelCallRate[]; out: ModelCallRate[] }>();
  for (const r of rates) {
    const key = r.model ?? '';
    const g = groups.get(key) ?? { in: [], out: [] };
    (r.side === 'in' ? g.in : g.out).push(r);
    groups.set(key, g);
  }
  const own = new Set([...groups.keys()].filter(Boolean));
  const others = models.filter((m): m is string => !!m && !own.has(m));
  const price = (p: number) => formatMoney(Number(p), currency, moneyDigits([Number(p)]));
  const out: string[] = [];
  for (const [model, g] of groups) {
    const suffix = model ? ` (${model})` : others.length ? ` (${others.slice(0, 3).join(', ')}${others.length > 3 ? ` +${others.length - 3}` : ''})` : '';
    for (let i = 0; i < Math.max(g.in.length, g.out.length); i++) {
      const a = g.in[i];
      const b = g.out[i];
      if (a && b && Number(a.per) === Number(b.per) && a.unit === b.unit) {
        const per = Number(a.per) > 1 ? `${Number(a.per).toLocaleString('en-US')} ${pluralUnit(a.unit ?? '')}` : a.unit ?? '';
        out.push(`in ${price(a.unit_price)} / out ${price(b.unit_price)} per ${per}${suffix}`);
      } else {
        out.push([a ? `in ${formatUnitPrice(Number(a.unit_price), Number(a.per), a.unit, currency)}` : '',
          b ? `out ${formatUnitPrice(Number(b.unit_price), Number(b.per), b.unit, currency)}` : ''].filter(Boolean).join(' / ') + suffix);
      }
    }
  }
  return out;
}

/**
 * Cost & usage redesign (2026-10-19): AI model calls, replacing "Cost per model call" -- which listed every one of the
 * month's ~2,000 calls 25 at a time, mostly the same prompt again and again, and never said which prompt, tool or model
 * the money went on. Now: the month in four figures, then By source (billing.json/runs/summary: every call added up by
 * what called the model -- each saved prompt, tool runs, document extraction, questions, console calls -- and by model),
 * and Every call, the day-grouped list as it was, read only when asked for. Every figure is at each model's own rate,
 * before the month's allowances and tiers, which the lines above apply; By source's totals are Every call's added up.
 */
@Component({
  selector: 'app-model-calls',
  imports: [StatTile, TableShell, Segmented, RouterLink, DecimalPipe, SortHeader],
  styleUrl: './day-table.css',
  styles: `
    .share-bar { height: 0.375rem; flex: 1 1 auto; min-width: 3rem; border-radius: var(--radius-full); overflow: hidden; background: var(--border-subtle); }
    .share-bar > span { display: block; height: 100%; border-radius: var(--radius-full); background: var(--chart-1); }
    tr.is-repeat .call-run { color: var(--text-muted); }
  `,
  template: `
    <section class="flex flex-col gap-3" data-test="model-calls-section" aria-labelledby="model-calls-heading">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="model-calls-heading" class="section-title mr-auto">AI model calls</h2>
        <app-segmented [(value)]="view" [options]="views" ariaLabel="How to show the model calls" data-test="model-call-view" />
      </div>

      <!-- Owner 2026-10-27: placeholders until the month's summary answers, and "Not available" when it failed -- never 0 / $0.00. -->
      <div class="grid grid-cols-2 md:grid-cols-4 stat-strip stat-row is-md is-start" role="list" data-test="model-call-kpis">
        <app-stat-tile label="Calls" [value]="totals().calls" icon="sparkle" tone="info" [loading]="tilesLoading()" [failed]="tilesFailed()"
                       [foot]="totals().runs ? 'in ' + (totals().runs | number: '1.0-0') + ' pipeline run' + (totals().runs === 1 ? '' : 's') : 'none in a pipeline run'" />
        <app-stat-tile label="Tokens in" [value]="totals().tokens_in" icon="arrowDown" tone="muted" foot="sent to the models" [loading]="tilesLoading()" [failed]="tilesFailed()" />
        <app-stat-tile label="Tokens out" [value]="totals().tokens_out" icon="arrowUp" tone="muted" foot="the models' answers" [loading]="tilesLoading()" [failed]="tilesFailed()" />
        <app-stat-tile label="Cost at model rates" [value]="money(totals().amount)" icon="chart" tone="info" foot="before allowances and tiers" [loading]="tilesLoading()" [failed]="tilesFailed()" />
      </div>
      <p class="text-xs text-[color:var(--text-secondary)]" data-test="model-call-note">
        Each call at its own model's rate, before the month's allowances and tiers, which the lines above apply.
        @if (rateNote().length) { <span data-test="run-rates"><b class="font-medium">Rates:</b> {{ rateNote().join(' · ') }}</span> }
      </p>

      @if (view() === 'source') {
        <div class="grid gap-4 items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
          <app-table-shell heading="By source" [shown]="shownSources().length" [total]="sources().length" [loading]="summaryLoading()" [error]="summaryError()" (retry)="loadSummary()"
                           [isEmpty]="!sources().length" emptyMessage="No model calls in this month yet." emptyIcon="sparkle" [scrollRows]="false">
            <ng-container toolbar><span class="text-xs text-[color:var(--text-muted)]">{{ sourceSort.key() ? 'What called a model.' : 'What called a model, the dearest first.' }}</span></ng-container>
            <table class="table-modern" data-test="model-sources">
              <thead>
                <tr><th appSort="source" [sortBy]="sourceSort">Source</th><th appSort="model" [sortBy]="sourceSort">Model</th><th class="text-right" appSort="calls" [sortBy]="sourceSort">Calls</th><th class="text-right hidden xl:table-cell" appSort="runs" [sortBy]="sourceSort">Pipeline runs</th><th class="text-right" appSort="tokensIn" [sortBy]="sourceSort">Tokens in</th>
                  <th class="text-right" appSort="tokensOut" [sortBy]="sourceSort">Tokens out</th><th class="text-right" appSort="cost" [sortBy]="sourceSort">Cost</th><th class="w-40" appSort="share" [sortBy]="sourceSort">Share</th><th class="whitespace-nowrap hidden xl:table-cell" appSort="last" [sortBy]="sourceSort">Last call</th></tr>
              </thead>
              <tbody>
                @for (s of shownSources(); track s.subject_type + ':' + (s.subject_id ?? '')) {
                  <tr data-test="model-source">
                    <td class="min-w-44">
                      @if (sourcePrompt(s); as id) {
                        <a class="link-inline font-medium" [routerLink]="['/pipelines/prompts', id, 'edit']" data-test="model-source-prompt">{{ promptLabel(id, s.label) }}</a>
                      } @else { <span class="font-medium">{{ s.label }}</span> }
                      <span class="block text-[11px] text-[color:var(--text-muted)]">{{ sourceKind(s) }}</span>
                    </td>
                    <td class="mono text-xs whitespace-nowrap">{{ s.model || '—' }}@if (s.models > 1) { <span class="text-[color:var(--text-muted)]"> +{{ s.models - 1 }}</span> }</td>
                    <td class="text-right tabular">{{ s.calls | number: '1.0-0' }}</td>
                    <td class="text-right tabular hidden xl:table-cell">{{ s.runs ? (s.runs | number: '1.0-0') : '—' }}</td>
                    <td class="text-right tabular">{{ s.tokens_in | number: '1.0-0' }}</td>
                    <td class="text-right tabular">{{ s.tokens_out | number: '1.0-0' }}</td>
                    <td class="text-right tabular font-medium" [title]="exact(s.amount)">{{ money(s.amount) }}</td>
                    <td>
                      <div class="flex items-center gap-2" [title]="shareText(s.amount) + ' of the model calls'">
                        <div class="share-bar" aria-hidden="true"><span [style.width.%]="s.amount > 0 ? Math.max(share(s.amount), 1) : 0"></span></div>
                        <span class="text-[11px] tabular text-[color:var(--text-muted)] w-9 text-right">{{ shareText(s.amount) }}</span>
                      </div>
                    </td>
                    <td class="text-xs tabular whitespace-nowrap text-[color:var(--text-secondary)] hidden xl:table-cell">{{ stamp(s.last) }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (sources().length > SOURCES_SHOWN) {
              <div class="flex justify-center px-4 py-2 border-t border-subtle">
                <button type="button" class="btn btn-default btn-sm" data-test="all-sources" (click)="allSources.set(!allSources())">
                  {{ allSources() ? (sourceSort.key() ? 'Show the first ' : 'Show the dearest ') + SOURCES_SHOWN : 'Show all ' + sources().length + ' sources' }}</button>
              </div>
            }
          </app-table-shell>

          <!-- Owner 2026-10-27: a failed read says so here too; it read "No model calls" before. -->
          <app-table-shell heading="By model" [loading]="summaryLoading()" [isEmpty]="!models().length" [error]="summaryError()" (retry)="loadSummary()"
                           emptyMessage="No model calls in this month yet." emptyIcon="sparkle" [scrollRows]="false">
            <table class="table-modern" data-test="model-models">
              <thead><tr><th appSort="model" [sortBy]="modelSort">Model</th><th class="text-right" appSort="calls" [sortBy]="modelSort">Calls</th><th class="text-right" appSort="tokens" [sortBy]="modelSort">Tokens</th><th class="text-right" appSort="cost" [sortBy]="modelSort">Cost</th><th class="w-14 text-right" appSort="share" [sortBy]="modelSort">Share</th></tr></thead>
              <tbody>
                @for (m of sortedModels(); track m.model ?? '') {
                  <tr data-test="model-row">
                    <td class="mono text-xs">{{ m.model || 'Model not named' }}</td>
                    <td class="text-right tabular">{{ m.calls | number: '1.0-0' }}</td>
                    <td class="text-right tabular" [title]="(m.tokens_in | number: '1.0-0') + ' in · ' + (m.tokens_out | number: '1.0-0') + ' out'">{{ (m.tokens_in + m.tokens_out) | number: '1.0-0' }}</td>
                    <td class="text-right tabular font-medium" [title]="exact(m.amount)">{{ money(m.amount) }}</td>
                    <td class="text-right tabular text-[color:var(--text-muted)] text-[11px]">{{ shareText(m.amount) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </app-table-shell>
        </div>
      } @else {
        <app-table-shell heading="Every call" [shown]="runs().length" [total]="runsTotal()" [loading]="runsLoading() && !runs().length"
                         [isEmpty]="!runs().length" [error]="runsError()" (retry)="retryRuns()" emptyMessage="No model calls in this month yet." emptyIcon="sparkle" [scrollRows]="false">
          <ng-container toolbar>
            <span class="text-xs text-[color:var(--text-muted)]">{{ everyNote() }}</span>
          </ng-container>
          <div class="day-table-scroll" data-test="model-call-scroll">
          <table class="table-modern day-table" data-test="model-calls">
            <thead>
              <tr>
                <th class="w-20" appSort="time" [sortBy]="callSort">Time</th>
                <th>What called it</th>
                <th>Pipeline run</th>
                <th appSort="model" [sortBy]="callSort">Model</th>
                <th class="text-right" appSort="tokensIn" [sortBy]="callSort">Tokens in</th>
                <th class="text-right" appSort="tokensOut" [sortBy]="callSort">Tokens out</th>
                @if (runActors().length > 1) { <th class="hidden lg:table-cell">By</th> }
                <th class="text-right" appSort="cost" [sortBy]="callSort">Cost</th>
              </tr>
            </thead>
            <!-- Owner 2026-10-27: in time order the calls sit under their billing day; sorted by anything else the day headers
                 would cut the order up, so the calls are one list (the day is in each row's time then). -->
            @for (g of runGroups(); track g.day) {
              <tbody>
                @if (g.day !== undefined) {
                  <tr class="day-group" data-test="day-group">
                    <th [attr.colspan]="runActors().length > 1 ? 8 : 7" scope="colgroup">
                      <div class="day-group-line"><span>{{ g.day ? dayTitle(g.day) : 'Time not known' }}</span>
                        <span class="day-group-sum" [title]="exact(g.amount)">{{ g.count | number: '1.0-0' }} {{ g.count === 1 ? 'call' : 'calls' }} · {{ money(g.amount) }}</span></div>
                    </th>
                  </tr>
                }
                @for (r of g.rows; track r.run; let i = $index) {
                  <tr [title]="runRates(r)" [class.is-repeat]="isRepeat(g.rows, i)" data-test="model-call">
                    <td class="text-xs tabular whitespace-nowrap" data-test="run-time">{{ g.day === undefined ? runStamp(r) : runTime(r) }}</td>
                    <td class="min-w-40">
                      @if (promptOf(r); as id) { <a class="link-inline font-medium" [routerLink]="['/pipelines/prompts', id, 'edit']">{{ promptLabel(id, runLabel(r)) }}</a> }
                      @else { <span class="font-medium">{{ runLabel(r) }}</span> }
                      <span class="block text-[11px] mono text-[color:var(--text-muted)]">{{ r.run }}</span>
                    </td>
                    <td class="call-run min-w-36" data-test="call-run">
                      @if (r.job_queue_id) {
                        @if (r.job_id) { <a class="link-inline mono" [routerLink]="['/pipelines/schedules', r.job_id, 'runs', r.job_queue_id]">#{{ r.job_queue_id }}</a> }
                        @else { <span class="mono">#{{ r.job_queue_id }}</span> }
                        @if (isRepeat(g.rows, i)) { <span class="text-[11px]"> same run</span> }
                        @else if (r.pipeline) { <span class="block text-[11px] text-[color:var(--text-muted)]">{{ r.pipeline }}</span> }
                      } @else { <span class="text-[color:var(--text-muted)]">—</span> }
                    </td>
                    <td class="mono text-xs">{{ r.model || '—' }}</td>
                    <td class="text-right tabular">{{ r.tokens_in | number: '1.0-0' }}</td>
                    <td class="text-right tabular">{{ r.tokens_out | number: '1.0-0' }}</td>
                    @if (runActors().length > 1) { <td class="hidden lg:table-cell text-xs text-[color:var(--text-muted)]">{{ runActor(r) }}</td> }
                    <td class="text-right tabular font-medium" [title]="exact(r.amount)">{{ cell(r.amount) }}</td>
                  </tr>
                }
              </tbody>
            }
          </table>
          </div>
          @if (moreRuns()) {
            <div class="flex justify-center px-4 py-2 border-t border-subtle">
              <button type="button" class="btn btn-default btn-sm" data-test="more-calls" (click)="loadRuns()" [disabled]="runsLoading()">{{ runsLoading() ? 'Reading…' : 'Show more calls' }}</button>
            </div>
          }
        </app-table-shell>
      }
    </section>
  `,
})
export class ModelCalls {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);
  /** ZT-B8: the workspace's saved prompts by id, read once when a saved prompt called a model; empty until then. */
  readonly promptNames = signal(new Map<number, string>());
  private promptNamesRead = false;
  /** The month on screen (the page's own range and workspace). */
  readonly query = input.required<UsageQuery>();
  readonly currency = input('USD');
  /** The workspace's billing zone (H9): days and times are its, never the browser's. */
  readonly timeZone = input<string | null>(null);

  readonly views: SegmentOption<ModelCallView>[] = [{ id: 'source', label: 'By source' }, { id: 'every', label: 'Every call' }];
  readonly view = signal<ModelCallView>('source');
  readonly Math = Math;

  // ---- by source (billing.json/runs/summary) ----
  readonly summary = signal<ModelCallSummary | null>(null);
  /** Owner 2026-10-27: loading from the start (the read runs from an effect), so nothing reads "no model calls" before it. */
  readonly summaryLoading = signal(true);
  readonly summaryError = signal('');
  /** The tiles wait for the month's summary (a new month clears the old one), and say when it could not be read. */
  readonly tilesLoading = computed(() => this.summaryLoading() && !this.summary());
  readonly tilesFailed = computed(() => !!this.summaryError() && !this.summary());
  readonly totals = computed(() => {
    const t = this.summary()?.totals;
    return { calls: Number(t?.calls ?? 0), runs: Number(t?.runs ?? 0), tokens_in: Number(t?.tokens_in ?? 0), tokens_out: Number(t?.tokens_out ?? 0), amount: Number(t?.amount ?? 0) };
  });
  readonly sources = computed<ModelCallSource[]>(() => (this.summary()?.bySource ?? []).map(s => ({
    ...s, calls: Number(s.calls), runs: Number(s.runs), tokens_in: Number(s.tokens_in), tokens_out: Number(s.tokens_out), amount: Number(s.amount), models: Number(s.models ?? 1),
  })));
  readonly SOURCES_SHOWN = SOURCES_SHOWN;
  readonly allSources = signal(false);
  /**
   * Owner 2026-10-27: By source sorts on every column, before the cut to the first eight. Billing sends the dearest first,
   * which stays the order until a heading is picked (initial null). Share is the cost's share, so it sorts by cost.
   */
  readonly sourceSort = createTableSort<ModelCallSource>({
    id: 'billing-model-sources',
    columns: {
      source: s => { const id = promptIdOf(s); return id !== null ? this.promptLabel(id, s.label) : s.label; },
      model: s => s.model,
      calls: { value: s => s.calls, kind: 'number' },
      runs: { value: s => s.runs, kind: 'number' },
      tokensIn: { value: s => s.tokens_in, kind: 'number' },
      tokensOut: { value: s => s.tokens_out, kind: 'number' },
      cost: { value: s => s.amount, kind: 'number' },
      share: { value: s => s.amount, kind: 'number' },
      last: { value: s => s.last, kind: 'date' },
    },
  });
  readonly sortedSources = computed(() => this.sourceSort.apply(this.sources()));
  readonly shownSources = computed(() => this.allSources() ? this.sortedSources() : this.sortedSources().slice(0, SOURCES_SHOWN));
  readonly models = computed<ModelCallModel[]>(() => (this.summary()?.byModel ?? []).map(m => ({
    ...m, calls: Number(m.calls), runs: Number(m.runs), tokens_in: Number(m.tokens_in), tokens_out: Number(m.tokens_out), amount: Number(m.amount),
  })));
  /** Owner 2026-10-27: By model sorts too; the order Billing sends stays until a heading is picked. */
  readonly modelSort = createTableSort<ModelCallModel>({
    id: 'billing-model-models',
    columns: {
      model: m => m.model || 'Model not named',
      calls: { value: m => m.calls, kind: 'number' },
      tokens: { value: m => m.tokens_in + m.tokens_out, kind: 'number' },
      cost: { value: m => m.amount, kind: 'number' },
      share: { value: m => m.amount, kind: 'number' },
    },
  });
  readonly sortedModels = computed(() => this.modelSort.apply(this.models()));
  /** The month's rates, said once (from the summary, so the whole month's, not the page read). */
  readonly rateNote = computed(() => rateSentences(this.summary()?.rates ?? [], this.models().map(m => m.model), this.cur()));

  // ---- every call (billing.json/runs) ----
  readonly runs = signal<RunRow[]>([]);
  readonly runsTotal = signal(0);
  readonly runsLoading = signal(false);
  readonly runsError = signal('');
  readonly runDays = signal<DayTotal[]>([]);
  private runsPage = 0;
  /** Whether Every call has been read for the month on screen (it is read when first shown). */
  private runsRead = false;
  readonly moreRuns = computed(() => this.runs().length < this.runsTotal());
  /**
   * Owner 2026-10-27 ("add a sort on each table"): Every call sorts on the server (billing.json/runs sort/dir), since it is
   * paged -- sorting the pages read would be a lie about the month. A new order drops the pages read and reads again from
   * the first; "Show more calls" then pages on through that order. No order picked: newest first, as before, and no sort
   * is sent.
   */
  readonly callSort = createTableSort<RunRow>({
    id: 'billing-model-calls',
    server: true,
    columns: {
      time: { value: r => r.last, kind: 'date', param: 'time' },
      model: { value: r => r.model, param: 'model' },
      tokensIn: { value: r => r.tokens_in, kind: 'number', param: 'tokensIn' },
      tokensOut: { value: r => r.tokens_out, kind: 'number', param: 'tokensOut' },
      cost: { value: r => r.amount, kind: 'number', param: 'cost' },
    },
    onChange: () => { this.resetRuns(); if (this.view() === 'every') this.loadRuns(); },
  });
  /** Whether the calls sit under day headers: in time order only (the list's own, newest first, is time order too). */
  readonly byDay = computed(() => !this.callSort.key() || this.callSort.key() === 'time');
  /**
   * Owner review 2026-10-12 ("date repeat in the cost"): the calls cut into billing days -- a header per day saying its calls
   * and its cost, and only the time on each row, in the workspace's billing zone. Sorted by anything but time, one group with
   * no day (undefined): the template then draws no header and gives each row its date too.
   */
  readonly runGroups = computed<{ day: string | null | undefined; rows: RunRow[]; count: number; amount: number }[]>(() => {
    if (!this.byDay()) {
      const rows = this.runs();
      return rows.length ? [{ day: undefined, rows, count: rows.length, amount: rows.reduce((n, r) => n + r.amount, 0) }] : [];
    }
    const zone = this.timeZone();
    const totals = new Map(this.runDays().map(d => [d.day, d]));
    return groupByDay(this.runs(), r => { const at = instantOf(r.last); return at ? zonedDay(at, zone) : null; }).map(g => {
      const total = g.day ? totals.get(g.day) : undefined;
      return { ...g, count: total?.runs ?? g.rows.length, amount: Number(total?.amount ?? g.rows.reduce((n, r) => n + r.amount, 0)) };
    });
  });
  /** Everyone the calls on screen were by; the By column is shown only when it says something. */
  readonly runActors = computed(() => [...new Set(this.runs().map(r => this.runActor(r)))]);
  readonly everyNote = computed(() => {
    const [only, ...others] = this.runActors();
    const order = this.callSort.key() ? 'Sorted on the server, across the whole month' : 'Newest first';
    if (!only || others.length) return order + '.';
    return only === 'Pipeline' ? `${order}, every call on this page by a pipeline.` : `${order}, every call by ${only}.`;
  });

  private summaryReading?: Subscription;
  private runsReading?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.summaryReading?.unsubscribe(); this.runsReading?.unsubscribe(); });
    effect(() => {
      this.query();
      // A new month is another scope: its figures are not the last month's, so the old summary goes (owner 2026-10-27).
      untracked(() => { this.allSources.set(false); this.summary.set(null); this.loadSummary(); this.resetRuns(); if (this.view() === 'every') this.loadRuns(); });
    });
    // Every call is read the first time it is shown for the month.
    effect(() => { if (this.view() === 'every') untracked(() => { if (!this.runsRead) this.loadRuns(); }); });
  }

  private cur(): string { return this.summary()?.currency || this.currency(); }
  /** A total -- the month's, a source's, a day's -- exactly: a sub-cent total keeps its digits. */
  money(value: number): string { const v = Number(value) || 0; return formatMoney(v, this.cur(), v !== 0 && Math.abs(v) < 0.01 ? 4 : 2); }
  /** One call's cost: cents, "<$0.01" under a cent. */
  cell(value: number): string { return formatMoneyCell(value, this.cur()); }
  exact(value: number): string { return formatMoneyExact(value, this.cur()); }
  share(amount: number): number { const t = this.totals().amount; return t > 0 ? (Number(amount) / t) * 100 : 0; }
  shareText(amount: number): string { return formatShare(this.share(amount), Number(amount)); }
  stamp(value: string | null): string { const at = instantOf(value); return at ? zonedStamp(at, this.timeZone() ?? this.summary()?.zone ?? null) : ''; }
  dayTitle(day: string): string { return dayHeading(day, this.locale); }

  sourcePrompt(s: ModelCallSource): number | null { return promptIdOf(s); }
  /** What a source row is, under its name. */
  sourceKind(s: ModelCallSource): string {
    switch (s.subject_type) {
      case 'prompt': return s.subject_id ? 'Saved prompt' : 'Prompts run before they were saved';
      case 'tool_run': return 'Every tool run, the AI Assistant\'s included';
      case 'document': return 'Every document read by Document Intelligence';
      case 'ask': return 'Every question asked of a connection';
      case 'ad-hoc': return 'Model calls made from the console';
      case 'assistant': return 'Every AI Assistant conversation';
      default: return 'Other model calls';
    }
  }

  loadSummary(): void {
    this.summaryReading?.unsubscribe();
    this.summaryLoading.set(true);
    this.summaryError.set('');
    this.summaryReading = this.api.runSummary(this.query()).subscribe({
      next: r => {
        this.summaryLoading.set(false);
        if (r.status !== API_SUCCESS) { this.summary.set(null); this.summaryError.set(loadErrorText(r, CALLS_UNREAD)); return; }
        this.summary.set(r.data ?? null);
        this.readPromptNames();
      },
      error: err => { this.summaryLoading.set(false); this.summaryError.set(loadErrorText(err, CALLS_UNREAD)); },
    });
  }

  /** A saved prompt's name, else what the meter calls it ("Prompt 1000"). */
  promptLabel(id: number, fallback: string): string { return this.promptNames().get(id) ?? fallback; }

  /**
   * ZT-B8: names for the saved prompts once one appears. Not on the platform's own sign-in, which reads no workspace's
   * prompts (ZT-M4): there the id stays.
   */
  private readPromptNames(): void {
    if (this.promptNamesRead || !this.sources().some(s => promptIdOf(s) !== null)) return;
    if (this.auth.isPlatformAdmin() && !this.auth.isManagedSession()) return;
    this.promptNamesRead = true;
    // Cosmetic when it fails: the meter's own "Prompt 1075" stays as the name (owner 2026-10-27: an avatar-like read may stay quiet).
    this.api.promptNames().subscribe({ next: names => this.promptNames.set(names), error: () => { this.promptNamesRead = false; } });
  }

  private resetRuns(): void {
    this.runsReading?.unsubscribe();
    this.runs.set([]); this.runsTotal.set(0); this.runDays.set([]); this.runsPage = 0; this.runsRead = false; this.runsError.set('');
  }

  /** The next page of the month's model calls, each at its own model's rate. */
  loadRuns(): void {
    this.runsRead = true;
    this.runsLoading.set(true); this.runsError.set('');
    const page = this.runsPage + 1;
    this.runsReading?.unsubscribe();
    this.runsReading = this.api.runs(this.query(), page, CALLS_PAGE, this.callSort.param()).subscribe({
      next: r => {
        this.runsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.runsError.set(loadErrorText(r, CALLS_UNREAD)); return; }
        this.runsPage = page;
        this.runsTotal.set(Number(r.data?.total ?? 0));
        if (r.data?.days) this.runDays.set(r.data.days.map(d => ({ day: d.day, runs: Number(d.runs), amount: Number(d.amount ?? 0) })));
        this.runs.update(list => [...list, ...(r.data?.rows ?? []).map(x => ({
          ...x, tokens_in: Number(x.tokens_in), tokens_out: Number(x.tokens_out), amount: Number(x.amount),
          lines: (x.lines ?? []).map(l => ({ ...l, quantity: Number(l.quantity), per: Number(l.per), unit_price: Number(l.unit_price), amount: Number(l.amount) })),
        }))]);
      },
      error: err => { this.runsLoading.set(false); this.runsError.set(loadErrorText(err, CALLS_UNREAD)); },
    });
  }

  /** After a failed read: the month's calls from the first page. */
  retryRuns(): void { this.resetRuns(); this.loadRuns(); }

  runLabel(r: RunRow): string { return callerLabel(r); }
  promptOf(r: RunRow): number | null { return promptIdOf(r); }
  /** A row whose pipeline run is the row above's: it says "same run" rather than the pipeline again. */
  isRepeat(rows: RunRow[], i: number): boolean { return i > 0 && !!rows[i].job_queue_id && rows[i].job_queue_id === rows[i - 1].job_queue_id; }
  /** Each priced line of a call as "2,000 in at $0.40 per 1,000 tokens" -- a row's tooltip. */
  runRates(r: RunRow): string {
    return r.lines.map(l => `${Math.round(l.quantity).toLocaleString('en-US')} ${l.meter.startsWith('ai.tokens.in') ? 'in' : 'out'} at ${formatUnitPrice(l.unit_price, l.per, l.unit, this.cur())}`).join(' · ');
  }
  /** A call's time of day in the workspace's billing zone, 24-hour. */
  runTime(r: RunRow): string { const at = instantOf(r.last); return at ? zonedTime(at, this.timeZone()) : ''; }
  /** A call's day and time, for the one list a sort by anything but time shows (no day headers there). */
  runStamp(r: RunRow): string { const at = instantOf(r.last); return at ? zonedStamp(at, this.timeZone()) : ''; }
  runActor(r: RunRow): string { return r.actor_name || (r.actor_user_id ? `User #${r.actor_user_id}` : 'Pipeline'); }
}
