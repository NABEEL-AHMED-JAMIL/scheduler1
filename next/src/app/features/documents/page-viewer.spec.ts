import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DocumentsApi } from './documents.service';
import { PageViewer, ViewerBox } from './page-viewer';

/**
 * MIG-272: the page viewer -- the io-frontend highlighter's approach on OCR page images. The page comes as a blob
 * through HttpClient (the token rides with it) and shows from an object URL that is revoked; the boxes sit over it in
 * the image's own pixel space, scaled to what is drawn; the selected value's box is highlighted and scrolled into view,
 * turning the page when it is on another one.
 */
const BOXES: ViewerBox[] = [
  { id: 1011, page: 1, box: { left: 464, top: 289, width: 128, height: 35 }, label: 'Invoice number', low: false },
  { id: 1012, page: 1, box: { left: 540, top: 149, width: 243, height: 35 }, label: 'Issue date', low: true },
  { id: 2001, page: 2, box: { left: 170, top: 110, width: 170, height: 55 }, label: 'Total', low: false },
];

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let made = 0;
const revoked: string[] = [];
const scrolled: string[] = [];
beforeEach(() => {
  made = 0;
  revoked.length = 0;
  scrolled.length = 0;
  URL.createObjectURL = () => `blob:page-${++made}`;
  URL.revokeObjectURL = (url: string) => { revoked.push(url); };
  (HTMLElement.prototype as unknown as { scrollTo: (o: unknown) => void }).scrollTo = function (this: HTMLElement) {
    scrolled.push(this.getAttribute('data-test') ?? '');
  };
});
afterEach(() => { URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; });

async function viewerWith(opts: { active?: number | null; fail?: boolean } = {}) {
  const api = {
    pageImage: vi.fn(() => opts.fail ? throwError(() => new HttpErrorResponse({ status: 404 })) : of(new Blob(['png'], { type: 'image/png' }))),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: DocumentsApi, useValue: api }] });
  const fixture = TestBed.createComponent(PageViewer);
  fixture.componentRef.setInput('ocrDocumentId', 1001);
  fixture.componentRef.setInput('pageCount', 2);
  fixture.componentRef.setInput('boxes', BOXES);
  fixture.componentRef.setInput('activeId', opts.active ?? null);
  await fixture.whenStable();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
}

/** The browser fires load with the image's natural size; the test DOM does not load images. */
async function load(fixture: Awaited<ReturnType<typeof viewerWith>>['fixture'], width = 1700, height = 1100) {
  const img = (fixture.nativeElement as HTMLElement).querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  img.dispatchEvent(new Event('load'));
  await fixture.whenStable();
}

describe('PageViewer', () => {
  it('fetches the page through the API and shows it from an object URL', async () => {
    const { api, el } = await viewerWith();
    expect(api.pageImage).toHaveBeenCalledWith(1001, 1);
    expect(el.querySelector('img')!.getAttribute('src')).toBe('blob:page-1');
    expect(el.textContent).toContain('Page 1 of 2');
  });

  it('draws the page\'s boxes in percent of the image, the flagged ones as such', async () => {
    const { fixture, el } = await viewerWith();
    expect(el.querySelectorAll('.doc-box')).toHaveLength(0);
    await load(fixture);
    const boxes = [...el.querySelectorAll<HTMLElement>('.doc-box')];
    expect(boxes.map(b => b.dataset['fieldId'])).toEqual(['1011', '1012']);
    expect(boxes[0].style.left).toBe('27.294%');
    expect(boxes[0].style.width).toBe('7.529%');
    expect(boxes[0].style.top).toBe('26.273%');
    expect(boxes[1].classList).toContain('doc-box-low');
    expect(boxes[0].getAttribute('aria-label')).toBe('Invoice number');
  });

  it('highlights the selected value\'s box and scrolls the viewer to it', async () => {
    const { fixture, el } = await viewerWith({ active: 1012 });
    await load(fixture);
    const active = el.querySelector<HTMLElement>('.doc-box-active');
    expect(active?.dataset['fieldId']).toBe('1012');
    expect(active?.getAttribute('aria-pressed')).toBe('true');
    expect(scrolled).toEqual(['page-scroll']);
    expect(fixture.componentInstance.revealed()).toBe(1012);
  });

  it('turns to the page a selected value is on, and lets the last page\'s image go', async () => {
    const { fixture, api, el } = await viewerWith();
    await load(fixture);
    fixture.componentRef.setInput('activeId', 2001);
    await fixture.whenStable();
    expect(fixture.componentInstance.page()).toBe(2);
    expect(api.pageImage).toHaveBeenLastCalledWith(1001, 2);
    expect(revoked).toEqual(['blob:page-1']);
    await load(fixture);
    expect([...el.querySelectorAll<HTMLElement>('.doc-box')].map(b => b.dataset['fieldId'])).toEqual(['2001']);
    expect(fixture.componentInstance.revealed()).toBe(2001);
  });

  it('tells the review screen which box was clicked', async () => {
    const { fixture, el } = await viewerWith();
    await load(fixture);
    const picked: number[] = [];
    fixture.componentInstance.pick.subscribe(id => picked.push(id));
    el.querySelectorAll<HTMLElement>('.doc-box')[1].click();
    expect(picked).toEqual([1012]);
  });

  it('zooms between 100% and 300%, the boxes keeping their place', async () => {
    const { fixture, el } = await viewerWith();
    await load(fixture);
    fixture.componentInstance.setZoom(1);
    fixture.componentInstance.setZoom(1);
    await fixture.whenStable();
    expect(el.querySelector<HTMLElement>('.page-viewer-sheet')!.style.width).toBe('200%');
    expect(el.querySelector<HTMLElement>('.doc-box')!.style.left).toBe('27.294%');
    fixture.componentInstance.setZoom(-1);
    fixture.componentInstance.setZoom(-1);
    fixture.componentInstance.setZoom(-1);
    expect(fixture.componentInstance.zoom()).toBe(1);
  });

  it('says so when the page cannot be fetched', async () => {
    const { el } = await viewerWith({ fail: true });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('It is not there any more');
  });

  it('revokes the object URL when it goes', async () => {
    const { fixture } = await viewerWith();
    fixture.destroy();
    expect(revoked).toEqual(['blob:page-1']);
  });
});
