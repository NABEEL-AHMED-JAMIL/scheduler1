/**
 * The pivot itself: dimensions, measures and the grid they produce.
 *
 * Kept out of the component so the arithmetic can be tested without rendering anything, which
 * matters more here than usual -- a report that quietly computes the wrong average is worse
 * than one that fails to draw.
 */

/** Columnar rows as the server sends them: dimension values are indexes into dictionaries. */
export interface RunData {
  task: string[];
  status: string[];
  owner: string[];
  day: string[];
  /** [taskIdx, statusIdx, ownerIdx, dayIdx, seconds, jobName, runId] */
  rows: RunRow[];
  truncated?: boolean;
}

export type RunRow = [number, number, number, number, number, string, number];

export const SECONDS = 4;
export const JOB_NAME = 5;
export const RUN_ID = 6;

export interface Dimension { key: keyof Pick<RunData,'task'|'status'|'owner'|'day'>; label: string; idx: number; }

export const DIMENSIONS: Dimension[] = [
  { key: 'task',   label: 'Task',    idx: 0 },
  { key: 'status', label: 'Outcome', idx: 1 },
  { key: 'owner',  label: 'Owner',   idx: 2 },
  { key: 'day',    label: 'Day',     idx: 3 },
];

export type Measure =
  | 'count' | 'distinct' | 'sum' | 'avg' | 'median' | 'mode'
  | 'min' | 'max' | 'range' | 'p90' | 'p95' | 'stddev';

export const MEASURE_LABELS: Record<Measure, string> = {
  count: 'Runs', distinct: 'Days active', sum: 'Total time', avg: 'Mean duration',
  median: 'Median duration', mode: 'Most common duration', min: 'Shortest run',
  max: 'Longest run', range: 'Spread', p90: '90th percentile', p95: '95th percentile',
  stddev: 'Standard deviation',
};

/** These are tallies; every other measure is a duration in seconds. */
export const COUNTING: ReadonlySet<Measure> = new Set<Measure>(['count', 'distinct']);

export const MEASURE_GROUPS: { label: string; measures: Measure[] }[] = [
  { label: 'How many', measures: ['count', 'distinct'] },
  { label: 'Middle',   measures: ['avg', 'median', 'mode'] },
  { label: 'Edges',    measures: ['min', 'max', 'range', 'p90', 'p95'] },
  { label: 'Spread',   measures: ['sum', 'stddev'] },
];

/** Linear interpolation between the two nearest ranks, which is what a reader expects. */
export function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/**
 * One measure over one set of runs.
 *
 * A run with no recorded duration contributes nothing to the duration measures rather than
 * counting as zero: a skipped run did not take no time, it did not run. Counting it would drag
 * every average toward zero and make the minimum meaningless.
 */
export function aggregate(rows: RunRow[], measure: Measure): number {
  if (measure === 'count') return rows.length;
  if (measure === 'distinct') return new Set(rows.map(r => r[3])).size;

  const seconds = rows.map(r => r[SECONDS]).filter(v => v >= 0);
  if (!seconds.length) return 0;
  const sorted = [...seconds].sort((a, b) => a - b);
  const total = seconds.reduce((a, b) => a + b, 0);
  const mean = total / seconds.length;

  switch (measure) {
    case 'sum':    return total;
    case 'avg':    return Math.round(mean);
    case 'median': return percentile(sorted, 0.5);
    case 'p90':    return percentile(sorted, 0.90);
    case 'p95':    return percentile(sorted, 0.95);
    case 'min':    return sorted[0];
    case 'max':    return sorted[sorted.length - 1];
    case 'range':  return sorted[sorted.length - 1] - sorted[0];
    case 'stddev': {
      const variance = seconds.reduce((a, v) => a + (v - mean) ** 2, 0) / seconds.length;
      return Math.round(Math.sqrt(variance));
    }
    case 'mode': {
      const seen = new Map<number, number>();
      let best = sorted[0], bestCount = 0;
      for (const v of sorted) {
        const n = (seen.get(v) ?? 0) + 1;
        seen.set(v, n);
        if (n > bestCount) { bestCount = n; best = v; }
      }
      return best;
    }
    default: return total;
  }
}

export interface Pivot {
  rowLabels: string[];
  colLabels: string[];
  /** matrix[row][col] */
  matrix: number[][];
  rowTotals: number[];
  colTotals: number[];
  grand: number;
  /** The runs behind each cell, for drilling in. */
  cellRows: RunRow[][][];
}

/**
 * Builds the grid.
 *
 * Row values with no runs at all are dropped: a dimension carries every value the dictionary
 * knows, and rendering empty rows for tasks that did not run in the range is noise. Columns
 * are kept whole so the shape stays comparable as the range changes.
 */
export function buildPivot(data: RunData, rowDim: Dimension, colDim: Dimension,
                           measure: Measure): Pivot {
  const colLabels = data[colDim.key];
  const rowLabels: string[] = [];
  const matrix: number[][] = [];
  const cellRows: RunRow[][][] = [];
  const rowTotals: number[] = [];

  data[rowDim.key].forEach((label, ri) => {
    const inRow = data.rows.filter(r => r[rowDim.idx] === ri);
    if (!inRow.length) return;
    const cells = colLabels.map((_, ci) => inRow.filter(r => r[colDim.idx] === ci));
    rowLabels.push(label);
    cellRows.push(cells);
    matrix.push(cells.map(c => aggregate(c, measure)));
    rowTotals.push(aggregate(inRow, measure));
  });

  const colTotals = colLabels.map((_, ci) =>
    aggregate(data.rows.filter(r => r[colDim.idx] === ci), measure));

  return { rowLabels, colLabels, matrix, rowTotals, colTotals,
           grand: aggregate(data.rows, measure), cellRows };
}

/** Seconds as a person reads them. */
export function humanSeconds(value: number): string {
  if (!value) return '—';
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.round((value % 3600) / 60)}m`;
}

export function formatMeasure(value: number, measure: Measure): string {
  return COUNTING.has(measure) ? value.toLocaleString() : humanSeconds(value);
}
