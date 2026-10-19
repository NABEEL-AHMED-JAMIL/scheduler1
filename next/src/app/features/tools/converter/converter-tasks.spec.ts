import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { Converter, createdIn } from './converter';
import { ConversionPanel } from './conversion-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';
import { localIsoDay } from '../../../shared/ui/local-day';

/** Owner #26 (2026-10-19): recent conversions searched and narrowed by the shared date range, a row's detail on the right. */
const today = new Date();
const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return localIsoDay(d) + 'T10:00:00'; };
const TASKS = [
  { documentConverterTaskId: 1, taskName: 'Discharge summary', inputFileName: 'discharge.docx', inputFormat: 'docx', outputFormat: 'pdf', outputFileName: 'discharge.pdf', status: 'Completed', dateCreated: daysAgo(1), bucketName: 'clinic', outputStorageKey: 'converted/1/output/discharge.pdf', inputStorageKey: 'converted/1/input/discharge.docx' },
  { documentConverterTaskId: 2, taskName: 'Lab results', inputFileName: 'labs.csv', inputFormat: 'csv', outputFormat: 'xlsx', outputFileName: 'labs.xlsx', status: 'Completed', dateCreated: daysAgo(45) },
];
const LIMITS = { maxFileSizeMb: 50, tableMaxFileSizeMb: 500, xlsxMaxFileSizeMb: 100, pdfMaxRows: 5000, pdfMaxPages: 2000, maxOutputMb: 50, timeoutSeconds: 140, slots: 2, maxWaiting: 4, running: 1, waiting: 3 };

function converter(panelAnswer?: string) {
  TestBed.resetTestingModule();
  const open = vi.fn((_component: unknown, _config: unknown) => ({ closed: of(panelAnswer) }));
  const del = vi.fn(() => of({ status: 'SUCCESS' }));
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: { delete: del, post: vi.fn(() => NEVER), get: vi.fn((url: string) => of(
      url.includes('fetchAllTasks') ? { status: 'SUCCESS', data: TASKS }
        : url.includes('limits') ? { status: 'SUCCESS', data: LIMITS } : { status: 'SUCCESS', data: [] })) } },
    { provide: Dialog, useValue: { open } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }), listObjects: () => NEVER } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
  ] });
  try { localStorage.clear(); } catch { /* none */ }
  const fixture = TestBed.createComponent(Converter);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, open };
}

describe('createdIn', () => {
  it('keeps a day inside the range, both ends included, and open ends', () => {
    expect(createdIn({ dateCreated: '2026-10-06 23:00:00' }, { from: '2026-10-06', to: '2026-10-06' })).toBe(true);
    expect(createdIn({ dateCreated: '2026-10-06 23:00:00' }, { from: '2026-10-07', to: '2026-10-19' })).toBe(false);
    expect(createdIn({ dateCreated: '2026-10-06 23:00:00' }, { from: '', to: '' })).toBe(true);
    expect(createdIn({}, { from: '2026-10-07', to: '2026-10-19' })).toBe(true);
  });
});

describe('Converter, recent conversions', () => {
  it('opens on the last 30 days; All time shows the older one', () => {
    const { c } = converter();
    expect(c.range().preset).toBe('30d');
    expect(c.shownTasks().map(t => t.documentConverterTaskId)).toEqual([1]);
    c.applyRange({ from: '', to: '', preset: 'all' });
    expect(c.shownTasks().length).toBe(2);
  });

  it('searches the name, the file names and the formats', () => {
    const { c } = converter();
    c.applyRange({ from: '', to: '', preset: 'all' });
    c.setTaskQuery('XLSX');
    expect(c.shownTasks().map(t => t.taskName)).toEqual(['Lab results']);
    c.setTaskQuery('discharge');
    expect(c.shownTasks().map(t => t.taskName)).toEqual(['Discharge summary']);
  });

  it('opens a row\'s detail on the right and does what it asks', () => {
    const { c, open } = converter('output');
    const view = vi.spyOn(c, 'view').mockImplementation(() => {});
    c.openTask(c.shownTasks()[0]);
    expect(open.mock.calls[0][0]).toBe(ConversionPanel);
    const config = open.mock.calls[0][1] as unknown as { panelClass: string[]; data: { folder: string } };
    expect(config.panelClass).toContain('side-panel-right');
    expect(config.data.folder).toBe('converted/1/output/');
    expect(view).toHaveBeenCalledWith(c.shownTasks()[0], 'output');
  });

  it('states the limits and the queue now, beside the work', () => {
    const { el } = converter();
    const aside = el.querySelector('[data-test="converter-limits"]')!.textContent!.replace(/\s+/g, ' ');
    expect(aside).toContain('up to 50 MB');
    expect(aside).toContain('2 at once, 4 more waiting');
    expect(el.querySelector('[data-test="converter-now"]')!.textContent).toContain('1 converting, 3 waiting');
    expect(aside).toContain('busy');
  });
});
