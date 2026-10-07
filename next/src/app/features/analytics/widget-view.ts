import { WIDGET_HEIGHT } from './widget-chart';
import { asFilterGroup, isNumericType, pruneFilters } from './filter-builder';
import { Aggregation, AnalysisColumn, AnalysisResult, AnalysisSort, DashboardWidget, FilterGroup, FilterNode, Grain, PivotGrid, QueryResult, TopN, WidgetVisualization, ClassicKind } from './analytics.service';
import { ChartTable, readsAsYears, tableOf } from './charts/chart-table';
import { fitIssues } from './charts/chart-fit';
import { ChartSettings, compactSettings } from './charts/chart-settings';

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
export interface WidgetConfig {
  /** Drawing height in px for the chart kinds that take one. Absent means WIDGET_HEIGHT. */
  height?: number;
  /** A sentence the author writes under the tile. Absent means none; it is never invented. */
  caption?: string;
  /**
   * The "Chart settings" panel's choices, including a theme overriding the board's. Absent means
   * every default, which is how a widget saved before the panel existed keeps drawing as it did.
   * Read through parseSettings, never trusted as stored.
   */
  chart?: ChartSettings;
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
export function widgetConfigOf(widget: DashboardWidget): WidgetConfig {
  if (!widget.widgetConfig) return {};
  try {
    const parsed = JSON.parse(widget.widgetConfig);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as WidgetConfig : {};
  } catch {
    return {};
  }
}

/** Serialises settings back, or null when there is nothing to keep -- never the string '{}'. */
export function widgetConfigString(config: WidgetConfig): string | null {
  const kept: WidgetConfig = {};
  if (config.height && config.height !== WIDGET_HEIGHT) kept.height = config.height;
  if (config.caption && config.caption.trim()) kept.caption = config.caption.trim();
  const chart = config.chart ? compactSettings(config.chart) : undefined;
  if (chart) kept.chart = chart;
  return Object.keys(kept).length ? JSON.stringify(kept) : null;
}

/**
 * Sixty bars in order: where a name under a bar stops fitting.
 *
 * The ring has no refusal by count any more. Donut colours its slices from the categorical ramp,
 * so past CHART_SLOTS a colour would repeat -- and rather than refuse, the smallest slices are
 * added into one "Other" (WidgetChart.donutMarks), the Top-N rule, where the figures add up.
 */
export const ORDERED_BARS = 60;

/**
 * Aggregations whose parts add up to their whole.
 *
 * The list that decides whether a ring is allowed on a tile. A sum of sums is the sum; a sum of
 * averages is nothing at all, so a slice labelled "12%" over a column of averages is a figure
 * this screen would have invented. Identical to the Canvas's ADDITIVE and deliberately so --
 * MINIMUM and MAXIMUM are excluded from both even though they compose, because the minimum of
 * the minimums is a real figure that is still not a PART of anything.
 */
export const ADDITIVE: Aggregation[] = ['COUNT_ROWS', 'COUNT_NON_NULL', 'SUM'];

/** A DATE column, and not a TIMESTAMP: only one of the two has no time to lose. */
export const DATE_ONLY_TYPE = /^DATE$/i;

/**
 * A statistic as a number, or null when it is not one.
 *
 * Every cell crosses the wire as text, so "does this parse" is the only honest test of whether
 * arithmetic applies to it. A failure is not an error -- it is how a date column says it has no
 * length to draw.
 */
export function asNumber(text: string | null | undefined): number | null {
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

/** A BOOLEAN column's type name, as DuckDB gives it. */
export const BOOLEAN_TYPE = /^BOOL(EAN)?$/i;

/**
 * A true/false cell as a reader says it: Yes or No (MIG-367).
 *
 * DuckDB's CSV reader types a column of yes/no answers -- "Yes"/"No", "yes"/"no" -- as BOOLEAN, so a chart of
 * attrition by overtime labelled its bars "true" and "false". Shown as Yes and No; anything else is left as it is. The
 * value a click narrows on stays the raw one (markOperands), so a filter still asks for what the data holds.
 */
export function yesNo(raw: string): string {
  const value = raw.trim().toLowerCase();
  return value === 'true' ? 'Yes' : value === 'false' ? 'No' : raw;
}

/** Whether every present value of a column reads true or false: a saved query's way of being a BOOLEAN column. */
export function readsAsBooleans(values: (string | null)[]): boolean {
  const present = values.filter((value): value is string => value !== null && value !== undefined && String(value).trim() !== '');
  return present.length > 0 && present.every(value => /^(true|false)$/i.test(String(value).trim()));
}

/** One cell of an analysis result, rendered as what its column says it is. */
export function renderCell(column: AnalysisColumn | undefined, raw: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  if (!column) return raw;
  if (BOOLEAN_TYPE.test(column.type ?? '')) return yesNo(raw);
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
export function mergeMarks(pairs: Mark[]): { marks: Mark[]; merged: number } {
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
  /**
   * The same rows split into dimensions and measures, for the ECharts kinds (charts/chart-table.ts).
   * Built with the view, where whether the figures add up is still known. Absent on a view built
   * by hand (the specs' stubs), and the chart then reads one from the rows.
   */
  chart?: ChartTable;
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
export function isNumericLabel(label: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(label.trim());
}

export function nonPositiveNote(marks: Mark[]): string | null {
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
export function issuesFor(marks: Mark[], reason: string, additive: boolean | 'unknown',
    aggregationLabel: string, shape: ResultShape = {}): Record<ClassicKind, string> {

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
          // Past the colours the palette can tell apart the smallest are added into "Other"
          // (WidgetChart.donutMarks): these figures add up, so the tail has a total.
          : ''),
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
export function narrowableDimension(result: AnalysisResult, field: string): boolean {
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
export function markOperands(columns: AnalysisColumn[], dimensionAt: number[],
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

  const additive = !aggregation || ADDITIVE.includes(aggregation);
  const view: WidgetView = {
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
    issues: issuesFor(marks, reason, additive,
      (aggregation ?? '').toLowerCase().replace(/_/g, ' ') || 'this measure',
      { ...shape, rowCount: result.rowCount ?? allRows.length, columnCount: columns.length }) as WidgetView['issues'],
    ranAt: Date.now(),
  };
  // The ECharts kinds read the same rows, split by role, with the question's order and totals.
  return withChartTable(view, {
    additive,
    order: shape.sortedBy === 'MEASURE' ? 'rank'
      : shape.sortedBy === 'DIMENSION' && shape.sortDirection === 'DESC' ? 'reversed' : 'dimension',
    topNTrimmed: !!shape.topNTrimmed,
    emptyReason: reason,
  });
}

/** A view with its ChartTable, and the ECharts kinds' reasons added to its issues. */
export function withChartTable(view: WidgetView, context: Parameters<typeof tableOf>[1]): WidgetView {
  const chart = tableOf(view, context);
  return { ...view, chart, issues: { ...view.issues, ...fitIssues(chart) } };
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
  // A column of true/false answers reads Yes and No, here as on an analysis's BOOLEAN column (yesNo, MIG-367).
  const raw = result.rows ?? [];
  const booleans = columns.map((_, index) => readsAsBooleans(raw.map(row => row[index] ?? null)));
  const allRows = booleans.some(Boolean)
    ? raw.map(row => row.map((cell, index) => (booleans[index] && cell !== null && cell !== undefined ? yesNo(String(cell)) : cell)))
    : raw;
  const readings = columns.map((name, index) => {
    let numbers = 0;
    let negative = 0;
    // A year column is a label, not a figure (readsAsYears, MIG-367): it reads as having no numbers.
    if (readsAsYears(name, allRows.map(row => row[index] ?? null))) return { name, index, numbers, negative };
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

  return withChartTable({
    columns,
    // All true: this path has no roles to read. The server renders every value to text before a
    // query result leaves, so a column of digits here is as likely to be a figure as a label and
    // there is nothing to tell them apart with. That is the behaviour this path already had.
    // (A year column is told apart where it matters -- the chart's split and the table's cells: readsAsYears.)
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
    issues: issues as WidgetView['issues'],
    ranAt: Date.now(),
  }, { additive: 'unknown', emptyReason: reason });
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
  /**
   * The result on screen before this run, kept while the tile waits and runs (owner, 2026-10-06:
   * "the panel dances"). A click that narrowed the board re-ran every tile, and each one dropped
   * its chart for a three-line skeleton and then grew back -- four layouts in two seconds. The
   * tile now keeps drawing what it had, marked busy, until the new answer replaces it. Dropped
   * on a stop or a failure, where the old figure would no longer be what the tile says.
   */
  previous?: WidgetView | null;
}

/** What a saved analysis's one JSON column holds. Written by the Canvas, read here. */
export interface SavedAnalysisConfig {
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
export const HISTOGRAM_FLOOR = 8;

/**
 * A minted run id, scoped to the caller by the server's own registry key.
 *
 * The client names the run because the endpoints are synchronous: an id minted server-side would
 * arrive with the rows, which is after there is anything left to stop.
 */
export function mintQueryId(widgetId: number): string {
  return `widget-${widgetId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * How many rows a table tile shows before "Show all". Five keeps a table a glance on a board of
 * several; the rest arrived with the run and are one click away.
 */
export const TILE_ROWS = 5;

/** A widget's width in a board's twelve columns: a single figure, a chart, or a table. */
export type WidgetSpan = 3 | 6 | 12;

/**
 * Widths within a row of twelve, in board order: the last tile of a row stretches to the row's end
 * whenever the next tile cannot fit beside it, and the last row is filled too. A figure (3) beside
 * a chart (6) with a table after them left a quarter of the row empty.
 */
export function fillRows(spans: readonly number[]): number[] {
  const out = [...spans];
  let used = 0;
  for (let i = 0; i < out.length; i++) {
    if (used > 0 && used + out[i] > 12) {
      out[i - 1] += 12 - used;
      used = 0;
    }
    used += out[i];
    if (used >= 12) used = 0;
  }
  if (used > 0 && out.length) out[out.length - 1] += 12 - used;
  return out;
}

/**
 * The column classes, written out whole so Tailwind finds them in this file. One column on a phone;
 * from sm up a figure takes half and anything else the row; from lg up a figure is a quarter, a
 * chart a half and a table the whole row -- each row then filled by fillRows.
 */
export const SM_SPAN: Record<number, string> = { 6: 'sm:col-span-6', 12: 'sm:col-span-12' };
export const LG_SPAN: Record<number, string> = {
  3: 'lg:col-span-3', 6: 'lg:col-span-6', 9: 'lg:col-span-9', 12: 'lg:col-span-12',
};

/** The kinds that are a grid of rows, and so need the whole width to be read. */
export const ROW_KINDS: ReadonlySet<string> = new Set(['table', 'pivot']);

/** Past this many boards the landing page offers a search box above the cards. */
export const SEARCH_FROM = 6;

/** The file name at the end of a path: what a person calls a file when they are not reading a URL. */
export function fileName(path: string | null | undefined): string {
  const parts = (path ?? '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (path ?? '');
}
