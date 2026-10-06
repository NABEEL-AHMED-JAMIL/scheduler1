import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { compactNumber, compactTenths } from './number-format';
import { shortLabel } from './short-label';
import { compactDuration, formatDuration } from '../ui/time-format';
import { capTitle } from '../ui/long-text';

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
 * Width of one character at the 11px type these labels are drawn in.
 *
 * Measured against the rendered font rather than assumed. MIG-257 lifted these labels from 10px to
 * 11px, the smallest size on the type scale: tabular digits are 6.6px there and the mixed-case
 * names on the axis average about 6.2. 6.2 with a 6px gutter keeps a ten-character id
 * ("CUST-00111") on every bar of a roomy chart, as it was at 10px, and the gutter still covers the
 * difference for an all-digit label up to fifteen characters -- past that the axis is already
 * thinned to every second label or fewer.
 */
const CHAR_PX = 6.2;

/** Breathing room either side, so two labels never touch even when both just fit. */
const LABEL_GUTTER = 6;

/** The pixels the widest of these strings needs. */
function widestText(texts: string[]): number {
  let widest = 0;
  for (const text of texts) {
    widest = Math.max(widest, (text ?? '').length);
  }
  return widest * CHAR_PX + LABEL_GUTTER;
}

/**
 * The widest a bar cell gets, in px: max-w-16 on the button. The pitch a label really has is
 * the smaller of the column the chart could give each bar and this cap, and it used to be
 * measured from the column alone -- so a seven-bar chart in a 930px pane reported 133px of
 * pitch, drew "14,791,928.89" over each 64px bar, and seven labels ran into one another.
 */
const BAR_MAX_PX = 64;

/** Chrome reserved above and below the bar itself: value line plus axis line, or axis alone. */
const RESERVE_WITH_VALUES = 32;
const RESERVE_AXIS_ONLY = 18;

/** The column the y-axis's figures take at the chart's left when [axis] is on, in px: w-11 / ml-11 in the template. */
export const AXIS_PX = 44;

/**
 * Round ticks from 0 up to at least `max`, about four steps of 1, 2 or 5 times a power of ten.
 *
 * `whole` keeps the step at 1 or more, so a count axis never reads "0.5 runs". The last tick is the top of the scale
 * the bars are drawn against when the axis is on, so a gridline is exactly the value it is labelled with.
 */
export function axisTicks(max: number, whole = true): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0];
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map(m => m * power).find(candidate => candidate >= raw) ?? 10 * power;
  if (whole) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + step / 1e6; i++) ticks.push(Number((i * step).toPrecision(12)));
  return ticks;
}

@Component({
  selector: 'app-bar-chart',
  // The host must be a block for getBoundingClientRect to report the width the bars actually
  // get; an inline host measures its content, not its column.
  styles: [':host { display: block; }'],
  imports: [NgTemplateOutlet],
  template: `
    @if (bars().length) {
      @if (axis()) {
        <!-- [axis]: figures up the left, a gridline at each, and the day's figures where the pointer is. The bars row
             itself is the same template as without, so a chart that does not ask for an axis renders exactly as before. -->
        <div class="flex min-w-0" data-chart-axis>
          <div class="relative shrink-0 w-11" [style.height.px]="height()" aria-hidden="true">
            @for (tick of tickMarks(); track tick.value) {
              <span class="absolute right-2 text-[11px] leading-none tabular-nums text-[color:var(--text-muted)]"
                    data-axis-tick [style.bottom.px]="tick.px - 5">{{ tick.figure }}</span>
            }
          </div>
          <div class="relative flex-1 min-w-0" (pointermove)="pointAt($event)" (pointerdown)="pointAt($event)"
               (pointerleave)="hovered.set(-1)">
            @for (tick of tickMarks(); track tick.value) {
              <!-- The baseline solid and stronger, the gridlines above it dashed and quiet. -->
              <span aria-hidden="true" [style.bottom.px]="tick.px"
                    [class]="tick.value === 0
                      ? 'absolute inset-x-0 border-t pointer-events-none border-[color:var(--border-strong)]'
                      : 'absolute inset-x-0 border-t border-dashed pointer-events-none border-[color:var(--border-subtle)]'"></span>
            }
            @if (readout(); as point) {
              <!-- The hovered day's column, behind its bar. -->
              <span class="absolute inset-y-0 rounded-sm pointer-events-none bg-[color:var(--surface-sunken)]" aria-hidden="true"
                    [style.left.%]="point.slotLeft" [style.width.%]="point.slotWidth"></span>
            }
            <ng-container [ngTemplateOutlet]="row" />
            @if (readout(); as point) {
              <div class="absolute top-0 z-10 pointer-events-none rounded-md border px-2.5 py-1.5 text-xs shadow-sm
                          whitespace-nowrap bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)]"
                   data-chart-readout [style.left.%]="point.left" [style.transform]="point.shift">
                <div class="font-semibold">{{ point.heading }}</div>
                <div class="tabular-nums text-[color:var(--text-secondary)]">Total {{ point.total }}</div>
                @for (part of point.parts; track part.caption) {
                  <div class="flex items-center gap-1.5 tabular-nums">
                    <span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0" [style.background]="part.color"></span>
                    {{ part.caption }} {{ part.value }}
                  </div>
                }
              </div>
            }
          </div>
        </div>
      } @else {
        <ng-container [ngTemplateOutlet]="row" />
      }
      <ng-template #row>
      <!-- One role="img" for the whole chart, matching app-histogram. Each bar used to be a
           button whether or not it did anything, so a non-interactive chart put N dead tab
           stops in the keyboard order and read as N buttons to a screen reader. -->
      <!-- The gap collapses as the bars get thin. gap-1 is 4px per bar and a gap does NOT
           shrink, so 366 days demanded 365*4 = 1460px of gutter alone: the bars were squeezed
           to zero width and the row still overflowed, pushing a horizontal scrollbar onto the
           whole page. Below ~9px of pitch the separation has to come from the bar edges, not
           from space between them. -->
      <!-- justify-around: bars stop at BAR_MAX_PX, so a week in a wide card would bunch at the left and leave the
           rest of the card empty; spread, the chart fills its card. Bars that are not capped fill the row anyway. -->
      <div class="flex items-end justify-around min-w-0" [class.gap-1]="gap() === 4"
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
                  [title]="axis() ? '' : bar.hint"
                  [class.relative]="axis()"
                  [class.pointer-events-none]="axis() && !clickable()"
                  (click)="barClicked.emit(bar)">
            @if (showValues()) {
              <span class="text-[11px] tabular leading-none text-[color:var(--text-muted)]">{{ bar.display }}</span>
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
              <span class="w-full transition-[height] border-t-[color:var(--surface-raised)]"
                    [class.rounded-t]="!bar.clipped"
                    [class.border-t-2]="bar.clipped"
                    [class.border-dashed]="bar.clipped"
                    [style.background]="bar.color || 'var(--chart-0)'"
                    [style.height.px]="bar.px"></span>
            }
            <!-- The label overflows its own cell on purpose: at a 14px pitch no date fits, and
                 the neighbours it spills over are empty by construction. The edge labels are
                 anchored inward instead so they do not hang off the card. -->
            <!-- Flex, not text-align: a line wider than its box overflows to the right whatever
                 text-align says, so the last label hung off the card by a few px. A flex-end item
                 overflows toward the start instead. -->
            <span class="flex text-[11px] text-[color:var(--text-muted)] w-full h-3.5
                         leading-[0.875rem] overflow-visible"
                  [class.justify-center]="bar.align === 'center'"
                  [class.justify-start]="bar.align === 'start'"
                  [class.justify-end]="bar.align === 'end'">
              @if (bar.labelled) {
                <!-- Short: the thinning above is measured on this string, and a category can be a
                     20,000-character note (owner, 2026-09-28). The whole name is in the hint. -->
                <span class="whitespace-nowrap">{{ bar.short }}</span>
              }
            </span>
          </button>
        }
      </div>
      </ng-template>

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
        <ul class="flex flex-wrap gap-x-3 gap-y-1 mt-2 list-none" aria-hidden="true"
            [class.ml-11]="axis()">
          @for (entry of legend(); track entry.label) {
            <li class="flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]"
                [title]="title(entry.label)">
              <span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    [style.background]="entry.color"></span>
              <span class="whitespace-nowrap">{{ short(entry.label) }}</span>
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
  /**
   * What the values are. 'duration' reads them as seconds: the label above a bar is the short
   * form ("25s", "3.4m") and the tooltip the full one ("25.3s", "3m 20s"), as every other duration
   * in the console is written. The run charts plotted minutes through the number format before
   * this, so a 25 second run was labelled 0.
   *
   * A string rather than a formatter bound from the template: binding a function-typed property
   * to an input crashes the Angular 22 compiler (see shared/ui/combobox.ts).
   */
  readonly unit = input<'number' | 'duration'>('number');
  readonly barClicked = output<Bar>();

  /**
   * A y-axis: round figures up the left with a gridline at each, the bars scaled to the top tick, and the bar's figures
   * (its total and each segment) shown where the pointer is rather than in a title. The figures above the bars are left
   * off, because the axis carries the scale. Off by default: every chart that does not ask renders as before.
   */
  readonly axis = input(false);
  /** The bar under the pointer while [axis] is on; -1 for none. */
  readonly hovered = signal(-1);

  /** How a value is written above its bar, before any fallback for width. */
  private readonly labelFormat = computed(() =>
    this.unit() === 'duration' ? compactDuration : this.format());

  /** How a value is written where there is room for all of it: the tooltip and the summary. */
  private readonly hintFormat = computed(() =>
    this.unit() === 'duration' ? formatDuration : this.format());

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
    const box = Math.round((this.host.nativeElement as HTMLElement).getBoundingClientRect().width);
    // The axis column is not bar room: measured with it, the pitch was 44px / n too wide.
    const width = this.axis() ? box - AXIS_PX : box;
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

  /** The axis's figures, when [axis] is on; none otherwise. */
  private readonly ticks = computed(() => this.axis()
    ? axisTicks(this.maxValue(), this.data().every(bar => Number.isInteger(bar.value ?? 0)))
    : []);

  /** The value the full track stands for: the axis's top tick when there is one, else the tallest bar. */
  private readonly scaleMax = computed(() => {
    const ticks = this.ticks();
    return ticks.length > 1 ? ticks[ticks.length - 1] : this.maxValue();
  });

  /** The bars' own height: the chart's, less the label line and (when drawn) the value line. */
  private readonly track = computed(() =>
    Math.max(this.height() - (this.showValues() ? RESERVE_WITH_VALUES : RESERVE_AXIS_ONLY), 18));

  /** Each tick with the px above the chart's bottom its gridline sits at: the label line, then its share of the track. */
  protected readonly tickMarks = computed(() => {
    const ticks = this.ticks();
    const top = this.scaleMax();
    const format = this.labelFormat();
    return ticks.map(value => ({
      value,
      figure: format(value),
      px: RESERVE_AXIS_ONLY + (top > 0 ? Math.round((value / top) * this.track()) : 0),
    }));
  });

  /** Which bar the pointer is over, from where it is across the row: each bar has an equal slot. */
  protected pointAt(event: PointerEvent): void {
    const count = this.data().length;
    const target = event.currentTarget as HTMLElement | null;
    if (!count || !target) return;
    const box = target.getBoundingClientRect();
    if (!box.width) return;
    const index = Math.floor(((event.clientX - box.left) / box.width) * count);
    this.hovered.set(Math.min(count - 1, Math.max(0, index)));
  }

  /** What the readout says about the hovered bar, and where it sits: over the bar, kept inside the chart at the ends. */
  protected readonly readout = computed(() => {
    const index = this.hovered();
    const data = this.data();
    const bar = index >= 0 ? data[index] : undefined;
    if (!bar) return null;
    const format = this.hintFormat();
    const left = ((index + 0.5) / data.length) * 100;
    return {
      heading: capTitle(bar.name),
      total: format(bar.value),
      parts: (bar.segments ?? []).map(part => ({ caption: capTitle(part.label), color: part.color, value: format(part.value) })),
      left,
      slotLeft: (index / data.length) * 100,
      slotWidth: 100 / data.length,
      shift: left < 15 ? 'translateX(-10%)' : left > 85 ? 'translateX(-90%)' : 'translateX(-50%)',
    };
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
    return count && width ? Math.min(width / count, BAR_MAX_PX + this.gap()) : 0;
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

  /**
   * How a value is written above its bar: the caller's format when every one fits the pitch,
   * the compact form ("14.8M", then "15M") when only that fits, and nothing when not even that does.
   *
   * Against the WIDEST value actually formatted, not a constant. A dashboard tile passes the
   * faithful formatter, so these are "4,398,765.46" and not "4.4M"; whether they fit is a fact
   * about the string, and the previous 22px threshold was true of "4.4M" and nothing else. The
   * compact fallback is new: a seven-bar chart whose full figures do not fit used to draw them
   * anyway, and one whose figures fit nowhere hid them all. The full figure stays in the bar's
   * hint either way, so nothing is lost -- only the collision.
   */
  private readonly valueFormat = computed<((value: number) => string) | null>(() => {
    if (this.hideValues() || this.axis()) return null;
    const data = this.data();
    if (!data.length) return null;
    const pitch = this.pitch();
    const format = this.labelFormat();
    if (!pitch) return data.length <= 24 ? format : null;
    const fits = (f: (value: number) => string) => pitch >= Math.max(VALUE_PX, widestText(data.map(bar => f(bar.value))));
    if (fits(format)) return format;
    // Nothing shorter to fall back to. A duration is never written as "1.2K" seconds.
    if (format === compactNumber || format === compactDuration) return null;
    // Tenths first: "14.8M" over seven bars that "15M" would label identically.
    if (fits(compactTenths)) return compactTenths;
    if (fits(compactNumber)) return compactNumber;
    return null;
  });

  protected readonly showValues = computed(() => this.valueFormat() !== null);

  /** Label every Nth group, where N is however many bars the WIDEST label is wide. */
  private readonly every = computed(() => {
    const count = this.data().length;
    if (count < 2) return 1;
    const pitch = this.pitch();
    if (!pitch) return count > 16 ? Math.ceil(count / 8) : 1;
    // The widest label decides the spacing for all of them: thinning to fit the average leaves
    // the long ones overlapping their neighbours, which is what "CUST-00111 CUST-00319CUST-00315"
    // along the bottom of a Top-10 chart was.
    // The SHORTENED name, because that is what is drawn: measured on the whole value, one
    // 20,000-character category asked for 120,000px and left only the two ends labelled.
    return Math.max(1, Math.ceil(this.labelWidth() / pitch));
  });

  /** The px the widest drawn (shortened) label needs, with its gutter. */
  private readonly labelWidth = computed(() => Math.max(LABEL_PX, widestText(this.data().map(bar => shortLabel(bar.name)))));

  readonly bars = computed(() => {
    const data = this.data();
    if (!data.length) return [];
    const max = this.scaleMax();
    const format = this.labelFormat();
    // The reserve has to match the branch the template actually renders. It was a flat 32
    // even when no value line was drawn, which shortened every bar on a >24-bar chart by 14px.
    const track = this.track();
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
    const roomy = this.pitch() >= BAR_MAX_PX;
    /*
     * The two end labels are anchored to the edges (see align below), so each reaches a whole
     * label in from its end where a centred one reaches half. Spacing the label beside an end by
     * `every` alone let them meet: "31 Aug5 Sep" and "25 Sep30 Sep" on a 31-day card at tablet
     * width. Beside an end the gap is the end label's whole width plus half of the next one's.
     */
    const pitch = this.pitch();
    const edge = roomy || !pitch ? every : Math.max(every, Math.ceil((1.5 * this.labelWidth() - pitch / 2) / pitch));
    const chosen = new Set<number>([starts[0], last]);
    let previous = starts[0];
    for (const at of starts) {
      if (at - previous >= (previous === starts[0] ? edge : every) && last - at >= edge) {
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
       * different one from "no data": a job whose runs all rounded to 0.0 minutes used to hit
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
        // At full bar width a label fits over its own bar, so it stays centred under it.
        align: !labelled || roomy ? 'center' : index === starts[0] ? 'start' : index === last ? 'end' : 'center',
        short: shortLabel(bar.name),
        display: (this.valueFormat() ?? format)(bar.value),
        hint: this.hintFor(bar, this.hintFormat()),
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
    // The whole name, capped like any tooltip: the label under the bar is only its first words.
    const head = `${capTitle(bar.name)}: ${format(bar.value)}`
      + (bar.value > this.scaleMax() ? ' \u2014 taller than this chart\u2019s scale, drawn cut' : '');
    const parts = (bar.segments ?? []).filter(part => part.value > 0);
    return parts.length
      ? head + ' — ' + parts.map(part => `${capTitle(part.label)} ${format(part.value)}`).join(', ')
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

  /** A legend entry as drawn, and as its tooltip. */
  protected readonly short = shortLabel;
  protected readonly title = capTitle;

  /** What a screen reader is told about a chart nobody can click into. */
  protected readonly summary = computed(() => {
    const data = this.data();
    if (!data.length) return this.emptyMessage();
    const format = this.hintFormat();
    const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
    return `Bar chart of ${data.length} values from ${shortLabel(data[0].name)} to ${shortLabel(data[data.length - 1].name)}; `
      + `highest is ${shortLabel(peak.name)} at ${format(peak.value)}.`;
  });
}
