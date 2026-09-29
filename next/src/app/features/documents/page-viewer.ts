import {
  Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { Icon } from '../../shared/ui/icon';
import { Box, boxPercent, refusalText } from './documents.model';
import { DocumentsApi } from './documents.service';

/** One value's place on the document: plain data, so a template never binds a function. */
export interface ViewerBox {
  /** The field's id: what the review screen selects by. */
  id: number;
  /** From 1. */
  page: number;
  box: Box;
  label: string;
  /** Flagged for a reviewer: drawn in the warning colour. */
  low: boolean;
}

/**
 * The document beside its fields (MIG-272): one OCR page image with a box over every value read from it.
 *
 * The approach is io-frontend's PDF highlighter's (commits 86c2269 and 4c07a7a): the page is drawn at the width it has,
 * an overlay the same size sits on it, and every box is placed in the page's own coordinates scaled to what is drawn;
 * selecting a field highlights its box and scrolls it into view. Our pages are already images -- OCR's upright page,
 * whose pixels the boxes are in -- so there is no PDF.js here: a box is placed in percent of the image's natural size
 * and scales with the image at any width or zoom without measuring anything.
 *
 * The image comes through HttpClient as a blob, so the auth interceptor adds the token (an <img src> to the API would
 * carry none), and is shown from an object URL that is revoked when the page changes and when the viewer goes.
 */
@Component({
  selector: 'app-page-viewer',
  imports: [Icon],
  template: `
    <div class="page-viewer">
      <div class="page-viewer-bar">
        @if (pageCount() > 1) {
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" [disabled]="page() <= 1" (click)="goTo(page() - 1)">
            <app-icon name="chevronLeft" />
          </button>
        }
        <span class="text-xs text-[color:var(--text-secondary)]" aria-live="polite">Page {{ page() }} of {{ pageCount() }}</span>
        @if (pageCount() > 1) {
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Next page" [disabled]="page() >= pageCount()" (click)="goTo(page() + 1)">
            <app-icon name="chevronRight" />
          </button>
        }
        <span class="flex-1"></span>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Zoom out" [disabled]="zoom() <= 1" (click)="setZoom(-1)"><app-icon name="minus" /></button>
        <span class="text-xs mono w-10 text-center" aria-label="Zoom">{{ zoom() * 100 }}%</span>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Zoom in" [disabled]="zoom() >= 3" (click)="setZoom(1)"><app-icon name="plus" /></button>
      </div>
      <div class="page-viewer-scroll" data-test="page-scroll">
        @if (error()) {
          <p class="text-sm text-crit-500 p-4" role="alert">{{ error() }}</p>
        } @else {
          @if (!url()) { <p class="text-sm text-[color:var(--text-muted)] p-4">Loading page {{ page() }}…</p> }
          <div class="page-viewer-sheet" [style.width.%]="zoom() * 100" [class.hidden]="!url()">
            <img class="page-viewer-image" [src]="url()" [alt]="'Page ' + page() + ' of the document'" (load)="loaded($event)" />
            @if (natural()) {
              <div class="page-viewer-overlay">
                @for (b of placed(); track b.id) {
                  <button type="button" class="doc-box" [class.doc-box-low]="b.low" [class.doc-box-active]="b.id === activeId()"
                          [style.left]="b.left" [style.top]="b.top" [style.width]="b.width" [style.height]="b.height"
                          [attr.data-field-id]="b.id" [attr.aria-label]="b.label" [attr.aria-pressed]="b.id === activeId()"
                          [title]="b.label" (click)="pick.emit(b.id)"></button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .page-viewer { display: flex; flex-direction: column; border: 1px solid var(--border-subtle); border-radius: 0.75rem;
      background: var(--surface-sunken); overflow: clip; }
    .page-viewer-bar { display: flex; align-items: center; gap: 0.25rem; padding: 0.375rem 0.5rem;
      border-bottom: 1px solid var(--border-subtle); background: var(--surface-raised); }
    .page-viewer-scroll { overflow: auto; max-height: min(78vh, 60rem); padding: 0.75rem; }
    .page-viewer-sheet { position: relative; margin: 0 auto; min-width: 100%; }
    .page-viewer-image { display: block; width: 100%; height: auto; background: #fff; border-radius: 0.25rem;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.14); }
    .page-viewer-overlay { position: absolute; inset: 0; }
    .doc-box { --glow: rgb(37 99 235 / 0.35); position: absolute; padding: 0; border: 1.5px solid #2563eb; background: rgb(37 99 235 / 0.1);
      border-radius: 3px; cursor: pointer; transition: box-shadow 150ms, background 150ms; }
    .doc-box-low { --glow: rgb(180 83 9 / 0.35); border-color: #b45309; background: rgb(180 83 9 / 0.12); }
    .doc-box:hover { background: rgb(37 99 235 / 0.2); }
    .doc-box-low:hover { background: rgb(180 83 9 / 0.22); }
    .doc-box-active { border-width: 2.5px; background: rgb(37 99 235 / 0.22); z-index: 1; box-shadow: 0 0 0 4px var(--glow);
      animation: doc-box-pulse 1.2s ease-out 2; }
    .doc-box-low.doc-box-active { background: rgb(180 83 9 / 0.24); }
    .doc-box:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
    @keyframes doc-box-pulse { from { box-shadow: 0 0 0 12px var(--glow); } to { box-shadow: 0 0 0 4px var(--glow); } }
    @media (prefers-reduced-motion: reduce) { .doc-box-active { animation: none; } }
  `],
})
export class PageViewer {
  private readonly api = inject(DocumentsApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly ocrDocumentId = input.required<number>();
  readonly pageCount = input(1);
  readonly boxes = input<ViewerBox[]>([]);
  readonly activeId = input<number | null>(null);
  /** A box was clicked: the review screen selects its field. */
  readonly pick = output<number>();

  readonly page = signal(1);
  readonly zoom = signal(1);
  readonly url = signal('');
  readonly error = signal('');
  /** The image's own size, once it has loaded: the space the boxes are in. */
  readonly natural = signal<{ width: number; height: number } | null>(null);

  readonly placed = computed(() => {
    const n = this.natural();
    if (!n) return [];
    return this.boxes().filter(b => b.page === this.page()).map(b => ({ id: b.id, label: b.label, low: b.low, ...boxPercent(b.box, n) }));
  });

  /** The last box brought into view in the viewer. */
  readonly revealed = signal<number | null>(null);

  private loading: Subscription | null = null;

  constructor() {
    // A selected value on another page turns the page to it.
    effect(() => {
      const id = this.activeId();
      const target = this.boxes().find(b => b.id === id);
      if (target && target.page !== untracked(this.page)) this.page.set(target.page);
    });

    effect(() => {
      const id = this.ocrDocumentId();
      const page = this.page();
      untracked(() => this.load(id, page));
    });

    // Once the page shows the selected value's box, centre it in the viewer's own scroll (zoomed in, it may be off to
    // a side). Only the viewer scrolls here: whether the page itself moves to the viewer is the review screen's call,
    // since a reviewer typing into a field on a phone must not be carried away from it.
    afterRenderEffect(() => {
      const id = this.activeId();
      if (id == null || !this.natural() || !this.placed().some(b => b.id === id)) return;
      const root = this.host.nativeElement;
      const box = root.querySelector<HTMLElement>(`[data-field-id="${id}"]`);
      const scroller = root.querySelector<HTMLElement>('.page-viewer-scroll');
      if (!box || !scroller) return;
      const b = box.getBoundingClientRect();
      const v = scroller.getBoundingClientRect();
      scroller.scrollTo?.({
        top: scroller.scrollTop + (b.top - v.top) - (scroller.clientHeight - b.height) / 2,
        left: scroller.scrollLeft + (b.left - v.left) - (scroller.clientWidth - b.width) / 2,
        behavior: 'smooth',
      });
      this.revealed.set(id);
    });

    inject(DestroyRef).onDestroy(() => { this.loading?.unsubscribe(); this.release(); });
  }

  goTo(page: number): void {
    if (page >= 1 && page <= this.pageCount()) this.page.set(page);
  }

  setZoom(step: 1 | -1): void {
    this.zoom.set(Math.max(1, Math.min(3, this.zoom() + step * 0.5)));
  }

  loaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth > 0) this.natural.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  private load(ocrDocumentId: number, page: number): void {
    this.loading?.unsubscribe();
    this.release();
    this.natural.set(null);
    this.error.set('');
    this.loading = this.api.pageImage(ocrDocumentId, page).subscribe({
      next: blob => this.url.set(URL.createObjectURL(blob)),
      error: err => this.error.set(refusalText(err, `Page ${page} could not be loaded.`)),
    });
  }

  private release(): void {
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set('');
  }
}
