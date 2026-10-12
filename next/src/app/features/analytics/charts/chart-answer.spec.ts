import { describe, expect, it } from 'vitest';
import { KIND_IDS } from '../widget-kinds';
import { widgetConfigOf } from '../widget-view';
import {
  ANSWER_KINDS, ChartAnswer, answerSettings, answerView, chartRows, chartSql, fitKind, pinRequest, suggestCharts, suggestionAnswer, tableAnswer,
} from './chart-answer';

/**
 * MIG-357, "AI chooses, console draws": the chart answer's pure readings -- the kinds the server may name, the fit rules
 * overruling a kind that cannot draw the rows (with the reason), the model's settings as the panel's, the pin request,
 * masked values drawn as they came, and Visualise's suggestions from the shape alone.
 */

/** ai-service's AskChart.KINDS, verbatim: the schema the model is held to. Change both, or neither. */
const SERVER_KINDS = [
  'kpi', 'table', 'pivot', 'comparison',
  'ranked', 'rankedShare', 'bar', 'stacked', 'shareStacked', 'groupedBar', 'barH', 'waterfall', 'pareto', 'barLine', 'polarBar',
  'pictorialBar',
  'line', 'area', 'cumulative', 'lineSmooth', 'lineStep', 'lineMarkers', 'areaStacked', 'areaShare',
  'donut', 'rose', 'halfDonut', 'nestedPie',
  'scatter', 'scatterTrend', 'bubble', 'effectScatter',
  'histogram', 'boxplot', 'density',
  'treemap', 'sunburst', 'tree',
  'sankey', 'chord',
  'heatmap', 'calendar',
  'funnel', 'gauge', 'radar', 'parallel', 'themeRiver', 'candlestick',
  'dimensionSummary', 'trendSummary', 'distributionSummary',
];

const DATASET = { datasetId: 1201, name: 'Encounters', connection: 'riverside-health-s3', path: 'datasets/encounters.csv' };

function answer(over: Partial<ChartAnswer> = {}, chart: Partial<NonNullable<ChartAnswer['chart']>> = {}): ChartAnswer {
  return {
    sql: 'SELECT age_band, avg(readmitted) AS rate FROM dataset GROUP BY age_band ORDER BY rate DESC\nLIMIT 200',
    dataset: DATASET,
    columns: ['age_band', 'rate'],
    rows: [['65+', '0.214'], ['40-64', '0.132'], ['18-39', '0.091']],
    rowCount: 3, truncated: false,
    chart: { kind: 'ranked', title: 'Readmission rate by age band', caption: 'Readmission rate for each age band.',
      xAxis: 'Age band', yAxis: 'Rate', stack: 'none', sort: 'desc', topN: 0, additive: false, source: 'model', ...chart },
    ...over,
  };
}

describe('chart answer -- the kinds', () => {
  it('names exactly the 51 kinds the picker offers, in its order, as the server\'s schema does', () => {
    expect(ANSWER_KINDS).toEqual(KIND_IDS);
    expect(ANSWER_KINDS.length).toBe(51);
    expect([...ANSWER_KINDS]).toEqual(SERVER_KINDS);
  });
});

describe('chart answer -- the fit rules have the last word', () => {
  it('draws the kind asked for when it fits the rows', () => {
    const fitted = fitKind(answerView(answer()), 'ranked');
    expect(fitted).toEqual({ kind: 'ranked', asked: 'ranked', fellBack: false, reason: '' });
  });

  it('falls back to the best fitting suggestion when the kind cannot draw the rows, and says why', () => {
    // A ring of rates: the figures do not add up, so there is no whole to share out.
    const fitted = fitKind(answerView(answer({}, { kind: 'donut' })), 'donut');
    expect(fitted.fellBack).toBe(true);
    expect(fitted.kind).not.toBe('donut');
    expect(answerView(answer()).issues[fitted.kind]).toBeFalsy();
    expect(fitted.reason).toMatch(/^A share of the total was asked for, but .*has no total to divide\. Shown as ranked bars instead/);
    expect(fitted.reason).toContain('instead, which fits these rows.');
  });

  it('lets a ring through when the query\'s figures add up', () => {
    const counts = answer({ sql: 'SELECT age_band, count(*) AS n FROM dataset GROUP BY 1', columns: ['age_band', 'n'],
      rows: [['65+', '41'], ['40-64', '33'], ['18-39', '20']] }, { kind: 'donut', additive: true });
    expect(fitKind(answerView(counts), 'donut')).toMatchObject({ kind: 'donut', fellBack: false });
  });

  it('treats a kind the console does not know like one that does not fit', () => {
    const fitted = fitKind(answerView(answer()), 'pie3d');
    expect(fitted.fellBack).toBe(true);
    expect(fitted.reason).toContain('"pie3d"');
  });

  it('a line over a month and a group is drawn as one line per group', () => {
    const monthly = answer({
      sql: 'SELECT month, category, sum(revenue) AS revenue FROM dataset GROUP BY 1, 2 ORDER BY 1, 2',
      columns: ['month', 'category', 'revenue'],
      rows: [['2024-01-01', 'Books', '120'], ['2024-01-01', 'Toys', '80'], ['2024-02-01', 'Books', '150'], ['2024-02-01', 'Toys', '95']],
      rowCount: 4,
    }, { kind: 'lineSmooth', additive: true });
    expect(fitKind(answerView(monthly), 'lineSmooth')).toMatchObject({ kind: 'lineSmooth', fellBack: false });
  });
});

describe('chart answer -- rows with two columns of names (revenue by category per month)', () => {
  // As qwen3:8b answered it live: category first, month second, newest month first.
  const monthly = answer({
    sql: 'SELECT "category", date_trunc(\'month\', CAST("order_date" AS DATE)) AS month, SUM("amount") AS total_revenue FROM dataset GROUP BY 1, 2 ORDER BY 2 DESC',
    columns: ['category', 'month', 'total_revenue'],
    rows: [['Sports', '2025-12-01', '273031.99'], ['Books', '2025-12-01', '35604.25'], ['Sports', '2025-11-01', '279117.07'], ['Books', '2025-11-01', '37047.28']],
    rowCount: 4,
  }, { kind: 'line', additive: true });

  it('puts the date first and in its own order, the figures untouched', () => {
    const { columns, rows } = chartRows(monthly.columns, monthly.rows);
    expect(columns).toEqual(['month', 'category', 'total_revenue']);
    expect(rows).toEqual([['2025-11-01', 'Sports', '279117.07'], ['2025-11-01', 'Books', '37047.28'],
      ['2025-12-01', 'Sports', '273031.99'], ['2025-12-01', 'Books', '35604.25']]);
    expect(chartRows(['region', 'n'], [['North', '3']])).toEqual({ columns: ['region', 'n'], rows: [['North', '3']], names: ['region'], changed: false });
  });

  it('pins the statement wrapped to return the rows the chart drew, the figures the same query\'s', () => {
    expect(chartSql(monthly)).toBe('SELECT "month", "category", "total_revenue"\nFROM (\n' + monthly.sql + '\n) AS answer\nORDER BY "month", "category"');
    expect(pinRequest(monthly, 'lineSmooth', {}, 'Revenue', { id: 1 }).queryText).toContain(') AS answer');
    expect(chartSql(answer())).toBe(answer().sql);
  });

  it('never draws a one-series kind over two columns of names: a line becomes a line per group', () => {
    const view = answerView(monthly);
    expect(view.issues.line).toContain('two columns of names ("month" and "category")');
    const fitted = fitKind(view, 'line');
    expect(fitted).toMatchObject({ kind: 'lineSmooth', fellBack: true });
    expect(fitted.reason).toContain('Shown as smooth line instead');
  });
});

describe('chart answer -- settings and the pin', () => {
  it('turns the model\'s settings into the panel\'s', () => {
    expect(answerSettings(answer().chart)).toEqual({ xAxis: { name: 'Age band' }, yAxis: { name: 'Rate' }, sort: 'desc' });
    expect(answerSettings(answer({}, { stack: 'percent', topN: 10, sort: 'none' }).chart)).toMatchObject({ bar: { stack: 'percent' }, topN: 10 });
    expect(answerSettings(null)).toEqual({});
  });

  it('pins the query that ran, the kind drawn and the settings, with the caption and whether the figures add up', () => {
    const a = answer();
    const pin = pinRequest(a, 'ranked', answerSettings(a.chart), '  Readmission rate by age band ', { id: 1450 });
    expect(pin).toMatchObject({
      analyticsDashboardId: 1450, dashboardName: null, widgetTitle: 'Readmission rate by age band',
      connectionAlias: 'riverside-health-s3', datasetPath: 'datasets/encounters.csv', queryText: a.sql, visualizationType: 'ranked',
    });
    const config = widgetConfigOf({ analyticsDashboardId: 1450, widgetTitle: 'x', widgetConfig: pin.widgetConfig });
    expect(config.caption).toBe('Readmission rate for each age band.');
    expect(config.additive).toBe(false);
    expect(config.chart?.sort).toBe('desc');
    expect(pinRequest(a, 'ranked', {}, 'T', { name: ' Readmissions ' })).toMatchObject({ analyticsDashboardId: null, dashboardName: 'Readmissions' });
  });
});

describe('chart answer -- masking', () => {
  it('draws masked values as Analytics masked them, in the marks a tooltip reads', () => {
    const masked = answer({ sql: 'SELECT patient_name, count(*) AS visits FROM dataset GROUP BY 1', columns: ['patient_name', 'visits'],
      rows: [['A**** O*****', '3'], ['M**** K****', '2']], rowCount: 2 }, { kind: 'ranked', additive: true });
    const view = answerView(masked);
    expect(view.marks.map(m => m.name)).toEqual(['A**** O*****', 'M**** K****']);
    expect(JSON.stringify(view)).not.toMatch(/Okafor|Kim/);
    expect(view.chart?.dims[0].values).toEqual(['A**** O*****', 'M**** K****']);
  });
});

describe('Visualise -- suggestions from the shape, no AI', () => {
  const ENCOUNTERS = [
    { name: 'patient_name', type: 'VARCHAR' }, { name: 'mrn', type: 'VARCHAR' }, { name: 'age_band', type: 'VARCHAR' },
    { name: 'department', type: 'VARCHAR' }, { name: 'admitted_at', type: 'TIMESTAMP' }, { name: 'stay_days', type: 'DOUBLE' },
    { name: 'charges', type: 'DECIMAL(12,2)' }, { name: 'encounter_id', type: 'BIGINT' },
  ];

  it('suggests a trend, counts and totals by a group, and never groups by a column that identifies a person', () => {
    const suggestions = suggestCharts(ENCOUNTERS);
    expect(suggestions.length).toBe(4);
    expect(suggestions.map(s => s.id)).toEqual(['trend', 'count', 'total', 'series']);
    expect(suggestions[0]).toMatchObject({ kind: 'line', title: 'Total stay days by month' });
    expect(suggestions[2]).toMatchObject({ title: 'Total stay days by age band' });
    expect(suggestCharts([{ name: 'gender', type: 'VARCHAR' }, { name: 'age', type: 'BIGINT' }])[1])
      .toMatchObject({ title: 'Average age by gender', kind: 'bar' });
    expect(suggestions[0].sql).toContain(`date_trunc('month', CAST("admitted_at" AS DATE))`);
    expect(suggestions[1].sql).toBe('SELECT "age_band", count(*) AS n FROM dataset GROUP BY 1 ORDER BY n DESC LIMIT 50');
    for (const s of suggestions) {
      expect(s.sql).not.toMatch(/patient_name|mrn|encounter_id/);
      expect(s.sql).toMatch(/LIMIT \d+$/);
    }
  });

  it('pairs two figures, spreads a lone one, and counts rows when nothing else fits', () => {
    expect(suggestCharts([{ name: 'height', type: 'DOUBLE' }, { name: 'weight', type: 'DOUBLE' }]).map(s => s.kind)).toEqual(['scatter', 'histogram']);
    expect(suggestCharts([{ name: 'amount', type: 'DOUBLE' }]).map(s => s.kind)).toEqual(['histogram']);
    expect(suggestCharts([{ name: 'notes', type: 'VARCHAR' }])).toEqual([
      { id: 'rows', title: 'Row count', kind: 'kpi', sql: 'SELECT count(*) AS n FROM dataset' }]);
  });

  it('makes a suggestion\'s rows a chart answer marked as the shape\'s, and a table in hand one with nothing to pin', () => {
    const s = suggestCharts(ENCOUNTERS)[1];
    const a = suggestionAnswer(s, DATASET, { columns: ['age_band', 'n'], rows: [['65+', '41']], rowCount: 1, truncated: false });
    expect(a.chart).toMatchObject({ kind: 'ranked', source: 'shape', additive: true });
    const held = tableAnswer('readmission-statistics.csv', ['level', 'readmit30_pct'], [['65+', '21.4']], false);
    expect(held.sql).toBe('');
    expect(fitKind(answerView(held), held.chart!.kind).fellBack).toBe(true);
  });
});
