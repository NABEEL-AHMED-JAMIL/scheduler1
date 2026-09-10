import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import {
  Dashboards, DatasetRegistry, analysisView, dateOnly, plainDecimal, queryView, combineFilters } from './dashboard';
import { dateOnly as studioDateOnly, plainDecimal as studioPlainDecimal } from './analytics';
import {
  AnalysisResult, AnalyticsService, Dashboard, DashboardWidget, QueryResult, RegisteredDataset,
  SavedAnalysis, SavedQuery,
} from './analytics.service';

/**
 * Dashboards, the dataset registry, and the two things about them that can go wrong quietly.
 *
 * THE FIRST IS THE COST OF OPENING A BOARD, and it is the reason this file leads with it. A
 * widget holds a reference and never a result, so every tile on a board is a live query against
 * a governor that admits four at once across the whole application -- shared with every other
 * user and with the ETL work on the same JVM. The rule that makes that safe is that tiles run
 * STRICTLY ONE AT A TIME, and it is a rule with no visible symptom when it breaks: a board that
 * fired its ten queries together looks faster on a developer's laptop and takes the ceiling away
 * from everybody else on a real box. So the serial queue is pinned directly -- one request in
 * flight, the next starting only when the first has settled -- and so is every path that could
 * quietly widen it: adding a widget runs one widget, changing a chart kind runs nothing at all,
 * and Stop both empties the queue and cancels what is already out.
 *
 * THE SECOND IS THE PAIR OF COPIED RENDERING RULES. plainDecimal and dateOnly exist twice in
 * this feature -- once in analytics.ts and once here -- because the Studio's tab strip will
 * import this file and a shared import would close a cycle. A duplicated rule is exactly the
 * drift this codebase warns about, so both copies are imported below and asserted to agree,
 * including on the two measured defects they exist for: `sum(amount)` arriving as "7.466125E7",
 * and a DATE arriving with a midnight the column cannot hold.
 *
 * Everything else here is about refusing to draw a figure the data does not support -- a ring
 * over averages, a bar for a measure that does not parse, a tile that shows part of an answer
 * without saying so.
 */

const SERVER_RESPONSE = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });
const SERVER_REFUSAL = (message: string) => ({ status: 'ERROR' as const, message, data: undefined });

const BOARD: Dashboard = {
  analyticsDashboardId: 7,
  dashboardName: 'Month end',
  dashboardDescription: 'What finance asks for',
};

const ANALYSIS: SavedAnalysis = {
  analyticsAnalysisId: 11,
  analysisName: 'Revenue by region',
  connectionAlias: 'minio-main',
  datasetPath: 'daily/sales-2026.csv',
  visualizationType: 'ranked',
  analysisConfig: JSON.stringify({
    dimensions: ['region'],
    measure: { aggregation: 'SUM', field: 'amount' },
    filters: { op: 'AND', clauses: [] },
    topN: null,
    sort: null,
  }),
};

/** The same analysis measured with an average, which is the one a ring may not divide. */
const AVERAGED: SavedAnalysis = {
  ...ANALYSIS,
  analyticsAnalysisId: 12,
  analysisName: 'Average sale by region',
  analysisConfig: JSON.stringify({
    dimensions: ['region'],
    measure: { aggregation: 'AVERAGE', field: 'amount' },
  }),
};

const QUERY: SavedQuery = {
  analyticsQueryId: 21,
  queryName: 'Monthly totals',
  connectionAlias: 'minio-main',
  datasetPath: 'daily/sales-2026.csv',
  queryText: 'select month, sum(amount) from dataset group by month',
};

function widgetOn(over: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    analyticsDashboardWidgetId: 100,
    analyticsDashboardId: 7,
    widgetTitle: 'Revenue by region',
    analyticsAnalysisId: 11,
    visualizationType: 'ranked',
    displayOrder: 0,
    ...over,
  };
}

function analysisResult(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    columns: [
      { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
      { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
    ],
    rows: [['north', '1200'], ['south', '800']],
    rowCount: 2,
    truncated: false,
    measure: 'sum_amount',
    ...over,
  };
}

function queryResult(over: Partial<QueryResult> = {}): QueryResult {
  return {
    columns: ['month', 'total'],
    rows: [['2026-01', '100'], ['2026-02', '250']],
    rowCount: 2,
    truncated: false,
    ...over,
  };
}

/**
 * A board wired to a stubbed API, already past ngOnInit.
 *
 * The listing calls answer immediately -- reading metadata is not what is being tested -- while
 * analyze() and query() hand back a fresh Subject each time, so a test can hold the board in
 * mid-run and see exactly how many requests are out at once. That is the whole point of the
 * harness: `analyzes.length` is the number of queries this screen has started, and the serial
 * rule is the claim that it never runs ahead of the settling.
 *
 * `widgets` is mutated by saveWidget and deleteWidget the way the server's own table would be,
 * so the reload after an add really does hand back the row that was just created.
 */
interface BoardOptions {
  widgets?: DashboardWidget[];
  analyses?: SavedAnalysis[];
  queries?: SavedQuery[];
  dashboards?: Dashboard[];
  confirms?: boolean;
}

function stubbedApi(over: BoardOptions = {}) {
  const widgets = [...(over.widgets ?? [])];
  const analyzes: Subject<any>[] = [];
  const queryRuns: Subject<any>[] = [];

  const analyze = vi.fn(() => {
    const answer = new Subject<any>();
    analyzes.push(answer);
    return answer.asObservable();
  });
  const query = vi.fn(() => {
    const answer = new Subject<any>();
    queryRuns.push(answer);
    return answer.asObservable();
  });
  const fetchAllDashboards = vi.fn(() => of(SERVER_RESPONSE(over.dashboards ?? [BOARD])));
  const fetchDashboardById = vi.fn(() => of(SERVER_RESPONSE({ ...BOARD, widgets: [...widgets] })));
  const fetchAllAnalyses = vi.fn(() => of(SERVER_RESPONSE(over.analyses ?? [ANALYSIS, AVERAGED])));
  const fetchAllQueries = vi.fn(() => of(SERVER_RESPONSE(over.queries ?? [QUERY])));
  const saveDashboard = vi.fn((dashboard: Dashboard) =>
    of(SERVER_RESPONSE({ ...dashboard, analyticsDashboardId: dashboard.analyticsDashboardId ?? 9 })));
  const deleteDashboard = vi.fn(() => of(SERVER_RESPONSE(undefined)));
  const saveWidget = vi.fn((widget: DashboardWidget) => {
    const saved = {
      ...widget,
      analyticsDashboardWidgetId: widget.analyticsDashboardWidgetId ?? 900,
    };
    const at = widgets.findIndex(
      item => item.analyticsDashboardWidgetId === saved.analyticsDashboardWidgetId);
    if (at >= 0) widgets[at] = saved; else widgets.push(saved);
    return of(SERVER_RESPONSE(saved));
  });
  const deleteWidget = vi.fn((id: number) => {
    const at = widgets.findIndex(item => item.analyticsDashboardWidgetId === id);
    if (at >= 0) widgets.splice(at, 1);
    return of(SERVER_RESPONSE(undefined));
  });
  const cancel = vi.fn(() => of(SERVER_RESPONSE(undefined)));

  // The board filter reads a dataset's columns once, when its bar is opened, so the builder has a
  // vocabulary to offer. Never settled here: what these tests care about is that nothing RUNS.
  const schema = vi.fn(() => new Subject<any>().asObservable());
  const api = {
    analyze, query, cancel, fetchAllDashboards, fetchDashboardById, fetchAllAnalyses,
    fetchAllQueries, saveDashboard, deleteDashboard, saveWidget, deleteWidget, schema,
  };
  return {
    api, analyzes, queryRuns, analyze, query, cancel, fetchDashboardById, saveWidget, schema,
    deleteWidget, saveDashboard, deleteDashboard,
    /** Settles whichever request is currently out, as a success. */
    finishAnalysis(result: AnalysisResult = analysisResult()) {
      analyzes[analyzes.length - 1].next(SERVER_RESPONSE(result));
    },
    finishQuery(result: QueryResult = queryResult()) {
      queryRuns[queryRuns.length - 1].next(SERVER_RESPONSE(result));
    },
  };
}

function configure(over: BoardOptions) {
  const stub = stubbedApi(over);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AnalyticsService, useValue: stub.api },
      // confirmWith resolves as soon as the dialog "closes", so this is the reader saying yes.
      { provide: Dialog, useValue: { open: () => ({ closed: of(over.confirms ?? true) }) } },
    ],
  });
  return stub;
}

function boardWith(over: BoardOptions = {}) {
  const stub = configure(over);
  const board = TestBed.runInInjectionContext(() => new Dashboards());
  board.ngOnInit();
  return { ...stub, board, runOf: (id: number) => board.runs()[id] };
}

/** The same board rendered, because some of these claims are made only on the screen. */
function renderedBoard(over: BoardOptions = {}) {
  const stub = configure(over);
  const fixture = TestBed.createComponent(Dashboards);
  // ngOnInit, which reads the boards and the saved work a widget can point at.
  fixture.detectChanges();
  const board = fixture.componentInstance;
  board.openDashboard(BOARD);
  fixture.detectChanges();
  return {
    ...stub, board, fixture,
    runOf: (id: number) => board.runs()[id],
    text() {
      fixture.detectChanges();
      return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    },
  };
}

// ---------------------------------------------------------------------------------------------

describe('what a board costs to open', () => {

  it('runs the widgets ONE AT A TIME, never all at once', () => {
    const harness = boardWith({
      widgets: [
        widgetOn({ analyticsDashboardWidgetId: 100 }),
        widgetOn({ analyticsDashboardWidgetId: 101 }),
        widgetOn({ analyticsDashboardWidgetId: 102 }),
      ],
    });
    harness.board.openDashboard(BOARD);

    // Three tiles, ONE query. The other two are waiting their turn, and "waiting" is a state
    // they are actually in rather than a spinner standing in for one.
    expect(harness.analyze).toHaveBeenCalledTimes(1);
    expect(harness.runOf(100).state).toBe('running');
    expect(harness.runOf(101).state).toBe('queued');
    expect(harness.runOf(102).state).toBe('queued');

    harness.finishAnalysis();
    expect(harness.analyze).toHaveBeenCalledTimes(2);
    expect(harness.runOf(100).state).toBe('done');
    expect(harness.runOf(101).state).toBe('running');
    expect(harness.runOf(102).state).toBe('queued');

    harness.finishAnalysis();
    harness.finishAnalysis();
    expect(harness.analyze).toHaveBeenCalledTimes(3);
    expect(harness.board.running()).toBe(false);
  });

  it('keeps no result: opening the same board again runs everything again', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();
    const first = harness.runOf(100).view!.ranAt;
    expect(harness.analyze).toHaveBeenCalledTimes(1);

    harness.board.openDashboard(BOARD);
    // Not served from what is already on screen. A tile that answered from memory would be
    // showing a figure whose dataset may have changed under it since.
    expect(harness.analyze).toHaveBeenCalledTimes(2);
    harness.finishAnalysis();
    expect(harness.runOf(100).view!.ranAt).toBeGreaterThanOrEqual(first);
  });

  it('says on the board that the tiles run one at a time', () => {
    const harness = boardWith({ widgets: [widgetOn({ analyticsDashboardWidgetId: 100 }),
      widgetOn({ analyticsDashboardWidgetId: 101 })] });
    harness.board.openDashboard(BOARD);
    // The exchange a reader is making by opening this page: slower, and never at anyone else's
    // expense. It is on the board rather than in a release note because nothing about a tile
    // reveals that it is a live query.
    expect(harness.board.cost()).toContain('2 widgets');
    expect(harness.board.cost()).toContain('one at a time');
    expect(harness.board.cost()).toContain('nothing here is stored from last time');
  });

  it('counts an empty board as costing nothing', () => {
    const harness = boardWith({ widgets: [] });
    harness.board.openDashboard(BOARD);
    expect(harness.board.cost()).toBe('An empty board costs nothing to open.');
    expect(harness.analyze).not.toHaveBeenCalled();
  });

  it('stops the queue and cancels the one already out', () => {
    const harness = boardWith({
      widgets: [
        widgetOn({ analyticsDashboardWidgetId: 100 }),
        widgetOn({ analyticsDashboardWidgetId: 101 }),
        widgetOn({ analyticsDashboardWidgetId: 102 }),
      ],
    });
    harness.board.openDashboard(BOARD);
    const running = harness.runOf(100).queryId;
    expect(running).not.toBe('');

    harness.board.stopRun();

    expect(harness.cancel).toHaveBeenCalledWith(running);
    expect(harness.runOf(100).state).toBe('stopped');
    expect(harness.runOf(101).state).toBe('stopped');
    expect(harness.runOf(102).state).toBe('stopped');
    // And nothing else was started on the way out.
    expect(harness.analyze).toHaveBeenCalledTimes(1);
  });

  it('drops a response that arrives after the reader has stopped', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.openDashboard(BOARD);
    harness.board.stopRun();

    // The request was already on the wire when Stop was pressed. Applying it would put a figure
    // on a tile the reader has been told is not running.
    harness.finishAnalysis();
    expect(harness.runOf(100).state).toBe('stopped');
    expect(harness.runOf(100).view).toBeNull();
  });

  it('counts a re-run of one tile as one, and not as the whole board', () => {
    const harness = boardWith({
      widgets: [
        widgetOn({ analyticsDashboardWidgetId: 100 }),
        widgetOn({ analyticsDashboardWidgetId: 101 }),
      ],
    });
    harness.board.openDashboard(BOARD);
    expect(harness.board.progress()).toContain('Running 1 of 2');
    harness.finishAnalysis();
    harness.finishAnalysis();

    harness.board.runOne(harness.board.widgets()[1]);
    // "5 of 5" over a single re-run would have a reader waiting for four tiles nobody queued.
    expect(harness.board.progress()).toContain('Running 1 of 1');
    expect(harness.runOf(100).state).toBe('done');
  });

  it('adding a widget runs that widget alone, not the board again', () => {
    const harness = boardWith({ widgets: [widgetOn({ analyticsDashboardWidgetId: 100 })] });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();
    expect(harness.analyze).toHaveBeenCalledTimes(1);

    harness.board.openAdd();
    harness.board.addTitle.set('Monthly totals');
    harness.board.pickSourceKind('query');
    harness.board.addSourceId.set('21');
    harness.board.addWidget();

    // One new run, and it is the query the new tile points at. The tile that was already drawn
    // is left alone -- redrawing it would spend a permit to show a figure already on screen.
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.analyze).toHaveBeenCalledTimes(1);
    expect(harness.runOf(100).state).toBe('done');
    expect(harness.runOf(900).state).toBe('running');
  });

  it('changing how a widget is drawn runs nothing at all', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();

    harness.board.setVisualization(harness.board.widgets()[0], 'bar');

    // The result in hand is drawn differently, which is the whole reason a widget is a reference
    // plus a visualization choice: picking a chart must not cost a query.
    expect(harness.analyze).toHaveBeenCalledTimes(1);
    expect(harness.saveWidget).toHaveBeenCalledTimes(1);
    expect(harness.board.widgets()[0].visualizationType).toBe('bar');
    expect(harness.runOf(100).view).not.toBeNull();
  });

  it('removing a widget does not re-run the ones that stay', async () => {
    const harness = boardWith({
      widgets: [
        widgetOn({ analyticsDashboardWidgetId: 100 }),
        widgetOn({ analyticsDashboardWidgetId: 101 }),
      ],
    });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();
    harness.finishAnalysis();
    expect(harness.analyze).toHaveBeenCalledTimes(2);

    await harness.board.removeWidget(harness.board.widgets()[1]);

    expect(harness.deleteWidget).toHaveBeenCalledWith(101);
    expect(harness.analyze).toHaveBeenCalledTimes(2);
    expect(harness.runOf(100).state).toBe('done');
    expect(harness.board.widgets().map(widget => widget.analyticsDashboardWidgetId)).toEqual([100]);
  });

  it('sends nothing when a saved configuration will not parse', () => {
    const harness = boardWith({
      widgets: [widgetOn()],
      analyses: [{ ...ANALYSIS, analysisConfig: '{not json' }],
    });
    harness.board.openDashboard(BOARD);

    // Half a restored analysis -- the dimensions without the filters -- would answer a different
    // question under the same title, so nothing is sent at all.
    expect(harness.analyze).not.toHaveBeenCalled();
    expect(harness.runOf(100).state).toBe('failed');
    expect(harness.runOf(100).error).toContain('not readable');
  });

  it('says so rather than guessing when the source a widget points at is gone', () => {
    const harness = boardWith({ widgets: [widgetOn({ analyticsQueryId: 999, analyticsAnalysisId: null })] });
    harness.board.openDashboard(BOARD);

    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.runOf(100).state).toBe('failed');
    expect(harness.runOf(100).error).toContain('not in this workspace');
  });

  it('refuses to add a widget with no source picked', () => {
    const harness = boardWith({ widgets: [] });
    harness.board.openDashboard(BOARD);
    harness.board.openAdd();
    harness.board.addTitle.set('Something');

    // The server refuses "not both and not neither" with a sentence; asking for it and being
    // told is a round trip that teaches the reader nothing they could not be told here.
    expect(harness.board.canAdd()).toBe(false);
    harness.board.addWidget();
    expect(harness.saveWidget).not.toHaveBeenCalled();
  });

  it('does not carry a chosen id across from one source list to the other', () => {
    const harness = boardWith({ widgets: [] });
    harness.board.openDashboard(BOARD);
    harness.board.openAdd();
    harness.board.addSourceId.set('11');
    harness.board.pickSourceKind('query');

    // 11 is an analysis id. Left in place it would point the widget at whichever saved query
    // happens to share the number.
    expect(harness.board.addSourceId()).toBe('');
  });
});

describe('what a tile is allowed to claim', () => {

  it('leaves a row whose measure does not parse OUT, and says so', () => {
    const view = analysisView(analysisResult({
      rows: [['north', '1200'], ['south', 'n/a']],
      rowCount: 2,
    }), 'SUM');

    expect(view.marks).toEqual([{ name: 'north', value: 1200 }]);
    expect(view.notes.join(' ')).toContain('1 row is not drawn');
    // Not counted as zero: a bar shortened by an amount nobody measured is worse than no bar.
    expect(view.notes.join(' ')).toContain('rather than counted as zero');
  });

  it('refuses a ring over an aggregation that has no total to divide', () => {
    const view = analysisView(analysisResult(), 'AVERAGE');
    expect(view.issues.donut).toContain('has no total to divide');
    // The bars are still fine: an average per region is a real length even though the averages
    // do not add up to anything.
    expect(view.issues.ranked).toBe('');
    expect(view.issues.bar).toBe('');
  });

  it('allows a ring over a sum, and refuses one over too many slices', () => {
    expect(analysisView(analysisResult(), 'SUM').issues.donut).toBe('');

    const many = analysisView(analysisResult({
      rows: Array.from({ length: 7 }, (_, at) => [`region-${at}`, '10']),
      rowCount: 7,
    }), 'SUM');
    expect(many.issues.donut).toContain('six colours');
  });

  it('refuses a ring that would have to include a figure of zero or below', () => {
    const view = analysisView(analysisResult({
      rows: [['north', '1200'], ['refunds', '-40']],
    }), 'SUM');
    expect(view.issues.donut).toContain('zero or below');
  });

  it('says a bar is missing rather than letting an absence stand for a category', () => {
    const view = analysisView(analysisResult({
      rows: [['north', '1200'], ['refunds', '-40'], ['empty', '0']],
      rowCount: 3,
    }), 'SUM');

    // RankedBar drops a row that is not above zero, and a dropped bar looks exactly like a
    // category that was never in the data.
    expect(view.notes.join(' ')).toContain('2 figures are zero or below');
    expect(view.notes.join(' ')).toContain('They are in the table.');
    expect(view.rows.length).toBe(3);
  });

  it('renders a measure in scientific notation as the number it is', () => {
    const view = analysisView(analysisResult({
      rows: [['north', '7.466125E7']],
      rowCount: 1,
    }), 'SUM');

    // The measured defect: a currency total arriving as "7.466125E7" reads as seven point
    // something at a glance, and it is 74,661,250.
    expect(view.rows[0][1]).toBe('74661250');
    expect(view.marks[0].value).toBe(74661250);
  });

  it('renders a DATE dimension without the midnight the column cannot hold', () => {
    const view = analysisView(analysisResult({
      columns: [
        { name: 'booked_on', type: 'DATE', role: 'DIMENSION' },
        { name: 'rows', type: 'BIGINT', role: 'MEASURE' },
      ],
      rows: [['2024-01-01 00:00:00.0', '12']],
      rowCount: 1,
      measure: 'rows',
    }), 'COUNT_ROWS');

    expect(view.rows[0][0]).toBe('2024-01-01');
    expect(view.marks[0].name).toBe('2024-01-01');
  });

  it('keeps a null cell a null rather than an empty string', () => {
    const view = analysisView(analysisResult({
      rows: [['north', null]],
      rowCount: 1,
    }), 'SUM');
    expect(view.rows[0][1]).toBeNull();
  });

  it('carries the truncation forward, because a partial answer said quietly is a wrong one', () => {
    const view = analysisView(analysisResult({ truncated: true }), 'SUM');
    expect(view.truncated).toBe(true);
    expect(view.notes.join(' ')).toContain('row ceiling');
  });

  it('reports a Top-N roll-up by the bucket\'s real size and not by the sample listed', () => {
    const view = analysisView(analysisResult({
      other: { label: 'Other', values: ['a', 'b'], valueCount: 41, valuesTruncated: true },
    }), 'SUM');
    expect(view.notes.join(' ')).toContain('41 values were rolled into "Other"');
  });

  it('says what a relative window actually resolved to', () => {
    const view = analysisView(analysisResult({
      resolvedWindows: { 'LAST_7_DAYS': '2026-03-01 to 2026-03-07' },
    }), 'SUM');
    expect(view.notes.join(' ')).toContain('resolved to 2026-03-01 to 2026-03-07');
  });

  it('shows only a tile\'s worth of rows and counts the whole result under them', () => {
    const view = analysisView(analysisResult({
      rows: Array.from({ length: 30 }, (_, at) => [`r${at}`, '1']),
      rowCount: 30,
    }), 'SUM');
    expect(view.rows.length).toBe(8);
    expect(view.rowCount).toBe(30);
  });
});

describe('a tile over a saved query, which has no types to read', () => {

  it('labels by the first column that is not numbers and measures by the last that is', () => {
    const view = queryView(queryResult({
      columns: ['month', 'orders', 'total'],
      rows: [['2026-01', '4', '100'], ['2026-02', '9', '250']],
    }));

    // An aggregate lands at the end of a select list and an id at the front, so the LAST numeric
    // column is the length and a chart of the first would be a chart of nothing at all.
    expect(view.marks).toEqual([
      { name: '2026-01', value: 100 },
      { name: '2026-02', value: 250 },
    ]);
  });

  it('refuses a ring outright, because a statement does not say whether its figures add up', () => {
    const view = queryView(queryResult());
    expect(view.issues.donut).toContain('does not say whether its figures add up');
    expect(view.issues.ranked).toBe('');
  });

  it('adds rows that share a label together and says how many that swallowed', () => {
    const view = queryView(queryResult({
      rows: [['north', '10'], ['north', '5'], ['south', '3']],
      rowCount: 3,
    }));

    expect(view.marks).toEqual([{ name: 'north', value: 15 }, { name: 'south', value: 3 }]);
    // Adding is right for a count or a total and wrong for an average, and only the reader knows
    // which they saved -- so it is reported rather than done quietly.
    expect(view.notes.join(' ')).toContain('1 row shares a label');
  });

  it('draws no length for a negative figure, and gives that as the reason', () => {
    const view = queryView(queryResult({
      rows: [['north', '100'], ['refunds', '-40']],
    }));
    expect(view.issues.ranked).toContain('a length cannot be negative');
    expect(view.issues.bar).toContain('a length cannot be negative');
  });

  it('has nothing to label a one-column result with, and says that rather than drawing it', () => {
    const view = queryView(queryResult({
      columns: ['total'],
      rows: [['100'], ['250']],
    }));
    expect(view.marks).toEqual([]);
    expect(view.issues.ranked).toContain('one column');
  });

  it('leaves out a row with no label and a row with no number, apart', () => {
    const view = queryView(queryResult({
      rows: [['2026-01', '100'], ['', '250'], ['2026-03', 'n/a']],
      rowCount: 3,
    }));

    expect(view.marks).toEqual([{ name: '2026-01', value: 100 }]);
    const notes = view.notes.join(' ');
    // Two different facts about the data: a measurement nobody has, and a measurement of nothing
    // nameable. Neither becomes a zero.
    expect(notes).toContain('nothing that reads as a number');
    expect(notes).toContain('no value in "month"');
  });
});

describe('the chart kind a tile falls back to', () => {

  it('draws the table when the saved kind cannot carry this result', () => {
    const harness = boardWith({
      widgets: [widgetOn({ analyticsAnalysisId: 12, visualizationType: 'donut' })],
      analyses: [AVERAGED],
    });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();

    const view = harness.runOf(100).view!;
    // The saved choice is kept on the row; what is DRAWN falls back, the same way the Canvas's
    // picker moves when a result takes a kind away.
    expect(harness.board.widgets()[0].visualizationType).toBe('donut');
    expect(harness.board.drawn(harness.board.widgets()[0], view)).toBe('table');
  });

  it('keeps the saved kind when the result supports it', () => {
    const harness = boardWith({ widgets: [widgetOn({ visualizationType: 'ranked' })] });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();
    const view = harness.runOf(100).view!;
    expect(harness.board.drawn(harness.board.widgets()[0], view)).toBe('ranked');
  });

  it('treats a visualization it does not recognise as a table rather than as an error', () => {
    const harness = boardWith({ widgets: [widgetOn({ visualizationType: 'treemap' })] });
    harness.board.openDashboard(BOARD);
    harness.finishAnalysis();
    const view = harness.runOf(100).view!;
    expect(harness.board.drawn(harness.board.widgets()[0], view)).toBe('table');
  });
});

describe('the board on screen', () => {

  it('tells a reader which tiles are waiting and why they are waiting', () => {
    const rendered = renderedBoard({
      widgets: [
        widgetOn({ analyticsDashboardWidgetId: 100, visualizationType: 'table' }),
        widgetOn({ analyticsDashboardWidgetId: 101, visualizationType: 'table' }),
      ],
    });

    const screen = rendered.text();
    // Not a spinner on every tile. Two of them genuinely have not started, and saying so is the
    // difference between a slow board and a board that looks broken.
    expect(screen).toContain('Waiting its turn');
    expect(screen).toContain('Widgets run one at a time');
    expect(screen).toContain('Running 1 of 2');
  });

  it('says a result is partial, loudly, before it shows the figures', () => {
    const rendered = renderedBoard({
      widgets: [widgetOn({ visualizationType: 'table' })],
    });
    rendered.finishAnalysis(analysisResult({ truncated: true }));

    const screen = rendered.text();
    // A reader handed part of an answer and not told has a WRONG answer, not a short one.
    expect(screen).toContain('Partial result');
    expect(screen).toContain('row ceiling');
  });

  it('puts the time a figure was read beside it', () => {
    const rendered = renderedBoard({ widgets: [widgetOn({ visualizationType: 'table' })] });
    rendered.finishAnalysis();
    // Nothing on a board is a number without a time against it: the whole claim of this screen
    // is that the figures were read just now rather than remembered.
    expect(rendered.text()).toContain('ran ');
    expect(rendered.text()).toContain('2 rows');
  });

  it('draws an em dash for a null cell rather than an empty one', () => {
    const rendered = renderedBoard({ widgets: [widgetOn({ visualizationType: 'table' })] });
    rendered.finishAnalysis(analysisResult({ rows: [['north', null]], rowCount: 1 }));
    // A null is not an empty string and it is certainly not a zero.
    expect(rendered.text()).toContain('—');
  });

  it('names what each tile points at, so a title cannot be the only thing said about it', () => {
    const rendered = renderedBoard({ widgets: [widgetOn({ visualizationType: 'table' })] });
    expect(rendered.text()).toContain('Saved analysis · Revenue by region');
    expect(rendered.text()).toContain('minio-main/daily/sales-2026.csv');
  });
});

describe('the dataset registry', () => {

  function registryWith(over: {
    datasets?: RegisteredDataset[]; refusal?: string; connection?: string; path?: string;
  } = {}) {
    const fetchAllDatasets = vi.fn(() => of(SERVER_RESPONSE(over.datasets ?? [])));
    const registerDataset = vi.fn((_dataset: RegisteredDataset) => of(over.refusal
      ? SERVER_REFUSAL(over.refusal)
      : SERVER_RESPONSE({
          analyticsDatasetId: 3, datasetName: 'Sales', connectionAlias: 'minio-main',
          datasetPath: 'daily/sales-2026.csv', datasetFormat: 'CSV',
        })));
    const deleteDataset = vi.fn(() => of(SERVER_RESPONSE(undefined)));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AnalyticsService,
          useValue: { fetchAllDatasets, registerDataset, deleteDataset },
        },
        { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      ],
    });
    const fixture = TestBed.createComponent(DatasetRegistry);
    fixture.componentRef.setInput('connection', over.connection ?? 'minio-main');
    fixture.componentRef.setInput('path', over.path ?? 'daily/sales-2026.csv');
    fixture.detectChanges();
    return {
      fixture, registry: fixture.componentInstance, fetchAllDatasets, registerDataset,
      deleteDataset,
      text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' '),
    };
  }

  it('offers the file name as the name, because that is what a person calls it', () => {
    const { registry } = registryWith();
    expect(registry.suggestion()).toBe('sales-2026.csv');
  });

  it('takes its location from the screen it sits on until somebody types over it', () => {
    const { registry, fixture } = registryWith();
    expect(registry.location()).toBe('daily/sales-2026.csv');

    registry.setPath('archive/2025/*.csv');
    fixture.componentRef.setInput('path', 'daily/other.csv');
    fixture.detectChanges();

    // The host screen moved on; what the reader typed did not. A binding would have wiped it.
    expect(registry.location()).toBe('archive/2025/*.csv');
  });

  it('registers with the three fields a person decides and nothing else', () => {
    const { registry, registerDataset } = registryWith();
    registry.datasetName.set('Sales 2026');
    registry.register();

    expect(registerDataset).toHaveBeenCalledTimes(1);
    // The format is the resolver's answer, not a label the caller chooses -- a listing whose
    // format came off the wire would be a listing that lies.
    expect(Object.keys(registerDataset.mock.calls[0][0]).sort())
      .toEqual(['connectionAlias', 'datasetName', 'datasetPath']);
  });

  it('will not register without a name, an alias and a path', () => {
    const { registry, registerDataset } = registryWith({ connection: '', path: '' });
    expect(registry.canRegister()).toBe(false);
    registry.register();
    expect(registerDataset).not.toHaveBeenCalled();
  });

  it('shows the server\'s refusal verbatim rather than a friendlier version of it', () => {
    const refusal = 'Storage connection not found.';
    const { registry } = registryWith({ refusal });
    registry.datasetName.set('Sales');
    registry.register();

    // That sentence says the same thing for "no such connection" and "not yours" on purpose, so
    // registration cannot be walked to learn which aliases other workspaces hold. Paraphrasing
    // it here would invent the distinction the server spent effort refusing to make.
    expect(registry.registerError()).toBe(refusal);
  });

  it('re-reads the registry after a successful registration', () => {
    const { registry, fetchAllDatasets } = registryWith();
    expect(fetchAllDatasets).toHaveBeenCalledTimes(1);
    registry.datasetName.set('Sales');
    registry.register();
    expect(fetchAllDatasets).toHaveBeenCalledTimes(2);
    expect(registry.datasetName()).toBe('');
  });

  it('says that a registered dataset holds no data of its own', () => {
    const { text } = registryWith();
    expect(text()).toContain('no rows are scanned and no query permit is spent');
    expect(text()).toContain('deleting one never touches a file');
  });

  it('lists what this workspace has saved, with the format the server decided', () => {
    const { text } = registryWith({
      datasets: [{
        analyticsDatasetId: 1, datasetName: 'Sales 2026', connectionAlias: 'minio-main',
        datasetPath: 'daily/sales-2026.csv', datasetFormat: 'CSV',
      }],
    });
    expect(text()).toContain('Sales 2026');
    expect(text()).toContain('CSV');
    expect(text()).toContain('minio-main/daily/sales-2026.csv');
  });
});

describe('what goes on the wire', () => {

  function serviceWith() {
    const get = vi.fn((_url: string, _options?: unknown) => of(SERVER_RESPONSE(null)));
    const post = vi.fn((_url: string, _body?: unknown) => of(SERVER_RESPONSE(null)));
    const remove = vi.fn((_url: string, _options?: unknown) => of(SERVER_RESPONSE(null)));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get, post, delete: remove } }],
    });
    return { service: TestBed.inject(AnalyticsService), get, post, remove };
  }

  it('registers a dataset with three fields, and never a format or a tenant', () => {
    const { service, post } = serviceWith();
    service.registerDataset({
      datasetName: 'Sales', connectionAlias: 'minio-main', datasetPath: 'daily/s.csv',
      // Both of these are on the object and neither may travel: the server takes the format from
      // its resolver and the owner from the signed-in context.
      datasetFormat: 'PARQUET', analyticsDatasetId: 4,
    });
    expect(post.mock.calls[0][0]).toContain('/analyticsDataset.json/registerDataset');
    expect(post.mock.calls[0][1]).toEqual({
      datasetName: 'Sales', connectionAlias: 'minio-main', datasetPath: 'daily/s.csv',
    });
  });

  it('saves a dashboard without its widgets and without an empty description', () => {
    const { service, post } = serviceWith();
    service.saveDashboard({
      dashboardName: 'Month end',
      dashboardDescription: '',
      // @Transient on the row and owned by another endpoint. Posting it here would look, from
      // this side, like a save that persisted an arrangement it never touched.
      widgets: [widgetOn()],
    });
    expect(post.mock.calls[0][1]).toEqual({ dashboardName: 'Month end' });
  });

  it('carries the id on an update, so a save is an edit rather than a second board', () => {
    const { service, post } = serviceWith();
    service.saveDashboard({ analyticsDashboardId: 7, dashboardName: 'Month end' });
    expect(post.mock.calls[0][1]).toEqual({ analyticsDashboardId: 7, dashboardName: 'Month end' });
  });

  it('sends exactly one source id on a widget', () => {
    const { service, post } = serviceWith();
    service.saveWidget({
      analyticsDashboardId: 7, widgetTitle: 'Revenue', analyticsAnalysisId: 11,
      analyticsQueryId: null, visualizationType: 'ranked', displayOrder: 2,
    });
    expect(post.mock.calls[0][1]).toEqual({
      analyticsDashboardId: 7, widgetTitle: 'Revenue', analyticsAnalysisId: 11,
      visualizationType: 'ranked', displayOrder: 2,
    });
  });

  it('does not invent an empty widget config', () => {
    const { service, post } = serviceWith();
    service.saveWidget({
      analyticsDashboardId: 7, widgetTitle: 'Revenue', analyticsQueryId: 21, widgetConfig: '',
    });
    // An empty object stored to avoid a null is a null with extra steps -- the row's own words.
    expect(Object.keys(post.mock.calls[0][1] as Record<string, unknown>))
      .not.toContain('widgetConfig');
    expect(post.mock.calls[0][1]).toEqual({
      analyticsDashboardId: 7, widgetTitle: 'Revenue', analyticsQueryId: 21, displayOrder: 0,
    });
  });

  it('addresses every delete by id on the endpoint that owns it', () => {
    const { service, remove } = serviceWith();
    service.deleteDashboard(7);
    service.deleteWidget(100);
    service.deleteDataset(3);
    expect(remove.mock.calls[0][0]).toContain('/analyticsWorkspace.json/deleteDashboard');
    expect(remove.mock.calls[0][1]).toEqual({ params: { analyticsDashboardId: '7' } });
    expect(remove.mock.calls[1][1]).toEqual({ params: { analyticsDashboardWidgetId: '100' } });
    expect(remove.mock.calls[2][0]).toContain('/analyticsDataset.json/deleteDataset');
    expect(remove.mock.calls[2][1]).toEqual({ params: { analyticsDatasetId: '3' } });
  });
});

describe('the two rendering rules that exist twice in this feature', () => {

  /**
   * Both copies, on the inputs that made them necessary.
   *
   * plainDecimal and dateOnly live in analytics.ts AND in dashboard.ts, because the Studio's tab
   * strip will import the dashboard and importing back would close a cycle between two component
   * modules. The duplication is a build constraint rather than a preference, and this is what
   * keeps it honest: the day one copy is fixed and the other is not, a tile and the Canvas start
   * disagreeing about what a number is, and only this test would notice.
   */
  const DECIMALS = [
    // The measured defect: 74,661,250 read at a glance as seven point something.
    '7.466125E7',
    '1.5e-3',
    '-2.5E2',
    // Already plain, and returned untouched: "12500.00" is a currency amount with two places and
    // normalising it would throw away the scale the engine chose.
    '12500.00',
    '0',
    'north',
    '',
  ];

  const DATES = [
    // The second measured defect: a midnight on a column that has no time at all.
    '2024-01-01 00:00:00.0',
    '2024-01-01T00:00',
    // A real time under a DATE column is a contradiction, and a contradiction is shown rather
    // than tidied away.
    '2024-01-01 09:30:00',
    'not a date',
  ];

  it('expands scientific notation the same way in both copies', () => {
    for (const sample of DECIMALS) {
      expect(plainDecimal(sample)).toBe(studioPlainDecimal(sample));
    }
    expect(plainDecimal('7.466125E7')).toBe('74661250');
  });

  it('trims a phantom midnight the same way in both copies', () => {
    for (const sample of DATES) {
      expect(dateOnly(sample)).toBe(studioDateOnly(sample));
    }
    expect(dateOnly('2024-01-01 00:00:00.0')).toBe('2024-01-01');
    expect(dateOnly('2024-01-01 09:30:00')).toBe('2024-01-01 09:30:00');
  });
});

/**
 * The seven widget kinds added on 2026-09-09, and the results each one must REFUSE.
 *
 * Getting a chart to draw is the easy half. Every assertion here is about a result the kind could
 * technically render and would render a lie from, and the reason has to reach the reader: this
 * feature lists an unavailable kind with the reason on it rather than quietly omitting it.
 */
describe('the kinds a result is not allowed to be drawn as', () => {

  const twoRows = () => analysisResult();
  const manyRows = (count: number) => analysisResult({
    rows: Array.from({ length: count }, (_, at) => [`g${at}`, String(100 + at)]),
    rowCount: count,
  });

  it('offers a single figure only when there is a single figure', () => {
    // The most confidently wrong thing this list could do: draw the first of forty groups as a
    // headline. It is the right SHAPE for an answer, which is exactly why it would be believed.
    expect(analysisView(manyRows(40), 'SUM').issues.kpi).toContain('needs one row');

    const one = analysisView(analysisResult({ rows: [['north', '1200']], rowCount: 1 }), 'SUM');
    expect(one.issues.kpi).toBe('');
  });

  it('refuses a line over rank-ordered points, and says to sort by the dimension', () => {
    // Joining points that are in biggest-first order draws a curve that descends left to right
    // whatever the data did. A reader sees a trend that is an artefact of the sort.
    const ranked = analysisView(manyRows(12), 'SUM', { sortedBy: 'MEASURE' });
    expect(ranked.issues.line).toContain('show the sort rather than a trend');
    expect(ranked.issues.area).toContain('show the sort rather than a trend');

    const ordered = analysisView(manyRows(12), 'SUM', { sortedBy: 'DIMENSION' });
    expect(ordered.issues.line).toBe('');
    expect(ordered.issues.area).toBe('');
  });

  it('refuses a line of one point', () => {
    const single = analysisView(analysisResult({ rows: [['north', '1200']], rowCount: 1 }),
      'SUM', { sortedBy: 'DIMENSION' });
    expect(single.issues.line).toContain('at least two points');
  });

  it('refuses a filled area over negatives, but allows the bare line', () => {
    // A fill reads as magnitude accumulated up from a baseline. Below it that reading inverts and
    // the shading covers the wrong side of the axis.
    const refunds = analysisView(analysisResult({
      rows: [['jan', '1200'], ['feb', '-400'], ['mar', '900']], rowCount: 3,
    }), 'SUM', { sortedBy: 'DIMENSION' });

    expect(refunds.issues.area).toContain('measures up from a baseline');
    expect(refunds.issues.line).toBe('');
  });

  it('refuses a stack without a second dimension to divide the bars by', () => {
    const flat = analysisView(twoRows(), 'SUM', { sortedBy: 'DIMENSION', dimensionCount: 1 });
    expect(flat.issues.stacked).toContain('needs a second dimension');

    const crossed = analysisView(twoRows(), 'SUM', { sortedBy: 'DIMENSION', dimensionCount: 2 });
    expect(crossed.issues.stacked).toBe('');
  });

  it('refuses a stack of averages, because they do not add up', () => {
    // The same rule the ring already keeps, and for the same reason: a stack asserts that its
    // parts make the whole.
    const averages = analysisView(twoRows(), 'AVERAGE', { dimensionCount: 2 });
    expect(averages.issues.stacked).toContain('does not add up');
  });

  it('refuses a histogram of a handful of figures', () => {
    // With six groups a distribution is a bar chart that has thrown its labels away.
    expect(analysisView(manyRows(6), 'SUM').issues.histogram).toContain('says less than the bars');
    expect(analysisView(manyRows(20), 'SUM').issues.histogram).toBe('');
  });

  it('refuses a scatter against a categorical dimension', () => {
    // Both axes have to be quantities. Spacing categories evenly along x would draw a shape that
    // says something about the alphabet.
    expect(analysisView(manyRows(10), 'SUM').issues.scatter).toContain('is a category');

    const numeric = analysisView(analysisResult({
      rows: [['1', '1200'], ['2', '800'], ['3', '400']], rowCount: 3,
    }), 'SUM');
    expect(numeric.issues.scatter).toBe('');
  });

  it('compares exactly two figures, not one and not three', () => {
    expect(analysisView(manyRows(3), 'SUM').issues.comparison).toContain('exactly two rows');
    expect(analysisView(twoRows(), 'SUM').issues.comparison).toBe('');
  });

  it('still refuses everything categorical when there is nothing to draw', () => {
    // The pre-existing rule, re-checked against the new kinds: a result with no drawable marks
    // gives every chart the same reason, and only the table survives.
    const empty = analysisView(analysisResult({ rows: [], rowCount: 0 }), 'SUM');
    expect(empty.issues.table).toBe('');
    for (const kind of ['line', 'area', 'stacked', 'histogram', 'scatter', 'comparison'] as const) {
      expect(empty.issues[kind], kind).not.toBe('');
    }
  });
});

/**
 * Two bugs the new kinds exposed in code that already worked for four.
 *
 * Both are the same shape: a list written when there were four kinds, which kept working and
 * kept being wrong once there were eleven. Neither would have failed a test that only ever asked
 * about tables, bars, rings and rankings.
 */
describe('what the tile draws, and what it says it drew', () => {

  it('draws a kind the picker offered, instead of falling back to the table', () => {
    // drawn() named the four kinds it knew. Every kind added after it was accepted by the picker,
    // stored on the widget, shown as selected -- and silently drawn as a table. The picker and
    // the drawing disagreed, and the picker was the one telling the truth.
    const harness = boardWith({ widgets: [widgetOn({ visualizationType: 'line' })] });
    const view = analysisView(analysisResult({
      rows: [['jan', '10'], ['feb', '20'], ['mar', '30']], rowCount: 3,
    }), 'SUM', { sortedBy: 'DIMENSION' });

    expect(harness.board.drawn(widgetOn({ visualizationType: 'line' }), view)).toBe('line');
  });

  it('still falls back to the table when the kind cannot honestly draw this result', () => {
    // Deliberate and staying: a saved widget outlives the data it was built on, and a tile whose
    // analysis has since returned forty groups should show them rather than an empty ring.
    const harness = boardWith({ widgets: [widgetOn({ visualizationType: 'line' })] });
    const ranked = analysisView(analysisResult({
      rows: [['a', '30'], ['b', '20']], rowCount: 2,
    }), 'SUM', { sortedBy: 'MEASURE' });

    expect(harness.board.drawn(widgetOn({ visualizationType: 'line' }), ranked)).toBe('table');
  });

  it('counts what the DRAWN kind renders, not what the table would', () => {
    // "8 of 24 rows shown" under a chart with twenty-four bars in it tells a reader they are
    // seeing a third of the data while they are seeing all of it.
    const harness = boardWith({ widgets: [widgetOn()] });
    const view = analysisView(analysisResult({
      rows: Array.from({ length: 24 }, (_, at) => [`m${at}`, String(at + 1)]),
      rowCount: 24,
    }), 'SUM');

    expect(harness.board.counted(view, 'table')).toBe('8 of 24 rows shown');
    expect(harness.board.counted(view, 'bar')).toBe('24 rows');
    expect(harness.board.counted(view, 'ranked')).toBe('24 rows');
  });

  it('says no rows when there are none, whatever kind is drawn', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    const empty = analysisView(analysisResult({ rows: [], rowCount: 0 }), 'SUM');

    expect(harness.board.counted(empty, 'table')).toBe('No rows.');
    expect(harness.board.counted(empty, 'bar')).toBe('No rows.');
  });
});

describe('what a single-figure tile says it showed', () => {
  it('counts the one row it renders, not the marks it does not have', () => {
    // An analysis with no dimension produces no marks, so counting marks printed
    // "0 of 1 rows shown" under a tile displaying that row in 30-point type.
    const harness = boardWith({ widgets: [widgetOn({ visualizationType: 'kpi' })] });
    const single = analysisView(analysisResult({
      columns: [{ name: 'amount_sum', type: 'DECIMAL(18,3)', role: 'MEASURE' }],
      rows: [['103909527.58']],
      rowCount: 1,
      measure: 'amount_sum',
    }), 'SUM');

    expect(single.marks).toEqual([]);
    expect(harness.board.counted(single, 'kpi')).toBe('1 row');
  });
});

describe('the three summary kinds', () => {
  const series = (count: number) => analysisResult({
    rows: Array.from({ length: count }, (_, at) => [`m${at}`, String(100 + at * 10)]),
    rowCount: count,
  });

  it('describes the groups only when there is more than one', () => {
    expect(analysisView(series(1), 'SUM').issues.dimensionSummary)
      .toContain('more than one of them');
    expect(analysisView(series(6), 'SUM').issues.dimensionSummary).toBe('');
  });

  it('refuses a trend summary over rank-ordered points', () => {
    // Against a biggest-first result "first" is just the biggest, so first-against-last would
    // describe the sort. Same rule the line keeps, and for the same reason.
    expect(analysisView(series(6), 'SUM', { sortedBy: 'MEASURE' }).issues.trendSummary)
      .toContain('describe the sort rather than the series');
    expect(analysisView(series(6), 'SUM', { sortedBy: 'DIMENSION' }).issues.trendSummary).toBe('');
  });

  it('refuses to describe a spread of fewer than three figures', () => {
    expect(analysisView(series(2), 'SUM').issues.distributionSummary).toContain('needs more');
    expect(analysisView(series(3), 'SUM').issues.distributionSummary).toBe('');
  });

  it('carries whether the measure adds up, so a top share is only claimed when there is a total', () => {
    // The summary states "top share of the total". An average of averages has no total, and the
    // component withholds that one fact rather than the whole tile.
    expect(analysisView(series(6), 'SUM').additive).toBe(true);
    expect(analysisView(series(6), 'AVERAGE').additive).toBe(false);
    expect(analysisView(series(6), 'MEDIAN').additive).toBe(false);
  });

  it('never claims a saved query adds up', () => {
    // A saved query does not say whether its figures are a total, which is why the ring is
    // refused for one. The summary withholds the share on the same grounds.
    const view = queryView({
      columns: [{ name: 'region', type: 'VARCHAR' }, { name: 'total', type: 'BIGINT' }],
      rows: [['north', '10'], ['south', '20']],
      rowCount: 2,
      truncated: false,
    } as any);
    expect(view.additive).toBe(false);
  });
});

describe('finding a report among many', () => {
  it('collapses the list when a report is opened', () => {
    // Twenty-eight entries at full height pushed every widget below the fold, so opening a
    // report showed a list of reports.
    const harness = boardWith({ widgets: [widgetOn()] });
    expect(harness.board.listOpen()).toBe(true);

    harness.board.openDashboard(BOARD);

    expect(harness.board.listOpen()).toBe(false);
  });

  it('narrows by name and by description', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.dashboards.set([
      { analyticsDashboardId: 1, dashboardName: '01 Overall KPI summary',
        dashboardDescription: 'the whole file in six numbers' },
      { analyticsDashboardId: 2, dashboardName: '15 Regional analysis',
        dashboardDescription: 'one region at a time' },
    ] as any);

    harness.board.listFilter.set('regional');
    expect(harness.board.visibleDashboards().map(d => d.analyticsDashboardId)).toEqual([2]);

    // The description is searched too: people remember what a report was for more often than
    // they remember what somebody called it.
    harness.board.listFilter.set('six numbers');
    expect(harness.board.visibleDashboards().map(d => d.analyticsDashboardId)).toEqual([1]);
  });

  it('shows everything when the filter is empty or blank', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.dashboards.set([
      { analyticsDashboardId: 1, dashboardName: 'a' },
      { analyticsDashboardId: 2, dashboardName: 'b' },
    ] as any);

    harness.board.listFilter.set('   ');
    expect(harness.board.visibleDashboards()).toHaveLength(2);
  });
});


/**
 * The board filter: one set of conditions over every widget that reads the same dataset.
 *
 * The combination rule is tested as a pure function because its failure has NO VISIBLE SYMPTOM --
 * a tile narrowed by the wrong predicate draws a perfectly ordinary chart of the wrong rows.
 */
describe('combining a board filter with a widget own filters', () => {

  const north = { field: 'region', operator: 'EQ' as const, value: 'north' };
  const south = { field: 'region', operator: 'EQ' as const, value: 'south' };
  const march = { field: 'month', operator: 'EQ' as const, value: '3' };

  it('sends exactly what it always did when there is no board filter', () => {
    const saved = { op: 'AND' as const, clauses: [north] };
    expect(combineFilters(saved, null)).toEqual(saved);
    expect(combineFilters(saved, { op: 'AND', clauses: [] })).toEqual(saved);
  });

  it('sends the board filter alone when the widget has none of its own', () => {
    const board = { op: 'AND' as const, clauses: [march] };
    expect(combineFilters(undefined, board)).toEqual(board);
  });

  it('emits nothing at all when both are empty', () => {
    // Not an empty group: the server refuses one outright -- "A filter group needs at least one
    // condition in it" -- so wrapping nothing would turn every tile into an error the moment
    // somebody opened the bar and typed nothing.
    expect(combineFilters(undefined, null)).toBeUndefined();
    expect(combineFilters({ op: 'AND', clauses: [] }, { op: 'AND', clauses: [] }))
      .toBeUndefined();
  });

  it('keeps an OR group WHOLE, which is the one that has no visible symptom', () => {
    // Spreading "region = north OR region = south" into a top-level AND alongside the board's
    // condition turns it into "north OR (south AND march)" -- a different question wearing the
    // same words, drawn as a perfectly ordinary chart.
    const either = { op: 'OR' as const, clauses: [north, south] };
    const board = { op: 'AND' as const, clauses: [march] };

    const combined = combineFilters(either, board);

    expect(combined).toEqual({ op: 'AND', clauses: [either, board] });
    expect(combined!.clauses[0]).toEqual(either);
  });

  it('prunes both halves, so a half-typed condition cannot reach the wire', () => {
    // A BETWEEN with one bound is not a predicate. The server would refuse the group it sat in.
    const halfTyped = {
      op: 'AND' as const,
      clauses: [north, { field: 'amount', operator: 'BETWEEN' as const, values: ['10'] }],
    };
    const combined = combineFilters(halfTyped, { op: 'AND', clauses: [] });
    expect(combined).toEqual({ op: 'AND', clauses: [north] });
  });
});

describe('what the board filter costs, and what it says', () => {

  it('running nothing is the point: editing the bar issues no query at all', () => {
    // The invariant this component exists to protect. Ten widgets is ten governed queries against
    // a server that runs four at a time, and a bar that re-ran as somebody typed would be exactly
    // the denial of service the serial queue was built to prevent. It has no symptom until a
    // board is big.
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.openDashboard(BOARD);
    const before = harness.api.analyze.mock.calls.length;

    harness.board.boardFilter.set({
      op: 'AND', clauses: [{ field: 'region', operator: 'EQ', value: 'north' }],
    });
    harness.board.boardFilter.set({
      op: 'AND', clauses: [{ field: 'region', operator: 'EQ', value: 'south' }],
    });

    expect(harness.api.analyze.mock.calls.length).toBe(before);
  });

  it('changing the dataset clears the filter, because the columns just changed', () => {
    // A condition naming a column the new dataset does not have is a hard refusal from the
    // server, landing on every tile at once.
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.boardFilterOn.set('minio-main a.csv');
    harness.board.boardFilter.set({
      op: 'AND', clauses: [{ field: 'region', operator: 'EQ', value: 'north' }],
    });

    harness.board.chooseFilterDataset('minio-main b.csv');

    expect(harness.board.boardFilter().clauses).toEqual([]);
  });

  it('says nothing when no board filter is on', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    expect(harness.board.boardFilterNote(widgetOn())).toBe('');
  });

  it('tells a saved-query tile that there is no filter to give it', () => {
    // The query endpoint takes SQL and nothing else, and composing a WHERE around somebody own
    // statement is precisely the string-building the structured path exists to avoid.
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.boardFilterOn.set('minio-main a.csv');
    harness.board.boardFilter.set({
      op: 'AND', clauses: [{ field: 'region', operator: 'EQ', value: 'north' }],
    });

    const note = harness.board.boardFilterNote(
      widgetOn({ analyticsAnalysisId: undefined, analyticsQueryId: 5 }));

    expect(note).toContain('takes SQL and nothing else');
  });
});
