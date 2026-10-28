import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { PreviewDialog } from './preview-dialog';
import { StorageService } from '../storage.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * Owner 2026-10-27 ("add a sort on each table"): the preview's table view sorts the rows of the page shown, by any
 * column (numbers as numbers), with # as the row's number in the file; the server is not asked again, and the headers
 * say the sort covers this page only.
 */
function open(previewTable: ReturnType<typeof vi.fn>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: StorageService, useValue: { previewText: () => of(''), previewBlob: () => of(new Blob(['x'])), previewTable } },
    { provide: DialogRef, useValue: { close: () => {} } },
    { provide: DIALOG_DATA, useValue: { bucket: 'b', key: 'folder/orders.csv', name: 'orders.csv' } },
  ] });
  const component = TestBed.runInInjectionContext(() => new PreviewDialog());
  component.ngOnInit();
  return component;
}

const page = (over: object = {}) => of({ status: API_SUCCESS, data: {
  source: 'csv', columns: ['amount', 'region'], rows: [['9', 'north'], ['10', 'south'], ['', 'east'], ['2', 'north']],
  offset: 100, limit: 100, totalRows: 300, sheets: [], ...over,
} });

describe('PreviewDialog table sort', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the file order until a column is picked', () => {
    const dialog = open(vi.fn(() => page()));
    expect(dialog.sortedRows().map(r => r.n)).toEqual([101, 102, 103, 104]);
  });

  it('sorts a column of numbers as numbers, both ways, empty cells last, without asking the server again', () => {
    const previewTable = vi.fn(() => page());
    const dialog = open(previewTable);
    dialog.rowSort.toggle('c0');
    expect(dialog.sortedRows().map(r => r.cells[0])).toEqual(['2', '9', '10', '']);
    dialog.rowSort.toggle('c0');
    expect(dialog.sortedRows().map(r => r.cells[0])).toEqual(['10', '9', '2', '']);
    expect(previewTable).toHaveBeenCalledTimes(1);
  });

  it('sorts text columns and the row number, and keeps the search', () => {
    const dialog = open(vi.fn(() => page()));
    dialog.rowSort.toggle('c1');
    expect(dialog.sortedRows().map(r => r.n)).toEqual([103, 101, 104, 102]);   // east, north, north (file order), south
    dialog.tableSearch.set('north');
    expect(dialog.sortedRows().map(r => r.n)).toEqual([101, 104]);
    dialog.tableSearch.set('');
    dialog.rowSort.toggle('n');
    expect(dialog.sortedRows().map(r => r.n)).toEqual([101, 102, 103, 104]);
    dialog.rowSort.toggle('n');
    expect(dialog.sortedRows().map(r => r.n)).toEqual([104, 103, 102, 101]);
  });

  it('says the sort covers this page only', () => {
    const dialog = open(vi.fn(() => page()));
    expect(dialog.rowSort.note).toBe('Sorts the rows on this page only (100 at a time)');
  });

  it('another sheet goes back to the file order', () => {
    const dialog = open(vi.fn(() => page({ source: 'xlsx', sheets: ['A', 'B'] })));
    dialog.rowSort.toggle('c0');
    dialog.pickSheet('B');
    expect(dialog.rowSort.key()).toBe('');
  });
});
