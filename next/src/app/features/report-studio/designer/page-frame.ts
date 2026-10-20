import { Component, DestroyRef, ElementRef, effect, inject, input, output } from '@angular/core';
import { CANVAS_ID, canvasCss, idOf } from './canvas-doc';

/**
 * One page of the designer's canvas (MIG-404): the report's own HTML and stylesheet for that page, drawn in a shadow root
 * so neither the console's styles nor the report's leak into the other. A click names the component under it; the
 * selected one is outlined. The page tells its canvas how tall its content is, so a page that runs over an A4 sheet
 * grows rather than clipping.
 */
@Component({
  selector: 'app-rs-page-frame',
  template: '',
  host: { class: 'block' },
})
export class PageFrame {
  /** The sheet's inner HTML (canvas-doc.ts has cleaned it). */
  readonly html = input.required<string>();
  /** The report's stylesheet. */
  readonly css = input.required<string>();
  readonly page = input(1);
  readonly pages = input(1);
  /** The page's height: a short page still fills its sheet, so the footer sits at its foot. */
  readonly heightMm = input(297);
  readonly selected = input<string | null>(null);
  readonly dropInto = input<string | null>(null);
  /** Phase 6: blocks an AI proposal adds or changes, outlined while it is shown on the page. */
  readonly proposed = input<string[]>([]);
  /** The component clicked, or null for the page itself. */
  readonly picked = output<string | null>();
  /** The content's height in CSS pixels, unscaled. */
  readonly measured = output<number>();

  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly root: ShadowRoot = this.host.attachShadow({ mode: 'open' });
  private marked: Element | null = null;
  private target: Element | null = null;

  constructor() {
    const sizes = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.measured.emit(this.contentHeight())) : null;
    inject(DestroyRef).onDestroy(() => sizes?.disconnect());
    this.root.addEventListener('click', event => {
      const hit = event.composedPath().find(n => n instanceof Element && idOf(n) !== null) as Element | undefined;
      this.picked.emit(hit ? idOf(hit) : null);
    });
    effect(() => {
      // A later page's sheet is not the first of its type (the empty div before it), so the report's first-page rules -- a
      // letterhead, a tint on the first page only -- hold on page 1 alone, as in the PDF.
      const later = this.page() > 1 ? '<div hidden></div>' : '';
      this.root.innerHTML = `<style>${this.css()}\n${canvasCss(this.page(), this.pages(), this.heightMm())}</style>${later}<div class="rs-sheet">${this.html()}</div>`;
      this.marked = null;
      this.target = null;
      this.mark(this.selected());
      this.markDrop(this.dropInto());
      this.markProposal(this.proposed());
      const sheet = this.root.querySelector('.rs-sheet');
      if (sheet && sizes) {
        sizes.disconnect();
        sizes.observe(sheet);
      }
      this.measured.emit(this.contentHeight());
    });
    effect(() => this.mark(this.selected()));
    effect(() => this.markDrop(this.dropInto()));
    effect(() => this.markProposal(this.proposed()));
  }

  private proposalMarks: Element[] = [];

  private markProposal(ids: string[]): void {
    this.proposalMarks.forEach(e => e.classList.remove('rsd-ai-added'));
    this.proposalMarks = ids.map(id => this.element(id)).filter((e): e is Element => !!e);
    this.proposalMarks.forEach(e => e.classList.add('rsd-ai-added'));
  }

  private mark(id: string | null): void {
    this.marked?.classList.remove('rsd-selected');
    this.marked = id ? this.element(id) : null;
    this.marked?.classList.add('rsd-selected');
  }

  private markDrop(id: string | null): void {
    this.target?.classList.remove('rsd-drop-into');
    this.target = id ? this.element(id) : null;
    this.target?.classList.add('rsd-drop-into');
  }

  /** The element that draws a component on this page, or null. */
  element(id: string): Element | null {
    return this.root.querySelector(`.${CSS.escape(CANVAS_ID + id)}`);
  }

  /** Where a component is drawn, in the window's coordinates, or null when it is not on this page. */
  rectOf(id: string): DOMRect | null {
    return this.element(id)?.getBoundingClientRect() ?? null;
  }

  /** The components under a point (window coordinates), innermost first. */
  idsAt(x: number, y: number): string[] {
    const out: string[] = [];
    for (const e of this.root.elementsFromPoint(x, y)) {
      const id = idOf(e);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  }

  /** The components drawn directly inside a container (or the page body, for null), in order, with their boxes. */
  childBoxes(containerId: string | null): { id: string; rect: DOMRect }[] {
    const box = containerId ? this.element(containerId) : this.root.querySelector('.rs-sheet > .rs-body');
    if (!box) return [];
    const out: { id: string; rect: DOMRect }[] = [];
    const visit = (e: Element) => {
      for (const c of Array.from(e.children)) {
        const id = idOf(c);
        if (id) out.push({ id, rect: c.getBoundingClientRect() });
        else visit(c);
      }
    };
    visit(box);
    return out;
  }

  private contentHeight(): number {
    const sheet = this.root.querySelector('.rs-sheet') as HTMLElement | null;
    return sheet ? sheet.scrollHeight : 0;
  }
}
