import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { compactNumber } from './number-format';

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
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height()" class="w-full"
           [style.height.px]="height()" role="img" [attr.aria-label]="summary()"
           preserveAspectRatio="none">
        @if (filled()) {
          <path [attr.d]="areaPath()" [attr.fill]="colour()" fill-opacity="0.16" />
        }
        <path [attr.d]="linePath()" fill="none" [attr.stroke]="colour()" stroke-width="2"
              vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        @for (mark of marks(); track mark.label) {
          <circle [attr.cx]="mark.x" [attr.cy]="mark.y" r="2.5" [attr.fill]="colour()"
                  vector-effect="non-scaling-stroke">
            <title>{{ mark.label }}: {{ mark.shown }}</title>
          </circle>
        }
      </svg>
      <div class="flex justify-between text-[10px] text-[color:var(--text-muted)] tabular">
        @for (mark of labelled(); track mark.label) {
          <span class="truncate">{{ mark.label }}</span>
        }
      </div>
    }
  `,
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
      shown: this.format()(point.value),
      x: PAD_LEFT + step * at,
      y: usable - ((point.value - low) / span) * (usable - 8) + 4,
    }));
  });

  protected readonly linePath = computed(() =>
    this.marks().map((mark, at) => `${at === 0 ? 'M' : 'L'}${mark.x} ${mark.y}`).join(' '));

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
    return `A series of ${marks.length} points, from ${marks[0].label} `
      + `to ${marks[marks.length - 1].label}.`;
  });
}
