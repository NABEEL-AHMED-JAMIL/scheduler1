import type { EChartKind } from '../analytics.service';
import { CHART_SLOTS } from '../../../shared/charts/status-color';
import { ChartTable, dayKey, distinct, figures, primary, quantities } from './chart-table';

/**
 * Why each ECharts kind cannot draw a result, or '' when it can.
 *
 * The same contract issuesFor keeps for the SVG kinds in dashboard.ts, and the same discipline:
 * a kind that cannot honestly draw these rows stays in the picker, inert, with the reason -- a
 * fact about the reader's own data, worth more than the option silently not being there.
 *
 * The three refusals that recur are the ones the older kinds already make, worded the same way:
 *   - a kind that claims its parts make a whole needs figures that add up (a count or a sum);
 *     a saved statement cannot say whether its figures do, so it is refused there too;
 *   - a kind that joins points along an axis needs them in the dimension's own order;
 *   - a length or an area measured up from zero cannot show a negative.
 *
 * @author Nabeel Ahmed
 */

/**
 * The most categories a kind draws before the rest are added into "Other" -- where the figures
 * add up, so the tail has a total to stand for it. Past this a kind whose figures do not add up
 * is refused instead (chart-fit.ts, with the same numbers): a tail of averages has no sum.
 */
export const CATEGORY_LIMIT: Partial<Record<EChartKind, number>> = {
  rose: 16, halfDonut: CHART_SLOTS,
  // The funnel draws its largest 12 and says so, rather than adding a tail that is not a stage.
  funnel: 12, pareto: 60, waterfall: 60, polarBar: 36, pictorialBar: 24,
};

/** How many series a line or an area can carry before its colours repeat. */
export const MAX_SERIES = CHART_SLOTS;

function adds(table: ChartTable): string {
  if (table.additive === true) return '';
  return table.additive === 'unknown'
    ? 'it adds parts into a whole, and a saved query does not say whether its figures add up'
    : 'it adds parts into a whole, and this measure does not add up';
}

const NO_WHOLE = 'This is a Top-N with the rest discarded, so these rows are not the whole of '
  + 'anything. Turn the Other bucket on to show a share.';

/** Everything below is phrased "This chart …" so a reason reads on its own in a tooltip. */
export function fitIssues(table: ChartTable): Record<EChartKind, string> {
  const n = table.length;
  const d = table.dims.length;
  const values = figures(table);
  const negative = values.filter(value => value < 0).length;
  const nonPositive = values.filter(value => value <= 0).length;
  const empty = n ? '' : table.emptyReason;
  const totalling = adds(table);
  const whole = (needs: string): string =>
    totalling ? `${needs} — ${totalling}.` : table.topNTrimmed ? NO_WHOLE : '';
  const noNegative = (what: string) => negative
    ? `${negative} of these figures ${negative === 1 ? 'is' : 'are'} below zero, and ${what}.` : '';
  const noNonPositive = (what: string) => nonPositive
    ? `${nonPositive} of these figures ${nonPositive === 1 ? 'is' : 'are'} zero or below, and ${what}.` : '';

  const oneDim = d === 0 ? 'This needs a column to name the rows by.'
    : d > 1 ? 'This draws one column of names, and this result has ' + d + '. Drop a dimension or use a stack.' : '';
  const ordered = table.order === 'rank'
    ? 'These are ordered biggest-first, so joining them would draw the sort rather than a trend. Sort by the dimension.'
    : table.order === 'reversed'
      ? 'These are ordered newest-first, so a line would run backwards. Sort the dimension ascending.' : '';

  // Series for the line family: a second dimension, or several measures over one.
  const seriesCount = d === 2 ? distinct(table.dims[1].values).length : d === 1 ? table.measures.length : 0;
  const lineIssue = empty || (d === 0 ? 'A line needs a column to run along.'
    : d > 2 ? 'Three dimensions would interleave several series; drop one.'
    : ordered || (seriesCount > MAX_SERIES
      ? `${seriesCount} series is past the ${MAX_SERIES} colours this palette can tell apart.`
      : n < 2 ? 'A line needs at least two points.' : ''));
  const stackedSeries = d === 2 || table.measures.length > 1;
  const areaStack = lineIssue
    || (!stackedSeries ? 'A stacked area needs series to stack: a second column, or a second number.' : '')
    || whole('A stack') || noNegative('a stack cannot show one');

  const nums = quantities(table);
  const scatterIssue = (need: number) => empty || (nums.length < need
    ? `This puts ${need === 2 ? 'two' : 'three'} numbers against each other, and this result has ${nums.length === 1 ? 'one' : nums.length || 'none'}.`
    : '');

  const groups = d === 2 ? distinct(table.dims[0].values) : [];
  const hierarchy = (min: number) => empty || (d < min
    ? `This needs ${min === 1 ? 'a column' : 'two columns or more'} of names to nest.`
    : d > 3 ? 'More than three levels cannot be read.' : '')
    || whole('A part-of-a-whole chart') || noNonPositive('an area or a slice cannot be drawn for one');

  // Past a kind's limit the rest are added into "Other" (chart-options.ts, CATEGORY_LIMIT) where
  // the figures add up; where they do not, a tail has no sum to stand for it and the kind refuses.
  const rowsOfDim = (max: number, min = 1) => oneDim || (n < min
    ? `This needs at least ${min} rows.`
    : n > max && table.additive !== true
      ? `${n} rows is past the ${max} this chart can label, and the rest cannot be added into "Other" because ${totalling ? totalling.replace(/^it adds parts into a whole, and /, '') : 'these figures do not add up'}.`
      : '');

  const date = table.dims[0]?.date;
  // Years counted from the day each value falls on, through instantOf -- never by cutting the text.
  const years = date ? distinct(table.dims[0].values.map(value => (dayKey(value) ?? '').split('-')[0])).length : 0;
  const ohlc = ['open', 'high', 'low', 'close'].map(name =>
    table.measures.find(measure => measure.name.toLowerCase().includes(name)));

  return {
    barH: empty || (d === 0 ? 'Bars need a column of names.' : d > 2 ? 'Three dimensions are too many for one set of bars.'
      : d === 2 && seriesCount > MAX_SERIES ? `${seriesCount} series is past the ${MAX_SERIES} colours this palette can tell apart.` : ''),
    waterfall: empty || rowsOfDim(CATEGORY_LIMIT.waterfall!, 2) || whole('A waterfall'),
    pareto: empty || rowsOfDim(CATEGORY_LIMIT.pareto!, 2) || whole('A running share') || noNegative('a share of a total cannot include one'),
    barLine: empty || oneDim || (table.measures.length < 2
      ? 'Bars and a line need two numbers: one for the bars, one for the line.' : ''),
    polarBar: empty || rowsOfDim(CATEGORY_LIMIT.polarBar!, 3) || noNegative('a radial bar is measured out from the centre'),
    pictorialBar: empty || rowsOfDim(CATEGORY_LIMIT.pictorialBar!) || noNegative('a pictorial bar is measured up from zero'),
    lineSmooth: lineIssue,
    lineStep: lineIssue,
    lineMarkers: lineIssue,
    areaStacked: areaStack,
    areaShare: areaStack,
    rose: empty || rowsOfDim(CATEGORY_LIMIT.rose!, 2) || whole('A rose') || noNonPositive('a petal cannot be drawn for one'),
    halfDonut: empty || rowsOfDim(CATEGORY_LIMIT.halfDonut!, 2) || whole('A ring') || noNonPositive('a share of a total cannot include one'),
    nestedPie: empty || (d !== 2 ? 'A nested pie needs exactly two columns of names: the inner ring and the outer.'
      : groups.length > CHART_SLOTS ? `${groups.length} inner slices is past the ${CHART_SLOTS} colours this palette can tell apart.` : '')
      || whole('A pie') || noNonPositive('a slice cannot be drawn for one'),
    scatterTrend: scatterIssue(2) || (n < 3 ? 'A trend needs at least three points.' : ''),
    bubble: scatterIssue(3),
    effectScatter: scatterIssue(2),
    boxplot: empty || (d > 2 ? 'A box per group needs one column of groups, and this has three.' : '')
      || (d === 2 ? (groups.length > 40 ? `${groups.length} boxes is too many to compare.` : '')
        : n < 5 ? `A box needs five figures or more, and this has ${n}.` : ''),
    density: empty || (n < 8 ? `A density needs eight figures or more, and this has ${n}.`
      : new Set(values).size < 2 ? 'Every figure is the same one, so there is no shape.'
      : d === 2 && groups.length > MAX_SERIES ? `${groups.length} curves is past the ${MAX_SERIES} colours this palette can tell apart.` : ''),
    treemap: hierarchy(1),
    sunburst: hierarchy(2),
    tree: empty || (d < 2 ? 'A tree needs two columns of names or more.' : d > 3 ? 'More than three levels cannot be read.'
      : n > 400 ? `${n} leaves is past what a tree can label.` : ''),
    sankey: empty || (d < 2 ? 'A flow needs two columns of names: where it starts and where it goes.'
      : d > 3 ? 'More than three stages cannot be read.' : '')
      || whole('A flow') || noNonPositive('a flow cannot be drawn for one'),
    chord: empty || (d !== 2 ? 'A chord needs exactly two columns of names.' : '')
      || (distinct([...table.dims[0].values, ...table.dims[1].values]).length > 40 ? 'More than 40 names cannot be read around a circle.' : '')
      || whole('A chord') || noNonPositive('a ribbon cannot be drawn for one'),
    heatmap: empty || (d !== 2 ? 'A heatmap needs exactly two columns of names: one across, one down.'
      : distinct(table.dims[0].values).length > 100 || distinct(table.dims[1].values).length > 100
        ? 'One of these columns has more than 100 values, too many cells to read.' : ''),
    calendar: empty || (d !== 1 || !date ? 'A calendar needs exactly one column, and that a date.'
      : years > 3 ? `These dates span ${years} years; a calendar reads up to three.` : n < 2 ? 'A calendar needs at least two days.' : ''),
    funnel: empty || rowsOfDim(Number.MAX_SAFE_INTEGER, 2) || noNegative('a funnel stage cannot be narrower than nothing'),
    gauge: n === 1 && table.measures.length ? '' : empty
      || `A gauge shows one figure, and this returned ${n} rows.`,
    radar: empty || (table.measures.length >= 3
      ? (n > MAX_SERIES ? `${n} rows is past the ${MAX_SERIES} shapes a radar can tell apart.` : '')
      : d === 2
        ? (groups.length > MAX_SERIES ? `${groups.length} shapes is past the ${MAX_SERIES} colours this palette can tell apart.`
          : distinct(table.dims[1].values).length < 3 ? 'A radar needs three spokes or more.' : '')
        : 'A radar needs three numbers or more, or two columns of names (shapes and spokes).'),
    parallel: empty || (d + table.measures.length < 3 ? 'Parallel axes need three columns or more.' : ''),
    themeRiver: empty || (d !== 2 || !date ? 'A theme river needs two columns: a date, then a group.' : '')
      || whole('A river') || noNegative('a river cannot run below its bed'),
    candlestick: empty || (d !== 1 ? 'A candlestick needs one column to run along.' : '')
      || (ohlc.some(found => !found) ? 'A candlestick needs four number columns named open, high, low and close.' : '')
      || ordered,
  };
}

/** The measure a gauge draws, and its target when the row carries a second number. */
export function gaugeFigures(table: ChartTable): { value: number; target: number | null } {
  const value = figures(table)[0] ?? 0;
  const second = table.measures.length > 1 ? table.measures[0].values[0] : null;
  return { value, target: second ?? null };
}

/** Whether a primary measure exists at all; exported for the picker's empty state. */
export function hasFigures(table: ChartTable): boolean {
  return !!primary(table) && table.length > 0;
}
