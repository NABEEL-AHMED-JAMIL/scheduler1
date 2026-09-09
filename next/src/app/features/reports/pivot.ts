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
  /**
   * Job names, built in the browser by withJobDimension() rather than sent by the server.
   * Optional, so a raw server payload -- and the existing tests, which build RunData literals
   * by hand -- remain valid without declaring a dimension the server never sends.
   */
  job?: string[];
  /**
   * Workspace names, sent by the server at row index 7.
   *
   * Optional because a client may be talking to a server that predates it, and because the
   * existing tests build RunData literals by hand.
   */
  tenant?: string[];
  /**
   * [taskIdx, statusIdx, ownerIdx, dayIdx, seconds, jobName, runId, tenantIdx?, execSeconds?,
   *  jobIdx?]
   *
   * `seconds` is queued-to-finished; `execSeconds` is the part the worker actually spent, from
   * the moment it picked the run up. Both carry -1 when unknown.
   */
  rows: RunRow[];
  truncated?: boolean;
}

/**
 * The 8th element is optional on purpose: the server sends seven, and the job index is added
 * here by withJobDimension(). Keeping it optional means a raw payload -- and the existing
 * tests, which construct seven-element rows -- still typecheck unchanged.
 */
export type RunRow =
  [number, number, number, number, number, string, number, number?, number?, number?];

export const SECONDS = 4;
export const JOB_NAME = 5;
export const RUN_ID = 6;
/** Sent by the server. */
export const TENANT_IDX = 7;
/**
 * Seconds the worker actually spent on the run, as against SECONDS, which is queued-to-finished.
 * The two differ enormously here: the dispatcher polls once a minute, so a task that runs in
 * 0.2s reports 34s end to end. -1 when the pickup instant was not recorded.
 */
export const EXEC_SECONDS = 8;
/** Added in the browser by withJobDimension, after everything the server sends. */
export const JOB_IDX = 9;

export interface Dimension {
  key: keyof Pick<RunData, 'task' | 'status' | 'owner' | 'day' | 'job' | 'tenant'>;
  label: string;
  idx: number;
}

/** Looks a dimension up by key, so a caller never has to know its position in the list. */
export function dimensionFor(key: Dimension['key']): Dimension {
  const found = DIMENSIONS.find(d => d.key === key);
  if (!found) throw new Error(`Unknown dimension ${key}`);
  return found;
}

export const DIMENSIONS: Dimension[] = [
  { key: 'task',   label: 'Task',      idx: 0 },
  { key: 'job',    label: 'Job',       idx: JOB_IDX },
  { key: 'status', label: 'Outcome',   idx: 1 },
  { key: 'owner',  label: 'Owner',     idx: 2 },
  { key: 'tenant', label: 'Workspace', idx: TENANT_IDX },
  { key: 'day',    label: 'Day',       idx: 3 },
];

/**
 * Adds the job dictionary the server does not send.
 *
 * Every row already carries its job NAME at index 5 -- it is only missing because the payload
 * dictionary-encodes the four dimensions it was built for and leaves the job as raw text. So
 * the grouping the reader most often wants after "which task", namely "which JOB", was the one
 * thing the builder could not do, over data that was already on the page.
 *
 * Interned the same way the server interns the others, and appended at index 7 so every
 * existing index constant keeps pointing where it did.
 */
export function withJobDimension(data: RunData): RunData {
  if (data.job?.length) return data;
  const job: string[] = [];
  const index = new Map<string, number>();
  const rows: RunRow[] = data.rows.map(row => {
    const name = row[JOB_NAME] || '(no job)';
    let at = index.get(name);
    if (at === undefined) { at = job.length; job.push(name); index.set(name, at); }
    return [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7] ?? 0,
            row[EXEC_SECONDS] ?? -1, at] as RunRow;
  });
  return { ...data, job, rows };
}

export type Measure =
  | 'count' | 'distinct' | 'sum' | 'avg' | 'median' | 'mode'
  | 'min' | 'max' | 'range' | 'p90' | 'p95' | 'p99' | 'stddev'
  | 'execAvg' | 'execMedian' | 'execMax';

export const MEASURE_LABELS: Record<Measure, string> = {
  count: 'Runs', distinct: 'Days active', sum: 'Total time', avg: 'Mean duration',
  median: 'Median duration', mode: 'Most common duration', min: 'Shortest run',
  max: 'Longest run', range: 'Spread', p90: '90th percentile', p95: '95th percentile',
  p99: '99th percentile',
  stddev: 'Standard deviation',
  execAvg: 'Mean execution', execMedian: 'Median execution', execMax: 'Longest execution',
};

/** These are tallies; every other measure is a duration in seconds. */
export const COUNTING: ReadonlySet<Measure> = new Set<Measure>(['count', 'distinct']);

/**
 * Measures whose cells may be added together, and therefore the only ones a chart is allowed
 * to total, stack, or turn into a share of a whole.
 *
 * Everything else is a statistic OF a set, and summing statistics is not a statistic of the
 * union: the mean of two groups is not the sum of their means, and a median even less so. A
 * donut of "mean duration" across two outcomes drew 56%/44% for data whose real split was
 * 92%/8%, because it summed 34s and 27s and called 61s the whole. 'distinct' is excluded for
 * the same reason -- two cells that were each active on the same three days are not six days.
 */
export const ADDITIVE: ReadonlySet<Measure> = new Set<Measure>(['count', 'sum']);

export const MEASURE_GROUPS: { label: string; measures: Measure[] }[] = [
  { label: 'How many', measures: ['count', 'distinct'] },
  { label: 'Middle',   measures: ['avg', 'median', 'mode'] },
  { label: 'Edges',    measures: ['min', 'max', 'range', 'p90', 'p95', 'p99'] },
  { label: 'Spread',   measures: ['sum', 'stddev'] },
  /*
   * Working time only, with the dispatcher's wait taken out.
   *
   * Kept as its own small group rather than doubling all thirteen measures: these three answer
   * "how long does the work take", which every measure above answers as "how long from being
   * queued", and mixing the two families in one list is how a reader ends up comparing them.
   */
  { label: 'Execution', measures: ['execAvg', 'execMedian', 'execMax'] },
];

/** Measures read from EXEC_SECONDS rather than SECONDS. */
export const EXECUTION: ReadonlySet<Measure> =
  new Set<Measure>(['execAvg', 'execMedian', 'execMax']);

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The uninterpolated-rounding form, for measures that carry sub-second precision. */
function percentileRaw(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

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

  const column = EXECUTION.has(measure) ? EXEC_SECONDS : SECONDS;
  const seconds = rows.map(r => r[column] ?? -1).filter(v => v >= 0);
  if (!seconds.length) return 0;
  const sorted = [...seconds].sort((a, b) => a - b);
  const total = seconds.reduce((a, b) => a + b, 0);
  const mean = total / seconds.length;

  switch (measure) {
    // Two decimals kept. These are sub-second on this system, and Math.round would print the
    // 0.23s the tasks actually take as "0s" -- indistinguishable from no data, and the exact
    // opposite of the point of separating execution from the wait in front of it.
    case 'execAvg':    return round2(mean);
    case 'execMedian': return round2(percentileRaw(sorted, 0.5));
    case 'execMax':    return round2(sorted[sorted.length - 1]);
    case 'sum':    return total;
    case 'avg':    return Math.round(mean);
    case 'median': return percentile(sorted, 0.5);
    case 'p90':    return percentile(sorted, 0.90);
    case 'p95':    return percentile(sorted, 0.95);
    case 'p99':    return percentile(sorted, 0.99);
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
  // ?? [] because `job` is only present once withJobDimension has run; an un-enriched
  // payload grouped by Job yields an empty axis rather than a crash.
  const colLabels = data[colDim.key] ?? [];
  const rowLabels: string[] = [];
  const matrix: number[][] = [];
  const cellRows: RunRow[][][] = [];
  const rowTotals: number[] = [];

  (data[rowDim.key] ?? []).forEach((label, ri) => {
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
/**
 * A duration in words. NEGATIVE is the no-data sentinel; ZERO is a real, instant run.
 *
 * `if (!value) return '—'` conflated the two, so a run that finished inside a second -- which
 * rounds to 0 in the query -- was reported as "no duration recorded", and a gridline at the
 * origin was labelled with an em dash instead of 0s. Every caller already guards the sentinel
 * with `>= 0` before calling, so returning a real answer for a real zero is what they expect.
 */
export function humanSeconds(value: number): string {
  if (value < 0) return '—';
  if (value === 0) return '0s';
  // Sub-ten-second values keep their decimals: the execution measures live down here, and
  // "0.23s" is the whole answer where "0s" is none of it.
  if (value < 10) return `${Math.round(value * 100) / 100}s`;
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.round((value % 3600) / 60)}m`;
}

export function formatMeasure(value: number, measure: Measure): string {
  return COUNTING.has(measure) ? value.toLocaleString() : humanSeconds(value);
}
