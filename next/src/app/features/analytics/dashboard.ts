import { Component, LOCALE_ID, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { confirmWith } from '../../shared/ui/confirm';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { StatTile } from '../../shared/ui/stat-tile';
import { CHART_SLOTS } from '../../shared/charts/status-color';
import { WidgetTableDialog, WidgetTableData } from './widget-table';
import { KINDS } from './widget-kinds';
import { AnalyticsWidget, WidgetState as TileState } from './analytics-widget';
import { WidgetChart, WIDGET_HEIGHT, WIDGET_HEIGHT_MAX, WIDGET_HEIGHT_MIN, WIDGET_ROWS } from './widget-chart';
import {
  FilterBuilder, asFilterGroup, countFilterClauses, describeClause, emptyFilterGroup,
  isNumericType, pruneFilters,
} from './filter-builder';
import {
  Aggregation, AnalysisColumn, AnalysisRequest, AnalysisResult, AnalysisSort, AnalyticsService,
  Dashboard, DashboardWidget, DatasetColumn, FilterGroup, FilterNode, Grain, PivotGrid,
  QueryResult,
  RegisteredDataset,
  SavedAnalysis,
  SavedQuery, TopN, WidgetVisualization,
} from './analytics.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';

/**
 * One mark on a chart.
 *
 * One type for all three categorical charts because all three already agree on it: Bar, Slice
 * and RankedItem each read `name` and `value` and nothing else that a widget sets. A shape per
 * chart would be three conversions of the same two fields, and the first divergence between them
 * would be a tile whose ring and whose bars disagree about a total.
 */
/**
 * One dimension's RAW value behind a mark, with the column it came from.
 *
 * Raw and not rendered. `name` on a Mark is what the tile DRAWS -- dates shortened, decimals
 * trimmed, several dimensions joined with a middle dot -- and none of that is a filter operand.
 * "2024-03-01" drawn from a TIMESTAMP is not the string the column holds, and "north · retail"
 * is not any column's value at all.
 */
export interface MarkOperand { field: string; value: string | null; }

/**
 * A drawable figure and, when it can be, the row it identifies.
 *
 * `operands` is absent whenever this mark does NOT identify exactly one group -- see markOperands
 * and mergeMarks for the three ways that happens. Absent means "cannot be narrowed on", and the
 * board reads it that way rather than guessing.
 */
export interface Mark {
  name: string;
  value: number;
  operands?: MarkOperand[];
  /**
   * The same fact as "operands is absent", under the name the CHARTS read.
   *
   * Two names for one thing, and the alternative was worse: RankedBar and BarChart are shared
   * components used by the object browser and the reports screen, and teaching them what a filter
   * operand is to disable one row would couple them to the analytics filter model. So they get a
   * plain boolean, and it is set in ONE statement -- at the end of mergeMarks, where operands are
   * finally settled -- rather than at each of the places that decide to withhold them.
   */
  inert?: boolean;
}


/**
 * The half of a tile that is about presentation rather than about which question it asks.
 *
 * Carried in the widget's existing `widget_config` TEXT column, which the schema, the POJO and
 * this client already round-trip on every edit and which nothing had ever written a byte into.
 * The V34 column comment nominates it for exactly this -- a finer layout "belongs in
 * widget_config until something server-side needs to read it" -- and nothing server-side reads
 * a height or a caption, so no migration and no backend change is involved.
 */
interface WidgetConfig {
  /** Drawing height in px for the chart kinds that take one. Absent means WIDGET_HEIGHT. */
  height?: number;
  /** A sentence the author writes under the tile. Absent means none; it is never invented. */
  caption?: string;
}

/**
 * The bounds a typed height is held to.
 *
 * The hard floor is lower than this: BarChart reserves 32px for a value line and a label and
 * then floors its track at 18 (bar-chart.ts), so below about 50 the bars stop shrinking while
 * the container keeps shrinking and the overflow escapes upward over the chart-kind select. 120
 * is the practical floor -- the histogram's own default -- and leaves a drawing that can still
 * be read. The ceiling is a screenful: past this a single tile pushes every other tile off the
 * board, which is a worse outcome than a slightly cramped chart.
 */

/**
 * Reads a tile's presentation settings.
 *
 * Total: a widget written before this existed, a null, an empty string, a half-written value
 * and a JSON document of some entirely different shape all mean "no settings", because a tile
 * that throws while being drawn takes the whole board with it.
 */
function widgetConfigOf(widget: DashboardWidget): WidgetConfig {
  if (!widget.widgetConfig) return {};
  try {
    const parsed = JSON.parse(widget.widgetConfig);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as WidgetConfig : {};
  } catch {
    return {};
  }
}

/** Serialises settings back, or null when there is nothing to keep -- never the string '{}'. */
function widgetConfigString(config: WidgetConfig): string | null {
  const kept: WidgetConfig = {};
  if (config.height && config.height !== WIDGET_HEIGHT) kept.height = config.height;
  if (config.caption && config.caption.trim()) kept.caption = config.caption.trim();
  return Object.keys(kept).length ? JSON.stringify(kept) : null;
}

/**
 * Six slices, sixty bars.
 *
 * The same two limits the Canvas keeps and for the same reasons, which are facts about the
 * palette and the label width rather than about a dashboard: Donut and RankedBar colour their
 * marks from the categorical ramp, so a slice past the last slot repeats the first one's colour
 * and the legend then has two names against one swatch. The limit therefore IS the slot count --
 * CHART_SLOTS -- rather than a number copied beside it that can fall out of step with the
 * palette. Sixty bars is where a name under a bar stops fitting.
 */
const DONUT_SLICES = CHART_SLOTS;
const ORDERED_BARS = 60;

/**
 * Aggregations whose parts add up to their whole.
 *
 * The list that decides whether a ring is allowed on a tile. A sum of sums is the sum; a sum of
 * averages is nothing at all, so a slice labelled "12%" over a column of averages is a figure
 * this screen would have invented. Identical to the Canvas's ADDITIVE and deliberately so --
 * MINIMUM and MAXIMUM are excluded from both even though they compose, because the minimum of
 * the minimums is a real figure that is still not a PART of anything.
 */
const ADDITIVE: Aggregation[] = ['COUNT_ROWS', 'COUNT_NON_NULL', 'SUM'];

/** A DATE column, and not a TIMESTAMP: only one of the two has no time to lose. */
const DATE_ONLY_TYPE = /^DATE$/i;

/**
 * A statistic as a number, or null when it is not one.
 *
 * Every cell crosses the wire as text, so "does this parse" is the only honest test of whether
 * arithmetic applies to it. A failure is not an error -- it is how a date column says it has no
 * length to draw.
 */
function asNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = String(text).trim();
  // Number('') is 0, which would turn an absent value into a measured zero.
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Scientific notation expanded back into a decimal, on the string and never through a float.
 *
 * <b>This is a SECOND COPY of analytics.ts's plainDecimal, and the copy is deliberate.</b> The
 * rule cannot be imported from there: the next pass reaches these components from the Studio's
 * own tab strip, which makes analytics.ts import this file, and importing back would close a
 * cycle between two component modules. It cannot move to a shared file either without editing
 * analytics.ts, which this pass does not own.
 *
 * A duplicated rule is exactly the drift this codebase warns about, so the duplication is pinned:
 * dashboard.spec.ts imports BOTH copies and asserts they agree on the same inputs, including the
 * measured defect this exists for -- `sum(amount)` returning "7.466125E7" for 74,661,250, which
 * a reader glancing at a tile reads as seven point something. When either copy is next touched,
 * the pair belongs in a shared file.
 */
export function plainDecimal(text: string): string {
  const trimmed = text.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(trimmed);
  if (!match) return text;
  const [, sign, whole, fraction = '', exponentText] = match;
  const exponent = Number(exponentText);
  const digits = whole + fraction;
  const point = whole.length + exponent;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A DATE rendered as a date. The second copy of analytics.ts's dateOnly -- see plainDecimal.
 *
 * The zero time is required for the trim. A value carrying a real time under a column typed DATE
 * is a contradiction between the type and the value, and a contradiction should be shown rather
 * than tidied away.
 */
export function dateOnly(text: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ]00:00(?::00(?:\.0+)?)?$/.exec(text.trim());
  return match ? match[1] : text;
}

/** One cell of an analysis result, rendered as what its column says it is. */
function renderCell(column: AnalysisColumn | undefined, raw: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  if (!column) return raw;
  if (DATE_ONLY_TYPE.test(column.type ?? '')) return dateOnly(raw);
  if (isNumericType(column.type)) return plainDecimal(raw);
  return raw;
}

/**
 * Marks with duplicate labels added together, and a count of how many rows that swallowed.
 *
 * Not a tidy-up. RankedBar tracks its rows by name and Donut tracks its segments by name, so two
 * marks called "north" is a duplicate-key error rather than a chart. Merging is the only way to
 * draw them, and adding is the only merge that makes sense for the counts and totals a grouped
 * result carries -- but it is WRONG for an average, and only the reader knows which they saved.
 * So the count comes back and the tile says so whenever it is not zero.
 */
function mergeMarks(pairs: Mark[]): { marks: Mark[]; merged: number } {
  const byName = new Map<string, Mark>();
  for (const pair of pairs) {
    const existing = byName.get(pair.name);
    if (existing) {
      existing.value += pair.value;
      // A merged mark no longer identifies one group, so it cannot be narrowed on. Two rows drew
      // the same label because their raw values RENDER the same -- two timestamps in one day,
      // "1.0" and "1.00" -- and filtering on either would return a figure that is not the one on
      // screen. Dropped rather than picked between: see MarkOperand.
      delete existing.operands;
    } else {
      byName.set(pair.name, pair.operands
        ? { name: pair.name, value: pair.value, operands: pair.operands }
        : { name: pair.name, value: pair.value });
    }
  }
  // Insertion order is the result's own order, which is what "bars in order" is for: a saved
  // analysis sorted by month has already said how its categories should read.
  //
  // `inert` is stamped here and nowhere else -- see Mark.inert. This is the last point at which
  // operands can be withheld, so it is the only point at which "withheld" is settled.
  //
  // Only when SOMETHING here can be narrowed, which is what the word means: "this row alone does
  // not respond, on a chart where the others do". Where nothing can -- a grained result, or a
  // saved statement's result, which has no operands anywhere by construction -- the chart is
  // un-buttoned whole and a per-row flag would say nothing.
  const found = [...byName.values()];
  const anyNarrowable = found.some(mark => !!mark.operands?.length);
  const marks = anyNarrowable
    ? found.map(mark => mark.operands?.length ? mark : { ...mark, inert: true })
    : found;
  return { marks, merged: pairs.length - byName.size };
}

/**
 * What one tile is showing, built ONCE when its result lands.
 *
 * Pre-rendered rather than computed in the template, because a template that formatted its own
 * cells would re-render every one of them on every change-detection pass -- and a board is many
 * tiles deep. It also means the notes, the marks and the rows are all derived from the same
 * response at the same instant, so nothing on a tile can be a note about a result that has since
 * been replaced.
 *
 * THERE IS NO PATH FROM HERE BACK TO THE SERVER. A view is thrown away and rebuilt on the next
 * run; it is never saved, and nothing about it is written to the widget row.
 */
export interface WidgetView {
  columns: string[];
  /**
   * Whether the measure has a total worth dividing.
   *
   * Carried on the view rather than re-derived, because two things need it -- the ring's refusal
   * and the dimension summary's top-share fact -- and a second derivation is a second chance to
   * disagree about whether an average adds up.
   */
  additive: boolean;
  /**
   * Which columns hold a MEASURE, index-aligned with `columns`.
   *
   * Carried because the table formats its cells and a dimension must not be formatted. readable()
   * groups an integer -- 250000 into 250,000, which is the whole point of it over a money column
   * -- and applied to a dimension it rewrote the data: a year column grouped by `order_year`
   * printed 2,024 in the table while the chart beside it, which never touches readableCell,
   * printed 2024. The same pass zero-strips a padded code held as text, so a store "007" read 7.
   *
   * All true on the saved-query path, where the server sends no roles at all and a numeric column
   * is as likely to be a figure as a label. That is the behaviour that path already had.
   */
  measureColumn: boolean[];
  /**
   * Whether a Top-N discarded its tail, so these rows are not the whole of anything.
   *
   * On the VIEW as well as on the shape because the template needs it: the dimension summary is
   * still worth drawing -- the group count and the spread are true -- but its top-share fact is
   * not, and ResultSummary already takes an `additive` input that governs exactly that fact.
   */
  topNTrimmed: boolean;
  /**
   * The two-dimension result already shaped as a grid, composed server-side.
   *
   * Carried rather than recomposed. The server builds this for EVERY two-dimension analysis --
   * keyed on the roll-up row indices so a real "Other" category and the Top-N bucket cannot
   * collide -- and the dashboard read it zero times, so a cross-tab could only be shown as the
   * long form: one row per (region, category) pair, which is the shape the grid exists to spare
   * a reader. Null whenever the server sent none, which is its way of saying this result is not
   * two-dimensional.
   */
  pivot: PivotGrid | null;
  /**
   * EVERY row the run returned, not the handful the tile draws -- tileRows() makes that cut.
   * A null cell is a real null, not an empty string.
   */
  rows: (string | null)[][];
  /** Rows in the WHOLE result. `rows.length` is what fitted on the tile. */
  rowCount: number;
  /** True when the result stopped at the server's row ceiling -- a partial answer. */
  truncated: boolean;
  marks: Mark[];
  /** Everything the figures on this tile cannot say about themselves. */
  notes: string[];
  /** Why each kind cannot draw THIS result, or '' when it can. */
  issues: Record<WidgetVisualization, string>;
  /** When this ran, so no figure on a board is on screen without a time against it. */
  ranAt: number;
}

/**
 * What a chart of these marks leaves out at the bottom, or null.
 *
 * RankedBar DROPS a row whose value is not above zero -- `data().filter(d => d.value > 0)` -- and
 * a dropped bar looks exactly like a category that was never in the data. On a board that is a
 * realistic result rather than an edge case: a sum over refunds is negative, and a count over a
 * group a filter emptied is zero. The rows stay in the table and the note says the chart is
 * missing them.
 */
/**
 * A widget's own saved filters and the board's, combined into what is actually sent.
 *
 * <b>ANDed and NESTED, never flattened.</b> This is the rule the server already applies to drill
 * narrowings, and its reasoning is the argument here word for word: spreading a saved
 * `region = north OR region = south` into a top-level AND alongside a board condition turns it
 * into `region = north OR (region = south AND <board>)` -- a different question wearing the same
 * words. Both halves keep their own brackets.
 *
 * <b>Both halves are pruned first, and an empty half is dropped entirely rather than nested.</b>
 * The server refuses a group with no conditions in it outright -- "A filter group needs at least
 * one condition in it" -- so wrapping an empty board filter would turn every tile on the board
 * into an error the moment somebody opened the bar and typed nothing.
 *
 * Exported and pure so the rule can be tested without a component, which is where the OR case
 * belongs: it has no visible symptom, and a tile narrowed by the wrong predicate draws a
 * perfectly ordinary chart of the wrong rows.
 */
export function combineFilters(saved: FilterNode | undefined,
    board: FilterGroup | null): FilterGroup | undefined {

  // `saved` is whatever was written into analysis_config, which for a single condition is the
  // bare clause rather than a group of one. asFilterGroup makes both shapes safe to walk.
  const savedGroup = asFilterGroup(saved);
  const own = savedGroup ? pruneFilters(savedGroup) : null;
  const bar = board ? pruneFilters(board) : null;
  const haveOwn = !!own && own.clauses.length > 0;
  const haveBar = !!bar && bar.clauses.length > 0;

  if (!haveOwn && !haveBar) return undefined;
  if (!haveBar) return own!;
  if (!haveOwn) return bar!;
  return { op: 'AND', clauses: [own!, bar!] };
}

/**
 * What the ANALYSIS asked for, which the result alone cannot say.
 *
 * Whether a line may be drawn is a fact about the sort, and whether a stack may be is a fact about
 * how many dimensions were grouped -- neither of which is visible in a list of rows. The response
 * carries the numbers; this carries the question, and it comes from the saved configuration for
 * the same reason the aggregation does.
 */
export interface ResultShape {
  sortedBy?: 'MEASURE' | 'DIMENSION';
  /**
   * Which way that sort ran.
   *
   * Carried because the AXIS alone does not say whether a line may be drawn. A result sorted by
   * its dimension DESCENDING is in the dimension's own order and still runs backwards, and the
   * gate below used to see only `sortedBy === 'DIMENSION'` and offer the line. "dimension, Z-A"
   * is one click and an entirely reasonable choice for a date -- newest first, which is how
   * anybody wanting the latest month at the top of the table beside it would sort -- and the tile
   * then drew time running right to left and printed "Change -40.0% ... down" over a year that
   * rose 67%.
   */
  sortDirection?: 'ASC' | 'DESC';
  /**
   * Whether a Top-N DISCARDED its tail rather than rolling it into an Other bucket.
   *
   * The one fact about a result that the result itself cannot carry: with includeOther off the
   * server emits no roll-up row, so `other` is null and `rollupRows` is null, and five rows of a
   * forty-region dataset are indistinguishable from a dataset with five regions. Every share
   * drawn from them is then a share of the retained subset wearing the shape of a share of the
   * whole -- a ring whose legend reads "north 34%" where north is 11% of the data, and a
   * dimension summary that prints "of 2,100,000", naming a number that is not the total.
   *
   * The setting that makes the percentages wrong also makes the chart available: with the bucket
   * ON, a limit of 6 returns 7 rows and the ring is refused for having too many slices.
   */
  topNTrimmed?: boolean;
  /** Whether the server composed a cross-tab grid for this result -- its own "is this 2-D". */
  hasPivot?: boolean;
  /** Whether it refused to, because the column dimension was too wide to draw. */
  pivotTruncated?: boolean;
  dimensionCount?: number;
  rowCount?: number;
  columnCount?: number;
}

/** Whether a dimension label is a number, which is what a scatter needs of its x axis. */
function isNumericLabel(label: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(label.trim());
}

function nonPositiveNote(marks: Mark[]): string | null {
  const count = marks.filter(mark => mark.value <= 0).length;
  if (!count) return null;
  // Names the BEHAVIOUR, not one chart. This note is pushed whatever kind is drawn, and it used
  // to say "the ranked view does not draw a bar for those" -- so a reader looking at "Bars in
  // order", where the two loss-making lines sat flush to the baseline and looked exactly like a
  // line that broke even, was told to go and look at a different chart. Switching to ranked
  // found the same rows missing and a sentence that still did not apply.
  return `${count} ${count === 1 ? 'figure is' : 'figures are'} zero or below. A bar has no `
    + 'length to draw for those — ranked leaves them out, and "bars in order" draws them flat '
    + 'against the baseline. They are in the table.';
}

/**
 * The four kinds with the reason each cannot draw this result.
 *
 * Listed and inert with the reason on them rather than filtered away, which is the treatment an
 * unreadable connection and an undrawable chart kind already get in this feature: the reason a
 * ring is not on offer is a fact about the reader's own analysis, and it teaches more than the
 * option quietly not being there.
 */
function issuesFor(marks: Mark[], reason: string, additive: boolean | 'unknown',
    aggregationLabel: string, shape: ResultShape = {}): Record<WidgetVisualization, string> {

  const categorical = marks.length ? '' : reason;
  /*
   * Three states, not two, because two different facts arrive at the totalling gate.
   *
   * An ANALYSIS names its aggregation, so this screen knows a mean does not add up and can say
   * so. A saved STATEMENT names nothing -- `select avg(amount)` and `select sum(amount)` return
   * the identical shape -- so on that path additivity is UNKNOWN. Both must close the gate, and
   * they must close it with different words: printing "this measure does not add up" over a
   * statement asserts as fact something no code on that path can see, which is the same class of
   * quiet overclaim the gate exists to prevent.
   *
   * `!additive` cannot express that, because the string 'unknown' is truthy -- which is exactly
   * how the saved-query path came to pass `true` here and be offered every share chart.
   */
  const canTotal = additive === true;
  const noSum = additive === 'unknown'
    ? 'a saved query does not say whether its figures add up'
    : `${aggregationLabel} does not add up`;
  const noTotal = additive === 'unknown'
    ? 'a saved query does not say whether its figures add up to one'
    : `${aggregationLabel} has no total to divide`;
  const negative = marks.filter(mark => mark.value <= 0).length;
  const rankOrdered = shape.sortedBy === 'MEASURE';
  // Sorted by the dimension, but backwards. Not rank order -- the points ARE in the dimension's
  // own order -- and still not drawable as a line, because that order is reversed. Kept apart
  // from rankOrdered so each can say the thing the reader actually has to change.
  const reversed = shape.sortedBy === 'DIMENSION' && shape.sortDirection === 'DESC';
  // A share needs the whole to divide. A Top-N that threw its tail away has not got one, and
  // nothing in the result says so -- see ResultShape.topNTrimmed.
  const NO_WHOLE = 'This is a Top-N with the rest discarded, so these rows are not the whole of '
    + 'anything. Turn the Other bucket on to show a share.';
  const BACKWARDS = 'These are ordered newest-first, so a line would run backwards through the '
    + 'dimension. Sort the dimension ascending to draw one.';
  const numericDimension = marks.length > 0 && marks.every(mark => isNumericLabel(mark.name));
  /*
   * Two dimensions flattened into one list of marks.
   *
   * `stacked` and `shareStacked` already read dimensionCount; the line, the area and the trend
   * summary did not, two lines above them. A 2-D result reaches them as interleaved categories --
   * Jan/north, Jan/south, Feb/north, Feb/south -- so the line was offered, drawn, and ran as a
   * sawtooth between two series that have nothing to do with each other, while the trend summary
   * stated a "change" between the first and last of that interleaving.
   */
  const multiDimension = (shape.dimensionCount ?? 1) > 1;
  const TWO_DIMENSIONS = 'These rows carry two dimensions, so the points interleave two series '
    + 'and a line would zigzag between them. Use the cross-tab or a stack, or drop a dimension.';
  return {
    table: '',
    /*
     * A single figure, and only when there IS a single figure. Drawing the first row of forty
     * as a headline is the most confidently wrong thing this list could do -- it looks like an
     * answer, it is the right shape for an answer, and it is one group out of forty.
     */
    kpi: marks.length === 1 || (shape.rowCount === 1 && shape.columnCount === 1)
      ? ''
      : `A single figure needs one row, and this returned ${shape.rowCount ?? marks.length}.`,
    /*
     * A line asserts the gaps between its points mean something, so the points have to be in the
     * dimension's own order. Sorted by measure they are in rank order, and joining them draws a
     * curve that slopes the same way whatever the data did.
     */
    line: categorical
      || (multiDimension
        ? TWO_DIMENSIONS
        : rankOrdered
        ? 'These are ordered biggest-first, so a line between them would show the sort rather '
          + 'than a trend. Sort by the dimension to draw one.'
        : reversed
          ? BACKWARDS
          : marks.length < 2 ? 'A line needs at least two points.' : ''),
    area: categorical
      || (multiDimension
        ? TWO_DIMENSIONS
        : rankOrdered
        ? 'These are ordered biggest-first, so a filled area would show the sort rather than a '
          + 'trend. Sort by the dimension to draw one.'
        : reversed
          ? BACKWARDS
          : marks.length < 2
          ? 'A line needs at least two points.'
          : negative
            // A fill reads as accumulated magnitude from a baseline; below it the reading inverts.
            ? `${negative} of these figures is zero or below, and a filled area measures up from `
              + 'a baseline.'
            : ''),
    /*
     * A stack claims its parts add up to the whole. That needs a second dimension to be the
     * parts, and a measure that has a total at all -- an average of averages is not one.
     */
    stacked: categorical
      || (!canTotal
        ? `A stack adds its parts into a whole, and ${noSum}.`
        : (shape.dimensionCount ?? 1) < 2
          ? 'A stack needs a second dimension to divide each bar by.'
          : negative
            ? `${negative} of these figures is zero or below, and a stack cannot show one.`
            : ''),
    /*
     * A histogram bins the MEASURE values to show their shape. With a handful of groups there is
     * no shape -- it is a bar chart that has thrown its labels away.
     */
    /*
     * The same shape as a stack, and one refusal fewer plus one more.
     *
     * Fewer: a NEGATIVE part is refused by the plain stack because it cannot be drawn upwards
     * from a baseline, and that refusal applies here for the same reason -- so it is kept.
     * More: normalising divides by each bar's own total, so a group summing to zero has no share
     * to show and would divide by nothing. The plain stack draws that group as a flat bar
     * honestly; this one cannot.
     */
    shareStacked: categorical
      || (!canTotal
        ? `A share within a group divides that group's total, and ${noTotal}.`
        : (shape.dimensionCount ?? 1) < 2
          ? 'Showing the mix inside each bar needs a second dimension to be the mix.'
          : negative
            ? `${negative} of these figures is zero or below, and a share of a group cannot `
              + 'include one.'
            : ''),
    /*
     * The grid the server composed, or the reason there is none.
     *
     * Gated on the GRID rather than on the dimension count, because its presence is the server's
     * own answer to "is this two-dimensional" -- and because the server refuses to build one that
     * is too wide to read, which is a judgement this screen should not second-guess. A result
     * whose columns were truncated arrives with rows null and says so in its own words.
     */
    pivot: !shape.hasPivot
      ? 'A cross-tab needs exactly two dimensions — one for the rows and one for the columns.'
      : shape.pivotTruncated
        ? 'That second dimension has more values than a grid can carry across the page.'
        : '',
    /*
     * Gated on the grid exactly as the cross-tab is, and DELIBERATELY NOT on canTotal.
     *
     * That is the whole reason this kind exists. A stack and a share both refuse a measure that
     * does not add up -- an average, a minimum, a distinct count -- because stacking claims the
     * parts compose the whole. Clustered bars claim nothing of the sort: each bar is measured
     * from the same zero on a shared scale, so they compare without totalling. Before this,
     * "average order value by region and category" could be drawn as no chart at all and fell
     * through to a grid of numbers.
     *
     * Negatives ARE refused, for the reason the plain bars refuse them: length is measured from
     * zero here and there is no axis for a bar running the other way.
     */
    groupedBar: !shape.hasPivot
      ? 'Bars side by side need exactly two dimensions — one for the groups, one for the bars.'
      : shape.pivotTruncated
        ? 'That second dimension has more values than a row of bars can carry.'
        : negative
          ? `${negative} of these figures is zero or below, and a bar is measured up from zero.`
          : '',
    histogram: categorical
      || (marks.length < HISTOGRAM_FLOOR
        ? `A distribution of ${marks.length} figures says less than the bars themselves do.`
        : ''),
    /*
     * Both axes have to be quantities. The measure supplies one; the dimension only supplies the
     * other if it is itself a number.
     */
    scatter: categorical
      || (!numericDimension
        ? 'A scatter puts two numbers against each other, and this dimension is a category.'
        : marks.length < 2 ? 'A scatter needs at least two points.' : ''),
    /*
     * Describing the groups needs groups. It states a top SHARE, so like the ring it is only
     * offered where the measure has a total to divide -- and the component withholds that one
     * fact rather than the whole tile when it does not.
     */
    dimensionSummary: categorical
      || (marks.length < 2
        ? 'Describing a set of groups needs more than one of them.' : ''),
    /*
     * A trend summary states first, last and the change between them, which only means anything
     * if the points are in the dimension's own order. The same rule the line keeps, for the same
     * reason: against a rank-ordered result "first" is just the biggest.
     */
    trendSummary: categorical
      || (multiDimension
        ? 'These rows carry two dimensions, so "first" and "last" would be two points of an '
          + 'interleaving rather than the ends of a series.'
        : rankOrdered
        ? 'These are ordered biggest-first, so "first" and "last" would describe the sort rather '
          + 'than the series. Sort by the dimension to summarise a trend.'
        : reversed
          // The worst of the three to get wrong, because it states a NUMBER. Over a year that
          // rose 67% it printed "First: December ... Last: January ... Change -40.0%, down".
          ? 'These are ordered newest-first, so "first" and "last" are the wrong way round. '
            + 'Sort the dimension ascending to summarise a trend.'
          : marks.length < 2 ? 'A trend needs at least two points.' : ''),
    /* A spread of one figure has no spread. */
    distributionSummary: categorical
      || (marks.length < 3
        ? `A spread of ${marks.length} needs more figures to describe.` : ''),
    /* Two figures, compared. Not three, and not one. */
    comparison: categorical
      || (marks.length !== 2
        ? `Comparing two figures needs exactly two rows, and this returned ${marks.length}.`
        : ''),
    ranked: categorical,
    /*
     * Ranked bars that also state each row's share of the total.
     *
     * The ring is the only share chart this board had, and it refuses past the colours the
     * palette can tell apart -- so "what share of revenue does each of these forty customers
     * carry" had no chart at all. Bars carry their own labels, so the colour limit is not a limit
     * here; what IS required is that the parts genuinely make a whole, which is the same set of
     * conditions the ring already tests, minus the slice count.
     */
    rankedShare: categorical
      || (shape.topNTrimmed
        ? NO_WHOLE
        : !canTotal
        ? `A share divides a total, and ${noTotal}.`
        : negative
          ? `${negative} of these figures is zero or below, and a share of a total cannot `
            + 'include one.'
          : ''),
    /*
     * A running total along the dimension.
     *
     * Same ordering rule as the line and for the same reason -- a cumulative curve over rank
     * order climbs steeply then flattens whatever the data did, which looks like a finding and is
     * an artefact of the sort. It also has to be a measure that adds up: accumulating an average
     * produces a number that is not a quantity of anything.
     */
    cumulative: categorical
      || (multiDimension
        ? TWO_DIMENSIONS
        : !canTotal
        ? `A running total accumulates its rows, and ${noSum}.`
        : rankOrdered
          ? 'These are ordered biggest-first, so a running total would climb steeply and then '
            + 'flatten because of the sort rather than because of the data. Sort by the dimension.'
          : reversed
            ? BACKWARDS
            : marks.length < 2 ? 'A running total needs at least two points.' : ''),
    /*
     * A negative is NOT refused here, unlike the area and the stack, and the difference is the
     * baseline. A filled area measures up from one, so below it the reading inverts; a stack
     * claims its parts make a whole, which a negative part cannot. A plain bar makes neither
     * claim -- it is a length against a shared axis, and a zero-length bar for a negative figure
     * is not a wrong statement, only an incomplete one. The note above says so in words, which is
     * the part that was missing: the figure was flush to the baseline and the footnote blamed a
     * different chart.
     */
    bar: categorical || (marks.length > ORDERED_BARS
      ? `${marks.length} bars is past what this chart can label.` : ''),
    donut: categorical
      || (shape.topNTrimmed
        ? NO_WHOLE
        : !canTotal
        ? `A ring divides a total, and ${noTotal}.`
        : negative
          // A ring asserts that its parts make the whole. A negative part is a share of nothing,
          // and a zero one draws as invisible while still being counted into the total.
          ? `${negative} of these figures is zero or below, and a share of a total cannot include one.`
          : marks.length > DONUT_SLICES
            ? `${marks.length} slices is past the ${DONUT_SLICES} colours this palette can tell apart.` : ''),
  };
}

/**
 * Whether a dimension's drawn values can be compared to its column with `=`.
 *
 * The one that cannot is a GRAINED date, and it is the reason this function exists rather than a
 * `!!` somewhere. A month bucket renders as the first of that month, so an `=` against the column
 * would ask for the 1st and get a thirtieth of the bar that was clicked -- a chart that answers
 * the wrong question while looking exactly right. AnalysisResult carries `grains` index-aligned
 * with `dimensions` precisely so a screen can tell those apart, and this is a screen telling them
 * apart.
 *
 * A dimension the response did not list is refused too: without a name in `dimensions` there is
 * no grain slot to read, and "absent" is not the same as "not grained".
 */
function narrowableDimension(result: AnalysisResult, field: string): boolean {
  const at = (result.dimensions ?? []).indexOf(field);
  if (at < 0) return false;
  return !(result.grains ?? [])[at];
}

/**
 * The raw values behind one drawn mark, or null when they cannot stand as operands.
 *
 * Null on a null value, and that is not fussiness: `field = null` is never true in SQL, so an
 * `EQ` clause built from a null would narrow every tile on the board to nothing while looking
 * like an ordinary filter. `IS NULL` is the operator that means it, and the board filter's
 * builder has one -- but a null-valued mark is drawn as "(null)" alongside real values, and the
 * distinction is worth more than the click.
 */
function markOperands(columns: AnalysisColumn[], dimensionAt: number[],
    row: (string | null)[], otherLabel: string): MarkOperand[] | null {

  const operands: MarkOperand[] = [];
  for (const index of dimensionAt) {
    const value = row[index];
    if (value === null || value === undefined || value === '') return null;
    // The rolled-up row is not a category and must not behave like one. "Other" is not a value in
    // the data -- it is this many values the reader has not been shown -- so `sub_category =
    // 'Other'` narrows the whole board to nothing while looking like an ordinary filter. The
    // server refuses to DRILL into it for the same reason, in the same words.
    //
    // The LABEL is the fallback and not the test: AnalysisResult.rollupRows names these rows by
    // index, and this branch only runs against a response that did not send it. A dataset is
    // entitled to hold a value genuinely spelled "Other", and matching the label makes such a row
    // inert -- wrong, but wrong in the harmless direction.
    if (otherLabel && value === otherLabel) return null;
    operands.push({ field: columns[index].name, value });
  }
  return operands.length ? operands : null;
}

/**
 * A tile's view of an analysis result.
 *
 * The aggregation comes from the SAVED CONFIGURATION rather than from the response, because the
 * response carries the numbers and not the question: whether a ring may divide them is a fact
 * about what was asked for, and it has to be known even when the result has no rows at all.
 */
export function analysisView(result: AnalysisResult, aggregation: Aggregation | null,
    shape: ResultShape = {}): WidgetView {
  const columns = result.columns ?? [];
  const allRows = result.rows ?? [];
  const named = result.measure ? columns.find(column => column.name === result.measure) : undefined;
  // The response names the measure outright, so the role scan is only the fallback for one that
  // did not: "the last MEASURE column" is a guess where `measure` is an answer.
  const measure = named
    ?? [...columns].reverse().find(column => column.role === 'MEASURE');
  const measureAt = measure ? columns.indexOf(measure) : -1;
  const dimensionAt = columns
    .map((column, index) => ({ column, index }))
    .filter(entry => entry.column.role === 'DIMENSION')
    .map(entry => entry.index);

  const pairs: Mark[] = [];
  if (measureAt >= 0 && dimensionAt.length) {
    const narrowable = dimensionAt.every(index => narrowableDimension(result, columns[index].name));
    // By index when the server said which rows they are, by label only when it did not. See
    // markOperands, and AnalysisResult.rollupRows for why the difference is worth a field.
    const rolled = result.rollupRows ? new Set(result.rollupRows) : null;
    const otherLabel = rolled ? '' : (result.other?.label ?? '');
    for (const [at, row] of allRows.entries()) {
      const value = asNumber(row[measureAt]);
      // Rows whose measure does not read as a number are LEFT OUT and counted, never coerced to
      // zero: a bar shortened by an amount nobody measured is worse than a bar that is not there.
      if (value === null) continue;
      const name = dimensionAt
        .map(index => renderCell(columns[index], row[index]) || '(null)')
        .join(' · ');
      const operands = narrowable && !rolled?.has(at)
        ? markOperands(columns, dimensionAt, row, otherLabel) : null;
      pairs.push(operands ? { name, value, operands } : { name, value });
    }
  }
  const { marks, merged } = mergeMarks(pairs);

  const notes: string[] = [];
  if (result.truncated) {
    notes.push('This result stopped at the server\'s row ceiling. Groups that match it are '
      + 'missing, and nothing here can say how many or which way they would move a figure.');
  }
  const unparsed = allRows.length - pairs.length;
  if (measureAt >= 0 && dimensionAt.length && unparsed > 0) {
    notes.push(`${unparsed} ${unparsed === 1 ? 'row is' : 'rows are'} not drawn: the measure does `
      + 'not read as a number there. They are left out rather than counted as zero.');
  }
  if (merged > 0) {
    notes.push(`${merged} ${merged === 1 ? 'row shares' : 'rows share'} a label with another and `
      + 'was added into it.');
  }
  if (shape.topNTrimmed) {
    // Said on the tile because nothing in the RESULT says it. With the Other bucket off the
    // server emits no roll-up row, so five rows of a forty-region dataset look exactly like a
    // dataset with five regions -- and every figure here is correct while the set is not the
    // whole set.
    notes.push('This is a Top-N with the rest discarded, so these are the top rows and not the '
      + 'whole of anything. Percentages of them are not shares of the dataset.');
  }
  const dropped = nonPositiveNote(marks);
  if (dropped) notes.push(dropped);
  const other = result.other;
  if (other) {
    // valueCount, never values.length: the list is a sample on a high-cardinality dimension and
    // the server says so, and reporting the sample size as the bucket size would turn its own
    // honesty into a smaller, wrong number.
    notes.push(`${other.valueCount} ${other.valueCount === 1 ? 'value was' : 'values were'} `
      + `rolled into "${other.label}".`);
  }
  for (const [window, range] of Object.entries(result.resolvedWindows ?? {})) {
    // What "last 7 days" actually meant, in dates. It is the only thing that explains why two
    // copies of one tile taken either side of midnight legitimately differ.
    notes.push(`"${window}" resolved to ${range}.`);
  }

  const reason = !allRows.length ? 'This analysis returned no rows.'
    : !dimensionAt.length ? 'This analysis groups by nothing, so there is one figure and nothing to label it with.'
    : measureAt < 0 ? 'The result has no measure column to draw a length from.'
    : 'No row in this result has a measure that reads as a number.';

  return {
    columns: columns.map(column => column.name),
    measureColumn: columns.map(column => column.role === 'MEASURE'),
    topNTrimmed: !!shape.topNTrimmed,
    pivot: result.pivot ?? null,
    // EVERY row, not the handful the tile draws. They already crossed the wire and were already
    // parsed; slicing here threw away rows 9..N on the same tick they arrived, and the only way
    // left to read row 9 was to leave the board, re-open the dataset by hand and spend a second
    // permit re-running the identical query. tileRows() does the cutting for the tile now, so
    // the expanded view can read what the run actually returned.
    rows: allRows
      .map(row => columns.map((column, index) => renderCell(column, row[index] ?? null))),
    rowCount: result.rowCount ?? allRows.length,
    truncated: !!result.truncated,
    additive: !aggregation || ADDITIVE.includes(aggregation),
    marks,
    notes,
    issues: issuesFor(marks, reason, !aggregation || ADDITIVE.includes(aggregation),
      (aggregation ?? '').toLowerCase().replace(/_/g, ' ') || 'this measure',
      { ...shape, rowCount: result.rowCount ?? allRows.length, columnCount: columns.length }),
    ranAt: Date.now(),
  };
}

/**
 * A tile's view of a saved query's result.
 *
 * A query result has no types and no roles on its columns -- the server renders every value to
 * text before it leaves -- so which column is a label and which is a length has to be READ out
 * of the values. That is the same rule the SQL console applies and it is applied here for the
 * same reason: a VARCHAR column of "1200", "980" is drawable, and a column typed DOUBLE whose
 * every row is null is not, so a type name would be the worse test even if one had travelled.
 *
 * EVERY totalling kind is refused outright on this path, not only the ring. Whether a saved
 * statement's figures add up to a total is not knowable from here -- `select avg(amount)` and
 * `select sum(amount)` return the same shape -- and that one unknown disqualifies the stack, the
 * share within a group, the ranked share and the running total exactly as much as it disqualifies
 * the ring. This used to say "a ring", and the code matched the sentence rather than the reason:
 * it told issuesFor the figures were additive and then took the ring back out afterwards, so a
 * column of averages was still offered "share of the total" as ranked bars carrying percentages.
 */
export function queryView(result: QueryResult): WidgetView {
  const columns = result.columns ?? [];
  const allRows = result.rows ?? [];
  const readings = columns.map((name, index) => {
    let numbers = 0;
    let negative = 0;
    for (const row of allRows) {
      const value = asNumber(row[index]);
      if (value === null) continue;
      numbers++;
      if (value < 0) negative++;
    }
    return { name, index, numbers, negative };
  });

  // A column with no numbers in it is a name. Where every column parses, the first is taken --
  // `select region, sum(amount)` puts what a row IS before what it measures. A one-column result
  // has nothing to label its values with, which is a real state and not a failure.
  const label = columns.length < 2 ? null
    : readings.find(reading => !reading.numbers) ?? readings[0];
  // The LAST numeric column rather than the first, the other half of the same observation: an
  // aggregate lands at the end of a select list and an id at the front, and a chart of an id is
  // a chart of nothing at all.
  const usable = readings.filter(reading => reading.numbers > 0 && reading.name !== label?.name);
  const value = usable[usable.length - 1] ?? null;

  const pairs: Mark[] = [];
  let noNumber = 0;
  let noLabel = 0;
  if (label && value) {
    for (const row of allRows) {
      const amount = asNumber(row[value.index]);
      if (amount === null) { noNumber++; continue; }
      const name = (row[label.index] ?? '').trim();
      // A row with no label is a measurement of nothing nameable, and a row with no number is a
      // measurement nobody has. Neither becomes a zero and neither becomes a bar.
      if (!name) { noLabel++; continue; }
      pairs.push({ name, value: amount });
    }
  }
  const { marks, merged } = mergeMarks(pairs);

  const notes: string[] = [];
  if (result.truncated) {
    notes.push('This result stopped at the server\'s row ceiling, so there may be more rows '
      + 'behind it. Every figure on this tile is over the rows that arrived.');
  }
  if (noNumber > 0) {
    notes.push(`${noNumber} ${noNumber === 1 ? 'row has' : 'rows have'} nothing that reads as a `
      + `number in "${value?.name}" and ${noNumber === 1 ? 'is' : 'are'} not drawn.`);
  }
  if (noLabel > 0) {
    notes.push(`${noLabel} ${noLabel === 1 ? 'row has' : 'rows have'} no value in `
      + `"${label?.name}" to be named by.`);
  }
  if (merged > 0) {
    notes.push(`${merged} ${merged === 1 ? 'row shares' : 'rows share'} a label with another and `
      + 'was added into it. Adding is right for a count or a total and wrong for an average.');
  }
  const dropped = nonPositiveNote(marks);
  if (dropped) notes.push(dropped);

  const reason = !allRows.length ? 'This query returned no rows.'
    : !value ? 'No column in this result has numbers in it.'
    : !label ? 'This result has one column, so there is nothing to label its values with.'
    : value.negative
      ? `"${value.name}" holds ${value.negative} negative `
        + `${value.negative === 1 ? 'value' : 'values'}, and a length cannot be negative.`
      : 'No row has both a label and a number.';
  // 'unknown', which is the same thing the view declares below as `additive: false` -- and the
  // argument here used to be a flat `true`. That told issuesFor the figures add up, so every kind
  // gated on additivity was offered over a statement that may return averages: ranked share drew
  // percentages of a "total" that was a sum of means, and the stack, the share within a group and
  // the running total were offered on the same false premise. Only the ring was taken back out,
  // one line below, which is why the hole was invisible -- the kind the comments talk about was
  // the one kind that was actually closed.
  const issues = issuesFor(
    value && value.negative ? [] : marks, reason, 'unknown', 'this measure');

  return {
    columns,
    // All true: this path has no roles to read. The server renders every value to text before a
    // query result leaves, so a column of digits here is as likely to be a figure as a label and
    // there is nothing to tell them apart with. That is the behaviour this path already had.
    measureColumn: columns.map(() => true),
    // A saved statement has no Top-N this screen knows about; whatever it discards it discards
    // in SQL, where nothing here can see it. The share charts are withheld anyway, by the
    // 'unknown' additivity passed to issuesFor above -- which is what this comment claimed all
    // along while the argument said `true`.
    topNTrimmed: false,
    // A saved statement returns rows and nothing about their shape, so there is no grid to carry.
    pivot: null,
    rows: allRows.map(row => row.map(cell => cell ?? null)),
    rowCount: result.rowCount ?? allRows.length,
    truncated: !!result.truncated,
    // A saved query does not say whether its figures add up, which is why every totalling kind is
    // refused above. The dimension summary withholds its top-share fact on the same grounds, and
    // reads this flag to do it -- so the two must agree, and this is the value issuesFor is given.
    additive: false,
    marks,
    notes,
    issues,
    ranAt: Date.now(),
  };
}

/**
 * Where one tile has got to.
 *
 * `queued` is a real state and not a loading spinner waiting to happen: a board runs its tiles
 * ONE AT A TIME, so most of them spend most of an open genuinely waiting for their turn, and
 * saying "waiting" where nothing is happening yet is the honest word for it.
 */
export type WidgetState = 'queued' | 'running' | 'done' | 'failed' | 'stopped';

export interface WidgetRun {
  state: WidgetState;
  /** The server's own sentence when it refused. Never paraphrased. */
  error: string;
  view: WidgetView | null;
  /** Minted here so the run can be stopped; the server keys its registry on (tenant, user, id). */
  queryId: string;
}

/** What a saved analysis's one JSON column holds. Written by the Canvas, read here. */
interface SavedAnalysisConfig {
  dimensions?: string[];
  /**
   * The calendar grain each dimension was bucketed at, index-aligned with `dimensions`.
   *
   * A board tile that does not send these runs a DIFFERENT analysis from the one that was saved:
   * the server groups by the raw TIMESTAMP, so "revenue by month" comes back as one row per
   * distinct instant. Usually with no banner either -- truncation needs 50,000 rows and a year of
   * orders is often fewer -- so the tile simply shows eight timestamps under a title that says
   * "Monthly revenue", and the bar and donut kinds go inert on the cardinality.
   */
  grains?: (Grain | null)[];
  measure?: { aggregation?: Aggregation; field?: string };
  filters?: FilterGroup;
  topN?: TopN | null;
  sort?: AnalysisSort | null;
}


/** Below this many groups a histogram is a bar chart with the labels taken off. */
const HISTOGRAM_FLOOR = 8;

/**
 * A minted run id, scoped to the caller by the server's own registry key.
 *
 * The client names the run because the endpoints are synchronous: an id minted server-side would
 * arrive with the rows, which is after there is anything left to stop.
 */
function mintQueryId(widgetId: number): string {
  return `widget-${widgetId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Dashboards: pages of saved work, re-run every time they are opened.
 *
 * <b>THE ONE DECISION THIS SCREEN IS BUILT AROUND: a widget stores a REFERENCE and never a
 * result.</b> A tile names a saved analysis or a saved query, and opening the board runs it. The
 * alternative -- storing the rows the tile last showed -- is what makes most dashboards lie: the
 * file behind a number changes, the number does not, and nothing on screen can tell the reader
 * which of the two they are looking at. This module has spent its whole design refusing to show
 * a figure it cannot stand behind, and a cached tile would be the first place it did.
 *
 * <b>AND THAT COSTS PERMITS, so here is what a board costs and what was done about it.</b> Every
 * analytics query in this application passes one JVM-wide fair Semaphore, admitting four at once
 * (analytics.query.max-concurrent, default 4) across every user AND the ETL work sharing the
 * box. A ten-widget board is ten real queries -- ten locked-down DuckDB sessions, ten scans of
 * whatever those datasets are. Fired together, one person opening one page would hold the whole
 * ceiling and queue everyone else behind it, and a board of a hundred tiles would be a denial of
 * service written in a UI.
 *
 * So the tiles run STRICTLY ONE AT A TIME, in display order, and the queue is visible while it
 * drains. A board therefore holds at most ONE of the four permits no matter how many tiles are
 * on it: it takes longer to draw, and it can never be the reason somebody else's query waits.
 * The exchange is stated on the board itself rather than left to be discovered, and there are
 * three ways out of the wait -- Stop abandons the rest and cancels the one in flight, each tile
 * re-runs on its own, and adding a tile runs only that tile rather than the board again.
 *
 * Changing a tile's chart kind runs NOTHING. It draws the result already in hand a different
 * way, which is the whole reason a widget is a reference plus a visualization choice and not a
 * saved picture.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-dashboards',
  imports: [Icon, StatTile, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, FilterBuilder, AnalyticsWidget, WidgetChart],
  templateUrl: './dashboard.html',
})
export class Dashboards implements OnInit, OnDestroy {

  private readonly analytics = inject(AnalyticsService);
  /** Server times, read and written as the rest of the console does. */
  private readonly serverTime = new ServerTimePipe(inject(LOCALE_ID));
  /** A time in the given format, or the text as it came when it is not a time at all. */
  private timeOf(raw: string | Date, format: string): string {
    try { return this.serverTime.transform(raw, format) ?? String(raw); } catch { return String(raw); }
  }
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly kinds = KINDS;
  readonly heightMin = WIDGET_HEIGHT_MIN;
  readonly heightMax = WIDGET_HEIGHT_MAX;


  /**
   * A chart's value label, formatted the way the table formats a cell.
   *
   * A bound arrow rather than a method, because it is passed AS a function to the chart -- a
   * method reference would lose `this` the moment the chart called it.
   */

  /**
   * A segment of a 100% stack, written as the percentage it is.
   *
   * One decimal place, because the parts of a group routinely differ by less than a whole point
   * and rounding them all to integers makes two visibly different segments read the same. The
   * bar's own total formats as "100%", which is true and is why the figure above the bar is
   * suppressed rather than formatted differently.
   */

  /** The key a dataset is identified by in the bar. A NUL cannot occur in either half. */
  private static datasetKey(connection: string, path: string): string {
    return connection + '\u0000' + path;
  }

  /**
   * The board filter, but only for a widget that reads the dataset it was written against.
   *
   * Null everywhere else, which is what keeps a board of mixed datasets from filling with
   * refusals. The tile says why it was not narrowed rather than staying silent -- a board that
   * looks uniformly narrowed and is not is the failure this whole scoping exists to prevent.
   */
  private boardFilterFor(saved: SavedAnalysis): FilterGroup | null {
    const on = this.boardFilterOn();
    if (!on) return null;
    return Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath) === on
      ? this.boardFilter() : null;
  }

  /** Every distinct dataset the board's analysis-backed widgets read. */
  readonly boardDatasets = computed(() => {
    const seen = new Map<string, { key: string; label: string }>();
    for (const widget of this.widgets()) {
      const saved = this.analyses().find(
        candidate => candidate.analyticsAnalysisId === widget.analyticsAnalysisId);
      if (!saved) continue;
      const key = Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath);
      if (!seen.has(key)) {
        seen.set(key, { key, label: saved.connectionAlias + '/' + saved.datasetPath });
      }
    }
    return Array.from(seen.values());
  });

  /**
   * Chooses which dataset the bar filters, and fetches its columns.
   *
   * LAZILY, and only on a change: a schema read is a governed DuckDB session and one of the four
   * permits this JVM has, so fetching one per board open would spend a permit on a bar nobody
   * touched. Changing the dataset CLEARS the filter, because the columns a condition may name
   * have just changed underneath it.
   */
  chooseFilterDataset(key: string): void {
    if (key === this.boardFilterOn()) return;
    this.boardFilterOn.set(key);
    this.boardFilter.set(emptyFilterGroup());
    this.boardColumns.set([]);
    this.boardColumnsError.set('');
    if (!key) return;

    const cut = key.indexOf('\u0000');
    const connection = key.slice(0, cut);
    const path = key.slice(cut + 1);
    this.boardColumnsLoading.set(true);
    this.analytics.schema(connection, path).subscribe({
      next: response => {
        this.boardColumnsLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.boardColumnsError.set(response.message || 'That dataset could not be read.');
          return;
        }
        this.boardColumns.set(response.data.columns ?? []);
      },
      error: err => {
        this.boardColumnsLoading.set(false);
        this.boardColumnsError.set(err?.error?.message || 'That dataset could not be read.');
      },
    });
  }

  /**
   * Applies the bar to the board.
   *
   * An explicit press, never on every keystroke. Ten widgets is ten governed queries, and a bar
   * that re-ran as somebody typed would be the denial of service this component's serial queue
   * exists to prevent. It reuses runAll() rather than growing a second queue.
   */
  applyBoardFilter(): void {
    this.runAll();
  }

  /**
   * What this tile has to say about the board filter, or '' when there is nothing to say.
   *
   * Three outcomes, and the two that are not "narrowed" are the ones worth a sentence:
   *
   *   narrowed          the conditions, in the same words the Canvas uses for a chip.
   *   another dataset   named, because "why is this tile different" is otherwise unanswerable
   *                     from the screen.
   *   a saved query     the query endpoint takes SQL and nothing else. There is no filter to give
   *                     it, and composing a WHERE around somebody's own statement is precisely
   *                     the string-building the structured path exists to avoid.
   */
  boardFilterNote(widget: DashboardWidget): string {
    if (!this.boardFilterCount()) return '';
    if (widget.analyticsQueryId) {
      return 'The board filter is not applied here: this tile runs a saved statement, and that '
        + 'endpoint takes SQL and nothing else.';
    }
    const saved = this.analyses().find(
      candidate => candidate.analyticsAnalysisId === widget.analyticsAnalysisId);
    if (!saved) return '';
    if (Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath) !== this.boardFilterOn()) {
      const on = this.boardFilterOn().replace('\u0000', '/');
      return `The board filter is on ${on}. This tile reads `
        + `${saved.connectionAlias}/${saved.datasetPath}, so it is not narrowed.`;
    }
    return 'Board filter: ' + this.boardFilterWords().join(' · ');
  }

  /** The dataset a widget reads, as a board-filter key, or '' when it is not an analysis. */
  private datasetKeyFor(widget: DashboardWidget): string {
    if (widget.analyticsQueryId) return '';
    const saved = this.analyses().find(
      candidate => candidate.analyticsAnalysisId === widget.analyticsAnalysisId);
    return saved ? Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath) : '';
  }

  /**
   * Whether clicking a mark on THIS tile can narrow the board.
   *
   * Drives the chart's own `clickable`, so a bar that cannot narrow is not a button at all --
   * neither a mouse target nor a tab stop. A chart that accepted every click and then explained
   * itself afterwards would be teaching the reader which bars are real by making them fail.
   *
   * <b>Some of the marks is enough, and the inert ones are inert individually.</b> Requiring all
   * of them was the first shape of this and it was wrong: a Top-N result carries one rolled-up
   * "Other" row that is legitimately not a category, so "every mark or nothing" would have taken
   * the feature away from most of the reports that have it. The Canvas already makes exactly this
   * row inert on its own, one row at a time, with a note under the table saying why -- and a tile
   * whose note says "14 values were rolled into Other" is a tile that has already explained which
   * bar will not click.
   */
  narrows(widget: DashboardWidget, view: WidgetView): boolean {
    if (!this.datasetKeyFor(widget)) return false;
    return view.marks.some(mark => !!mark.operands?.length);
  }

  /**
   * Narrows the whole board to the group that was clicked.
   *
   * The click IS the apply, and that is not a contradiction of the rule beside applyBoardFilter.
   * That rule exists because a bar that re-ran as somebody typed would be ten governed queries per
   * keystroke; one deliberate click is one apply, which is the same cost as pressing the button
   * next to it.
   *
   * It fills the bar rather than filtering behind it, and opens the bar to show it did: the reader
   * ends up looking at an ordinary board filter they can read, edit, extend or clear, instead of a
   * hidden narrowing whose only trace is that the numbers moved. Every tile on another dataset
   * then says on its face that it was NOT narrowed, which is the same promise the bar already
   * makes.
   *
   * A click while the board is running is ignored: runAll() abandons the run in flight, so a
   * second click during a ten-widget pass would throw away nine answers to ask a question the
   * reader has not finished asking.
   */
  narrowTo(widget: DashboardWidget, mark: Mark): void {
    const operands = mark.operands;
    // Defensive rather than expected -- `narrows` above already un-buttons these -- but the Other
    // row a chart rolls up on its own has no operands and reaches here if a max is ever set.
    if (!operands?.length || this.running()) return;
    const key = this.datasetKeyFor(widget);
    if (!key) return;

    // Switching datasets CLEARS the filter and fetches the new columns, which is exactly what
    // should happen: the conditions that were there named columns this dataset may not have.
    if (key !== this.boardFilterOn()) this.chooseFilterDataset(key);
    this.boardFilter.set({
      op: 'AND',
      clauses: operands.map(operand => ({
        field: operand.field,
        operator: 'EQ' as const,
        value: operand.value ?? '',
      })),
    });
    this.filterOpen.set(true);
    this.runAll();
  }


  // ---- turning one result into whatever the chosen kind needs -------------------------------
  //
  // Every one of these reads the SAME view. A widget kind is a way of looking at one answer, not
  // a different question, and a tile that re-queried when its picker moved would let two kinds of
  // the same analysis disagree.

  /** The measure column's name, humanised: amount_sum reads as "amount sum". */














  readonly dashboards = signal<Dashboard[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  /**
   * Whether the report list is showing.
   *
   * Open until a board is opened, then collapsed. The list is how you FIND a report; once you
   * have one, it is twenty-eight rows between you and the thing you asked for.
   */
  readonly listOpen = signal(true);

  /** Narrows the list by name. Only offered past eight reports; see the template. */
  readonly listFilter = signal('');

  // ---- the board filter ---------------------------------------------------------------------
  //
  // SESSION-ONLY, deliberately, and it is the smaller honest change by a wide margin. Persisting
  // it costs a migration, a column, an entity field, a validator and two client shapes -- and it
  // would narrow the board silently for the next person who opens it, when a dashboard is
  // described in its own schema as "the one thing here made to be shown to somebody who did not
  // build it". Every board opens showing everything; narrowing is something the reader did and
  // can see they did. If a narrowed board should be shareable later, the URL is the next step,
  // not a column.

  readonly boardFilter = signal<FilterGroup>(emptyFilterGroup());

  /**
   * The dataset the bar's conditions are written against, as "connection\u0000path".
   *
   * <b>Scoped to ONE dataset, because a filter cannot be applied blind.</b> A board's widgets may
   * read different files, and a condition naming a column another file does not have is a hard
   * refusal from the server -- "This dataset has no column called region" -- so an unscoped board
   * filter would turn half a board into error tiles. Every tile on the chosen dataset is narrowed;
   * every other tile says on its face that it was not, and why.
   */
  readonly boardFilterOn = signal('');

  /** The chosen dataset's columns, fetched once when the bar is opened. */
  readonly boardColumns = signal<DatasetColumn[]>([]);
  readonly boardColumnsLoading = signal(false);
  readonly boardColumnsError = signal('');
  readonly filterOpen = signal(false);

  /** Conditions typed but not finished, and therefore not sent. Said rather than swallowed. */
  readonly unfinishedBoardFilters = computed(() =>
    countFilterClauses(this.boardFilter())
      - countFilterClauses(pruneFilters(this.boardFilter())));

  /** How many board conditions are actually being applied. */
  readonly boardFilterCount = computed(() =>
    countFilterClauses(pruneFilters(this.boardFilter())));

  /** The board filter in words, for the line under a narrowed tile. */
  readonly boardFilterWords = computed(() =>
    pruneFilters(this.boardFilter()).clauses
      .map(node => (node as any).clauses ? '(a group)' : describeClause(node as any)));

  readonly visibleDashboards = computed(() => {
    const needle = this.listFilter().trim().toLowerCase();
    if (!needle) return this.dashboards();
    return this.dashboards().filter(item =>
      (item.dashboardName ?? '').toLowerCase().includes(needle)
      || (item.dashboardDescription ?? '').toLowerCase().includes(needle));
  });

  readonly newName = signal('');
  readonly newDescription = signal('');
  readonly creating = signal(false);
  readonly createError = signal('');

  readonly board = signal<Dashboard | null>(null);
  readonly boardLoading = signal(false);
  readonly boardError = signal('');
  readonly widgetError = signal('');

  /**
   * The saved work a widget can point at.
   *
   * Both lists are metadata reads -- no session, no permit -- and they are held for the whole
   * visit rather than re-fetched per board: they are the reader's own saved work across every
   * dataset, and a board that re-read them would spend a database round trip to be told what
   * this screen is already holding.
   */
  readonly analyses = signal<SavedAnalysis[]>([]);
  readonly queries = signal<SavedQuery[]>([]);
  readonly sourcesReady = signal(false);
  readonly sourcesError = signal('');

  readonly addOpen = signal(false);
  readonly addTitle = signal('');
  readonly addKindOfSource = signal<'analysis' | 'query'>('analysis');
  readonly addSourceId = signal('');
  readonly addVisualization = signal<WidgetVisualization>('table');
  /** Blank means "the default height" -- stored as absent rather than as the default value. */
  readonly addHeight = signal('');
  readonly addCaption = signal('');
  readonly adding = signal(false);
  readonly addError = signal('');

  readonly runs = signal<Record<number, WidgetRun>>({});
  /** Widget ids still waiting. The head of it is what runs next, and only when nothing is. */
  readonly queue = signal<number[]>([]);
  readonly runningId = signal<number | null>(null);
  /**
   * How many widgets THIS pass set out to run.
   *
   * Not widgets().length, which is a different number whenever the pass is not the whole board:
   * re-running one tile of five would otherwise count itself as "5 of 5", which reads as a board
   * being redrawn and would have a reader waiting for four tiles that were never queued.
   */
  private readonly batch = signal(0);

  /**
   * The epoch a run belongs to.
   *
   * Every in-flight response carries the epoch it was started under and is DROPPED if that is no
   * longer the current one. Stopping, opening another board and re-running all bump it, so a
   * response that was already on the wire when the reader moved on cannot land on a tile that
   * has since been re-queued -- which would show a figure under a board it was not read for.
   */
  private epoch = 0;
  /** The board read that is allowed to land. See loadBoard. */
  private boardToken = 0;
  private inFlight: Subscription | null = null;
  /** Set once the board is loaded and waiting for the sources it needs to run its widgets. */
  private pending: 'all' | number[] | null = null;

  readonly widgets = computed<DashboardWidget[]>(() => this.board()?.widgets ?? []);
  /** Whether the create form is open; a header button, not a permanent pair of inputs. */
  readonly createOpen = signal(false);
  readonly ranCount = computed(() => Object.values(this.runs()).filter(run => run.state === 'done').length);
  readonly failedCount = computed(() => Object.values(this.runs()).filter(run => run.state === 'failed').length);
  /** When the last tile landed, for the head's tile. */
  readonly lastRunText = computed(() => {
    const at = Math.max(0, ...Object.values(this.runs()).map(run => run.view?.ranAt ?? 0));
    return at ? 'last ran ' + this.clock(at) : '';
  });

  /** A run's state as the shared tile chrome names it; a result with no rows is 'empty'. */
  stateOf(run: WidgetRun | undefined): TileState {
    if (!run) return 'idle';
    if (run.state === 'done') return run.view && !run.view.rowCount ? 'empty' : 'ready';
    return run.state;
  }
  readonly running = computed(() => this.runningId() !== null || this.queue().length > 0);

  readonly canCreate = computed(() => !!this.newName().trim() && !this.creating());

  readonly canAdd = computed(() =>
    !!this.addTitle().trim() && !!this.addSourceId() && !this.adding() && !!this.board());

  /**
   * What opening this board costs, in the reader's own terms.
   *
   * On the board rather than in a release note, because it is the one thing about a dashboard
   * that a reader cannot see by looking at it: every tile is a live query, and ten tiles is ten
   * of them. The permit ceiling is deliberately described rather than numbered -- it is a server
   * property that this screen would otherwise be a second, silently wrong source of truth for.
   */
  readonly cost = computed(() => {
    const count = this.widgets().length;
    if (!count) return 'An empty board costs nothing to open.';
    return `${count} ${count === 1 ? 'widget' : 'widgets'}, and opening this board runs `
      + `${count === 1 ? 'it' : 'each of them'} again — nothing here is stored from last time. `
      + 'They run one at a time, in order, so this board never holds more than one of the '
      + 'server\'s query permits however many widgets are on it.';
  });

  readonly progress = computed(() => {
    const total = this.batch();
    const left = this.queue().length + (this.runningId() === null ? 0 : 1);
    const at = Math.min(Math.max(total - left + 1, 1), total);
    const current = this.widgets().find(
      widget => widget.analyticsDashboardWidgetId === this.runningId());
    return `Running ${at} of ${total}`
      + (current ? ` — ${current.widgetTitle}` : '') + '.';
  });

  ngOnInit(): void {
    this.loadDashboards();
    this.loadSources();
  }

  ngOnDestroy(): void {
    // A queue left draining after the screen is gone would spend permits on figures nobody can
    // see, which is the one cost that buys nothing at all.
    this.abandon();
  }

  // ---- the boards ------------------------------------------------------------------------

  loadDashboards(): void {
    this.loading.set(true);
    this.error.set('');
    this.analytics.fetchAllDashboards().subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(response.message || 'The dashboards could not be read.');
          return;
        }
        this.dashboards.set(response.data);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The dashboards could not be read.');
      },
    });
  }

  createDashboard(): void {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.createError.set('');
    this.analytics.saveDashboard({
      dashboardName: this.newName().trim(),
      dashboardDescription: this.newDescription().trim() || null,
    }).subscribe({
      next: response => {
        this.creating.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.createError.set(response.message || 'The dashboard could not be created.');
          return;
        }
        this.newName.set('');
        this.newDescription.set('');
        this.loadDashboards();
        // Opened rather than merely listed, and it costs nothing: a board with no widgets on it
        // runs no queries, so this is the one open that is free.
        this.openDashboard(response.data);
      },
      error: err => {
        this.creating.set(false);
        this.createError.set(err?.error?.message || 'The dashboard could not be created.');
      },
    });
  }

  async removeDashboard(item: Dashboard): Promise<void> {
    const id = item.analyticsDashboardId;
    if (!id) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Delete this dashboard?',
      body: `"${item.dashboardName}" and the widgets on it will be removed. The analyses and `
        + 'queries those widgets pointed at are untouched — a dashboard is an arrangement of '
        + 'saved work, not the owner of it.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteDashboard(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.toast.error(response.message || 'The dashboard could not be deleted.');
          return;
        }
        if (this.board()?.analyticsDashboardId === id) {
          this.abandon();
          this.board.set(null);
        }
        this.loadDashboards();
      },
      error: err => {
        this.toast.error(err?.error?.message || 'The dashboard could not be deleted.');
      },
    });
  }

  openDashboard(item: Dashboard): void {
    const id = item.analyticsDashboardId;
    if (!id) return;
    // Collapse the list. Opening a report should show the report, not leave twenty-eight rows
    // between the reader and the thing they clicked. "Show the list" brings it straight back.
    this.listOpen.set(false);
    this.loadBoard(id, 'all');
  }

  /**
   * Reads one board and, optionally, starts running what is on it.
   *
   * `run` is a parameter rather than a rule because the three reasons to load a board are not
   * the same: opening one should draw it, reloading after a widget was removed should leave the
   * tiles that already ran alone, and adding a widget should run exactly the new one.
   */
  private loadBoard(analyticsDashboardId: number, run: 'all' | number[] | null): void {
    this.abandon();
    this.boardLoading.set(true);
    this.boardError.set('');
    this.widgetError.set('');
    // Two boards asked for in quick succession answer in whatever order the server manages, and
    // the one that answers last is not necessarily the one the reader is waiting for. Only the
    // most recent request is allowed to become the board on screen.
    const token = ++this.boardToken;
    this.analytics.fetchDashboardById(analyticsDashboardId).subscribe({
      next: response => {
        if (token !== this.boardToken) return;
        this.boardLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.boardError.set(response.message || 'The dashboard could not be read.');
          return;
        }
        this.board.set(response.data);
        if (run === null) return;
        this.pending = run;
        this.start();
      },
      error: err => {
        if (token !== this.boardToken) return;
        this.boardLoading.set(false);
        this.boardError.set(err?.error?.message || 'The dashboard could not be read.');
      },
    });
  }

  // ---- the sources a widget can point at --------------------------------------------------

  private loadSources(): void {
    this.sourcesError.set('');
    let arrived = 0;
    const settle = () => {
      if (++arrived < 2) return;
      this.sourcesReady.set(true);
      // A board may have finished loading while these were still on the wire. Its widgets cannot
      // run without them, so the queue it left behind starts here instead.
      this.start();
    };
    this.analytics.fetchAllAnalyses().subscribe({
      next: response => {
        if (response.status === API_SUCCESS && response.data) this.analyses.set(response.data);
        else this.sourcesError.set(response.message || 'Saved analyses could not be read.');
        settle();
      },
      error: err => {
        this.sourcesError.set(err?.error?.message || 'Saved analyses could not be read.');
        settle();
      },
    });
    this.analytics.fetchAllQueries().subscribe({
      next: response => {
        if (response.status === API_SUCCESS && response.data) this.queries.set(response.data);
        else if (!this.sourcesError()) {
          this.sourcesError.set(response.message || 'Saved queries could not be read.');
        }
        settle();
      },
      error: err => {
        if (!this.sourcesError()) {
          this.sourcesError.set(err?.error?.message || 'Saved queries could not be read.');
        }
        settle();
      },
    });
  }

  /** What a tile is pointing at, in one line: the kind, the name and where it reads. */
  /**
   * What the tile points at. The saved work's name is left out when it is the tile's own title,
   * which it almost always is: "Total revenue · Saved analysis · Total revenue · …" said the same
   * thing twice on every tile of every seeded board.
   */
  sourceOf(widget: DashboardWidget): string {
    const saved = widget.analyticsAnalysisId
      ? this.analyses().find(item => item.analyticsAnalysisId === widget.analyticsAnalysisId)
      : undefined;
    if (widget.analyticsAnalysisId) {
      if (!saved) return 'Saved analysis';
      const name = saved.analysisName === widget.widgetTitle ? '' : ` · ${saved.analysisName}`;
      return `Saved analysis${name} · ${saved.connectionAlias}/${saved.datasetPath}`;
    }
    const query = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    if (!query) return 'Saved query';
    const name = query.queryName === widget.widgetTitle ? '' : ` · ${query.queryName}`;
    return `Saved query${name} · ${query.connectionAlias}/${query.datasetPath}`;
  }

  // ---- adding and removing a widget -------------------------------------------------------

  openAdd(): void {
    this.addOpen.set(true);
    this.addError.set('');
    this.addTitle.set('');
    this.addSourceId.set('');
    this.addVisualization.set('table');
    this.addHeight.set('');
    this.addCaption.set('');
  }

  pickSourceKind(kind: string): void {
    this.addKindOfSource.set(kind === 'query' ? 'query' : 'analysis');
    // The id belongs to the list it came from. Carrying it across would point the widget at
    // whatever saved query happens to share a number with the analysis that was chosen.
    this.addSourceId.set('');
  }

  addWidget(): void {
    const board = this.board();
    if (!this.canAdd() || !board?.analyticsDashboardId) return;
    const sourceId = Number(this.addSourceId());
    if (!Number.isFinite(sourceId) || sourceId <= 0) return;
    this.adding.set(true);
    this.addError.set('');
    this.analytics.saveWidget({
      analyticsDashboardId: board.analyticsDashboardId,
      widgetTitle: this.addTitle().trim(),
      // Exactly one, decided here rather than sent as both and refused: the server would answer
      // with a sentence this screen already knew, which is a round trip that teaches nobody
      // anything.
      analyticsAnalysisId: this.addKindOfSource() === 'analysis' ? sourceId : null,
      analyticsQueryId: this.addKindOfSource() === 'query' ? sourceId : null,
      visualizationType: this.addVisualization(),
      // Null when the author typed neither, so an untouched tile stores no config rather than
      // a document restating the defaults.
      widgetConfig: widgetConfigString({
        height: this.addHeight() ? Number(this.addHeight()) : undefined,
        caption: this.addCaption(),
      }),
      displayOrder: this.widgets().length,
    }).subscribe({
      next: response => {
        this.adding.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.addError.set(response.message || 'The widget could not be added.');
          return;
        }
        this.addOpen.set(false);
        const added = response.data.analyticsDashboardWidgetId;
        // Only the new tile runs. Re-running the board to show one addition would spend a permit
        // per existing widget to redraw figures already on screen.
        this.loadBoard(board.analyticsDashboardId!, added ? [added] : null);
      },
      error: err => {
        this.adding.set(false);
        this.addError.set(err?.error?.message || 'The widget could not be added.');
      },
    });
  }

  async removeWidget(widget: DashboardWidget): Promise<void> {
    const id = widget.analyticsDashboardWidgetId;
    const boardId = this.board()?.analyticsDashboardId;
    if (!id || !boardId) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Take this widget off the board?',
      body: `"${widget.widgetTitle}" will be removed from this dashboard. What it points at — `
        + 'the saved analysis or saved query — is untouched.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteWidget(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.widgetError.set(response.message || 'The widget could not be removed.');
          return;
        }
        this.runs.update(runs => {
          const next = { ...runs };
          delete next[id];
          return next;
        });
        // Reloaded without running: the tiles that are still there are showing results that are
        // no less true than they were a moment ago.
        this.loadBoard(boardId, null);
      },
      error: err => {
        this.widgetError.set(err?.error?.message || 'The widget could not be removed.');
      },
    });
  }

  /**
   * Changes how a tile is drawn. RUNS NOTHING.
   *
   * The result already in hand is drawn a different way and the choice is saved, which is the
   * whole reason a widget is a reference plus a visualization rather than a stored picture. A
   * kind change that re-queried would make picking a chart cost a permit.
   */
  setVisualization(widget: DashboardWidget, kind: string): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id || kind === widget.visualizationType) return;
    this.widgetError.set('');
    this.analytics.saveWidget({ ...widget, visualizationType: kind }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.widgetError.set(response.message || 'That choice could not be saved.');
          return;
        }
        const saved = response.data;
        this.board.update(board => board ? {
          ...board,
          widgets: (board.widgets ?? []).map(item =>
            item.analyticsDashboardWidgetId === id ? { ...item, ...saved } : item),
        } : board);
      },
      error: err => {
        this.widgetError.set(err?.error?.message || 'That choice could not be saved.');
      },
    });
  }

  /**
   * The kind actually drawn: the one saved, unless this result cannot carry it.
   *
   * Falls back to the table rather than to an empty frame, the same way the Canvas's picker
   * moves when a new result takes a chart kind away. A tile saved as a ring whose analysis has
   * since grown forty categories shows the rows and says why the ring is unavailable, which is a
   * fact about the data rather than a fault of the board.
   */
  /**
   * The kind actually drawn: what the widget asked for, or the table when it cannot be honoured.
   *
   * The membership test reads KINDS rather than naming the kinds, which is the bug this line
   * used to have. It listed the four that existed when it was written, so every kind added after
   * it was accepted by the picker, stored on the widget, shown as selected -- and silently drawn
   * as a table. The picker and the drawing disagreed, and the picker was the one telling the
   * truth. A list that must be edited in two places to add one kind is a list that will be
   * edited in one.
   *
   * Falling back to the table when a kind CANNOT draw this result is deliberate and stays: a
   * saved widget outlives the data it was built on, and a tile whose analysis has since returned
   * forty groups should show them rather than an empty ring.
   */
  /**
   * Opens every row of a result the tile could only show the first few of.
   *
   * Reads runs()[id].view and nothing else. No request is issued and no permit is taken: these
   * rows arrived with the run that drew the tile. Nothing is written back to the widget either --
   * a widget stores a reference and never a result, and this does not make the board a cache;
   * the rows die with the open board exactly as they did before.
   */
  expandTable(widget: DashboardWidget, view: WidgetView): void {
    this.dialog.open(WidgetTableDialog, {
      hasBackdrop: true,
      data: {
        title: widget.widgetTitle,
        columns: view.columns,
        rows: view.rows,
        measureColumn: view.measureColumn,
        rowCount: view.rowCount,
        // Carried through, not dropped: an expanded table is the one place a result the server
        // cut short would otherwise read as the whole thing.
        truncated: view.truncated,
        notes: view.notes,
      } as WidgetTableData,
    });
  }


  /**
   * The rows the tile itself draws.
   *
   * The cut moved here from the view builders so that view.rows is the whole result. A tile is a
   * postcard and eight rows is what fits on it; everything else is one click away rather than
   * gone.
   */
  tileRows(view: WidgetView): (string | null)[][] {
    return view.rows.slice(0, WIDGET_ROWS);
  }

  /** Whether this result has rows the tile is not showing. */
  hasMoreRows(view: WidgetView): boolean {
    return view.rows.length > WIDGET_ROWS;
  }

  /**
   * How tall this tile's drawing is, in px.
   *
   * Clamped on read rather than trusted, because the stored value is a JSON document a widget
   * carries around and nothing server-side validates: a height of 4, of 40000, or of "tall"
   * reaches this method exactly as a legitimate one does.
   */
  /** One figure -- a single row of at most a label and a value -- which can share a row with others. */
  isFigure(view: WidgetView | null | undefined): boolean {
    return !!view && view.rowCount === 1 && view.columns.length <= 2 && !view.truncated;
  }

  heightOf(widget: DashboardWidget): number {
    const asked = widgetConfigOf(widget).height;
    if (typeof asked !== 'number' || !Number.isFinite(asked)) return WIDGET_HEIGHT;
    return Math.min(WIDGET_HEIGHT_MAX, Math.max(WIDGET_HEIGHT_MIN, Math.round(asked)));
  }

  /** The author's own sentence under a tile, or '' when they wrote none. Never invented. */
  captionOf(widget: DashboardWidget): string {
    const caption = widgetConfigOf(widget).caption;
    return typeof caption === 'string' ? caption.trim() : '';
  }

  drawn(widget: DashboardWidget, view: WidgetView): WidgetVisualization {
    const asked = (widget.visualizationType ?? 'table') as WidgetVisualization;
    if (!KINDS.some(kind => kind.id === asked)) {
      return 'table';
    }
    return view.issues[asked] ? 'table' : asked;
  }

  /**
   * How much of the result is on the tile, said plainly -- and it depends on what is drawn.
   *
   * The table shows eight rows; the charts draw every mark. Counting the table's rows either way
   * put "8 of 24 rows shown" under a bar chart with twenty-four bars in it, which tells a reader
   * they are looking at a third of the data while they are looking at all of it. The opposite
   * mistake is worse, so this counts what the drawn kind actually renders.
   */
  counted(view: WidgetView, kind: WidgetVisualization): string {
    if (!view.rowCount) return 'No rows.';
    // A single figure renders the whole result and has no marks at all -- an analysis with no
    // dimension produces none. Counting marks there printed "0 of 1 rows shown" under a tile
    // displaying that one row in 30-point type.
    // view.rows is now the WHOLE result, so a table's shown count is the tile's cut and not the
    // length of the array. Reading rows.length here would have printed "500 of 500 rows" under a
    // tile displaying eight of them.
    //
    /*
     * A cross-tab is counted in its own units.
     *
     * It has no marks, so this printed "0 of 24 rows shown" under a grid that was showing all
     * twenty-four. Counting it in source rows is no better: the grid's rows are GROUPS, and a
     * cross-tab of four regions over six months says nothing about the 150,000 rows behind it.
     */
    if (kind === 'pivot') {
      const groups = view.pivot?.rows?.length ?? 0;
      const drawnGroups = Math.min(groups, WIDGET_ROWS);
      return drawnGroups < groups
        ? `${drawnGroups.toLocaleString()} of ${groups.toLocaleString()} groups shown`
        : `${groups.toLocaleString()} ${groups === 1 ? 'group' : 'groups'}`;
    }
    const shown = kind === 'table' ? Math.min(view.rows.length, WIDGET_ROWS)
      : kind === 'kpi' ? Math.min(1, view.rowCount)
      : view.marks.length;
    return shown < view.rowCount
      ? `${shown.toLocaleString()} of ${view.rowCount.toLocaleString()} rows shown`
      : `${view.rowCount.toLocaleString()} ${view.rowCount === 1 ? 'row' : 'rows'}`;
  }

  // ---- running the board, one widget at a time --------------------------------------------

  runAll(): void {
    if (!this.board()) return;
    this.abandon();
    this.pending = 'all';
    this.start();
  }

  runOne(widget: DashboardWidget): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id) return;
    if (this.queue().includes(id)) return;
    const idle = this.runningId() === null && !this.queue().length;
    // Appended rather than jumped in front of: a queue that reordered itself under a click would
    // make "run this one" mean "and stop that one", which is a second action nobody asked for.
    this.queue.update(queue => [...queue, id]);
    this.batch.update(size => idle ? 1 : size + 1);
    this.mark(id, { state: 'queued', error: '', view: null, queryId: '' });
    if (idle) this.next(this.epoch);
  }

  /**
   * Stops the board: nothing else starts, and the one in flight is cancelled.
   *
   * The cancellation is answered the same way whether the run finished a moment ago, never
   * existed or belongs to somebody else -- the server refuses to distinguish those, because
   * telling them apart would confirm that an id is live in another workspace. So there is
   * nothing here to interpret: the screen stops waiting either way.
   */
  stopRun(): void {
    const queryId = this.runningId() === null ? ''
      : this.runs()[this.runningId()!]?.queryId ?? '';
    const waiting = [...this.queue()];
    const current = this.runningId();
    this.abandon();
    for (const id of waiting) {
      this.mark(id, { state: 'stopped', error: '', view: null, queryId: '' });
    }
    if (current !== null) {
      this.mark(current, { state: 'stopped', error: '', view: null, queryId: '' });
    }
    if (queryId) {
      this.analytics.cancel(queryId).subscribe({ next: () => {}, error: () => {} });
    }
  }

  /** Everything in flight is disowned and the queue is emptied. No tile is touched. */
  private abandon(): void {
    this.epoch++;
    this.queue.set([]);
    this.batch.set(0);
    this.runningId.set(null);
    this.pending = null;
    this.inFlight?.unsubscribe();
    this.inFlight = null;
  }

  /**
   * Starts the queue a board asked for, once its sources have arrived.
   *
   * The wait is not optional: a widget names a saved analysis by id, and running it needs that
   * analysis's connection, path and configuration. Starting before the lists landed would fail
   * every tile with "the analysis this points at is not in this workspace", which is a sentence
   * that would be false.
   */
  private start(): void {
    const pending = this.pending;
    if (pending === null || !this.sourcesReady()) return;
    this.pending = null;
    const ids = pending === 'all'
      ? this.widgets().map(widget => widget.analyticsDashboardWidgetId).filter(
          (id): id is number => typeof id === 'number')
      : pending;
    if (!ids.length) return;
    this.epoch++;
    this.queue.set(ids);
    this.batch.set(ids.length);
    for (const id of ids) {
      this.mark(id, { state: 'queued', error: '', view: null, queryId: '' });
    }
    this.next(this.epoch);
  }

  /**
   * Takes the next widget off the queue and runs it. ONE AT A TIME, and that is the whole point.
   *
   * Every analytics query in this application passes one JVM-wide fair semaphore that admits
   * four at once, shared with every other user and with the ETL work on the same box. A board
   * that fired its tiles together would hold that ceiling for as long as it took to draw itself;
   * serially it holds one permit, and takes longer instead.
   */
  private next(epoch: number): void {
    if (epoch !== this.epoch) return;
    const queue = this.queue();
    if (!queue.length) {
      this.runningId.set(null);
      return;
    }
    const id = queue[0];
    this.queue.set(queue.slice(1));
    const widget = this.widgets().find(item => item.analyticsDashboardWidgetId === id);
    if (!widget) {
      // The board changed under the queue. Nothing to run and nothing to report on a tile that
      // is not there any more.
      this.next(epoch);
      return;
    }
    this.runningId.set(id);
    /*
     * A tile that throws must fail alone.
     *
     * run() marks the tile running and only then builds the request, so anything that throws
     * between those two points -- a saved configuration in a shape a reader here did not expect,
     * a column that has since been renamed -- unwound out of the queue with the tile still
     * marked running and next() never reached. The board stopped dead: one tile on "Running…"
     * for ever and every tile behind it on "Waiting its turn", with nothing on screen saying
     * anything had gone wrong. That is exactly what dashboard "15 Regional analysis" did.
     *
     * The JSON.parse inside run() was already guarded this carefully; everything after it was
     * not. This makes the guarantee structural rather than a list of the failures somebody
     * happened to think of: whatever one tile does, the other tiles still run.
     */
    try {
      this.run(widget, id, epoch);
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
        error: `"${widget.widgetTitle}" could not be prepared: ${reason}` });
    }
  }

  private run(widget: DashboardWidget, id: number, epoch: number): void {
    const queryId = mintQueryId(id);
    this.mark(id, { state: 'running', error: '', view: null, queryId });

    if (widget.analyticsAnalysisId) {
      const saved = this.analyses().find(
        item => item.analyticsAnalysisId === widget.analyticsAnalysisId);
      if (!saved) {
        this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
          error: 'The saved analysis this widget points at is not in this workspace.' });
        return;
      }
      let config: SavedAnalysisConfig;
      try {
        config = JSON.parse(saved.analysisConfig ?? '{}');
      } catch {
        // Nothing is sent. A configuration that will not parse cannot be half-applied into a
        // request: a tile running the dimensions without the filters would answer a different
        // question under the same title.
        this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
          error: `"${saved.analysisName}" cannot be run: its saved configuration is not readable.` });
        return;
      }
      const aggregation = config.measure?.aggregation ?? 'COUNT_ROWS';
      const request: AnalysisRequest = {
        connection: saved.connectionAlias,
        path: saved.datasetPath,
        dimensions: config.dimensions ?? [],
        measure: { aggregation, field: config.measure?.field },
        queryId,
      };
      /*
       * The saved filters and the board's, ANDed. boardFilterFor returns null unless this widget
       * reads the dataset the bar is written against -- see boardFilterOn.
       */
      const applied = combineFilters(config.filters, this.boardFilterFor(saved));
      if (applied) request.filters = applied;
      if (config.topN) request.topN = config.topN;
      if (config.sort) request.sort = config.sort;
      // Only when something is actually grained -- the same rule the request builder applies, and
      // for the same reason: a list of nulls is a request that LOOKS grained to anything reading
      // it back. A config saved before grains existed has no key here at all.
      if (config.grains && config.grains.some(grain => !!grain)) {
        request.grains = config.grains;
      }
      this.inFlight = this.analytics.analyze(request).subscribe({
        next: response => {
          if (response.status !== API_SUCCESS || !response.data) {
            this.settle(id, epoch, { state: 'failed', view: null, queryId,
              error: response.message || 'That analysis could not be run.' });
            return;
          }
          this.settle(id, epoch, { state: 'done', error: '', queryId,
            view: analysisView(response.data, aggregation, {
              sortedBy: config.sort?.by ?? 'MEASURE',
              // The direction travels with the axis. Without it a dimension sorted Z-A looked
              // the same to the gate as one sorted A-Z, and the tile offered a line that ran
              // backwards through time.
              sortDirection: config.sort?.direction ?? 'DESC',
              topNTrimmed: !!config.topN && config.topN.includeOther === false,
              hasPivot: !!response.data.pivot && !!response.data.pivot.rows,
              pivotTruncated: !!response.data.pivot?.columnsTruncated,
              dimensionCount: (config.dimensions ?? []).length,
            }) });
        },
        error: err => {
          this.settle(id, epoch, { state: 'failed', view: null, queryId,
            error: err?.error?.message || 'That analysis could not be run.' });
        },
      });
      return;
    }

    const saved = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    if (!saved) {
      this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
        error: 'The saved query this widget points at is not in this workspace.' });
      return;
    }
    this.inFlight = this.analytics.query({
      connection: saved.connectionAlias,
      path: saved.datasetPath,
      sql: saved.queryText,
      // The SECOND dataset, forwarded so a tile over a saved JOIN runs the query that was saved.
      //
      // This line is its own bug, not a consequence of the save path's. Even after the Studio
      // learned to store a second dataset and the table learned to hold one, a tile read the
      // first pair off the row and posted a one-dataset body -- so the engine registered no
      // `dataset2` and the widget sat permanently red with a DuckDB catalog error. Sent as a
      // pair, because the server refuses a half.
      connection2: saved.secondDatasetPath ? saved.secondConnectionAlias : undefined,
      path2: saved.secondDatasetPath || undefined,
      queryId,
    }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.settle(id, epoch, { state: 'failed', view: null, queryId,
            error: response.message || 'That query could not be run.' });
          return;
        }
        this.settle(id, epoch, { state: 'done', error: '', queryId,
          view: queryView(response.data) });
      },
      error: err => {
        this.settle(id, epoch, { state: 'failed', view: null, queryId,
          error: err?.error?.message || 'That query could not be run.' });
      },
    });
  }

  /**
   * Records what became of one run and moves the queue on.
   *
   * A response from a previous epoch is DROPPED rather than applied: it was read for a board or
   * a pass the reader has already left, and putting it on a tile would date-stamp somebody
   * else's question with this moment.
   */
  private settle(id: number, epoch: number, run: WidgetRun): void {
    if (epoch !== this.epoch) return;
    this.mark(id, run);
    this.inFlight = null;
    this.runningId.set(null);
    this.next(epoch);
  }

  private mark(id: number, run: WidgetRun): void {
    this.runs.update(runs => ({ ...runs, [id]: run }));
  }

  // ---- small renderings -------------------------------------------------------------------



  /**
   * A saved time as the console writes one: "19 Sep 2026, 09:53". The server sends Chicago
   * wall-clock with no offset, which the serverTime pipe reads as such; a bare Date would have
   * read it as the viewer's own local time, in the browser's own format.
   */
  when(raw: string | undefined): string {
    if (!raw) return '';
    return this.timeOf(raw, 'd MMM yyyy, HH:mm');
  }

  /** The time a tile ran, to the second: a figure with no time against it is a figure on trust. */
  clock(at: number): string {
    return this.timeOf(new Date(at), 'HH:mm:ss');
  }
}

/**
 * The dataset registry: naming a location once, and finding it again.
 *
 * The master index's golden workflow names dataset registration as a step, and until now the
 * endpoints behind it had no caller at all -- the table, the entity and four endpoints existed
 * and nothing in the product could reach them. This is the surface that reaches them.
 *
 * <b>REGISTERING READS NOTHING.</b> It takes no governor permit, opens no DuckDB session and
 * scans no rows: the server asks its resolver one question -- may this caller read this alias
 * and this path, and what format is it -- and keeps the answer. That is worth saying on screen,
 * because a control that looked like it might read a gigabyte is a control people do not press.
 *
 * The connection and path INPUTS are the seam this was built for. A tab inside the Studio hands
 * it the file that is open, so "name the dataset you are looking at" is one field and a button;
 * used on its own, both are typed. `opened` is the way back -- a registered dataset picked from
 * the list is a request to go and open it, which belongs to whatever screen owns the browser
 * rather than to a registry.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-dataset-registry',
  imports: [Icon],
  template: `
    <div class="card p-4 space-y-3 min-w-0">
      <div class="flex items-baseline gap-2 flex-wrap">
        <h2 class="text-sm font-semibold">Registered datasets</h2>
        <span class="text-xs text-[color:var(--text-muted)]">
          A name for a location, so it can be found again.
        </span>
        <button type="button" class="btn btn-default btn-sm ml-auto"
                [disabled]="loading()" (click)="load()">
          <app-icon name="refresh" />
          Refresh
        </button>
      </div>

      <div class="flex gap-2 flex-wrap items-start">
        <input class="input input-sm w-48" placeholder="Name this dataset"
               aria-label="Dataset name"
               [value]="datasetName()" (input)="datasetName.set($any($event.target).value)" />
        <input class="input input-sm w-40" placeholder="Connection"
               aria-label="Connection alias"
               [value]="alias()" (input)="setAlias($any($event.target).value)" />
        <input class="input input-sm flex-1 min-w-48 mono" placeholder="Path inside it"
               aria-label="Dataset path"
               [value]="location()" (input)="setPath($any($event.target).value)" />
        <button type="button" class="btn btn-primary btn-sm"
                [disabled]="!canRegister()" (click)="register()">
          <app-icon name="plus" />
          Register
        </button>
      </div>

      @if (suggestion() && !datasetName()) {
        <button type="button" class="btn btn-ghost btn-xs" (click)="datasetName.set(suggestion())">
          Call it "{{ suggestion() }}"
        </button>
      }

      <p class="field-note text-[color:var(--text-muted)]">
        Registering names a location and proves you can read it. It does not open the file: no
        rows are scanned and no query permit is spent. The format is decided by the server when
        it checks the path, so it is not something to choose here.
      </p>

      @if (registerError()) {
        <p class="text-xs text-crit-500">{{ registerError() }}</p>
      }

      @if (loading()) {
        <p class="text-xs text-[color:var(--text-muted)] py-2">Reading the registry…</p>
      } @else if (error()) {
        <p class="text-xs text-crit-500 py-2">{{ error() }}</p>
      } @else if (!datasets().length) {
        <p class="text-xs text-[color:var(--text-muted)] py-2">
          Nothing registered yet. A registered dataset is a name for a connection and a path —
          it holds no data of its own, and deleting one never touches a file.
        </p>
      } @else {
        <ul class="space-y-1">
          @for (item of datasets(); track item.analyticsDatasetId) {
            <li class="flex items-center gap-2 min-w-0 border-t border-subtle pt-1">
              <button type="button" class="btn btn-ghost btn-sm min-w-0 flex-1 justify-start"
                      [title]="item.connectionAlias + '/' + item.datasetPath"
                      (click)="opened.emit(item)">
                <span class="truncate">{{ item.datasetName }}</span>
              </button>
              @if (item.datasetFormat) {
                <span class="pill shrink-0">{{ item.datasetFormat }}</span>
              }
              <span class="text-[11px] mono text-[color:var(--text-muted)] truncate max-w-72">
                {{ item.connectionAlias }}/{{ item.datasetPath }}
              </span>
              <button type="button" class="btn btn-ghost btn-xs shrink-0" title="Forget this name"
                      (click)="forget(item)">
                <app-icon name="trash" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class DatasetRegistry implements OnInit {

  private readonly analytics = inject(AnalyticsService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  /** The connection and path a host screen is already looking at. Both are editable here. */
  readonly connection = input('');
  readonly path = input('');

  /** A registered dataset the reader wants to open. Whoever owns the browser answers this. */
  readonly opened = output<RegisteredDataset>();

  readonly datasets = signal<RegisteredDataset[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly registering = signal(false);
  readonly registerError = signal('');

  readonly datasetName = signal('');
  /**
   * The two location fields, held apart from the inputs on purpose.
   *
   * A host screen's file is the STARTING POINT and not a binding: a reader who types a different
   * path here and then clicks another file in the rail should not have their typing replaced.
   * `alias()` and `location()` fall back to the inputs only while nothing has been typed.
   */
  private readonly typedAlias = signal<string | null>(null);
  private readonly typedPath = signal<string | null>(null);

  readonly alias = computed(() => this.typedAlias() ?? this.connection());
  readonly location = computed(() => this.typedPath() ?? this.path());

  /** The file's own name, which is what a person calls a dataset before they call it anything. */
  readonly suggestion = computed(() => {
    const parts = this.location().split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  });

  readonly canRegister = computed(() =>
    !!this.datasetName().trim() && !!this.alias().trim() && !!this.location().trim()
    && !this.registering());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.analytics.fetchAllDatasets().subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(response.message || 'The registry could not be read.');
          return;
        }
        this.datasets.set(response.data);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The registry could not be read.');
      },
    });
  }

  register(): void {
    if (!this.canRegister()) return;
    this.registering.set(true);
    this.registerError.set('');
    this.analytics.registerDataset({
      datasetName: this.datasetName().trim(),
      connectionAlias: this.alias().trim(),
      datasetPath: this.location().trim(),
    }).subscribe({
      next: response => {
        this.registering.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          // The resolver's own sentence, verbatim. It says the same thing for "no such
          // connection" and "not yours" so that registration cannot be walked to learn which
          // aliases other workspaces hold, and paraphrasing it here would invent the distinction
          // the server spent effort refusing to make.
          this.registerError.set(response.message || 'That dataset could not be registered.');
          return;
        }
        this.datasetName.set('');
        this.load();
      },
      error: err => {
        this.registering.set(false);
        this.registerError.set(err?.error?.message || 'That dataset could not be registered.');
      },
    });
  }

  async forget(item: RegisteredDataset): Promise<void> {
    const id = item.analyticsDatasetId;
    if (!id) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Forget this dataset?',
      body: `"${item.datasetName}" will be removed from the registry. The file it names is not `
        + 'touched — this registry holds names, never data.',
      confirmLabel: 'Forget',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteDataset(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.toast.error(response.message || 'That dataset could not be removed.');
          return;
        }
        this.load();
      },
      error: err => {
        this.toast.error(err?.error?.message || 'That dataset could not be removed.');
      },
    });
  }

  setAlias(value: string): void { this.typedAlias.set(value); }
  setPath(value: string): void { this.typedPath.set(value); }
}
