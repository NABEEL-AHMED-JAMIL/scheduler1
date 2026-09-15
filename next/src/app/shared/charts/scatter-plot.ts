import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { compactNumber } from './number-format';

export interface ScatterPoint {
  /** The label the pair came from, so a dot can say what it is. */
  label: string;
  x: number;
  y: number;
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = 26;

/**
 * Two numbers against each other, one dot per group.
 *
 * <b>The point of a scatter is that BOTH axes are quantities.</b> An analysis returns one measure
 * and one or more dimensions, so this can only draw when the dimension is itself numeric --
 * quantity against revenue, hour of day against order count. Against a categorical dimension
 * there is no x to speak of, and spacing the categories evenly would draw a shape that says
 * something about the alphabet. The dashboard refuses the kind in that case and says why.
 *
 * Both axes run from zero. Unlike a line -- which is about change and may start where the data
 * does -- a scatter is about position, and a cloud plotted on cropped axes reads as a
 * relationship that is an artefact of the crop.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-scatter-plot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!data().length) {
      <p class="field-note text-[color:var(--text-muted)]">{{ emptyMessage() }}</p>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height()" class="w-full"
           [style.height.px]="height()" role="img" [attr.aria-label]="summary()">
        <line [attr.x1]="pad" [attr.y1]="height() - pad" [attr.x2]="width - 4"
              [attr.y2]="height() - pad" stroke="var(--border-subtle)" stroke-width="1" />
        <line [attr.x1]="pad" y1="4" [attr.x2]="pad" [attr.y2]="height() - pad"
              stroke="var(--border-subtle)" stroke-width="1" />
        @for (dot of dots(); track dot.label) {
          <circle [attr.cx]="dot.cx" [attr.cy]="dot.cy" r="3.5" [attr.fill]="colour()"
                  fill-opacity="0.75">
            <title>{{ dot.label }}: {{ dot.shownX }}, {{ dot.shownY }}</title>
          </circle>
        }
        <!-- The FORMATTED bounds, not the raw ones. bounds().highX is the number the geometry
             divides by, and printing it put "1267.19353428047" on an axis in 10px type -- the
             trailing digits an artefact of the CSV reader typing the column as DOUBLE. The two
             label fields beside it were computed for this and rendered nowhere. -->
        <text [attr.x]="pad" [attr.y]="height() - 6" font-size="10"
              fill="var(--text-muted)">{{ bounds().lowX }}</text>
        <text [attr.x]="width - 4" [attr.y]="height() - 6" font-size="10" text-anchor="end"
              fill="var(--text-muted)">{{ bounds().highXLabel }}</text>
        <text x="2" y="12" font-size="10" fill="var(--text-muted)">{{ bounds().highYLabel }}</text>
      </svg>
      <p class="text-[10px] text-[color:var(--text-muted)] text-center">
        {{ xLabel() }} across, {{ yLabel() }} up
      </p>
    }
  `,
})
export class ScatterPlot {

  readonly data = input.required<ScatterPoint[]>();
  readonly xLabel = input('x');
  readonly yLabel = input('y');
  readonly emptyMessage = input('Nothing to draw.');
  readonly colour = input('var(--chart-1)');
  readonly format = input<(value: number) => string>(compactNumber);

  protected readonly width = WIDTH;
  /**
   * How tall to draw, in the SVG's own coordinates.
   *
   * An input rather than the module constant it was, so a dashboard tile whose author asked for
   * a taller widget gets one. The axes and their labels are positioned from it, so the whole
   * drawing grows rather than the same drawing being stretched.
   */
  readonly height = input(HEIGHT);
  protected readonly pad = PAD;

  protected readonly bounds = computed(() => {
    const points = this.data();
    // From zero on both axes -- see the class comment.
    const highX = Math.max(0, ...points.map(point => point.x));
    const highY = Math.max(0, ...points.map(point => point.y));
    return {
      highX, highY,
      lowX: '0',
      highXLabel: this.format()(highX),
      highYLabel: this.format()(highY),
    };
  });

  protected readonly dots = computed(() => {
    const { highX, highY } = this.bounds();
    const spanX = highX || 1;
    const spanY = highY || 1;
    const usableWidth = WIDTH - PAD - 8;
    const usableHeight = this.height() - PAD - 8;

    return this.data().map(point => ({
      label: point.label,
      shownX: this.format()(point.x),
      shownY: this.format()(point.y),
      cx: PAD + (point.x / spanX) * usableWidth,
      cy: this.height() - PAD - (point.y / spanY) * usableHeight,
    }));
  });

  protected readonly summary = computed(() =>
    `${this.data().length} points of ${this.xLabel()} against ${this.yLabel()}.`);
}
