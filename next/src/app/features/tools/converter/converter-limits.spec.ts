import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, Subject, of } from 'rxjs';
import { Converter, ConverterLimits, limitMbFor, limitsHint } from './converter';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';

/**
 * ADR-027: the Converter with big files -- its limits shown before a file is picked (a CSV or TSV to PDF is streamed, so it
 * may be far bigger than a document LibreOffice converts), the upload's progress and then "converting", a file over its
 * limit stopped before it is sent, a busy converter (429) said as busy with Try again, and the rows a PDF printed.
 */
const FAMILIES = [{ key: 'SPREADSHEET', label: 'Spreadsheet', inputFormats: ['csv', 'xlsx'], outputFormats: ['pdf', 'xlsx'] }];
const LIMITS: ConverterLimits = { maxFileSizeMb: 50, tableMaxFileSizeMb: 500, xlsxMaxFileSizeMb: 100, pdfMaxRows: 5000, pdfMaxPages: 2000,
  maxOutputMb: 50, timeoutSeconds: 140, slots: 2, maxWaiting: 4 };

function converter(post: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  const get = (url: string) => of(url.includes('supportedFormats') ? { status: 'SUCCESS', data: FAMILIES }
    : url.includes('limits') ? { status: 'SUCCESS', data: LIMITS } : { status: 'SUCCESS', data: [] });
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: { get: vi.fn(get), post: vi.fn(post) } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }), listObjects: () => NEVER } },
  ] });
  const fixture = TestBed.createComponent(Converter);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, c: fixture.componentInstance, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Converter limits (ADR-027)', () => {
  it('names the limit of each kind of conversion', () => {
    expect(limitMbFor(LIMITS, 'csv', 'pdf')).toBe(500);
    expect(limitMbFor(LIMITS, 'tsv', 'pdf')).toBe(500);
    expect(limitMbFor(LIMITS, 'xlsx', 'pdf')).toBe(100);
    expect(limitMbFor(LIMITS, 'csv', 'xlsx')).toBe(50);
    expect(limitMbFor(LIMITS, 'docx', 'pdf')).toBe(50);
    expect(limitMbFor(null, 'csv', 'pdf')).toBeNull();
    expect(limitsHint(LIMITS)).toBe('Up to 50 MB; a CSV or TSV to PDF up to 500 MB, an XLSX to PDF up to 100 MB. '
      + "A table's PDF prints its first 5,000 rows.");
  });

  it('shows the limits before a file is picked', () => {
    const { text } = converter(() => NEVER);
    expect(text()).toContain('a CSV or TSV to PDF up to 500 MB');
  });

  it('stops a file over its limit before it is sent', () => {
    const { c, fixture, text, el } = converter(() => NEVER);
    const big = new File(['x'], 'claims.csv');
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
    c.onFile(big);
    TestBed.tick();
    c.outputFormat.set('xlsx');
    fixture.detectChanges();
    expect(text()).toContain('takes up to 50 MB');
    const convert = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Convert'))!;
    expect(convert.disabled).toBe(true);
    c.outputFormat.set('pdf');
    fixture.detectChanges();
    expect(text()).not.toContain('takes up to');
  });

  it('shows the upload progress, then that the server is converting, then the rows the PDF printed', async () => {
    const events = new Subject<unknown>();
    const { c, fixture, text } = converter(() => events);
    c.onFile(new File(['a,b\n1,2\n'], 'claims.csv'));
    TestBed.tick();
    await c.convert();
    events.next({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    fixture.detectChanges();
    expect(text()).toContain('Uploading: 40%');
    events.next({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
    fixture.detectChanges();
    expect(text()).toContain('Converting on the server');
    events.next({ type: HttpEventType.Response, body: { status: 'SUCCESS', data: {
      outputFileName: 'claims.pdf', outputFormat: 'pdf', outputContentType: 'application/pdf', outputBase64: 'JVBERg==',
      outputFileSize: 511_000, pageCount: 148, rowCount: 1_000_000, rowsShown: 5000, truncated: true } } });
    fixture.detectChanges();
    expect(text()).toContain('148 pages');
    expect(text()).toContain('First 5,000 of 1,000,000 rows printed; the full data is the file you converted.');
  });

  it('says a busy converter is busy, with Try again, rather than a failure', async () => {
    const { c, fixture, text, el } = converter(() => new Observable(sub => sub.error(new HttpErrorResponse({ status: 429,
      error: { status: 'ERROR', message: 'The converter is busy: 2 conversions are running and 4 waiting. Try again in a minute.' } }))));
    c.onFile(new File(['a,b\n1,2\n'], 'claims.csv'));
    TestBed.tick();
    await c.convert();
    fixture.detectChanges();
    expect(text()).toContain('The converter is busy');
    expect([...el.querySelectorAll('[role=alert] button')].some(b => b.textContent!.includes('Try again'))).toBe(true);
  });
});
