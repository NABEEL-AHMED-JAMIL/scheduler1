import type { WidgetVisualization } from '../analytics.service';
import { KINDS, kindInfo } from '../widget-kinds';
import { WidgetConfig, WidgetView, queryView, widgetConfigString } from '../widget-view';
import type { ChartSettings } from './chart-settings';
import { suggestedKinds } from './kind-menu';

/**
 * MIG-357, "AI chooses, console draws": a chart answer -- the query that ran, its rows, and the chart the model chose for
 * them -- and the pure readings every place that draws one makes of it (Ask your data, the AI Assistant's Chart tab,
 * Visualise). Angular-free, so the fit fallback and the pin request are pinned by specs without a component.
 *
 * The numbers are the rows: the model never saw one, and nothing here reads a figure from anywhere else. The model's kind
 * is a wish, not an order -- the same fit rules as the picker (fitIssues, issuesFor) have the last word, and a kind that
 * cannot draw these rows falls back to the best one that can, from the Show-as suggestions, with the reason said.
 *
 * @author Nabeel Ahmed
 */

/** The chart the model chose (ai-service AskChart.chart), or one a Visualise suggestion made (source 'shape'). */
export interface AnswerChart {
  kind: string;
  title: string;
  caption: string;
  xAxis?: string;
  yAxis?: string;
  stack?: 'none' | 'stack' | 'percent';
  sort?: 'none' | 'asc' | 'desc';
  topN?: number;
  /** Whether the figures add up (a count or a sum): true, false, or null when the query does not say. */
  additive?: boolean | null;
  source?: 'model' | 'shape';
}

/** A chart answer: what ran, over what, its rows, and how to draw them. */
export interface ChartAnswer {
  sql: string;
  dataset: { datasetId?: number | null; name: string; connection: string; path: string };
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
  truncated: boolean;
  chart: AnswerChart | null;
  /** A sentence of what the rows hold, made from the rows (never by the model). */
  summary?: string | null;
}

/** The kind drawn, and -- when it is not the one asked for -- which was and why it could not draw these rows. */
export interface Fitted {
  kind: WidgetVisualization;
  asked: string | null;
  fellBack: boolean;
  /** "A donut was asked for, but … Shown as ranked bars instead." -- '' when the asked kind is drawn. */
  reason: string;
}

/** The kinds the server's chart answer may name: the picker's, in its order (ai-service AskChart.KINDS pins the same list). */
export const ANSWER_KINDS: readonly string[] = KINDS.map(kind => kind.id);

/** The kinds the console's own SVG components draw as ONE series of one column of names. */
const ONE_SERIES: ReadonlySet<string> = new Set(['kpi', 'line', 'area', 'cumulative', 'bar', 'ranked', 'rankedShare', 'donut',
  'comparison', 'dimensionSummary', 'trendSummary', 'histogram']);

/** For a one-series kind asked of rows with two columns of names: the kinds that draw the same thing per group. */
const PER_GROUP: Record<string, WidgetVisualization[]> = {
  line: ['lineSmooth'], cumulative: ['lineSmooth'], trendSummary: ['lineSmooth'], area: ['areaStacked', 'lineSmooth'],
  bar: ['barH', 'heatmap'], ranked: ['barH', 'heatmap'], rankedShare: ['barH', 'heatmap'], donut: ['nestedPie', 'sunburst', 'treemap'],
};

const DATE_TEXT = /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2}.*)?$/;
const NUMBER_TEXT = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

/**
 * The rows as a chart reads them, the figures untouched: where the names come in two columns and the date is not the
 * first, the date column is put first (a line runs along it, one per group); and rows ordered newest-first are put in
 * the date's own order, so a line does not run backwards. The query and its table keep the order they came in.
 */
export function chartRows(columns: string[], rows: (string | null)[][]): { columns: string[]; rows: (string | null)[][] } {
  const filled = (i: number) => rows.map(r => r[i]).filter((v): v is string => v !== null && v !== undefined && v !== '');
  const isDate = (i: number) => { const v = filled(i); return v.length > 0 && v.every(x => DATE_TEXT.test(x)); };
  const isNumber = (i: number) => { const v = filled(i); return v.length > 0 && v.every(x => NUMBER_TEXT.test(x.trim())); };
  const names = columns.map((_, i) => i).filter(i => !isNumber(i) || isDate(i));
  const date = names.find(isDate);
  if (date === undefined) return { columns, rows };
  const order = [date, ...columns.map((_, i) => i).filter(i => i !== date)];
  const moved = rows.map(r => order.map(i => r[i] ?? null));
  const sorted = moved.map((r, i) => ({ r, i })).sort((a, b) =>
    String(a.r[0] ?? '').localeCompare(String(b.r[0] ?? '')) || a.i - b.i).map(x => x.r);
  return { columns: order.map(i => columns[i]), rows: sorted };
}

/**
 * The rows as a view: the same reading a saved query's tile makes, with the answer's additivity where it knows -- and,
 * where the rows have two columns of names, the console's one-series kinds marked as not drawing them (they would add
 * every group into one line or one bar per name, which is a different question).
 */
export function answerView(answer: ChartAnswer): WidgetView {
  const { columns, rows } = chartRows(answer.columns, answer.rows);
  const view = queryView({ columns, rows, rowCount: answer.rowCount, truncated: answer.truncated }, answer.chart?.additive ?? null);
  const dims = view.chart?.dims ?? [];
  if (dims.length < 2) return view;
  const issues = { ...view.issues };
  const named = dims.slice(0, 2).map(d => `"${d.name}"`).join(' and ');
  for (const kind of ONE_SERIES) {
    const id = kind as WidgetVisualization;
    if (!issues[id]) issues[id] = `This draws one series, and these rows have two columns of names (${named}).`;
  }
  return { ...view, issues };
}

const article = (label: string) => (/^[aeiou]/i.test(label) ? 'An' : 'A');

/**
 * The kind to draw: the one asked for when it fits these rows, else the best that does -- the Show-as menu's first
 * suggestion -- with the reason in a sentence. A kind the console does not know is treated like one that does not fit.
 */
export function fitKind(view: WidgetView, asked: string | null | undefined): Fitted {
  const wanted = asked && kindInfo(asked) ? asked as WidgetVisualization : null;
  const why = wanted ? (view.issues[wanted] ?? '') : 'unknown';
  if (wanted && !why) return { kind: wanted, asked: wanted, fellBack: false, reason: '' };
  const twins = (wanted && PER_GROUP[wanted]) || [];
  const best = twins.find(k => !view.issues[k]) ?? suggestedKinds(view, '', 1)[0] ?? 'table';
  const bestLabel = kindInfo(best)?.label ?? 'Table';
  const askedLabel = wanted ? kindInfo(wanted)!.label : asked ? `"${asked}"` : '';
  const reason = !asked ? `Shown as ${bestLabel.toLowerCase()}, which suits these rows.`
    : !wanted ? `The chart asked for (${askedLabel}) is not one this console draws. Shown as ${bestLabel.toLowerCase()} instead.`
    : `${article(askedLabel)} ${askedLabel.toLowerCase()} was asked for, but ${lowerFirst(why).replace(/\.$/, '')}. `
      + `Shown as ${bestLabel.toLowerCase()} instead, which fits these rows.`;
  return { kind: best, asked: asked ?? null, fellBack: true, reason };
}

/** The chart's settings as the panel stores them, from the answer's: title, axis names, stacking, sort, top N. */
export function answerSettings(chart: AnswerChart | null | undefined): ChartSettings {
  if (!chart) return {};
  const settings: ChartSettings = {};
  if (chart.title?.trim()) settings.title = { text: chart.title.trim().slice(0, 120) };
  if (chart.xAxis?.trim()) settings.xAxis = { name: chart.xAxis.trim().slice(0, 60) };
  if (chart.yAxis?.trim()) settings.yAxis = { name: chart.yAxis.trim().slice(0, 60) };
  if (chart.stack === 'stack' || chart.stack === 'percent') settings.bar = { stack: chart.stack };
  if (chart.sort === 'asc' || chart.sort === 'desc') settings.sort = chart.sort;
  if (chart.topN && chart.topN > 0 && chart.topN <= 500) settings.topN = Math.floor(chart.topN);
  return settings;
}

/** What analyticsWorkspace.json/pinChart takes (MIG-357). */
export interface PinChartRequest {
  analyticsDashboardId?: number | null;
  dashboardName?: string | null;
  widgetTitle: string;
  queryName?: string | null;
  connectionAlias: string;
  datasetPath: string;
  queryText: string;
  visualizationType: string;
  widgetConfig: string | null;
}

/** The pin for an answer drawn as `kind` with `settings`: the board chosen, or a new one by name. */
export function pinRequest(answer: ChartAnswer, kind: string, settings: ChartSettings, title: string,
    board: { id: number } | { name: string }): PinChartRequest {
  const config: WidgetConfig = { chart: settings };
  if (answer.chart?.caption?.trim()) config.caption = answer.chart.caption.trim().slice(0, 300);
  if (typeof answer.chart?.additive === 'boolean') config.additive = answer.chart.additive;
  return {
    analyticsDashboardId: 'id' in board ? board.id : null,
    dashboardName: 'name' in board ? board.name.trim() : null,
    widgetTitle: title.trim().slice(0, 255),
    connectionAlias: answer.dataset.connection,
    datasetPath: answer.dataset.path,
    queryText: answer.sql,
    visualizationType: kind,
    widgetConfig: widgetConfigString(config),
  };
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

// ---- Visualise: suggestions from the shape alone, no AI -----------------------------------------------------------

/** A column as the schema names it. */
export interface ShapeColumn { name: string; type: string }

/** A chart suggested for a dataset from its columns' types: a title, the query, and the kind it suits. */
export interface Suggestion { id: string; title: string; sql: string; kind: WidgetVisualization }

const NUMBER = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|REAL|DOUBLE|DECIMAL.*|NUMERIC.*)$/i;
const DATE = /^(DATE|TIMESTAMP.*|TIMESTAMPTZ)$/i;
const TEXT = /^(VARCHAR.*|TEXT|STRING|CHAR.*|BOOLEAN|BOOL|ENUM.*)$/i;
/** A column that names a person or a record rather than a group: never grouped by in a suggestion. */
const IDENTIFYING = /(^|_|\b)(id|uuid|name|first|last|surname|email|phone|mobile|ssn|mrn|address|street|zip|postcode|dob|birth|note|notes|comment|description|text)(_|\b|$)/i;
/** The most rows a Visualise suggestion asks for: a chart reads 50 bars, not 5,000 (the engine bounds it again). */
export const SUGGESTION_ROWS = 50;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const words = (name: string) => name.replace(/[_-]+/g, ' ').trim();

/**
 * Up to `max` charts for a dataset from its column types alone -- no AI, no data read: counts and totals by a grouping
 * column, a trend by month over a date column, two figures against each other. Columns that identify a person or a
 * record (names, ids, contact details, notes) are never grouped by, so a suggestion is never a chart of patients.
 */
export function suggestCharts(columns: readonly ShapeColumn[], max = 4): Suggestion[] {
  const numbers = columns.filter(c => NUMBER.test(c.type.trim()) && !/(^|_)(id|year)$/i.test(c.name));
  const dates = columns.filter(c => DATE.test(c.type.trim()));
  const groups = columns.filter(c => TEXT.test(c.type.trim()) && !IDENTIFYING.test(c.name));
  const out: Suggestion[] = [];
  const add = (s: Suggestion) => { if (out.length < max && !out.some(o => o.sql === s.sql)) out.push(s); };
  const date = dates[0];
  const figure = numbers[0];
  const group = groups[0];
  if (date) {
    const month = `date_trunc('month', CAST(${quote(date.name)} AS DATE))`;
    add({ id: 'trend', title: figure ? `${words(figure.name)} by month` : `Rows by month`, kind: 'line',
      sql: `SELECT ${month} AS month, ${figure ? `sum(${quote(figure.name)})` : 'count(*)'} AS ${figure ? 'total' : 'n'} FROM dataset `
        + `WHERE ${quote(date.name)} IS NOT NULL GROUP BY 1 ORDER BY 1 LIMIT ${SUGGESTION_ROWS * 4}` });
  }
  if (group) {
    add({ id: 'count', title: `Rows by ${words(group.name)}`, kind: 'ranked',
      sql: `SELECT ${quote(group.name)}, count(*) AS n FROM dataset GROUP BY 1 ORDER BY n DESC LIMIT ${SUGGESTION_ROWS}` });
    if (figure) {
      add({ id: 'total', title: `${words(figure.name)} by ${words(group.name)}`, kind: 'ranked',
        sql: `SELECT ${quote(group.name)}, sum(${quote(figure.name)}) AS total FROM dataset GROUP BY 1 ORDER BY total DESC LIMIT ${SUGGESTION_ROWS}` });
    }
    if (date && groups.length) {
      const month = `date_trunc('month', CAST(${quote(date.name)} AS DATE))`;
      add({ id: 'series', title: `Rows by month and ${words(group.name)}`, kind: 'lineSmooth',
        sql: `SELECT ${month} AS month, ${quote(group.name)}, count(*) AS n FROM dataset WHERE ${quote(date.name)} IS NOT NULL `
          + `GROUP BY 1, 2 ORDER BY 1, 2 LIMIT ${SUGGESTION_ROWS * 8}` });
    }
  }
  if (groups.length > 1) {
    add({ id: 'cross', title: `${words(groups[0].name)} by ${words(groups[1].name)}`, kind: 'heatmap',
      sql: `SELECT ${quote(groups[0].name)}, ${quote(groups[1].name)}, count(*) AS n FROM dataset GROUP BY 1, 2 ORDER BY n DESC LIMIT ${SUGGESTION_ROWS * 4}` });
  }
  if (numbers.length > 1) {
    add({ id: 'pair', title: `${words(numbers[0].name)} against ${words(numbers[1].name)}`, kind: 'scatter',
      sql: `SELECT ${quote(numbers[0].name)}, ${quote(numbers[1].name)} FROM dataset WHERE ${quote(numbers[0].name)} IS NOT NULL `
        + `AND ${quote(numbers[1].name)} IS NOT NULL LIMIT 500` });
  }
  if (figure && !group && !date) {
    add({ id: 'spread', title: `Spread of ${words(figure.name)}`, kind: 'histogram',
      sql: `SELECT ${quote(figure.name)} FROM dataset WHERE ${quote(figure.name)} IS NOT NULL LIMIT 1000` });
  }
  if (!out.length) {
    add({ id: 'rows', title: 'Row count', kind: 'kpi', sql: 'SELECT count(*) AS n FROM dataset' });
  }
  return out;
}

/** A suggestion's rows as a chart answer -- its chart marked as the shape's, not a model's. */
export function suggestionAnswer(s: Suggestion, dataset: ChartAnswer['dataset'],
    result: { columns: string[]; rows: (string | null)[][]; rowCount: number; truncated: boolean }): ChartAnswer {
  const counts = /\b(count|sum)\(/i.test(s.sql);
  return {
    sql: s.sql, dataset, columns: result.columns, rows: result.rows, rowCount: result.rowCount, truncated: result.truncated,
    chart: { kind: s.kind, title: s.title, caption: `${s.title} in ${dataset.name}.`, additive: counts ? true : null, source: 'shape' },
  };
}

/**
 * A table already in hand (a run's kept file, read as JSON) as a chart answer: no query, nothing to pin, the kind the
 * Show-as suggestions rank first for its shape.
 */
export function tableAnswer(name: string, columns: string[], rows: (string | null)[][], truncated: boolean): ChartAnswer {
  return {
    sql: '', dataset: { name, connection: '', path: '' }, columns, rows, rowCount: rows.length, truncated,
    chart: { kind: '', title: name, caption: '', additive: null, source: 'shape' },
  };
}
