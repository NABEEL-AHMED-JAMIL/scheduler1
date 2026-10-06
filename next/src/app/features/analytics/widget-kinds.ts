import type { WidgetVisualization } from './analytics.service';

/**
 * Every way a widget may be drawn, and what the picker calls it.
 *
 * In its own module, with no Angular import, so the Playwright suite can import it too. That
 * suite asserted a hardcoded count — "Fourteen: the original four, seven chart kinds, and three
 * summaries" — which was already wrong by two before this file existed: a later change added
 * `shareStacked` and `pivot` and nobody edited the sentence. A spec that restates a number the
 * code owns goes stale silently and then reads as a regression in whatever change happens to run
 * next. Importing the list means the picker and the test cannot disagree.
 *
 * The order is the order the picker offers: by category, and inside a category plainest first.
 * A category's kinds are contiguous, so a menu that draws a heading where the category changes
 * lists exactly KIND_IDS in order.
 *
 * `engine` says who draws it. The nineteen kinds that existed before ECharts arrived keep their
 * own SVG components -- saved widgets use them, and every spec over them still holds -- and the
 * rest are drawn by app-echart from the pure option builders in charts/chart-options.ts.
 *
 * `needs` is the shape of result a kind can draw, in the words the picker shows beside it. The
 * rule that decides is in charts/chart-fit.ts (and issuesFor in dashboard.ts for the SVG kinds);
 * this sentence is the summary a reader scans before choosing.
 *
 * @author Nabeel Ahmed
 */
export type KindCategory =
  | 'Figures and tables' | 'Bar' | 'Line and area' | 'Pie' | 'Scatter' | 'Distribution'
  | 'Hierarchy' | 'Flow' | 'Grid' | 'Other' | 'Summaries';

export interface KindInfo {
  id: WidgetVisualization;
  label: string;
  category: KindCategory;
  engine: 'svg' | 'echarts';
  needs: string;
}

/** The categories in picker order. */
export const CATEGORIES: KindCategory[] = [
  'Figures and tables', 'Bar', 'Line and area', 'Pie', 'Scatter', 'Distribution',
  'Hierarchy', 'Flow', 'Grid', 'Other', 'Summaries',
];

const svg = (id: WidgetVisualization, label: string, category: KindCategory, needs: string): KindInfo =>
  ({ id, label, category, engine: 'svg', needs });
const ec = (id: WidgetVisualization, label: string, category: KindCategory, needs: string): KindInfo =>
  ({ id, label, category, engine: 'echarts', needs });

const ONE_DIM = 'A text column and a number';
const ORDERED = 'An ordered column (a date or a sequence) and a number';
const SERIES = 'An ordered column, a number, and a second column or number for the series';

export const KINDS: KindInfo[] = [
  svg('kpi', 'Single figure', 'Figures and tables', 'One row with one number'),
  svg('table', 'Table', 'Figures and tables', 'Anything'),
  svg('pivot', 'Cross-tab grid', 'Figures and tables', 'Two text columns and a number'),
  svg('comparison', 'Two figures compared', 'Figures and tables', 'Exactly two rows'),

  svg('ranked', 'Ranked bars', 'Bar', ONE_DIM),
  svg('rankedShare', 'Ranked bars with share', 'Bar', `${ONE_DIM} that adds up`),
  svg('bar', 'Bars in order', 'Bar', ONE_DIM),
  svg('stacked', 'Stacked bars', 'Bar', 'Two text columns and a number that adds up'),
  svg('shareStacked', 'Share within each group', 'Bar', 'Two text columns and a number that adds up'),
  svg('groupedBar', 'Bars side by side', 'Bar', 'Two text columns and a number'),
  ec('barH', 'Horizontal bars', 'Bar', ONE_DIM),
  ec('waterfall', 'Waterfall', 'Bar', `${ONE_DIM} that adds up`),
  ec('pareto', 'Pareto: bars and running share', 'Bar', `${ONE_DIM} that adds up`),
  ec('barLine', 'Bars and a line, two axes', 'Bar', 'A text column and two numbers'),
  ec('polarBar', 'Polar bars', 'Bar', `${ONE_DIM}, 3 to 36 rows`),
  ec('pictorialBar', 'Pictorial bars', 'Bar', `${ONE_DIM}, up to 24 rows`),

  svg('line', 'Line over the dimension', 'Line and area', ORDERED),
  svg('area', 'Filled area', 'Line and area', ORDERED),
  svg('cumulative', 'Running total', 'Line and area', `${ORDERED} that adds up`),
  ec('lineSmooth', 'Smooth line', 'Line and area', SERIES),
  ec('lineStep', 'Stepped line', 'Line and area', SERIES),
  ec('lineMarkers', 'Line with min, max and average', 'Line and area', SERIES),
  ec('areaStacked', 'Stacked area', 'Line and area', `${SERIES}, adding up`),
  ec('areaShare', '100% stacked area', 'Line and area', `${SERIES}, adding up`),

  svg('donut', 'Share of the total', 'Pie', `${ONE_DIM} that adds up`),
  ec('rose', 'Rose (Nightingale)', 'Pie', `${ONE_DIM} that adds up`),
  ec('halfDonut', 'Half donut', 'Pie', `${ONE_DIM} that adds up`),
  ec('nestedPie', 'Nested pie', 'Pie', 'Two text columns and a number that adds up'),

  svg('scatter', 'Scatter of two numbers', 'Scatter', 'Two numbers'),
  ec('scatterTrend', 'Scatter with trend line', 'Scatter', 'Two numbers, three rows or more'),
  ec('bubble', 'Bubbles', 'Scatter', 'Three numbers: across, up and size'),
  ec('effectScatter', 'Scatter, top five highlighted', 'Scatter', 'Two numbers'),

  svg('histogram', 'Distribution of the figures', 'Distribution', 'Several numbers'),
  ec('boxplot', 'Box plot', 'Distribution', 'Five numbers or more; per group with two text columns'),
  ec('density', 'Density curve', 'Distribution', 'Eight numbers or more'),

  ec('treemap', 'Treemap', 'Hierarchy', 'One to three text columns and a number that adds up'),
  ec('sunburst', 'Sunburst', 'Hierarchy', 'Two or three text columns and a number that adds up'),
  ec('tree', 'Tree', 'Hierarchy', 'Two or three text columns'),

  ec('sankey', 'Sankey flow', 'Flow', 'Two or three text columns and a number that adds up'),
  ec('chord', 'Chord', 'Flow', 'Two text columns and a number that adds up'),

  ec('heatmap', 'Heatmap', 'Grid', 'Two text columns and a number'),
  ec('calendar', 'Calendar heatmap', 'Grid', 'A date column and a number'),

  ec('funnel', 'Funnel', 'Other', `${ONE_DIM}, 2 to 12 rows`),
  ec('gauge', 'Gauge against a target', 'Other', 'One row with a number, and a target'),
  ec('radar', 'Radar', 'Other', 'Three numbers or more, or two text columns and a number'),
  ec('parallel', 'Parallel coordinates', 'Other', 'Three columns or more, one a number'),
  ec('themeRiver', 'Theme river', 'Other', 'A date column, a text column and a number that adds up'),
  ec('candlestick', 'Candlestick', 'Other', 'An ordered column and open, high, low, close'),

  svg('dimensionSummary', 'Summary of the groups', 'Summaries', ONE_DIM),
  svg('trendSummary', 'Summary of the trend', 'Summaries', ORDERED),
  svg('distributionSummary', 'Summary of the spread', 'Summaries', 'Three numbers or more'),
];

/** Just the ids, in picker order. What a test asserting "offers every kind" should compare to. */
export const KIND_IDS: WidgetVisualization[] = KINDS.map(kind => kind.id);

/** The kinds app-echart draws. */
export const ECHART_KIND_IDS: WidgetVisualization[] = KINDS.filter(kind => kind.engine === 'echarts').map(kind => kind.id);

export function kindInfo(id: string | null | undefined): KindInfo | undefined {
  return KINDS.find(kind => kind.id === id);
}
