import { Component, computed, input, output } from '@angular/core';
import { BarChart, Bar, BarSegment } from '../../shared/charts/bar-chart';
import { Donut } from '../../shared/charts/donut';
import { readableCell } from '../../shared/charts/number-format';
import { KpiCard } from '../../shared/charts/kpi-card';
import { LineChart, Point } from '../../shared/charts/line-chart';
import { ScatterPlot, ScatterPoint } from '../../shared/charts/scatter-plot';
import { Comparison, ComparisonSide } from '../../shared/charts/comparison';
import { Histogram } from '../../shared/charts/histogram';
import { ResultSummary } from '../../shared/charts/result-summary';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { chartColor } from '../../shared/charts/status-color';
import { GroupedBar, GroupedSeries } from '../../shared/charts/grouped-bar';
import { WidgetTable } from './widget-table';
import { KINDS } from './widget-kinds';
import type { PivotGrid, WidgetVisualization } from './analytics.service';
import type { Mark, WidgetView } from './dashboard';

/** How many rows a tile's table shows; the rest are one click away. */
export const WIDGET_ROWS = 8;
export const WIDGET_HEIGHT = 180;
export const WIDGET_HEIGHT_MIN = 120;
export const WIDGET_HEIGHT_MAX = 600;

/**
 * One result drawn one way. Every kind reads the SAME view -- a kind is a way of looking at one
 * answer, not a different question -- and this is the one place that knows how each kind reads
 * it. The Dashboards' tiles and the Studio's overview both draw through here, so a ranked bar
 * on a board and a ranked bar on the overview cannot disagree about a figure.
 */
@Component({
  selector: 'app-widget-chart',
  imports: [BarChart, Donut, KpiCard, LineChart, ScatterPlot, Comparison, Histogram, ResultSummary, RankedBar, GroupedBar, WidgetTable],
  template: `
    @if (view(); as v) {
      <!-- In a row layout a compact kind (a figure, a ring, ranked bars, a summary) is capped and
           the figure is centred; a table, a line or a bar chart takes the whole row. Without this
           a donut's legend sat at the far right of a 950px tile and a single figure read like the
           first cell of an empty table. -->
      <div [class]="shell()">
      @switch (drawn()) {
        @case ('kpi') {
          <app-kpi-card [value]="kpiValue(v)" [label]="measureName(v)" [caption]="kpiCaption(v)"
                        [align]="layout() === 'row' ? 'center' : 'start'" [size]="layout() === 'row' ? 'lg' : 'md'" />
        }
        @case ('line') { <app-line-chart [data]="points(v)" [height]="height()" [format]="figure" /> }
        @case ('area') { <app-line-chart [data]="points(v)" [filled]="true" [height]="height()" [format]="figure" /> }
        @case ('cumulative') { <app-line-chart [data]="cumulativePoints(v)" [height]="height()" [format]="figure" /> }
        @case ('groupedBar') {
          @if (v.pivot; as grid) { <app-grouped-bar [groupNames]="pivotGroupNames(grid)" [series]="pivotSeries(grid)" /> }
        }
        @case ('pivot') {
          @if (v.pivot; as grid) {
            <!-- The grid the server composed. Scrolls inside its own container so a wide cross-tab never makes the page scroll sideways. -->
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-[color:var(--text-muted)]">
                    <th class="px-2 py-1 font-medium whitespace-nowrap">{{ grid.rowDimension }}</th>
                    @for (column of grid.columnValues; track column) { <th class="px-2 py-1 font-medium whitespace-nowrap text-right">{{ column }}</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (row of pivotRows(grid); track $index) {
                    <tr class="border-t border-subtle">
                      <td class="px-2 py-1 whitespace-nowrap">
                        @if (row.key === null) { <span class="text-[color:var(--text-muted)]" title="null">—</span> } @else { {{ row.key }} }
                      </td>
                      @for (cell of row.cells; track $index) {
                        <td class="px-2 py-1 whitespace-nowrap tabular text-right">
                          <!-- No rows in that combination is not a zero: a grid that printed 0 would assert a measurement nobody made. -->
                          @if (cell === null) { <span class="text-[color:var(--text-muted)]" title="no rows">—</span> } @else { <span [title]="cell">{{ readable(cell) }}</span> }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
        @case ('shareStacked') { <app-bar-chart [data]="shareStacks(v)" [height]="height()" [hideValues]="true" [format]="percentOfGroup" /> }
        @case ('stacked') { <app-bar-chart [data]="stacks(v)" [height]="height()" [format]="figure" /> }
        @case ('histogram') {
          <app-histogram [values]="figures(v)" [height]="height()" noun="group" nounPlural="groups" [dropBelow]="null" [format]="figure" />
        }
        @case ('scatter') { <app-scatter-plot [data]="scatterPoints(v)" [height]="height()" [xLabel]="dimensionName(v)" [yLabel]="measureName(v)" /> }
        @case ('dimensionSummary') {
          <app-result-summary [data]="v.marks" mode="dimension" [additive]="v.additive && !v.topNTrimmed" [dimensionLabel]="dimensionName(v)" />
        }
        @case ('trendSummary') { <app-result-summary [data]="v.marks" mode="trend" [dimensionLabel]="dimensionName(v)" /> }
        @case ('distributionSummary') { <app-result-summary [data]="v.marks" mode="distribution" [dimensionLabel]="dimensionName(v)" /> }
        @case ('comparison') { <app-comparison [first]="sides(v).first" [second]="sides(v).second" /> }
        @case ('ranked') {
          <app-ranked-bar [data]="v.marks" [max]="v.marks.length" [showPercent]="false" [formatValue]="figure" [clickable]="clickable()" (picked)="picked.emit($any($event))" />
        }
        @case ('rankedShare') {
          <app-ranked-bar [data]="v.marks" [max]="v.marks.length" [showPercent]="true" [formatValue]="figure" [clickable]="clickable()" (picked)="picked.emit($any($event))" />
        }
        @case ('bar') {
          <app-bar-chart [data]="v.marks" [height]="height()" [format]="figure" [clickable]="clickable()" (barClicked)="picked.emit($any($event))" />
        }
        @case ('donut') { <app-donut [data]="v.marks" [totalLabel]="''" [format]="figure" /> }
        @default { <app-widget-table [columns]="v.columns" [rows]="tileRows(v)" [measureColumn]="v.measureColumn" /> }
      }
      </div>
    }
  `,
})
export class WidgetChart {
  readonly view = input.required<WidgetView>();
  /** The kind asked for; a kind the view refuses, or one nobody knows, draws as a table. */
  readonly kind = input<string | null | undefined>('table');
  readonly height = input(WIDGET_HEIGHT);
  /** Whether a bar may be clicked to narrow: the host decides, the chart only offers. */
  readonly clickable = input(false);
  readonly picked = output<Mark>();
  /** 'tile' in a grid cell; 'row' when the widget has a whole row and compact kinds should not sprawl. */
  readonly layout = input<'tile' | 'row'>('tile');

  /** The kinds that read best at a bounded width, however wide the row is. */
  private static readonly COMPACT: ReadonlySet<string> = new Set(['kpi', 'donut', 'ranked', 'rankedShare', 'comparison', 'dimensionSummary', 'trendSummary', 'distributionSummary']);

  /** The wrapper's classes for the layout: a cap on compact kinds in a row, nothing otherwise. */
  readonly shell = computed(() => {
    if (this.layout() !== 'row') return 'min-w-0';
    const kind = this.drawn();
    if (kind === 'kpi') return 'min-w-0 mx-auto max-w-2xl';
    return WidgetChart.COMPACT.has(kind) ? 'min-w-0 max-w-3xl' : 'min-w-0';
  });

  readonly figure = (value: number): string => readableCell(String(value));
  readonly percentOfGroup = (value: number): string => `${Math.round(value * 10) / 10}%`;

  readonly drawn = computed<WidgetVisualization>(() => {
    const asked = (this.kind() ?? 'table') as WidgetVisualization;
    if (!KINDS.some(k => k.id === asked)) return 'table';
    return this.view().issues[asked] ? 'table' : asked;
  });

  /** The last column: an analysis with no dimensions returns just the measure; with dimensions, those come first. */
  kpiValue(view: WidgetView): string { const row = view.rows[0] ?? []; return row[row.length - 1] ?? '—'; }
  /** Names the group when there is one, so a one-row filtered result says what it is of. */
  kpiCaption(view: WidgetView): string {
    if (view.columns.length < 2) return '';
    return (view.rows[0] ?? []).slice(0, -1).filter(Boolean).join(' · ');
  }
  measureName(view: WidgetView): string { return (view.columns[view.columns.length - 1] ?? '').replace(/_/g, ' '); }
  dimensionName(view: WidgetView): string { return (view.columns[0] ?? '').replace(/_/g, ' '); }
  readable(cell: string): string { return readableCell(cell); }
  tileRows(view: WidgetView): (string | null)[][] { return view.rows.slice(0, WIDGET_ROWS); }
  pivotRows(grid: PivotGrid): NonNullable<PivotGrid['rows']> { return (grid.rows ?? []).slice(0, WIDGET_ROWS); }

  points(view: WidgetView): Point[] { return view.marks.map(mark => ({ label: mark.name, value: mark.value })); }
  /** The same series accumulated; the kind is refused over a rank-ordered result, so the order is the dimension's own. */
  cumulativePoints(view: WidgetView): Point[] {
    let running = 0;
    return view.marks.map(mark => { running += mark.value; return { label: mark.name, value: running }; });
  }
  figures(view: WidgetView): number[] { return view.marks.map(mark => mark.value); }
  stacks(view: WidgetView): Bar[] { return this.stackedBars(view, false); }
  /** Every bar full height, each segment its share of its own group: the mix, not the size. */
  shareStacks(view: WidgetView): Bar[] { return this.stackedBars(view, true); }
  /** One bar per outer dimension value, segmented by the inner one; colour keyed on the category, never its position. */
  private stackedBars(view: WidgetView, asShare: boolean): Bar[] {
    const byOuter = new Map<string, BarSegment[]>();
    const colourOf = new Map<string, string>();
    for (const mark of view.marks) {
      const cut = mark.name.indexOf(' · ');
      const outer = cut < 0 ? mark.name : mark.name.slice(0, cut);
      const inner = cut < 0 ? '' : mark.name.slice(cut + 3);
      const label = inner || outer;
      if (!colourOf.has(label)) colourOf.set(label, chartColor(colourOf.size));
      const segments = byOuter.get(outer) ?? [];
      segments.push({ label, value: mark.value, color: colourOf.get(label)! });
      byOuter.set(outer, segments);
    }
    return Array.from(byOuter, ([name, segments]) => {
      const total = segments.reduce((sum, segment) => sum + segment.value, 0);
      if (!asShare || total <= 0) return { name, value: total, segments: segments.length > 1 ? segments : undefined };
      const shares = segments.map(segment => ({ ...segment, value: (segment.value / total) * 100 }));
      return { name, value: 100, segments: shares.length > 1 ? shares : undefined };
    });
  }
  scatterPoints(view: WidgetView): ScatterPoint[] { return view.marks.map(mark => ({ label: mark.name, x: Number(mark.name), y: mark.value })); }
  sides(view: WidgetView): { first: ComparisonSide; second: ComparisonSide } {
    const [first, second] = view.marks;
    return { first: { label: first?.name ?? '', value: first?.value ?? 0 }, second: { label: second?.name ?? '', value: second?.value ?? 0 } };
  }
  pivotGroupNames(grid: PivotGrid): string[] { return (grid.rows ?? []).map(row => row.key ?? '(no value)'); }
  /** The grid is row-major and the chart is series-major: a transpose, with a null cell staying null. */
  pivotSeries(grid: PivotGrid): GroupedSeries[] {
    const rows = grid.rows ?? [];
    return grid.columnValues.map((column, columnIndex) => ({
      name: column,
      values: rows.map(row => { const cell = row.cells[columnIndex]; if (cell === null || cell === undefined || cell === '') return null; const value = Number(cell); return Number.isFinite(value) ? value : null; }),
    }));
  }
}
