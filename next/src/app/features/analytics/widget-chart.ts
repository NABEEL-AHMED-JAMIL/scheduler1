import { Component, computed, inject, input, output } from '@angular/core';
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
import { DataText } from '../../shared/ui/data-text';
import { KINDS, kindInfo } from './widget-kinds';
import type { EChartKind, PivotGrid, WidgetVisualization } from './analytics.service';
import { EChart } from '../../shared/charts/echart/echart';
import { ChartPalette } from '../../shared/charts/echart/chart-palette';
import { ChartThemes } from '../../shared/charts/echart/chart-themes';
import { CONSOLE_THEME } from '../../shared/charts/echart/echart-theme';
import { ChartSettings } from './charts/chart-settings';
import { optionFor } from './charts/chart-options';
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
  imports: [BarChart, Donut, KpiCard, LineChart, ScatterPlot, Comparison, Histogram, ResultSummary, RankedBar, GroupedBar, WidgetTable, DataText, EChart, ChartPalette],
  template: `
    @if (view(); as v) {
      <!-- In a row layout a compact kind (a figure, a ring, ranked bars, a summary) is capped and
           the figure is centred; a table, a line or a bar chart takes the whole row. Without this
           a donut's legend sat at the far right of a 950px tile and a single figure read like the
           first cell of an empty table. -->
      <!-- The SVG kinds read --chart-N; a named theme re-points those on this element alone. -->
      <div [class]="shell()" [appChartPalette]="theme().id" [paletteOrder]="settings().colors?.order">
      @if (echartKind(); as kind) {
        <app-echart [option]="echartOption()" [theme]="theme().ref" [renderer]="settings().renderer ?? 'canvas'"
                    [height]="height()" [label]="chartLabel()" [attr.data-kind]="kind" />
      } @else {
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
            <!-- The grid the server composed. Scrolls inside its own container so a wide cross-tab never makes the page scroll sideways.
                 Its headers down the side and across the top are values of the data, drawn as data text: a
                 20,000-character note as a row header made the grid that wide (owner, 2026-09-28). -->
            <div class="overflow-x-auto">
              <table class="table-modern">
                <thead>
                  <tr>
                    <th class="whitespace-nowrap">{{ grid.rowDimension }}</th>
                    @for (column of grid.columnValues; track column) {
                      <th class="text-right"><app-data-text class="min-w-16 max-w-48 ml-auto" [value]="column" [label]="grid.columnDimension" /></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of pivotRows(grid); track $index) {
                    <tr>
                      <th scope="row" class="text-left font-normal">
                        @if (row.key === null) { <span class="text-[color:var(--text-muted)]" title="null">—</span> } @else { <app-data-text class="min-w-24 max-w-64" [value]="row.key" [label]="grid.rowDimension" /> }
                      </th>
                      @for (cell of row.cells; track $index) {
                        <td class="whitespace-nowrap tabular text-right">
                          <!-- No rows in that combination is not a zero: a grid that printed 0 would assert a measurement nobody made. -->
                          @if (cell === null) { <span class="text-[color:var(--text-muted)]" title="no rows">—</span> } @else {
                            <!-- Usually a figure (the unrounded one is the tooltip), but a minimum or maximum of a text column is a value of the file, of any length. -->
                            <app-data-text class="min-w-16 max-w-48 ml-auto" [value]="readable(cell)" [hint]="cell" />
                          }
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
  /** How many rows a table or a cross-tab draws. A board shows five until "Show all" is pressed. */
  readonly maxRows = input(WIDGET_ROWS);
  /** 'tile' in a grid cell; 'row' when the widget has a whole row and compact kinds should not sprawl. */
  readonly layout = input<'tile' | 'row'>('tile');
  /** The widget's "Chart settings" (charts/chart-settings.ts). Empty draws every default. */
  readonly settings = input<ChartSettings>({});
  /** The board's theme; the widget's own `settings.colors.theme` wins over it. */
  readonly boardTheme = input<string | null | undefined>(null);
  /** Whether the ECharts toolbox (save as PNG, data view, restore zoom) is offered. */
  readonly interactive = input(false);
  /** What a saved image and the data view are called. */
  readonly name = input('');

  private readonly themes = inject(ChartThemes);

  /** The theme this chart draws in, resolved for the mode on screen. */
  readonly theme = computed(() =>
    this.themes.resolve(this.settings().colors?.theme ?? this.boardTheme() ?? CONSOLE_THEME, this.settings().colors?.order));

  /** The kind, when app-echart draws it. */
  readonly echartKind = computed<EChartKind | null>(() => {
    const kind = this.drawn();
    return kindInfo(kind)?.engine === 'echarts' ? kind as EChartKind : null;
  });

  readonly echartOption = computed(() => {
    const kind = this.echartKind();
    if (!kind) return null;
    const theme = this.theme();
    return optionFor(this.view(), kind, this.settings(), { palette: theme.palette, tokens: theme.tokens },
      { interactive: this.interactive(), name: this.name() });
  });

  readonly chartLabel = computed(() => `${kindInfo(this.drawn())?.label ?? 'Chart'}: ${this.measureName(this.view())} by ${this.dimensionName(this.view())}`);

  /** The kinds that read best at a bounded width, however wide the row is. */
  private static readonly COMPACT: ReadonlySet<string> = new Set(['kpi', 'donut', 'comparison', 'dimensionSummary', 'trendSummary', 'distributionSummary', 'gauge', 'halfDonut', 'rose', 'funnel', 'radar']);

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
  tileRows(view: WidgetView): (string | null)[][] { return view.rows.slice(0, this.maxRows()); }
  pivotRows(grid: PivotGrid): NonNullable<PivotGrid['rows']> { return (grid.rows ?? []).slice(0, this.maxRows()); }

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
