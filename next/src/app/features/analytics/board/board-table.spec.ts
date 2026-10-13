import { describe, expect, it } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';
import { BoardApi, TablePage, TableRequest } from './board-api';
import { BoardTable } from './board-table';
import {
  cellText, clausesOf, columnKind, isSet, nextSort, pageText, readLayout, writeLayout,
} from './table-filters';
import { parseSections, segmentsOf, withSection } from './board-sections';
import { applyColorKeys, colorKeysOf } from '../charts/board-colors';
import { changeText, sparkPaths, trendFigure } from '../charts/kpi-trend';

/**
 * A board's details table (server-paged, filtered per column), its sections, its colour per value, and the KPI card
 * with its trend. The table's server half -- a page is a page of the filtered rows and its count counts them -- is
 * analytics-service's BoardFiltersTest; here, what the table ASKS for.
 *
 * @author Nabeel Ahmed
 */

const COLUMNS = [
  { name: 'order_date', type: 'DATE' }, { name: 'region', type: 'VARCHAR' }, { name: 'customer', type: 'VARCHAR' },
  { name: 'net_sales', type: 'DOUBLE' }, { name: 'payload', type: 'STRUCT(a INTEGER)' },
];
const FACETS = { region: ['East', 'North', 'South', 'West'] };
const RANGES = { net_sales: ['3.5', '9100.25'], order_date: ['2021-01-02', '2025-12-31'] };

describe('a table column\'s filter', () => {
  it('follows the data: a select for few values, a range for numbers and dates, contains for other text', () => {
    expect(COLUMNS.map(c => columnKind(c, FACETS))).toEqual(['date', 'select', 'text', 'number', 'other']);
  });

  it('becomes the Canvas\'s own clauses, an open bound filled with the column\'s lowest or highest', () => {
    const clauses = clausesOf({
      region: { value: 'North' }, customer: { text: '  acme ' }, net_sales: { from: '100' }, order_date: { to: '2024-06-30' },
      payload: { text: 'x' },
    }, COLUMNS, FACETS, RANGES);
    expect(clauses).toEqual([
      { field: 'order_date', operator: 'DATE_RANGE', values: ['2021-01-02', '2024-06-30'] },
      { field: 'region', operator: 'EQ', value: 'North' },
      { field: 'customer', operator: 'CONTAINS', value: 'acme' },
      { field: 'net_sales', operator: 'NUMERIC_RANGE', values: ['100', '9100.25'] },
    ]);
  });

  it('drops a filter on a column the result no longer has, and one with nothing in it', () => {
    expect(clausesOf({ gone: { text: 'x' }, region: { value: '' }, customer: { text: '   ' } }, COLUMNS, FACETS, RANGES)).toEqual([]);
    expect(isSet({ from: '1' })).toBe(true);
    expect(isSet({ text: ' ' })).toBe(false);
  });
});

describe('a table\'s cells and pager', () => {
  it('groups a figure, shows a null as a dash, and leaves the rest as it came', () => {
    expect(cellText('1234567.5', COLUMNS[3])).toBe((1234567.5).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    expect(cellText(null, COLUMNS[1])).toBe('—');
    expect(cellText('•••', COLUMNS[2])).toBe('•••');
    expect(cellText('2025-01-02', COLUMNS[0])).toBe('2025-01-02');
  });

  it('sorts ascending, then descending, then not at all', () => {
    let sort = nextSort(null, 'net_sales');
    expect(sort).toEqual({ column: 'net_sales', direction: 'ASC' });
    sort = nextSort(sort, 'net_sales');
    expect(sort).toEqual({ column: 'net_sales', direction: 'DESC' });
    expect(nextSort(sort, 'net_sales')).toBeNull();
    expect(nextSort(sort, 'region')).toEqual({ column: 'region', direction: 'ASC' });
  });

  it('says which rows a page holds', () => {
    expect(pageText(1, 25, 25, 1204)).toBe(`Rows 26–50 of ${(1204).toLocaleString()}`);
    expect(pageText(0, 25, 0, 0)).toBe('No rows');
  });

  describe('a viewer\'s layout', () => {
    useMemoryStorage();
    it('is kept per table, and rubbish reads as the defaults', () => {
      writeLayout('t1', { hidden: ['customer'], pageSize: 50 });
      expect(readLayout('t1')).toEqual({ hidden: ['customer'], pageSize: 50 });
      localStorage.setItem('t2', '{"pageSize":7}');
      expect(readLayout('t2')).toEqual({ hidden: [], pageSize: 25 });
    });
  });
});

describe('the table widget', () => {
  useMemoryStorage();

  function mounted(pages: TablePage[]) {
    const asked: TableRequest[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(),
        { provide: BoardApi, useValue: { rows: (r: TableRequest) => { asked.push(r); return of({ status: 'SUCCESS', message: '', data: pages[Math.min(asked.length - 1, pages.length - 1)] }); } } }],
    });
    const fixture = TestBed.createComponent(BoardTable);
    fixture.componentRef.setInput('source', { connection: 'c', path: 'p', sql: 'SELECT * FROM dataset' });
    fixture.componentRef.setInput('boardFilters', [{ key: 'region', columns: ['region'], values: ['North'] }]);
    fixture.detectChanges();
    return { fixture, asked, table: fixture.componentInstance };
  }

  const PAGE: TablePage = {
    columns: COLUMNS.slice(0, 4).map(c => c.name), columnMeta: COLUMNS.slice(0, 4), page: 0, pageSize: 25, totalRows: 60,
    unfilteredRows: 138116, filtered: true, facets: FACETS, ranges: RANGES,
    rows: [['2025-01-02', 'North', 'Acme', '1250.5'], ['2025-01-03', 'North', null, '99']],
    boardFilters: [{ key: 'region', applied: true, column: 'region' }],
  };

  it('asks for its first page with the board\'s filters and the facets, and never the whole result', () => {
    const { asked, fixture } = mounted([PAGE]);
    expect(asked.length).toBe(1);
    expect(asked[0]).toMatchObject({ page: 0, pageSize: 25, facets: true, boardFilters: [{ key: 'region', columns: ['region'], values: ['North'] }] });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('60 of 138,116 rows');
    // Figures right-aligned and grouped; a null a dash.
    const figure = (fixture.nativeElement as HTMLElement).querySelector('tbody td.num');
    expect(figure?.textContent?.trim()).toBe((1250.5).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    expect(text).toContain('—');
  });

  it('turns the page, sorts and filters on the server, without asking for the facets again', () => {
    const { asked, table } = mounted([PAGE, PAGE, PAGE, PAGE]);
    table.goTo(1);
    table.sortBy('net_sales');
    table.setFilter('region', { value: 'South' });
    expect(asked.map(r => r.page)).toEqual([0, 1, 0, 0]);
    expect(asked[2]).toMatchObject({ sort: 'net_sales', direction: 'ASC', facets: false });
    expect(asked[3].filters).toEqual([{ field: 'region', operator: 'EQ', value: 'South' }]);
  });

  it('hides a column for this viewer only, and remembers it', () => {
    const { table, fixture } = mounted([PAGE]);
    fixture.componentRef.setInput('storageKey', 'etl.board-table.1.2.4642');
    fixture.detectChanges();
    table.toggleColumn('customer');
    expect(table.shownColumns().map(c => c.name)).toEqual(['order_date', 'region', 'net_sales']);
    expect(readLayout('etl.board-table.1.2.4642').hidden).toEqual(['customer']);
  });
});

describe('a board\'s sections', () => {
  it('keeps one well-formed heading per widget', () => {
    expect(parseSections([{ before: 3, title: ' Overview ' }, { before: 3, title: 'again' }, { before: 'x', title: 'y' },
      { before: 7, title: 'Detail', subtitle: 'The rows' }])).toEqual([
      { before: 3, title: 'Overview' }, { before: 7, title: 'Detail', subtitle: 'The rows' }]);
  });

  it('breaks the rows where a heading stands, so each part fills its own rows', () => {
    expect(segmentsOf([1, 2, 3, 4, 5], [{ before: 1, title: 'a' }, { before: 4, title: 'b' }])).toEqual([[0, 1, 2], [3, 4]]);
  });

  it('an empty title removes a heading', () => {
    const sections = [{ before: 1, title: 'a' }];
    expect(withSection(sections, { before: 1, title: '  ' })).toEqual([]);
    expect(withSection(sections, { before: 2, title: 'b' })).toEqual([{ before: 1, title: 'a' }, { before: 2, title: 'b' }]);
  });
});

describe('one colour per value across a board', () => {
  const PALETTE = ['#111', '#222', '#333'];

  it('gives the most frequent values the first colours, the first list winning a value two lists share', () => {
    const keys = colorKeysOf([['North', 'South'], ['Web', 'North']], 3);
    expect([...keys]).toEqual([['North', 0], ['South', 1], ['Web', 0]]);
  });

  it('paints a series named by a value, and each named item -- a slice, a treemap leaf -- without editing the option', () => {
    const option = {
      series: [
        { type: 'line', name: 'South', data: [1, 2] },
        { type: 'pie', data: [{ name: 'North', value: 3 }, { name: 'Elsewhere', value: 1 }] },
        { type: 'treemap', data: [{ name: 'X', children: [{ name: 'South', value: 1 }] }] },
      ],
    };
    const painted = applyColorKeys(option, colorKeysOf([['North', 'South']], 3), PALETTE) as { series: any[] };
    expect(painted.series[0].itemStyle.color).toBe('#222');
    expect(painted.series[0].lineStyle.color).toBe('#222');
    expect(painted.series[1].data[0].itemStyle.color).toBe('#111');
    expect(painted.series[1].data[1].itemStyle).toBeUndefined();
    expect(painted.series[2].data[0].children[0].itemStyle.color).toBe('#222');
    expect((option.series[1].data[0] as Record<string, unknown>)['itemStyle']).toBeUndefined();
    expect(applyColorKeys(option, null, PALETTE)).toBe(option);
  });
});

describe('a figure with its trend', () => {
  it('compares the last point with the one before it', () => {
    const figure = trendFigure([{ name: 'Oct', value: 80 }, { name: 'Nov', value: 100 }, { name: 'Dec', value: 104.2 }]);
    expect(figure.latest?.name).toBe('Dec');
    expect(figure.previous?.name).toBe('Nov');
    expect(changeText(figure.change, figure.delta)).toBe('+4.2%');
    expect(changeText(-0.008, -1)).toBe('−0.8%');
    expect(changeText(null, 12)).toBe('+12');
    expect(trendFigure([{ name: 'Only', value: 1 }]).change).toBeNull();
  });

  it('draws its sparkline in the box, the last point marked', () => {
    const paths = sparkPaths([1, 3, 2]);
    expect(paths.line.startsWith('M0.00')).toBe(true);
    expect(paths.last?.[0]).toBe(100);
    expect(sparkPaths([5]).line).toBe('');
  });
});
