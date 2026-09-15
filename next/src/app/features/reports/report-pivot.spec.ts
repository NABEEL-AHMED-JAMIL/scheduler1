import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { ReportPivot } from './report-pivot';
import { RunData, RunRow } from './pivot';

@Component({
  imports: [ReportPivot],
  template: `<app-report-pivot [data]="data()" startDate="2026-08-01" endDate="2026-08-31" />`,
})
class Host {
  readonly data = signal<RunData>(
    { task: [], status: [], owner: [], day: [], job: [], tenant: [], rows: [] });
}

/** The body of the last export POST, which is the only thing any destination ever sees. */
let lastExport: { title: string; columns: string[]; rows: (string | number | null)[][] } | null;

function pivotFor(data: RunData) {
  lastExport = null;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      {
        provide: HttpClient,
        useValue: {
          // Answering ERROR on purpose. The grid is built and sent before the response is read,
          // so the bytes under test are captured without going near atob() and
          // URL.createObjectURL(), neither of which jsdom implements.
          post: (_url: string, body: any) => {
            lastExport = body;
            return of({ status: 'ERROR', message: 'not today' });
          },
        },
      },
      { provide: Dialog, useValue: { open: () => ({ closed: of(null) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.data.set(data);
  fixture.detectChanges();
  return fixture.debugElement.children[0].componentInstance as ReportPivot;
}

/**
 * Two tasks and three outcomes, carrying all three kinds of gap this grid has to tell apart.
 *
 * `report-history` never failed, so (report-history, Failed) has no runs at all. `nightly-load`
 * has a Failed run that was never timed -- -1 in both duration columns, which is exactly what a
 * run still in flight, or one whose end_time is null, looks like coming out of the query. And
 * `Running` is in the outcome dictionary with no rows behind it, which is what a column looks
 * like once a client-side filter has emptied it: data() keeps the dictionaries whole.
 *
 * [taskIdx, statusIdx, ownerIdx, dayIdx, seconds, jobName, runId, tenantIdx, execSeconds]
 */
const data: RunData = {
  task: ['report-history', 'nightly-load'],
  status: ['Completed', 'Failed', 'Running'],
  owner: ['Ada'],
  day: ['2026-08-01'],
  rows: [
    [0, 0, 0, 0, 40, 'job a', 1, 0, 2],
    [0, 0, 0, 0, 60, 'job a', 2, 0, 4],
    [1, 0, 0, 0, 34, 'job b', 3, 0, 6],
    [1, 1, 0, 0, -1, 'job b', 4, 0, -1],
  ] as RunRow[],
};

const lastRow = () => lastExport!.rows[lastExport!.rows.length - 1];

/**
 * The export was built straight off the matrix while the screen rendered cellText(), and the two
 * had not agreed since cellText learned to print a dash. All four export paths are fed by one
 * toCsv() on the server, so CSV, Excel, Save and Submit carried identical wrong bytes.
 */
describe('the exported grid says what the screen says', () => {
  it('writes an empty cell, not 0, where the grid shows a dash', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('min');          // "Shortest run"
    pivot.export('csv');

    const ri = pivot.pivot().rowLabels.indexOf('report-history');
    const ci = pivot.pivot().colLabels.indexOf('Failed');
    // A reader who runs MIN() down this column in the spreadsheet must not be handed a 0s
    // fastest failure for a task that never failed.
    expect(pivot.cellText(ri, ci)).toBe('—');
    expect(lastExport!.rows[ri][ci + 1]).toBeNull();
  });

  it('writes an empty cell for a cell whose runs were never timed', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('min');
    pivot.export('csv');

    const ri = pivot.pivot().rowLabels.indexOf('nightly-load');
    const ci = pivot.pivot().colLabels.indexOf('Failed');
    // There IS a run behind this one, so the dash test alone never covered it.
    expect(pivot.pivot().cellRows[ri][ci].length).toBe(1);
    expect(pivot.cellText(ri, ci)).toBe('—');
    expect(lastExport!.rows[ri][ci + 1]).toBeNull();
  });

  it('still writes a real 0 for a run that genuinely took no time', () => {
    const instant: RunData = { ...data, rows: [[0, 0, 0, 0, 0, 'job a', 1, 0, 0]] as RunRow[] };
    const pivot = pivotFor(instant);
    pivot.setMeasure('min');
    pivot.export('csv');

    expect(pivot.cellText(0, 0)).toBe('0s');
    expect(lastExport!.rows[0][1]).toBe(0);
  });

  it('exports every measured number unchanged', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('min');
    pivot.export('csv');

    const ri = pivot.pivot().rowLabels.indexOf('report-history');
    expect(lastExport!.rows[ri][1]).toBe(40);       // Completed: the shorter of 40 and 60
    expect(lastExport!.columns).toEqual(['Task', 'Completed', 'Failed', 'Running', 'All']);
  });

  it('empties a duration total the screen dashes out, and keeps a count of zero', () => {
    const pivot = pivotFor(data);
    const running = data.status.indexOf('Running');

    // Nothing ran in this column, so there is no duration to report. "0s" would have claimed one.
    pivot.setMeasure('min');
    pivot.export('csv');
    expect(pivot.format(pivot.pivot().colTotals[running])).toBe('—');
    expect(lastRow()[running + 1]).toBeNull();

    // A count of no runs, though, is a truthful zero, and the screen prints it as one.
    pivot.setMeasure('count');
    pivot.export('csv');
    expect(pivot.format(pivot.pivot().colTotals[running])).toBe('0');
    expect(lastRow()[running + 1]).toBe(0);
  });

  it('sends the same grid to every destination', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('min');
    pivot.export('csv');
    const csv = JSON.stringify(lastExport!.rows);
    pivot.export('xlsx');
    expect(JSON.stringify(lastExport!.rows)).toBe(csv);
  });
});

/**
 * A cell is offered for drilling on whether it HAS RUNS, which is not the same question as
 * whether its number is zero -- and the two answer differently in both directions.
 */
describe('the drill control follows the runs, not the number', () => {
  it('offers a cell whose runs all finished instantly', () => {
    const instant: RunData = { ...data, rows: [[0, 0, 0, 0, 0, 'job a', 1, 0, 0]] as RunRow[] };
    const pivot = pivotFor(instant);
    pivot.setMeasure('min');
    expect(pivot.cellIsEmpty(0, 0)).toBe(false);
  });

  it('refuses a cell with nothing behind it', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('min');
    const ri = pivot.pivot().rowLabels.indexOf('report-history');
    const ci = pivot.pivot().colLabels.indexOf('Failed');
    expect(pivot.cellIsEmpty(ri, ci)).toBe(true);
  });
});

/**
 * The header sparkline binned SECONDS whatever the measure, while the numbers underneath branch
 * on EXECUTION -- so one column read 0.23s in its cells and "near 41s" in its own tooltip.
 */
describe('the column header histogram bins the measure that is selected', () => {
  it('reads the execution column under an Execution measure', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('execMax');
    // report-history's two runs executed in 2s and 6s; queued to finished they took 40s and 60s.
    const hints = pivot.columnHistogram(0).map(bin => bin.hint);
    expect(hints[hints.length - 1]).toContain('6s');
    expect(hints.join(' ')).not.toContain('58s');
  });

  it('reads the queued-to-finished column under every other duration measure', () => {
    const pivot = pivotFor(data);
    pivot.setMeasure('max');
    const hints = pivot.columnHistogram(0).map(bin => bin.hint);
    expect(hints[hints.length - 1]).toContain('58s');
  });

  it('bins the same population the cells above it are measured over', () => {
    // Both runs finished, so they have a queued-to-finished duration -- but neither recorded the
    // instant the worker picked it up, so under an Execution measure there is nothing to bin.
    // The header used to draw them anyway, from the column the cells were ignoring.
    const noPickup: RunData = {
      task: ['nightly-load'], status: ['Failed'], owner: ['Ada'], day: ['2026-08-01'],
      rows: [
        [0, 0, 0, 0, 55, 'job b', 5, 0, -1],
        [0, 0, 0, 0, 62, 'job b', 6, 0, -1],
      ] as RunRow[],
    };
    const pivot = pivotFor(noPickup);
    pivot.setMeasure('execMax');
    expect(pivot.columnHistogram(0).every(bin => bin.height === 0)).toBe(true);

    // ...and the cells agree with it, which is the point.
    expect(pivot.cellText(0, 0)).toBe('—');
  });

  it('does not call a column of untimed runs an empty one', () => {
    const noPickup: RunData = {
      task: ['nightly-load'], status: ['Failed'], owner: ['Ada'], day: ['2026-08-01'],
      rows: [[0, 0, 0, 0, 55, 'job b', 5, 0, -1]] as RunRow[],
    };
    const pivot = pivotFor(noPickup);
    pivot.setMeasure('execMax');
    // The strip has nothing to draw, but "no runs" would contradict the "1 runs" caption under
    // it -- and the column really does hold a run, it was simply never timed on this clock.
    expect(pivot.columnHistogram(0)[0].hint).toBe('no run here has a recorded duration');
    expect(pivot.columnCount(0)).toBe(1);
  });
});
