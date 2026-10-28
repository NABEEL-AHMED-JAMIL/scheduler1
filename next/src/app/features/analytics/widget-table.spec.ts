import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WidgetTable } from './widget-table';

/**
 * MIG-367: a tile's table formats its figures and leaves its labels alone. A saved query has no column roles, so every
 * column was a figure and a year read "2,002"; a column named as a year whose values are four digits is a label now.
 */
describe('a tile\'s table', () => {
  function render(columns: string[], rows: (string | null)[][], measureColumn: boolean[] = []) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(WidgetTable);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('measureColumn', measureColumn);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr:not(.vt-pad)'))
      .map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent!.trim()));
  }

  it('leaves a year as it is and groups a figure, on a saved query\'s all-figures columns', () => {
    expect(render(['year', 'orders'], [['2002', '2002']], [true, true])).toEqual([['2002', '2,002']]);
  });

  it('still formats a column of four-digit figures whose name is not a year', () => {
    expect(render(['region', 'orders'], [['north', '2002']], [true, true])).toEqual([['north', '2,002']]);
  });
});

describe('a result table sorts by any column (owner 2026-10-27)', () => {
  function table(columns: string[], rows: (string | null)[][]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(WidgetTable);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('keeps the result order, then sorts a number column as numbers both ways', () => {
    const t = table(['region', 'orders'], [['north', '9'], ['south', '10'], ['east', null]]);
    expect(t.sortedRows().map(r => r[0])).toEqual(['north', 'south', 'east']);
    t.sort.toggle('orders');
    expect(t.sortedRows().map(r => r[1])).toEqual(['9', '10', null]);
    t.sort.toggle('orders');
    expect(t.sortedRows().map(r => r[1])).toEqual(['10', '9', null]);
  });

  it('sorts a text column A to Z', () => {
    const t = table(['region', 'orders'], [['north', '9'], ['east', '1']]);
    t.sort.toggle('region');
    expect(t.sortedRows().map(r => r[0])).toEqual(['east', 'north']);
  });
});
