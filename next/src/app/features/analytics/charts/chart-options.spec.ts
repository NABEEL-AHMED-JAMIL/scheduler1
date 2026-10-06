import { ChartTable, TableDim } from './chart-table';
import {
  ANIMATE_BELOW, EOption, LARGE_FROM, OptionTheme, SAMPLE_FROM, boxStats, chartOption, density, flowOf,
  formatNumber, niceCeiling, trendLine, treeOf, valueText,
} from './chart-options';
import { fitIssues } from './chart-fit';
import { ECHART_KIND_IDS } from '../widget-kinds';
import type { EChartKind } from '../analytics.service';
import type { ChartSettings } from './chart-settings';

/**
 * The option builders as data: a result in, an ECharts option out, no canvas anywhere. Each
 * kind is checked for the series it draws and the facts a reader would read off it; the shared
 * parts -- palette, large-data switches, zoom, toolbox -- once each.
 */

const dim = (name: string, values: string[], extra: Partial<TableDim> = {}): TableDim =>
  ({ name, values, date: false, numeric: false, ...extra });

function table(parts: Partial<ChartTable>): ChartTable {
  const measures = parts.measures ?? [];
  return {
    dims: parts.dims ?? [], measures,
    length: parts.length ?? measures[measures.length - 1]?.values.length ?? 0,
    additive: parts.additive ?? true, order: parts.order ?? 'dimension',
    topNTrimmed: false, emptyReason: 'none',
  };
}

const THEME: OptionTheme = {
  palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'],
  tokens: {
    mode: 'light', palette: [], text: '#101010', textSecondary: '#202020', muted: '#303030', border: '#404040',
    surface: '#ffffff', sunken: '#f0f0f0', heat: '#0000ff', up: '#00aa00', down: '#aa0000', font: 'Inter',
  },
};

const option = (t: ChartTable, kind: EChartKind, settings: ChartSettings = {}, interactive = false): EOption =>
  chartOption(t, kind, settings, THEME, { interactive, name: 'Revenue by region' });
const series = (o: EOption) => o['series'] as Record<string, unknown>[];

const oneDim = (values = [10, 20, 30, 40]) => table({
  dims: [dim('region', ['north', 'south', 'east', 'west'].slice(0, values.length))],
  measures: [{ name: 'revenue', values }],
});
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

describe('every ECharts kind builds an option from a result it fits', () => {
  const fits: Record<EChartKind, () => ChartTable> = {
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

  for (const kind of ECHART_KIND_IDS as EChartKind[]) {
    it(`${kind}: fits its sample, draws a series of its own type, in the palette`, () => {
      const t = fits[kind]();
      expect(fitIssues(t)[kind], 'the sample must fit').toBe('');
      const o = option(t, kind);
      expect(o['color']).toEqual(THEME.palette);
      const types = series(o).map(s => s['type']);
      const expected: Partial<Record<EChartKind, string>> = {
        barH: 'bar', waterfall: 'bar', pareto: 'bar', barLine: 'bar', polarBar: 'bar', lineSmooth: 'line', lineStep: 'line',
        lineMarkers: 'line', areaStacked: 'line', areaShare: 'line', rose: 'pie', halfDonut: 'pie', nestedPie: 'pie',
        scatterTrend: 'scatter', bubble: 'scatter', effectScatter: 'scatter', density: 'line', calendar: 'heatmap',
      };
      expect(types).toContain(expected[kind] ?? kind);
    });
  }

  it('draws nothing for an empty result, rather than an empty frame of axes', () => {
    expect(option(table({ measures: [{ name: 'm', values: [] }] }), 'barH')).toEqual({});
  });
});

describe('what each kind says about the data', () => {
  it('horizontal bars list the first row at the top, and stack to 100% on request', () => {
    const o = option(twoDims(), 'barH', { bar: { stack: 'percent' } });
    expect((o['yAxis'] as Record<string, unknown>)['inverse']).toBe(true);
    const [a, b] = series(o);
    expect(a['stack']).toBe('total');
    expect((a['data'] as number[])[0] + (b['data'] as number[])[0]).toBeCloseTo(100);
  });

  it('a waterfall floats each step on the running total and ends with the total', () => {
    const o = option(oneDim([10, -4, 6]), 'waterfall');
    const [base, steps] = series(o);
    expect(base['data']).toEqual([0, 6, 6, 0]);
    expect((steps['data'] as { value: number }[]).map(d => d.value)).toEqual([10, 4, 6, 12]);
    expect(((o['xAxis'] as Record<string, unknown>)['data'] as string[]).at(-1)).toBe('Total');
  });

  it('a pareto sorts largest first and runs to 100% on its own axis', () => {
    const o = option(oneDim([10, 40, 30, 20]), 'pareto');
    expect(series(o)[0]['data']).toEqual([40, 30, 20, 10]);
    expect((series(o)[1]['data'] as number[]).at(-1)).toBeCloseTo(100);
    expect(series(o)[1]['yAxisIndex']).toBe(1);
  });

  it('a stepped line steps; markers mark the highest, lowest and average', () => {
    expect(series(option(oneDim(), 'lineStep'))[0]['step']).toBe('middle');
    const marked = series(option(oneDim(), 'lineMarkers'))[0];
    expect(JSON.stringify(marked['markPoint'])).toContain('"type":"max"');
    expect(JSON.stringify(marked['markLine'])).toContain('"type":"average"');
  });

  it('a 100% area makes every column add to a hundred', () => {
    const [a, b] = series(option(dated(), 'areaShare'));
    expect((a['data'] as number[])[1] + (b['data'] as number[])[1]).toBeCloseTo(100);
  });

  it('a series over a date column writes the dates the console way', () => {
    const o = option(dated(), 'lineSmooth');
    expect((o['xAxis'] as Record<string, unknown>)['data']).toEqual(['1 Jan 2026', '1 Feb 2026']);
  });

  it('a rose is a pie by area; a half donut spans the top half', () => {
    expect(series(option(oneDim(), 'rose'))[0]['roseType']).toBe('area');
    const half = series(option(oneDim(), 'halfDonut'))[0];
    expect([half['startAngle'], half['endAngle']]).toEqual([180, 360]);
  });

  it('a nested pie rings the first dimension\'s totals inside the pairs', () => {
    const [inner, outer] = series(option(twoDims(), 'nestedPie'));
    expect((inner['data'] as { name: string; value: number }[]).map(d => [d.name, d.value])).toEqual([['north', 3], ['south', 7]]);
    expect((outer['data'] as unknown[]).length).toBe(4);
  });

  it('a trend line is least squares, and says how much it explains', () => {
    expect(trendLine([[0, 1], [1, 3], [2, 5]])).toEqual({ slope: 2, intercept: 1, r2: 1 });
    const o = option(numbers(2), 'scatterTrend');
    expect(series(o)[1]['name']).toMatch(/^Trend \(r² 1\.00\)$/);
  });

  it('bubbles size by the third number; the effect scatter rings the top five', () => {
    const bubble = series(option(numbers(3), 'bubble'))[0];
    const size = bubble['symbolSize'] as (v: number[]) => number;
    expect(size([0, 0, 7])).toBeGreaterThan(size([0, 0, 3]));
    const ringed = series(option(numbers(2, 9), 'effectScatter'))[1];
    expect((ringed['data'] as unknown[]).length).toBe(5);
  });

  it('a box is quartiles and Tukey whiskers, with the outliers apart', () => {
    expect(boxStats([1, 2, 3, 4, 5, 100])).toEqual({ box: [1, 2.25, 3.5, 4.75, 5], outliers: [100] });
  });

  it('a density integrates to about one', () => {
    const curve = density([1, 2, 2, 3, 3, 3, 4, 4, 5]);
    const step = curve[1][0] - curve[0][0];
    expect(curve.reduce((sum, [, y]) => sum + y * step, 0)).toBeCloseTo(1, 1);
  });

  it('a tree nests the dimensions and sums up the branches', () => {
    expect(treeOf(twoDims())).toEqual([
      { name: 'north', value: 3, children: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] },
      { name: 'south', value: 7, children: [{ name: 'a', value: 3 }, { name: 'b', value: 4 }] },
    ]);
  });

  it('a sankey keeps a value at two stages apart, so the flow cannot loop', () => {
    const t = table({ dims: [dim('from', ['north', 'south']), dim('to', ['north', 'north'])], measures: [{ name: 'm', values: [5, 6] }] });
    const flow = flowOf(t);
    expect(flow.nodes.length).toBe(3);
    expect(flow.links.every(link => link.source !== link.target)).toBe(true);
  });

  it('a heatmap puts every pair on its cell, and the calendar every day in its year', () => {
    const cells = series(option(twoDims(), 'heatmap'))[0]['data'];
    expect(cells).toEqual([[0, 0, 1], [1, 0, 3], [0, 1, 2], [1, 1, 4]]);
    const cal = option(table({ dims: [dim('day', ['2025-12-31', '2026-01-01'], { date: true })], measures: [{ name: 'm', values: [1, 2] }] }), 'calendar');
    expect((cal['calendar'] as { range: string }[]).map(c => c.range)).toEqual(['2025', '2026']);
  });

  it('a gauge reads its target from the settings, and ends on a round number past both', () => {
    const o = option(table({ measures: [{ name: 'total', values: [873] }] }), 'gauge', { refLines: { target: 900 } });
    expect(series(o)[0]['max']).toBe(1000);
    expect(series(o)).toHaveLength(2);
    expect(niceCeiling(0.42)).toBe(0.5);
  });

  it('a radar over two dimensions draws one shape per first value, one spoke per second', () => {
    const t = table({
      dims: [dim('region', ['n', 'n', 'n', 's', 's', 's']), dim('metric', ['a', 'b', 'c', 'a', 'b', 'c'])],
      measures: [{ name: 'm', values: [1, 2, 3, 4, 5, 6] }],
    });
    const o = option(t, 'radar');
    expect(((o['radar'] as Record<string, unknown>)['indicator'] as unknown[]).length).toBe(3);
    expect((series(o)[0]['data'] as { name: string; value: number[] }[]).map(d => d.value)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('a candlestick reads open, close, low, high by name, in ECharts\' order', () => {
    expect((series(option(numbers(4, 1), 'candlestick'))[0]['data'] as number[][])[0]).toEqual([1, 4, 3, 2]);
  });
});

describe('the parts every kind shares', () => {
  const long = (n: number) => table({
    dims: [dim('t', Array.from({ length: n }, (_, i) => `t${i}`))],
    measures: [{ name: 'm', values: Array.from({ length: n }, (_, i) => Math.sin(i)) }],
  });

  it('turns on the large-data paths past their thresholds, and zooms when the points do not fit', () => {
    const line = series(option(long(SAMPLE_FROM + 1), 'lineSmooth'))[0];
    expect(line['sampling']).toBe('lttb');
    expect(line['showSymbol']).toBe(false);
    const bars = option(long(LARGE_FROM), 'barH');
    expect(series(bars)[0]['large']).toBe(true);
    expect((bars['dataZoom'] as { type: string }[]).map(z => z.type)).toEqual(['inside', 'slider']);
    expect(series(option(long(10), 'lineSmooth'))[0]['sampling']).toBeUndefined();
    expect(option(long(10), 'lineSmooth')['dataZoom']).toBeUndefined();
  });

  it('stops animating past the threshold, and on request', () => {
    expect(option(long(ANIMATE_BELOW + 1), 'lineSmooth')['animation']).toBe(false);
    expect(option(long(10), 'lineSmooth')['animation']).toBe(true);
    expect(option(long(10), 'lineSmooth', { animation: false })['animation']).toBe(false);
  });

  it('offers save-as-PNG on the card colour, the data view and a restore, only where asked', () => {
    expect(option(oneDim(), 'barH')['toolbox']).toBeUndefined();
    const tools = (option(long(100), 'barH', {}, true)['toolbox'] as Record<string, Record<string, Record<string, unknown>>>)['feature'];
    expect(tools['saveAsImage']['backgroundColor']).toBe('#ffffff');
    expect(tools['saveAsImage']['name']).toBe('Revenue-by-region');
    expect(tools['dataView']['readOnly']).toBe(true);
    expect(tools['restore']).toBeDefined();
    const none = option(oneDim(), 'barH', { toolbox: { saveImage: false, dataView: false } }, true);
    expect(none['toolbox']).toBeUndefined();
  });

  it('applies title, legend, axes and labels from the settings', () => {
    const o = option(twoDims(), 'barH', {
      title: { text: 'Revenue', subtext: 'by region' }, legend: { position: 'bottom' },
      xAxis: { min: 0, max: 50, log: true, unit: '$' }, labels: { show: true },
    });
    expect(o['title']).toMatchObject({ text: 'Revenue', subtext: 'by region' });
    expect(o['legend']).toMatchObject({ bottom: 0, orient: 'horizontal' });
    expect(o['xAxis']).toMatchObject({ min: 0, max: 50, type: 'log' });
    expect(((o['xAxis'] as Record<string, Record<string, (v: number) => string>>)['axisLabel'])['formatter'](1200)).toBe('$1.2K');
    expect((series(o)[0]['label'] as Record<string, unknown>)['show']).toBe(true);
  });

  it('draws reference lines for average, minimum, maximum and a labelled target', () => {
    const marks = series(option(oneDim(), 'lineStep', { refLines: { average: true, max: true, target: 25, label: 'Plan' } }))[0]['markLine'] as { data: Record<string, unknown>[] };
    expect(marks.data).toEqual([{ type: 'average', name: 'Average' }, { type: 'max', name: 'Maximum' }, { yAxis: 25, name: 'Plan' }]);
  });

  it('sorts and cuts the category kinds to a top N with Other', () => {
    const o = option(oneDim([5, 40, 10, 30]), 'funnel', { topN: 2 });
    expect((series(o)[0]['data'] as { name: string; value: number }[]).map(d => [d.name, d.value])).toEqual([['south', 40], ['west', 30], ['Other', 15]]);
  });
});

describe('formats', () => {
  it('writes a figure in each style, with a unit before or after', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(1234.5, 'compact')).toBe('1.2K');
    expect(formatNumber(1234.5, 'fixed0')).toBe('1,235');
    expect(formatNumber(1234.5, 'fixed2')).toBe('1,234.50');
    expect(formatNumber(12.345, 'percent')).toBe('12.3%');
    expect(formatNumber(1500, 'compact', '$')).toBe('$1.5K');
    expect(formatNumber(-1500, 'compact', '$')).toBe('-$1.5K');
    expect(formatNumber(3, 'auto', 'kg')).toBe('3 kg');
    expect(formatNumber(null)).toBe('—');
  });

  it('writes a date-time on the 24-hour clock through instantOf, and a day as a day', () => {
    const at = dim('at', [], { date: true });
    expect(valueText(at, '2026-03-04')).toBe('4 Mar 2026');
    expect(valueText(at, '2026-03-04T21:05:00')).toMatch(/21:05|\d{2}:\d{2}/);
    expect(valueText(at, '2026-03-04T21:05:00')).not.toMatch(/AM|PM/i);
    expect(valueText(dim('name', []), 'north')).toBe('north');
  });
});
