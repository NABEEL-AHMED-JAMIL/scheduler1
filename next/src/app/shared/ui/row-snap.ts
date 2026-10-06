import { AfterViewInit, DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Ends a scrolling table box on a row boundary (UI review U7).
 *
 * `.scroll-table` caps its height off the window (max-height in styles.css), and that cap knows nothing of the rows:
 * at 1920x1080 Sources, the Tool and Task Registries, Document Intelligence and the invoice history each cut their
 * last visible row in half, which reads as a rendering fault. This keeps the CSS cap as the budget and, when the
 * rows overflow it, shortens the box to the bottom of the last row that fits whole. Lists that fit are untouched.
 *
 * Re-measured when the box or its rows change size (a resize, a reload, rows added) -- not on every frame.
 */
@Directive({ selector: '[appRowSnap]' })
export class RowSnap implements AfterViewInit {
  /** Off where the box does not scroll (a table shell with scrollRows false). */
  readonly enabled = input(true, { alias: 'appRowSnap', transform: (v: boolean | '') => v !== false });
  private readonly box = inject(ElementRef).nativeElement as HTMLElement;
  private frame = 0;
  private observed = new Set<Element>();
  private readonly resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule());
  private readonly mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { this.watchRows(); this.schedule(); });

  constructor() {
    effect(() => { this.enabled(); this.schedule(); });
    inject(DestroyRef).onDestroy(() => {
      this.resize?.disconnect();
      this.mutation?.disconnect();
      if (this.frame) cancelAnimationFrame(this.frame);
    });
  }

  ngAfterViewInit(): void {
    this.resize?.observe(this.box);
    this.mutation?.observe(this.box, { childList: true, subtree: true });
    this.watchRows();
    this.schedule();
  }

  private watchRows(): void {
    const table = this.box.querySelector('table');
    if (table && !this.observed.has(table)) {
      this.observed.add(table);
      this.resize?.observe(table);
    }
  }

  private schedule(): void {
    if (this.frame || typeof requestAnimationFrame === 'undefined') return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.snap();
    });
  }

  /** Public for the spec: measure now. */
  snap(): void {
    const box = this.box;
    box.style.maxHeight = '';
    if (!this.enabled()) return;
    const cap = parseFloat(getComputedStyle(box).maxHeight);
    if (!isFinite(cap) || box.scrollHeight <= cap + 1) return;
    const top = box.getBoundingClientRect().top - box.scrollTop;
    let best = 0;
    for (const row of Array.from(box.querySelectorAll<HTMLElement>(':scope table > tbody > tr'))) {
      const bottom = row.getBoundingClientRect().bottom - top;
      if (bottom > cap + 0.5) break;
      best = bottom;
    }
    // Rows so tall that the last whole one leaves most of the budget empty: the plain cap reads better.
    if (best >= cap * 0.6) box.style.maxHeight = `${Math.ceil(best)}px`;
  }
}
