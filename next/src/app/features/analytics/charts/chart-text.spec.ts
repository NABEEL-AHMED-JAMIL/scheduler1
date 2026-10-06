import { ChartTable, TableDim } from './chart-table';
import { BAR_CHROME_PX, BAR_ROW_PX, EOption, OptionTheme, chartOption, labelInk, naturalHeight } from './chart-options';
import { LABEL_CONTRAST, contrast, inkOn, toRgb } from '../../../shared/charts/echart/echart-theme';
import type { EChartKind } from '../analytics.service';
import type { ChartSettings } from './chart-settings';

/**
 * Chart text, and charts of long results (owner review, 2026-10-06).
 *
 * Text: a label ON a mark is black or white for that mark's own fill, at 4.5:1 or better; a label
 * beside a mark is the theme's secondary text; the settings' Text choice overrides both. One
 * builder per family: bars, slices, a treemap, heatmap cells, a funnel, a marker pin.
 *
 * Long results: horizontal bars grow to a cap and then scroll; a kind past its category limit adds
 * the rest into "Other" where the figures add up; a long category name is cut on the axis.
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
// A palette with a light and a dark fill, so both inks are exercised.
const THEME: OptionTheme = {
  palette: ['#1e3a8a', '#fde68a', '#0f766e', '#f9a8d4', '#c2410c', '#a5f3fc', '#4d7c0f', '#4338ca'],
  tokens: {
    mode: 'dark', palette: [], text: '#f9fafb', textSecondary: '#d1d5dc', muted: '#99a1af', border: '#1e2939',
    surface: '#101828', sunken: '#1e2939', heat: '#60a5fa', up: '#4ade80', down: '#f87171', font: 'Inter',
  },
};
const build = (t: ChartTable, kind: EChartKind, s: ChartSettings = {}, height = 260): EOption =>
  chartOption(t, kind, s, THEME, { height, interactive: true });
const series = (o: EOption) => o['series'] as Record<string, unknown>[];
const label = (o: Record<string, unknown>) => o['label'] as Record<string, unknown>;
const reads = (ink: unknown, fill: string) => contrast(toRgb(String(ink))!, toRgb(fill)!) >= LABEL_CONTRAST;

const n = (count: number, prefix = 'n') => table({
  dims: [dim('name', Array.from({ length: count }, (_, i) => `${prefix}${i}`))],
  measures: [{ name: 'm', values: Array.from({ length: count }, (_, i) => count - i) }],
});
const two = () => table({
  dims: [dim('region', ['north', 'north', 'south', 'south']), dim('category', ['a', 'b', 'a', 'b'])],
  measures: [{ name: 'revenue', values: [1, 2, 3, 4] }],
});

describe('chart text colours', () => {
  it('a label beside a mark is the theme\'s secondary text with no halo; one inside is black or white for its fill', () => {
    const outside = series(build(n(4), 'barH', { labels: { show: true } }));
    expect(label(outside[0])['color']).toBe(THEME.tokens.textSecondary);
    expect(label(outside[0])['textBorderWidth']).toBe(0);
    const stacked = series(build(two(), 'barH', { labels: { show: true }, bar: { stack: 'stack' } }));
    stacked.forEach((one, i) => {
      expect(label(one)['position']).toBe('inside');
      expect(reads(label(one)['color'], THEME.palette[i])).toBe(true);
    });
  });

  it('slices: labels outside take the text colour; inside, each slice its own ink', () => {
    const outside = series(build(n(4), 'rose'))[0];
    expect(label(outside)['color']).toBe(THEME.tokens.textSecondary);
    const inside = series(build(n(4), 'rose', { labels: { position: 'inside' } }))[0];
    (inside['data'] as { label: { color: string } }[]).forEach((item, i) =>
      expect(reads(item.label.color, THEME.palette[i])).toBe(true));
    // The nested pie's inner ring is painted per slice and labelled on it.
    const nested = series(build(two(), 'nestedPie'))[0];
    (nested['data'] as { itemStyle: { color: string }; label: { color: string } }[]).forEach(item =>
      expect(reads(item.label.color, item.itemStyle.color)).toBe(true));
  });

  it('a treemap paints every node and labels it in that node\'s ink, its children too', () => {
    const nodes = series(build(two(), 'treemap'))[0]['data'] as { itemStyle: { color: string }; label: { color: string }; children: { itemStyle: { color: string }; label: { color: string } }[] }[];
    for (const node of nodes) {
      expect(reads(node.label.color, node.itemStyle.color)).toBe(true);
      for (const child of node.children) expect(reads(child.label.color, child.itemStyle.color)).toBe(true);
    }
  });

  it('a heatmap figure is inked for its own cell; a funnel stage inside for its fill', () => {
    const cells = series(build(two(), 'heatmap'))[0]['data'] as { value: number[]; label: { color: string } }[];
    expect(cells.map(cell => cell.label.color)).toContain('#ffffff');
    const funnel = series(build(n(4), 'funnel'))[0];
    (funnel['data'] as { itemStyle: { color: string }; label: { color: string } }[]).forEach(item =>
      expect(reads(item.label.color, item.itemStyle.color)).toBe(true));
  });

  it('a pin\'s figure reads on the pin, which is drawn in its series\' colour', () => {
    const line = series(build(n(6), 'lineMarkers'))[0];
    const pin = line['markPoint'] as { label: { color: string } };
    expect(pin.label.color).toBe(inkOn(THEME.palette[0]));
  });

  it('honours the Text setting: theme colours, or a colour of the author\'s, and a size', () => {
    expect(labelInk('#fde68a', true, { labels: { color: 'theme' } }, THEME.tokens)).toBe(THEME.tokens.text);
    expect(labelInk('#fde68a', true, { labels: { color: '#ff0000' } }, THEME.tokens)).toBe('#ff0000');
    expect(labelInk(null, false, { labels: { color: '#ff0000' } }, THEME.tokens)).toBe('#ff0000');
    expect(labelInk('#fde68a', true, {}, THEME.tokens)).toBe('#000000');
    const big = series(build(n(4), 'barH', { labels: { show: true, size: 'large' } }))[0];
    expect(label(big)['fontSize']).toBe(13);
  });
});

describe('charts of long results', () => {
  it('horizontal bars grow a row per bar to a cap, then scroll from the first row', () => {
    expect(naturalHeight(5, 260, 600)).toBe(260);
    expect(naturalHeight(20, 260, 600)).toBe(20 * BAR_ROW_PX + BAR_CHROME_PX);
    expect(naturalHeight(1000, 260, 600)).toBe(600);
    const o = build(n(240), 'barH', {}, 600);
    const [inside, slider] = o['dataZoom'] as Record<string, number>[];
    // Drawn bottom-up, so the first rows are the END of the axis.
    expect(slider['end']).toBe(100);
    expect(slider['start']).toBeGreaterThan(80);
    expect(inside['start']).toBe(slider['start']);
    expect(build(n(10), 'barH', {}, 260)['dataZoom']).toBeUndefined();
  });

  it('a long category name is cut on the axis; a crowded axis along the bottom tilts', () => {
    const long = table({ dims: [dim('name', Array.from({ length: 30 }, (_, i) => `A product name that runs to sixty characters or more, number ${i}`))], measures: [{ name: 'm', values: Array(30).fill(1) }] });
    const axis = build(long, 'barH')['yAxis'] as { axisLabel: Record<string, unknown> };
    expect(axis.axisLabel['overflow']).toBe('truncate');
    expect(axis.axisLabel['width']).toBeGreaterThan(0);
    const bottom = build(long, 'pareto')['xAxis'] as { axisLabel: Record<string, unknown> };
    expect(bottom.axisLabel['rotate']).toBe(35);
  });

  it('past a kind\'s limit the rest go into "Other" where the figures add up', () => {
    for (const [kind, limit] of [['rose', 16], ['halfDonut', 8], ['pareto', 60], ['polarBar', 36], ['pictorialBar', 24], ['waterfall', 60]] as [EChartKind, number][]) {
      const o = build(n(200), kind);
      const names = kind === 'pareto' || kind === 'waterfall'
        ? (o['xAxis'] as { data: string[] }).data.filter(name => name !== 'Total')
        : kind === 'pictorialBar' ? (o['yAxis'] as { data: string[] }).data
        : kind === 'polarBar' ? (o['radiusAxis'] as { data: string[] }).data
        : (series(o)[0]['data'] as { name: string }[]).map(item => item.name);
      expect(names.length).toBe(limit);
      expect(names).toContain('Other');
    }
  });

  it('a server\'s own "Other" row joins the new tail rather than standing beside it', () => {
    const rolled = table({ dims: [dim('name', [...Array.from({ length: 20 }, (_, i) => `n${i}`), 'Other'])], measures: [{ name: 'm', values: [...Array(20).fill(1), 500] }] });
    const names = (series(build(rolled, 'rose'))[0]['data'] as { name: string }[]).map(item => item.name);
    expect(names.filter(name => name === 'Other').length).toBe(1);
    expect(names.at(-1)).toBe('Other');
  });

  it('a funnel of many stages draws the largest twelve and says it left the rest out', () => {
    const o = build(n(240), 'funnel');
    expect((series(o)[0]['data'] as unknown[]).length).toBe(12);
    expect((o['title'] as { subtext: string }).subtext).toContain('The largest 12 of 240');
  });
});
