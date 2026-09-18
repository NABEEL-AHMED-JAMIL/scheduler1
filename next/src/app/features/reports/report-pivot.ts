import { Component, computed, inject, input, signal, effect} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { statusColor } from '../../shared/charts/status-color';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { TableShell } from '../../shared/ui/data-table';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';
import { CHART_LABELS, ChartKind, RADAR_ROWS, ReportChart } from './report-chart';
import { ReportDestinationDialog } from './report-destination-dialog';
import {
  DIMENSIONS, Dimension, dimensionFor, MEASURE_GROUPS, MEASURE_LABELS, Measure, RunData, RunRow,
  COUNTING, EXECUTION, EXEC_SECONDS, JOB_NAME, NO_DURATION, RUN_ID, SECONDS, Pivot, aggregate,
  buildPivot, formatMeasure, humanSeconds, ADDITIVE} from './pivot';

const EMPTY: RunData = { task: [], status: [], owner: [], day: [], job: [], tenant: [], rows: [] };

/**
 * A report the reader shapes rather than one that was decided for them.
 *
 * The rows come down once and the grouping happens here: changing a dimension is instant
 * rather than a round trip, and the pivot over a few thousand rows costs nothing. The export
 * sends the finished grid back up, so the file matches what is on screen rather than being
 * re-derived from a query that might drift.
 *
 * This was the whole of /reports until the page became a dashboard. It is unchanged in what it
 * does -- same dimensions, same measures, same ten chart kinds, same four export paths, same
 * drill-down -- and moved wholesale rather than rewritten, because it is the only surface in
 * the app that can answer a question nobody anticipated.
 *
 * What did change is where the rows come from: the parent already fetches them for the
 * dashboard above, so this takes them as an input instead of issuing a second identical GET.
 */
@Component({
  selector: 'app-report-pivot',
  imports: [Icon, StatusPill, TableShell, ReportChart, Pagination],
  templateUrl: './report-pivot.html',
  // The spacing used to come from the .page wrapper this markup sat inside. Without it the
  // shape card, the chart and the grid render flush against each other, and an Angular host is
  // display:inline by default so the section gap above it collapses too.
  host: { class: 'block space-y-5' },
})
export class ReportPivot {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  /** Supplied by the dashboard host, which fetches once for the whole page. */
  readonly data = input<RunData>(EMPTY);
  readonly startDate = input('');
  readonly endDate = input('');

  readonly exporting = signal<string | null>(null);

  readonly dimensions = DIMENSIONS;
  readonly measureGroups = MEASURE_GROUPS;
  readonly measureLabels = MEASURE_LABELS;

  /** Which clock the selected measure is on, when that is not obvious from its name. */
  readonly durationNote = computed(() => {
    const measure = this.measure();
    if (COUNTING.has(measure)) return '';
    return EXECUTION.has(measure)
      ? 'Execution time only — the wait before the worker picked each run up is excluded.'
      : 'Timed from when each run was queued, so the dispatcher\'s wait is inside every figure.'
        + ' The Execution measures have it taken out.';
  });
  readonly humanSeconds = humanSeconds;

  // By KEY, not by position. These were DIMENSIONS[0] and [1], so inserting Job at index 1
  // silently moved the default column from Outcome to Job -- and since each task belongs to one
  // job, the opening view became a 19x19 matrix that is empty everywhere off the diagonal, with
  // 1px-wide grouped bars. Task x Outcome is the pairing that actually says something.
  readonly rowDim = signal<Dimension>(dimensionFor('task'));
  readonly colDim = signal<Dimension>(dimensionFor('status'));
  readonly measure = signal<Measure>('count');

  /** Runs behind the cell the reader clicked, shown in a drawer. */
  readonly drillTitle = signal('');
  readonly drillRows = signal<RunRow[]>([]);

  readonly chart = signal<ChartKind>('grouped');
  readonly chartKinds: ChartKind[] =
    ['grouped','stacked','pct','donut','pie','line','area','ranked','heat','radar'];
  readonly chartLabels = CHART_LABELS;

  /**
   * Chart kinds that add cells together, and so may only be offered for an additive measure.
   *
   * Every one of these turns a set of cells into a whole: a donut divides by the total, a
   * stacked bar piles the cells on top of each other, a radar sums the spokes. Feed them a mean
   * or a percentile and the "whole" is a number that does not exist -- the mean-duration donut
   * read 56%/44% on data whose real split was 92%/8%. Rather than draw that and caption the
   * problem away, the control is disabled and says why.
   */
  private static readonly SUMMING: ReadonlySet<ChartKind> =
    new Set<ChartKind>(['stacked', 'pct', 'donut', 'pie', 'radar']);

  readonly measureIsAdditive = computed(() => ADDITIVE.has(this.measure()));

  /** Which axis holds Day, so the chart does not have to guess from the label text. */
  readonly dayAxis = computed<'row' | 'col' | 'none'>(() =>
    this.colDim().key === 'day' ? 'col' : this.rowDim().key === 'day' ? 'row' : 'none');

  /** Whether a kind can be drawn honestly for the measure now selected. */
  readonly kindAllowed = (kind: ChartKind): boolean =>
    this.measureIsAdditive() || !ReportPivot.SUMMING.has(kind);

  readonly kindRefusal = (kind: ChartKind): string =>
    this.kindAllowed(kind) ? ''
      : `${CHART_LABELS[kind]} adds cells together, and ${MEASURE_LABELS[this.measure()].toLowerCase()} `
        + 'cannot be added. Pick Runs or Total time, or use a bar, line or ranked chart.';

  constructor() {
    /*
     * Falls back rather than drawing a lie. Changing the measure to a non-additive one while a
     * summing chart is open would otherwise leave that chart on screen with a disabled button
     * behind it, which is a worse outcome than moving the reader to the honest equivalent.
     */
    effect(() => {
      if (!this.kindAllowed(this.chart())) this.chart.set('grouped');
    });
  }

  /**
   * Colour by meaning where a label has one, by position otherwise.
   *
   * Delegated to statusColor rather than restated here. Writing the mapping out a second time
   * is how this screen ended up drawing Interrupt in amber while every other chart and pill in
   * the console drew it in soft red -- the same data, two answers, because there were two
   * lists to keep in step. statusColor already falls back to the categorical palette for a
   * label with no status meaning, which is exactly what a task or an owner needs.
   */
  readonly colourFor = (label: string): string => {
    const pool = this.data();
    // pool.job included: the Job dimension was added to DIMENSIONS without being added here, so
    // indexOf returned -1 for every job name, Math.max(0, -1) collapsed them all to index 0,
    // and a chart grouped by job drew every series in the same colour with a legend that
    // implied otherwise.
    const known = [...pool.task, ...(pool.job ?? []), ...pool.owner, ...pool.day];
    return statusColor(label, Math.max(0, known.indexOf(label)));
  };

  /** How many rows the radar draws, for the note beside it. Owned by the chart; see RADAR_ROWS. */
  readonly radarRows = RADAR_ROWS;

  /** Which labels the legend describes depends on how the chart reads the grid. */
  readonly legend = computed(() => {
    const pivot = this.pivot();
    if (this.chart() === 'ranked' || this.chart() === 'heat') return [];
    // RADAR_ROWS rather than a second bare 4. The chart decides how many shapes it can separate,
    // and a legend counting to its own number would name a series that is not drawn the moment
    // either number moved.
    if (this.chart() === 'radar') return pivot.rowLabels.slice(0, RADAR_ROWS);
    return pivot.colLabels;
  });

  /** Every row, in the order the dictionary supplies. The grid and the chart are views of it. */
  readonly fullPivot = computed(() =>
    buildPivot(this.data(), this.rowDim(), this.colDim(), this.measure()));

  /**
   * The grid grew up on a handful of tasks. At a hundred and seventy rows it was a wall: nothing
   * to find a row by, nothing to say which rows mattered, and a page-long scroll to the totals.
   * So the rows are searched, ordered and paged here -- and the chart draws the top of that
   * order rather than a hairline per row.
   */
  readonly rowSearch = signal('');
  /** Highest total first, or the order the dimension came in (chronological for Day, A-Z else). */
  readonly rowOrder = signal<'total' | 'natural'>('total');
  readonly rowPager = createPager<number>(25);

  /** The rows the reader asked for, in the order they asked for. Totals follow the rows shown. */
  readonly pivot = computed<Pivot>(() => {
    const full = this.fullPivot();
    const q = this.rowSearch().trim().toLowerCase();
    let order = full.rowLabels.map((_, i) => i);
    if (q) order = order.filter(i => full.rowLabels[i].toLowerCase().includes(q));
    if (this.rowOrder() === 'total') {
      // Stable on ties, so equal rows keep the dictionary's order instead of shuffling.
      order = [...order].sort((a, b) => (full.rowTotals[b] - full.rowTotals[a]) || (a - b));
    }
    if (!q && order.every((v, i) => v === i)) return full;
    const cellRows = order.map(i => full.cellRows[i]);
    const measure = this.measure();
    // A search narrows the totals too: an "All" row that counted rows the reader had filtered
    // out would disagree with every number above it.
    const colTotals = q
      ? full.colLabels.map((_, ci) => aggregate(cellRows.flatMap(cells => cells[ci]), measure))
      : full.colTotals;
    return {
      rowLabels: order.map(i => full.rowLabels[i]),
      colLabels: full.colLabels,
      matrix: order.map(i => full.matrix[i]),
      rowTotals: order.map(i => full.rowTotals[i]),
      colTotals,
      grand: q ? aggregate(cellRows.flat(2), measure) : full.grand,
      cellRows,
    };
  });

  /** Which rows of the ordered pivot are on the page now, as indexes into it. */
  readonly pageRows = computed(() =>
    this.rowPager.slice(this.pivot().rowLabels.map((_, i) => i)));

  /** How many rows a category chart draws before the bars stop being bars. */
  static readonly CHART_ROWS = 12;

  /**
   * What the chart is given. Ranked and radar cap themselves and say so; the rest drew one
   * series per row, which at 173 tasks was a comb of 1px lines with nine labels between them.
   * Those now draw the top rows by total, and the note under the chart says how many more the
   * grid holds. A Day axis is left whole: it is a time line, and cutting it to the busiest
   * twelve days would put March next to August.
   */
  readonly chartPivot = computed<Pivot>(() => {
    const p = this.pivot();
    const kind = this.chart();
    if (kind === 'ranked' || kind === 'radar' || this.dayAxis() === 'row'
        || p.rowLabels.length <= ReportPivot.CHART_ROWS) return p;
    const top = p.rowLabels.map((_, i) => i)
      .sort((a, b) => (p.rowTotals[b] - p.rowTotals[a]) || (a - b))
      .slice(0, ReportPivot.CHART_ROWS)
      .sort((a, b) => a - b);
    return {
      ...p,
      rowLabels: top.map(i => p.rowLabels[i]),
      matrix: top.map(i => p.matrix[i]),
      rowTotals: top.map(i => p.rowTotals[i]),
      cellRows: top.map(i => p.cellRows[i]),
    };
  });
  readonly chartHidden = computed(() =>
    this.pivot().rowLabels.length - this.chartPivot().rowLabels.length);

  setRowSearch(text: string): void { this.rowSearch.set(text); this.rowPager.reset(); }
  setRowOrder(order: 'total' | 'natural'): void { this.rowOrder.set(order); this.rowPager.reset(); }

  readonly title = computed(() =>
    `${MEASURE_LABELS[this.measure()]} by ${this.rowDim().label.toLowerCase()}` +
    ` and ${this.colDim().label.toLowerCase()}`);

  readonly isCounting = computed(() => COUNTING.has(this.measure()));

  // ---- shape ------------------------------------------------------------------------------

  setRowDim(key: string): void {
    const next = DIMENSIONS.find(d => d.key === key)!;
    // Two of the same dimension would produce a diagonal and nothing else.
    if (next.key === this.colDim().key) this.colDim.set(this.rowDim());
    this.rowDim.set(next);
    this.rowsReshaped();
  }
  setColDim(key: string): void {
    const next = DIMENSIONS.find(d => d.key === key)!;
    if (next.key === this.rowDim().key) this.rowDim.set(this.colDim());
    this.colDim.set(next);
    this.rowsReshaped();
  }
  swap(): void {
    const row = this.rowDim();
    this.rowDim.set(this.colDim());
    this.colDim.set(row);
    this.rowsReshaped();
  }
  /** New rows, new order: days read in date order, everything else busiest first. */
  private rowsReshaped(): void {
    this.rowOrder.set(this.rowDim().key === 'day' ? 'natural' : 'total');
    this.rowPager.reset();
  }
  setMeasure(value: string): void { this.measure.set(value as Measure); }

  format(value: number): string { return formatMeasure(value, this.measure()); }

  /**
   * Whether the pivot knows this cell has no runs behind it at all.
   *
   * Split out of cellText because three things now need the same answer: the text, the drill
   * button's disabled state, and the export. Deliberately false when cellRows is missing
   * entirely rather than empty -- an un-built pivot should print its numbers, not dash out the
   * whole grid.
   */
  cellIsEmpty(ri: number, ci: number): boolean {
    const runs = this.pivot().cellRows?.[ri]?.[ci];
    return !!runs && runs.length === 0;
  }

  /**
   * A cell's text, with "no runs here" distinguished from "the runs here took no time".
   *
   * The grid has something the charts do not -- cellRows, the actual runs behind each cell --
   * so it can tell the two apart and print the dash the rest of the page uses for absent data.
   * Without this the Execution measures, which are genuinely sub-second, made every empty cell
   * read "0s" as though a run had happened instantly. It is no longer the only guard: aggregate()
   * now answers NO_DURATION for a sample it could not measure, which covers the case this one
   * cannot see -- a cell with plenty of runs, none of which was ever timed.
   */
  cellText(ri: number, ci: number): string {
    if (this.cellIsEmpty(ri, ci)) return '—';
    return this.format(this.pivot().matrix[ri][ci]);
  }

  /** Proportions inside one column, for the distribution strip in its header. */
  columnMix(colIndex: number): { label: string; count: number; pct: number }[] {
    const data = this.data();
    const inCol = data.rows.filter(r => r[this.colDim().idx] === colIndex);
    const total = inCol.length || 1;
    return data.status.map((label, si) => {
      const count = inCol.filter(r => r[1] === si).length;
      return { label, count, pct: (count / total) * 100 };
    }).filter(part => part.count > 0);
  }

  /** A duration histogram for a column, when the measure is a duration rather than a tally. */
  columnHistogram(colIndex: number): { height: number; hint: string }[] {
    const inCol = this.data().rows.filter(r => r[this.colDim().idx] === colIndex);
    // The column aggregate() reads, for the measure that is actually selected. SECONDS was
    // hard-coded here while the cells below branch on EXECUTION, so under "Mean execution" a
    // column's numbers read 0.23s and the sparkline drawn in that column's own header binned the
    // queued-to-finished durations, with tooltips saying "12 runs near 41s" -- a 180x
    // disagreement inside one table cell, on a view that carries a whole paragraph warning the
    // reader not to mix the two clocks. It was also a different POPULATION, not just a different
    // clock: a run whose pickup was never recorded has -1 in exec_seconds and a real duration in
    // seconds, so it was binned in the header and excluded from the numbers above it.
    const column = EXECUTION.has(this.measure()) ? EXEC_SECONDS : SECONDS;
    const seconds = inCol.map(r => r[column] ?? NO_DURATION).filter(v => v >= 0);
    const bins = new Array(12).fill(0);
    if (!seconds.length) {
      // Nothing to bin has two causes and they are not the same fact. A column can hold plenty
      // of runs and still have no measurement on the clock in use -- every run still in flight,
      // or every pickup unrecorded -- and calling that "no runs" contradicts the "N runs"
      // caption printed directly under this strip.
      return bins.map(() => ({
        height: 0,
        hint: inCol.length ? 'no run here has a recorded duration' : 'no runs',
      }));
    }
    const max = seconds.reduce((a, b) => (b > a ? b : a), 1);
    seconds.forEach(s => { bins[Math.min(11, Math.floor((s / max) * 12))]++; });
    const peak = bins.reduce((a, b) => (b > a ? b : a), 1);
    return bins.map((count, i) => ({
      height: Math.round((count / peak) * 100),
      hint: `${count} run${count === 1 ? '' : 's'} near ${humanSeconds(Math.round(((i + 0.5) / 12) * max))}`,
    }));
  }

  columnCompletion(colIndex: number): number {
    const inCol = this.data().rows.filter(r => r[this.colDim().idx] === colIndex);
    if (!inCol.length) return 0;
    const done = this.data().status.indexOf('Completed');
    return Math.round((inCol.filter(r => r[1] === done).length / inCol.length) * 100);
  }
  columnCount(colIndex: number): number {
    return this.data().rows.filter(r => r[this.colDim().idx] === colIndex).length;
  }

  /** The header strips take the same colours as everything else. */
  toneFor(label: string): string { return statusColor(label); }

  // ---- drilling ---------------------------------------------------------------------------

  drill(rowIndex: number, colIndex: number): void {
    const pivot = this.pivot();
    this.drillTitle.set(`${pivot.rowLabels[rowIndex]} · ${pivot.colLabels[colIndex]}`);
    this.drillRows.set(pivot.cellRows[rowIndex][colIndex]);
  }
  drillRow(rowIndex: number): void {
    const pivot = this.pivot();
    this.drillTitle.set(`${pivot.rowLabels[rowIndex]} · everything`);
    this.drillRows.set(pivot.cellRows[rowIndex].flat());
  }
  drillColumn(colIndex: number): void {
    const pivot = this.pivot();
    this.drillTitle.set(`All · ${pivot.colLabels[colIndex]}`);
    this.drillRows.set(this.data().rows.filter(r => r[this.colDim().idx] === colIndex));
  }
  closeDrill(): void { this.drillRows.set([]); this.drillTitle.set(''); }

  labelOf(row: RunRow, dimensionIndex: 0 | 1 | 2 | 3): string {
    const dimension = DIMENSIONS.find(d => d.idx === dimensionIndex)!;
    return (this.data()[dimension.key] ?? [])[row[dimensionIndex] ?? -1] ?? '—';
  }
  jobOf(row: RunRow): string { return row[JOB_NAME]; }
  runIdOf(row: RunRow): number { return row[RUN_ID]; }
  durationOf(row: RunRow): string {
    return row[SECONDS] >= 0 ? humanSeconds(row[SECONDS]) : '—';
  }

  // ---- export -----------------------------------------------------------------------------

  /**
   * The grid as the server needs it: header row, one array per row, totals included.
   * Built here so every destination exports precisely what is on screen.
   */
  private grid(): { title: string; columns: string[]; rows: (string | number | null)[][] } {
    const pivot = this.pivot();
    // The range belongs in the exported title. A spreadsheet outlives the screen it came from,
    // and "Runs by task and outcome" alone does not say which fortnight it describes.
    const range = this.startDate() && this.endDate()
      ? ` (${this.startDate()} to ${this.endDate()})` : '';
    return {
      title: this.title() + range,
      columns: [this.rowDim().label, ...pivot.colLabels, 'All'],
      rows: [
        ...pivot.rowLabels.map((label, ri) => [
          label,
          ...pivot.matrix[ri].map((value, ci) => this.exportValue(value, this.cellIsEmpty(ri, ci))),
          this.exportValue(pivot.rowTotals[ri]),
        ]),
        ['All', ...pivot.colTotals.map(v => this.exportValue(v)), this.exportValue(pivot.grand)],
      ],
    };
  }

  /**
   * Counts export as numbers so a sheet can total them; durations export as seconds; and a cell
   * the grid prints as a dash exports as an EMPTY cell, never as 0.
   *
   * This was `return value`, read straight off the matrix, under a comment promising that every
   * destination exports precisely what is on screen -- and the screen has not rendered the
   * matrix since cellText() learned to dash out a cell with no runs behind it. So a "Shortest
   * run" report wrote 0 into every gap, and a reader who ran MIN() down the Failed column of the
   * spreadsheet got 0s as the fastest failure: a duration no run ever had. All four export paths
   * (CSV, Excel, Save, Submit) are built from the one toCsv() on the server, so they carried
   * identical wrong bytes. escape() renders null as an empty field, which is what a gap is, so
   * nothing on the server has to change.
   *
   * Two things become a gap. A cell with no runs in it, which the caller passes in because only
   * it knows -- for a COUNTING measure that cell measures a truthful 0, and exporting the 0
   * while the screen shows a dash is still the file disagreeing with the screen. And a negative,
   * which is aggregate()'s no-data sentinel; that one covers the totals too, where there is no
   * cellRows to consult.
   */
  private exportValue(value: number, isEmpty = false): number | null {
    return isEmpty || value < 0 ? null : value;
  }

  export(format: 'csv' | 'xlsx'): void {
    this.send({ ...this.grid(), format, destination: 'download' }, format, response => {
      const data = response.data as { filename: string; contentType: string; content: string };
      const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.contentType }));
      const link = document.createElement('a');
      link.href = url; link.download = data.filename;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      this.toast.success(`${data.filename} downloaded.`);
    });
  }

  saveToBucket(format: 'csv' | 'xlsx'): void {
    this.dialog.open<{ bucket: string; folder: string }>(ReportDestinationDialog, {
      hasBackdrop: true,
      data: { kind: 'bucket' },
    }).closed.subscribe(result => {
      if (!result) return;
      this.send({ ...this.grid(), format, destination: 'bucket', bucket: result.bucket, folder: result.folder },
        'bucket', response => this.toast.success(response.message));
    });
  }

  submit(format: 'csv' | 'xlsx'): void {
    this.dialog.open<{ submitUrl: string }>(ReportDestinationDialog, {
      hasBackdrop: true,
      data: { kind: 'submit' },
    }).closed.subscribe(result => {
      if (!result) return;
      this.send({ ...this.grid(), format, destination: 'submit', submitUrl: result.submitUrl },
        'submit', response => this.toast.success(response.message));
    });
  }

  private send(body: unknown, tag: string, onOk: (response: ApiResponse<unknown>) => void): void {
    this.exporting.set(tag);
    this.http.post<ApiResponse<unknown>>(`${API_BASE}/report.json/export`, body).subscribe({
      next: response => {
        this.exporting.set(null);
        if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
        onOk(response);
      },
      error: err => {
        this.exporting.set(null);
        this.toast.error(err?.error?.message || 'That export did not complete.');
      },
    });
  }
}

