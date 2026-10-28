import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WidgetChart } from './widget-chart';
import type { PivotGrid } from './analytics.service';

/** Owner 2026-10-27, "add a sort on each table": a cross-tab sorts by its row values or by a column's figures. */
const GRID: PivotGrid = {
  rowDimension: 'region', columnDimension: 'status', columnValues: ['open', 'closed'], columnsTruncated: false,
  rows: [
    { key: 'north', cells: ['9', '1'] },
    { key: 'east', cells: ['10', null] },
    { key: 'south', cells: ['2', '5'] },
  ],
};

describe('a cross-tab sorts (owner 2026-10-27)', () => {
  it('keeps the server order, then sorts by the row values both ways', () => {
    TestBed.resetTestingModule();
    const chart = TestBed.runInInjectionContext(() => new WidgetChart());
    expect(chart.pivotRows(GRID).map(r => r.key)).toEqual(['north', 'east', 'south']);
    chart.pivotSort.toggle('row');
    expect(chart.pivotRows(GRID).map(r => r.key)).toEqual(['east', 'north', 'south']);
    chart.pivotSort.toggle('row');
    expect(chart.pivotRows(GRID).map(r => r.key)).toEqual(['south', 'north', 'east']);
  });

  it('sorts a column by its figures as numbers, an empty cell last', () => {
    TestBed.resetTestingModule();
    const chart = TestBed.runInInjectionContext(() => new WidgetChart());
    chart.pivotSort.toggle('c:0');
    expect(chart.pivotRows(GRID).map(r => r.key)).toEqual(['south', 'north', 'east']);
    chart.pivotSort.toggle('c:1');
    expect(chart.pivotRows(GRID).map(r => r.key)).toEqual(['north', 'south', 'east']);
  });
});
