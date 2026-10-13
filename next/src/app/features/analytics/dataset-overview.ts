import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { DataText } from '../../shared/ui/data-text';
import { formatSize } from '../../shared/ui/format-size';
import { BarChart, Bar } from '../../shared/charts/bar-chart';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { readableCell } from '../../shared/charts/number-format';
import { dayLabel, formatDuration } from '../../shared/ui/time-format';
import { AnalyticsService, AnalysisRequest, DatasetOverview as OverviewData, DatasetProfile, OverviewChart } from './analytics.service';
import { AnalyticsWidget, WidgetState } from './analytics-widget';
import { WidgetChart } from './widget-chart';
import { analysisView, WidgetView } from './widget-view';

/** A chart on the overview, drawn: the server's chart plus the view the tile renders. */
interface OverviewTile { chart: OverviewChart; view: WidgetView | null; kind: string; }

/**
 * A dataset at a glance, before anyone has asked it a question: rows over time when there is a
 * date, the top values of the categorical columns, the spread of the numeric ones, and which
 * columns have gaps. Every figure comes from one governed read of the file; nothing here is a
 * stored picture. Each tile can be picked up by the Canvas as the analysis it was.
 */
@Component({
  selector: 'app-dataset-overview',
  imports: [Icon, AnalyticsWidget, WidgetChart, BarChart, RankedBar, DataText],
  template: `
    <!-- No tiles here. Rows, columns, Complete and Quality are the Studio's KPI strip right above
         this (owner, 2026-09-28), where the quality count -- which this component cannot see --
         sits beside the other three. -->
    @if (loading()) {
      <div class="widget-grid" aria-busy="true">
        @for (n of [1, 2, 3, 4]; track n) {
          <app-analytics-widget [title]="'Reading the file…'" state="running" [refreshable]="false" />
        }
      </div>
    } @else if (error()) {
      <div class="card p-8 text-center">
        <app-icon name="alert" size="1.6rem" class="icon-crit" />
        <p class="text-sm text-crit-500 mt-2">{{ error() }}</p>
        <button type="button" class="btn btn-default btn-sm mt-3" (click)="load()"><app-icon name="refresh" />Try again</button>
      </div>
    } @else if (!tiles().length) {
      <div class="card p-8 text-center text-sm text-[color:var(--text-muted)]">
        <app-icon name="chart" size="1.5rem" class="icon-muted" />
        <p class="mt-2">{{ rows() === 0 ? 'The file has no rows, so there is nothing to chart.' : 'No column here lends itself to a chart unasked — a date, a category with a handful of values, or a numeric measure. The Canvas can still ask anything.' }}</p>
      </div>
    } @else {
      <div class="flex items-center justify-between gap-2 mb-2">
        <p class="text-xs text-[color:var(--text-muted)]" title="Each opens in the Canvas as the analysis that drew it.">{{ tiles().length }} chart{{ tiles().length === 1 ? '' : 's' }} chosen from the columns, read in {{ took() }}.</p>
        <button type="button" class="btn btn-default btn-sm" (click)="load(true)" [disabled]="loading()"><app-icon name="refresh" [class.spin]="loading()" />Refresh</button>
      </div>
      <div class="widget-grid">
        @for (tile of tiles(); track tile.chart.title) {
          <app-analytics-widget [title]="tile.chart.title" [subtitle]="tile.chart.question" [state]="stateOf(tile)" [error]="tile.chart.error || ''" [refreshable]="false"
                                emptyMessage="No rows fell into this chart.">
            <ng-container actions>
              @if (tile.chart.request) {
                <button type="button" class="btn btn-ghost btn-xs" (click)="openInCanvas.emit(tile.chart.request!)" [attr.aria-label]="'Open ' + tile.chart.title + ' in the Canvas'" title="Open in the Canvas">
                  <app-icon name="external" size="0.9em" />Canvas
                </button>
              }
            </ng-container>
            @switch (tile.chart.kind) {
              @case ('spread') {
                @if (tile.chart.distribution; as d) {
                  @if (d.exactValues) {
                    <app-ranked-bar [data]="valueBars(d)" [max]="8" [showPercent]="true" [formatValue]="figure" />
                  } @else {
                    <app-bar-chart [data]="binBars(d)" [height]="150" [format]="figure" emptyMessage="No rows fell into this chart." />
                  }
                  @if (d.mostCommon && (d.mostCommonRows ?? 0) > 1) {
                    <!-- A value of the file, which can be a 20,000-character note (owner, 2026-09-28): data text,
                         two lines, the whole of it behind "Show all". -->
                    <div class="text-[11px] text-[color:var(--text-muted)] mt-1 min-w-0">
                      <p>Most common, in {{ (d.mostCommonRows ?? 0).toLocaleString() }} rows:</p>
                      <app-data-text class="mono" [value]="d.mostCommon" [lines]="2" [label]="d.name + ' · most common'" />
                    </div>
                  }
                }
              }
              @case ('completeness') {
                @if (tile.view) { <app-ranked-bar [data]="tile.view.marks" [max]="12" [showPercent]="false" [formatValue]="percent" /> }
              }
              @default {
                @if (tile.view) { <app-widget-chart [view]="tile.view" [kind]="tile.kind" [height]="150" /> }
              }
            }
            <div foot class="widget-foot"><span class="text-[11px] text-[color:var(--text-muted)]">{{ footOf(tile) }}</span></div>
          </app-analytics-widget>
        }
      </div>
    }
  `,
})
export class DatasetOverview {
  private readonly analytics = inject(AnalyticsService);
  readonly connection = input.required<string>();
  readonly path = input.required<string>();
  readonly multiFile = input(false);
  readonly sizeBytes = input<number | null>(null);
  readonly modified = input('');
  /** The Canvas picks the tile up as the request that drew it. */
  readonly openInCanvas = output<AnalysisRequest>();
  /** The profile that came with the overview, so the Profile and Quality tabs need not scan the file again. */
  readonly profiled = output<DatasetProfile>();

  readonly loading = signal(false);
  readonly error = signal('');
  readonly overview = signal<OverviewData | null>(null);
  /** How long the engine took to read the overview, as the console writes a duration. */
  readonly took = computed(() => formatDuration((this.overview()?.durationMs ?? 0) / 1000));
  private inFlight: Subscription | null = null;

  readonly figure = (value: number): string => readableCell(String(value));
  readonly percent = (value: number): string => `${value}% missing`;

  readonly rows = computed(() => this.overview()?.profile.totalRows ?? null);
  readonly columns = computed(() => this.overview()?.profile.columns.length ?? 0);
  readonly completeness = computed(() => {
    const cols = this.overview()?.profile.columns ?? [];
    const known = cols.filter(c => c.completeness !== null);
    if (!known.length) return null;
    return Math.round(known.reduce((n, c) => n + Number(c.completeness), 0) / known.length * 10) / 10;
  });
  readonly gaps = computed(() => (this.overview()?.profile.columns ?? []).filter(c => Number(c.nullPercentage ?? 0) > 0).length);
  readonly typeMix = computed(() => {
    const by = new Map<string, number>();
    for (const c of this.overview()?.profile.columns ?? []) by.set(c.type, (by.get(c.type) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(' · ') || 'read the file to see its types';
  });
  readonly sizeText = computed(() => this.sizeBytes() === null ? '—' : formatSize(this.sizeBytes()));

  /** The charts the server chose, each turned into the view the shared chart draws. */
  readonly tiles = computed<OverviewTile[]>(() => (this.overview()?.charts ?? []).map(chart => {
    if (chart.kind === 'completeness' && chart.result) {
      const marks = (chart.result.rows ?? []).map(row => ({ name: String(row[0]), value: Number(row[1]) })).sort((a, b) => b.value - a.value);
      return { chart, kind: 'ranked', view: { ...emptyView(), marks, rows: chart.result.rows ?? [], rowCount: marks.length } };
    }
    if (chart.result && chart.request) {
      const view = analysisView(chart.result, chart.request.measure.aggregation);
      if (chart.kind === 'rowsOverTime') {
        // A day bucket renders as a full date and a line has room for six characters a label:
        // "09-01" says the day; the year is in the tile's foot. A month keeps "2026-09".
        const grain = chart.request.grains?.[0];
        return { chart, kind: 'line', view: { ...view, marks: view.marks.map(m => ({ ...m, name: shortDate(m.name, grain) })) } };
      }
      return { chart, kind: 'ranked', view };
    }
    return { chart, kind: 'table', view: null };
  }));

  constructor() {
    effect(() => { const c = this.connection(), p = this.path(); if (c && p) untracked(() => this.load()); });
  }

  load(fresh = false): void {
    this.inFlight?.unsubscribe();
    this.loading.set(true); this.error.set(''); this.overview.set(null);
    this.inFlight = this.analytics.overview(this.connection(), this.path(), fresh).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The overview could not be read.'); return; }
        this.overview.set(r.data); this.profiled.emit(r.data.profile);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The overview could not be read.'); },
    });
  }

  stateOf(tile: OverviewTile): WidgetState {
    if (tile.chart.error) return 'failed';
    if (tile.chart.kind === 'spread') return tile.chart.distribution?.bins?.length ? 'ready' : 'empty';
    return tile.view && tile.view.rowCount ? 'ready' : 'empty';
  }
  footOf(tile: OverviewTile): string {
    if (tile.chart.kind === 'spread') return `${tile.chart.distribution?.bins?.length ?? 0} ${tile.chart.distribution?.exactValues ? 'values' : 'bins'}`;
    if (tile.chart.kind === 'completeness') return `${tile.view?.rowCount ?? 0} column${tile.view?.rowCount === 1 ? '' : 's'} with gaps`;
    const grain = tile.chart.request?.grains?.[0];
    const rows = tile.chart.result?.rows ?? [];
    const span = tile.chart.kind === 'rowsOverTime' && rows.length
      ? ` · ${spanDate(String(rows[0][0]), grain)} to ${spanDate(String(rows[rows.length - 1][0]), grain)}` : '';
    return `${tile.view?.rowCount ?? 0} row${tile.view?.rowCount === 1 ? '' : 's'}${grain ? ' · by ' + grain.toLowerCase() : ''}${span}${tile.view?.truncated ? ' · partial' : ''}`;
  }
  valueBars(d: NonNullable<OverviewChart['distribution']>): { name: string; value: number }[] {
    return d.bins.map(b => ({ name: b.value ?? '(null)', value: b.rows }));
  }
  /** The engine's own bins as bars in order, each named by its range: "48.19 – 129.9". */
  binBars(d: NonNullable<OverviewChart['distribution']>): Bar[] {
    return d.bins.map(b => ({ name: `${readableCell(b.from ?? '')} – ${readableCell(b.to ?? '')}`, value: b.rows }));
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A bucket's date as a line has room for. A day (or a week, by its first day) reads "1 Sep", the
 * console's short day, with the year in the tile's foot; a month "Sep 2026"; a quarter "Q3 2026";
 * a year itself. The day used to be "09-01" and the month "Sep 26" -- which, beside days written
 * "24 Sep", reads as the 26th of September.
 */
export function shortDate(name: string, grain: string | null | undefined): string {
  const y = name.slice(0, 4), m = Number(name.slice(5, 7));
  if (grain === 'MONTH') return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : name.slice(0, 7);
  if (grain === 'QUARTER') return m >= 1 && m <= 12 ? `Q${Math.ceil(m / 3)} ${y}` : name.slice(0, 7);
  if (grain === 'YEAR') return y;
  const day = dayLabel(name);
  return day === name ? name : day.replace(/ \d{4}$/, '');
}

/** The ends of a tile's time span in its foot: a whole day ("1 Sep 2026"), or the bucket's own name. */
function spanDate(name: string, grain: string | null | undefined): string {
  return grain === 'MONTH' || grain === 'QUARTER' || grain === 'YEAR' ? shortDate(name, grain) : dayLabel(name);
}

function emptyView(): WidgetView {
  return analysisView({ columns: [], rows: [], rowCount: 0, truncated: false }, null);
}
