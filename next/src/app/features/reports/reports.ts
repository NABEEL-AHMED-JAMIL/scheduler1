import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { statusColor } from '../../shared/charts/status-color';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { TableShell } from '../../shared/ui/data-table';
import { CHART_LABELS, ChartKind, ReportChart } from './report-chart';
import { ReportDestinationDialog } from './report-destination-dialog';
import {
  DIMENSIONS, Dimension, MEASURE_GROUPS, MEASURE_LABELS, Measure, RunData, RunRow,
  COUNTING, JOB_NAME, RUN_ID, SECONDS, buildPivot, formatMeasure, humanSeconds,
} from './pivot';

const EMPTY: RunData = { task: [], status: [], owner: [], day: [], rows: [] };

/**
 * A report the reader shapes rather than one that was decided for them.
 *
 * The rows come down once and the grouping happens here: changing a dimension is instant
 * rather than a round trip, and the pivot over a few thousand rows costs nothing. The export
 * sends the finished grid back up, so the file matches what is on screen rather than being
 * re-derived from a query that might drift.
 */
@Component({
  selector: 'app-reports',
  imports: [Icon, StatusPill, TableShell, ReportChart],
  templateUrl: './reports.html',
})
export class Reports implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly data = signal<RunData>(EMPTY);
  readonly truncated = signal(false);
  readonly exporting = signal<string | null>(null);

  readonly startDate = signal(isoDaysAgo(30));
  readonly endDate = signal(isoDaysAgo(0));

  readonly dimensions = DIMENSIONS;
  readonly measureGroups = MEASURE_GROUPS;
  readonly measureLabels = MEASURE_LABELS;
  readonly humanSeconds = humanSeconds;

  readonly rowDim = signal<Dimension>(DIMENSIONS[0]);
  readonly colDim = signal<Dimension>(DIMENSIONS[1]);
  readonly measure = signal<Measure>('count');

  /** Runs behind the cell the reader clicked, shown in a drawer. */
  readonly drillTitle = signal('');
  readonly drillRows = signal<RunRow[]>([]);

  readonly chart = signal<ChartKind>('grouped');
  readonly chartKinds: ChartKind[] =
    ['grouped','stacked','pct','donut','pie','line','area','ranked','heat','radar'];
  readonly chartLabels = CHART_LABELS;

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
    const known = [...pool.task, ...pool.owner, ...pool.day];
    return statusColor(label, Math.max(0, known.indexOf(label)));
  };

  /** Which labels the legend describes depends on how the chart reads the grid. */
  readonly legend = computed(() => {
    const pivot = this.pivot();
    if (this.chart() === 'ranked' || this.chart() === 'heat') return [];
    if (this.chart() === 'radar') return pivot.rowLabels.slice(0, 4);
    return pivot.colLabels;
  });

  readonly pivot = computed(() =>
    buildPivot(this.data(), this.rowDim(), this.colDim(), this.measure()));

  readonly title = computed(() =>
    `${MEASURE_LABELS[this.measure()]} by ${this.rowDim().label.toLowerCase()}` +
    ` and ${this.colDim().label.toLowerCase()}`);

  readonly isCounting = computed(() => COUNTING.has(this.measure()));
  readonly hasRows = computed(() => this.data().rows.length > 0);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<RunData>>(`${API_BASE}/report.json/runs`, {
      params: { startDate: this.startDate(), endDate: this.endDate() },
    }).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        const payload = response.data ?? EMPTY;
        this.data.set(payload);
        this.truncated.set(!!payload.truncated);
        if (payload.truncated) this.toast.info(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not read the runs for that range.');
      },
    });
  }

  // ---- shape ------------------------------------------------------------------------------

  setRowDim(key: string): void {
    const next = DIMENSIONS.find(d => d.key === key)!;
    // Two of the same dimension would produce a diagonal and nothing else.
    if (next.key === this.colDim().key) this.colDim.set(this.rowDim());
    this.rowDim.set(next);
  }
  setColDim(key: string): void {
    const next = DIMENSIONS.find(d => d.key === key)!;
    if (next.key === this.rowDim().key) this.rowDim.set(this.colDim());
    this.colDim.set(next);
  }
  swap(): void {
    const row = this.rowDim();
    this.rowDim.set(this.colDim());
    this.colDim.set(row);
  }
  setMeasure(value: string): void { this.measure.set(value as Measure); }

  format(value: number): string { return formatMeasure(value, this.measure()); }

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
    const seconds = inCol.map(r => r[SECONDS]).filter(v => v >= 0);
    const bins = new Array(12).fill(0);
    if (!seconds.length) return bins.map(() => ({ height: 0, hint: 'no runs' }));
    const max = Math.max(...seconds, 1);
    seconds.forEach(s => { bins[Math.min(11, Math.floor((s / max) * 12))]++; });
    const peak = Math.max(...bins, 1);
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
    return this.data()[dimension.key][row[dimensionIndex]] ?? '—';
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
  private grid(): { title: string; columns: string[]; rows: (string | number)[][] } {
    const pivot = this.pivot();
    return {
      title: this.title(),
      columns: [this.rowDim().label, ...pivot.colLabels, 'All'],
      rows: [
        ...pivot.rowLabels.map((label, ri) => [
          label,
          ...pivot.matrix[ri].map(v => this.exportValue(v)),
          this.exportValue(pivot.rowTotals[ri]),
        ]),
        ['All', ...pivot.colTotals.map(v => this.exportValue(v)), this.exportValue(pivot.grand)],
      ],
    };
  }

  /** Counts export as numbers so a sheet can total them; durations export as seconds. */
  private exportValue(value: number): number { return value; }

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

function isoDaysAgo(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days);
  return at.toISOString().slice(0, 10);
}
