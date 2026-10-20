import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RunOutputView, RunOutputViewData, VIEW_ROWS, viewKind } from './run-output-view';

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
