import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DatasetOverview, shortDate } from './dataset-overview';
import { AnalyticsService, AnalysisRequest, DatasetOverview as OverviewData } from './analytics.service';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * The overview draws what the server chose, in the shared tile chrome: a date as a line with
 * day labels, a category as ranked bars, a numeric spread as the engine's bins, a failed chart
 * as its own failed tile -- and hands its profile up so the Studio never scans twice.
 */
const REQUEST = (dims: string[], grains: (string | null)[] = []): AnalysisRequest => ({ connection: 'worker-store', path: 'sales/in/orders.csv', dimensions: dims, grains: grains as never, measure: { aggregation: 'COUNT_ROWS' } });
const OVERVIEW: OverviewData = {
  durationMs: 946,
  profile: { bucket: 'etl-bucket', path: 'sales/in/orders.csv', format: 'CSV', multiFile: false, totalRows: 60, columns: [
    { name: 'region', type: 'VARCHAR', min: 'east', max: 'west', avg: null, std: null, approxQ25: null, approxQ50: null, approxQ75: null, approxDistinct: 4, nullPercentage: 0, completeness: 100, approxNullRows: 0, allNull: false, constant: false, keyLike: false, typeSurprise: null },
    { name: 'amount', type: 'DOUBLE', min: '48.19', max: '865.27', avg: '449.2', std: null, approxQ25: null, approxQ50: null, approxQ75: null, approxDistinct: 47, nullPercentage: 12.5, completeness: 87.5, approxNullRows: 8, allNull: false, constant: false, keyLike: false, typeSurprise: null },
  ] },
  charts: [
    { kind: 'rowsOverTime', title: 'Rows over time', question: 'How many rows fall in each day of order_date.', column: 'order_date', request: REQUEST(['order_date'], ['DAY']),
      result: { columns: [{ name: 'order_date', type: 'DATE', role: 'DIMENSION' }, { name: 'rows', type: 'BIGINT', role: 'MEASURE' }] as never, rows: [['2026-09-01', '5'], ['2026-09-02', '3']], rowCount: 2, truncated: false, measure: 'rows' } },
    { kind: 'topValues', title: 'Rows by region', question: 'Which values of region the rows carry most.', column: 'region', request: REQUEST(['region']),
      result: { columns: [{ name: 'region', type: 'VARCHAR', role: 'DIMENSION' }, { name: 'rows', type: 'BIGINT', role: 'MEASURE' }] as never, rows: [['north', '19'], ['east', '15']], rowCount: 2, truncated: false, measure: 'rows' } },
    { kind: 'spread', title: 'Spread of amount', question: 'How the figures in amount are distributed.', column: 'amount',
      distribution: { name: 'amount', exactValues: false, bins: [{ from: '48.19', to: '116.28', rows: 7 }, { from: '116.28', to: '184.37', rows: 6 }], mostCommon: '686.06', mostCommonRows: 1 } },
    { kind: 'topValues', title: 'Rows by product', question: 'Which values of product the rows carry most.', column: 'product', request: REQUEST(['product']), error: 'Refused for the test.' },
    { kind: 'completeness', title: 'Missing values', question: 'Which columns have gaps.', result: { columns: [], rows: [['amount', '12.5']], rowCount: 1, truncated: false } },
  ],
};

@Component({ imports: [DatasetOverview], template: `<app-dataset-overview connection="worker-store" path="sales/in/orders.csv" [sizeBytes]="3700" (openInCanvas)="opened = $event" (profiled)="profiled = $event" />` })
class Host { opened: AnalysisRequest | null = null; profiled: unknown = null; @ViewChild(DatasetOverview) overview!: DatasetOverview; }

function mount(answer = { status: API_SUCCESS, data: OVERVIEW }) {
  const api = { overview: vi.fn(() => of(answer)) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([]), { provide: AnalyticsService, useValue: api }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { host: fixture.componentInstance, component: fixture.componentInstance.overview, api, fixture, text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
}

describe('DatasetOverview', () => {
  it('reads the overview once for the dataset, tiles it, and hands the profile up', () => {
    const { host, component, api, text } = mount();
    expect(api.overview).toHaveBeenCalledWith('worker-store', 'sales/in/orders.csv', false);
    expect(component.rows()).toBe(60);
    expect(component.columns()).toBe(2);
    expect(component.completeness()).toBe(93.8);
    expect(component.gaps()).toBe(1);
    expect(component.typeMix()).toBe('1 varchar · 1 double');
    expect(component.sizeText()).toBe('3.6 KB');
    expect(host.profiled).toBe(OVERVIEW.profile);
    const tiles = component.tiles();
    expect(tiles.map(t => t.kind)).toEqual(['line', 'ranked', 'table', 'table', 'ranked']);
    expect(tiles[0].view?.marks.map(m => m.name)).toEqual(['09-01', '09-02']);      // day labels, not full dates
    expect([shortDate('2024-03-01', 'MONTH'), shortDate('2024-07-01', 'QUARTER'), shortDate('2024-01-01', 'YEAR'), shortDate('2024-03-05', 'WEEK')]).toEqual(['Mar 24', 'Q3 24', '2024', '03-05']);
    expect(component.stateOf(tiles[0])).toBe('ready');
    expect(component.stateOf(tiles[2])).toBe('ready');                              // bins, no view
    expect(component.stateOf(tiles[3])).toBe('failed');
    expect(component.footOf(tiles[0])).toBe('2 rows · by day · 2026-09-01 to 2026-09-02');
    expect(component.footOf(tiles[2])).toBe('2 bins');
    expect(component.binBars(OVERVIEW.charts[2].distribution!).map(b => b.name)).toEqual(['48.19 – 116.28', '116.28 – 184.37']);
    expect(tiles[4].view?.marks).toEqual([{ name: 'amount', value: 12.5 }]);
    const screen = text();
    expect(screen).toContain('Rows over time');
    expect(screen).toContain('Refused for the test.');
    expect(screen).not.toContain('Most common');                                    // one row is not a mode
    expect(screen).toContain('5 charts chosen from the columns');
  });

  it('opens a tile in the Canvas as the request that drew it, and reads again only when asked', () => {
    const { host, component, api, fixture } = mount();
    component.openInCanvas.emit(OVERVIEW.charts[1].request!);
    expect(host.opened?.dimensions).toEqual(['region']);
    component.load(true);
    fixture.detectChanges();
    expect(api.overview).toHaveBeenLastCalledWith('worker-store', 'sales/in/orders.csv', true);
  });

  it('says why when the read was refused, with a way to try again', () => {
    const { component, text } = mount({ status: 'ERROR', data: null as never, message: 'Analytics is switched off on this console.' } as never);
    expect(component.error()).toBe('Analytics is switched off on this console.');
    expect(text()).toContain('Try again');
  });

  it('says so when a file has nothing to chart', () => {
    const { component, text } = mount({ status: API_SUCCESS, data: { ...OVERVIEW, charts: [], profile: { ...OVERVIEW.profile, totalRows: 0 } } });
    expect(component.tiles()).toEqual([]);
    expect(text()).toContain('The file has no rows');
  });
});
