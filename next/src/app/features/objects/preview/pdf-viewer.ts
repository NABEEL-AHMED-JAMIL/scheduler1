import {
  AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, input, signal, viewChild,
} from '@angular/core';
import { Icon } from '../../../shared/ui/icon';

/** The zoom's bounds, and a fit-to-width's: a page is never drawn under half size, nor fitted past 250 % (a 1920 pane). */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const FIT_MAX = 2.5;

/**
 * Owner 2026-10-27: the zoom that fits a page's width to the pane's -- the whole width the pane has, no padding of the
 * viewer's own -- in hundredths, within ZOOM_MIN and FIT_MAX.
 */
export function fitScale(paneWidth: number, pageWidth: number): number {
  if (!(paneWidth > 0) || !(pageWidth > 0)) return 1;
  return Math.min(FIT_MAX, Math.max(ZOOM_MIN, Math.floor((paneWidth / pageWidth) * 100) / 100));
}

/**
 * A real PDF viewer rather than an <iframe> pointed at a blob.
 *
 * The browser's built-in viewer renders nothing at all in an embedded frame here, and even
 * where it works it brings its own chrome that ignores the theme and cannot be driven from
 * the surrounding toolbar. pdf.js draws to a canvas, which means page navigation, zoom and
 * the loading and error states all belong to this application.
 */
@Component({
  selector: 'app-pdf-viewer',
  imports: [Icon],
  // The tag itself is the box: a shrinkable flex column that fills whatever holds it (a flex dialog body or a
  // fixed-height div). Inline, its inner h-full had no height to take and the page scroller grew to the whole
  // PDF, so a billing document opened in its dialog could not be scrolled.
  // Owner 2026-10-27: and as wide as its box -- the toolbar spans it, the page is fitted to its width.
  host: { class: 'flex flex-col flex-1 min-h-0 h-full w-full min-w-0' },
  template: `
    <div class="flex flex-col flex-1 min-h-0">
      @if (pageCount()) {
        <div class="flex items-center gap-1 px-3 py-1.5 border-b shrink-0 border-subtle bg-raised"
            >
          <!-- ZT-U2: pages and zoom are each one bordered group (.seg), the value between its arrows, as every viewer's. -->
          <div class="seg" role="group" aria-label="Pages">
            <button type="button" class="seg-btn seg-icon" (click)="go(-1)"
                    [disabled]="page() <= 1" title="Previous page" aria-label="Previous page">
              <app-icon name="chevronLeft" />
            </button>
            <span class="seg-value" aria-live="polite">
              {{ page() }}&nbsp;<span class="text-[color:var(--text-muted)]">of {{ pageCount() }}</span>
            </span>
            <button type="button" class="seg-btn seg-icon" (click)="go(1)"
                    [disabled]="page() >= pageCount()" title="Next page" aria-label="Next page">
              <app-icon name="chevronRight" />
            </button>
          </div>

          <div class="seg ml-1.5" role="group" aria-label="Zoom">
            <button type="button" class="seg-btn seg-icon" (click)="zoomBy(-0.25)"
                    [disabled]="scale() <= zoomMin" title="Zoom out" aria-label="Zoom out"><app-icon name="minus" /></button>
            <button type="button" class="seg-btn seg-value min-w-14" (click)="fit()" data-test="pdf-zoom" [attr.aria-pressed]="fitting()"
                    title="Fit to width" [attr.aria-label]="'Zoom ' + zoomLabel() + ': fit to width'">{{ zoomLabel() }}</button>
            <button type="button" class="seg-btn seg-icon" (click)="zoomBy(0.25)"
                    [disabled]="scale() >= zoomMax" title="Zoom in" aria-label="Zoom in"><app-icon name="plus" /></button>
          </div>

          @if (rendering()) {
            <app-icon name="refresh" class="spin icon-muted ml-2" size="0.9em" />
          }
        </div>
      }

      <!-- The pane's own width, no side padding: a page wider than it (zoomed in) scrolls from its left edge (safe center),
           and the scroll bar's room is kept from the start, so a fitted page never overflows once the bar appears. -->
      <div #scroller class="flex-1 min-w-0 overflow-auto py-3 flex items-start [justify-content:safe_center] [scrollbar-gutter:stable]"
           data-test="pdf-scroller">
        @if (error()) {
          <div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <app-icon name="alert" size="1.75rem" class="icon-crit" />
            <p class="text-sm text-crit-500">{{ error() }}</p>
            @if (src(); as url) {
              <button type="button" class="btn btn-default btn-sm" (click)="open(url)"><app-icon name="refresh" />Try again</button>
            }
          </div>
        } @else if (pageError()) {
          <!-- One page that will not draw; the toolbar still moves to the others. -->
          <div class="flex flex-col items-center justify-center gap-3 py-20 text-center" role="alert">
            <app-icon name="alert" size="1.75rem" class="icon-crit" />
            <p class="text-sm text-crit-500">{{ pageError() }}</p>
          </div>
        } @else if (!pageCount()) {
          <div class="flex flex-col items-center justify-center gap-3 py-20">
            <div class="spinner mx-auto" role="status" aria-label="Loading"></div>
            <p class="text-sm text-[color:var(--text-muted)]">Rendering PDF…</p>
          </div>
        }
        <canvas #canvas class="rounded shadow-sm shrink-0"
                [class.hidden]="!pageCount() || !!error() || !!pageError()"></canvas>
      </div>
    </div>
  `,
})
export class PdfViewer implements AfterViewInit, OnDestroy {
  readonly src = input.required<string | null>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scrollerRef = viewChild.required<ElementRef<HTMLElement>>('scroller');

  readonly page = signal(1);
  readonly pageCount = signal(0);
  readonly scale = signal(1);
  readonly rendering = signal(false);
  /** The document could not be opened: terminal until Try again. */
  readonly error = signal('');
  /** The page on screen could not be drawn: cleared by the next draw, so other pages still show. */
  readonly pageError = signal('');

  readonly zoomLabel = computed(() => `${Math.round(this.scale() * 100)}%`);
  readonly zoomMin = ZOOM_MIN;
  readonly zoomMax = ZOOM_MAX;
  /** The page follows the pane's width (the default, and after the zoom's value is chosen); zooming in or out leaves it. */
  readonly fitting = signal(true);
  private resize?: ResizeObserver;
  private lastWidth = 0;
  private refit: ReturnType<typeof setTimeout> | null = null;

  private doc: any = null;
  private renderTask: any = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const url = this.src();
      if (url) void this.open(url);
    });
    effect(() => {
      this.page();
      this.scale();
      if (this.doc) void this.draw();
    });
  }

  async open(url: string): Promise<void> {
    try {
      this.error.set('');
      this.pageCount.set(0);
      const pdfjs: any = await import('pdfjs-dist');
      // Without an explicit worker the library falls back to the main thread and warns.
      // Angular's esbuild builder (@angular/build:application) does not rewrite `new URL(...,
      // import.meta.url)` the way Vite does -- this resolves to a plain, unhashed path served
      // from the deployed origin's root, and it is only reachable at all because angular.json's
      // `assets` config explicitly copies pdfjs-dist's worker file to that exact path. Change
      // this path and the asset entry together, or the worker silently 404s (behind nginx's SPA
      // fallback, so it looks like index.html loaded instead of throwing a clean 404).
      pdfjs.GlobalWorkerOptions.workerSrc =
        new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

      const data = await (await fetch(url)).arrayBuffer();
      if (this.destroyed) return;
      this.doc = await pdfjs.getDocument({ data }).promise;
      if (this.destroyed) return;
      this.pageCount.set(this.doc.numPages);
      this.page.set(1);
      await this.fitInternal();
    } catch (err: any) {
      if (this.destroyed) return;
      this.error.set(err?.message ? `This PDF could not be opened: ${err.message}` : 'This PDF could not be opened.');
    }
  }

  /** The pane's width for a page: the scroller's inside (its scroll bar's room already left out). */
  paneWidth(): number {
    return this.scrollerRef().nativeElement.clientWidth;
  }

  private async fitInternal(): Promise<void> {
    if (!this.doc) return;
    this.fitting.set(true);
    const first = await this.doc.getPage(this.page());
    const unscaled = first.getViewport({ scale: 1 });
    this.lastWidth = this.paneWidth();
    const next = fitScale(Math.max(240, this.lastWidth), unscaled.width);
    // The same zoom draws nothing new by itself (the effect only follows a change).
    if (next === this.scale()) await this.draw(); else this.scale.set(next);
  }

  ngAfterViewInit(): void {
    // A pane that changes width (a dialog opening, a panel beside it, the window) keeps a fitted page fitted.
    if (typeof ResizeObserver === 'undefined') return;
    this.resize = new ResizeObserver(() => {
      const width = this.paneWidth();
      if (!this.doc || !this.fitting() || Math.abs(width - this.lastWidth) < 2) return;
      if (this.refit) clearTimeout(this.refit);
      this.refit = setTimeout(() => void this.fitInternal(), 120);
    });
    this.resize.observe(this.scrollerRef().nativeElement);
  }

  private async draw(): Promise<void> {
    if (!this.doc || this.destroyed) return;
    // A pending render must be cancelled first: pdf.js throws if two renders share a canvas.
    if (this.renderTask) {
      try { this.renderTask.cancel(); } catch { /* already finished */ }
      this.renderTask = null;
    }
    this.rendering.set(true);
    this.pageError.set('');
    const wanted = this.page();
    try {
      const page = await this.doc.getPage(wanted);
      const viewport = page.getViewport({ scale: this.scale() });
      const canvas = this.canvasRef().nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.renderTask = page.render({ canvasContext: context, viewport });
      await this.renderTask.promise;
      this.renderTask = null;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException' && !this.destroyed) {
        this.pageError.set(`Page ${wanted} could not be drawn.`);
      }
    } finally {
      if (!this.destroyed) this.rendering.set(false);
    }
  }

  go(delta: number): void {
    this.page.update(p => Math.min(this.pageCount(), Math.max(1, p + delta)));
  }

  zoomBy(delta: number): void {
    this.fitting.set(false);
    this.scale.update(s => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 100) / 100)));
  }

  fit(): void { void this.fitInternal(); }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resize?.disconnect();
    if (this.refit) clearTimeout(this.refit);
    try { this.renderTask?.cancel(); } catch { /* nothing in flight */ }
    try { this.doc?.destroy(); } catch { /* already gone */ }
  }
}
