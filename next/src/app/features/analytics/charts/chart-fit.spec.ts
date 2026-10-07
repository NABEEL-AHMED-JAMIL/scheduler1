import { ChartTable, TableDim, sortAndCut, tableOf } from './chart-table';
import { fitIssues } from './chart-fit';
import { ECHART_KIND_IDS, KINDS, KIND_IDS } from '../widget-kinds';
import { KIND_ICONS } from './kind-icons';
import type { EChartKind } from '../analytics.service';
import type { WidgetView } from '../widget-view';

/**
 * The fit rules of every ECharts kind: for each, a result it draws and the results it refuses,
 * with the reason it gives. A kind's rule is the promise the picker makes -- "this fits" -- so it
 * is pinned per kind rather than sampled.
 */

const dim = (name: string, values: string[], extra: Partial<TableDim> = {}): TableDim =>
  ({ name, values, date: false, numeric: false, ...extra });

function table(parts: Partial<ChartTable> & { dims?: TableDim[]; measures?: ChartTable['measures'] }): ChartTable {
  const measures = parts.measures ?? [];
  return {
    dims: parts.dims ?? [],
    measures,
    length: parts.length ?? measures[measures.length - 1]?.values.length ?? 0,
    additive: parts.additive ?? true,
    order: parts.order ?? 'dimension',
    topNTrimmed: parts.topNTrimmed ?? false,
    emptyReason: parts.emptyReason ?? 'This returned no rows.',
  };
}

const REGIONS = ['north', 'south', 'east', 'west'];
const oneDim = (values = [10, 20, 30, 40], extra: Partial<ChartTable> = {}) =>
  table({ dims: [dim('region', REGIONS.slice(0, values.length))], measures: [{ name: 'revenue', values }], ...extra });
const months = (n: number) => Array.from({ length: n }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}-01`);
const series = (extra: Partial<ChartTable> = {}) => table({
  dims: [dim('month', months(3).flatMap(m => [m, m]), { date: true }), dim('region', ['north', 'south', 'north', 'south', 'north', 'south'])],
  measures: [{ name: 'revenue', values: [1, 2, 3, 4, 5, 6] }], ...extra,
});
const twoDims = (extra: Partial<ChartTable> = {}) => table({
  dims: [dim('region', ['north', 'north', 'south', 'south']), dim('category', ['a', 'b', 'a', 'b'])],
  measures: [{ name: 'revenue', values: [1, 2, 3, 4] }], ...extra,
});
const numbers = (count: number, rows = 5) => table({
  dims: [dim('name', Array.from({ length: rows }, (_, i) => `n${i}`))],
  measures: Array.from({ length: count }, (_, m) => ({ name: `m${m}`, values: Array.from({ length: rows }, (_, i) => i * (m + 1) + 1) })),
  additive: 'unknown',
});
const single = () => table({ measures: [{ name: 'total', values: [42] }] });
const empty = () => table({ measures: [{ name: 'revenue', values: [] }], emptyReason: 'This analysis returned no rows.' });

describe('the ECharts kinds in the catalogue', () => {
  it('keeps the nineteen kinds saved widgets use, with their ids', () => {
    for (const id of ['table', 'ranked', 'rankedShare', 'bar', 'donut', 'kpi', 'line', 'area', 'cumulative', 'stacked',
      'shareStacked', 'histogram', 'scatter', 'comparison', 'pivot', 'groupedBar', 'dimensionSummary', 'trendSummary', 'distributionSummary']) {
      expect(KINDS.find(kind => kind.id === id)?.engine, id).toBe('svg');
    }
  });

  it('gives every kind a unique id that fits the 32-character column, a category, what it needs, and a glyph', () => {
    expect(new Set(KIND_IDS).size).toBe(KIND_IDS.length);
    for (const kind of KINDS) {
      expect(kind.id.length, kind.id).toBeLessThanOrEqual(32);
      expect(kind.needs.length, kind.id).toBeGreaterThan(3);
      expect(KIND_ICONS[kind.id], kind.id).toBeTruthy();
    }
  });

  it('lists a category\'s kinds together, so a menu headed by category is still KIND_IDS in order', () => {
    const seen: string[] = [];
    for (const kind of KINDS) {
      if (seen[seen.length - 1] !== kind.category) {
        expect(seen, `${kind.category} appears twice`).not.toContain(kind.category);
        seen.push(kind.category);
      }
    }
  });

  it('has a fit rule for every ECharts kind, and only those', () => {
    expect(Object.keys(fitIssues(oneDim())).sort()).toEqual([...ECHART_KIND_IDS].sort());
  });
});

describe('fit rules, kind by kind', () => {
  const ok = (t: ChartTable, kind: EChartKind) => expect(fitIssues(t)[kind], kind).toBe('');
  const no = (t: ChartTable, kind: EChartKind, reason: RegExp) => expect(fitIssues(t)[kind], kind).toMatch(reason);

  it('refuses every kind over an empty result, with the result\'s own reason', () => {
    for (const reason of Object.values(fitIssues(empty()))) expect(reason).toBe('This analysis returned no rows.');
  });

  it('horizontal bars: a column of names; negatives are fine; not three dimensions', () => {
    ok(oneDim([10, -5, 3]), 'barH');
    ok(twoDims(), 'barH');
    no(single(), 'barH', /column of names/);
    no(table({ dims: [dim('a', ['x']), dim('b', ['y']), dim('c', ['z'])], measures: [{ name: 'm', values: [1] }] }), 'barH', /Three dimensions/);
  });

  it('waterfall and pareto: one dimension, figures that add up', () => {
    ok(oneDim([10, -5, 3]), 'waterfall');
    no(oneDim([10, 5], { additive: false }), 'waterfall', /does not add up/);
    no(oneDim([10, 5], { additive: 'unknown' }), 'waterfall', /saved query does not say/);
    ok(oneDim(), 'pareto');
    no(oneDim([10, -5, 3]), 'pareto', /below zero/);
    no(twoDims(), 'pareto', /has 2/);
  });

  it('bars and a line need two numbers', () => {
    ok(numbers(2), 'barLine');
    no(oneDim(), 'barLine', /two numbers/);
  });

  it('polar and pictorial bars: bounded rows, nothing below zero', () => {
    ok(oneDim(), 'polarBar');
    no(oneDim([1, 2]), 'polarBar', /at least 3/);
    no(oneDim([1, -2, 3]), 'polarBar', /below zero/);
    ok(oneDim(), 'pictorialBar');
    const many = table({ dims: [dim('n', Array.from({ length: 30 }, (_, i) => `n${i}`))], measures: [{ name: 'm', values: Array(30).fill(1) }] });
    // Past the limit the rest go into "Other" where the figures add up; where they do not, refused.
    ok(many, 'pictorialBar');
    no({ ...many, additive: false }, 'pictorialBar', /30 rows is past the 24.*cannot be added into "Other"/);
    const forty = table({ dims: [dim('n', Array.from({ length: 40 }, (_, i) => `n${i}`))], measures: [{ name: 'm', values: Array(40).fill(1) }] });
    ok(forty, 'polarBar');
    no({ ...forty, additive: 'unknown' }, 'polarBar', /40 rows is past the 36.*because a saved query/);
  });

  it('a funnel of many stages draws the largest, whatever the figures are', () => {
    const many = table({ dims: [dim('n', Array.from({ length: 40 }, (_, i) => `n${i}`))], measures: [{ name: 'm', values: Array(40).fill(1) }] });
    ok(many, 'funnel');
    ok({ ...many, additive: false }, 'funnel');
  });

  it('the line family: in the dimension\'s order, one or two dimensions, at most eight series', () => {
    for (const kind of ['lineSmooth', 'lineStep', 'lineMarkers'] as EChartKind[]) {
      ok(oneDim(), kind);
      ok(series(), kind);
      no(oneDim([1, 2, 3], { order: 'rank' }), kind, /biggest-first/);
      no(oneDim([1, 2, 3], { order: 'reversed' }), kind, /newest-first/);
      no(oneDim([1]), kind, /at least two points/);
    }
    const wide = table({
      dims: [dim('x', Array(9).fill('a')), dim('s', Array.from({ length: 9 }, (_, i) => `s${i}`))],
      measures: [{ name: 'm', values: Array(9).fill(1) }],
    });
    no(wide, 'lineSmooth', /9 series is past the 8/);
  });

  it('stacked and 100% areas: series to stack, adding up, nothing negative', () => {
    for (const kind of ['areaStacked', 'areaShare'] as EChartKind[]) {
      ok(series(), kind);
      no(oneDim(), kind, /needs series to stack/);
      no(series({ additive: false }), kind, /does not add up/);
      no(series({ measures: [{ name: 'm', values: [1, -2, 3, 4, 5, 6] }] }), kind, /below zero/);
    }
  });

  it('the pies: adding up, nothing at or below zero, and the slice limits', () => {
    ok(oneDim(), 'rose');
    ok(oneDim(), 'halfDonut');
    no(oneDim([1, 0, 2]), 'halfDonut', /zero or below/);
    no(oneDim([1, 2], { topNTrimmed: true }), 'rose', /Top-N with the rest discarded/);
    const nine = table({ dims: [dim('n', Array.from({ length: 9 }, (_, i) => `n${i}`))], measures: [{ name: 'm', values: Array(9).fill(1) }] });
    ok(nine, 'halfDonut');
    no({ ...nine, additive: false }, 'halfDonut', /9 rows is past the 8/);
    ok(twoDims(), 'nestedPie');
    no(oneDim(), 'nestedPie', /exactly two columns/);
  });

  it('the scatters count quantities: a numeric dimension is one', () => {
    const years = table({ dims: [dim('year', ['2020', '2021', '2022'], { numeric: true })], measures: [{ name: 'm', values: [1, 2, 3] }] });
    ok(years, 'scatterTrend');
    ok(years, 'effectScatter');
    no(years, 'bubble', /three numbers/);
    ok(numbers(3), 'bubble');
    no(oneDim(), 'scatterTrend', /two numbers/);
    no(table({ dims: [dim('year', ['1', '2'], { numeric: true })], measures: [{ name: 'm', values: [1, 2] }] }), 'scatterTrend', /three points/);
  });

  it('box plot and density need enough figures', () => {
    ok(numbers(1, 5), 'boxplot');
    no(numbers(1, 4), 'boxplot', /five figures/);
    ok(twoDims(), 'boxplot');
    ok(numbers(1, 8), 'density');
    no(numbers(1, 7), 'density', /eight figures/);
    no(table({ dims: [dim('n', Array(8).fill('a'))], measures: [{ name: 'm', values: Array(8).fill(3) }] }), 'density', /same one/);
  });

  it('hierarchies: levels to nest, and parts of a whole', () => {
    ok(oneDim(), 'treemap');
    ok(twoDims(), 'treemap');
    no(single(), 'treemap', /column/);
    ok(twoDims(), 'sunburst');
    no(oneDim(), 'sunburst', /two columns or more/);
    no(twoDims({ additive: false }), 'sunburst', /does not add up/);
    ok(twoDims({ additive: false }), 'tree');
    no(oneDim(), 'tree', /two columns of names/);
  });

  it('flows: two or three stages that add up', () => {
    ok(twoDims(), 'sankey');
    no(oneDim(), 'sankey', /where it starts/);
    no(twoDims({ additive: 'unknown' }), 'sankey', /saved query/);
    ok(twoDims(), 'chord');
    no(oneDim(), 'chord', /exactly two/);
  });

  it('grids: a heatmap of two dimensions, a calendar of one date', () => {
    ok(twoDims(), 'heatmap');
    no(oneDim(), 'heatmap', /exactly two/);
    const days = table({ dims: [dim('day', ['2026-01-01', '2026-01-02', '2026-03-05'], { date: true })], measures: [{ name: 'm', values: [1, 2, 3] }] });
    ok(days, 'calendar');
    no(oneDim(), 'calendar', /a date/);
    const decade = table({ dims: [dim('day', ['2018-01-01', '2020-01-01', '2022-01-01', '2024-01-01'], { date: true })], measures: [{ name: 'm', values: [1, 2, 3, 4] }] });
    no(decade, 'calendar', /span 4 years/);
  });

  it('the rest: funnel, gauge, radar, parallel, theme river, candlestick', () => {
    ok(oneDim(), 'funnel');
    no(oneDim([1, -1]), 'funnel', /below zero/);
    ok(single(), 'gauge');
    no(oneDim(), 'gauge', /one figure, and this returned 4 rows/);
    ok(numbers(3, 4), 'radar');
    ok(table({
      dims: [dim('region', ['n', 'n', 'n', 's', 's', 's']), dim('metric', ['a', 'b', 'c', 'a', 'b', 'c'])],
      measures: [{ name: 'm', values: [1, 2, 3, 4, 5, 6] }],
    }), 'radar');
    no(oneDim(), 'radar', /three numbers or more/);
    ok(numbers(2), 'parallel');
    no(oneDim(), 'parallel', /three columns/);
    ok(series(), 'themeRiver');
    no(twoDims(), 'themeRiver', /a date, then a group/);
    const ohlc = table({
      dims: [dim('day', ['d1', 'd2'])],
      measures: ['open', 'high', 'low', 'close'].map(name => ({ name, values: [1, 2] })),
    });
    ok(ohlc, 'candlestick');
    no(numbers(4), 'candlestick', /named open, high, low and close/);
  });
});

describe('reading a view into a table', () => {
  const view = (columns: string[], rows: (string | null)[][], measureColumn?: boolean[]): WidgetView =>
    ({ columns, rows, measureColumn: measureColumn ?? columns.map(() => true) } as unknown as WidgetView);

  it('takes an analysis\'s roles as they are', () => {
    const t = tableOf(view(['region', 'month', 'revenue'], [['n', '2026-01-01', '10'], ['s', '2026-02-01', '20']], [false, false, true]), { additive: true });
    expect(t.dims.map(d => d.name)).toEqual(['region', 'month']);
    expect(t.dims[1].date).toBe(true);
    expect(t.measures.map(m => m.name)).toEqual(['revenue']);
  });

  it('reads a saved query\'s roles from its values: the text column names, the numbers measure', () => {
    const t = tableOf(view(['id', 'name', 'qty', 'price'], [['1', 'a', '2', '3.5'], ['2', 'b', '4', '1']]), { additive: 'unknown' });
    expect(t.dims.map(d => d.name)).toEqual(['name']);
    expect(t.measures.map(m => m.name)).toEqual(['id', 'qty', 'price']);
    expect(t.additive).toBe('unknown');
  });

  it('leaves out a row whose primary measure is not a number, never counting it as zero', () => {
    const t = tableOf(view(['region', 'revenue'], [['n', '10'], ['s', null], ['e', 'x']], [false, true]), { additive: true });
    expect(t.length).toBe(1);
  });

  it('cuts to a top N, adding the rest into "Other" only where the figures add up', () => {
    const t = oneDim([5, 40, 10, 30]);
    const cut = sortAndCut(t, 'none', 2, true);
    expect(cut.table.dims[0].values).toEqual(['south', 'west', 'Other']);
    expect(cut.table.measures[0].values).toEqual([40, 30, 15]);
    const averages = sortAndCut({ ...t, additive: false }, 'none', 2, true);
    expect(averages.table.dims[0].values).toEqual(['south', 'west']);
    expect(averages.dropped).toBe(2);
  });
});
