import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { PreviewDialog } from './preview-dialog';
import { StorageService } from '../storage.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * The viewer decides what to draw by the shape of the data: a table for rows and columns, a
 * rendered PDF for a document, an archive's entries, and for a name nobody registered a look
 * at the bytes -- text when they are text, a hex glance when they are not.
 */
function open(name: string, storage: Partial<Record<keyof StorageService, unknown>>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: StorageService, useValue: { previewText: () => of('plain text'), previewBlob: () => of(new Blob(['x'])), ...storage } },
    { provide: DialogRef, useValue: { close: () => {} } },
    { provide: DIALOG_DATA, useValue: { bucket: 'b', key: 'folder/' + name, name } },
  ] });
  const component = TestBed.runInInjectionContext(() => new PreviewDialog());
  component.ngOnInit();
  return component;
}

const table = (over: object = {}) => of({ status: API_SUCCESS, data: {
  source: 'csv', columns: ['id', 'region'], rows: [['1', 'north'], ['2', 'south'], ['3', 'north']],
  offset: 0, limit: 100, totalRows: 3, sheets: [], ...over,
} });

describe('PreviewDialog', () => {
  it('reads rows and columns as a table, with a page and a search', () => {
    const previewTable = vi.fn(() => table());
    const dialog = open('orders.csv', { previewTable });
    expect(dialog.kind()).toBe('table');
    expect(previewTable).toHaveBeenCalledWith('b', 'folder/orders.csv', 0, 100, undefined);
    expect(dialog.table()?.columns).toEqual(['id', 'region']);
    expect(dialog.tableTotalLabel()).toBe('3 rows');
    expect(dialog.tableHasMore()).toBe(false);
    dialog.tableSearch.set('north');
    expect(dialog.tableRows().map(r => r.n)).toEqual([1, 3]);
  });

  it('a workbook offers its sheets, and asks for the one picked', () => {
    const previewTable = vi.fn((_b: string, _k: string, _o: number, _l: number, sheet?: string) =>
      table({ source: 'xlsx', sheets: ['Orders', 'Totals'], sheet: sheet ?? 'Orders' }));
    const dialog = open('orders.xlsx', { previewTable });
    expect(dialog.kindLabel()).toBe('Workbook');
    dialog.pickSheet('Totals');
    expect(previewTable).toHaveBeenLastCalledWith('b', 'folder/orders.xlsx', 0, 100, 'Totals');
    expect(dialog.table()?.sheet).toBe('Totals');
  });

  it('a capped count reads as "N+ rows" and keeps paging while pages come back full', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [String(i), 'x']);
    const previewTable = vi.fn((_b: string, _k: string, offset: number) => table({ rows, offset, totalRows: -1, note: 'More than 200,000 rows.' }));
    const dialog = open('big.csv', { previewTable });
    expect(dialog.tableTotalLabel()).toBe('100+ rows');
    expect(dialog.tableHasMore()).toBe(true);
    dialog.tablePage(1);
    expect(previewTable).toHaveBeenLastCalledWith('b', 'folder/big.csv', 100, 100, undefined);
    expect(dialog.tableTotalLabel()).toBe('200+ rows');
  });

  it('JSON is a table when it is a list of records, and text when the server says it is not', () => {
    const asTable = open('rows.json', { previewTable: () => table({ source: 'json' }) });
    expect(asTable.kind()).toBe('table');

    const asText = open('config.json', {
      previewTable: () => of({ status: 'ERROR', message: 'This JSON is not a list of records, so it reads better as text.' }),
      previewText: () => of('{"only":"an object"}'),
    });
    expect(asText.kind()).toBe('json');
    expect(asText.text()).toBe('{\n  "only": "an object"\n}');
  });

  it('a document is rendered to PDF by the server and drawn by the PDF viewer', () => {
    const previewDocument = vi.fn(() => of(new Blob(['%PDF'], { type: 'application/pdf' })));
    const dialog = open('notes.docx', { previewDocument });
    expect(dialog.kind()).toBe('document');
    expect(previewDocument).toHaveBeenCalledWith('b', 'folder/notes.docx');
    expect(dialog.mediaUrl()).toMatch(/^blob:/);
    expect(dialog.kindLabel()).toBe('DOCX · rendered');
  });

  it('an archive is listed, not extracted', () => {
    const dialog = open('exports.zip', { previewArchive: () => of({ status: API_SUCCESS, data: [
      { name: 'exports/', directory: true, size: 0, compressedSize: 0, lastModified: 0 },
      { name: 'exports/jobs.csv', directory: false, size: 800, compressedSize: 300, lastModified: 1 },
    ] }) });
    expect(dialog.kind()).toBe('archive');
    expect(dialog.archiveTotal()).toBe(800);
    dialog.entrySearch.set('jobs');
    expect(dialog.visibleEntries().map(e => e.name)).toEqual(['exports/jobs.csv']);
  });

  it('a name nobody registered is judged by its bytes: text reads as text', async () => {
    const dialog = open('NOTES', { previewHead: () => of(new Blob(['a note with no extension\n'])), previewText: () => of('a note with no extension\n') });
    expect(dialog.kind()).toBe('sniff');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dialog.kind()).toBe('text');
    expect(dialog.text()).toBe('a note with no extension\n');
  });

  it('and binary bytes get a hex glance with the download beside it', async () => {
    const bytes = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0xff, 0x03, 0x09]);
    const dialog = open('data.parquetx', { previewHead: () => of(new Blob([bytes])) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dialog.kind()).toBe('binary');
    expect(dialog.hex()).toBe('00000000  50 41 52 31 00 ff 03 09                          PAR1....');
    expect(PreviewDialog.looksLikeText(new TextEncoder().encode('héllo — ✓'))).toBe(true);
    expect(PreviewDialog.looksLikeText(bytes)).toBe(false);
  });

  it('the plain-text cousins read as text under their own name', () => {
    for (const [name, label] of [['app.log', 'Log'], ['pipeline.yaml', 'YAML'], ['schema.sql', 'SQL'], ['report.html', 'HTML'], ['app.properties', 'Properties']]) {
      const dialog = open(name, {});
      expect(dialog.kind()).toBe('text');
      expect(dialog.kindLabel()).toBe(label);
    }
  });

  it('a table the server cannot read says why, with Download beside it', () => {
    const dialog = open('huge.xlsx', { previewTable: () => throwError(() => ({ error: { message: 'huge.xlsx is 40.0 MB -- download it instead.' } })) });
    expect(dialog.error()).toContain('40.0 MB');
  });
});
