import { Component, DestroyRef, ElementRef, effect, inject, input, signal, viewChild, viewChildren } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

/** pdf.js's document and page, as far as this component uses them. */
interface PdfPage { getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> }; }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy?(): void; }

/** The paper a page size is, as the drawing names it ("A4 portrait"); empty for a size of its own. */
export function paperName(w: number, h: number): string {
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  const sizes: [string, number, number][] = [['A4', 210, 297], ['A3', 297, 420], ['A5', 148, 210], ['Letter', 216, 279], ['Legal', 216, 356]];
  for (const [name, sw, sh] of sizes) {
    if (near(w, sw) && near(h, sh)) return `${name} portrait`;
    if (near(w, sh) && near(h, sw)) return `${name} landscape`;
  }
  return '';
}

/** Pages drawn as thumbnails at most (a long report shows its first pages; the viewer still turns to every one). */
const THUMBS = 12;

/**
 * Create report's preview (MIG-404, Figma frame 5): the PDF the report will be -- the server's render, not an
 * approximation -- with its pages as thumbnails on the left and the chosen page large beside them, turned with the
 * arrows. pdf.js draws to canvases (the same library as the console's PDF viewer); nothing is uploaded or kept.
 */
@Component({
  selector: 'app-rs-pdf-pages',
  imports: [Icon],
  template: `
    <div class="rsp">
      <div class="rsp-thumbs" aria-label="Pages">
        @for (n of thumbs(); track n) {
          <button type="button" class="rsp-thumb" [class.is-active]="page() === n" (click)="go(n)" [attr.aria-label]="'Page ' + n"
                  [attr.aria-current]="page() === n ? 'page' : null">
            <canvas #thumb [attr.data-page]="n"></canvas>
            <span>{{ n }}@if (n === 1 && firstTitle()) { · {{ firstTitle() }} }</span>
          </button>
        }
        @if (count()) {
          <span class="text-xs text-[color:var(--text-muted)]">@if (paperWord()) { {{ paperWord() }}<br> }{{ sizeWord() }}<br>{{ count() }} page{{ count() === 1 ? '' : 's' }}</span>
        }
      </div>
      <div class="rsp-main">
        @if (count()) {
          <div class="rsp-nav">
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" [disabled]="page() <= 1" (click)="go(page() - 1)"><app-icon name="chevronLeft" /></button>
            <span class="text-xs tabular">Page {{ page() }} of {{ count() }}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Next page" [disabled]="page() >= count()" (click)="go(page() + 1)"><app-icon name="chevronRight" /></button>
          </div>
        }
        <div #scroller class="rsp-scroller">
          @if (error()) { <p class="text-sm text-[color:var(--crit-text)] p-6" role="alert">{{ error() }}</p> }
          @else if (!count()) { <div class="flex justify-center py-16"><span class="spinner" role="status" aria-label="Drawing the PDF"></span></div> }
          <canvas #big class="rsp-page" [class.hidden]="!count() || !!error()"></canvas>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .rsp { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); min-height: 30rem; background: var(--surface-sunken); }
    .rsp-thumbs { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; padding: 0.875rem; overflow-y: auto; max-height: 48rem;
      background: var(--surface-raised); border-right: 1px solid var(--border-subtle); }
    .rsp-thumb { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--text-muted); }
    .rsp-thumb canvas { width: 6rem; outline: 1px solid var(--border-subtle); background: var(--surface-raised); }
    .rsp-thumb.is-active canvas { outline: 2px solid var(--text-primary); outline-offset: 2px; }
    .rsp-thumb.is-active { color: var(--text-primary); }
    .rsp-main { display: flex; flex-direction: column; min-width: 0; }
    .rsp-nav { display: flex; align-items: center; justify-content: flex-end; gap: 0.25rem; padding: 0.375rem 0.75rem; }
    .rsp-scroller { flex: 1; overflow: auto; padding: 0.5rem 1.25rem 1.25rem; display: flex; justify-content: center; align-items: flex-start; max-height: 52rem; }
    .rsp-page { max-width: 100%; box-shadow: 0 1px 4px color-mix(in oklab, var(--text-primary) 14%, transparent); background: var(--surface-raised); }
  `,
})
export class PdfPages {
  /** An object URL of the PDF. */
  readonly src = input.required<string | null>();
  /** A name for page 1 (the report's first heading). */
  readonly firstTitle = input('');
  readonly page = signal(1);
  readonly count = signal(0);
  readonly thumbs = signal<number[]>([]);
  readonly error = signal('');
  readonly sizeWord = signal('');
  readonly paperWord = signal('');
  private readonly big = viewChild<ElementRef<HTMLCanvasElement>>('big');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly thumbCanvases = viewChildren<ElementRef<HTMLCanvasElement>>('thumb');
  private doc: PdfDoc | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; this.doc?.destroy?.(); });
    effect(() => {
      const url = this.src();
      if (url) void this.open(url);
    });
    effect(() => {
      this.page();
      if (this.doc && this.big()) void this.draw();
    });
    effect(() => {
      const canvases = this.thumbCanvases();
      if (this.doc && canvases.length) void this.drawThumbs(canvases.map(c => c.nativeElement));
    });
  }

  go(n: number): void {
    this.page.set(Math.max(1, Math.min(this.count(), n)));
  }

  private async open(url: string): Promise<void> {
    try {
      this.error.set('');
      this.count.set(0);
      this.thumbs.set([]);
      const pdfjs = await import('pdfjs-dist') as unknown as {
        GlobalWorkerOptions: { workerSrc: string }; getDocument(o: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
      };
      // As the console's PDF viewer: the worker is the file angular.json copies to this path.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      const data = await (await fetch(url)).arrayBuffer();
      if (this.destroyed) return;
      this.doc?.destroy?.();
      this.doc = await pdfjs.getDocument({ data }).promise;
      if (this.destroyed) return;
      const first = await this.doc.getPage(1);
      const v = first.getViewport({ scale: 1 });
      const mm = (pt: number) => Math.round(pt / 72 * 25.4);
      this.sizeWord.set(`${mm(v.width)} × ${mm(v.height)} mm`);
      this.paperWord.set(paperName(mm(v.width), mm(v.height)));
      this.count.set(this.doc.numPages);
      this.thumbs.set(Array.from({ length: Math.min(THUMBS, this.doc.numPages) }, (_, i) => i + 1));
      this.page.set(1);
      await this.draw();
    } catch (e) {
      if (!this.destroyed) this.error.set(`This PDF could not be drawn: ${(e as Error)?.message ?? e}`);
    }
  }

  private async draw(): Promise<void> {
    const canvas = this.big()?.nativeElement;
    const doc = this.doc;
    if (!canvas || !doc) return;
    const page = await doc.getPage(this.page());
    const width = Math.max(320, (this.scroller()?.nativeElement.clientWidth ?? 640) - 40);
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / ratio}px`;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }

  private async drawThumbs(canvases: HTMLCanvasElement[]): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    for (const canvas of canvases) {
      const n = Number(canvas.dataset['page']);
      if (!n || canvas.dataset['drawn'] === '1') continue;
      canvas.dataset['drawn'] = '1';
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (96 / base.width) * 2 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  }
}
