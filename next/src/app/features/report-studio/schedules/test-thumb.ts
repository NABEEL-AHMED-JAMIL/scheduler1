import { Component, DestroyRef, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';

interface PdfPage { getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> }; }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy?(): void; }

/**
 * A test report's first page, drawn by pdf.js from the PDF the schedule's test made (an object URL the page owns) -- the
 * server's render, as the report will be, DRAFT included. A link opens the whole PDF.
 */
@Component({
  selector: 'app-sched-test-thumb',
  template: `
    <a class="stt" [href]="src()" target="_blank" rel="noopener" [attr.aria-label]="'Open test report: ' + name()">
      <canvas #page aria-hidden="true"></canvas>
      @if (failed()) { <span class="stt-none">The page could not be drawn; open the PDF.</span> }
    </a>
  `,
  styles: `
    .stt { display: block; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--paper); overflow: hidden;
      box-shadow: 0 1px 3px color-mix(in oklab, var(--text-primary) 14%, transparent); aspect-ratio: 210 / 297; position: relative; }
    .stt:hover { border-color: var(--border-strong); }
    .stt canvas { width: 100%; height: 100%; display: block; }
    .stt-none { position: absolute; inset: 0; display: grid; place-items: center; padding: 0.75rem; text-align: center; font-size: 0.75rem;
      color: var(--text-muted); }
  `,
})
export class SchedTestThumb {
  readonly src = input.required<string>();
  readonly name = input('');
  readonly failed = signal(false);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('page');
  private doc: PdfDoc | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; this.doc?.destroy?.(); });
    effect(() => {
      const url = this.src();
      const c = this.canvas()?.nativeElement;
      if (url && c) void this.draw(url, c);
    });
  }

  private async draw(url: string, canvas: HTMLCanvasElement): Promise<void> {
    try {
      this.failed.set(false);
      const pdfjs = await import('pdfjs-dist') as unknown as {
        GlobalWorkerOptions: { workerSrc: string }; getDocument(o: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
      };
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      const data = await (await fetch(url)).arrayBuffer();
      if (this.destroyed) return;
      this.doc?.destroy?.();
      this.doc = await pdfjs.getDocument({ data }).promise;
      const page = await this.doc.getPage(1);
      const width = canvas.clientWidth || 180;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width * Math.min(2, window.devicePixelRatio || 1)) / base.width });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch {
      if (!this.destroyed) this.failed.set(true);
    }
  }
}
