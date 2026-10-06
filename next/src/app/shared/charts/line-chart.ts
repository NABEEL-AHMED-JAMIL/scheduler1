import { Component, ChangeDetectionStrategy, computed, input, signal } from '@angular/core';
import { compactNumber } from './number-format';
import { shortLabel } from './short-label';
import { capTitle } from '../ui/long-text';
import { dayLabel } from '../ui/time-format';
import { instantOf } from '../../core/instant';

export interface Point {
  label: string;
  value: number;
}

/** How wide the drawing is in its own coordinates. Scaled by CSS, so the number is arbitrary. */
const WIDTH = 600;
/** The drawing's own height when the caller does not give one. */
const HEIGHT = 160;
const PAD_LEFT = 4;
const PAD_BOTTOM = 18;
/** Past this many points the markers merge into a band, so they are not drawn (the line still is). */
export const MARKERS_UP_TO = 120;
/** Past this many points the line is drawn through each pixel column's low and high, not every point. */
export const DECIMATE_FROM = WIDTH * 2;

/**
 * A point's label as a reader reads it: a date-time on the console's 24-hour clock ("4 Mar
 * 08:00"), a calendar day as "4 Mar 2026", anything else as it is. Ten thousand ISO strings cut
 * to "2024-01…" said nothing about where on the axis a reader was.
 */
export function pointLabel(text: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  if (!/\d{2}:\d{2}/.test(text)) return dayLabel(text);
  const moment = instantOf(text);
  return moment
    ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(moment)
    : text;
}

/**
 * A value against an ordered dimension, drawn as a line or as a filled area.
 *
 * <b>A line asserts that the gaps between its points mean something.</b> That is the whole
 * difference between this and a bar chart, and it is why the dashboard refuses this kind for a
 * result sorted by measure: joining rank-ordered points draws a shape that descends from left to
 * right whatever the data did, and a reader sees a trend that is an artefact of the sort. The
 * refusal lives in issuesFor(), where every other undrawable-kind reason lives.
 *
 * <b>The area variant starts at zero, so it cannot carry negatives.</b> A filled region between a
 * line and a baseline reads as accumulated magnitude; below the baseline that reading inverts and
 * the fill covers the wrong side. Also refused in issuesFor().
 *
 * Only every Nth label is drawn, because twenty-four months of labels at this width overlap into
 * a grey smear. The point markers stay, so the reader can still see how many observations there
 * are between two labels.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!data().length) {
      <p class="field-note text-[color:var(--text-muted)]">{{ emptyMessage() }}</p>
    } @else {
      <!-- The point nearest the pointer is read out above the line: past MARKERS_UP_TO there are no
           markers to carry a title, and a long series still has to say what is under the pointer. -->
      <div class="relative" (mousemove)="hover($event)" (mouseleave)="hoverAt.set(null)">
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height()" class="w-full block"
           [style.height.px]="height()" role="img" [attr.aria-label]="summary()"
           preserveAspectRatio="none">
        @if (filled()) {
          <path [attr.d]="areaPath()" [attr.fill]="colour()" fill-opacity="0.16" />
        }
        <path [attr.d]="linePath()" fill="none" [attr.stroke]="colour()" stroke-width="2"
              vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        @for (mark of dots(); track $index) {
          <circle [attr.cx]="mark.x" [attr.cy]="mark.y" r="2.5" [attr.fill]="colour()"
                  vector-effect="non-scaling-stroke">
            <title>{{ mark.title }}: {{ mark.shown }}</title>
          </circle>
        }
        @if (hovered(); as point) {
          <line [attr.x1]="point.x" [attr.x2]="point.x" y1="0" [attr.y2]="height() - 18" stroke="var(--text-muted)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
          <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3.5" [attr.fill]="colour()" stroke="var(--surface-raised)" vector-effect="non-scaling-stroke" />
        }
      </svg>
      @if (hovered(); as point) {
        <div class="line-readout" [style.left.%]="(point.x / width) * 100" [class.flip]="point.x > width * 0.6" role="status">
          <span class="block text-[color:var(--text-secondary)]">{{ point.when }}</span>
          <span class="block font-medium tabular">{{ point.shown }}</span>
        </div>
      }
      </div>
      <div class="flex justify-between text-[11px] text-[color:var(--text-muted)] tabular">
        @for (mark of labelled(); track $index) {
          <span class="truncate">{{ mark.short }}</span>
        }
      </div>
    }
  `,
  styles: [`
    .line-readout { position: absolute; top: 0; transform: translateX(8px); pointer-events: none; z-index: 1;
      max-width: min(18rem, 60%); padding: 0.25rem 0.5rem; font-size: 12px; line-height: 1.35;
      background: var(--surface-raised); color: var(--text-primary); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); box-shadow: 0 4px 12px var(--shadow-color); overflow-wrap: anywhere; }
    .line-readout.flip { transform: translateX(calc(-100% - 8px)); }
  `],
})
export class LineChart {

  readonly data = input.required<Point[]>();
  readonly filled = input(false);
  readonly emptyMessage = input('Nothing to draw.');
  readonly colour = input('var(--chart-1)');
  readonly format = input<(value: number) => string>(compactNumber);

  protected readonly width = WIDTH;
  /**
   * How tall to draw, in the SVG's own coordinates.
   *
   * An input rather than the module constant it was, so a dashboard tile whose author asked for
   * a taller widget gets one. The viewBox follows it -- with preserveAspectRatio="none" a fixed
   * viewBox and a changed CSS height would stretch the strokes rather than draw more chart.
   */
  readonly height = input(HEIGHT);

  /**
   * The points in drawing coordinates.
   *
   * The vertical scale runs from the lowest value to the highest rather than from zero, which is
   * right for a line -- a line is about change, and a revenue series between 4.1M and 4.5M drawn
   * from zero is a flat line that hides everything the reader came for. The area variant is a
   * different claim and is refused for negatives elsewhere.
   *
   * A series whose values are all identical would divide by zero; it gets a flat line at the
   * middle, which is what it is.
   */
  protected readonly marks = computed(() => {
    const points = this.data();
    const values = points.map(point => point.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high - low || 1;
    const usable = this.height() - PAD_BOTTOM;
    const step = points.length > 1 ? (WIDTH - PAD_LEFT * 2) / (points.length - 1) : 0;

    return points.map((point, at) => ({
      label: point.label,
      // A point's label is a value of the data and can be a paragraph (owner, 2026-09-28).
      short: shortLabel(pointLabel(point.label)),
      title: capTitle(point.label),
      shown: this.format()(point.value),
      x: PAD_LEFT + step * at,
      y: usable - ((point.value - low) / span) * (usable - 8) + 4,
    }));
  });

  /** The index of the point nearest the pointer, or null. */
  readonly hoverAt = signal<number | null>(null);

  protected readonly hovered = computed(() => {
    const at = this.hoverAt();
    const mark = at === null ? undefined : this.marks()[at];
    return mark ? { ...mark, when: capTitle(pointLabel(mark.label)) } : null;
  });

  hover(event: MouseEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const n = this.marks().length;
    if (!box.width || !n) return;
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const step = n > 1 ? (WIDTH - PAD_LEFT * 2) / (n - 1) : 1;
    this.hoverAt.set(Math.max(0, Math.min(n - 1, Math.round((x - PAD_LEFT) / step))));
  }

  /** The markers, while there are few enough to tell apart. */
  protected readonly dots = computed(() => (this.marks().length <= MARKERS_UP_TO ? this.marks() : []));

  /**
   * The points the path runs through. Every one up to DECIMATE_FROM; past that, each pixel
   * column's first, lowest, highest and last, in order -- the same line to the eye, every peak
   * kept, and a path of a few thousand segments rather than ten thousand.
   */
  protected readonly pathPoints = computed(() => {
    const marks = this.marks();
    if (marks.length <= DECIMATE_FROM) return marks;
    const out: typeof marks = [];
    let column: typeof marks = [];
    let at = -1;
    const flush = () => {
      if (!column.length) return;
      const low = column.reduce((a, b) => (b.y > a.y ? b : a));
      const high = column.reduce((a, b) => (b.y < a.y ? b : a));
      const kept = new Set([column[0], low, high, column[column.length - 1]]);
      out.push(...column.filter(mark => kept.has(mark)));
    };
    for (const mark of marks) {
      const x = Math.floor(mark.x);
      if (x !== at) { flush(); column = []; at = x; }
      column.push(mark);
    }
    flush();
    return out;
  });

  protected readonly linePath = computed(() =>
    this.pathPoints().map((mark, at) => `${at === 0 ? 'M' : 'L'}${mark.x} ${mark.y}`).join(' '));

  protected readonly areaPath = computed(() => {
    const marks = this.marks();
    if (!marks.length) return '';
    const floor = this.height() - PAD_BOTTOM;
    return `${this.linePath()} L${marks[marks.length - 1].x} ${floor} L${marks[0].x} ${floor} Z`;
  });

  /** At most eight labels, evenly spaced, so they do not overlap into a smear. */
  protected readonly labelled = computed(() => {
    const marks = this.marks();
    if (marks.length <= 8) return marks;
    const every = Math.ceil(marks.length / 8);
    return marks.filter((_, at) => at % every === 0);
  });

  protected readonly summary = computed(() => {
    const marks = this.marks();
    if (!marks.length) return this.emptyMessage();
    return `A series of ${marks.length} points, from ${marks[0].short} `
      + `to ${marks[marks.length - 1].short}.`;
  });
}
