import { ChartTable, TableDim } from './chart-table';
import { EOption, OptionTheme, Pick, chartOption, pickerOf } from './chart-options';
import { markFor } from './mark-pick';
import type { EChartKind } from '../analytics.service';
import type { EChartClick } from '../../../shared/charts/echart/echart';
import type { Mark, WidgetView } from '../widget-view';

/**
 * A click on an ECharts mark, from the event ECharts hands over to the Mark the board narrows on
 * (owner, 2026-10-06: "events for echarts not working" -- the 32 kinds drew, hovered, and did
 * nothing when clicked, where the SVG bars narrow the board).
 *
 * Two halves, tested apart: each kind's picker (which dimension values a clicked mark stands for,
 * read from the click ECharts reports) and markFor (those values to the view's own Mark, with the
 * raw operands the board filters on). One kind per family, each with the click ECharts actually
 * sends for it: a dataIndex on a category, a seriesIndex for a stacked series, a node's data for a
 * tree, an edge for a flow, a value pair for a heatmap cell or a calendar day.
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
  palette: ['#2563eb', '#be1d63', '#0f766e', '#7e22ce', '#c2410c', '#0e7490', '#4d7c0f', '#4338ca'],
  tokens: {
    mode: 'light', palette: [], text: '#101828', textSecondary: '#4a5565', muted: '#6a7282', border: '#e5e7eb',
    surface: '#ffffff', sunken: '#f3f4f6', heat: '#2563eb', up: '#166534', down: '#a01b34', font: 'Inter',
  },
};

const build = (t: ChartTable, kind: EChartKind): EOption => chartOption(t, kind, {}, THEME, { clickable: true });
const pick = (t: ChartTable, kind: EChartKind, click: EChartClick): Pick | null => pickerOf(build(t, kind))!(click);
const series = (o: EOption) => o['series'] as Record<string, unknown>[];

const regions = () => table({
  dims: [dim('region', ['north', 'south', 'east', 'west'])],
  measures: [{ name: 'revenue', values: [40, 30, 20, 10] }],
});
const regionByCategory = () => table({
  dims: [dim('region', ['north', 'north', 'south', 'south']), dim('category', ['a', 'b', 'a', 'b'])],
  measures: [{ name: 'revenue', values: [1, 2, 3, 4] }],
});
const days = () => table({
  dims: [dim('day', ['2026-01-01', '2026-01-02', '2026-01-03'], { date: true })],
  measures: [{ name: 'revenue', values: [5, 6, 7] }],
});

describe('a click on each ECharts kind picks the rows it was drawn from', () => {
  it('bars: the category clicked -- top to bottom on horizontal bars, which are drawn bottom-up', () => {
    // dataIndex 3 is the TOP bar of four drawn bottom-up: the first row.
    expect(pick(regions(), 'barH', { componentType: 'series', seriesIndex: 0, dataIndex: 3 })).toEqual(['north']);
    expect(pick(regions(), 'barH', { componentType: 'series', seriesIndex: 0, dataIndex: 0 })).toEqual(['west']);
    expect(pick(regions(), 'pareto', { componentType: 'series', seriesIndex: 1, dataIndex: 1 })).toEqual(['south']);
    expect(pick(regions(), 'waterfall', { componentType: 'series', seriesIndex: 1, dataIndex: 2 })).toEqual(['east']);
    // The waterfall's Total bar and its invisible base are not rows.
    expect(pick(regions(), 'waterfall', { componentType: 'series', seriesIndex: 1, dataIndex: 4 })).toBeNull();
    expect(pick(regions(), 'waterfall', { componentType: 'series', seriesIndex: 0, dataIndex: 1 })).toBeNull();
    expect(pick(regions(), 'polarBar', { componentType: 'series', seriesIndex: 0, dataIndex: 0 })).toEqual(['north']);
  });

  it('a line and an area report a click on their path, not only on their points', () => {
    for (const kind of ['lineSmooth', 'areaStacked', 'density'] as EChartKind[]) {
      const t = kind === 'lineSmooth' ? regions() : regionByCategory();
      expect(series(build(t, kind)).every(one => one['triggerEvent'] === true)).toBe(true);
    }
    expect(pick(regionByCategory(), 'density', { componentType: 'series', seriesType: 'line', seriesIndex: 1 })).toEqual(['south', undefined]);
  });

  it('a stacked series names its second dimension; a point on it names both', () => {
    expect(pick(regionByCategory(), 'areaStacked', { componentType: 'series', seriesIndex: 1, dataIndex: 0 })).toEqual(['north', 'b']);
    expect(pick(regionByCategory(), 'barH', { componentType: 'series', seriesIndex: 0, dataIndex: 0 })).toEqual(['south', 'a']);
  });

  it('a slice, a funnel stage, a radar shape and a gauge pick their row', () => {
    expect(pick(regions(), 'rose', { seriesIndex: 0, dataIndex: 2 })).toEqual(['east']);
    expect(pick(regions(), 'funnel', { seriesIndex: 0, dataIndex: 1 })).toEqual(['south']);
    expect(pick(regionByCategory(), 'nestedPie', { seriesIndex: 0, dataIndex: 1 })).toEqual(['south', undefined]);
    expect(pick(regionByCategory(), 'nestedPie', { seriesIndex: 1, dataIndex: 3 })).toEqual(['south', 'b']);
    expect(pick(regionByCategory(), 'radar', { seriesIndex: 0, dataIndex: 1 })).toEqual(['south', undefined]);
    const one = table({ dims: [dim('region', ['north'])], measures: [{ name: 'revenue', values: [9] }] });
    expect(pick(one, 'gauge', { seriesIndex: 0, dataIndex: 0 })).toEqual(['north']);
  });

  it('a treemap or sunburst node picks its path; a tree, only a leaf (a branch opens instead)', () => {
    const o = build(regionByCategory(), 'treemap');
    const node = (series(o)[0]['data'] as { path: string[]; children: { path: string[] }[] }[])[1];
    expect(pickerOf(o)!({ seriesIndex: 0, data: node })).toEqual(['south', undefined]);
    expect(pickerOf(o)!({ seriesIndex: 0, data: node.children[0] })).toEqual(['south', 'a']);
    // Without the node's own data, the names on the path are read back to the values.
    expect(pick(regionByCategory(), 'sunburst', { seriesIndex: 0, treePathInfo: [{ name: '' }, { name: 'north' }, { name: 'b' }] })).toEqual(['north', 'b']);
    expect(pick(regionByCategory(), 'tree', { seriesIndex: 0, data: { path: ['north'], children: [{}] } })).toBeNull();
    expect(pick(regionByCategory(), 'tree', { seriesIndex: 0, data: { path: ['north', 'a'] } })).toEqual(['north', 'a']);
  });

  it('a flow node picks its stage, a link picks both ends', () => {
    expect(pick(regionByCategory(), 'sankey', { seriesIndex: 0, dataType: 'node', data: { name: 'a​' } })).toEqual([undefined, 'a']);
    expect(pick(regionByCategory(), 'sankey', { seriesIndex: 0, dataType: 'edge', data: { source: 'north', target: 'b​' } })).toEqual(['north', 'b']);
    expect(pick(regionByCategory(), 'chord', { seriesIndex: 0, dataType: 'edge', data: { source: 'south', target: 'a' } })).toEqual(['south', 'a']);
    expect(pick(regionByCategory(), 'chord', { seriesIndex: 0, dataType: 'node', data: { name: 'b' } })).toEqual([undefined, 'b']);
  });

  it('a heatmap cell and a calendar day pick what they stand for', () => {
    expect(pick(regionByCategory(), 'heatmap', { seriesIndex: 0, value: [1, 0, 3] })).toEqual(['south', 'a']);
    expect(pick(days(), 'calendar', { seriesIndex: 0, value: ['2026-01-02', 6] })).toEqual(['2026-01-02']);
    // A square standing for several date-times narrows to none of them.
    const stamps = table({ dims: [dim('at', ['2026-01-02 08:00', '2026-01-02 09:00'], { date: true })], measures: [{ name: 'm', values: [1, 2] }] });
    expect(pick(stamps, 'calendar', { seriesIndex: 0, value: ['2026-01-02', 3] })).toBeNull();
  });

  it('a scatter point, a parallel line and a candle pick their row', () => {
    const hours = table({ dims: [dim('hour', ['8', '9', '10'], { numeric: true })], measures: [{ name: 'revenue', values: [1, 2, 3] }] });
    expect(pick(hours, 'scatterTrend', { seriesIndex: 0, dataIndex: 2 })).toEqual(['10']);
    expect(pick(hours, 'effectScatter', { seriesIndex: 1, seriesType: 'effectScatter', dataIndex: 0 })).toEqual(['10']);
    expect(pick(regionByCategory(), 'parallel', { seriesIndex: 0, dataIndex: 3 })).toEqual(['south', 'b']);
  });

  it('the rolled-up "Other" is not a value in the data, so it picks nothing', () => {
    const many = table({
      dims: [dim('n', Array.from({ length: 20 }, (_, i) => `n${i}`))],
      measures: [{ name: 'm', values: Array.from({ length: 20 }, (_, i) => 20 - i) }],
    });
    const o = build(many, 'rose');
    const data = series(o)[0]['data'] as { name: string }[];
    expect(data.length).toBe(16);
    expect(data.at(-1)!.name).toBe('Other');
    expect(pickerOf(o)!({ seriesIndex: 0, dataIndex: 15 })).toBeNull();
    expect(pickerOf(o)!({ seriesIndex: 0, dataIndex: 0 })).toEqual(['n0']);
  });

  it('every kind that can be clicked says so with the pointer, and only when it can', () => {
    const clickable = build(regions(), 'barH');
    const preview = chartOption(regions(), 'barH', {}, THEME, {});
    expect(series(clickable).every(one => one['cursor'] === 'pointer')).toBe(true);
    expect(series(preview).every(one => one['cursor'] === 'default')).toBe(true);
    // A treemap that narrows on click does not also zoom into the node.
    expect(series(build(regionByCategory(), 'treemap'))[0]['nodeClick']).toBe(false);
  });
});

describe('a pick becomes the Mark the board narrows on', () => {
  const marks: Mark[] = [
    { name: 'north · a', value: 1, operands: [{ field: 'region', value: 'north' }, { field: 'category', value: 'a' }] },
    { name: 'north · b', value: 2, operands: [{ field: 'region', value: 'north' }, { field: 'category', value: 'b' }] },
    { name: 'south · a', value: 3, operands: [{ field: 'region', value: 'south' }, { field: 'category', value: 'a' }] },
    { name: 'Other · a', value: 4, inert: true },
  ];
  const view = { marks } as WidgetView;

  it('a whole row is that row\'s mark, with its raw operands', () => {
    expect(markFor(view, ['north', 'b'])).toEqual(marks[1]);
  });

  it('part of a row narrows on what it names, and counts every row that agrees', () => {
    expect(markFor(view, ['north', undefined])).toEqual({ name: 'north', value: 3, operands: [{ field: 'region', value: 'north' }] });
    expect(markFor(view, [undefined, 'a'])).toEqual({ name: 'a', value: 8, operands: [{ field: 'category', value: 'a' }] });
  });

  it('an inert row, an unknown value, and nothing picked narrow nothing', () => {
    expect(markFor(view, ['Other', 'a'])).toBeNull();
    expect(markFor(view, ['west', 'a'])).toBeNull();
    expect(markFor(view, [undefined, undefined])).toBeNull();
    expect(markFor(view, null)).toBeNull();
    expect(markFor({ marks: [{ name: 'north', value: 1 }] } as WidgetView, ['north'])).toBeNull();
  });
});
