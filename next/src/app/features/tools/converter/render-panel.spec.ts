import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { RenderPanel } from './render-panel';
import { GeneratedService } from '../../documents/generated/generated.service';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * MIG-253: the converter's Dataset → PDF and From an execution modes. Rows go to media-service's
 * render (MIG-232) with the chosen template; the preview is that render as a PDF, shown from an
 * object URL of its bytes -- the template's HTML never enters the console's DOM.
 */
const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });
const FORMATS = { formats: [
  { format: 'pdf', contentType: 'application/pdf', usesTemplate: true, maxRows: 5000 },
  { format: 'csv', contentType: 'text/csv', usesTemplate: false, maxRows: 100000 },
], placeholders: [], limits: {} };
const PDF = { outputFormat: 'pdf', outputFileName: 'UI-CHECK.pdf', outputContentType: 'application/pdf',
  outputBase64: btoa('%PDF-1.4'), outputFileSize: 8, rowCount: 2, pageCount: 1 };

function panel(overrides: Partial<Record<keyof GeneratedService, unknown>> = {}) {
  const service = {
    formats: vi.fn(() => of(ok(FORMATS))),
    templates: vi.fn(() => of(ok([{ reportTemplateId: 1001, name: 'UI-CHECK layout' }]))),
    render: vi.fn(() => of(ok(PDF))),
    schedules: vi.fn(() => of([
      { jobId: 2849, jobName: 'UI-CHECK registry chain job 0929', lastJobRun: '2026-09-29T07:06:55' },
      { jobId: 2850, jobName: 'never ran', lastJobRun: null },
    ])),
    runs: vi.fn(() => of([{ jobQueueId: 7405, jobStatus: 'Completed', startTime: '2026-09-29T07:06:55' }])),
    runOutputs: vi.fn(() => of([
      { runOutputId: 1000, kind: 'file', name: 'customers-clean.json', runDatasetId: 1051, rowCount: 3, expired: false },
      { runOutputId: 1001, kind: 'bucket', name: 'customers-clean.json', bucket: 'b', key: 'k' },
    ])),
    runDataset: vi.fn(() => of([{ id: 1 }, { id: 2 }, { id: 3 }])),
    ...overrides,
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: GeneratedService, useValue: service },
      { provide: StorageService, useValue: {} },
      { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: { open: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(RenderPanel);
  return { fixture, p: fixture.componentInstance, service, toast };
}

let urls: string[];
beforeEach(() => {
  urls = [];
  (URL as any).createObjectURL = vi.fn(() => { const u = `blob:test/${urls.length}`; urls.push(u); return u; });
  (URL as any).revokeObjectURL = vi.fn();
});
afterEach(() => TestBed.resetTestingModule());

describe('Dataset → PDF', () => {
  it('previews pasted rows as a PDF rendered with the default layout, and nothing is saved', () => {
    const { fixture, p, service } = panel();
    fixture.componentRef.setInput('source', 'dataset');
    fixture.detectChanges();
    p.datasetText.set('[{"a":1},{"a":2}]');
    expect(p.parsed()).toMatchObject({ ok: true, rows: 2 });
    p.preview();
    expect(service.render).toHaveBeenCalledWith({ outputFormat: 'pdf', dataset: [{ a: 1 }, { a: 2 }],
      template: { pageSize: 'A4', orientation: 'portrait' } });
    expect(p.previewUrl()).toBe('blob:test/0');
  });

  it('lets go of the last preview\'s bytes when a new one replaces it, and on leaving', () => {
    const { fixture, p } = panel();
    fixture.componentRef.setInput('source', 'dataset');
    fixture.detectChanges();
    p.datasetText.set('[{"a":1}]');
    p.preview();
    p.preview();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/0');
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });

  it('names a saved template by id, and makes the file into a bucket when asked', () => {
    const { fixture, p, service } = panel();
    fixture.componentRef.setInput('source', 'dataset');
    fixture.detectChanges();
    p.datasetText.set('[{"a":1}]');
    p.setTemplate('1001');
    p.fileName.set('UI-CHECK dataset');
    p.saveToBucket.set(true);
    p.saveBucket.set('ui-review-s3');
    p.make();
    expect(service.render).toHaveBeenCalledWith({ outputFormat: 'pdf', dataset: [{ a: 1 }], templateId: 1001,
      fileName: 'UI-CHECK dataset', save: true, bucketName: 'ui-review-s3', targetFolder: 'reports/' });
    expect(p.result()?.outputFileName).toBe('UI-CHECK.pdf');
  });

  it('says why the service refused, in its own words', () => {
    const { fixture, p } = panel({ render: vi.fn(() => throwError(() => ({ status: 413,
      error: { status: 'ERROR', message: 'The dataset has 6,000 rows; a PDF holds at most 5,000.' } }))) });
    fixture.componentRef.setInput('source', 'dataset');
    fixture.detectChanges();
    p.datasetText.set('[{"a":1}]');
    p.preview();
    expect(p.error()).toBe('The dataset has 6,000 rows; a PDF holds at most 5,000.');
    expect(p.previewUrl()).toBeNull();
  });

  it('offers no layout preview for a format without one', () => {
    const { fixture, p } = panel();
    fixture.componentRef.setInput('source', 'dataset');
    fixture.detectChanges();
    p.datasetText.set('[{"a":1}]');
    p.outputFormat.set('csv');
    expect(p.usesTemplate()).toBe(false);
    expect(p.canPreview()).toBe(false);
    expect(p.canMake()).toBe(true);
  });
});

describe('From an execution', () => {
  it('walks schedule → run → dataset, and renders the run\'s rows', () => {
    const { fixture, p, service } = panel();
    fixture.componentRef.setInput('source', 'execution');
    fixture.detectChanges();
    expect(p.scheduleOptions().map(o => o.value)).toEqual(['2849']);
    p.pickSchedule('2849');
    expect(service.runs).toHaveBeenCalledWith(2849, 20);
    p.pickRun('7405');
    expect(service.runOutputs).toHaveBeenCalledWith(7405);
    expect(p.datasets().map(d => d.runDatasetId)).toEqual([1051]);
    p.pickDataset('1051');
    expect(service.runDataset).toHaveBeenCalledWith(1051);
    expect(p.runRows()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    p.preview();
    // The run's file name heads the document when no title is typed.
    expect(service.render).toHaveBeenCalledWith(expect.objectContaining({
      dataset: { title: 'customers-clean', records: [{ id: 1 }, { id: 2 }, { id: 3 }] } }));
  });

  it('picks the only dataset a run kept without asking', () => {
    const { fixture, p, service } = panel();
    fixture.componentRef.setInput('source', 'execution');
    fixture.detectChanges();
    p.pickSchedule('2849');
    p.pickRun('7405');
    expect(p.datasetId()).toBe(1051);
    expect(service.runDataset).toHaveBeenCalledWith(1051);
  });

  it('says when a run kept no dataset to render', () => {
    const { fixture, p } = panel({ runOutputs: vi.fn(() => of([])) });
    fixture.componentRef.setInput('source', 'execution');
    fixture.detectChanges();
    p.pickSchedule('2849');
    p.pickRun('7405');
    expect(p.datasets()).toEqual([]);
    expect(p.canPreview()).toBe(false);
  });
});
