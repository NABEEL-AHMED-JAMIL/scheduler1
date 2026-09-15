import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal,
} from '@angular/core';

import { compactNumber } from './number-format';

export interface BarSegment { label: string; value: number; color: string; }

export interface Bar {
  name: string;
  value: number;
  meta?: unknown;
  color?: string;
  /** This bar alone does not respond to a click. See RankedItem.inert. */
  inert?: boolean;
  /**
   * Composition of this bar, drawn as a stack instead of a solid fill.
   *
   * Only ever counts, never averages: a stack asserts that the parts add up to the whole, and
   * that is true of run counts and false of every duration statistic.
   */
  segments?: BarSegment[];
}

/**
 * Roughly what one axis label and one value label need, in px.
 *
 * A label like "09-08" measures 29.6px at this font, and a three-digit count about 18px. The
 * constants carry a little headroom so a slightly wider name does not immediately collide.
 * They are the only place the layout encodes "how much room does text need".
 */
/**
 * Fallback widths, used only until the component has been measured.
 *
 * These used to be the WHOLE rule, and a fixed number of pixels cannot answer "does this text
 * fit" because it does not know what the text says. A 24-bar revenue chart has 37px of pitch, so
 * values were drawn -- and the value is "4,398,765.46", which needs about 75px. Twenty-four of
 * them overlapped into an unreadable band across the top of the chart. The same arithmetic put
 * "CUST-00111" labels, about 65px wide, at a 34px threshold along the bottom.
 */
const LABEL_PX = 34;
const VALUE_PX = 22;

/**
 * Width of one character at the 10px type these labels are drawn in.
 *
 * Measured against the rendered font rather than assumed: digits in `tabular` are 6.0px and the
 * mixed-case names on the axis average slightly less, so 6.0 is the honest number for the widest
 * case and errs toward hiding a label rather than toward drawing two on top of each other.
 */
const CHAR_PX = 6;

/** Breathing room either side, so two labels never touch even when both just fit. */
const LABEL_GUTTER = 8;

/** The pixels the widest of these strings needs. */
function widestText(texts: string[]): number {
  let widest = 0;
  for (const text of texts) {
    widest = Math.max(widest, (text ?? '').length);
  }
  return widest * CHAR_PX + LABEL_GUTTER;
}

/** Chrome reserved above and below the bar itself: value line plus axis line, or axis alone. */
const RESERVE_WITH_VALUES = 32;
const RESERVE_AXIS_ONLY = 18;

@Component({
  selector: 'app-bar-chart',
  // The host must be a block for getBoundingClientRect to report the width the bars actually
  // get; an inline host measures its content, not its column.
  styles: [':host { display: block; }'],
  template: `
    @if (bars().length) {
      <!-- One role="img" for the whole chart, matching app-histogram. Each bar used to be a
           button whether or not it did anything, so a non-interactive chart put N dead tab
           stops in the keyboard order and read as N buttons to a screen reader. -->
      <!-- The gap collapses as the bars get thin. gap-1 is 4px per bar and a gap does NOT
           shrink, so 366 days demanded 365*4 = 1460px of gutter alone: the bars were squeezed
           to zero width and the row still overflowed, pushing a horizontal scrollbar onto the
           whole page. Below ~9px of pitch the separation has to come from the bar edges, not
           from space between them. -->
      <div class="flex items-end min-w-0" [class.gap-1]="gap() === 4"
           [class.gap-px]="gap() === 1" [style.height.px]="height()"
           [attr.role]="clickable() ? null : 'img'"
           [attr.aria-label]="clickable() ? null : summary()">
        @for (bar of bars(); track $index) {
          <!-- aria-hidden below follows CLICKABLE only, never inert. An inert bar is one that
               cannot be filtered on -- a Top-N roll-up, a merged label, a null group -- and it is
               still a bar with a name and a figure that a sighted reader can see. It used to be
               hidden along with being disabled, which removed its name and value from the
               accessibility tree; and because a clickable chart carries no role="img" summary
               either, there was no fallback text at all. A screen-reader user was read N-1 bars
               and never told the largest one existed. A disabled button already announces as
               unavailable, which is the part worth saying. -->
          <button type="button"
                  class="flex-1 min-w-0 max-w-16 h-full flex flex-col justify-end items-center gap-1
                         rounded transition-colors hover:bg-[color:var(--surface-sunken)]
                         focus:outline-none focus:ring-2 focus:ring-[color:var(--focus-ring)]"
                  [disabled]="!clickable() || !!bar.inert"
                  [attr.tabindex]="clickable() && !bar.inert ? 0 : -1"
                  [attr.aria-hidden]="clickable() ? null : 'true'"
                  [title]="bar.hint"
                  (click)="barClicked.emit(bar)">
            @if (showValues()) {
              <span class="text-[10px] tabular leading-none text-[color:var(--text-muted)]">{{ bar.display }}</span>
            }
            <!--
              --chart-0, not bg-brand-500. The accent ramp is monochrome and its 500 step is a
              near-black in BOTH themes, so an uncoloured bar measured 1.18:1 against the dark
              card it sat on -- present in the DOM and invisible on screen, on all five screens
              that use this chart. --chart-0 is theme-aware (14.67:1 light, 12.05:1 dark) and is
              what the histogram beside it already uses.
            -->
            @if (bar.stack.length) {
              <!-- Stacked, bottom-up, so the composition reads against a shared baseline. The
                   segment heights are derived from the same track as the solid bar, so a
                   stacked and an unstacked chart of the same data are the same height. -->
              <span class="w-full flex flex-col-reverse rounded-t overflow-hidden"
                    [style.height.px]="bar.px">
                @for (part of bar.stack; track part.label) {
                  <span class="w-full shrink-0" [style.background]="part.color"
                        [style.height.px]="part.px"></span>
                }
              </span>
            } @else {
              <!-- A dashed top edge is the axis-break motif, and it is doing the same job here:
                   this bar is taller than the scale and has been cut, so a flat rounded cap
                   would claim it is exactly as tall as the tallest real bar. Only the Top-N
                   roll-up reaches this in practice. -->
              <span class="w-full transition-[height]"
                    [class.rounded-t]="!bar.clipped"
                    [class.border-t-2]="bar.clipped"
                    [class.border-dashed]="bar.clipped"
                    [style.borderTopColor]="'var(--surface-raised)'"
                    [style.background]="bar.color || 'var(--chart-0)'"
                    [style.height.px]="bar.px"></span>
            }
            <!-- The label overflows its own cell on purpose: at a 14px pitch no date fits, and
                 the neighbours it spills over are empty by construction. The edge labels are
                 anchored inward instead so they do not hang off the card. -->
            <span class="block text-[10px] text-[color:var(--text-muted)] w-full h-3.5
                         leading-[0.875rem] overflow-visible"
                  [class.text-center]="bar.align === 'center'"
                  [class.text-left]="bar.align === 'start'"
                  [class.text-right]="bar.align === 'end'">
              @if (bar.labelled) {
                <span class="whitespace-nowrap">{{ bar.name }}</span>
              }
            </span>
          </button>
        }
      </div>

      @if (legend().length) {
        <!--
          The key to the colours, which did not exist.

          A stack paints one colour per category and that mapping was stated nowhere a reader
          could see it: only inside each bar's title attribute, which needs a mouse, never
          appears on a touch screen, and is not read out in order. So the chart encoded its second
          dimension in colour alone -- the thing WCAG 1.4.1 is about -- and a reader could see
          six bands without being able to name one of them.

          aria-hidden because the same names and figures are already in the chart's own
          description, and a screen reader does not need the swatches read out a second time.
        -->
        <ul class="flex flex-wrap gap-x-3 gap-y-1 mt-2 list-none" aria-hidden="true">
          @for (entry of legend(); track entry.label) {
            <li class="flex items-center gap-1.5 text-[10px] text-[color:var(--text-muted)]">
              <span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    [style.background]="entry.color"></span>
              <span class="whitespace-nowrap">{{ entry.label }}</span>
            </li>
          }
        </ul>
      }
    } @else {
      <p class="text-xs text-[color:var(--text-muted)] py-6 text-center">{{ emptyMessage() }}</p>
    }
  `,
})
export class BarChart {
  readonly data = input.required<Bar[]>();
  readonly height = input(96);
  readonly emptyMessage = input('Nothing to show in this range.');
  readonly clickable = input(false);
  /**
   * How a value is written above the bar and in its tooltip.
   *
   * Compact by default, because this is exactly the place the tradeoff favours it: the label
   * sits in a slot that can be fourteen pixels wide, so the alternative to "1.2K" is not
   * "1,235" but nothing at all. Callers that need the exact figure pass their own formatter.
   */
  readonly format = input<(value: number) => string>(compactNumber);
  readonly barClicked = output<Bar>();

  /**
   * The component's own width, so the axis can be laid out in pixels rather than in guesses.
   *
   * Everything below used to thin labels by BAR COUNT alone -- "more than sixteen bars, show
   * every ceil(n/8)th" -- which is a rule with no width term in it. The same 31 bars are 14px
   * apart in a third-of-a-row card and 45px apart full width, so one constant could not be
   * right in both: the reports card overlapped its last two labels into "09-0609-08", while a
   * 16-bar range drew all sixteen on top of each other. Measured the same way report-chart.ts
   * measures, for the same reason.
   *
   * 0 means "not measured yet"; the first paint falls back to the old count-based rule.
   */
  private readonly measured = signal(0);

  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    const host = this.host.nativeElement as HTMLElement;
    afterNextRender(() => this.observeSize(host, () => this.remeasure()));
  }

  /**
   * Re-measures whenever the element's own box changes, not only when the WINDOW does.
   *
   * A window-resize listener alone misses every case where the container changes size while the
   * window does not: a collapsed section being opened, a sidebar toggling, a lazily-rendered
   * tab. The reports builder is exactly that case -- it starts collapsed, so the chart first
   * renders inside a [hidden] section at zero width, and opening it fires no resize at all. The
   * chart then kept its starting guess for ever: a 1331px card drawing a 960px viewBox.
   *
   * ResizeObserver is the right tool and fires on the 0 -> N transition. The window listener is
   * kept as well rather than replaced, because it costs nothing and covers any environment
   * where the observer does not fire.
   */
  /**
   * DestroyRef is captured as a FIELD, not injected where it is used.
   *
   * observeSize runs from inside an afterNextRender callback, which is outside Angular's
   * injection context -- calling inject() there throws NG0203, which silently killed the
   * observer setup and left the chart on its starting guess, the very bug this was added to
   * fix. Field initialisers run during construction, where injection is legal.
   */
  private readonly destroyRef = inject(DestroyRef);

  private observeSize(element: HTMLElement, onChange: () => void): void {
    onChange();
    const win = window as unknown as { ResizeObserver?: typeof ResizeObserver };
    if (typeof win.ResizeObserver === 'function') {
      const observer = new win.ResizeObserver(() => onChange());
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    const onResize = () => onChange();
    window.addEventListener('resize', onResize, { passive: true });
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private remeasure(): void {
    const width = Math.round((this.host.nativeElement as HTMLElement).getBoundingClientRect().width);
    if (width > 0) this.measured.set(width);
  }

  /**
   * The value the tallest bar stands for -- taken from the bars the chart is ABOUT.
   *
   * A Top-N result carries an "Other" roll-up holding everything the cut discarded, and on a
   * "Top 10 customers" chart that bar was 101,025,562 against ten real bars of about 300,000. It
   * set the scale, so all ten rendered as three-pixel slivers and the chart answered nothing: the
   * one bar that is explicitly NOT one of the ten decided how the ten looked.
   *
   * The roll-up is already marked inert -- see Mark.inert, stamped by the analytics board -- so
   * the information needed to leave it out of the scale was there and simply unused. It is still
   * drawn and still carries its true figure; it is drawn CLIPPED, which is a statement about the
   * axis rather than about the data.
   *
   * Falls back to every bar when they are all inert, because a scale of zero draws nothing at all
   * and "every bar is a roll-up" is a real, if odd, result rather than an empty one.
   */
  readonly maxValue = computed(() => {
    const data = this.data();
    const scaled = data.filter(bar => !bar.inert);
    const measured = scaled.length ? scaled : data;
    return Math.max(0, ...measured.map(bar => bar.value ?? 0));
  });

  /**
   * Space between bars: 4px normally, 1px once that gutter would cost more than the bars.
   *
   * Chosen from the count rather than the measured width so it is stable on the first paint --
   * the overflow it prevents is a page-level scrollbar, and flashing one is worse than sizing
   * the gap slightly conservatively.
   */
  protected readonly gap = computed(() => (this.data().length > 60 ? 1 : 4));

  /** Width of one bar's slot, or 0 while the component has not been measured. */
  private readonly pitch = computed(() => {
    const count = this.data().length;
    const width = this.measured();
    return count && width ? width / count : 0;
  });

  /**
   * Values above the bars only when a number actually fits over one.
   *
   * Reads data().length rather than bars().length: bars() needs this to size its track, and
   * going through bars() would be a cycle. The two counts are the same.
   */
  /**
   * Suppresses the figure above each bar even where there is room for it.
   *
   * For a chart whose bars are all the same height ON PURPOSE -- a 100% stack -- where the
   * number above every bar is the same "100" and says nothing at all. The per-segment figures are
   * still in the tooltip, which is where the reading actually happens on that chart.
   */
  readonly hideValues = input(false);

  protected readonly showValues = computed(() => {
    if (this.hideValues()) return false;
    const count = this.data().length;
    if (!count) return false;
    const pitch = this.pitch();
    if (!pitch) return count <= 24;
    // Against the WIDEST value actually formatted, not a constant. A dashboard tile passes the
    // faithful formatter, so these are "4,398,765.46" and not "4.4M"; whether they fit is a fact
    // about the string, and the previous 22px threshold was true of "4.4M" and nothing else.
    const format = this.format();
    const widest = widestText(this.data().map(bar => format(bar.value)));
    return pitch >= Math.max(VALUE_PX, widest);
  });

  /** Label every Nth group, where N is however many bars the WIDEST label is wide. */
  private readonly every = computed(() => {
    const count = this.data().length;
    if (count < 2) return 1;
    const pitch = this.pitch();
    if (!pitch) return count > 16 ? Math.ceil(count / 8) : 1;
    // The widest label decides the spacing for all of them: thinning to fit the average leaves
    // the long ones overlapping their neighbours, which is what "CUST-00111 CUST-00319CUST-00315"
    // along the bottom of a Top-10 chart was.
    const needed = Math.max(LABEL_PX, widestText(this.data().map(bar => bar.name)));
    return Math.max(1, Math.ceil(needed / pitch));
  });

  readonly bars = computed(() => {
    const data = this.data();
    if (!data.length) return [];
    const max = this.maxValue();
    const format = this.format();
    // The reserve has to match the branch the template actually renders. It was a flat 32
    // even when no value line was drawn, which shortened every bar on a >24-bar chart by 14px.
    const track = Math.max(this.height() - (this.showValues() ? RESERVE_WITH_VALUES : RESERVE_AXIS_ONLY), 18);
    const every = this.every();

    // The first index of each run of equal names. Twenty-four bars from one day all read
    // "Aug 19", and a repeated label carries nothing, so a group gets at most one.
    const starts: number[] = [];
    data.forEach((bar, index) => {
      if (index === 0 || bar.name !== data[index - 1].name) starts.push(index);
    });

    /*
     * Which groups get a label.
     *
     * The first and last are always drawn, so the axis is bounded and a reader can place the
     * series in time. Interior labels are then taken every `every` groups AND dropped when they
     * come within `every` of the last one -- that second clause is the whole fix. The old rule
     * pinned the last index unconditionally on top of a modulo grid it knew nothing about, so
     * with 31 bars it labelled index 28 and index 30, two bars and 28px apart, under a label
     * 30px wide. Anchoring against the end instead means no labelled pair is ever closer than
     * `every`, whatever the bar count.
     */
    const last = starts[starts.length - 1];
    const chosen = new Set<number>([starts[0], last]);
    let previous = starts[0];
    for (const at of starts) {
      if (at - previous >= every && last - at >= every) {
        chosen.add(at);
        previous = at;
      }
    }

    return data.map((bar, index) => {
      const labelled = chosen.has(index);
      /*
       * Linear, so a bar's length means what it looks like it means. The floor is what keeps a
       * tiny value visible beside a huge one -- this used to switch to a square-root scale for
       * that, which needed a caption to explain itself and, because the floor was already
       * there, only ever served to overstate the middle of the range.
       *
       * max === 0 no longer empties the chart. Every value being zero is a real answer and a
       * different one from "no data": a job whose runs all round to 0.0 minutes used to hit
       * the empty state and print "nothing to show" beside a caption saying the runs exist.
       */
      const px = max > 0 && bar.value > 0
        ? Math.min(Math.max(Math.round((bar.value / max) * track), 3), track)
        : 0;
      // Taller than the axis it is drawn against: the roll-up, almost always. Flagged so the bar
      // can say it was cut rather than quietly pretending to be exactly as tall as the tallest
      // real bar, which would be a different and untrue statement.
      const clipped = max > 0 && bar.value > max;
      return {
        ...bar,
        clipped,
        newGroup: index === 0 || bar.name !== data[index - 1].name,
        labelled,
        // The two outermost labels are pulled inward so they sit over the plot rather than
        // hanging 10px into the card's padding, pointing at nothing.
        align: !labelled ? 'center' : index === starts[0] ? 'start' : index === last ? 'end' : 'center',
        display: format(bar.value),
        hint: this.hintFor(bar, format),
        px: px,
        stack: this.stackFor(bar, px),
      };
    });
  });

  /** Segment heights that add up to exactly the bar's own height, with no rounding drift. */
  private stackFor(bar: Bar, px: number): { label: string; color: string; px: number }[] {
    const parts = (bar.segments ?? []).filter(part => part.value > 0);
    if (!parts.length || px <= 0) return [];
    const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;
    let used = 0;
    return parts.map((part, index) => {
      // The last segment takes the remainder rather than its own rounded share, so the stack
      // is never a pixel short of (or past) the bar it is filling.
      const height = index === parts.length - 1
        ? Math.max(0, px - used)
        : Math.max(1, Math.round((part.value / total) * px));
      used += height;
      return { label: part.label, color: part.color, px: height };
    });
  }

  private hintFor(bar: Bar, format: (value: number) => string): string {
    const head = `${bar.name}: ${format(bar.value)}`
      + (bar.value > this.maxValue() ? ' \u2014 taller than this chart\u2019s scale, drawn cut' : '');
    const parts = (bar.segments ?? []).filter(part => part.value > 0);
    return parts.length
      ? head + ' — ' + parts.map(part => `${part.label} ${format(part.value)}`).join(', ')
      : head;
  }

  /**
   * One entry per distinct segment label, in the order the stacks introduce them.
   *
   * Empty for a plain bar chart -- there is nothing to key, the bars are already labelled -- so
   * the legend costs an unstacked chart no space at all. The colour is taken from the first
   * segment carrying that label rather than from the position, which is the same rule the stack
   * itself follows: colour is keyed on the CATEGORY, so one category is one colour in every bar.
   */
  protected readonly legend = computed(() => {
    const entries: { label: string; color: string }[] = [];
    const seen = new Set<string>();
    for (const bar of this.data()) {
      for (const part of bar.segments ?? []) {
        if (part.value <= 0 || seen.has(part.label)) continue;
        seen.add(part.label);
        entries.push({ label: part.label, color: part.color });
      }
    }
    return entries;
  });

  /** What a screen reader is told about a chart nobody can click into. */
  protected readonly summary = computed(() => {
    const data = this.data();
    if (!data.length) return this.emptyMessage();
    const format = this.format();
    const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
    return `Bar chart of ${data.length} values from ${data[0].name} to ${data[data.length - 1].name}; `
      + `highest is ${peak.name} at ${format(peak.value)}.`;
  });
}
