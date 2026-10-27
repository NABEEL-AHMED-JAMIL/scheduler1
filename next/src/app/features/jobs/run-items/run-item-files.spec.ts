import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { RunItemFiles } from './run-item-files';
import { ItemFile } from './run-items.model';

/**
 * MIG-420, a step's files for one item: "Page images · 40 files", fifteen at a time, thumbnails read as blobs, and
 * Download all as a zip -- a short-lived link first, then the zip.
 */
const page = (n: number): ItemFile => ({ fileRef: `p${n}`, name: `page-${String(n).padStart(2, '0')}.png`, role: 'output', stepKey: 'pages',
  stepName: 'Page images', format: 'png', bytes: 460_000, previewable: true });

const FILES = (pageNo: number) => ({ ref: '5', label: 'referral-0412.pdf', total: 40, page: pageNo, size: 15, bytes: 18 * 1024 * 1024,
  files: Array.from({ length: pageNo === 2 ? 10 : 15 }, (_, i) => page(pageNo * 15 + i + 1)) });

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItemFiles], providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: { jobQueueId: 9020, ref: '5', label: 'referral-0412.pdf', stepKey: 'pages', stepName: 'Page images' } },
    { provide: DialogRef, useValue: { close: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(RunItemFiles);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const files = () => http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/files'));
  return { fixture, http, el, files };
}

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
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('Page images · 40 files');
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
    expect(el.querySelector('[data-test="files-title"]')?.textContent?.trim()).toBe('Page images · 40 files');
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
});
