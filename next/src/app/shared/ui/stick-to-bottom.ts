import { Directive, ElementRef, effect, inject, input, signal } from '@angular/core';

/**
 * Keeps a log view pinned to its newest line.
 *
 * Following a live run meant scrolling down by hand after every refresh, and the auto-refresh
 * made that worse by adding lines every five seconds. The rule is the one a terminal uses: stay
 * pinned while the reader is at the bottom, and stop the moment they scroll up to read
 * something, because yanking them back down is worse than not following at all. Returning to
 * the bottom resumes it.
 */
@Directive({
  selector: '[appStickToBottom]',
})
export class StickToBottom {
  /** Changing this signals new content: pass the line count. */
  readonly appStickToBottom = input<unknown>();

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** True while the reader is at the bottom and content should follow. */
  readonly pinned = signal(true);

  /** Anything within this many pixels of the end counts as "at the bottom". */
  private static readonly SLACK = 40;

  /**
   * The element that actually scrolls, which is often not the one carrying the directive.
   * Both log views hand their scrolling to the table shell around them when there is one --
   * a scroller inside a scroller traps the wheel -- so scrolling the console itself would do
   * nothing at all. Resolved lazily because that ancestor is not in the DOM at construction.
   */
  private scroller: HTMLElement | null = null;
  private listening = false;

  private target(): HTMLElement | null {
    if (this.scroller?.isConnected) return this.scroller;
    let node: HTMLElement | null = this.host;
    while (node) {
      const style = getComputedStyle(node);
      const scrolls = /(auto|scroll|overlay)/.test(style.overflowY)
        && node.scrollHeight > node.clientHeight + 1;
      if (scrolls) {
        this.scroller = node;
        if (!this.listening) {
          node.addEventListener('scroll', () => this.onScroll(), { passive: true });
          this.listening = true;
        }
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  constructor() {
    effect(() => {
      this.appStickToBottom();          // re-runs whenever the content changes
      if (!this.pinned()) return;
      // After the new rows have been laid out, not before.
      queueMicrotask(() => {
        const target = this.target();
        if (target) target.scrollTo({ top: target.scrollHeight });
      });
    });
  }

  private onScroll(): void {
    const target = this.scroller;
    if (!target) return;
    const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
    this.pinned.set(distance <= StickToBottom.SLACK);
  }
}
