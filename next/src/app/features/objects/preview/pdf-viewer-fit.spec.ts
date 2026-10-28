import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FIT_MAX, PdfViewer, ZOOM_MIN, fitScale } from './pdf-viewer';

// A stand-in for pdf.js: a one-page Letter PDF (612 x 792 points) that draws nothing.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: Promise.resolve({
    numPages: 1,
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    }),
    destroy: () => {},
  }) }),
}));

/**
 * Owner 2026-10-27 (Billing › Documents, Riverside admin): the PDF sat in a narrower centred box, its toolbar and page
 * with wide empty bands left and right of the reading pane. The viewer fills its box; the page fits the pane's width
 * (no side padding of its own) within sensible bounds; zooming still works and leaves the fit.
 */
describe('app-pdf-viewer: fills its pane and fits the page to its width', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fits a page to the whole pane, in hundredths, never under half size nor past 250 %', () => {
    expect(fitScale(1224, 612)).toBe(2);
    expect(fitScale(900, 612)).toBe(1.47);
    expect(fitScale(4000, 612)).toBe(FIT_MAX);
    expect(fitScale(100, 612)).toBe(ZOOM_MIN);
    expect(fitScale(0, 612)).toBe(1);
  });

  it('is as wide as its box, with no side padding of its own and the scroll bar\'s room kept', () => {
    const fixture = TestBed.createComponent(PdfViewer);
    fixture.componentRef.setInput('src', null);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('w-full')).toBe(true);
    expect(host.classList.contains('min-w-0')).toBe(true);
    const scroller = host.querySelector('[data-test="pdf-scroller"]')!;
    expect([...scroller.classList].filter(c => /^(p|px|pl|pr)-/.test(c))).toEqual([]);
    expect(scroller.classList).toContain('[scrollbar-gutter:stable]');
    expect(scroller.classList).toContain('[justify-content:safe_center]');
  });

  it('opens fitted to the pane\'s width, and zooming in leaves the fit until the zoom\'s value is chosen again', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['%PDF'])));
    const fixture = TestBed.createComponent(PdfViewer);
    const viewer = fixture.componentInstance;
    vi.spyOn(viewer, 'paneWidth').mockReturnValue(1224);
    fixture.componentRef.setInput('src', 'blob:pdf');
    fixture.detectChanges();
    await viewer.open('blob:pdf');
    fixture.detectChanges();
    expect(viewer.scale()).toBe(2);
    expect(viewer.fitting()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="pdf-zoom"]')?.textContent?.trim()).toBe('200%');
    viewer.zoomBy(0.25);
    expect(viewer.scale()).toBe(2.25);
    expect(viewer.fitting()).toBe(false);
    viewer.fit();
    await new Promise(done => setTimeout(done, 0));
    expect(viewer.scale()).toBe(2);
    expect(viewer.fitting()).toBe(true);
  });
});
