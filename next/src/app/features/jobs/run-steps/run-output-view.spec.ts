import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RunOutputView, RunOutputViewData, VIEW_ROWS, prettyJson, viewKind } from './run-output-view';

/** Owner 2026-10-20: a run's kept file is viewed in place -- a PDF as itself, a table as its first rows. */
function mount(data: RunOutputViewData) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunOutputView], providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close: () => {} } }] });
  const fixture = TestBed.createComponent(RunOutputView);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

describe('Run output view', () => {
  it('knows which kept files it can show', () => {
    expect(viewKind('brain-mri-draft-report.pdf', 'pdf')).toBe('pdf');
    expect(viewKind('results.csv', 'csv')).toBe('table');
    expect(viewKind('rows.jsonl', null)).toBe('table');
    expect(viewKind('notes.bin', 'bin')).toBeNull();
  });

  it('opens a kept JSON file as formatted JSON, one row as the object it is, with Table a click away (owner 2026-10-20)', () => {
    const { fixture, http, el } = mount({ name: 'call-insight.json', runDatasetId: 7, format: 'json', rowCount: 1 });
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush([{ summary: 'A short call.', actions: [{ action: 'Call back' }] }]);
    fixture.detectChanges();
    const pre = el.querySelector('[data-test="run-output-json"] pre')!;
    expect(pre.textContent).toBe(JSON.stringify({ summary: 'A short call.', actions: [{ action: 'Call back' }] }, null, 2));
    expect(el.querySelector('[data-test="run-output-table"]')).toBeNull();
    fixture.componentInstance.mode.set('table');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="run-output-table"]')).not.toBeNull();
  });

  it('formats several rows as their list, and JSON that is not rows still shows', () => {
    expect(prettyJson([{ a: 1 }, { a: 2 }])).toBe(JSON.stringify([{ a: 1 }, { a: 2 }], null, 2));
    expect(prettyJson([{ answer: '{"summary":"ok","list":[1,2]}', note: '[not json' }]))
      .toBe(JSON.stringify({ answer: { summary: 'ok', list: [1, 2] }, note: '[not json' }, null, 2));
    const { fixture, http, el } = mount({ name: 'nested.json', runDatasetId: 8, format: 'json', rowCount: 1 });
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush({ not: 'rows' });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="run-output-json"] pre')?.textContent).toContain('"not": "rows"');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('draws a kept table: its columns and rows, read as JSON', () => {
    const { fixture, http, el } = mount({ name: 'accuracy.csv', runDatasetId: 6327, format: 'csv', rowCount: 2 });
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('6327');
    expect(req.request.params.get('format')).toBe('json');
    req.flush([{ grade: 'glioma', correct: 7 }, { grade: 'meningioma', correct: 5 }]);
    fixture.detectChanges();
    const table = el.querySelector('[data-test="run-output-table"]')!;
    expect(table.querySelectorAll('thead th').length).toBe(3);
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
    expect(table.textContent).toContain('meningioma');
    expect(el.textContent).toContain('2 rows');
  });

  it('shows the first rows of a long table and says so', () => {
    const { fixture, http, el } = mount({ name: 'big.json', runDatasetId: 1, format: 'json', rowCount: 900 });
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush(Array.from({ length: 900 }, (_, i) => ({ id: i })));
    fixture.componentInstance.mode.set('table');
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(VIEW_ROWS);
    expect(el.textContent).toContain('First 500 of 900 rows');
  });

  it('does not read a very large kept file into the browser', () => {
    const { http, el, fixture } = mount({ name: 'huge.csv', runDatasetId: 2, format: 'csv', rowCount: 50000 });
    http.expectNone(r => r.url.endsWith('/sourceJob.json/runDataset'));
    fixture.detectChanges();
    expect(el.textContent).toContain('50,000 rows');
  });

  it('reads a kept PDF as a PDF', () => {
    const { http } = mount({ name: 'summary.pdf', runDatasetId: 6328, format: 'pdf', rowCount: 5 });
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('format')).toBe('pdf');
    expect(req.request.responseType).toBe('blob');
  });

  it('says so when the file cannot be read', () => {
    const { fixture, http, el } = mount({ name: 'gone.csv', runDatasetId: 3, format: 'csv', rowCount: 3 });
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush({ message: 'expired' }, { status: 410, statusText: 'Gone' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('Run output view -- sorting and states (owner 2026-10-27)', () => {
  it('sorts a column by what it holds, both ways, each row keeping its own number', () => {
    const { fixture, http } = mount({ name: 'accuracy.csv', runDatasetId: 6327, format: 'csv', rowCount: 3 });
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'))
      .flush([{ grade: 'glioma', correct: 7 }, { grade: 'meningioma', correct: 12 }, { grade: 'pituitary', correct: 9 }]);
    const view = fixture.componentInstance;
    expect(view.sortedRows().map(r => r.n)).toEqual([1, 2, 3]);
    view.sort.toggle('correct');
    expect(view.sortedRows().map(r => r.cells[1])).toEqual(['7', '9', '12']);
    view.sort.toggle('correct');
    expect(view.sortedRows().map(r => r.n)).toEqual([2, 3, 1]);
  });

  it('is loading until the file answers, then says a table with no rows has none', () => {
    const { fixture, http, el } = mount({ name: 'empty.csv', runDatasetId: 4, format: 'csv', rowCount: 0 });
    expect(fixture.componentInstance.loading()).toBe(true);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(el.querySelector('[data-test="run-output-empty"]')?.textContent).toContain('This file has no rows.');
  });

  it('offers Try again after a failed read, and reads again', () => {
    const { fixture, http, el } = mount({ name: 'gone.csv', runDatasetId: 3, format: 'csv', rowCount: 3 });
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('The file could not be read; it may have expired.');
    [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Try again')!.click();
    expect(fixture.componentInstance.loading()).toBe(true);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush([{ a: 1 }]);
    expect(fixture.componentInstance.rows().length).toBe(1);
  });
});
