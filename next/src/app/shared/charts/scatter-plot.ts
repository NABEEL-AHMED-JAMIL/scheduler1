import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { compactNumber } from './number-format';
import { capTitle } from '../ui/long-text';

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
 * relationship that is an artefact of the crop. A negative figure (a loss against sales, ZT-A1) takes the axis below
 * zero rather than off the drawing: the axis then runs from the lowest figure, and a dashed line marks zero.
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
      <!-- The FORMATTED bounds, not the raw ones. bounds().highX is the number the geometry
           divides by, and printing it put "1267.19353428047" on an axis -- the trailing digits an
           artefact of the CSV reader typing the column as DOUBLE.

           HTML, not <text> inside the svg (MIG-257): the drawing is 600 units wide and scaled to
           its card, so an 11-unit label came out at 5-6px in a 300px dashboard tile. -->
      <span class="scatter-axis block text-[11px] text-[color:var(--text-muted)] tabular">{{ bounds().highYLabel }}</span>
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height()" class="w-full"
           [style.height.px]="height()" role="img" [attr.aria-label]="summary()">
        <line [attr.x1]="pad" [attr.y1]="height() - pad" [attr.x2]="width - 4"
              [attr.y2]="height() - pad" stroke="var(--border-subtle)" stroke-width="1" />
        <line [attr.x1]="pad" y1="4" [attr.x2]="pad" [attr.y2]="height() - pad"
              stroke="var(--border-subtle)" stroke-width="1" />
        @if (zero().y !== null) {
          <line data-zero="y" [attr.x1]="pad" [attr.y1]="zero().y" [attr.x2]="width - 4" [attr.y2]="zero().y"
                stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="4 3" />
        }
        @if (zero().x !== null) {
          <line data-zero="x" [attr.x1]="zero().x" y1="4" [attr.x2]="zero().x" [attr.y2]="height() - pad"
                stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="4 3" />
        }
        @for (dot of dots(); track dot.label) {
          <circle [attr.cx]="dot.cx" [attr.cy]="dot.cy" r="3.5" [attr.fill]="colour()"
                  fill-opacity="0.75">
            <title>{{ dot.title }}: {{ dot.shownX }}, {{ dot.shownY }}</title>
          </circle>
        }
      </svg>
      @if (bounds().lowY < 0) {
        <span class="scatter-axis-low block text-[11px] text-[color:var(--text-muted)] tabular">{{ bounds().lowYLabel }}</span>
      }
      <div class="flex justify-between text-[11px] text-[color:var(--text-muted)] tabular">
        <span class="scatter-axis">{{ bounds().lowXLabel }}</span>
        <span class="scatter-axis">{{ bounds().highXLabel }}</span>
      </div>
      <p class="text-[11px] text-[color:var(--text-muted)] text-center">
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
    // From zero on both axes -- see the class comment -- or from the lowest figure when one is below it.
    const highX = Math.max(0, ...points.map(point => point.x));
    const highY = Math.max(0, ...points.map(point => point.y));
    const lowX = Math.min(0, ...points.map(point => point.x));
    const lowY = Math.min(0, ...points.map(point => point.y));
    return {
      highX, highY, lowX, lowY,
      lowXLabel: lowX < 0 ? this.format()(lowX) : '0',
      lowYLabel: this.format()(lowY),
      highXLabel: this.format()(highX),
      highYLabel: this.format()(highY),
    };
  });

  /** Where zero falls inside the drawing when an axis runs below it; null when the axis starts at zero. */
  protected readonly zero = computed(() => {
    const { highX, highY, lowX, lowY } = this.bounds();
    const usableWidth = WIDTH - PAD - 8;
    const usableHeight = this.height() - PAD - 8;
    return {
      x: lowX < 0 ? PAD + (-lowX / ((highX - lowX) || 1)) * usableWidth : null,
      y: lowY < 0 ? this.height() - PAD - (-lowY / ((highY - lowY) || 1)) * usableHeight : null,
    };
  });

  protected readonly dots = computed(() => {
    const { highX, highY, lowX, lowY } = this.bounds();
    const spanX = (highX - lowX) || 1;
    const spanY = (highY - lowY) || 1;
    const usableWidth = WIDTH - PAD - 8;
    const usableHeight = this.height() - PAD - 8;

    return this.data().map(point => ({
      label: point.label,
      title: capTitle(point.label),
      shownX: this.format()(point.x),
      shownY: this.format()(point.y),
      cx: PAD + ((point.x - lowX) / spanX) * usableWidth,
      cy: this.height() - PAD - ((point.y - lowY) / spanY) * usableHeight,
    }));
  });

  protected readonly summary = computed(() =>
    `${this.data().length} points of ${this.xLabel()} against ${this.yLabel()}.`);
}
