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
import { ConversionQuery, ConversionRow } from './converter.model';

const FAMILIES = [{ key: 'text', label: 'Text document', inputFormats: ['docx', 'txt'], outputFormats: ['pdf', 'docx', 'odt'] }];
const DONE = (id: number, name = 'a'): ConversionRow => ({ conversionId: id, name, inputFileName: `${name}.txt`, inputFormat: 'txt',
  inputFileSize: 100, outputFormat: 'pdf', outputFileName: `${name}.pdf`, outputFileSize: 2000, outputPages: 1, outcome: 'DONE', tookMs: 1200,
  createdBy: 1015, createdAt: '2026-11-02T09:41:00', checks: [{ key: 'pages', ok: true, text: 'Same page count' }, { key: 'fonts', ok: true, text: 'Fonts embedded' }] });
const FACETS = { status: { DONE: 206, SHORTENED: 3, FAILED: 4 }, from: { word: 88, markup: 19 }, kept: { kept: 96, temp: 118 }, by: { me: 71, others: 143 } };

interface Calls { convert: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> }

function page(convert: (file: File) => Observable<unknown>, query: Record<string, string> = {}) {
  TestBed.resetTestingModule();
  const calls: Calls = {
    convert: vi.fn((file: File) => convert(file)),
    list: vi.fn(() => of({ status: 'SUCCESS', data: { rows: [DONE(7, 'older')], total: 214, all: 214, failedCount: 4, facets: FACETS } })),
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
const lastQuery = (calls: Calls) => calls.list.mock.lastCall![0] as ConversionQuery;

describe('Document Converter (tools Option A)', () => {
  afterEach(() => vi.useRealTimers());

  it('converts dropped files at once, two at a time, and refuses a recording in words', () => {
    const { c, fixture, el, calls, text } = page(() => answer(DONE(1)));
    c.add([file('note.txt'), file('summary.docx'), file('ward-round.m4a')]);
    fixture.detectChanges();
    expect(calls.convert).toHaveBeenCalledTimes(2);
    expect(c.queue().filter(i => i.state === 'done')).toHaveLength(2);
    const refused = el.querySelector('tr[data-file="ward-round.m4a"]')!;
    expect(refused.textContent).toContain('Not supported');
    (refused as HTMLElement).click();
    fixture.detectChanges();
    expect(text()).toContain('A recording, not a document.');
  });

  it('sends at most two at once and the rest when a slot frees', () => {
    const pending: Subject<unknown>[] = [];
    const { c, calls } = page(() => { const s = new Subject<unknown>(); pending.push(s); return s; });
    c.add([file('a.txt'), file('b.txt'), file('c.txt')]);
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
    expect(c.queue()[0]).toMatchObject({ state: 'waiting', busy: true });
    expect(c.waitingText(c.queue()[0])).toContain('trying again by itself');
    expect(c.localPill(c.queue()[0]).label).toBe('Converter busy');
    vi.advanceTimersByTime(15_000);
    expect(calls.convert).toHaveBeenCalledTimes(2);
    expect(c.queue()[0].state).toBe('done');
  });

  it('records a refusal as a failed row; its panel says what to do next', () => {
    const { c, fixture, el, text } = page(() => answer({ ...DONE(3), outcome: 'FAILED', errorCode: 'PASSWORD', outputFileSize: null }));
    c.add([file('consent.docx')]);
    fixture.detectChanges();
    expect(c.queue()[0].state).toBe('failed');
    (el.querySelector('tr[data-file="consent.docx"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-test=panel-problem]')!.textContent).toContain('Protected with a password.');
    expect(text()).toContain('Remove from the list');
  });

  it('shows a new file at the top of the table with its progress, then Converting while the server works', () => {
    const events = new Subject<unknown>();
    const { c, fixture, el } = page(() => events);
    c.add([file('a.txt')]);
    events.next({ type: HttpEventType.UploadProgress, loaded: 70, total: 100 });
    fixture.detectChanges();
    expect(c.queue()[0]).toMatchObject({ state: 'uploading', progress: 70 });
    const first = el.querySelector('tbody tr')!;
    expect(first.getAttribute('data-file')).toBe('a.txt');
    expect(first.textContent).toContain('Converting 70%');
    expect(first.textContent).toContain('TXT → PDF');
    events.next({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
    expect(c.queue()[0].state).toBe('converting');
    // Converting is a facet of its own, counted from the page's queue.
    expect(c.groups()[0].options.find(o => o.value === 'CONVERTING')?.count).toBe(1);
  });

  it('lists the history with facets and counts; a facet, the search and the days read it again', () => {
    vi.useFakeTimers();
    const { c, fixture, el, calls } = page(() => NEVER);
    expect(lastQuery(calls)).toMatchObject({ days: 30, q: '', page: 1, status: [], from: [], kept: [], by: [] });
    const status = el.querySelector('[data-facet=status]')!;
    expect(status.querySelector('[data-option=DONE]')!.textContent).toContain('Done');
    expect(status.querySelector('[data-option=DONE] b')!.textContent).toBe('206');
    expect(el.querySelector('[data-facet=from]')!.textContent).toContain('Markdown and HTML');
    expect(el.querySelector('[data-facet=kept]')!.textContent).toContain('In a bucket or Documents');
    (status.querySelector('[data-option=FAILED] input') as HTMLInputElement).click();
    expect(lastQuery(calls).status).toEqual(['FAILED']);
    c.setDays('0');
    expect(lastQuery(calls)).toMatchObject({ days: 0, page: 1 });
    c.setQuery('discharge');
    vi.advanceTimersByTime(300);
    expect(lastQuery(calls).q).toBe('discharge');
    fixture.detectChanges();
    expect(el.querySelector('[data-test=conversions-foot]')!.textContent).toContain('1–25 of 214 · results stay 30 days unless kept');
    expect(el.querySelector('[data-test=conversions-foot]')!.textContent).toContain('Page 1 of 9');
  });

  it('opens the side panel only when a row is chosen: status, DOCX → PDF meta, tabs and Next steps', () => {
    const { fixture, el } = page(() => NEVER);
    expect(el.querySelector('app-conversion-panel')).toBeNull();
    expect(el.querySelector('.tx-panel-on')).toBeNull();
    (el.querySelector('tr[data-conversion="7"]') as HTMLElement).click();
    fixture.detectChanges();
    const panel = el.querySelector('app-conversion-panel')!;
    expect(panel.querySelector('[data-test=panel-meta]')!.textContent).toContain('TXT → PDF · 1.2 s');
    expect(panel.querySelector('[data-test=panel-title]')!.textContent).toContain('older');
    expect([...panel.querySelectorAll('[role=tab]')].map(t => t.textContent!.trim())).toEqual(['Result', 'Original', 'Details']);
    expect(panel.querySelector('[data-test=preview-page]')!.textContent).toContain('Page 1 of 1');
    expect(panel.querySelector('[data-test=preview-checks]')!.textContent).toContain('Same page count · fonts embedded');
    expect(panel.querySelector('[data-test=preview-download]')!.textContent).toContain('Download PDF');
    expect(panel.querySelector('[data-test=panel-kept]')!.textContent).toContain('Keep in a bucket from ⋮');
    (panel.querySelector('button[aria-label=Close]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-conversion-panel')).toBeNull();
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
