import {
  Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, input, signal, viewChild, viewChildren,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Icon } from '../../shared/ui/icon';
import { ReportStudioApi, studioError } from './report-studio.api';
import { size } from './report-studio.model';

/** pdf.js's document and page, as far as the viewer uses them. */
interface PdfViewport { width: number; height: number; }
interface PdfPage {
  getViewport(o: { scale: number }): PdfViewport;
  render(o: unknown): { promise: Promise<void>; cancel(): void };
  getTextContent(): Promise<{ items: { str?: string }[] }>;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy?(): void; }

/** The zoom steps the − and + buttons walk, and the fit's bounds. */
export const VIEWER_ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** The next zoom step from {@code now} in {@code dir} (+1 in, -1 out); the ends stay. */
export function nextZoom(now: number, dir: 1 | -1): number {
  if (dir > 0) return VIEWER_ZOOMS.find(z => z > now + 0.001) ?? VIEWER_ZOOMS[VIEWER_ZOOMS.length - 1];
  return [...VIEWER_ZOOMS].reverse().find(z => z < now - 0.001) ?? VIEWER_ZOOMS[0];
}

/** The pages whose text holds {@code words} (case-blind, spaces folded), in page order. */
export function pagesWith(texts: string[], words: string): number[] {
  const want = words.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!want) return [];
  return texts.map((t, i) => (t.toLowerCase().replace(/\s+/g, ' ').includes(want) ? i + 1 : 0)).filter(n => n > 0);
}

/** Pages drawn in the rail at most (a long report's later pages are reached with the arrows). */
const RAIL_PAGES = 24;

/**
 * A report version read in place (reports redesign, owner 2026-11-02; design report.html): the document is the page -- a
 * rail of its pages, the page large with zoom, fit to width, page turning, find, print and full screen, and the same
 * version as PDF or HTML. The file comes through the reader's own signed, audited download (as Download does): the PDF
 * drawn by pdf.js, the HTML in a sandboxed frame that can run nothing and reach nothing.
 */
@Component({
  selector: 'app-report-viewer',
  imports: [Icon],
  host: { class: 'rv-host' },
  styles: [`
    :host { display: grid; gap: 1.25rem; grid-template-columns: 6.5rem minmax(0, 1fr); align-items: start; min-width: 0; }
    @media (max-width: 1180px) { :host { grid-template-columns: minmax(0, 1fr); } .rv-rail { display: none !important; } }
    .rv-rail { display: flex; flex-direction: column; gap: 0.75rem; position: sticky; top: 4.5rem; max-height: calc(100vh - 6rem); overflow: auto;
      padding: 2px; }
    .rv-th { border: 2px solid transparent; border-radius: var(--radius-md); padding: 3px; background: none; cursor: pointer; text-align: center; }
    .rv-th.is-on { border-color: var(--text-primary); }
    .rv-th canvas { width: 100%; display: block; background: #fff; box-shadow: 0 1px 3px color-mix(in oklab, var(--text-primary) 18%, transparent); }
    .rv-th span { font-size: 0.6875rem; color: var(--text-muted); display: block; margin-top: 0.1875rem; }
    .rv-box { background: var(--surface-sunken); border: 1px solid var(--border-subtle); border-radius: var(--radius-xl, 10px); min-width: 0; }
    .rv-box:fullscreen { overflow: auto; border-radius: 0; }
    .rv-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-raised); border-radius: var(--radius-xl, 10px) var(--radius-xl, 10px) 0 0; position: sticky; top: 3.5rem; z-index: 2; }
    .rv-bar .grow { flex: 1; }
    .rv-find { display: flex; gap: 0.25rem; align-items: center; }
    .rv-find input { width: 11rem; }
    .rv-page { padding: 1.75rem; display: flex; justify-content: safe center; overflow: auto; min-height: 30rem; }
    .rv-page canvas { background: #fff; box-shadow: 0 2px 10px color-mix(in oklab, var(--text-primary) 14%, transparent); flex: none; }
    .rv-html { width: 100%; height: 80vh; border: 0; background: #fff; border-radius: 0 0 var(--radius-xl, 10px) var(--radius-xl, 10px); }
    .rv-msg { padding: 5rem 1rem; text-align: center; }
  `],
  template: `
    <nav class="rv-rail" aria-label="Pages">
      @for (n of railPages(); track n) {
        <button type="button" class="rv-th" [class.is-on]="page() === n" (click)="go(n)" [attr.aria-label]="'Page ' + n"
                [attr.aria-current]="page() === n ? 'page' : null">
          <canvas #rail [attr.data-page]="n"></canvas><span>{{ n }}</span>
        </button>
      }
    </nav>
    <div class="rv-box" #box>
      <div class="rv-bar" role="toolbar" aria-label="Report viewer">
        @if (hasHtml()) {
          <div class="seg" role="group" aria-label="Format">
            <button type="button" class="seg-btn" [class.seg-on]="format() === 'PDF'" [attr.aria-pressed]="format() === 'PDF'" (click)="show('PDF')">PDF</button>
            <button type="button" class="seg-btn" [class.seg-on]="format() === 'HTML'" [attr.aria-pressed]="format() === 'HTML'" (click)="show('HTML')" data-test="viewer-html">HTML</button>
          </div>
        }
        <span class="text-xs text-[color:var(--text-muted)]" data-test="viewer-facts">{{ facts() }}</span>
        <span class="grow"></span>
        @if (format() === 'PDF' && count()) {
          <div class="seg" role="group" aria-label="Zoom">
            <button type="button" class="seg-btn seg-icon" (click)="zoom(-1)" [disabled]="scale() <= 0.5" aria-label="Zoom out" title="Zoom out"><app-icon name="minus" /></button>
            <span class="seg-value tabular min-w-12 text-center" aria-live="polite">{{ zoomLabel() }}</span>
            <button type="button" class="seg-btn seg-icon" (click)="zoom(1)" [disabled]="scale() >= 3" aria-label="Zoom in" title="Zoom in"><app-icon name="plus" /></button>
          </div>
          <button type="button" class="btn btn-default btn-sm" [attr.aria-pressed]="fitting()" (click)="fit()">Fit width</button>
          <div class="seg" role="group" aria-label="Pages">
            <button type="button" class="seg-btn seg-icon" (click)="go(page() - 1)" [disabled]="page() <= 1" aria-label="Previous page" title="Previous page"><app-icon name="chevronLeft" /></button>
            <span class="seg-value tabular" aria-live="polite" data-test="viewer-page">{{ page() }} / {{ count() }}</span>
            <button type="button" class="seg-btn seg-icon" (click)="go(page() + 1)" [disabled]="page() >= count()" aria-label="Next page" title="Next page"><app-icon name="chevronRight" /></button>
          </div>
          @if (finding()) {
            <form class="rv-find" (submit)="$event.preventDefault(); findNext()" role="search">
              <input #findBox class="input input-sm" type="search" placeholder="Find in the report" aria-label="Find in the report"
                     [value]="findWords()" (input)="findWords.set($any($event.target).value); findHits.set(null)" />
              <span class="text-xs text-[color:var(--text-muted)] whitespace-nowrap" aria-live="polite" data-test="viewer-find">{{ findWordsOut() }}</span>
              <button type="submit" class="btn btn-default btn-icon btn-sm" aria-label="Find the next page" title="Next match"><app-icon name="arrowDown" /></button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Close find" (click)="finding.set(false)"><app-icon name="close" /></button>
            </form>
          } @else {
            <button type="button" class="btn btn-default btn-icon btn-sm" (click)="openFind()" aria-label="Find in the report" title="Find"><app-icon name="search" /></button>
          }
          <button type="button" class="btn btn-default btn-icon btn-sm" (click)="print()" aria-label="Print" title="Print"><app-icon name="printer" /></button>
        }
        <button type="button" class="btn btn-default btn-icon btn-sm" (click)="fullScreen()" aria-label="Full screen" title="Full screen"><app-icon name="maximize" /></button>
      </div>
      @if (error()) {
        <div class="rv-msg" role="alert"><app-icon name="alert" class="icon-crit" size="1.5rem" />
          <p class="text-sm mt-2">{{ error() }}</p>
          <button type="button" class="btn btn-default btn-sm mt-3" (click)="load()"><app-icon name="refresh" />Try again</button></div>
      } @else if (format() === 'HTML') {
        @if (htmlUrl(); as u) { <iframe class="rv-html" [src]="u" sandbox="" title="The report as HTML" referrerpolicy="no-referrer"></iframe> }
        @else { <div class="rv-msg"><div class="spinner mx-auto" role="status" aria-label="Loading"></div></div> }
      } @else {
        <div class="rv-page" #scroller>
          @if (!count()) { <div class="rv-msg"><div class="spinner mx-auto" role="status" aria-label="Loading"></div><p class="text-sm text-[color:var(--text-muted)] mt-2">Opening the report…</p></div> }
          <canvas #canvas [class.hidden]="!count()" [attr.aria-label]="'Page ' + page() + ' of ' + count()" role="img"></canvas>
        </div>
      }
    </div>
  `,
})
export class ReportViewer implements OnInit {
  readonly reportId = input.required<string>();
  readonly version = input.required<number>();
  /** Whether the version has an HTML file too (the PDF / HTML switch). */
  readonly hasHtml = input(false);
  /** What the facts line says beside the size: "signed after approval", "signed". */
  readonly note = input('');
  readonly tenantId = input<number | null>(null);

  private readonly api = inject(ReportStudioApi);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly boxRef = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly findRef = viewChild<ElementRef<HTMLInputElement>>('findBox');
  private readonly railRefs = viewChildren<ElementRef<HTMLCanvasElement>>('rail');

  readonly format = signal<'PDF' | 'HTML'>('PDF');
  readonly page = signal(1);
  readonly count = signal(0);
  readonly scale = signal(1);
  readonly fitting = signal(true);
  readonly error = signal('');
  readonly bytes = signal<number | null>(null);
  readonly htmlUrl = signal<SafeResourceUrl | null>(null);
  readonly finding = signal(false);
  readonly findWords = signal('');
  readonly findHits = signal<number[] | null>(null);
  readonly zoomLabel = computed(() => `${Math.round(this.scale() * 100)}%`);
  readonly railPages = computed(() => Array.from({ length: Math.min(this.count(), RAIL_PAGES) }, (_, i) => i + 1));
  readonly facts = computed(() => [this.bytes() != null ? size(this.bytes()) : '', this.note()].filter(Boolean).join(' · '));
  readonly findWordsOut = computed(() => {
    const hits = this.findHits();
    if (hits == null) return '';
    return hits.length ? `on page${hits.length === 1 ? '' : 's'} ${hits.join(', ')}` : 'not found';
  });

  private doc: PdfDoc | null = null;
  private pdfBlob: Blob | null = null;
  private htmlObject: string | null = null;
  private texts: string[] | null = null;
  private task: { cancel(): void } | null = null;
  private resize?: ResizeObserver;
  private destroyed = false;

  constructor() {
    effect(() => {
      this.page();
      this.scale();
      if (this.doc && this.format() === 'PDF') void this.draw();
    });
    effect(() => {
      // The rail is drawn once its canvases exist.
      const rails = this.railRefs();
      if (this.doc && rails.length) void this.drawRail(rails.map(r => r.nativeElement));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.resize?.disconnect();
      this.doc?.destroy?.();
      if (this.htmlObject) URL.revokeObjectURL(this.htmlObject);
    });
  }

  ngOnInit(): void {
    this.load();
    if (typeof ResizeObserver !== 'undefined') {
      let last = 0;
      this.resize = new ResizeObserver(() => {
        const w = this.scrollerRef()?.nativeElement.clientWidth ?? 0;
        if (this.fitting() && this.doc && Math.abs(w - last) > 4) { last = w; void this.fit(); }
      });
      queueMicrotask(() => { const el = this.boxRef().nativeElement; this.resize?.observe(el); });
    }
  }

  load(): void {
    this.error.set('');
    this.count.set(0);
    this.api.download(this.reportId(), this.version(), 'PDF').subscribe({
      next: res => {
        if (!res.body) { this.error.set('The report\'s PDF is empty.'); return; }
        this.pdfBlob = res.body;
        this.bytes.set(res.body.size);
        void this.open(res.body);
      },
      error: e => this.error.set(studioError(e, 'The report could not be opened.').message),
    });
  }

  private async open(blob: Blob): Promise<void> {
    try {
      const pdfjs: any = await import('pdfjs-dist');
      // The same worker path as the console's PDF viewer (angular.json copies it there).
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      const doc: PdfDoc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
      if (this.destroyed) { doc.destroy?.(); return; }
      this.doc = doc;
      this.texts = null;
      this.count.set(doc.numPages);
      this.page.set(1);
      await this.fit();
    } catch {
      if (!this.destroyed) this.error.set('This PDF could not be opened here; download it instead.');
    }
  }

  async fit(): Promise<void> {
    if (!this.doc) return;
    this.fitting.set(true);
    const first = await this.doc.getPage(this.page());
    const width = this.scrollerRef()?.nativeElement.clientWidth ?? 800;
    // The page's own width at 100 % is its CSS points; fit leaves the padding (1.75 rem a side) free.
    const next = Math.max(0.5, Math.min(2.5, Math.floor(((width - 56) / first.getViewport({ scale: 1 }).width) * 100) / 100));
    if (next === this.scale()) await this.draw(); else this.scale.set(next);
  }

  zoom(dir: 1 | -1): void {
    this.fitting.set(false);
    this.scale.set(nextZoom(this.scale(), dir));
  }

  go(n: number): void {
    if (n >= 1 && n <= this.count()) this.page.set(n);
  }

  private async draw(): Promise<void> {
    const canvas = this.canvasRef()?.nativeElement;
    if (!this.doc || !canvas) return;
    this.task?.cancel();
    const p = await this.doc.getPage(this.page());
    const ratio = window.devicePixelRatio || 1;
    const vp = p.getViewport({ scale: this.scale() * ratio });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
    canvas.style.height = `${Math.floor(vp.height / ratio)}px`;
    const task = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    this.task = task;
    try { await task.promise; } catch { /* a newer draw cancelled this one */ }
  }

  private async drawRail(canvases: HTMLCanvasElement[]): Promise<void> {
    for (const c of canvases) {
      if (!this.doc || this.destroyed || c.dataset['drawn']) continue;
      const n = Number(c.dataset['page']);
      const p = await this.doc.getPage(n);
      const vp = p.getViewport({ scale: 0.25 });
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.dataset['drawn'] = '1';
      try { await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; } catch { /* the rail is a guide */ }
    }
  }

  show(f: 'PDF' | 'HTML'): void {
    this.format.set(f);
    if (f === 'HTML' && !this.htmlUrl()) {
      this.api.download(this.reportId(), this.version(), 'HTML').subscribe({
        next: res => {
          if (!res.body) return;
          this.htmlObject = URL.createObjectURL(new Blob([res.body], { type: 'text/html' }));
          this.htmlUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.htmlObject));
        },
        error: e => this.error.set(studioError(e, 'The HTML could not be opened.').message),
      });
    } else if (f === 'PDF' && this.doc) {
      queueMicrotask(() => void this.draw());
    }
  }

  openFind(): void {
    this.finding.set(true);
    queueMicrotask(() => this.findRef()?.nativeElement.focus());
  }

  /** The next page (after this one, wrapping) whose text holds the words. */
  async findNext(): Promise<void> {
    if (!this.doc) return;
    if (!this.texts) {
      const texts: string[] = [];
      for (let n = 1; n <= this.doc.numPages; n++) {
        const t = await (await this.doc.getPage(n)).getTextContent();
        texts.push(t.items.map(i => i.str ?? '').join(' '));
      }
      this.texts = texts;
    }
    const hits = pagesWith(this.texts, this.findWords());
    this.findHits.set(hits);
    if (hits.length) this.page.set(hits.find(h => h > this.page()) ?? hits[0]);
  }

  /** The PDF printed as it is (the browser's print of the file itself, from a frame that is removed after). */
  print(): void {
    if (!this.pdfBlob) return;
    const url = URL.createObjectURL(this.pdfBlob);
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.src = url;
    frame.onload = () => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { window.open(url, '_blank', 'noopener'); }
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
    };
    document.body.appendChild(frame);
  }

  fullScreen(): void {
    const el = this.boxRef().nativeElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().then(() => this.fitting() && setTimeout(() => void this.fit(), 150));
  }
}
