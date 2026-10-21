import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { readableCell } from '../../../shared/charts/number-format';
import type { Mark } from '../widget-view';
import { pointLabel } from '../../../shared/charts/line-chart';

/** The latest figure of a series, the one before it, and the change between them. */
export interface TrendFigure {
  latest: Mark | null;
  previous: Mark | null;
  /** The change as a share of the previous figure (0.042 = +4.2%); null when the previous is zero or absent. */
  change: number | null;
  /** The change in the figure's own units. */
  delta: number | null;
}

/** The two ends a KPI card compares: the series' last point against the one before it. */
export function trendFigure(marks: readonly Mark[]): TrendFigure {
  const latest = marks.length ? marks[marks.length - 1] : null;
  const previous = marks.length > 1 ? marks[marks.length - 2] : null;
  if (!latest || !previous) return { latest, previous, change: null, delta: null };
  const delta = latest.value - previous.value;
  return { latest, previous, delta, change: previous.value !== 0 ? delta / Math.abs(previous.value) : null };
}

/** "+4.2%", "−0.8%", "0.0%". */
export function changeText(change: number | null, delta: number | null): string {
  if (change === null) return delta === null ? '' : (delta > 0 ? '+' : delta < 0 ? '−' : '') + readableCell(String(Math.abs(round(delta))));
  const pct = Math.abs(change * 100);
  const sign = change > 0.0005 ? '+' : change < -0.0005 ? '−' : '';
  return `${sign}${pct >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function round(value: number): number {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
}

/** The sparkline's path, in a 100 x 28 box: the line, and the area under it closed to the baseline. */
export function sparkPaths(values: readonly number[], width = 100, height = 28): { line: string; area: string; last: [number, number] | null } {
  if (values.length < 2) return { line: '', area: '', last: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    pad + (height - 2 * pad) * (1 - (v - min) / span),
  ] as [number, number]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return { line, area, last: points[points.length - 1] };
}

/**
 * A headline figure with its history: the latest value of a series, how it changed against the period before, and a
 * sparkline of the whole series under it -- a dashboard's KPI strip.
 *
 *   NO-SHOW RATE
 *   20.4%              ▲ +1.2%  vs Nov
 *   ╱╲__╱‾╲_╱‾‾  (the last twelve months)
 *
 * The change is coloured by direction only, never as good or bad: whether a rising no-show rate is welcome is not a
 * fact this card knows. The series is the tile's own result, in its dimension's order (the kind is refused otherwise,
 * as a line is), so "the period before" is the row before.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-kpi-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'kpi-trend' },
  styles: `
    :host { display: block; min-width: 0; }
    .kt { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.25rem 0.125rem; min-width: 0; }
    .kt-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .kt-row { display: flex; align-items: baseline; gap: 0.625rem; flex-wrap: wrap; min-width: 0; }
    .kt-figure { font-size: 1.75rem; line-height: 2.125rem; font-weight: 650; letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
      color: var(--text-primary); }
    .kt-change { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 12px; font-weight: 600; padding: 0.0625rem 0.375rem;
      border-radius: 999px; background: var(--surface-sunken); color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .kt-change.is-up { color: var(--info-text); background: var(--info-soft); }
    .kt-change.is-down { color: var(--warn-text); background: color-mix(in srgb, var(--warn-text) 12%, transparent); }
    .kt-vs { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kt-spark { display: block; width: 100%; height: 2.25rem; margin-top: 0.25rem; color: var(--chart-0); overflow: visible; }
    .kt-period { font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; gap: 0.5rem; }
  `,
  template: `
    <div class="kt" [attr.aria-label]="summary()" role="figure">
      <span class="kt-label" [title]="label()">{{ label() }}</span>
      <div class="kt-row">
        <span class="kt-figure" [title]="figure().latest?.value ?? ''">{{ latestText() }}</span>
        @if (changeWords()) {
          <span class="kt-change" [class.is-up]="(figure().delta ?? 0) > 0" [class.is-down]="(figure().delta ?? 0) < 0">
            <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
              @if ((figure().delta ?? 0) >= 0) { <path d="M5 1 9 8H1z" fill="currentColor" /> } @else { <path d="M5 9 1 2h8z" fill="currentColor" /> }
            </svg>{{ changeWords() }}
          </span>
          <span class="kt-vs" [title]="'Against ' + (figure().previous?.name ?? '')">vs {{ when(figure().previous?.name) }}</span>
        }
      </div>
      @if (paths().line) {
        <svg class="kt-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient [attr.id]="gradientId" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="currentColor" stop-opacity="0.28" />
              <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path [attr.d]="paths().area" [attr.fill]="'url(#' + gradientId + ')'" stroke="none" />
          <path [attr.d]="paths().line" fill="none" stroke="currentColor" stroke-width="1.75" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
          @if (paths().last; as p) { <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="2.2" fill="currentColor" vector-effect="non-scaling-stroke" /> }
        </svg>
        <div class="kt-period"><span>{{ when(marks()[0]?.name) }}</span><span>{{ when(figure().latest?.name) }}</span></div>
      }
    </div>
  `,
})
export class KpiTrend {
  private static seq = 0;
  readonly gradientId = `kt-fill-${++KpiTrend.seq}`;

  /** The series, in its dimension's order. */
  readonly marks = input.required<Mark[]>();
  /** What the figure is: the measure's name. */
  readonly label = input('');
  /** How a figure is written (the tile's own formatting). */
  readonly format = input<(value: number) => string>(value => readableCell(String(value)));

  readonly figure = computed(() => trendFigure(this.marks()));
  /** A period as the line charts write it ("1 Nov 2025"), not the ISO string the query returned (ZT-A14). */
  protected readonly when = (name: string | null | undefined): string => (name ? pointLabel(name) : '');
  readonly latestText = computed(() => {
    const latest = this.figure().latest;
    return latest ? this.format()(latest.value) : '—';
  });
  readonly changeWords = computed(() => changeText(this.figure().change, this.figure().delta));
  readonly paths = computed(() => sparkPaths(this.marks().map(m => m.value)));
  readonly summary = computed(() => {
    const f = this.figure();
    if (!f.latest) return this.label();
    return `${this.label()}: ${this.latestText()} in ${f.latest.name}` + (f.previous ? `, ${this.changeWords()} against ${f.previous.name}` : '');
  });
}
