import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import {
  Dashboards, DatasetRegistry, analysisView, dateOnly, plainDecimal, queryView, combineFilters } from './dashboard';
import { dateOnly as studioDateOnly, plainDecimal as studioPlainDecimal } from './analytics';
import { CHART_SLOTS } from '../../shared/charts/status-color';
import { KIND_IDS } from './widget-kinds';
import { WidgetChart } from './widget-chart';

/** The result-to-chart adapters moved to WidgetChart; a bare instance answers them without a view. */
function chart(): WidgetChart { return TestBed.runInInjectionContext(() => new WidgetChart()); }
import {
  AnalysisResult, AnalyticsService, Dashboard, DashboardWidget, FilterGroup, QueryResult,
  RegisteredDataset, SavedAnalysis, SavedQuery,
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
      provideRouter([]),
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

    // One past the palette, whatever the palette currently holds. Seven slices used to be the
    // refusal; the ramp now has eight slots, so seven is drawable and only the ninth is not.
    const tooMany = CHART_SLOTS + 1;
    const many = analysisView(analysisResult({
      rows: Array.from({ length: tooMany }, (_, at) => [`region-${at}`, '10']),
      rowCount: tooMany,
    }), 'SUM');
    expect(many.issues.donut).toContain(`${CHART_SLOTS} colours`);
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

  it('keeps every row it was given, so the rows past the tile are still reachable', () => {
    const view = analysisView(analysisResult({
      rows: Array.from({ length: 30 }, (_, at) => [`r${at}`, '1']),
      rowCount: 30,
    }), 'SUM');

    // The view used to slice to eight here, which threw rows 9..30 away on the tick they
    // arrived -- they had already crossed the wire and been parsed. Reading row 9 then meant
    // leaving the board and spending a second permit on the identical query. The tile still
    // draws eight; the cut belongs to the tile, not to the result.
    expect(view.rows.length).toBe(30);
    expect(view.rowCount).toBe(30);
  });

  it('draws only a tile\'s worth, and counts the whole result under them', () => {
    const board = TestBed.runInInjectionContext(() => new Dashboards());
    const view = analysisView(analysisResult({
      rows: Array.from({ length: 30 }, (_, at) => [`r${at}`, '1']),
      rowCount: 30,
    }), 'SUM');

    expect(board.tileRows(view).length).toBe(8);
    expect(board.hasMoreRows(view)).toBe(true);
    // The sentence under the tile counts what is DRAWN against the whole result -- not the
    // length of the rows array, which is now the whole result itself.
    expect(board.counted(view, 'table')).toBe('8 of 30 rows shown');
  });

  it('does not offer a way out of a result the tile is already showing whole', () => {
    const view = analysisView(analysisResult({
      rows: Array.from({ length: 3 }, (_, at) => [`r${at}`, '1']),
      rowCount: 3,
    }), 'SUM');
    const board = TestBed.runInInjectionContext(() => new Dashboards());

    expect(board.hasMoreRows(view)).toBe(false);
    expect(board.counted(view, 'table')).toBe('3 rows');
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

  /**
   * `select region, avg(order_value) ...` and `select region, sum(order_value) ...` return the
   * identical shape, so additivity is UNKNOWN on this path -- and that one unknown disqualifies
   * every kind that totals, not only the ring. The ring alone used to be taken back out, one line
   * after issuesFor had been told the figures add up, so a column of four regional averages was
   * offered "Ranked bars with share" and printed 23% / 18% / 47% / 12% of a 515 that is a sum of
   * means: a denominator that exists nowhere in the data.
   */
  it('refuses every kind that totals, not only the ring', () => {
    const averages = queryView(queryResult({
      columns: ['region', 'avg_order'],
      rows: [['north', '120'], ['south', '95'], ['east', '240'], ['west', '60']],
      rowCount: 4,
    }));

    for (const kind of ['donut', 'rankedShare', 'cumulative', 'stacked', 'shareStacked'] as const) {
      expect(averages.issues[kind], kind).toContain('does not say whether its figures add up');
    }
    // The kinds that claim nothing about a total are untouched: a length against a shared axis is
    // drawable whether or not the lengths add up to anything.
    expect(averages.issues.ranked).toBe('');
    expect(averages.issues.bar).toBe('');
  });

  it('draws the table instead when a tile was saved as a share chart', () => {
    const averages = queryView(queryResult({
      columns: ['region', 'avg_order'],
      rows: [['north', '120'], ['south', '95'], ['east', '240'], ['west', '60']],
      rowCount: 4,
    }));
    const board = boardWith().board;

    // The refusal has to reach the drawing, not only the picker: a widget saved as rankedShare
    // before the gate existed would otherwise still render percentages of a total of averages.
    expect(board.drawn(widgetOn({ visualizationType: 'rankedShare' }), averages)).toBe('table');
    expect(board.drawn(widgetOn({ visualizationType: 'ranked' }), averages)).toBe('ranked');
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

/**
 * A line tile has no y axis. Each point's hover text is the ONLY place a figure appears on it, so
 * whatever formats that text is the whole numeric readout of the chart.
 *
 * Unbound, LineChart falls back to compactNumber, whose sub-1000 branch is String(Math.round) --
 * so a series of monthly averages at 4.35, 4.12 and 3.98 hovered as "4", "4" and "4" while the
 * line visibly fell, and a set of rates at 0.42/0.38/0.11 read "0" three times. The bar and
 * stacked tiles over the same result pass `figure` and read faithfully, so two tiles over one
 * result disagreed. The exact figure was unreachable from the line.
 */
describe('the only numeric readout a line tile has', () => {

  /**
   * Sorted by the DIMENSION, which is the only sort a line, an area or a running total is offered
   * over -- joining rank-ordered points draws the shape of the sort. Both fixtures group by month
   * so all three kinds are on the table.
   */
  const AVERAGE_BY_MONTH: SavedAnalysis = {
    ...ANALYSIS,
    analyticsAnalysisId: 31,
    analysisName: 'Average rating by month',
    analysisConfig: JSON.stringify({
      dimensions: ['month'],
      measure: { aggregation: 'AVERAGE', field: 'rating' },
      sort: { by: 'DIMENSION', direction: 'ASC' },
    }),
  };

  const TOTAL_BY_MONTH: SavedAnalysis = {
    ...ANALYSIS,
    analyticsAnalysisId: 32,
    analysisName: 'Revenue by month',
    analysisConfig: JSON.stringify({
      dimensions: ['month'],
      measure: { aggregation: 'SUM', field: 'amount' },
      sort: { by: 'DIMENSION', direction: 'ASC' },
    }),
  };

  /** Monthly averages, which is where the rounding is the whole of the answer. */
  const RATINGS = analysisResult({
    columns: [
      { name: 'month', type: 'VARCHAR', role: 'DIMENSION' },
      { name: 'avg_rating', type: 'DOUBLE', role: 'MEASURE' },
    ],
    rows: [['2026-01', '4.35'], ['2026-02', '4.12'], ['2026-03', '3.98']],
    rowCount: 3,
    measure: 'avg_rating',
  });

  function pointText(rendered: ReturnType<typeof renderedBoard>): string[] {
    rendered.fixture.detectChanges();
    return Array.from((rendered.fixture.nativeElement as HTMLElement)
      .querySelectorAll('app-line-chart circle title'))
      .map(node => (node.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  it('states each point of a line faithfully, rather than rounding it to nothing', () => {
    const rendered = renderedBoard({
      widgets: [widgetOn({ analyticsAnalysisId: 31, visualizationType: 'line' })],
      analyses: [AVERAGE_BY_MONTH],
    });
    rendered.finishAnalysis(RATINGS);

    expect(pointText(rendered))
      .toEqual(['2026-01: 4.35', '2026-02: 4.12', '2026-03: 3.98']);
  });

  it('does the same for the filled variant, which is the same chart', () => {
    const rendered = renderedBoard({
      widgets: [widgetOn({ analyticsAnalysisId: 31, visualizationType: 'area' })],
      analyses: [AVERAGE_BY_MONTH],
    });
    rendered.finishAnalysis(RATINGS);

    expect(pointText(rendered))
      .toEqual(['2026-01: 4.35', '2026-02: 4.12', '2026-03: 3.98']);
  });

  it('states the total a running total reaches, which is the point of the curve', () => {
    // The worst of the three to round: compactNumber renders a closing total of 350.75 as "351",
    // and a real one of 1,247,830 as "1.2M".
    const rendered = renderedBoard({
      widgets: [widgetOn({ analyticsAnalysisId: 32, visualizationType: 'cumulative' })],
      analyses: [TOTAL_BY_MONTH],
    });
    rendered.finishAnalysis(analysisResult({
      columns: [
        { name: 'month', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['2026-01', '100.5'], ['2026-02', '250.25']],
      rowCount: 2,
    }));

    expect(pointText(rendered)).toEqual(['2026-01: 100.5', '2026-02: 350.75']);
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

  it('refuses a line, an area and a trend over two dimensions, which interleave two series', () => {
    // stacked and shareStacked read dimensionCount two lines below these and these did not, so a
    // 2-D result was offered a line -- and the marks arrive interleaved (jan/north, jan/south,
    // feb/north, feb/south), which draws a sawtooth between two unrelated series. The trend
    // summary was worse: it stated a "change" between two points of that interleaving.
    const crossed = analysisView(twoRows(), 'SUM', { sortedBy: 'DIMENSION', dimensionCount: 2 });

    expect(crossed.issues.line).toContain('two dimensions');
    expect(crossed.issues.area).toContain('two dimensions');
    expect(crossed.issues.trendSummary).toContain('two dimensions');

    // One dimension is still a line, which is the point of the guard being on the count.
    const flat = analysisView(twoRows(), 'SUM', { sortedBy: 'DIMENSION', dimensionCount: 1 });
    expect(flat.issues.line).toBe('');
  });

  it('offers a share over ranked bars where the ring refuses only for want of colours', () => {
    // The ring was the only share chart, and it stops at the palette. Bars label themselves, so
    // "what share does each of these forty rows carry" now has a chart.
    const many = analysisView(manyRows(40), 'SUM', { sortedBy: 'MEASURE' });
    expect(many.issues.donut).toContain('colours this palette can tell apart');
    expect(many.issues.rankedShare).toBe('');
  });

  it('refuses a share over rows that are not the whole of anything', () => {
    const trimmed = analysisView(manyRows(10), 'SUM', { sortedBy: 'MEASURE', topNTrimmed: true });
    expect(trimmed.issues.rankedShare).toContain('not the whole of anything');

    const averages = analysisView(manyRows(10), 'AVERAGE', { sortedBy: 'MEASURE' });
    expect(averages.issues.rankedShare).toContain('no total to divide');
  });

  it('accumulates a running total in the dimension\'s own order', () => {
    const view = analysisView(analysisResult({
      rows: [['jan', '100'], ['feb', '250'], ['mar', '50']], rowCount: 3,
    }), 'SUM', { sortedBy: 'DIMENSION' });
    const board = TestBed.runInInjectionContext(() => new Dashboards());

    expect(view.issues.cumulative).toBe('');
    expect((chart() as any).cumulativePoints(view).map((p: any) => p.value)).toEqual([100, 350, 400]);
  });

  it('refuses a running total over a rank order, which draws the shape of the sort', () => {
    const ranked = analysisView(manyRows(10), 'SUM', { sortedBy: 'MEASURE' });
    expect(ranked.issues.cumulative).toContain('biggest-first');

    // And over a measure that does not add up: accumulating averages is not a quantity.
    const averages = analysisView(manyRows(10), 'AVERAGE', { sortedBy: 'DIMENSION' });
    expect(averages.issues.cumulative).toContain('does not add up');
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

describe('stacked bars and the share within each group', () => {

  function crossTab() {
    return analysisView(analysisResult({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'status', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
      ],
      rows: [
        ['north', 'shipped', '300'], ['north', 'returned', '100'],
        ['south', 'returned', '50'], ['south', 'shipped', '50'],
      ],
      dimensions: ['region', 'status'],
    }), 'SUM', { dimensionCount: 2 });
  }

  it('counts a cross-tab in groups, not in the source rows behind them', () => {
    const board = TestBed.runInInjectionContext(() => new Dashboards());
    // The grid is composed by the SERVER and arrives on the result; nothing here derives it.
    const view = analysisView(analysisResult({
      rows: [['north', 'shipped', '300'], ['south', 'shipped', '50']],
      dimensions: ['region', 'status'],
      pivot: {
        rowDimension: 'region', columnDimension: 'status',
        columnValues: ['shipped', 'returned'],
        rows: [
          { key: 'north', cells: ['300', '100'] },
          { key: 'south', cells: ['50', null] },
        ],
        columnsTruncated: false,
      },
    }), 'SUM', { dimensionCount: 2, hasPivot: true });

    // The grid is what a cross-tab shows. Counting marks printed "0 of N rows shown" under a grid
    // that was showing everything, and counting source rows would describe the rows the grid was
    // built from rather than the cells on screen.
    expect(view.pivot?.rows?.length).toBe(2);
    expect(board.counted(view, 'pivot')).toBe('2 groups');

    // And the tile caps the grid like every other table here, rather than growing without bound.
    expect(chart().pivotRows(view.pivot!).length).toBe(2);
  });

  it('gives one category the same colour in every bar', () => {
    // The colour used to be the segment's INDEX within its own bar, so "returned" was chart-0 in
    // south (where it happens to come first) and chart-1 in north. The legend a reader builds
    // from the first bar is then wrong for every other bar -- worse than no colour, because the
    // chart looks like it encodes something and encodes position.
    const board = boardWith({ widgets: [widgetOn()] }).board;
    const bars = (chart() as any).stacks(crossTab());

    const colourIn = (name: string, label: string) =>
      bars.find((bar: any) => bar.name === name).segments
        .find((segment: any) => segment.label === label).color;

    expect(colourIn('north', 'returned')).toBe(colourIn('south', 'returned'));
    expect(colourIn('north', 'shipped')).not.toBe(colourIn('north', 'returned'));
  });

  it('normalises each bar to its own total for the share view', () => {
    const board = boardWith({ widgets: [widgetOn()] }).board;
    const bars = (chart() as any).shareStacks(crossTab());

    // Every bar full height, so the eye compares the MIX rather than the size.
    expect(bars.map((bar: any) => bar.value)).toEqual([100, 100]);
    const north = bars.find((bar: any) => bar.name === 'north');
    expect(north.segments.find((s: any) => s.label === 'shipped').value).toBe(75);
    expect(north.segments.find((s: any) => s.label === 'returned').value).toBe(25);
    // South is half the size of north and its mix is 50/50, which is the fact a stack of raw
    // totals cannot show.
    const south = bars.find((bar: any) => bar.name === 'south');
    expect(south.segments.map((s: any) => s.value)).toEqual([50, 50]);
  });

  it('leaves a group that sums to nothing alone rather than dividing by it', () => {
    const board = boardWith({ widgets: [widgetOn()] }).board;
    const view = analysisView(analysisResult({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'status', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
      ],
      rows: [['north', 'shipped', '0'], ['north', 'returned', '0']],
      dimensions: ['region', 'status'],
    }), 'SUM', { dimensionCount: 2 });

    const bars = (chart() as any).shareStacks(view);
    expect(bars[0].value).toBe(0);
  });
});

describe('which kinds a result may honestly be drawn as', () => {

  it('refuses a line, an area and a trend over a dimension sorted backwards', () => {
    // "dimension, Z-A" is one click and an entirely reasonable choice for a date -- newest first,
    // which is how anybody wanting the latest month at the top of the table would sort. The gate
    // saw only the AXIS, called it dimension-ordered, and offered all three: time ran right to
    // left, and the trend summary printed "Change -40.0% ... down" over a year that rose 67%.
    const backwards = analysisView(analysisResult({
      rows: [['2024-12', '1000000'], ['2024-01', '600000']],
      dimensions: ['order_month'],
    }), 'SUM', { sortedBy: 'DIMENSION', sortDirection: 'DESC' });

    expect(backwards.issues.line).toContain('backwards');
    expect(backwards.issues.area).toContain('backwards');
    expect(backwards.issues.trendSummary).toContain('the wrong way round');

    // Ascending is the same result read the right way, and draws.
    const forwards = analysisView(analysisResult({
      rows: [['2024-01', '600000'], ['2024-12', '1000000']],
      dimensions: ['order_month'],
    }), 'SUM', { sortedBy: 'DIMENSION', sortDirection: 'ASC' });

    expect(forwards.issues.line).toBe('');
    expect(forwards.issues.trendSummary).toBe('');
  });

  it('refuses a share when the Top-N threw its tail away', () => {
    // With includeOther off the server emits no roll-up row, so five rows of a forty-region
    // dataset are indistinguishable from a dataset with five regions. Every percentage drawn from
    // them is a share of the retained subset wearing the shape of a share of the whole.
    const trimmed = analysisView(analysisResult(), 'SUM', { topNTrimmed: true });

    expect(trimmed.issues.donut).toContain('not the whole of anything');
    expect(trimmed.topNTrimmed).toBe(true);
    // And the tile says so in its own words, because nothing in the RESULT says it.
    expect(trimmed.notes.join(' ')).toContain('not shares of the dataset');

    // The same rows with the bucket ON are a whole, and the ring is offered.
    expect(analysisView(analysisResult(), 'SUM').issues.donut).toBe('');
  });

  it('offers the cross-tab only when the server composed a grid', () => {
    const flat = analysisView(analysisResult(), 'SUM', { hasPivot: false });
    expect(flat.issues.pivot).toContain('exactly two dimensions');

    const wide = analysisView(analysisResult(), 'SUM',
      { hasPivot: false, pivotTruncated: true });
    expect(wide.issues.pivot).toContain('exactly two dimensions');

    const grid = analysisView(analysisResult(), 'SUM', { hasPivot: true });
    expect(grid.issues.pivot).toBe('');
  });
});

describe('formatting a result cell', () => {

  it('groups a measure and leaves a dimension exactly as it is', () => {
    // The defect: readable() groups an integer, which is right for money and rewrites a label.
    // A year column printed "2,024" in this table while the chart beside it -- which never
    // touches readableCell -- printed "2024", from the same row of the same result.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'order_year', type: 'BIGINT', role: 'DIMENSION' },
        { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
      ],
      rows: [['2024', '250000']],
      dimensions: ['order_year'],
    }), 'SUM');

    expect(view.measureColumn).toEqual([false, true]);
  });

  it('marks every column of a saved query as formattable, because it has no roles to read', () => {
    // Not an oversight. The server renders every value to text before a query result leaves, so a
    // column of digits here could be a figure or a label and nothing distinguishes them.
    const view = queryView(queryResult());

    expect(view.measureColumn).toEqual([true, true]);
  });
});

/**
 * Clicking a bar to narrow every other tile.
 *
 * The feature is one gesture and three refusals, and the refusals are the half worth testing. A
 * mark is only a filter operand when it names exactly one group of the underlying rows, and there
 * are three ordinary ways it does not: the dimension was bucketed by a date grain, so the drawn
 * "2024-03-01" stands for a whole month; two rows RENDERED to the same label and were added
 * together, so the bar is not any one row's; or the value is null, which no `=` will ever match.
 *
 * Each of those produces a chart that would look completely correct and answer a different
 * question, which is why the check is on the operands rather than on the drawn label -- and why
 * `narrows` un-buttons the chart instead of explaining itself after the click.
 */
describe('narrowing the board by clicking a mark', () => {

  it('carries the raw value behind each mark, not the rendered one', () => {
    const view = analysisView(analysisResult({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['north', '1200.500'], ['south', '800.000']],
      dimensions: ['region'],
    }), 'SUM');

    expect(view.marks.map(mark => mark.operands)).toEqual([
      [{ field: 'region', value: 'north' }],
      [{ field: 'region', value: 'south' }],
    ]);
  });

  it('refuses a grained date, whose bar stands for a whole bucket', () => {
    // The bar says "2024-03-01" and MEANS March. `booked_on = '2024-03-01'` would hand back the
    // first of the month -- a thirtieth of the bar that was clicked, drawn as an ordinary chart.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'booked_on', type: 'TIMESTAMP', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['2024-03-01 00:00:00', '1200'], ['2024-04-01 00:00:00', '900']],
      dimensions: ['booked_on'],
      grains: ['MONTH'],
    }), 'SUM');

    expect(view.marks.length).toBe(2);
    expect(view.marks.every(mark => mark.operands === undefined)).toBe(true);
  });

  it('allows the same column when nothing grained it', () => {
    // The positive control for the test above: a refusal that applied to every date column would
    // pass that assertion while taking the feature away from half the boards that could use it.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'booked_on', type: 'DATE', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['2024-03-01', '1200'], ['2024-03-02', '900']],
      dimensions: ['booked_on'],
      grains: [null],
    }), 'SUM');

    expect(view.marks[0].operands).toEqual([{ field: 'booked_on', value: '2024-03-01' }]);
  });

  it('drops the operands of a mark two rows were merged into', () => {
    // A numeric dimension whose values arrive in two spellings. DuckDB writes a DOUBLE in
    // scientific notation once it is large enough, so "1E2" and "100" are the same number written
    // differently, and plainDecimal renders both as "100" -- correctly, and into ONE bar. That bar
    // is neither row's: `bucket = '1E2'` and `bucket = '100'` each return half of what is drawn.
    // The case the grain check cannot catch, because nothing here was grained.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'bucket', type: 'DOUBLE', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['1E2', '100'], ['100', '150'], ['200', '90']],
      dimensions: ['bucket'],
      grains: [null],
    }), 'SUM');

    const merged = view.marks.find(mark => mark.value === 250);
    expect(merged).toBeDefined();
    expect(merged!.name).toBe('100');
    expect(merged!.operands).toBeUndefined();
    // And the row that was not merged keeps its own, so the check is on the merge and not on the
    // column type.
    expect(view.marks.find(mark => mark.value === 90)!.operands)
      .toEqual([{ field: 'bucket', value: '200' }]);
  });

  it('refuses a null dimension, which no equals will ever match', () => {
    const view = analysisView(analysisResult({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['north', '1200'], [null, '800']],
      dimensions: ['region'],
    }), 'SUM');

    expect(view.marks.find(mark => mark.name === '(null)')!.operands).toBeUndefined();
  });

  it('refuses the rolled-up Other row, which is not a value in the data', () => {
    // A Top-N result carries one row standing for everything outside the top N. It is not a
    // category: `sub_category = 'Other'` narrows the board to nothing. The server refuses to DRILL
    // into it for the same reason, and this is the same refusal one screen earlier.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'sub_category', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['Cameras', '1200'], ['Other', '800']],
      dimensions: ['sub_category'],
      other: { label: 'Other', values: ['Lenses', 'Tripods'], valueCount: 14,
               valuesTruncated: false },
    }), 'SUM');

    expect(view.marks.find(mark => mark.name === 'Other')!.operands).toBeUndefined();
    // The real category beside it still clicks, so this refuses the roll-up rather than the chart.
    expect(view.marks.find(mark => mark.name === 'Cameras')!.operands)
      .toEqual([{ field: 'sub_category', value: 'Cameras' }]);
  });

  it('prefers the row indices the server sends over matching the label', () => {
    // A dataset that genuinely contains a sub-category called "Other", beside a roll-up that is
    // also called "Other". The label cannot tell them apart -- the server keeps these indices for
    // that reason, and its pivot builder once lost a measured 500 out of a 740 total to exactly
    // this collision. With the indices, the real row clicks and the roll-up does not.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'sub_category', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['Cameras', '1200'], ['Other', '500'], ['Other', '240']],
      dimensions: ['sub_category'],
      other: { label: 'Other', values: ['Lenses'], valueCount: 14, valuesTruncated: false },
      rollupRows: [2],
    }), 'SUM');

    // Row 1 is the dataset's own "Other" and row 2 is the roll-up. They render to one label and
    // are therefore ONE bar -- merged, so it is inert for that reason as well, and the count is
    // what proves the two rows were both seen.
    expect(view.marks.map(mark => mark.name)).toEqual(['Cameras', 'Other']);
    expect(view.marks[0].operands).toEqual([{ field: 'sub_category', value: 'Cameras' }]);
    expect(view.marks[1].operands).toBeUndefined();
  });

  it('clicks a real row that the label match alone would have refused', () => {
    // The half the fallback gets wrong, and the reason the field is worth sending: a real
    // sub-category spelled "Other", in a result where the roll-up is a DIFFERENT row.
    const view = analysisView(analysisResult({
      columns: [
        { name: 'sub_category', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['Other', '500'], ['Everything else', '240']],
      dimensions: ['sub_category'],
      other: { label: 'Everything else', values: ['Lenses'], valueCount: 14,
               valuesTruncated: false },
      rollupRows: [1],
    }), 'SUM');

    expect(view.marks[0].operands).toEqual([{ field: 'sub_category', value: 'Other' }]);
    expect(view.marks[1].operands).toBeUndefined();
  });

  it('keeps every dimension of a multi-dimension mark, in column order', () => {
    const view = analysisView(analysisResult({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'category', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['north', 'tools', '1200']],
      dimensions: ['region', 'category'],
    }), 'SUM');

    // The drawn name joins them and is not any column's value; the operands are both columns.
    expect(view.marks[0].name).toBe('north · tools');
    expect(view.marks[0].operands).toEqual([
      { field: 'region', value: 'north' },
      { field: 'category', value: 'tools' },
    ]);
  });

  it('marks the un-narrowable bar inert, and leaves the rest of the chart clickable', () => {
    // Requiring EVERY mark was the first shape of this and it was wrong: a Top-N result carries
    // one rolled-up row that is legitimately not a category, so "all or nothing" would have taken
    // the feature away from most of the reports that have it.
    const harness = boardWith({ widgets: [widgetOn()] });
    const mixed = analysisView(analysisResult({
      rows: [['north', '1200'], [null, '800']],
      dimensions: ['region'],
    }), 'SUM');

    expect(harness.board.narrows(widgetOn(), mixed)).toBe(true);
    expect(mixed.marks.find(mark => mark.name === 'north')!.inert).toBeUndefined();
    // The chart reads `inert`, never `operands` -- it is a shared component and knows nothing
    // about filters.
    expect(mixed.marks.find(mark => mark.name === '(null)')!.inert).toBe(true);
  });

  it('un-buttons a chart on which NOTHING can be narrowed', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    const grained = analysisView(analysisResult({
      columns: [
        { name: 'booked_on', type: 'DATE', role: 'DIMENSION' },
        { name: 'sum_amount', type: 'DECIMAL(18,3)', role: 'MEASURE' },
      ],
      rows: [['2024-03-01', '1200'], ['2024-04-01', '900']],
      dimensions: ['booked_on'],
      grains: ['MONTH'],
    }), 'SUM');

    expect(harness.board.narrows(widgetOn(), grained)).toBe(false);
  });

  it('un-buttons a saved-query tile, which has no dataset to filter', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    const view = analysisView(analysisResult({ dimensions: ['region'] }), 'SUM');

    expect(harness.board.narrows(
      widgetOn({ analyticsAnalysisId: undefined, analyticsQueryId: 21 }), view)).toBe(false);
  });

  it('fills the board filter from the clicked mark and runs the board', () => {
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.openDashboard(BOARD);
    // Opening a board runs it. Settled first, because a click DURING a run is ignored on purpose
    // and the test below is the one that says so.
    harness.finishAnalysis();
    const view = analysisView(analysisResult({ dimensions: ['region'] }), 'SUM');
    const before = harness.analyzes.length;

    harness.board.narrowTo(widgetOn(), view.marks[0]);

    expect(harness.board.boardFilter().clauses)
      .toEqual([{ field: 'region', operator: 'EQ', value: 'north' }]);
    // On the tile's own dataset, not on whatever the bar happened to be showing before.
    // The key is the pair joined by a NUL, which is the one separator a bucket key cannot hold.
    expect(harness.board.boardFilterOn())
      .toBe(ANALYSIS.connectionAlias + '\u0000' + ANALYSIS.datasetPath);
    // Opened, so the reader ends up looking at a filter they can read, edit and clear -- rather
    // than at numbers that moved for a reason with no trace on the screen.
    expect(harness.board.filterOpen()).toBe(true);
    expect(harness.analyzes.length).toBeGreaterThan(before);
  });

  it('ignores a click while the board is running', () => {
    // runAll() abandons the run in flight. A second click during a ten-widget pass would throw
    // away nine answers to ask a question the reader has not finished asking.
    const harness = boardWith({ widgets: [widgetOn()] });
    harness.board.openDashboard(BOARD);
    const view = analysisView(analysisResult({ dimensions: ['region'] }), 'SUM');
    const during = harness.analyzes.length;

    harness.board.narrowTo(widgetOn(), view.marks[0]);

    expect(harness.board.boardFilter().clauses).toEqual([]);
    expect(harness.analyzes.length).toBe(during);
  });
});

/**
 * The saved filter shape, and the tile that took the whole board down with it.
 *
 * Dashboard "15 Regional analysis" drew its first tile and then stopped: the second sat on
 * "Running…" for ever and the three behind it on "Waiting its turn", with no error anywhere and
 * no request on the wire. The console had the whole story in one line --
 * `TypeError: clauses is not iterable`.
 *
 * A saved analysis filtered on a SINGLE condition stores that condition bare:
 *   {"field":"region","operator":"EQ","value":"North"}
 * not a group wrapping one. Every reader here is typed FilterGroup and goes straight for
 * `.clauses`, so pruneFilters walked `undefined` and threw -- before any HTTP call, which is why
 * the network showed nothing at all.
 *
 * Two things are pinned below, and the SECOND is the one that matters. Accepting the bare clause
 * fixes these five tiles. Making a throw fail one tile rather than the board fixes every tile
 * that will ever throw for a reason nobody has thought of yet.
 */
describe('a saved filter stored as a bare clause', () => {
  const NORTH = { field: 'region', operator: 'EQ' as const, value: 'North' };

  it('is accepted where a group was expected, rather than throwing', () => {
    expect(() => combineFilters(NORTH as never, null)).not.toThrow();
  });

  it('becomes an AND of that one condition', () => {
    expect(combineFilters(NORTH as never, null))
      .toEqual({ op: 'AND', clauses: [NORTH] });
  });

  it('still ANDs with the board bar, keeping both halves bracketed', () => {
    const board: FilterGroup = {
      op: 'AND', clauses: [{ field: 'status', operator: 'EQ', value: 'Completed' }],
    };
    expect(combineFilters(NORTH as never, board)).toEqual({
      op: 'AND',
      clauses: [{ op: 'AND', clauses: [NORTH] }, board],
    });
  });

  it('an incomplete bare clause is pruned to nothing, not sent as half a condition', () => {
    const empty = { field: 'region', operator: 'EQ' as const, value: '' };
    expect(combineFilters(empty as never, null)).toBeUndefined();
  });

  it('a real group is untouched, which is the shape the builder writes', () => {
    const group: FilterGroup = { op: 'OR', clauses: [NORTH] };
    expect(combineFilters(group, null)).toEqual(group);
  });

  it('nothing saved is still nothing', () => {
    expect(combineFilters(undefined, null)).toBeUndefined();
  });
});

/**
 * Bars side by side, and the hole in the board they fill.
 *
 * A two-dimension result whose measure does not ADD UP had no chart at all. Both stacked kinds
 * refuse an average, a minimum or a distinct count -- correctly, because a stack claims its parts
 * compose the whole -- so "average order value by region and category" fell through to the
 * cross-tab, which answers "what is each figure" rather than "how do these compare". Clustered
 * bars make no claim about a total, so they are offered exactly where the stack is refused.
 */
describe('bars side by side', () => {
  const GRID = {
    rowDimension: 'region',
    columnDimension: 'category',
    columnValues: ['Apparel', 'Electronics'],
    columnsTruncated: false,
    rows: [
      { key: 'North', cells: ['120.5', '340'] },
      { key: 'South', cells: ['90', null] },      // null = that pair had NO ROWS
      { key: null,    cells: ['10', '20'] },      // the group with no value in it
    ],
  };

  // The suite's own harness, rather than a second way of building the same component.
  const board = () => boardWith().board;

  it('is offered in the picker', () => {
    expect(KIND_IDS).toContain('groupedBar');
  });

  it('turns the grid rows into cluster labels', () => {
    expect(chart().pivotGroupNames(GRID as any)).toEqual(['North', 'South', '(no value)']);
  });

  it('transposes the grid into one series per column value', () => {
    const series = chart().pivotSeries(GRID as any);
    expect(series.map(s => s.name)).toEqual(['Apparel', 'Electronics']);
    expect(series[0].values).toEqual([120.5, 90, 10]);
  });

  it('keeps a pair with no rows as null rather than folding it to zero', () => {
    // A zero says "measured, and it was nothing". This pair was never measured, and the chart
    // draws no bar for it at all.
    const series = chart().pivotSeries(GRID as any);
    expect(series[1].values).toEqual([340, null, 20]);
  });

  it('reads a non-numeric cell as absent rather than NaN', () => {
    const odd = { ...GRID, rows: [{ key: 'North', cells: ['n/a', '5'] }] };
    const series = chart().pivotSeries(odd as any);
    expect(series[0].values).toEqual([null]);
    expect(series[1].values).toEqual([5]);
  });

  it('survives a grid the server refused to compose', () => {
    const truncated = { ...GRID, rows: null };
    expect(chart().pivotGroupNames(truncated as any)).toEqual([]);
    expect(chart().pivotSeries(truncated as any).every((s: { values: unknown[] }) => s.values.length === 0)).toBe(true);
  });
});
