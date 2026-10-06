import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input,
  output, signal, viewChild,
} from '@angular/core';
import { DIALOG_DATA, Dialog } from '@angular/cdk/dialog';
import { Icon } from './icon';
import { SidePanel, sidePanelConfig } from './side-panel';
import { copyText } from './clipboard.util';
import { capTitle, clipText } from './long-text';

/**
 * The most of a value handed to the page inline. A clamp shows three lines at most, which is a few
 * hundred characters even across a wide card; laying out the other 18,000 of a ledger note in every
 * cell of a 500-row result only to hide them is megabytes of text for nothing. The panel has it all.
 */
const SHOWN_MAX = 2000;

/**
 * Characters a line is assumed to hold when the browser has not laid the value out -- a hidden tab,
 * or the test DOM, which does no layout. Only decides whether "Show all" is offered before a real
 * measurement replaces the guess; generous, so a short value is never given a button it does not need.
 */
const LINE_GUESS = 60;

/*
 * One ResizeObserver for every value on the page rather than one each: a result table is rows times
 * columns of these, and a cell can start or stop overflowing whenever its column is resized, a panel
 * opens beside it or the window changes. Absent where the environment has none, and the length guess
 * above stands in.
 */
const watchers = new WeakMap<Element, () => void>();
let sizes: ResizeObserver | null | undefined;
function sizeWatcher(): ResizeObserver | null {
  if (sizes === undefined) {
    sizes = typeof ResizeObserver === 'function'
      ? new ResizeObserver(entries => { for (const entry of entries) watchers.get(entry.target)?.(); })
      : null;
  }
  return sizes;
}

/** What the panel is opened with. */
export interface DataTextPanelData {
  value: string;
  /** Where the value came from -- a column name, "notes · first (A–Z)" -- for the panel's heading. */
  label: string;
}

/**
 * A value from a customer's file, in any length, without breaking the screen it sits on.
 *
 * Owner, 2026-09-28: "if text is big in some csv the statistics or text not wrapping, so need a way
 * we handle this". A ledger's notes run to 20,000 characters, and each place that printed one whole
 * on one line became that wide: the Compact table measured 5,043px, pushing Type, Null and the rest
 * off to the right. This is the one way the Analytics screens draw such a value:
 *
 * - clamped to `lines` (1 in a table cell or a label, 3 in a statistics panel), with
 *   `overflow-wrap: anywhere` so that even one unbroken 20,000-character token wraps instead of
 *   setting the width of everything around it;
 * - a tooltip holding the first 300 characters, never all of them;
 * - "Show all" when the value is longer than what is shown, which opens the whole value in the
 *   right-hand panel with its length and a Copy button.
 *
 * The clamp is CSS (`.data-text` in styles.css) and the line count reaches it as a custom property,
 * so the value's box is the same height whether or not the button is there -- the button sits on the
 * last line rather than under it, and appearing does not move the row.
 *
 * `actionable` draws the value itself as a button, for the Canvas table's click-to-filter cells: a
 * "Show all" button cannot sit inside another button, so the value and the button are siblings here.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-data-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'data-text', '[class.data-text-one]': 'lines() === 1', '[style.--data-text-lines]': 'lines()' },
  template: `
    @if (actionable()) {
      <button #valueBox type="button" class="data-text-value data-text-action" [disabled]="actionDisabled()"
              [title]="tooltip()" (click)="pressed.emit()">{{ shown() }}</button>
    } @else {
      <span #valueBox class="data-text-value" [title]="tooltip()">{{ shown() }}</span>
    }
    @if (clipped()) {
      <button type="button" class="data-text-more" [class.data-text-more-icon]="compact()"
              [attr.aria-label]="moreLabel()" title="Show all of this value"
              (click)="open($event)">@if (compact()) {<app-icon name="maximize" size="0.85em" />} @else {Show all}</button>
    }
  `,
})
export class DataText {
  readonly value = input<string | null | undefined>('');
  /** How many lines to show before clamping. */
  readonly lines = input(1);
  /** Names the value in the panel's heading and in the button's accessible name. */
  readonly label = input('');
  /** The tooltip, when it should say something other than the value -- an unrounded figure, a filter. Capped all the same. */
  readonly hint = input('');
  /** An icon instead of the words, for a slot a few characters wide such as a bar's label. */
  readonly compact = input(false);
  readonly actionable = input(false);
  readonly actionDisabled = input(false);
  readonly pressed = output<void>();

  private readonly dialog = inject(Dialog);
  private readonly shownRef = viewChild<ElementRef<HTMLElement>>('valueBox');

  /** null until the browser has laid the value out; then whether the clamp is hiding any of it. */
  private readonly overflow = signal<boolean | null>(null);
  private watched: HTMLElement | null = null;

  protected readonly shown = computed(() => {
    const value = this.value() ?? '';
    if (value.length <= SHOWN_MAX) return value;
    return Array.from(value).slice(0, SHOWN_MAX).join('');
  });

  protected readonly tooltip = computed(() => capTitle(this.hint() || this.value()));

  /** Characters as a person counts them, which is not UTF-16 units for an emoji or a CJK extension. */
  private readonly length = computed(() => Array.from(this.value() ?? '').length);

  /**
   * Whether any of the value is out of sight. Always, past what is handed to the page at all;
   * otherwise the browser's own answer once it has one, and a length guess until then.
   */
  protected readonly clipped = computed(() => {
    const value = this.value() ?? '';
    if (!value) return false;
    if (value.length > SHOWN_MAX) return true;
    return this.overflow() ?? value.length > this.lines() * LINE_GUESS;
  });

  /** The label as it is spoken and headed: a pivot's row label is itself a value, and can be as long. */
  private readonly name = computed(() => clipText(this.label(), 80));

  protected readonly moreLabel = computed(() =>
    `Show all ${this.length().toLocaleString()} characters${this.name() ? ' of ' + this.name() : ''}`);

  constructor() {
    afterRenderEffect(() => {
      this.shown();
      this.lines();
      const element = this.shownRef()?.nativeElement ?? null;
      if (element !== this.watched) {
        this.unwatch();
        if (element) {
          watchers.set(element, () => this.measure(element));
          sizeWatcher()?.observe(element);
        }
        this.watched = element;
      }
      if (element) this.measure(element);
    });
    inject(DestroyRef).onDestroy(() => this.unwatch());
  }

  /** "Show all" is its own action: a click on it must not also open the table row it sits in. */
  protected open(event: Event): void {
    event.stopPropagation();
    this.dialog.open<void, DataTextPanelData>(DataTextPanel,
      sidePanelConfig<DataTextPanelData>({ value: this.value() ?? '', label: this.name() }));
  }

  private measure(element: HTMLElement): void {
    // Nothing laid out: a tab that is not showing, or no layout engine at all. Keep the guess.
    if (!element.clientHeight && !element.clientWidth) {
      this.overflow.set(null);
      return;
    }
    this.overflow.set(element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
  }

  private unwatch(): void {
    if (!this.watched) return;
    sizeWatcher()?.unobserve(this.watched);
    watchers.delete(this.watched);
    this.watched = null;
  }
}

/**
 * The whole of one value, in the right-hand panel the console opens long lists in.
 *
 * Kept as text a person can select as well as copy: the Copy button can be refused by the browser
 * (an unfocused page, a missing permission), and says so rather than claiming a copy that did not
 * happen.
 */
@Component({
  selector: 'app-data-text-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SidePanel, Icon],
  template: `
    <app-side-panel [heading]="data.label || 'Full value'" [subtitle]="count + ' characters'">
      <p class="data-text-full mono text-xs">{{ data.value }}</p>
      <div foot class="flex items-center gap-2 w-full min-w-0">
        <button type="button" class="btn btn-default btn-sm" (click)="copy()">
          <app-icon [name]="copied() === 'done' ? 'check' : 'copy'" size="0.9em" />{{ copied() === 'done' ? 'Copied' : 'Copy' }}
        </button>
        @if (copied() === 'failed') {
          <span class="text-xs text-crit-500" role="alert">The browser refused — select the text and copy it instead.</span>
        }
      </div>
    </app-side-panel>
  `,
})
export class DataTextPanel {
  protected readonly data = inject<DataTextPanelData>(DIALOG_DATA);
  protected readonly count = Array.from(this.data.value).length.toLocaleString();
  protected readonly copied = signal<'idle' | 'done' | 'failed'>('idle');

  protected async copy(): Promise<void> {
    this.copied.set((await copyText(this.data.value)) ? 'done' : 'failed');
  }
}
