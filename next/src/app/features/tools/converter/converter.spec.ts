import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { Converter } from './converter';
import { ConverterApi } from './converter.api';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';
import { ObjectPicker } from '../../../shared/ui/object-picker';
import { ConversionRow } from './converter.model';

const FAMILIES = [{ key: 'text', label: 'Text document', inputFormats: ['docx', 'txt'], outputFormats: ['pdf', 'docx', 'odt'] }];
const DONE = (id: number, name = 'a'): ConversionRow => ({ conversionId: id, name, inputFileName: `${name}.txt`, inputFormat: 'txt',
  inputFileSize: 100, outputFormat: 'pdf', outputFileName: `${name}.pdf`, outputFileSize: 2000, outputPages: 1, outcome: 'DONE', tookMs: 1200,
  createdBy: 1015, createdAt: '2026-11-02T09:41:00' });

interface Calls { convert: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> }

function page(convert: (file: File) => Observable<unknown>, query: Record<string, string> = {}) {
  TestBed.resetTestingModule();
  const calls: Calls = {
    convert: vi.fn((file: File) => convert(file)),
    list: vi.fn(() => of({ status: 'SUCCESS', data: { rows: [DONE(7, 'older')], total: 1, failedCount: 0 } })),
  };
  const api = {
    formats: () => of({ status: 'SUCCESS', data: FAMILIES }),
    limits: () => of({ status: 'SUCCESS', data: { maxFileSizeMb: 50, tableMaxFileSizeMb: 500, xlsxMaxFileSizeMb: 100, pdfMaxRows: 5000,
      pdfMaxPages: 2000, maxOutputMb: 50, timeoutSeconds: 140, slots: 2, maxWaiting: 4, running: 0, waiting: 0 } }),
    convert: calls.convert, list: calls.list, page: () => NEVER, file: () => NEVER,
  };
  const open = vi.fn(() => ({ closed: of(undefined) }));
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: ConverterApi, useValue: api },
    { provide: Dialog, useValue: { open } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }), previewBlob: () => NEVER } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
  ] });
  const fixture = TestBed.createComponent(Converter);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, c: fixture.componentInstance, el, calls, open, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

const answer = (row: ConversionRow) => of(new HttpResponse({ body: { status: 'SUCCESS', data: row } }));
const file = (name: string) => new File(['x'], name);

describe('Document Converter (tools redesign)', () => {
  afterEach(() => vi.useRealTimers());

  it('takes several files, refuses a recording in words, and converts only after Convert', () => {
    const { c, fixture, el, calls, text } = page(() => answer(DONE(1)));
    c.add([file('note.txt'), file('summary.docx'), file('ward-round.m4a')]);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-test=converter-queue] li')).toHaveLength(3);
    expect(text()).toContain('A recording, not a document.');
    expect(calls.convert).not.toHaveBeenCalled();
    expect(text()).toContain('Convert 2 waiting files');
    c.convertWaiting();
    fixture.detectChanges();
    expect(calls.convert).toHaveBeenCalledTimes(2);
    expect(c.queue().filter(i => i.state === 'done')).toHaveLength(2);
    // The first result is shown beside its original.
    expect(c.selected()?.conversionId).toBe(1);
  });

  it('sends at most two at once and the rest when a slot frees', () => {
    const pending: Subject<unknown>[] = [];
    const { c, calls } = page(() => { const s = new Subject<unknown>(); pending.push(s); return s; });
    c.add([file('a.txt'), file('b.txt'), file('c.txt')]);
    c.convertWaiting();
    expect(calls.convert).toHaveBeenCalledTimes(2);
    pending[0].next(new HttpResponse({ body: { status: 'SUCCESS', data: DONE(1) } }));
    expect(calls.convert).toHaveBeenCalledTimes(3);
  });

  it('keeps a file waiting when the converter is busy (429), and sends it again by itself', () => {
    vi.useFakeTimers();
    let first = true;
    const { c, calls } = page(() => {
      if (first) { first = false; return throwError(() => new HttpErrorResponse({ status: 429 })); }
      return answer(DONE(2));
    });
    c.add([file('a.txt')]);
    c.convertWaiting();
    expect(c.queue()[0]).toMatchObject({ state: 'waiting', busy: true });
    expect(c.waitingText(c.queue()[0])).toContain('trying again by itself');
    vi.advanceTimersByTime(15_000);
    expect(calls.convert).toHaveBeenCalledTimes(2);
    expect(c.queue()[0].state).toBe('done');
  });

  it('records a refusal as a failed row with what to do next', () => {
    const { c, fixture, text } = page(() => answer({ ...DONE(3), outcome: 'FAILED', errorCode: 'PASSWORD', outputFileSize: null }));
    c.add([file('consent.docx')]);
    c.convertWaiting();
    fixture.detectChanges();
    expect(c.queue()[0].state).toBe('failed');
    expect(text()).toContain('Protected with a password.');
  });

  it('shows upload progress, then Converting while the server works', () => {
    const events = new Subject<unknown>();
    const { c } = page(() => events);
    c.add([file('a.txt')]);
    c.convertWaiting();
    events.next({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    expect(c.queue()[0]).toMatchObject({ state: 'uploading', progress: 50 });
    events.next({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
    expect(c.queue()[0].state).toBe('converting');
  });

  it('lists Recent conversions from the server, with Failed and the days asked', () => {
    const { c, calls, text } = page(() => NEVER);
    expect(text()).toContain('older');
    c.setView('failed');
    c.setDays('90');
    expect(calls.list).toHaveBeenLastCalledWith('failed', 90, '', 1, 50);
  });

  it('opens the shared ObjectPicker on the formats the converter reads', () => {
    const { c, open } = page(() => NEVER);
    c.fromBucket();
    expect(open.mock.calls[0]).toBeDefined();
    const [component, config] = open.mock.calls[0] as unknown as [unknown, { data: { extensions: string[] } }];
    expect(component).toBe(ObjectPicker);
    expect(config.data.extensions).toEqual(['docx', 'txt']);
  });

  it('sends an old ?mode=dataset link to Reports from pipelines', () => {
    TestBed.resetTestingModule();
    const navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { navigate } },
      { provide: ConverterApi, useValue: {} },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: {} },
      { provide: StorageService, useValue: {} },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ mode: 'dataset' }) } } },
    ] });
    const c = TestBed.runInInjectionContext(() => new Converter());
    c.ngOnInit();
    expect(navigate).toHaveBeenCalledWith(['/reports/from-pipelines'], { queryParams: { make: 'dataset' }, replaceUrl: true });
  });
});
