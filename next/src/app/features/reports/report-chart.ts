import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal,
} from '@angular/core';
import { Measure, Pivot, formatMeasure } from './pivot';

export type ChartKind =
  | 'grouped' | 'stacked' | 'pct' | 'donut' | 'pie'
  | 'line' | 'area' | 'ranked' | 'heat' | 'radar';

export const CHART_LABELS: Record<ChartKind, string> = {
  grouped: 'Grouped bars', stacked: 'Stacked bars', pct: '100% stacked',
  donut: 'Donut', pie: 'Pie', line: 'Line', area: 'Area',
  ranked: 'Ranked bars', heat: 'Heatmap', radar: 'Radar',
};

interface Segment { d: string; fill: string; hint: string; }
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
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" width="100%" [attr.height]="H"
         role="img" [attr.aria-label]="kind() + ' chart of the report'">
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
        <path [attr.d]="seg.d" [attr.fill]="seg.fill"><title>{{ seg.hint }}</title></path>
      }
      @for (stroke of strokes(); track $index) {
        <path [attr.d]="stroke.d" fill="none" [attr.stroke]="stroke.fill" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"><title>{{ stroke.hint }}</title></path>
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
  `,
})
export class ReportChart {
  readonly pivot = input.required<Pivot>();
  readonly measure = input.required<Measure>();
  readonly kind = input.required<ChartKind>();
  readonly colorFor = input.required<(label: string) => string>();

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
    // Measured after the first paint and again on resize, rather than through a
    // ResizeObserver: the observer is the tidier tool but does not fire in every embedded
    // browser, and a chart that silently keeps its starting guess is worse than one measured
    // slightly less elegantly.
    afterNextRender(() => this.remeasure());
    const onResize = () => this.remeasure();
    window.addEventListener('resize', onResize, { passive: true });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', onResize));
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
    if (this.kind() === 'stacked') return Math.max(...p.rowTotals, 1);
    return Math.max(...p.matrix.flat(), 1);
  });

  protected readonly gridLines = computed(() => {
    if (!this.cartesian()) return [];
    const max = this.scaleMax();
    return [0, 1, 2, 3, 4].map(step => ({
      x1: this.pad.l, x2: this.pad.l + this.iw,
      y: this.pad.t + this.ih - (this.ih * step) / 4,
      label: this.kind() === 'pct' ? `${step * 25}%`
                                   : formatMeasure(Math.round((max * step) / 4), this.measure()),
    }));
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
          const h = this.ih * (value / max);
          out.push({
            x: x0 + slot * 0.14 + width * ci, y: this.pad.t + this.ih - h,
            w: Math.max(1, width - 2), h: Math.max(value ? 1 : 0, h),
            fill: this.colorFor()(colLabel),
            hint: `${rowLabel} · ${colLabel}: ${formatMeasure(value, this.measure())}`,
          });
        });
      } else {
        const total = p.rowTotals[ri] || 1;
        let acc = 0;
        p.colLabels.forEach((colLabel, ci) => {
          const value = p.matrix[ri][ci];
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

  private rankedBars(): Bar[] {
    const p = this.pivot();
    const ranked = p.rowLabels
      .map((label, i) => ({ label, value: p.rowTotals[i] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const max = Math.max(...ranked.map(r => r.value), 1);
    const left = 170, right = 70;
    const rowH = Math.min(30, (this.H - 20) / Math.max(ranked.length, 1));
    return ranked.map((r, i) => ({
      x: left, y: 12 + i * rowH + rowH * 0.18,
      w: Math.max(2, (this.W - left - right) * (r.value / max)), h: rowH * 0.6,
      fill: this.colorFor()(r.label),
      hint: `${r.label}: ${formatMeasure(r.value, this.measure())}`,
    }));
  }

  private heatCells(): Bar[] {
    const p = this.pivot();
    const left = 170, top = 30;
    const cw = (this.W - left - 16) / Math.max(p.colLabels.length, 1);
    const ch = Math.min(30, (this.H - top - 14) / Math.max(p.rowLabels.length, 1));
    const max = Math.max(...p.matrix.flat(), 1);
    const out: Bar[] = [];
    p.rowLabels.forEach((rowLabel, ri) => {
      p.colLabels.forEach((colLabel, ci) => {
        const value = p.matrix[ri][ci];
        out.push({
          x: left + cw * ci + 1, y: top + ch * ri + 1,
          w: Math.max(1, cw - 2), h: Math.max(1, ch - 2),
          // Opacity carries the value; a single hue keeps it readable in both themes.
          fill: `color-mix(in oklab, var(--series-brand) ${value ? 16 + 84 * (value / max) : 6}%, transparent)`,
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
    const total = p.colTotals.reduce((a, b) => a + b, 0) || 1;
    let angle = -Math.PI / 2;
    const out: Segment[] = [];
    p.colLabels.forEach((label, ci) => {
      const value = p.colTotals[ci];
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

  /** Days belong on the x axis whichever selector they were put in. */
  private seriesLayout() {
    const p = this.pivot();
    const flip = p.colLabels.length > p.rowLabels.length && p.colLabels[0]?.includes('-');
    const xs = flip ? p.colLabels : p.rowLabels;
    const series = flip ? p.rowLabels : p.colLabels;
    const at = (si: number, xi: number) => flip ? p.matrix[si][xi] : p.matrix[xi][si];
    return { xs, series, at };
  }

  private points(si: number) {
    const { xs, at } = this.seriesLayout();
    const max = this.scaleMax();
    const step = xs.length > 1 ? this.iw / (xs.length - 1) : 0;
    return xs.map((_, xi) => [
      this.pad.l + step * xi,
      this.pad.t + this.ih - this.ih * (at(si, xi) / max),
    ] as [number, number]);
  }

  private areaFills(): Segment[] {
    const { series } = this.seriesLayout();
    return series.map((label, si) => {
      const pts = this.points(si);
      const base = this.pad.t + this.ih;
      return {
        d: `M${pts[0][0]},${base} ` + pts.map(q => `L${q[0]},${q[1]}`).join(' ') +
           ` L${pts[pts.length - 1][0]},${base} Z`,
        fill: this.colorFor()(label), hint: label,
      };
    });
  }

  private radarFills(): Segment[] {
    const p = this.pivot();
    const cx = this.W / 2, cy = this.H / 2 + 4, R = Math.min(this.H * 0.36, 96);
    const n = Math.max(p.colLabels.length, 3);
    const max = Math.max(...p.matrix.flat(), 1);
    return p.rowLabels.slice(0, 4).map((label, ri) => ({
      d: p.colLabels.map((_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const f = p.matrix[ri][i] / max;
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
      const ranked = p.rowLabels.map((label, i) => ({ label, value: p.rowTotals[i] }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
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
      return [
        ...p.colLabels.map((label, ci) => ({
          x: left + cw * ci + cw / 2, y: top - 9, anchor: 'middle',
          text: shorten(label, 13), full: label })),
        ...p.rowLabels.map((label, ri) => ({
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
      return xs.map((label, xi) => (xs.length > 9 && xi % 2) ? null : ({
        x: this.pad.l + step * xi, y: this.H - 22,
        // The first and last labels sit on the plot's edges, so centring them puts half of
        // each outside the viewBox, where SVG clips it. They anchor inward instead.
        anchor: xi === 0 ? 'start' : (xi === xs.length - 1 ? 'end' : 'middle'),
        text: label.length > 10 ? label.slice(5) : label, full: label,
      })).filter(Boolean) as any[];
    }
    const slot = this.iw / Math.max(p.rowLabels.length, 1);
    return p.rowLabels.map((label, ri) => ({
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
    const narrowest = Math.min(...bars.map(b => b.w));
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
    const total = p.colTotals.reduce((a, b) => a + b, 0);
    return { value: formatMeasure(total, this.measure()), label: 'total' };
  });
}
