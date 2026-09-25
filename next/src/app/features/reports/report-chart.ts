import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal,
} from '@angular/core';
import { COUNTING, Measure, Pivot, formatMeasure } from './pivot';
import { compactNumber } from '../../shared/charts/number-format';

export type ChartKind =
  | 'grouped' | 'stacked' | 'pct' | 'donut' | 'pie'
  | 'line' | 'area' | 'ranked' | 'heat' | 'radar';

export const CHART_LABELS: Record<ChartKind, string> = {
  grouped: 'Grouped bars', stacked: 'Stacked bars', pct: '100% stacked',
  donut: 'Donut', pie: 'Pie', line: 'Line', area: 'Area',
  ranked: 'Ranked bars', heat: 'Heatmap', radar: 'Radar',
};

/** yyyy-mm-dd, or the mm-dd short form the day chart uses on a within-one-year axis. */
const ISO_DAY = /^(\d{4}-)?\d{2}-\d{2}$/;

/**
 * How many rows a radar draws before its overlapping shapes stop being separable.
 *
 * Exported because the legend rendered beside the chart slices the row labels to the same number.
 * It was a bare 4 in both files, and a magic number kept in two places is how a legend comes to
 * name a series that is not on the chart.
 */
export const RADAR_ROWS = 4;

/**
 * Math.max over an array, without spreading it.
 *
 * `Math.max(...matrix.flat(), 1)` passes one ARGUMENT per cell, and the engine's argument limit
 * is around 124,000 -- a pivot of 400 tasks by 366 days is 146,400 cells and threw a
 * RangeError that killed the whole chart rather than degrading it. The pivot is already capped
 * at 50,000 RUNS, which says nothing about the cell count.
 */
function maxOf(values: number[], floor: number): number {
  let max = floor;
  for (const value of values) if (value > max) max = value;
  return max;
}

function minOf(values: number[], fallback: number): number {
  let min = fallback;
  for (const value of values) if (value < min) min = value;
  return min;
}

/**
 * A measured value as geometry may use it.
 *
 * aggregate() answers NO_DURATION rather than 0 for a group it could not measure -- an empty
 * cell, or a column of runs that are all still in flight -- so that the table and the export can
 * print a dash instead of claiming the group finished instantly. Nothing here can draw a
 * negative: a bar scaled from it hangs below its own axis, a heat cell mixes a negative
 * percentage of ink into a colour, a radar spoke lands on the far side of its own centre, and a
 * line point leaves the plot through the bottom. So every COORDINATE is taken through this and
 * every TOOLTIP keeps the raw value, which formatMeasure already renders as the same dash the
 * table shows. Clamping to zero is not a second lie: a bar of no height asserts nothing, and the
 * hover text says what happened.
 */
function plotted(value: number): number {
  return value > 0 ? value : 0;
}

interface Segment { d: string; fill: string; hint: string; opacity?: number; }
interface AxisLabel { x: number; y: number; anchor: string; text: string; full: string; }
interface Bar { x: number; y: number; w: number; h: number; fill: string; hint: string; }

/**
 * The report's chart, drawn from the same pivot the table renders.
 *
 * One component rather than ten: every kind is the same grid seen differently, and splitting
 * them would mean ten places for the grid and the colours to drift apart. SVG is built in the
 * component rather than the template because the geometry is arithmetic, not markup.
 */
@Component({
  selector: 'app-report-chart',
  // A component host is display:inline by default, and ResizeObserver never fires for an
  // inline element -- it has no content box to observe. Without this the chart measured its
  // starting guess for ever and never grew into the card.
  styles: [':host { display: block; }'],
  template: `
    @if (!pivot().rowLabels.length) {
      <!-- A search that matches no row hands over an empty pivot; bare gridlines said nothing. -->
      <p class="text-sm text-[color:var(--text-muted)] py-8 text-center">{{ emptyMessage() }}</p>
    } @else {
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" width="100%" [attr.height]="H"
         role="img" [attr.aria-label]="chartLabels[kind()] + ' of ' + (label() || 'the report')">
      @for (line of gridLines(); track $index) {
        <line [attr.x1]="line.x1" [attr.x2]="line.x2" [attr.y1]="line.y" [attr.y2]="line.y"
              [attr.stroke]="'var(--border-subtle)'" />
        <text [attr.x]="line.x1 - 8" [attr.y]="line.y + 3" text-anchor="end"
              [attr.fill]="'var(--text-muted)'" font-size="10">{{ line.label }}</text>
      }
      @for (bar of bars(); track $index) {
        <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h"
              [attr.fill]="bar.fill" rx="2"><title>{{ bar.hint }}</title></rect>
      }
      @for (seg of segments(); track $index) {
        <path [attr.d]="seg.d" [attr.fill]="seg.fill"
              [attr.fill-opacity]="seg.opacity ?? null"><title>{{ seg.hint }}</title></path>
      }
      @for (stroke of strokes(); track $index) {
        <path [attr.d]="stroke.d" fill="none" [attr.stroke]="stroke.fill" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"><title>{{ stroke.hint }}</title></path>
      }
      <!-- A polyline through ONE point paints nothing, so a line chart of a single day -- which
           is exactly the current data -- rendered as an empty box with a full legend. Markers
           also give every point a hit target and a readable value, which the line alone never
           had: its only tooltip was the series name. -->
      @for (dot of markers(); track $index) {
        <circle [attr.cx]="dot.x" [attr.cy]="dot.y" [attr.r]="dot.r" [attr.fill]="dot.fill">
          <title>{{ dot.hint }}</title>
        </circle>
      }
      @for (label of barLabels(); track $index) {
        <text [attr.x]="label.x" [attr.y]="label.y" text-anchor="middle"
              [attr.fill]="'var(--text-secondary)'" font-size="10"
              font-weight="600">{{ label.text }}</text>
      }
      @for (label of axisLabels(); track $index) {
        <text [attr.x]="label.x" [attr.y]="label.y" [attr.text-anchor]="label.anchor"
              [attr.fill]="'var(--text-secondary)'" font-size="10">{{ label.text }}
          <title>{{ label.full }}</title>
        </text>
      }
      @if (centre(); as c) {
        <text [attr.x]="W/2" [attr.y]="H/2 - 2" text-anchor="middle"
              [attr.fill]="'var(--text-primary)'" font-size="20" font-weight="600">{{ c.value }}</text>
        <text [attr.x]="W/2" [attr.y]="H/2 + 15" text-anchor="middle"
              [attr.fill]="'var(--text-muted)'" font-size="10">{{ c.label }}</text>
      }
    </svg>
    }
  `,
})
export class ReportChart {
  readonly pivot = input.required<Pivot>();
  readonly measure = input.required<Measure>();
  readonly kind = input.required<ChartKind>();
  readonly colorFor = input.required<(label: string) => string>();
  /** What the chart is of -- the report title -- for its accessible name. */
  readonly label = input('');
  readonly emptyMessage = input('No rows to chart.');
  readonly chartLabels = CHART_LABELS;
  /** Which axis, if either, carries the Day dimension. */
  readonly dayAxis = input<'row' | 'col' | 'none'>('none');

  /**
   * The drawing surface follows the card rather than a fixed box.
   *
   * A viewBox with a hardcoded width scales to fit, which stretches the type and the stroke
   * weights along with it -- the chart gets bigger without getting more readable. Measuring the
   * host instead means a wider screen buys more room between bars at the same weight, which is
   * what the extra width is worth spending on. Getters rather than plain fields so every
   * computed geometry below re-runs when the size changes.
   */
  private readonly measured = signal(960);
  protected get W(): number { return this.measured(); }
  protected get H(): number { return 360; }
  private readonly pad = { l: 68, r: 20, t: 18, b: 52 };

  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    const host = this.host.nativeElement as HTMLElement;
    // Inside afterNextRender so the first read happens once the element has a box; the observer
    // set up alongside it catches every later change, including becoming visible.
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
    if (width > 0) this.measured.set(Math.max(width, 320));
  }

  private get iw() { return this.W - this.pad.l - this.pad.r; }
  private get ih() { return this.H - this.pad.t - this.pad.b; }

  private readonly cartesian = computed(() =>
    ['grouped', 'stacked', 'pct', 'line', 'area'].includes(this.kind()));

  private readonly scaleMax = computed(() => {
    const p = this.pivot();
    if (this.kind() === 'pct') return 1;
    if (this.kind() === 'stacked') return maxOf(p.rowTotals, 1);
    return maxOf(p.matrix.flat(), 1);
  });

  protected readonly gridLines = computed(() => {
    if (!this.cartesian()) return [];
    const max = this.scaleMax();
    return [0, 1, 2, 3, 4].map(step => {
      /*
       * The tick's own value, NOT rounded to a whole second before it is written.
       *
       * It used to be `Math.round((max * step) / 4)`, which threw away the difference between
       * neighbouring ticks before anything had a chance to print it. Every duration measure on
       * this page is sub-minute and the execution ones are sub-second -- aggregate() keeps two
       * decimals for exactly that reason -- so an axis topping out at 0.8s had its five ticks
       * rounded to 0, 0, 0, 1, 1 and rendered "0s 0s 0s 1s 1s": five gridlines carrying two
       * distinct labels, telling the reader nothing about where a point sits between them.
       *
       * humanSeconds already picks the unit that suits each value -- decimals below ten seconds,
       * whole seconds below a minute, minutes and hours above -- so handing it the real number is
       * all that is needed. Counting measures are unaffected: compactNumber rounds inside itself
       * below a thousand, so a tally axis prints exactly what it printed before.
       *
       * What remains is the data's own resolution rather than the label's: a duration axis whose
       * whole range is under 0.05s has ticks closer together than the two decimal places
       * aggregate() rounds to, and no formatting can separate figures the measure never held.
       */
      const tick = (max * step) / 4;
      return {
        x1: this.pad.l, x2: this.pad.l + this.iw,
        y: this.pad.t + this.ih - (this.ih * step) / 4,
        // Compact on the axis only. A tick reading "12,500" in a 68px gutter either overflows
        // into the plot or forces the gutter wider at every other chart's expense; the exact
        // figure is a tooltip and a table cell away.
        label: this.kind() === 'pct' ? `${step * 25}%`
          : COUNTING.has(this.measure())
            ? compactNumber(tick)
            : formatMeasure(tick, this.measure()),
      };
    });
  });

  protected readonly bars = computed<Bar[]>(() => {
    const kind = this.kind();
    if (!['grouped', 'stacked', 'pct', 'ranked', 'heat'].includes(kind)) return [];
    const p = this.pivot();
    if (kind === 'ranked') return this.rankedBars();
    if (kind === 'heat') return this.heatCells();

    const out: Bar[] = [];
    const slot = this.iw / Math.max(p.rowLabels.length, 1);
    const max = this.scaleMax();

    p.rowLabels.forEach((rowLabel, ri) => {
      const x0 = this.pad.l + slot * ri;
      if (kind === 'grouped') {
        const width = (slot * 0.72) / Math.max(p.colLabels.length, 1);
        p.colLabels.forEach((colLabel, ci) => {
          const value = p.matrix[ri][ci];
          const drawn = plotted(value);
          const h = this.ih * (drawn / max);
          out.push({
            x: x0 + slot * 0.14 + width * ci, y: this.pad.t + this.ih - h,
            w: Math.max(1, width - 2), h: Math.max(drawn ? 1 : 0, h),
            fill: this.colorFor()(colLabel),
            hint: `${rowLabel} · ${colLabel}: ${formatMeasure(value, this.measure())}`,
          });
        });
      } else {
        const total = plotted(p.rowTotals[ri]) || 1;
        let acc = 0;
        p.colLabels.forEach((colLabel, ci) => {
          const value = plotted(p.matrix[ri][ci]);
          if (!value) return;
          const denominator = kind === 'pct' ? total : max;
          const top = this.pad.t + this.ih - this.ih * ((acc + value) / denominator);
          const h = this.ih * (value / denominator);
          out.push({
            x: x0 + slot * 0.18, y: top, w: slot * 0.64, h: Math.max(1, h),
            fill: this.colorFor()(colLabel),
            hint: `${rowLabel} · ${colLabel}: ${formatMeasure(value, this.measure())}`,
          });
          acc += value;
        });
      }
    });
    return out;
  });

  /** How many rows a ranked chart shows before it stops. */
  private static readonly RANKED_TOP = 8;

  /** Rows a ranked chart is not drawing, so the caller can say so instead of hiding it. */
  readonly rankedHidden = computed(() =>
    this.kind() === 'ranked'
      ? Math.max(0, this.pivot().rowLabels.length - ReportChart.RANKED_TOP)
      : 0);

  private rankedBars(): Bar[] {
    const p = this.pivot();
    const ranked = p.rowLabels
      .map((label, i) => ({ label, value: p.rowTotals[i] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, ReportChart.RANKED_TOP);
    const max = maxOf(ranked.map(r => plotted(r.value)), 1);
    const left = 170, right = 70;
    const rowH = Math.min(30, (this.H - 20) / Math.max(ranked.length, 1));
    return ranked.map((r, i) => ({
      x: left, y: 12 + i * rowH + rowH * 0.18,
      w: Math.max(2, (this.W - left - right) * (plotted(r.value) / max)), h: rowH * 0.6,
      fill: this.colorFor()(r.label),
      hint: `${r.label}: ${formatMeasure(r.value, this.measure())}`,
    }));
  }

  private heatCells(): Bar[] {
    const p = this.pivot();
    const left = 170, top = 30;
    const cw = (this.W - left - 16) / Math.max(p.colLabels.length, 1);
    const ch = Math.min(30, (this.H - top - 14) / Math.max(p.rowLabels.length, 1));
    const max = maxOf(p.matrix.flat(), 1);
    const out: Bar[] = [];
    p.rowLabels.forEach((rowLabel, ri) => {
      p.colLabels.forEach((colLabel, ci) => {
        const value = p.matrix[ri][ci];
        const ink = plotted(value);
        out.push({
          x: left + cw * ci + 1, y: top + ch * ri + 1,
          w: Math.max(1, cw - 2), h: Math.max(1, ch - 2),
          // Opacity carries the value; a single hue keeps it readable in both themes.
          fill: `color-mix(in oklab, var(--series-brand) ${ink ? 16 + 84 * (ink / max) : 6}%, transparent)`,
          hint: `${rowLabel} · ${colLabel}: ${formatMeasure(value, this.measure())}`,
        });
      });
    });
    return out;
  }

  protected readonly segments = computed<Segment[]>(() => {
    const kind = this.kind();
    if (kind === 'donut' || kind === 'pie') return this.radialSegments(kind === 'donut');
    if (kind === 'area') return this.areaFills();
    if (kind === 'radar') return this.radarFills();
    return [];
  });

  private radialSegments(hollow: boolean): Segment[] {
    const p = this.pivot();
    const cx = this.W / 2, cy = this.H / 2 + 4;
    const R = Math.min(this.H * 0.38, 104);
    const inner = hollow ? R * 0.58 : 0;
    const total = p.colTotals.reduce((a, b) => a + plotted(b), 0) || 1;
    let angle = -Math.PI / 2;
    const out: Segment[] = [];
    p.colLabels.forEach((label, ci) => {
      const value = plotted(p.colTotals[ci]);
      if (!value) return;
      const sweep = (value / total) * Math.PI * 2;
      const end = angle + sweep;
      const big = sweep > Math.PI ? 1 : 0;
      const x1 = cx + Math.cos(angle) * R, y1 = cy + Math.sin(angle) * R;
      const x2 = cx + Math.cos(end) * R,   y2 = cy + Math.sin(end) * R;
      let d: string;
      if (inner) {
        const i1x = cx + Math.cos(end) * inner,   i1y = cy + Math.sin(end) * inner;
        const i2x = cx + Math.cos(angle) * inner, i2y = cy + Math.sin(angle) * inner;
        d = `M${x1},${y1} A${R},${R} 0 ${big} 1 ${x2},${y2} L${i1x},${i1y} ` +
            `A${inner},${inner} 0 ${big} 0 ${i2x},${i2y} Z`;
      } else {
        d = `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${big} 1 ${x2},${y2} Z`;
      }
      out.push({ d, fill: this.colorFor()(label),
        hint: `${label}: ${formatMeasure(value, this.measure())} (${Math.round((value / total) * 100)}%)` });
      angle = end;
    });
    return out;
  }

  /**
   * Days belong on the x axis whichever selector they were put in.
   *
   * `dayAxis` is told to us rather than guessed. The guess was
   * `colLabels[0]?.includes('-')`, and a hyphen is not a date: every task in the seeded
   * catalogue is named like "report-history setting left blank", so putting tasks in the
   * columns silently transposed the line chart and drew each task as a point on a time axis.
   */
  private seriesLayout() {
    const p = this.pivot();
    const flip = this.dayAxis() === 'col'
      || (this.dayAxis() === 'none' && p.colLabels.length > p.rowLabels.length && ISO_DAY.test(p.colLabels[0] ?? ''));
    const xs = flip ? p.colLabels : p.rowLabels;
    const series = flip ? p.rowLabels : p.colLabels;
    const at = (si: number, xi: number) => flip ? p.matrix[si][xi] : p.matrix[xi][si];
    return { xs, series, at };
  }

  private points(si: number) {
    const { xs, at } = this.seriesLayout();
    const max = this.scaleMax();
    const step = xs.length > 1 ? this.iw / (xs.length - 1) : 0;
    // A lone point is centred rather than pinned to the axis, where it reads as a stray mark.
    const offset = xs.length > 1 ? 0 : this.iw / 2;
    return xs.map((_, xi) => [
      this.pad.l + offset + step * xi,
      this.pad.t + this.ih - this.ih * (plotted(at(si, xi)) / max),
    ] as [number, number]);
  }

  /**
   * One dot per plotted value on a line or area chart.
   *
   * Drawn large enough to see when a series has a single point (where the stroke is invisible)
   * and small enough to read as a marker when it has many. Above ~120 points per series they
   * are dropped: at that density they merge into a band and cost one node each.
   */
  protected readonly markers = computed(() => {
    if (!['line', 'area'].includes(this.kind())) return [];
    const { xs, series, at } = this.seriesLayout();
    if (!xs.length || xs.length > 120) return [];
    const lone = xs.length === 1;
    const out: { x: number; y: number; r: number; fill: string; hint: string }[] = [];
    series.forEach((label, si) => {
      this.points(si).forEach((point, xi) => {
        out.push({
          x: point[0], y: point[1], r: lone ? 4.5 : 2.5,
          fill: this.colorFor()(label),
          hint: `${label} · ${xs[xi]}: ${formatMeasure(at(si, xi), this.measure())}`,
        });
      });
    });
    return out;
  });

  private areaFills(): Segment[] {
    const { series } = this.seriesLayout();
    return series.map((label, si) => {
      const pts = this.points(si);
      const base = this.pad.t + this.ih;
      return {
        d: `M${pts[0][0]},${base} ` + pts.map(q => `L${q[0]},${q[1]}`).join(' ') +
           ` L${pts[pts.length - 1][0]},${base} Z`,
        // Translucent, because these overlap by construction. At full opacity each series
        // painted over the one before it, so an area chart of N series showed exactly one --
        // the last -- and its legend listed N. The stroke drawn on top keeps each edge legible.
        fill: this.colorFor()(label), opacity: 0.35, hint: label,
      };
    });
  }

  /**
   * Rows a radar is not drawing, so the caller can say so instead of hiding it.
   *
   * The same treatment the ranked chart gets, and for the same reason: silently drawing the first
   * four rows of a forty-row pivot produces a chart that is not wrong about anything it shows and
   * is not about the data the reader asked for. Zero for every other kind, so the note beside the
   * chart disappears when the radar is not on screen.
   */
  readonly radarHidden = computed(() =>
    this.kind() === 'radar'
      ? Math.max(0, this.pivot().rowLabels.length - RADAR_ROWS)
      : 0);

  private radarFills(): Segment[] {
    const p = this.pivot();
    const cx = this.W / 2, cy = this.H / 2 + 4, R = Math.min(this.H * 0.36, 96);
    const n = Math.max(p.colLabels.length, 3);
    const rows = p.rowLabels.slice(0, RADAR_ROWS);
    /*
     * Scaled to the rows that are ON the chart, not to the whole pivot.
     *
     * `maxOf(p.matrix.flat(), 1)` took the maximum over every row including the ones sliced away
     * below, so a radar of the first four tasks in a pivot whose fifth task is ten times slower
     * drew all four shapes squashed into the inner tenth of the web -- scaled against a number
     * that is nowhere on the chart, and with no row carrying the outer ring that tells a reader
     * what full extent means. The drawn rows are the whole of what this chart claims to be about,
     * so they are what sets its extent; the count of rows left out is published above.
     */
    const max = maxOf(p.matrix.slice(0, RADAR_ROWS).flat(), 1);
    return rows.map((label, ri) => ({
      d: p.colLabels.map((_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const f = plotted(p.matrix[ri][i]) / max;
        return `${i ? 'L' : 'M'}${cx + Math.cos(a) * R * f},${cy + Math.sin(a) * R * f}`;
      }).join(' ') + ' Z',
      fill: this.colorFor()(label), hint: label,
    }));
  }

  protected readonly strokes = computed<Segment[]>(() => {
    const kind = this.kind();
    if (kind !== 'line' && kind !== 'area' && kind !== 'radar') return [];
    if (kind === 'radar') return this.radarFills();
    const { series } = this.seriesLayout();
    return series.map((label, si) => ({
      d: 'M' + this.points(si).map(q => `${q[0]},${q[1]}`).join(' L'),
      fill: this.colorFor()(label), hint: label,
    }));
  });

  protected readonly axisLabels = computed<AxisLabel[]>(() => {
    const kind = this.kind();
    const p = this.pivot();
    const shorten = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

    if (kind === 'ranked') {
      // RANKED_TOP, not a second bare 8: rankedBars() slices by the constant and this slices the
      // labels for the same bars, so the two must be the same number or the axis names a row the
      // chart did not draw.
      const ranked = p.rowLabels.map((label, i) => ({ label, value: p.rowTotals[i] }))
        .sort((a, b) => b.value - a.value).slice(0, ReportChart.RANKED_TOP);
      const rowH = Math.min(30, (this.H - 20) / Math.max(ranked.length, 1));
      return ranked.flatMap((r, i) => [
        { x: 160, y: 12 + i * rowH + rowH * 0.62, anchor: 'end',
          text: shorten(r.label, 24), full: r.label },
        { x: this.W - 62, y: 12 + i * rowH + rowH * 0.62, anchor: 'start',
          text: formatMeasure(r.value, this.measure()), full: r.label },
      ]);
    }
    if (kind === 'heat') {
      const left = 170, top = 30;
      const cw = (this.W - left - 16) / Math.max(p.colLabels.length, 1);
      const ch = Math.min(30, (this.H - top - 14) / Math.max(p.rowLabels.length, 1));
      /*
       * Thinned by the room each axis actually has, the way the bar axis below thins its own.
       *
       * Both axes used to draw every label whatever the cell size was. A Day column axis over a
       * quarter is ninety labels across the width of a card -- about 10px of cell each, under a
       * label that renders up to eight times that -- so they overprinted into a smear; the Task
       * row axis did the same vertically once the pivot passed about twenty-six rows, where the
       * cells become thinner than the type sitting beside them.
       *
       * The two are measured differently because they collide in different directions: a column
       * label is laid out along the axis and runs out of WIDTH, while a row label is horizontal
       * beside its cell and runs out of that cell's HEIGHT.
       *
       * shorten() caps a column label at 13 characters, which at font-size 10 renders up to about
       * 80px; 100 leaves the same headroom over that measurement as the bar axis leaves over its
       * own, so a wider font metric on another browser does not reopen the overlap. A row label
       * needs its 10px line box and a little air, which is where 13 comes from.
       *
       * Filtering by index keeps every surviving label over the cell it names, because the
       * position is computed from that index rather than from the label's place in the list.
       */
      const colStride = cw < 100 ? Math.ceil(100 / cw) : 1;
      const rowStride = ch < 13 ? Math.ceil(13 / ch) : 1;
      return [
        ...p.colLabels
          .map((label, ci) => ({ label, ci }))
          .filter(({ ci }) => ci % colStride === 0)
          .map(({ label, ci }) => ({
            x: left + cw * ci + cw / 2, y: top - 9, anchor: 'middle',
            text: shorten(label, 13), full: label })),
        ...p.rowLabels
          .map((label, ri) => ({ label, ri }))
          .filter(({ ri }) => ri % rowStride === 0)
          .map(({ label, ri }) => ({
            x: left - 10, y: top + ch * ri + ch * 0.66, anchor: 'end',
            text: shorten(label, 24), full: label })),
      ];
    }
    if (kind === 'donut' || kind === 'pie' || kind === 'radar') {
      if (kind !== 'radar') return [];
      const cx = this.W / 2, cy = this.H / 2 + 4, R = Math.min(this.H * 0.36, 96);
      const n = Math.max(p.colLabels.length, 3);
      return p.colLabels.map((label, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return { x: cx + Math.cos(a) * R * 1.16, y: cy + Math.sin(a) * R * 1.16,
                 anchor: 'middle', text: shorten(label, 13), full: label };
      });
    }
    if (kind === 'line' || kind === 'area') {
      const { xs } = this.seriesLayout();
      const step = xs.length > 1 ? this.iw / (xs.length - 1) : 0;
      // A fixed "skip every other past 9 points" ignores how wide the labels actually render --
      // the same problem the default bar axis below has its own fix for. 22 task names at this
      // card's width still overlapped after skipping every other, since each surviving label was
      // still up to the label's full length (sliced from character 5, not truncated). Thinned by
      // measured slot width the same way, and shorten()'d instead of an odd slice(5) that dropped
      // a label's meaningful prefix rather than marking the cut with an ellipsis.
      const minSlotForLabel = 120;
      const stride = step > 0 && step < minSlotForLabel ? Math.ceil(minSlotForLabel / step) : 1;
      const lastIndex = xs.length - 1;
      return xs.map((label, xi) => (xi % stride !== 0 && xi !== lastIndex) ? null : ({
        x: this.pad.l + step * xi, y: this.H - 22,
        // The first and last labels sit on the plot's edges, so centring them puts half of
        // each outside the viewBox, where SVG clips it. They anchor inward instead.
        anchor: xi === 0 ? 'start' : (xi === lastIndex ? 'end' : 'middle'),
        text: shorten(label, 16), full: label,
      })).filter(Boolean) as any[];
    }
    const slot = this.iw / Math.max(p.rowLabels.length, 1);
    // A slot narrower than a shortened label's rendered width prints every label anyway, and
    // centred text-anchor="middle" labels overlap illegibly the moment neighbouring slots are
    // that tight -- 22 task names in the width a report card actually has is the common case,
    // not an edge one. The line/area branch above already thins its own x-axis the same way
    // once it gets crowded (skip every other past 9 points); this generalises that to any
    // density rather than a fixed "every other", so it degrades gracefully instead of either
    // overlapping (drawing all of them) or going unreadably sparse (a fixed skip that's too
    // aggressive for a mild overflow, or not aggressive enough for a severe one).
    // shorten() caps a label at 16 characters; measured live at font-size 10, a full 16-char
    // shortened label ("WPV commons.m ·…") renders up to ~98px wide. 120 leaves real headroom
    // above that rather than being tuned to the exact pixel, so a slightly wider font metric on
    // another OS/browser doesn't reopen the same overlap.
    const minSlotForLabel = 120;
    const stride = slot < minSlotForLabel ? Math.ceil(minSlotForLabel / slot) : 1;
    return p.rowLabels
      .map((label, ri) => ({ label, ri }))
      .filter((_, i) => i % stride === 0)
      .map(({ label, ri }) => ({
        x: this.pad.l + slot * ri + slot / 2, y: this.H - 22, anchor: 'middle',
        text: shorten(label, 16), full: label,
      }));
  });

  /**
   * A number above each bar, but only where it fits.
   *
   * Drawn at all widths the labels collide the moment there are more than a handful of bars;
   * dropped entirely, a wide chart wastes the room it has. So the same rule the table headers
   * use applies here: show it when there is space, and let the hover title carry it otherwise.
   */
  protected readonly barLabels = computed(() => {
    if (this.kind() !== 'grouped' && this.kind() !== 'stacked') return [];
    const bars = this.bars();
    if (!bars.length) return [];
    const narrowest = minOf(bars.map(b => b.w), Number.POSITIVE_INFINITY);
    if (narrowest < 34) return [];
    return bars
      .filter(b => b.h > 14)
      .map(b => ({
        x: b.x + b.w / 2,
        y: b.y - 5,
        text: b.hint.split(': ').pop() ?? '',
      }));
  });

  protected readonly centre = computed(() => {
    if (this.kind() !== 'donut') return null;
    const p = this.pivot();
    // Only the columns that HAVE a measurement. A column aggregate() could not measure answers
    // NO_DURATION, and adding that in would quietly subtract a second from the figure printed in
    // the middle of the donut; when none of them has one the total is unknown rather than zero,
    // so it reads as the same dash the table prints rather than as "0s".
    const measured = p.colTotals.filter(value => value >= 0);
    if (!measured.length && !COUNTING.has(this.measure())) return { value: '—', label: 'total' };
    return {
      value: formatMeasure(measured.reduce((a, b) => a + b, 0), this.measure()),
      label: 'total',
    };
  });
}
