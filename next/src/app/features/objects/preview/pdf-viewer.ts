import {
  Component, ElementRef, OnDestroy, computed, effect, input, signal, viewChild,
} from '@angular/core';
import { Icon } from '../../../shared/ui/icon';

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
  template: `
    <div class="flex flex-col h-full">
      @if (pageCount()) {
        <div class="flex items-center gap-1 px-3 py-1.5 border-b shrink-0"
             style="border-color: var(--border-subtle); background: var(--surface-raised);">
          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="go(-1)"
                  [disabled]="page() <= 1" title="Previous page">
            <app-icon name="chevronLeft" />
          </button>
          <span class="text-xs tabular px-1">
            {{ page() }} <span class="text-[color:var(--text-muted)]">of {{ pageCount() }}</span>
          </span>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="go(1)"
                  [disabled]="page() >= pageCount()" title="Next page">
            <app-icon name="chevronRight" />
          </button>

          <span class="w-px h-4 mx-1.5" style="background: var(--border-subtle);"></span>

          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="zoomBy(-0.25)"
                  [disabled]="scale() <= 0.5" title="Zoom out"><app-icon name="minus" /></button>
          <button type="button" class="btn btn-ghost btn-sm min-w-14 tabular" (click)="fit()"
                  title="Fit to width">{{ zoomLabel() }}</button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="zoomBy(0.25)"
                  [disabled]="scale() >= 3" title="Zoom in"><app-icon name="plus" /></button>

          @if (rendering()) {
            <app-icon name="refresh" class="spin icon-muted ml-2" size="0.9em" />
          }
        </div>
      }

      <div #scroller class="flex-1 overflow-auto p-4 flex justify-center items-start">
        @if (error()) {
          <div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <app-icon name="alert" size="1.75rem" class="icon-crit" />
            <p class="text-sm text-crit-500">{{ error() }}</p>
          </div>
        } @else if (!pageCount()) {
          <div class="flex flex-col items-center justify-center gap-3 py-20">
            <div class="spinner mx-auto" role="status" aria-label="Loading"></div>
            <p class="text-sm text-[color:var(--text-muted)]">Rendering PDF…</p>
          </div>
        }
        <canvas #canvas class="rounded shadow-sm max-w-full"
                [class.hidden]="!pageCount() || !!error()"></canvas>
      </div>
    </div>
  `,
})
export class PdfViewer implements OnDestroy {
  readonly src = input.required<string | null>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scrollerRef = viewChild.required<ElementRef<HTMLElement>>('scroller');

  readonly page = signal(1);
  readonly pageCount = signal(0);
  readonly scale = signal(1);
  readonly rendering = signal(false);
  readonly error = signal('');

  readonly zoomLabel = computed(() => `${Math.round(this.scale() * 100)}%`);

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

  private async open(url: string): Promise<void> {
    try {
      this.error.set('');
      this.pageCount.set(0);
      const pdfjs: any = await import('pdfjs-dist');
      // Without an explicit worker the library falls back to the main thread and warns; the
      // URL is resolved through the bundler so it is hashed and served like any other asset.
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

  private async fitInternal(): Promise<void> {
    if (!this.doc) return;
    const first = await this.doc.getPage(1);
    const unscaled = first.getViewport({ scale: 1 });
    const available = Math.max(240, this.scrollerRef().nativeElement.clientWidth - 32);
    this.scale.set(Math.min(3, Math.max(0.5, Math.round((available / unscaled.width) * 100) / 100)));
    await this.draw();
  }

  private async draw(): Promise<void> {
    if (!this.doc || this.destroyed) return;
    // A pending render must be cancelled first: pdf.js throws if two renders share a canvas.
    if (this.renderTask) {
      try { this.renderTask.cancel(); } catch { /* already finished */ }
      this.renderTask = null;
    }
    this.rendering.set(true);
    try {
      const page = await this.doc.getPage(this.page());
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
        this.error.set('This page could not be drawn.');
      }
    } finally {
      if (!this.destroyed) this.rendering.set(false);
    }
  }

  go(delta: number): void {
    this.page.update(p => Math.min(this.pageCount(), Math.max(1, p + delta)));
  }

  zoomBy(delta: number): void {
    this.scale.update(s => Math.min(3, Math.max(0.5, Math.round((s + delta) * 100) / 100)));
  }

  fit(): void { void this.fitInternal(); }

  ngOnDestroy(): void {
    this.destroyed = true;
    try { this.renderTask?.cancel(); } catch { /* nothing in flight */ }
    try { this.doc?.destroy(); } catch { /* already gone */ }
  }
}
