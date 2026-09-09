import { describe, it, expect } from 'vitest';
import {
  DIMENSIONS, Measure, RunData, RunRow, aggregate, buildPivot, formatMeasure,
  humanSeconds, percentile,
  ADDITIVE,
  EXECUTION
} from './pivot';

const dim = (key: string) => DIMENSIONS.find(d => d.key === key)!;

/** Four runs across two tasks and two outcomes, with one that never finished. */
const data: RunData = {
  task: ['Alpha', 'Beta', 'Never run'],
  status: ['Completed', 'Failed'],
  owner: ['Ada'],
  day: ['2026-08-01', '2026-08-02'],
  rows: [
    [0, 0, 0, 0, 10, 'job a', 1],
    [0, 0, 0, 1, 20, 'job a', 2],
    [0, 1, 0, 1, 30, 'job a', 3],
    [1, 0, 0, 0, -1, 'job b', 4],   // dispatched, never finished
  ] as RunRow[],
};

describe('measures', () => {
  const all = (m: Measure) => aggregate(data.rows, m);

  it('counts every run, finished or not', () => {
    expect(all('count')).toBe(4);
  });

  it('counts distinct days rather than rows', () => {
    expect(all('distinct')).toBe(2);
  });

  it('excludes a run that never finished from the duration measures', () => {
    // 10, 20, 30 -- the -1 must not be averaged in as a zero.
    expect(all('sum')).toBe(60);
    expect(all('avg')).toBe(20);
    expect(all('min')).toBe(10);
  });

  it('reports the median, not the mean', () => {
    expect(all('median')).toBe(20);
  });

  it('measures the spread between the extremes', () => {
    expect(all('max')).toBe(30);
    expect(all('range')).toBe(20);
  });

  it('computes a population standard deviation', () => {
    // mean 20; deviations 10,0,10 -> variance 200/3 -> 8.16
    expect(all('stddev')).toBe(8);
  });

  it('picks the most repeated duration', () => {
    const repeated: RunRow[] = [
      [0,0,0,0,5,'x',1],[0,0,0,0,5,'x',2],[0,0,0,0,9,'x',3],
    ] as RunRow[];
    expect(aggregate(repeated, 'mode')).toBe(5);
  });

  it('returns zero rather than NaN when nothing has a duration', () => {
    const none: RunRow[] = [[0,0,0,0,-1,'x',1]] as RunRow[];
    for (const m of ['sum','avg','median','min','max','range','stddev','mode'] as Measure[]) {
      expect(aggregate(none, m)).toBe(0);
    }
  });

  it('handles an empty set without throwing', () => {
    for (const m of ['count','distinct','sum','avg','median','p90'] as Measure[]) {
      expect(aggregate([], m)).toBe(0);
    }
  });
});

describe('percentile', () => {
  it('interpolates between neighbouring ranks', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });

  it('returns the ends exactly', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });

  it('is not confused by every value being identical', () => {
    // The real data has 500 runs sharing one duration, which put p75, p90 and p95 together.
    const flat = new Array(100).fill(42);
    expect(percentile(flat, 0.9)).toBe(42);
    expect(percentile(flat, 0.95)).toBe(42);
  });

  it('is empty-safe', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('the grid', () => {
  const pivot = () => buildPivot(data, dim('task'), dim('status'), 'count');

  it('drops a dimension value with no runs rather than showing an empty row', () => {
    expect(pivot().rowLabels).toEqual(['Alpha', 'Beta']);
  });

  it('keeps every column so the shape stays comparable', () => {
    expect(pivot().colLabels).toEqual(['Completed', 'Failed']);
  });

  it('puts each run in exactly one cell', () => {
    const p = pivot();
    expect(p.matrix).toEqual([[2, 1], [1, 0]]);
  });

  it('totals agree with the cells they summarise', () => {
    const p = pivot();
    p.matrix.forEach((row, ri) => {
      expect(row.reduce((a, b) => a + b, 0)).toBe(p.rowTotals[ri]);
    });
    p.colLabels.forEach((_, ci) => {
      expect(p.matrix.reduce((a, r) => a + r[ci], 0)).toBe(p.colTotals[ci]);
    });
    expect(p.grand).toBe(4);
  });

  it('a row total is re-measured, not summed, so medians stay honest', () => {
    // Summing medians would be wrong; the row total must be the median of the whole row.
    const p = buildPivot(data, dim('task'), dim('status'), 'median');
    expect(p.rowTotals[0]).toBe(20);          // median of 10,20,30
    expect(p.matrix[0][0]).toBe(15);          // median of 10,20 alone
  });

  it('hands back the runs behind every cell for drilling in', () => {
    const p = pivot();
    expect(p.cellRows[0][0].map(r => r[6])).toEqual([1, 2]);
    expect(p.cellRows[1][1]).toEqual([]);
  });
});

describe('formatting', () => {
  // 0 changed from '—' to '0s' deliberately. The dash is what the whole page uses to mean "no
  // data", and the query rounds a sub-second run to 0, so an instant run was being reported as
  // having no recorded duration -- and a chart's zero gridline was labelled with a dash. The
  // no-data sentinel is NEGATIVE (NO_DURATION = -1) and every caller already guards on `>= 0`
  // before calling, so the dash is still what they see for a genuinely missing duration.
  it.each([[-1,'—'],[0,'0s'],[45,'45s'],[90,'1m 30s'],[3660,'1h 1m']])('%ds reads as %s', (s, out) => {
    expect(humanSeconds(s as number)).toBe(out);
  });

  it('counts are tallies, durations are times', () => {
    expect(formatMeasure(1535, 'count')).toBe('1,535');
    expect(formatMeasure(90, 'avg')).toBe('1m 30s');
  });
});

/**
 * Execution measures read a different column from every other duration measure.
 *
 * job_queue stamps start_time at ENQUEUE, so seconds (index 4) is wait + execution: on the live
 * data that is 41.5s of which 41.25s is the dispatcher's once-a-minute poll and 0.23s is the
 * task. execSeconds (index 8) is the part the worker actually spent, recovered from the audit
 * log's pickup marker. Mixing the two families up would silently report one as the other.
 */
describe('execution measures', () => {
  // [taskIdx, statusIdx, ownerIdx, dayIdx, seconds, jobName, runId, tenantIdx, execSeconds]
  const rows = [
    [0, 0, 0, 0, 40, 'job', 1, 0, 2],
    [0, 0, 0, 0, 60, 'job', 2, 0, 4],
    [0, 0, 0, 0, 34, 'job', 3, 0, 6],
  ] as RunRow[];

  it('reads execSeconds, not the queued-to-finished seconds beside it', () => {
    expect(aggregate(rows, 'execMedian')).toBe(4);
    expect(aggregate(rows, 'median')).toBe(40);
  });

  it('averages and maxes the execution column', () => {
    expect(aggregate(rows, 'execAvg')).toBe(4);
    expect(aggregate(rows, 'execMax')).toBe(6);
  });

  it('drops runs whose pickup was never recorded rather than counting them as instant', () => {
    const withUnknown = [...rows, [0, 0, 0, 0, 50, 'job', 4, 0, -1] as RunRow];
    // the -1 must not drag the mean toward zero
    expect(aggregate(withUnknown, 'execAvg')).toBe(4);
  });

  it('reports nothing rather than zero when no run has a recorded pickup', () => {
    const none = [[0, 0, 0, 0, 50, 'job', 5, 0, -1]] as RunRow[];
    expect(aggregate(none, 'execMedian')).toBe(0);
  });

  it('is not additive, so a chart may not total it', () => {
    expect(ADDITIVE.has('execAvg')).toBe(false);
    expect(ADDITIVE.has('execMedian')).toBe(false);
    expect(EXECUTION.has('execMax')).toBe(true);
    expect(EXECUTION.has('median')).toBe(false);
  });
});
