import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Converter } from './converter';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';

/** Audit 09-22, the Document Converter as drawn: honest loads, named controls, a result that belongs to its source. */
const FAMILIES = [{ key: 'office', label: 'Office document', inputFormats: ['docx'], outputFormats: ['pdf', 'odt'] }];
const TASK = (id: number) => ({ documentConverterTaskId: id, taskName: `task ${id}`, inputFileName: 'a.docx', inputFormat: 'docx', outputFormat: 'pdf', outputFileName: 'a.pdf', status: 'Completed' });

function converter(get: (url: string) => Observable<unknown>, query: Record<string, string> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: { get: vi.fn(get), post: vi.fn(() => NEVER) } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }), listObjects: () => NEVER } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
  ] });
  const fixture = TestBed.createComponent(Converter);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, c: fixture.componentInstance, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
}
const answer = (tasks: () => unknown, formats: () => unknown = () => ({ status: 'SUCCESS', data: FAMILIES })) =>
  (url: string) => of(url.includes('supportedFormats') ? formats() : tasks());

describe('Converter, rendered', () => {
  it('lists recent conversions in the table shell: a spinner while loading, not "Nothing converted yet"', () => {
    const { text, el } = converter(url => (url.includes('fetchAllTasks') ? NEVER : of({ status: 'SUCCESS', data: FAMILIES })));
    expect(el.querySelector('app-table-shell')).not.toBeNull();
    expect(text()).not.toContain('Nothing converted yet');
  });

  it('says the list could not be read, with Try again', () => {
    let calls = 0;
    const { text, el, fixture } = converter(answer(() => (calls++ === 0 ? { status: 'ERROR', message: 'Converter is down.' } : { status: 'SUCCESS', data: [TASK(1)] })));
    expect(text()).toContain('Converter is down.');
    expect(text()).not.toContain('Nothing converted yet');
    [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'))!.click();
    fixture.detectChanges();
    expect(text()).toContain('task 1');
  });

  it('pages a long list with the shared pager', () => {
    const { c } = converter(answer(() => ({ status: 'SUCCESS', data: Array.from({ length: 60 }, (_, i) => TASK(i + 1)) })));
    expect(c.pagedTasks().length).toBe(50);
  });

  it('says the formats could not be loaded instead of blaming the file', () => {
    let calls = 0;
    const { c, fixture, text, el } = converter(answer(() => ({ status: 'SUCCESS', data: [] }),
      () => (calls++ === 0 ? { status: 'ERROR', message: 'nope' } : { status: 'SUCCESS', data: FAMILIES })));
    c.onFile(new File(['x'], 'letter.docx'));
    fixture.detectChanges();
    expect(text()).not.toContain("isn't a format this can convert");
    expect(text()).toContain('Could not load the supported formats.');
    [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'))!.click();
    fixture.detectChanges();
    expect(text()).toContain('Detected as Office document');
  });

  it('drops the previous result when the source, the target or the mode changes', () => {
    const { c } = converter(answer(() => ({ status: 'SUCCESS', data: [] })));
    c.onFile(new File(['x'], 'letter.docx'));
    TestBed.tick();
    c.result.set({ fileName: 'letter.pdf' } as any);
    c.outputFormat.set('odt');
    TestBed.tick();
    expect(c.result()).toBeNull();
    c.result.set({ fileName: 'letter.odt' } as any);
    c.mode.set('bucket');
    TestBed.tick();
    expect(c.result()).toBeNull();
  });

  it('has a page head, an expandable formats list and an Actions column', () => {
    const { el, c, fixture } = converter(answer(() => ({ status: 'SUCCESS', data: [TASK(1)] })));
    expect(el.querySelector('.page-head .page-title')?.textContent).toContain('Document Converter');
    const formats = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Supported formats'))!;
    expect(formats.getAttribute('aria-expanded')).toBe('false');
    const heads = [...el.querySelectorAll('app-table-shell thead th')];
    expect(heads[heads.length - 1].textContent!.trim()).toBe('Actions');
    c.onFile(new File(['x'.repeat(10)], 'letter.docx'));
    fixture.detectChanges();
    expect(el.textContent).toContain('10 B');
  });
});

describe('Converter and Generated reports, one job in one wording (UX final CV1)', () => {
  const empty = answer(() => ({ status: 'SUCCESS', data: [] }));

  it('names its render modes as Generated reports does, and links to that page from its header', () => {
    const { el, c } = converter(empty);
    expect(c.modeOptions.map(o => o.label)).toEqual(['Upload a file', 'From a bucket', 'PDF from a dataset', 'PDF from a run']);
    const link = el.querySelector<HTMLAnchorElement>('app-page-header .page-head [data-test="to-generated-reports"]')!;
    expect(link.textContent!.trim()).toBe('Generated reports');
    expect(link.getAttribute('href')).toBe('/data/reports');
  });

  it('opens on PDF from a dataset when the link asks for it, and ignores a mode it does not know', () => {
    expect(converter(empty, { mode: 'dataset' }).c.mode()).toBe('dataset');
    expect(converter(empty, { mode: 'nonsense' }).c.mode()).toBe('upload');
  });
});

describe('Converter -- the formats, limits and buckets say they are loading (owner 2026-10-27)', () => {
  it('does not call a file unconvertible, nor the limits unreadable, while they are still being read', () => {
    const { c, fixture, text } = converter(url => (url.includes('supportedFormats') || url.includes('limits') ? NEVER : of({ status: 'SUCCESS', data: [] })));
    c.onFile(new File(['x'], 'letter.docx'));
    fixture.detectChanges();
    expect(c.formatsState.pending()).toBe(true);
    expect(c.limitsState.pending()).toBe(true);
    expect(text()).not.toContain("isn't a format this can convert");
    expect(text()).not.toContain('The limits could not be read');
  });

  it('says the limits could not be read only once they failed', () => {
    const { c, fixture, text } = converter(url => (url.includes('limits')
      ? throwError(() => new HttpErrorResponse({ status: 500 })) : of({ status: 'SUCCESS', data: FAMILIES })));
    fixture.detectChanges();
    expect(c.limitsState.error()).toBe('The limits could not be read.');
    expect(text()).toContain('The limits could not be read; the converter still checks every file.');
  });

  it('says the buckets could not be read', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: [] })), post: vi.fn(() => NEVER) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: StorageService, useValue: { buckets: () => throwError(() => new HttpErrorResponse({ status: 500 })), listObjects: () => NEVER } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
    ] });
    const fixture = TestBed.createComponent(Converter);
    fixture.detectChanges();
    expect(fixture.componentInstance.bucketsState.error()).toBe('The buckets could not be read.');
  });
});
