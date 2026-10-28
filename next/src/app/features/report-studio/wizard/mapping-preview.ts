import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { AppLoading } from '../../../shared/ui/loading';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { SourceRef, TemplateDefinition } from '../report-studio.model';
import { CANVAS_ID, CanvasDoc, splitCanvas } from '../designer/canvas-doc';
import { PageFrame } from '../designer/page-frame';
import { PX_PER_MM, pageSizeMm } from '../designer/designer-model';

/** How long the preview waits after the last change before it draws again. */
const DRAW_MS = 700;

/** The page a component is drawn on (its canvas class in that page's HTML), or -1. */
export function pageOf(doc: CanvasDoc | null, id: string | null): number {
  if (!doc || !id) return -1;
  const mark = CANVAS_ID + id;
  return doc.pages.findIndex(p => [...p.matchAll(/class="([^"]*)"/g)].some(m => m[1].split(/\s+/).includes(mark)));
}

/**
 * The live preview beside the mapping (Report data and mapping, owner 2026-10-27): the template's own pages, drawn by
 * media-service's compiler with the chosen data and mapping (the designer's canvas, 120 a minute), a page at a time, scaled
 * to the panel. Where the field being looked at prints is outlined, and the fields that need a person are marked; the page
 * turns to the first of them. When the page cannot be drawn, the template's thumbnail stands in, with where its fields print.
 */
@Component({
  selector: 'app-rs-mapping-preview',
  imports: [Icon, AppLoading, PageFrame],
  template: `
    <div class="rsmp-head">
      <h2 class="rsmp-title">Live preview</h2>
      @if (doc(); as d) {
        @if (d.pages.length > 1) {
          <div class="rsmp-pager">
            <button type="button" class="btn btn-default btn-icon btn-sm" aria-label="Previous page" [disabled]="page() === 0" (click)="turn(-1)"><app-icon name="chevronLeft" /></button>
            <span class="rsmp-muted" aria-live="polite">Page {{ page() + 1 }} of {{ d.pages.length }}</span>
            <button type="button" class="btn btn-default btn-icon btn-sm" aria-label="Next page" [disabled]="page() >= d.pages.length - 1" (click)="turn(1)"><app-icon name="chevronRight" /></button>
          </div>
        } @else { <span class="rsmp-muted">1 page</span> }
      }
      @if (drawing()) { <app-loading shape="inline" label="Drawing…" /> }
    </div>
    <div #frame class="rsmp-frame" [style.height.px]="frameHeight()">
      @if (doc(); as d) {
        <div class="rsmp-space" [style.height.px]="contentHeight()">
          <div class="rsmp-paper" [style.width.px]="pageWidthPx()" [style.transform]="'scale(' + scale() + ')'">
            <app-rs-page-frame [html]="d.pages[page()] ?? ''" [css]="d.css" [page]="page() + 1" [pages]="d.pages.length" [heightMm]="pageMm().height"
                               [selected]="focus()" [flagged]="marked()" (measured)="measured.set($event)" />
          </div>
        </div>
      } @else if (thumb()) {
        <img class="rsmp-thumb" [src]="thumb()" alt="The template's first page" />
      } @else if (!drawing()) {
        <div class="rsmp-blank">{{ error() || 'The preview draws once the data is read.' }}</div>
      }
    </div>
    @if (error() && doc() === null && thumb()) { <p class="rsmp-muted" role="status">{{ error() }} The template's first page is shown instead.</p> }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.625rem; min-width: 0; }
    .rsmp-head { display: flex; align-items: center; gap: 0.5rem; min-height: 2rem; }
    .rsmp-title { flex: 1; font-size: 0.875rem; font-weight: 600; }
    .rsmp-pager { display: flex; align-items: center; gap: 0.375rem; }
    .rsmp-muted { font-size: 0.75rem; color: var(--text-secondary); }
    .rsmp-frame { position: relative; overflow-x: hidden; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
      background: var(--paper); min-height: 12rem; }
    .rsmp-space { position: relative; }
    .rsmp-paper { position: absolute; top: 0; left: 0; transform-origin: top left; }
    .rsmp-thumb { display: block; width: 100%; height: auto; }
    .rsmp-blank { display: flex; align-items: center; justify-content: center; height: 100%; min-height: 12rem; padding: 1rem; text-align: center;
      font-size: 0.8125rem; color: var(--text-muted); }
  `,
})
export class MappingPreview {
  private readonly api = inject(ReportStudioApi);
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  readonly definition = input<TemplateDefinition | null>(null);
  readonly templateId = input('');
  readonly source = input<SourceRef | null>(null);
  readonly rootPath = input('$');
  readonly mapping = input<Record<string, unknown>>({});
  /** The component being looked at (a row hovered or opened): outlined, its page shown. */
  readonly focus = input<string | null>(null);
  /** The components that print fields needing a person: marked. */
  readonly marked = input<string[]>([]);

  readonly doc = signal<CanvasDoc | null>(null);
  readonly page = signal(0);
  readonly drawing = signal(false);
  readonly error = signal('');
  readonly thumb = signal<string | null>(null);
  readonly measured = signal(0);
  private readonly width = signal(320);
  readonly pageMm = computed(() => (this.definition() ? pageSizeMm(this.definition()!) : { width: 210, height: 297 }));
  readonly pageWidthPx = computed(() => this.pageMm().width * PX_PER_MM);
  readonly scale = computed(() => Math.min(1, this.width() / this.pageWidthPx()));
  /** The whole drawn page, scaled (a long report runs past one sheet: it scrolls inside the panel). */
  readonly contentHeight = computed(() => Math.max(this.pageMm().height * PX_PER_MM, this.measured()) * this.scale());
  /** The panel is one sheet tall at most, so the preview reads as a page beside the fields. */
  readonly frameHeight = computed(() => (this.doc() ? Math.min(this.contentHeight(), this.pageMm().height * PX_PER_MM * this.scale()) : null));
  private readonly frameRef = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly pageRef = viewChild(PageFrame);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(e => this.width.set(Math.max(160, e[0].contentRect.width))) : null;
    sizes?.observe(this.host);
    inject(DestroyRef).onDestroy(() => {
      sizes?.disconnect();
      if (this.timer) clearTimeout(this.timer);
      const t = this.thumb();
      if (t) URL.revokeObjectURL(t);
    });
    effect(() => {
      // Redrawn a moment after the data or the mapping changes.
      const body = { definition: this.definition(), source: this.source(), rootPath: this.rootPath(), mapping: this.mapping() };
      if (!body.definition) return;
      untracked(() => this.schedule(body));
    });
    effect(() => {
      // The page turns to where the looked-at field prints, else to the first field that needs a person.
      const d = this.doc();
      const want = pageOf(d, this.focus());
      const first = want >= 0 ? want : this.marked().map(id => pageOf(d, id)).find(p => p >= 0) ?? -1;
      if (first >= 0) untracked(() => this.page.set(first));
      // ...and scrolls to where it prints.
      const id = this.focus() ?? this.marked()[0] ?? null;
      untracked(() => setTimeout(() => this.reveal(id), 60));
    });
  }

  /** Scrolls the panel so a component's box is in view, near the top. */
  private reveal(id: string | null): void {
    const frame = this.frameRef()?.nativeElement;
    const el = id ? this.pageRef()?.element(id) : null;
    if (!frame || !el) return;
    const top = el.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop;
    frame.scrollTo?.({ top: Math.max(0, top - 24), behavior: 'smooth' });
  }

  turn(by: number): void {
    const n = this.doc()?.pages.length ?? 1;
    this.page.set(Math.max(0, Math.min(n - 1, this.page() + by)));
  }

  private schedule(body: { definition: TemplateDefinition | null; source: SourceRef | null; rootPath: string; mapping: Record<string, unknown> }): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.draw(body), DRAW_MS);
  }

  private draw(body: { definition: TemplateDefinition | null; source: SourceRef | null; rootPath: string; mapping: Record<string, unknown> }): void {
    const seq = ++this.seq;
    this.drawing.set(true);
    const request: Record<string, unknown> = { definition: body.definition, mapping: body.mapping };
    if (body.source) { request['source'] = body.source; request['rootPath'] = body.rootPath; }
    this.api.canvas(request).subscribe({
      next: r => {
        if (seq !== this.seq) return;
        this.drawing.set(false);
        this.error.set('');
        if (r.html) {
          const doc = splitCanvas(r.html);
          this.doc.set(doc);
          if (this.page() >= doc.pages.length) this.page.set(0);
        }
      },
      error: e => {
        if (seq !== this.seq) return;
        this.drawing.set(false);
        this.doc.set(null);
        this.error.set(studioError(e, 'The page could not be drawn.').message);
        this.loadThumb();
      },
    });
  }

  private loadThumb(): void {
    if (this.thumb() || !this.templateId()) return;
    this.api.templateThumbnail(this.templateId()).subscribe({
      next: r => { if (r.body && (r.headers.get('Content-Type') ?? '').includes('png')) this.thumb.set(URL.createObjectURL(r.body)); },
      error: () => { /* the panel says it could not draw */ },
    });
  }
}
