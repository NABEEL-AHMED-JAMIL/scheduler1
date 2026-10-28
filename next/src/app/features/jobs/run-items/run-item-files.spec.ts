import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ItemFilesData, RunItemFiles, SKELETON_AFTER_MS } from './run-item-files';
import { ItemFile } from './run-items.model';
import { PDF_FIRST_PAGE } from './pdf-first-page';

/**
 * MIG-420, a step's files for one item: "Page images · 40 files", fifteen at a time, thumbnails read as blobs, and
 * Download all as a zip -- a short-lived link first, then the zip.
 */
const page = (n: number): ItemFile => ({ fileRef: `p${n}`, name: `page-${String(n).padStart(2, '0')}.png`, role: 'output', stepKey: 'pages',
  stepName: 'Page images', format: 'png', bytes: 460_000, previewable: true });

const FILES = (pageNo: number) => ({ ref: '5', label: 'referral-0412.pdf', total: 40, page: pageNo, size: 15, bytes: 18 * 1024 * 1024,
  files: Array.from({ length: pageNo === 2 ? 10 : 15 }, (_, i) => page(pageNo * 15 + i + 1)) });

const PAGES: ItemFilesData = { jobQueueId: 9020, ref: '5', label: 'referral-0412.pdf', stepKey: 'pages', stepName: 'Page images' };

/** The panel on `data`; Reports open to the reader unless `reports` is false; PDFs "drawn" by a stand-in for pdf.js. */
function mount(data: ItemFilesData = PAGES, reports = true) {
  const drawn: Blob[] = [];
  const navigated: unknown[][] = [];
  const closed: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItemFiles], providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: data },
    { provide: DialogRef, useValue: { close: () => closed.push(true) } },
    { provide: AuthService, useValue: { canOpen: (page: string) => reports && page === 'report-library' } },
    { provide: Router, useValue: { navigate: (...a: unknown[]) => { navigated.push(a); return Promise.resolve(true); } } },
    { provide: PDF_FIRST_PAGE, useValue: async (pdf: Blob) => { drawn.push(pdf); return { url: 'blob:first-page', pages: 3 }; } },
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(RunItemFiles);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const files = () => http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/files'));
  return { fixture, http, el, files, drawn, navigated, closed };
}

/** Lets the panel's promises (a PDF's picture, one after another) run. */
const settle = () => new Promise(done => setTimeout(done, 0));

// ZT-I35: run #2950's item 1151 -- one report PDF made by a step with a long name.
const REPORT_STEP = 'The Patient intake summary (published template, signed on approval, QR verify)';
const INTAKE: ItemFilesData = { jobQueueId: 2950, ref: '1', label: '1151', stepKey: 'report', stepName: REPORT_STEP };
const PDF = (over: Partial<ItemFile> = {}): ItemFile => ({ fileRef: '1267', name: 'Patient_intake_S-1151_v1.pdf', role: 'output', stepKey: 'report',
  stepName: REPORT_STEP, format: 'pdf', bytes: 517_967, previewable: true, expired: false,
  report: { reportId: '01M5Y3GYFKZRAV9KKQ74D413D6', number: 'RPT-0086', version: 1, pages: 4 }, ...over });
const ONE = (f: ItemFile, over: Record<string, unknown> = {}) => ({ ref: '1', label: '1151', total: 1, page: 0, size: 15, bytes: f.bytes, files: [f],
  downloadable: true, ...over });
const SIGNED = { reportId: '01M5Y3GYFKZRAV9KKQ74D413D6', label: 'RPT-0086', versions: [
  { version: 1, approval: { approverName: 'Riverside Health reviewer', approvedAt: '2026-10-27T07:18:41Z', signed: true } },
  { version: 3, approval: { approverName: 'Someone else', approvedAt: '2026-10-27T19:40:15Z', signed: true } }] };
const thumbnail = (http: HttpTestingController) => http.expectOne(r => r.url.endsWith('/reportLibrary.json/thumbnail'));
const reportRead = (http: HttpTestingController) => http.expectOne(r => r.url.endsWith('/reportLibrary.json/report'));

describe('Run item files', () => {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  afterEach(() => { URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; vi.restoreAllMocks(); });

  it('lists fifteen at a time, with the step\'s name and the count, and reads the next fifteen', () => {
    URL.createObjectURL = () => 'blob:thumb';
    URL.revokeObjectURL = () => {};
    const { el, fixture, files, http } = mount();
    const first = files();
    expect(first.request.body).toEqual({ jobQueueId: 9020, ref: '5', stepKey: 'pages', page: 0, size: 15 });
    first.flush({ status: API_SUCCESS, data: FILES(0) });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('referral-0412.pdf · Page images');
    expect(el.querySelector('[data-test="files-count"]')?.textContent?.trim()).toBe('40 files · 18.0 MB');
    expect(el.querySelector('[data-test="files-range"]')?.textContent?.trim()).toBe('1–15 of 40');
    expect(el.querySelector('[data-test="files-zip"]')?.textContent).toContain('Download all (zip, 18.0 MB)');
    // Each image's thumbnail is its own bytes, read inline with the token.
    const thumbs = http.match(r => r.url.endsWith('/sourceJob.json/runItems/file'));
    expect(thumbs).toHaveLength(15);
    expect(thumbs[0].request.params.get('inline')).toBe('true');
    expect(thumbs[0].request.responseType).toBe('blob');
    thumbs.forEach(t => t.flush(new Blob(['png'])));
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-test="files-grid"] img').length).toBe(15);
    (el.querySelector('[data-test="files-next"]') as HTMLButtonElement).click();
    expect(files().request.body).toEqual({ jobQueueId: 9020, ref: '5', stepKey: 'pages', page: 1, size: 15 });
  });

  it('lists a sensitive pipeline\'s files to a person without the permission, reads none and says why (ZT-M21)', () => {
    const refusal = 'This pipeline\'s files are sensitive: downloading, viewing or previewing them needs the Download sensitive files permission. Ask your workspace admin.';
    const { el, fixture, files, http } = mount();
    files().flush({ status: API_SUCCESS, data: { ...FILES(0), downloadable: false, refusal } });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('referral-0412.pdf · Page images');
    expect(el.querySelector('[data-test="files-sensitive"]')?.textContent?.trim()).toBe(refusal);
    expect((el.querySelector('[data-test="files-zip"]') as HTMLButtonElement).disabled).toBe(true);
    http.expectNone(r => r.url.endsWith('/sourceJob.json/runItems/file'));
    expect([...el.querySelectorAll<HTMLButtonElement>('[data-test="files-grid"] button')].every(b => b.disabled)).toBe(true);
  });

  it('names a page\'s file by what follows its document\'s name, the whole name on hover (ZT-I18)', () => {
    URL.createObjectURL = () => 'blob:thumb';
    URL.revokeObjectURL = () => {};
    const { el, fixture, files } = mount();
    const named = FILES(0);
    named.files = named.files.map(f => ({ ...f, name: `referral-0412-${f.name}` }));
    files().flush({ status: API_SUCCESS, data: named });
    fixture.detectChanges();
    const caption = el.querySelector('[data-test="files-grid"] .rf-thumb-name')!;
    expect(caption.textContent?.trim()).toBe('page-01.png');
    expect(caption.getAttribute('title')).toBe('referral-0412-page-01.png');
  });

  it('downloads all of them as one zip: the link first, then the zip with its token', () => {
    const saved: string[] = [];
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download); });
    const { el, fixture, files, http } = mount();
    files().flush({ status: API_SUCCESS, data: FILES(0) });
    http.match(r => r.url.endsWith('/sourceJob.json/runItems/file')).forEach(t => t.flush(new Blob(['png'])));
    fixture.detectChanges();
    (el.querySelector('[data-test="files-zip"]') as HTMLButtonElement).click();
    const link = http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/zipLink'));
    expect(link.request.params.get('ref')).toBe('5');
    expect(link.request.params.get('stepKey')).toBe('pages');
    http.expectNone(r => r.url.endsWith('/sourceJob.json/runItems/zip'));
    link.flush({ status: API_SUCCESS, data: { token: 'tok-1', expiresAt: '2026-10-21T15:02:00Z', files: 40 } });
    const zip = http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/zip'));
    expect(zip.request.params.get('token')).toBe('tok-1');
    expect(zip.request.params.get('jobQueueId')).toBe('9020');
    zip.flush(new Blob(['zip']));
    expect(saved).toEqual(['referral-0412-files.zip']);
  });

  it('previews an image in place and goes back to the list', () => {
    URL.createObjectURL = () => 'blob:preview';
    URL.revokeObjectURL = () => {};
    const { el, fixture, files, http } = mount();
    files().flush({ status: API_SUCCESS, data: FILES(0) });
    http.match(r => r.url.endsWith('/sourceJob.json/runItems/file')).forEach(t => t.flush(new Blob(['png'])));
    fixture.detectChanges();
    (el.querySelector('[data-file="p3"]') as HTMLButtonElement).click();
    const read = http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/file') && r.params.get('fileRef') === 'p3');
    read.flush(new Blob(['png']));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="file-preview"]')?.textContent).toContain('page-03.png');
    expect(el.querySelector('.rf-preview img')?.getAttribute('src')).toBe('blob:preview');
  });

  // ZT-I35 (live run #2950): one grey "PDF" tile in an empty grid, the title the step's long name cut off, and Download all
  // (zip) for one file.
  it('shows one file as one larger card: the report\'s first page, its facts beside it, and no grid, search or zip', async () => {
    URL.createObjectURL = () => 'blob:report-thumb';
    URL.revokeObjectURL = () => {};
    const { el, fixture, files, http, drawn } = mount(INTAKE);
    files().flush({ status: API_SUCCESS, data: ONE(PDF()) });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('1151 · Patient intake summary');
    expect(el.querySelector('[data-test="files-step-desc"]')?.textContent?.trim()).toBe(REPORT_STEP);
    expect(el.querySelector('[data-test="files-count"]')?.textContent?.trim()).toBe('1 file · 505.8 KB');
    expect(el.querySelector('[data-test="files-one"]')).not.toBeNull();
    for (const gone of ['files-grid', 'files-list', 'files-zip', 'files-search', 'files-range']) {
      expect(el.querySelector(`[data-test="${gone}"]`), gone).toBeNull();
    }
    expect(el.querySelector('app-segmented')).toBeNull();
    // The report's own first page, from Report Studio (the version the run kept), and its approval.
    const thumb = thumbnail(http);
    expect(thumb.request.params.get('reportId')).toBe('01M5Y3GYFKZRAV9KKQ74D413D6');
    expect(thumb.request.params.get('version')).toBe('1');
    thumb.flush(new Blob(['png'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } });
    reportRead(http).flush({ status: API_SUCCESS, data: SIGNED });
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="files-one"] [data-test="file-thumb"]')?.getAttribute('src')).toBe('blob:report-thumb');
    expect(drawn).toHaveLength(0);
    http.expectNone(r => r.url.endsWith('/sourceJob.json/runItems/file'));
    const facts = [...el.querySelectorAll('[data-test="file-facts"] dt')].map(dt => `${dt.textContent?.trim()}: ${dt.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim()}`);
    expect(facts.slice(0, 4)).toEqual(['Type: PDF', 'Size: 505.8 KB', 'Pages: 4', 'Report: RPT-0086 · version 1']);
    expect(facts[4]).toMatch(/^Approval: Signed ✓ by Riverside Health reviewer · /);
    expect(el.querySelector('[data-test="file-pages"]')?.textContent?.trim()).toBe('4');
    expect(el.querySelector('[data-test="file-report"]')?.textContent?.trim()).toBe('RPT-0086 · version 1');
    const state = el.querySelector('[data-test="file-state"]')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(state).toMatch(/^Signed ✓ by Riverside Health reviewer · .+/);
    expect(state).not.toContain('Someone else');
    expect(el.querySelector('[data-test="file-name"]')?.textContent?.trim()).toBe('Patient_intake_S-1151_v1.pdf');
    expect([...el.querySelectorAll('[data-test="files-one"] .btn')].map(b => b.textContent?.trim())).toEqual(['Open', 'Download', 'Verify']);
  });

  it('verifies a signed report in Reports, at its version, and says Waiting for approval for one not yet approved', async () => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    const { el, fixture, files, http, navigated, closed } = mount(INTAKE);
    files().flush({ status: API_SUCCESS, data: ONE(PDF()) });
    thumbnail(http).flush(new Blob(['png']), { headers: { 'Content-Type': 'image/png' } });
    reportRead(http).flush({ status: API_SUCCESS, data: SIGNED });
    await settle();
    fixture.detectChanges();
    (el.querySelector('[data-test="file-verify"]') as HTMLButtonElement).click();
    expect(closed).toHaveLength(1);
    expect(navigated).toEqual([[['/reports/library', '01M5Y3GYFKZRAV9KKQ74D413D6'], { queryParams: { version: 1, verify: 1 } }]]);

    const waiting = mount(INTAKE);
    waiting.files().flush({ status: API_SUCCESS, data: ONE(PDF()) });
    thumbnail(waiting.http).flush(new Blob(['png']), { headers: { 'Content-Type': 'image/png' } });
    reportRead(waiting.http).flush({ status: API_SUCCESS, data: { ...SIGNED, versions: [{ version: 1, approval: null, review: { state: 'OPEN' } }] } });
    await settle();
    waiting.fixture.detectChanges();
    expect(waiting.el.querySelector('[data-test="file-state"]')?.textContent?.trim()).toBe('Waiting for approval');
    expect(waiting.el.querySelector('[data-test="file-verify"]')).toBeNull();
  });

  it('draws a plain PDF\'s first page here, and a report\'s too when Reports are not the reader\'s or say no picture', async () => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    // A PDF no report step made: its own bytes, drawn, with its pages counted.
    const plain = mount({ ...INTAKE, stepKey: 'notes', stepName: 'Notes' });
    plain.files().flush({ status: API_SUCCESS, data: ONE(PDF({ name: 'notes.pdf', report: null })) });
    const bytes = plain.http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/file'));
    expect(bytes.request.params.get('inline')).toBe('true');
    bytes.flush(new Blob(['%PDF']));
    await settle();
    plain.fixture.detectChanges();
    expect(plain.drawn).toHaveLength(1);
    expect(plain.drawn[0].type).toBe('application/pdf');
    expect(plain.el.querySelector('[data-test="file-thumb"]')?.getAttribute('src')).toBe('blob:first-page');
    expect(plain.el.querySelector('[data-test="file-pages"]')?.textContent?.trim()).toBe('3');
    expect(plain.el.querySelector('[data-test="file-report"]')).toBeNull();
    plain.http.expectNone(r => r.url.includes('/reportLibrary.json/'));

    // A reader who may not open Reports: nothing asked of Report Studio; the report's number and version still said.
    const reader = mount(INTAKE, false);
    reader.files().flush({ status: API_SUCCESS, data: ONE(PDF()) });
    reader.http.expectNone(r => r.url.includes('/reportLibrary.json/'));
    reader.http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/file')).flush(new Blob(['%PDF']));
    await settle();
    reader.fixture.detectChanges();
    expect(reader.el.querySelector('[data-test="file-thumb"]')?.getAttribute('src')).toBe('blob:first-page');
    expect(reader.el.querySelector('[data-test="file-report"]')?.textContent?.trim()).toBe('RPT-0086 · version 1');
    expect(reader.el.querySelector('[data-test="file-state"]')).toBeNull();

    // Report Studio has no picture of it (404): drawn here instead.
    const none = mount(INTAKE);
    none.files().flush({ status: API_SUCCESS, data: ONE(PDF()) });
    thumbnail(none.http).flush(null, { status: 404, statusText: 'Not found' });
    reportRead(none.http).flush({ status: API_SUCCESS, data: SIGNED });
    await settle();
    none.http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/file')).flush(new Blob(['%PDF']));
    await settle();
    none.fixture.detectChanges();
    expect(none.drawn).toHaveLength(1);
    expect(none.el.querySelector('[data-test="file-thumb"]')?.getAttribute('src')).toBe('blob:first-page');
  });

  it('keeps a file it cannot picture as its type\'s icon with its name', async () => {
    const { el, fixture, files, http } = mount({ ...INTAKE, stepKey: 'json', stepName: 'The intake JSON (what the EHR would take)' });
    files().flush({ status: API_SUCCESS, data: ONE(PDF({ fileRef: '1268', name: 'intake-S-1151.json', format: 'json', bytes: 4511, report: null })) });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('1151 · Intake JSON');
    const icon = el.querySelector('[data-test="files-one"] [data-test="file-type-icon"]')!;
    expect(icon.textContent).toContain('JSON');
    expect(icon.textContent).toContain('intake-S-1151.json');
    http.expectNone(r => r.url.endsWith('/sourceJob.json/runItems/file'));
    expect([...el.querySelectorAll('[data-test="files-one"] .btn')].map(b => b.textContent?.trim())).toEqual(['Open', 'Download']);
  });

  it('lists two files and up as Grid or List with Download all (zip), each with its type, size and report', async () => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    const { el, fixture, files, http } = mount({ ...INTAKE, stepKey: null, stepName: null });
    const json = PDF({ fileRef: '1268', name: 'intake-S-1151.json', format: 'json', bytes: 4511, report: null, stepKey: 'json' });
    files().flush({ status: API_SUCCESS, data: { ...ONE(PDF()), total: 2, bytes: 522_478, files: [PDF(), json] } });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('1151 · Files');
    expect(el.querySelector('[data-test="files-zip"]')?.textContent).toContain('Download all (zip, 510.2 KB)');
    expect(el.querySelector('[data-test="files-grid"]')).not.toBeNull();
    expect(el.querySelector('[data-test="files-one"]')).toBeNull();
    thumbnail(http).flush(new Blob(['png']), { headers: { 'Content-Type': 'image/png' } });
    reportRead(http).flush({ status: API_SUCCESS, data: SIGNED });
    await settle();
    fixture.detectChanges();
    const metas = [...el.querySelectorAll('[data-test="files-grid"] .rf-thumb-meta')].map(m => m.textContent?.trim());
    expect(metas).toEqual(['PDF · 505.8 KB · 4 pages · RPT-0086 v1', 'JSON · 4.4 KB']);
  });

  it('shows a skeleton only when the files take longer than 150 ms, and Try again when they could not be read', () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, files, http } = mount(INTAKE);
      const first = files();
      fixture.detectChanges();
      expect(el.querySelector('[data-test="files-skeleton"]')).toBeNull();
      vi.advanceTimersByTime(SKELETON_AFTER_MS + 1);
      fixture.detectChanges();
      expect(el.querySelector('[data-test="files-skeleton"]')).not.toBeNull();
      expect(el.querySelector('.side-panel-body')?.getAttribute('aria-busy')).toBe('true');
      first.flush({ status: 'ERROR', message: 'Core is restarting.' });
      fixture.detectChanges();
      expect(el.querySelector('[data-test="files-skeleton"]')).toBeNull();
      expect(el.querySelector('[data-test="files-error"]')?.textContent).toContain('Core is restarting.');
      ([...el.querySelectorAll<HTMLButtonElement>('[data-test="files-error"] button')].find(b => b.textContent?.includes('Try again')))!.click();
      const again = http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/files'));
      again.flush({ status: API_SUCCESS, data: { ...ONE(PDF()), total: 0, files: [] } });
      fixture.detectChanges();
      expect(el.querySelector('[data-test="files-empty"]')?.textContent).toContain('This step kept no files for the item.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads nothing of a sensitive pipeline\'s one file without the permission: its icon, its facts, no Open or Download (ZT-M21)', async () => {
    const refusal = 'This pipeline\'s files are sensitive: downloading, viewing or previewing them needs the Download sensitive files permission.';
    const { el, fixture, files, http } = mount(INTAKE);
    files().flush({ status: API_SUCCESS, data: ONE(PDF(), { downloadable: false, refusal }) });
    reportRead(http).flush({ status: API_SUCCESS, data: SIGNED });
    await settle();
    fixture.detectChanges();
    http.expectNone(r => r.url.endsWith('/sourceJob.json/runItems/file'));
    http.expectNone(r => r.url.endsWith('/reportLibrary.json/thumbnail'));
    expect(el.querySelector('[data-test="files-sensitive"]')?.textContent?.trim()).toBe(refusal);
    expect(el.querySelector('[data-test="files-one"] [data-test="file-type-icon"]')).not.toBeNull();
    expect((el.querySelector('[data-test="file-open"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-test="file-download"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
