import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { EChartKind } from '../analytics.service';
import { queryView, WidgetView } from '../dashboard';
import { WidgetChart } from '../widget-chart';
import { ChartTable, TableDim } from './chart-table';
import { EOption, OptionTheme, chartOption } from './chart-options';
import { ChartSettings, LABEL_PX } from './chart-settings';
import { buildTheme } from '../../../shared/charts/echart/echart-theme';
import { CHART_TYPE, CHART_TYPE_STEPS, FIGURE_PX, figurePx } from '../../../shared/charts/chart-type';

/**
 * One type scale for every chart (owner, 2026-10-06: "text size issue").
 *
 * Every size of text a chart draws is one of the scale's steps -- 11px for the chrome, 12px for
 * what is said about a mark, 14px at most, the tile title's size -- whichever engine draws it.
 * The exceptions are the figures that are the answer (a single figure, two figures compared, a
 * gauge's reading), which grow with the tile between FIGURE_PX's ends.
 *
 * The ECharts kinds are checked on the option they are handed, with the console theme it merges
 * under: every fontSize anywhere in either, and every piece of text a series or a component
 * carries stated rather than left to ECharts' default. The SVG kinds are rendered, one per family,
 * and each piece of text is read at the size it resolves to -- its own size class or the nearest
 * ancestor's, as the cascade gives it (the unit tests' DOM loads no stylesheet; the Playwright
 * board check reads the browser's computed sizes).
 *
 * @author Nabeel Ahmed
 */

const dim = (name: string, values: string[], extra: Partial<TableDim> = {}): TableDim =>
  ({ name, values, date: false, numeric: false, ...extra });
function table(parts: Partial<ChartTable>): ChartTable {
  const measures = parts.measures ?? [];
  return {
    dims: parts.dims ?? [], measures, length: parts.length ?? measures[measures.length - 1]?.values.length ?? 0,
    additive: parts.additive ?? true, order: parts.order ?? 'dimension', topNTrimmed: false, emptyReason: 'none',
  };
}
const THEME: OptionTheme = {
  palette: ['#1e3a8a', '#fde68a', '#0f766e', '#f9a8d4', '#c2410c', '#a5f3fc', '#4d7c0f', '#4338ca'],
  tokens: {
    mode: 'light', palette: [], text: '#101828', textSecondary: '#364153', muted: '#6a7282', border: '#e5e7eb',
    surface: '#ffffff', sunken: '#f3f4f6', heat: '#2563eb', up: '#1d7a44', down: '#bb2d48', font: 'Inter',
  },
};

const oneDim = () => table({ dims: [dim('region', ['north', 'south', 'east', 'west'])], measures: [{ name: 'revenue', values: [40, 30, 20, 10] }] });
const twoDims = () => table({
  dims: [dim('region', ['north', 'north', 'south', 'south']), dim('category', ['a', 'b', 'a', 'b'])],
  measures: [{ name: 'revenue', values: [1, 2, 3, 4] }],
});
const dated = () => table({
  dims: [dim('month', ['2026-01-01', '2026-01-01', '2026-02-01', '2026-02-01'], { date: true }), dim('region', ['n', 's', 'n', 's'])],
  measures: [{ name: 'revenue', values: [1, 2, 3, 4] }],
});
const numbers = (count: number, rows = 5) => table({
  dims: [dim('name', Array.from({ length: rows }, (_, i) => `n${i}`))],
  measures: Array.from({ length: count }, (_, m) => ({ name: ['open', 'high', 'low', 'close', 'm4'][m] ?? `m${m}`, values: Array.from({ length: rows }, (_, i) => i + m + 1) })),
});

/** Every ECharts kind, on a result it fits: every family, and every kind in it. */
const FITS: Record<EChartKind, () => ChartTable> = {
  barH: oneDim, waterfall: oneDim, pareto: oneDim, barLine: () => numbers(2), polarBar: oneDim, pictorialBar: oneDim,
  lineSmooth: dated, lineStep: oneDim, lineMarkers: oneDim, areaStacked: dated, areaShare: dated,
  rose: oneDim, halfDonut: oneDim, nestedPie: twoDims,
  scatterTrend: () => numbers(2), bubble: () => numbers(3), effectScatter: () => numbers(2),
  boxplot: () => numbers(1, 6), density: () => numbers(1, 9),
  treemap: twoDims, sunburst: twoDims, tree: twoDims, sankey: twoDims, chord: twoDims, heatmap: twoDims,
  calendar: () => table({ dims: [dim('day', ['2026-01-01', '2026-01-02'], { date: true })], measures: [{ name: 'm', values: [1, 2] }] }),
  funnel: oneDim, gauge: () => table({ measures: [{ name: 'total', values: [42] }] }),
  radar: () => numbers(3, 3), parallel: () => numbers(2), themeRiver: dated, candlestick: () => numbers(4),
};

/** Everything a reader could switch on that draws more text: labels, a title, a legend, reference lines. */
const EVERYTHING: ChartSettings = {
  labels: { show: true }, title: { text: 'Revenue', subtext: 'By region' }, legend: { show: true },
  refLines: { average: true, target: 10 },
};

type Found = { path: string; px: number };

/** Every fontSize in an option, with where it is. Data arrays are walked too: a node may carry its own. */
function fontSizes(node: unknown, path = ''): Found[] {
  if (Array.isArray(node)) return node.flatMap((item, i) => fontSizes(item, `${path}[${i}]`));
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    key === 'fontSize' && typeof value === 'number' ? [{ path: `${path}.${key}`, px: value }] : fontSizes(value, `${path}.${key}`));
}

const onScale = (found: Found) => CHART_TYPE_STEPS.includes(found.px)
  || (/\.detail\.fontSize$/.test(found.path) && found.px >= FIGURE_PX.min && found.px <= FIGURE_PX.max);

describe('the chart type scale, ECharts kinds', () => {
  it('the console theme states its text on the scale, 11px at the least', () => {
    const sizes = fontSizes(buildTheme(THEME.tokens, THEME.palette));
    expect(sizes.length).toBeGreaterThan(10);
    expect(sizes.filter(found => !onScale(found))).toEqual([]);
    expect(Math.min(...sizes.map(found => found.px))).toBe(CHART_TYPE.caption);
  });

  for (const [kind, fits] of Object.entries(FITS) as [EChartKind, () => ChartTable][]) {
    it(`${kind}: every size on the scale, at each label size, and none left to ECharts`, () => {
      for (const size of ['small', 'normal', 'large'] as const) {
        const option: EOption = chartOption(fits(), kind, { ...EVERYTHING, labels: { show: true, size } }, THEME, { height: 260, interactive: true });
        const sizes = fontSizes(option);
        expect(sizes.filter(found => !onScale(found)), `${kind} at ${size}`).toEqual([]);
        expect(Math.max(...sizes.filter(found => !found.path.endsWith('.detail.fontSize')).map(found => found.px))).toBeLessThanOrEqual(CHART_TYPE.title);
        for (const [index, one] of ((option['series'] as Record<string, unknown>[]) ?? []).entries()) {
          // A series' label is sized; so is every reference line's and pin's.
          expect((one['label'] as Record<string, unknown>)['fontSize'], `${kind} series ${index} label`).toBeTypeOf('number');
          for (const key of ['markLine', 'markPoint']) {
            if (one[key]) expect(((one[key] as Record<string, unknown>)['label'] as Record<string, unknown>)['fontSize'], `${kind} ${key}`).toBe(CHART_TYPE.caption);
          }
        }
        for (const key of ['xAxis', 'yAxis']) {
          for (const axis of [option[key]].flat().filter(Boolean) as Record<string, unknown>[]) {
            expect((axis['axisLabel'] as Record<string, unknown>)['fontSize'], `${kind} ${key}`).toBe(CHART_TYPE.caption);
          }
        }
        if (option['legend']) expect(((option['legend'] as Record<string, unknown>)['textStyle'] as Record<string, unknown>)['fontSize']).toBe(CHART_TYPE.caption);
        expect(((option['tooltip'] as Record<string, unknown>)['textStyle'] as Record<string, unknown>)['fontSize']).toBe(CHART_TYPE.body);
      }
    });
  }

  it('a data label is the size the settings ask for: 11, 12 or 14px, never 10', () => {
    expect(LABEL_PX).toEqual({ small: 11, normal: 12, large: 14 });
    const barH = (size?: 'small' | 'large') => (chartOption(oneDim(), 'barH', { labels: { show: true, size } }, THEME)['series'] as Record<string, Record<string, unknown>>[])[0]['label']['fontSize'];
    expect([barH('small'), barH(), barH('large')]).toEqual([11, 12, 14]);
  });

  it("a gauge's reading grows with the drawing, up to a cap", () => {
    const reading = (height: number) => ((chartOption(FITS.gauge(), 'gauge', {}, THEME, { height })['series'] as Record<string, Record<string, unknown>>[])[0]['detail']['fontSize']);
    expect(reading(160)).toBe(FIGURE_PX.min);
    expect(reading(260)).toBe(26);
    expect(reading(600)).toBe(FIGURE_PX.max);
    expect(figurePx(undefined)).toBeGreaterThanOrEqual(FIGURE_PX.min);
  });

});

// ---- the SVG kinds ---------------------------------------------------------------------------

/** What a size class draws at, in px. `figure` is the .kpi-figure clamp, which grows with its tile. */
const CLASS_PX: [RegExp, number | 'figure'][] = [
  [/^text-\[11px\]$/, 11], [/^text-xs$/, 12], [/^text-sm$/, 14], [/^text-base$/, 16], [/^text-lg$/, 18],
  [/^text-xl$/, 20], [/^text-2xl$/, 24], [/^text-3xl$/, 30], [/^text-\[(\d+)px\]$/, -1], [/^kpi-figure$/, 'figure'],
];

/** The size a piece of text resolves to: its own size class, or the nearest ancestor's below the chart. */
function resolvedPx(element: Element, root: Element): number | 'figure' | null {
  for (let at: Element | null = element; at && at !== root.parentElement; at = at.parentElement) {
    for (const name of Array.from(at.classList)) {
      for (const [pattern, px] of CLASS_PX) {
        const hit = pattern.exec(name);
        if (hit) return px === -1 ? Number(hit[1]) : px;
      }
    }
  }
  return null;
}

/** Every element with text of its own, and the size it resolves to. */
function textSizes(root: Element): { text: string; px: number | 'figure' | null }[] {
  const out: { text: string; px: number | 'figure' | null }[] = [];
  root.querySelectorAll('*').forEach(element => {
    if (element.closest('svg title, title')) return;
    const own = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join('').trim();
    if (own) out.push({ text: own.slice(0, 30), px: resolvedPx(element, root) });
  });
  return out;
}

function result(columns: string[], rows: (string | null)[][]): WidgetView {
  const view = queryView({ columns, rows, rowCount: rows.length, truncated: false });
  // Drawn whatever the fit test says of a saved query's figures: this is about type, not fit.
  return { ...view, additive: true, issues: Object.fromEntries(Object.keys(view.issues).map(id => [id, ''])) as WidgetView['issues'] };
}

const REGIONS = result(['region', 'revenue'], [['north', '1200'], ['south', '800'], ['east', '450'], ['west', '300']]);
const MONTHS = result(['month', 'revenue'], [['2026-01-01', '10'], ['2026-02-01', '12'], ['2026-03-01', '9'], ['2026-04-01', '15']]);
const NUMBERS = result(['x', 'y'], [['1', '10'], ['2', '14'], ['3', '9'], ['4', '20'], ['5', '18']]);
const ONE = result(['total'], [['123456.5']]);
const TWO = result(['year', 'revenue'], [['2025', '900'], ['2026', '1200']]);

/** One SVG kind per family, on a result it can draw. */
const SVG_KINDS: [string, WidgetView][] = [
  ['kpi', ONE], ['comparison', TWO],
  ['ranked', REGIONS], ['rankedShare', REGIONS], ['bar', REGIONS],
  ['line', MONTHS], ['area', MONTHS],
  ['donut', REGIONS], ['scatter', NUMBERS], ['histogram', NUMBERS],
  ['dimensionSummary', REGIONS], ['trendSummary', MONTHS], ['distributionSummary', NUMBERS],
];

const FIGURES = new Set(['kpi', 'comparison']);

describe('the chart type scale, SVG kinds', () => {
  for (const [kind, view] of SVG_KINDS) {
    it(`${kind}: every piece of text on the scale${FIGURES.has(kind) ? ', the figures on the figure scale' : ''}`, () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(WidgetChart);
      fixture.componentRef.setInput('view', view);
      fixture.componentRef.setInput('kind', kind);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const sizes = textSizes(root);
      expect(sizes.length, `${kind} draws text`).toBeGreaterThan(0);
      const off = sizes.filter(({ px }) => px === 'figure' ? !FIGURES.has(kind) : !CHART_TYPE_STEPS.includes(px as number));
      expect(off, `${kind}: text off the scale`).toEqual([]);
      if (FIGURES.has(kind)) expect(sizes.some(({ px }) => px === 'figure')).toBe(true);
    });
  }
});
