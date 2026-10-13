import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { useMemoryStorage } from '../../shared/testing/memory-storage';
import { Dashboards } from './dashboard';
import { AnalyticsService, Dashboard, DashboardWidget, SavedQuery } from './analytics.service';
import type { BoardFilterDef } from './board/board-filters';

/**
 * A board's filter bar, end to end through the board: every tile's run carries the filters that are on; a tile says
 * what they did to it; a click on a bar sets (and a second click clears) the filter its column belongs to; the state is
 * in the URL and kept per viewer; a table widget pages itself and is not queued; a theme change keeps the filters.
 *
 * @author Nabeel Ahmed
 */

const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

const DEFS: BoardFilterDef[] = [
  { key: 'date', label: 'Date', kind: 'date', columns: ['order_date'] },
  { key: 'region', label: 'Region', kind: 'values', columns: ['region'], family: 'text',
    source: { connection: 'meridian-s3', path: 'orders.csv', column: 'region' }, colorOrder: ['North', 'South'] },
];

const BOARD: Dashboard = {
  analyticsDashboardId: 7, dashboardName: 'Revenue & Operations',
  dashboardConfig: JSON.stringify({ theme: 'roma', filters: DEFS, sections: [{ before: 101, title: 'Detail' }] }),
};

const BY_REGION: SavedQuery = { analyticsQueryId: 21, queryName: 'Revenue by region', connectionAlias: 'meridian-s3',
  datasetPath: 'orders.csv', queryText: 'select region, sum(net_sales) from dataset group by 1' };
const ROWS: SavedQuery = { analyticsQueryId: 22, queryName: 'Orders', connectionAlias: 'meridian-s3',
  datasetPath: 'orders.csv', queryText: 'select * from dataset' };

const WIDGETS: DashboardWidget[] = [
  { analyticsDashboardWidgetId: 100, analyticsDashboardId: 7, widgetTitle: 'Revenue by region', analyticsQueryId: 21, visualizationType: 'barH' },
  { analyticsDashboardWidgetId: 101, analyticsDashboardId: 7, widgetTitle: 'Orders', analyticsQueryId: 22, visualizationType: 'table' },
];

function harness(params: Record<string, string | string[]> = {}, widgets: DashboardWidget[] = WIDGETS) {
  const queries: Subject<any>[] = [];
  const query = vi.fn(() => { const s = new Subject<any>(); queries.push(s); return s.asObservable(); });
  const saveDashboard = vi.fn((d: Dashboard) => of(OK(d)));
  const api = {
    query, analyze: vi.fn(() => new Subject<any>().asObservable()), cancel: vi.fn(() => of(OK(undefined))),
    fetchAllDashboards: () => of(OK([BOARD])), fetchDashboardById: () => of(OK({ ...BOARD, widgets })),
    fetchAllAnalyses: () => of(OK([])), fetchAllQueries: () => of(OK([BY_REGION, ROWS])), saveDashboard,
    saveWidget: vi.fn((w: DashboardWidget) => of(OK(w))), deleteWidget: vi.fn(), deleteDashboard: vi.fn(), schema: vi.fn(),
  };
  const paramMap = new BehaviorSubject(convertToParamMap(params));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AnalyticsService, useValue: api },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: paramMap, snapshot: { get queryParamMap() { return paramMap.value; } } } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const board = TestBed.runInInjectionContext(() => new Dashboards());
  board.ngOnInit();
  board.openDashboard(BOARD);
  const settle = (rows: (string | null)[][], outcomes = [{ key: 'region', applied: true, column: 'region' }]) =>
    queries[queries.length - 1].next(OK({ columns: ['region', 'revenue'], rows, rowCount: rows.length, truncated: false, boardFilters: outcomes }));
  return { board, query, queries, saveDashboard, navigate, settle };
}

describe('a board with a filter bar', () => {
  useMemoryStorage();

  it('runs each tile with the filters that are on, and pages its table instead of queueing it', () => {
    const h = harness({ 'f.region': ['North'], range: '90d' });
    expect(h.board.filterDefs().map(d => d.key)).toEqual(['date', 'region']);
    // One tile query: the table widget pages itself (board-table) and is never run whole.
    expect(h.query).toHaveBeenCalledTimes(1);
    const sent = (h.query.mock.calls[0] as unknown as [{ boardFilters: unknown[] }])[0].boardFilters;
    expect(sent).toEqual([
      expect.objectContaining({ key: 'date', columns: ['order_date'] }),
      { key: 'region', columns: ['region'], family: 'text', values: ['North'] },
    ]);
    expect(h.board.pagedTable(WIDGETS[1])).toMatchObject({ connection: 'meridian-s3', sql: 'select * from dataset' });
  });

  it('a table loading its first page holds one of the board\'s three slots, and gives it back when it lands (MIG-344)', () => {
    const tiles = (id: number): DashboardWidget => ({ analyticsDashboardWidgetId: id, analyticsDashboardId: 7, widgetTitle: `Tile ${id}`,
      analyticsQueryId: 21, visualizationType: 'barH' });
    const h = harness({}, [tiles(100), WIDGETS[1], tiles(102), tiles(103), tiles(104)]);
    // The table is reading its first page: two tile queries, not three.
    expect(h.query).toHaveBeenCalledTimes(2);
    h.board.onTableRead(WIDGETS[1], { state: 'done' } as any);
    expect(h.query).toHaveBeenCalledTimes(3);
    h.settle([['North', '10']]);
    expect(h.query).toHaveBeenCalledTimes(4);
  });

  it('a tile says it was filtered, and names a filter its data could not take', () => {
    const h = harness({ 'f.region': ['North'] });
    h.settle([['North', '10']], [{ key: 'region', applied: true, column: 'region' },
      { key: 'date', applied: false, reason: 'This data has no order_date column.' } as any]);
    // No range in the link: the date filter is off, so only Region travelled -- the server still answers for both.
    const note = h.board.tileNote(WIDGETS[0]);
    expect(note?.filtered).toBe(true);
    expect(note?.label).toBe('Filtered: Region');
    expect(note?.notApplied).toEqual(['Date is not applied here: this data has no order_date column.']);
  });

  it('a click on a bar sets its filter, a second click clears it, and each runs the board again', () => {
    const h = harness();
    h.settle([['North', '10'], ['South', '5']]);
    const view = h.board.runs()[100].view!;
    expect(h.board.narrows(WIDGETS[0], view)).toBe(true);
    h.board.narrowTo(WIDGETS[0], view.marks[1]);
    expect(h.board.filterState().values).toEqual({ region: ['South'] });
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ 'f.region': ['South'] }), replaceUrl: true }));
    h.board.narrowTo(WIDGETS[0], { ...view.marks[1] });
    expect(h.board.filterState().values).toEqual({});
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it('opens on the viewer\'s own last filters when the link names none', () => {
    localStorage.setItem('etl.board-filters.7.anon', JSON.stringify({ values: { region: ['West'] }, range: null }));
    const h = harness();
    expect(h.board.filterState().values).toEqual({ region: ['West'] });
    const sent = (h.query.mock.calls[0] as unknown as [{ boardFilters: unknown[] }])[0].boardFilters;
    expect(sent).toEqual([{ key: 'region', columns: ['region'], family: 'text', values: ['West'] }]);
  });

  it('keeps the filters and the sections when the theme changes', () => {
    const h = harness();
    h.board.setBoardTheme(null);
    const saved = JSON.parse((h.saveDashboard.mock.calls[0] as unknown as [Dashboard])[0].dashboardConfig!);
    expect(saved.theme).toBeUndefined();
    expect(saved.filters.map((d: BoardFilterDef) => d.key)).toEqual(['date', 'region']);
    expect(saved.sections).toEqual([{ before: 101, title: 'Detail' }]);
  });

  it('colours each value the same on every tile, from the order the filter was saved with', () => {
    const h = harness();
    expect([...h.board.colorKeys()!]).toEqual([['North', 0], ['South', 1]]);
    expect(h.board.sectionBefore(WIDGETS[1])?.title).toBe('Detail');
  });
});
