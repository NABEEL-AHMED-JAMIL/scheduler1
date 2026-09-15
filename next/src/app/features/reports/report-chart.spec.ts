import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ChartKind, RADAR_ROWS, ReportChart } from './report-chart';
import { Measure, Pivot } from './pivot';

/**
 * The report chart's three quiet ways of drawing something other than the answer.
 *
 * All three share a shape: the geometry is right and the LABELLING or the SCALING is not, so the
 * card looks finished and says something the pivot underneath it does not. A gridline rounded to a
 * whole second labels a sub-second axis "0s 0s 1s 1s 1s"; a heat axis that draws every label prints
 * ninety dates across the width of a card; a radar scaled to rows it is not drawing collapses the
 * four it IS drawing into the middle of the web.
 *
 * The grid is built by hand rather than through buildPivot: these tests are about what the chart
 * does with a grid, and aggregate()'s own behaviour is covered in pivot.spec.ts.
 *
 * @author Nabeel Ahmed
 */

function pivotOf(rowLabels: string[], colLabels: string[], matrix: number[][]): Pivot {
  const rowTotals = matrix.map(row => row.reduce((a, b) => a + b, 0));
  const colTotals = colLabels.map((_, ci) => matrix.reduce((sum, row) => sum + row[ci], 0));
  return {
    rowLabels, colLabels, matrix, rowTotals, colTotals,
    grand: rowTotals.reduce((a, b) => a + b, 0),
    cellRows: matrix.map(row => row.map(() => [])),
  };
}

function chartOf(pivot: Pivot, kind: ChartKind, measure: Measure = 'count') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture: ComponentFixture<ReportChart> = TestBed.createComponent(ReportChart);
  fixture.componentRef.setInput('pivot', pivot);
  fixture.componentRef.setInput('measure', measure);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('colorFor', () => 'var(--chart-0)');
  fixture.detectChanges();
  return fixture;
}

/**
 * On this deployment the dispatcher's poll dwarfs the work, so every execution measure is a
 * fraction of a second and the axis floor of 1 is what the gridlines are spread across.
 */
describe('the y axis under a sub-second measure', () => {

  const durations = pivotOf(
    ['report-history', 'nightly-load'],
    ['Completed', 'Failed'],
    [[0.23, 0.18], [0.31, 0.12]]);

  it('labels each gridline with its own value instead of rounding it to a whole second', () => {
    const chart = chartOf(durations, 'grouped', 'execAvg').componentInstance;

    // Rounded first, these five read "0s 0s 1s 1s 1s": five lines carrying two distinct labels,
    // and a bar reaching 23% of the plot height measured against the second of them as 0s while
    // its own tooltip said 0.23s.
    expect((chart as any).gridLines().map((line: any) => line.label))
      .toEqual(['0s', '0.25s', '0.5s', '0.75s', '1s']);
  });

  it('gives a reader five different numbers to measure a bar against', () => {
    const chart = chartOf(durations, 'grouped', 'execAvg').componentInstance;
    const labels = (chart as any).gridLines().map((line: any) => line.label);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it('still writes a counting axis in whole numbers, which is what a tally is', () => {
    // humanSeconds picks its own precision per magnitude; compactNumber rounds inside itself. The
    // tick is handed over raw to both, so a count axis prints exactly what it printed before --
    // 1.5 runs is not a figure this page has ever shown.
    const runs = pivotOf(['a', 'b'], ['Completed', 'Failed'], [[6, 2], [3, 1]]);
    const labels = (chartOf(runs, 'grouped', 'count').componentInstance as any)
      .gridLines().map((line: any) => line.label);

    expect(labels).toEqual(['0', '2', '3', '5', '6']);
    expect(labels.some((label: string) => label.includes('.'))).toBe(false);
  });
});

/**
 * A Day axis over a month is thirty labels in the width of a card, and a Task axis over forty rows
 * is forty 10px labels in 316 units of height. Both used to be drawn whole.
 */
describe('the heatmap axes thin themselves to the room they have', () => {

  const days = Array.from({ length: 30 },
    (_, at) => `2026-09-${String(at + 1).padStart(2, '0')}`);
  const tasks = Array.from({ length: 40 }, (_, at) => `task-${at}`);
  const wide = pivotOf(tasks, days, tasks.map(() => days.map(() => 1)));

  function labelsOf(pivot: Pivot) {
    const chart = chartOf(pivot, 'heat').componentInstance;
    const all = (chart as any).axisLabels();
    return {
      chart,
      columns: all.filter((label: any) => label.anchor === 'middle'),
      rows: all.filter((label: any) => label.anchor === 'end'),
    };
  }

  it('draws one column label in four when the columns are 26 units wide', () => {
    // Each label is a ten-character date rendering to roughly 55 units at font-size 10; drawn on
    // every column they overprinted their neighbours on both sides into an unreadable smear.
    const { chart, columns } = labelsOf(wide);

    // The starting width, which nothing measures away under jsdom. Asserted so a failure below
    // reads as "the thinning changed" rather than "the card got wider".
    expect((chart as any).W).toBe(960);
    expect(columns.map((label: any) => label.text)).toEqual([
      '2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13',
      '2026-09-17', '2026-09-21', '2026-09-25', '2026-09-29',
    ]);
  });

  it('leaves at least a label\'s width between the column labels it keeps', () => {
    const { columns } = labelsOf(wide);
    const gaps = columns.slice(1).map((label: any, at: number) => label.x - columns[at].x);

    expect(gaps.every((gap: number) => gap >= 100)).toBe(true);
  });

  it('thins the row axis by the cell HEIGHT, which is what a row label runs out of', () => {
    // A column label is laid out along the axis and collides sideways; a row label is horizontal
    // beside its cell and collides with the row above it. 40 tasks leave 7.9 units of pitch for
    // 10px type, so every name overprinted the two either side of it.
    const { rows } = labelsOf(wide);
    const gaps = rows.slice(1).map((label: any, at: number) => label.y - rows[at].y);

    expect(rows.length).toBeLessThan(tasks.length);
    expect(gaps.every((gap: number) => gap >= 13)).toBe(true);
  });

  it('keeps every label when every label fits, rather than thinning on principle', () => {
    const roomy = pivotOf(['a', 'b', 'c'], ['Mon', 'Tue', 'Wed', 'Thu'],
      [[1, 2, 3, 4], [4, 3, 2, 1], [1, 1, 1, 1]]);
    const { columns, rows } = labelsOf(roomy);

    expect(columns.map((label: any) => label.text)).toEqual(['Mon', 'Tue', 'Wed', 'Thu']);
    expect(rows.map((label: any) => label.text)).toEqual(['a', 'b', 'c']);
  });

  it('keeps each surviving label over the cell it names', () => {
    // The labels are filtered by INDEX and positioned from that index, so a thinned axis still
    // names the column it sits above. Dropping them after positioning would shift every one.
    const { chart, columns } = labelsOf(wide);
    // The heat grid's own left gutter and right margin, which heatCells() draws the cells from.
    const cw = ((chart as any).W - 170 - 16) / days.length;
    const centreOf = (at: number) => 170 + cw * at + cw / 2;

    for (const label of columns) {
      expect(label.x).toBeCloseTo(centreOf(days.indexOf(label.text)), 6);
    }
  });
});

/**
 * A radar carries four shapes before they stop being separable, and it used to say nothing about
 * the rows it dropped -- while scaling the four it kept against the maximum of all of them.
 */
describe('the rows a radar does not draw', () => {

  const tasks = Array.from({ length: 19 }, (_, at) => `task-${at}`);
  /** Four modest rows and a fifteen-row tail, one of which is an order of magnitude busier. */
  const matrix = tasks.map((_, at) => at === 8 ? [400, 380, 360] : [12, 10, 8]);
  const many = pivotOf(tasks, ['Completed', 'Failed', 'Running'], matrix);

  /** Every vertex of every drawn polygon, as a distance from the centre of the web. */
  function radii(chart: ReportChart): number[] {
    const cx = (chart as any).W / 2;
    const cy = (chart as any).H / 2 + 4;
    return (chart as any).segments().flatMap((segment: any) => segment.d
      .replace(/[MLZ]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((pair: string) => pair.split(',').map(Number))
      .map(([x, y]: number[]) => Math.hypot(x - cx, y - cy)));
  }

  it('counts the rows it left out, so the card can say so instead of hiding them', () => {
    const chart = chartOf(many, 'radar').componentInstance;

    expect(chart.radarHidden()).toBe(tasks.length - RADAR_ROWS);
  });

  it('says nothing when the radar is not the chart on screen', () => {
    expect(chartOf(many, 'grouped').componentInstance.radarHidden()).toBe(0);
  });

  it('is silent when every row is drawn', () => {
    const four = pivotOf(tasks.slice(0, 4), ['Completed'], [[1], [2], [3], [4]]);
    expect(chartOf(four, 'radar').componentInstance.radarHidden()).toBe(0);
  });

  it('scales the web to the rows on it, so a busy row in the tail cannot flatten them', () => {
    // Scaled against the whole pivot, task-8's 400 runs squashed the four drawn polygons into the
    // inner three per cent of the web -- reading as "nothing happened" for tasks that did run,
    // against an outer ring no row on the chart accounts for.
    const chart = chartOf(many, 'radar').componentInstance;
    const R = Math.min((chart as any).H * 0.36, 96);

    // The largest value among the drawn rows reaches the outer ring, which is what full extent
    // has to mean for the ring to be readable at all.
    expect(Math.max(...radii(chart))).toBeCloseTo(R, 6);
  });

  it('draws the same four shapes whatever the rows underneath them hold', () => {
    const fixture = chartOf(many, 'radar');
    const withBusyTail = (fixture.componentInstance as any).segments()
      .map((segment: any) => segment.d);

    // The same grid with the tail made trivial. The four drawn rows are untouched, so the drawing
    // must be too: it is the whole of what this chart claims to be about.
    const quietTail = pivotOf(tasks, ['Completed', 'Failed', 'Running'],
      tasks.map((_, at) => at < RADAR_ROWS ? matrix[at] : [1, 1, 1]));
    fixture.componentRef.setInput('pivot', quietTail);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).segments().map((segment: any) => segment.d))
      .toEqual(withBusyTail);
  });
});
