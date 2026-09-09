import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { confirmWith } from '../../shared/ui/confirm';
import { formatSize } from '../../shared/ui/format-size';
import { compactNumber } from '../../shared/charts/number-format';
import { BarChart } from '../../shared/charts/bar-chart';
import { Donut } from '../../shared/charts/donut';
import { Histogram } from '../../shared/charts/histogram';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { RouterLink } from '@angular/router';
import { BucketSummary, ObjectSummary, StorageService } from '../objects/storage.service';
import { SqlEditor } from './sql-editor';
import { DataGrid, GridColumn, GridCopy, GridSort } from './data-grid';
import { DatasetRegistry } from './dashboard';
import {
  FilterBuilder, countFilterClauses, describeClause, emptyFilterGroup, isNumericType,
  pruneFilters,
} from './filter-builder';
import {
  Aggregation, AnalysisColumn, AnalysisCrumb, AnalysisRequest, AnalysisResult, AnalyticsService,
  ColumnProfile, DatasetColumn, DatasetPreview, DatasetProfile, Drill, ExportFile, FilterClause,
  FilterGroup, FilterNode, PreviewShape, QueryResult, QueryRun, RegisteredDataset, SavedAnalysis,
  SavedQuery, WriteBackResult,
} from './analytics.service';

/**
 * The tabs a dataset is read through -- document 02's ten.
 *
 * Schema was once a tab and is not any more: the columns are what a reader checks WHILE looking
 * at the rows, and a tab made the two mutually exclusive. They sit in a rail beside the data,
 * where they can be read together.
 *
 * Profile and Quality are two readings of ONE request, and Columns and Compact are a third and a
 * fourth. They are separate tabs because they answer different questions, but they must never be
 * four scans: `profile()` is fetched once and all four derive from it.
 *
 * COLUMNS AND PROFILE USED TO BE THE SAME TAB WEARING THE WRONG NAME. Document 06 defines Profile
 * as aggregate distributions and type summaries, and Columns as the ~14 per-column statistics.
 * What shipped was the per-column detail under the label "Profile" and no aggregate view at all,
 * so a reader who wanted "what is this file made of" was handed two hundred cards. They are now
 * what 06 says they are, off the one scan that was already being made.
 *
 * Canvas is document 07: dimensions, a measure, a filter tree, drill-down and a pivot. It sits
 * BEFORE SQL rather than after it because it is the tab that does not require the reader to
 * write anything -- the console is the escape hatch for the questions a structured analysis
 * cannot phrase, and an escape hatch belongs at the end of the group and not in the middle.
 *
 * CHARTS WAS DELIBERATELY NOT A TAB, and the reason it is one now comes with a guard. A chart
 * here is drawn from the console's result, and putting the picture on one screen and the query
 * that produced it on another lets a reader edit the SQL, forget to re-run it, switch across and
 * study a chart of the answer to a different question. 02 and 06 both want the tab, so the tab
 * exists -- and `chartStale` watches for exactly that drift and says so on the chart, which the
 * old arrangement achieved by geography.
 */
type Tab = 'overview' | 'compact' | 'data' | 'columns' | 'profile' | 'quality'
  | 'canvas' | 'sql' | 'charts' | 'activity';

/**
 * One heading of the tab strip, and the reason ten tabs are not one row of ten.
 *
 * Ten equal tabs wrap into a second line of undifferentiated words, and a reader looking for
 * "where do I see the rows" has to read all ten. They group, and they group by WHAT EACH ONE
 * COSTS, which is the distinction this module has been organised around from the start:
 *
 *   The file      what the schema and a page of rows already paid for.
 *   Its columns   the four readings of the single SUMMARIZE scan. One permit, spent once, on
 *                 first arrival at any of them; the other three are free after that.
 *   Questions     the tabs where the reader composes something the server then runs. Each one
 *                 can spend a governor permit per press, and Activity is the record of that.
 *
 * That is also the order a dataset is actually read in, so the grouping costs nothing in
 * navigation and buys a reader the answer to "what will this cost me" before they click.
 */
export interface TabGroup {
  label: string;
  /** Said on the group, because the grouping is a claim about cost and should be checkable. */
  hint: string;
  tabs: { id: Tab; label: string }[];
}

/** What a fresh console offers to run, so an empty editor is not also a blank page. */
const STARTER_SQL = 'select *\nfrom dataset\nlimit 100';

/**
 * DuckDB types whose min and max are ALPHABETICAL rather than ordered by value.
 *
 * This is the third of the three things on this screen that surprise a reader, and the only one
 * that is not about precision: on a VARCHAR column "9" is greater than "100", because the engine
 * compares letter by letter. Columns matching this get their min and max labelled "first (A–Z)"
 * and "last (A–Z)" instead. DATE and TIMESTAMP are deliberately NOT here -- their order is the
 * order a reader expects.
 */
const TEXT_TYPE = /^(VARCHAR|CHAR|BPCHAR|TEXT|STRING)\b/i;

/**
 * A statistic as a number, or null when it is not one.
 *
 * SUMMARIZE hands every statistic back as text so that one column can carry a date, a word and
 * an integer, so "does this parse" is the only honest test of whether arithmetic applies. A
 * failure here is not an error: it is how a DATE column says it has no mean.
 *
 * The chart reads a query result's cells through this same function, for the same reason. Those
 * arrive as text too, and a column called "amount" holding "n/a" is a column with a hole in it
 * whatever its type name says.
 */
function asNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  // Number('') is 0, which would turn an absent statistic into a measured zero.
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * One quarter of a numeric column's rows, and the slice of the value range it occupies.
 *
 * This is the distribution the Profile tab draws, and it is drawn this way because it is the only
 * shape the data actually contains. SUMMARIZE returns a five-number summary, not a sample, so
 * there are no values here to bin -- anything with twelve bars on it would be twelve numbers this
 * screen invented. Four blocks, each holding about a quarter of the rows, is the whole of what was
 * measured, and it still shows what a reader came for: a quarter of the rows crammed into a thin
 * block IS the crowd.
 *
 * "About" is load-bearing and is on the screen as well as in this comment. Only two of the five
 * points are exact. min and max were measured; the three quartiles between them come from
 * approx_quantile, which reported 18.375 for a first quartile that was really 21.0.
 *
 * The reason this is not app-histogram, which is the obvious reach: that component bins raw
 * values it is handed, and this screen never has raw values -- feeding it a synthesised sample
 * would draw a distribution the file does not have. Its bin tooltips also say "runs" in so many
 * words, which on a column of sales amounts would be a false sentence on screen.
 */
export interface QuartileSegment {
  from: number;
  to: number;
  /** Share of min→max this quarter spans, as a percentage width. */
  width: number;
  label: string;
}

/** A column as the Profile tab draws it: server figures, parsed only where parsing is safe. */
export interface ColumnView {
  name: string;
  type: string;
  shortType: string;
  /**
   * A type whose min and max are alphabetical, so they are labelled "first" and "last".
   *
   * There is deliberately no matching `numeric` flag. Whether a column has numbers in it is a
   * question the engine already answered by returning a mean and three quartiles or not
   * returning them, and a second list of type names here would be one more copy to keep in step
   * with DuckDB.
   */
  text: boolean;
  /** False only on a dataset with no rows, where there is no percentage to have. */
  measured: boolean;
  /** The engine's own figure, printed as given. */
  nullPercent: number;
  /** The engine's own complement of it. A bar width and a headline, not a count of anything. */
  filledPercent: number;
  /** TOTAL rows in the dataset. Exact, and the only figure on the card that is. */
  rows: number;
  /** Reconstructed from a rounded percentage -- always rendered with "about" in front of it. */
  approxNullRows: number;
  /** A sketch, not a count. Always rendered with "≈" and the word "estimated" beside it. */
  approxDistinct: number;
  /**
   * approxDistinct as a share of the rows, which is 06's "distinct %".
   *
   * Null on a dataset with no rows rather than 0: there is no share of nothing, and a zero here
   * would read as "no distinct values" on precisely the file that has no values at all. It
   * inherits the sketch's inexactness whole and is never printed without it.
   */
  distinctPercent: number | null;
  /** The server's flags, carried through unchanged -- it derived them beside their statistics. */
  allNull: boolean;
  constant: boolean;
  typeSurprise: 'NUMBER' | 'DATE' | null;
  /** MIGHT be a unique key. A suggestion the card shows and the Quality tab does not flag. */
  keyLike: boolean;
  /** Raw, so the template can tell a null apart from a blank -- they are different facts. */
  min: string | null;
  max: string | null;
  avg: string | null;
  std: string | null;
  /** Display forms. A text column keeps its raw value: "007" tidied to 7 is a different value. */
  minLabel: string;
  maxLabel: string;
  avgLabel: string;
  stdLabel: string;
  /**
   * The three estimated quartiles, written out.
   *
   * 06 asks for "percentile values where applicable" and the spread bar draws them without ever
   * naming one. They are approx_quantile and are labelled estimated wherever they appear; an
   * empty string is how a column with no quantiles says so, which is most text columns.
   */
  q25Label: string;
  medianLabel: string;
  q75Label: string;
  /** Empty on every column with no numeric range to spread, which is most of them. */
  spread: QuartileSegment[];
  spreadSummary: string;
}

/**
 * One row of the Compact view: 06's seven fields, one line per column.
 *
 * The dense mode is the only genuinely new view in this wave, and its job is to make a
 * two-hundred-column file scannable in one screen -- so every field here is either exact or
 * carries its hedge INSIDE the string, because a dense table has no room for a sentence under
 * each figure and a bare "≈" is not a warning anybody reads.
 *
 * `sample` is the one field that is not from the profile scan, and it is the one to be careful
 * about: it is the first value the CURRENT PAGE of the Data tab happens to hold, so it moves
 * when the reader turns a page, sorts or filters. It is a specimen, not a statistic, and the tab
 * says so above the table rather than leaving it to be assumed representative.
 */
export interface CompactRow {
  name: string;
  type: string;
  shortType: string;
  /** The specimen value, already rendered. Empty when the page in hand has none to show. */
  sample: string;
  /** 'null', 'blank', 'value' or 'none' -- so the template can tell three absences apart. */
  sampleKind: 'value' | 'null' | 'blank' | 'none';
  /** '' when the dataset has no rows and there is no percentage to give. */
  nullLabel: string;
  /** Always carries its "≈", because it is built on the HyperLogLog sketch. */
  distinctLabel: string;
  /**
   * 06's "key metric": the one figure that says most about THIS column.
   *
   * Chosen by what the engine returned rather than by a type name, which is the same test the
   * Profile card uses: a mean where there is one, the estimated median where there are quantiles
   * but no mean, and the extremes otherwise. `metricName` travels with it so the number is never
   * a bare figure with no idea what it measures.
   */
  metricName: string;
  metricValue: string;
  /** True where the metric is an approx_quantile rather than a measurement. */
  metricEstimated: boolean;
  /** The loudest quality finding on this column, or null where it raised nothing. */
  level: 'crit' | 'warn' | 'note' | null;
  quality: string;
  qualityDetail: string;
  /** False on a column the quality pass skipped -- which is not the same as one it cleared. */
  checked: boolean;
}

/**
 * One band of an aggregate distribution on the Profile tab: a count of COLUMNS, not of rows.
 *
 * The distinction is the whole risk of that tab. "42% empty" as a headline over a file reads as
 * a statement about cells, and every figure Profile has to work from is per column -- so a band
 * is labelled with what it counts and the tab says which of the two it is measuring.
 */
export interface ProfileBand {
  name: string;
  /** Columns in this band. */
  value: number;
  /** What puts a column here, in words, for the title attribute. */
  detail: string;
}

/**
 * Something on one column worth a reader's attention, in the words the Quality tab says it in.
 *
 * A finding exists so the tab can LEAD with the problem rather than listing every column
 * equally. A clean dataset produces none of these, and that is a sentence rather than an empty
 * table.
 */
export interface QualityFinding {
  column: string;
  /** crit: the column carries nothing usable. warn: it is readable but mostly is not there. */
  level: 'crit' | 'warn' | 'note';
  /** Three or four words, so a column of them can be scanned. */
  title: string;
  /** The sentence under it, carrying the figure and -- where the figure is not exact -- its hedge. */
  detail: string;
}

/**
 * The extensions this reader accepts, which is a SECOND COPY of the list DatasetRef.Format.of
 * owns on the server.
 *
 * It is one constant because two call sites need it -- the file list and the folder-as-dataset
 * offer -- and a copy of a copy drifts twice as fast. The copy that can still drift is the
 * server's, and analytics.spec.ts pins the two against each other, a test being the only thing
 * that will notice the day a reader is added on one side only. Anchored at the end because the
 * server splits on the LAST dot, so a sales.csv.gz is a gz to both of us.
 */
const READABLE_FILE = /\.(csv|tsv|json|jsonl|ndjson|parquet)$/i;

/**
 * The four ways the console will draw a result, each one a shared chart primitive and nothing
 * new.
 *
 * There are deliberately only four, and there is deliberately no builder around them. /reports
 * already owns a chart builder with ten kinds and three export destinations, and a second one
 * here would be the duplication this module's own design notes warn about by name. What a chart
 * is FOR on this screen is narrower than that: a person has just written a query and wants to
 * see the shape of what came back, next to the rows it came from. Nothing is saved, nothing is
 * laid out on a board, and nothing leaves the page -- the export stack beside it already does
 * that, for the data rather than for a picture of it.
 */
export type ChartKind = 'bar' | 'ranked' | 'donut' | 'histogram';

/**
 * A chart kind with the reason it cannot be drawn, or '' when it can.
 *
 * The same shape connectionOptions() carries, and for the same reason: an option that is listed
 * and inert with its reason on it teaches more than one that quietly disappears. A reader who
 * cannot find "share of the total" needs to be told that a ring of 43 slices is not a chart,
 * not left to wonder whether the console has one.
 */
export interface ChartKindOption {
  id: ChartKind;
  label: string;
  issue: string;
}

/**
 * One column of a result, measured by TRYING every cell in it.
 *
 * The result is columns and rows of text -- a DECIMAL or a TIMESTAMP has no JSON form that
 * survives the trip unchanged, so the server renders every value server-side and the type names
 * do not come with it. That leaves parsing as the only honest test of whether a column can be a
 * length on a chart, and it is a better test than a type name would have been: a VARCHAR column
 * of "1200", "980", "n/a" is drawable and a column typed DOUBLE whose every row is null is not.
 */
export interface ColumnReading {
  name: string;
  /** Position in the result's own column order, which is how a row is indexed. */
  index: number;
  rows: number;
  /** Rows whose value parses as a finite number. */
  numbers: number;
  /** Rows with no value at all: a real null, or a cell holding only spaces. */
  missing: number;
  /** Rows holding something that is not a number. Unknown, and never zero. */
  unparsed: number;
  negative: number;
  /** Distinct texts, which is what decides whether a ring can be read. */
  distinct: number;
  /** Distinct numbers. One repeated value has no distribution, however many rows carry it. */
  distinctNumbers: number;
}

/** One mark on a categorical chart: a label, the numbers under it, and how many rows those were. */
export interface ChartPoint {
  name: string;
  value: number;
  rows: number;
}

/**
 * Four presentation limits, kept together because they are all the same kind of decision.
 *
 * None is a fact about data; each one is a judgement about what can still be READ, which is why
 * they sit beside the sentences that explain them rather than inside the chart components. The
 * Quality tab's 25% and its six standard deviations are here for the same reason.
 */
// Six, not eight, for both of these: Donut and RankedBar colour their marks var(--chart-N % 6),
// so a ring of eight drew slices 7 and 8 in the same colours as 1 and 2 and gave the legend two
// names per swatch. A palette is a real limit on how many categories a chart can distinguish, and
// picking a threshold past it makes the chart lie about which slice is which.
const DONUT_SLICES = 6;
const ORDERED_BARS = 60;
const RANKED_ROWS = 6;
const DISTRIBUTION_MIN = 8;

// ---- the canvas: document 07 ----------------------------------------------------------------

/**
 * The eight aggregations with the words a reader picks them by, and whether each needs a column.
 *
 * `needsField` is not presentation. COUNT_ROWS is the only one that answers a question about
 * rows rather than about a column, so it is the only one that may be run with no field chosen --
 * and every other one with no field is an INCOMPLETE analysis rather than a defaulted one. The
 * Run control is disabled on this flag rather than the request being sent and refused, because a
 * refusal from the server for something the screen already knew is a round trip that teaches the
 * reader nothing.
 *
 * `hedge` is what the figure cannot say about itself, and it is empty for six of the eight. The
 * two that carry one carry it because the number they produce is not the number a reader assumes:
 * a distinct count over a large file is very often a sketch, and a median over a large file is
 * very often an approximate quantile -- which is exactly what SUMMARIZE already returns on the
 * Profile tab, where the same two figures are labelled "estimated" for the same reason.
 */
export const AGGREGATIONS: { id: Aggregation; label: string; needsField: boolean; hedge: string }[] = [
  { id: 'COUNT_ROWS', label: 'Count rows', needsField: false, hedge: '' },
  { id: 'COUNT_NON_NULL', label: 'Count non-null', needsField: true, hedge: '' },
  {
    id: 'DISTINCT_COUNT', label: 'Distinct count', needsField: true,
    hedge: 'A distinct count over a large file is commonly a sketch rather than a count. This '
      + 'screen reports whatever the server names the column, and says so beside the figure.',
  },
  { id: 'SUM', label: 'Sum', needsField: true, hedge: '' },
  { id: 'AVERAGE', label: 'Average', needsField: true, hedge: '' },
  { id: 'MINIMUM', label: 'Minimum', needsField: true, hedge: '' },
  { id: 'MAXIMUM', label: 'Maximum', needsField: true, hedge: '' },
  {
    id: 'MEDIAN', label: 'Median', needsField: true,
    hedge: 'On an even number of rows a median has two middle values. On a number column the '
      + 'server interpolates between them; on a date or a text column it returns the lower of '
      + 'the two, because interpolating a date produces a time the column never held.',
  },
];

/**
 * Aggregations whose parts add up to their whole.
 *
 * The one list that decides whether a total, a ring or a percentage is allowed. A sum of sums is
 * the sum; a sum of averages is nothing at all, and a donut slice labelled "12%" over a column of
 * averages is a number this screen would have invented. RankedBar's percentages are switched off
 * for the same reason on the SQL tab, and MINIMUM and MAXIMUM are excluded even though they
 * compose -- the minimum of the minimums is a real figure, but it is not a PART of anything, so a
 * bar of it in a stack or a slice of it in a ring still asserts an addition that did not happen.
 */
const ADDITIVE: Aggregation[] = ['COUNT_ROWS', 'COUNT_NON_NULL', 'SUM'];

/** 07's three named Top-N sizes. A fourth, custom, is typed rather than picked. */
const TOP_N_CHOICES = [10, 25, 50];

/** How the analysis result is drawn. 'table' is always available; the rest have conditions. */
export type CanvasKind = 'table' | 'pivot' | 'ranked' | 'bar' | 'donut';

/**
 * Numeric text on the wire, written the way a person writes a number.
 *
 * The defect this closes is measured and is recorded in the tracker: `sum(amount)` comes back as
 * <b>"7.466125E7"</b>, which is 74,661,250 -- and a currency total is the single most likely
 * thing anybody aggregates on this screen. A reader who does not parse scientific notation at a
 * glance reads that as seven point something.
 *
 * The expansion is done on the STRING, digit by digit, and never through Number. Going via a
 * float would round a DECIMAL(38,10) on the way past, so a function written to make a total
 * legible would quietly change it -- the exact failure this is here to prevent.
 *
 * A value already written as a plain decimal is returned UNTOUCHED, trailing zeros and all.
 * "12500.00" is a currency amount with two places, and normalising it to "12500" would throw
 * away the scale the engine chose to send.
 */
export function plainDecimal(text: string): string {
  const trimmed = text.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(trimmed);
  if (!match) return text;
  const [, sign, whole, fraction = '', exponentText] = match;
  const exponent = Number(exponentText);
  const digits = whole + fraction;
  // Where the point sits after the shift, counted from the left of `digits`.
  const point = whole.length + exponent;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A DATE rendered as a date.
 *
 * The second measured defect: `min(booked_on)` on a DATE column comes back as
 * <b>"2024-01-01 00:00:00.0"</b> -- a midnight that does not exist in the data, because the
 * column has no time at all. Printing it whole tells a reader the file records a time it does
 * not record.
 *
 * The zero time is REQUIRED for the trim. A value carrying an actual time under a column typed
 * DATE is a contradiction between the type and the value, and the right thing to do with a
 * contradiction is show it rather than tidy away the half that reveals it.
 */
export function dateOnly(text: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ]00:00(?::00(?:\.0+)?)?$/.exec(text.trim());
  return match ? match[1] : text;
}

const DATE_ONLY_TYPE = /^DATE$/i;

/**
 * Analytics Studio, phase one: pick a file in object storage and read it safely.
 *
 * The left rail is the same connection -> folder -> file walk the Object Browser does, and it
 * uses that screen's own StorageService rather than a second copy of it. What is new begins when
 * a file is selected: the schema and the rows come from the analytics API, which runs DuckDB
 * against the object store directly, so a gigabyte file costs the browser one page of rows and
 * costs Spring no streaming at all.
 *
 * Nothing here ever names a bucket or a URL. A dataset is a CONNECTION plus a path inside it,
 * and the server decides which bucket that means -- so this component cannot express "read
 * somewhere else with those credentials" even if it wanted to.
 *
 * PHASE TWO ADDS TWO TABS AND ONE PROBLEM. Profile and Quality both read a SUMMARIZE scan, and
 * three of the figures in it are not exact: the distinct count is a sketch, the null percentage
 * is rounded to two places so any row count taken from it is approximate, and min and max on a
 * text column are alphabetical rather than ordered. This screen has refused to overclaim
 * everywhere else -- the Azure gate, the unordered-paging note, the refusal it repeats verbatim
 * rather than paraphrasing -- and a Profile tab printing "1,234 distinct" where it means "about
 * 1,200" would be the first place it lied. So each of the three is hedged AT the number it
 * qualifies rather than in a note under the table: "≈" and "estimated" beside a distinct count,
 * "about" in front of every derived row count, and "first (A–Z)" / "last (A–Z)" as the labels on
 * a text column's extremes.
 *
 * PHASE THREE ADDS THE SQL CONSOLE, AND A FOURTH FIGURE THAT IS NOT WHAT IT LOOKS LIKE. A query
 * with no LIMIT of its own is wrapped in the server's row ceiling before it runs, so a result can
 * stop at the ceiling rather than at the end of the data, and the count under it is then a count
 * of what came back rather than of what matched. That is the same class of mistake as a distinct
 * estimate printed as a count and an order of magnitude more dangerous: a reader handed ten
 * thousand rows out of forty thousand and not told has a WRONG answer, not a short one, and will
 * go and act on it. So truncation is said beside the count itself, in the row of numbers a person
 * reads first, and not in a note under the table.
 *
 * The other rule the console keeps is the one this screen already kept about refusals. Several of
 * the sentences the server sends back are the statement gate turning down a query that named a
 * location of its own; they are security refusals, written for a reader, and they are shown word
 * for word rather than folded into a "query failed" of this screen's own invention.
 *
 * PHASE FOUR DRAWS THE RESULT, AND A CHART IS THE EASIEST PLACE ON THIS WHOLE SCREEN TO LIE. The
 * table under it at least shows a reader every row it is claiming; a bar chart compresses ten
 * thousand rows into eight shapes and asks to be believed on the strength of how finished it
 * looks. Three of those lies are available for free and each is refused here in the same way the
 * three inexact figures above it are -- at the mark, not in a footnote:
 *
 *   A TRUNCATED RESULT. "Sales by region" over the first ten thousand of forty thousand rows is
 *   not a slightly-off chart, it is a wrong one, and it looks exactly as confident as a right
 *   one. The chart says it is partial beside its own title and again in a strip above it, every
 *   time, and neither sentence guesses how many rows are missing because nothing here knows.
 *
 *   A ROW THAT DOES NOT PARSE. It is unknown, not zero. Coercing it would move a bar down by an
 *   amount nobody measured, so those rows are left out and counted out loud instead.
 *
 *   TOO MANY CATEGORIES. Forty-three of them cannot be read, so the ranked view keeps the
 *   largest few and says which -- rolling the rest into one "Other" rather than dropping the
 *   tail and drawing what is left as if it were everything.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-analytics',
  imports: [
    Icon, TableShell, SqlEditor, BarChart, Donut, RankedBar, Histogram, FilterBuilder, DataGrid,
    DatasetRegistry, RouterLink,
  ],
  templateUrl: './analytics.html',
})
export class Analytics implements OnInit {

  private readonly storage = inject(StorageService);
  private readonly analytics = inject(AnalyticsService);
  private readonly dialog = inject(Dialog);

  readonly humanSize = formatSize;
  readonly compact = compactNumber;

  // ---- the storage walk ----------------------------------------------------------------

  readonly connections = signal<BucketSummary[]>([]);
  readonly connection = signal<string>('');

  /**
   * Why Analytics Studio cannot read a connection the storage rail is offering, or '' when it
   * can. One sentence, written to be read on the option itself.
   *
   * storage.json/buckets is the Object Browser's list, and the Object Browser reads more than
   * this screen does: FTP and FTPS come back from it, and so do BUCKET_LIST lookup entries that
   * have no storage_connection row behind them at all. The resolver knows about object-store
   * connections and nothing else, so every one of those was a control that could be operated and
   * could not work -- pick it, browse a whole tree, and be refused on every file with "Storage
   * connection not found." about something sitting right there in the picker.
   *
   * They stay listed and go inert, which is the treatment an unreadable FILE already gets one
   * level down, for the same reason: knowing the connection is there and why it cannot be read
   * is more useful than it vanishing out of a picker the user configured themselves.
   *
   * AZURE is refused here even though it is an object store. The Azure path exists in
   * DuckDbSessionFactory and has never been run against a real container -- a different DuckDB
   * extension, a different secret shape, a different URL scheme, and none of the evidence that
   * covers the S3 protocol. (That evidence is itself narrower than it sounds: every connection it
   * was gathered from carries an explicit endpoint -- MinIO, and LocalStack for the S3-typed ones
   * -- so AWS proper is unexercised too. The server's message no longer claims otherwise.)
   * The server gates it this round with the same fact, so this says the
   * same thing rather than offering a control the server will refuse. "yet" is doing real work
   * in that sentence: unlike FTP, this one is expected to change.
   */
  connectionIssue(provider: string | null | undefined): string {
    switch ((provider ?? '').trim().toUpperCase()) {
      case 'S3':
      case 'MINIO':
        return '';
      case 'AZURE':
        return 'Analytics Studio has not been verified against Azure Blob yet.';
      case 'FTP':
      case 'FTPS':
        return `Analytics Studio reads object storage; this connection is ${provider}.`;
      default:
        // A blank or unrecognised provider is either a connection with none recorded or a
        // BUCKET_LIST lookup child, whose "provider" is really its free-text description.
        return 'This bucket is not configured as an object-storage connection.';
    }
  }

  /** The picker's rows: every connection the rail offers, each carrying its own verdict. */
  readonly connectionOptions = computed(() => this.connections().map(item => ({
    bucket: item.bucket,
    label: item.label,
    provider: item.provider,
    issue: this.connectionIssue(item.provider),
  })));

  readonly readableConnections = computed(() => this.connectionOptions().filter(o => !o.issue));

  /**
   * Connections exist and not one of them can be read.
   *
   * Worth saying out loud, because the picker in that state looks identical to a broken one:
   * every option greyed out and nothing selected.
   */
  readonly noReadableConnection = computed(
    () => !!this.connectionOptions().length && !this.readableConnections().length);
  readonly prefix = signal<string>('');
  readonly entries = signal<ObjectSummary[]>([]);
  readonly browsing = signal(false);
  readonly browseError = signal('');

  /**
   * Filters the current folder by name.
   *
   * Local to the folder rather than a search across the bucket: listObjects returns one prefix
   * at a time, so a bucket-wide search would be a different request the API does not offer.
   * Saying "in this folder" on the control is what keeps that honest.
   */
  readonly filter = signal('');

  /** The folder path as clickable segments, so a reader can jump back up without retyping. */
  readonly crumbs = computed(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((name, index) => ({ name, prefix: parts.slice(0, index + 1).join('/') + '/' }));
  });

  /** Folders first, then files, each alphabetical -- the order a file browser is expected in. */
  private readonly matching = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    const all = this.entries();
    return needle ? all.filter(e => e.name.toLowerCase().includes(needle)) : all;
  });

  readonly folders = computed(() => this.matching().filter(e => e.folder));
  readonly files = computed(() => this.matching().filter(e => !e.folder));
  readonly filtered = computed(() => this.matching().length !== this.entries().length);

  /**
   * Whether a file is one this reader can open.
   *
   * The same extensions the backend accepts. Checked here as well so an unreadable file is
   * visibly inert rather than offering a click that returns a refusal.
   */
  readable(key: string): boolean {
    return READABLE_FILE.test(key);
  }

  // ---- the selected dataset ------------------------------------------------------------

  readonly path = signal<string>('');
  readonly selected = signal<ObjectSummary | null>(null);
  readonly tab = signal<Tab>('overview');

  /**
   * The tab strip, grouped. See TabGroup for why ten tabs are not one row of ten.
   *
   * A list rather than ten copies of the same bindings in the template. Ten copies is where the
   * third one quietly stops matching the others.
   */
  readonly tabGroups: TabGroup[] = [
    {
      label: 'The file',
      hint: 'Already paid for by opening it — the schema and a page of rows.',
      tabs: [
        { id: 'overview', label: 'Details' },
        { id: 'data', label: 'Data' },
      ],
    },
    {
      label: 'Its columns',
      hint: 'Four readings of ONE scan of the whole file. The scan is made once, on the first '
        + 'of these you open, and the other three are free after that.',
      tabs: [
        { id: 'compact', label: 'Compact' },
        { id: 'columns', label: 'Columns' },
        { id: 'profile', label: 'Profile' },
        { id: 'quality', label: 'Quality' },
      ],
    },
    {
      label: 'Questions',
      hint: 'Where you ask the server something. Each run is a real query against the file.',
      tabs: [
        { id: 'canvas', label: 'Canvas' },
        { id: 'sql', label: 'SQL' },
        { id: 'charts', label: 'Charts' },
        { id: 'activity', label: 'Activity' },
      ],
    },
  ];

  /** Every tab, flat, for the code that only needs the list and not the shape of the strip. */
  readonly tabs: { id: Tab; label: string }[] = this.tabGroups.flatMap(group => group.tabs);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly columns = signal<DatasetColumn[]>([]);
  readonly format = signal<string>('');
  readonly multiFile = signal(false);
  readonly preview = signal<DatasetPreview | null>(null);

  /**
   * The profile scan, which the Profile and Quality tabs share.
   *
   * Held separately from loading()/error() rather than folded into them because it is a
   * different request with a different fate: the rows can be there while the profile has failed,
   * and a reader on the Data tab should not be told the dataset could not be read because a tab
   * they have not opened could not be scanned.
   */
  readonly profile = signal<DatasetProfile | null>(null);
  readonly profileLoading = signal(false);
  readonly profileError = signal('');

  readonly hasDataset = computed(() => !!this.path());
  readonly rowCount = computed(() => this.preview()?.totalRows ?? 0);
  readonly columnCount = computed(() => this.columns().length);

  /** The last path segment, or the pattern itself, which is what the header should say. */
  readonly datasetName = computed(() => {
    const path = this.path();
    const at = path.lastIndexOf('/');
    return at < 0 ? path : path.slice(at + 1);
  });

  readonly pageCount = computed(() => {
    const preview = this.preview();
    if (!preview || !preview.pageSize) return 0;
    // The FILTERED total on purpose: this is what the pager divides, and a pager built on the
    // size of the file would offer pages of a filtered result that come back empty.
    return Math.ceil(preview.totalRows / preview.pageSize);
  });

  // ---- the data grid ---------------------------------------------------------------------

  /**
   * What the grid has asked the SERVER for. None of it is applied in the browser.
   *
   * Held here rather than inside DataGrid because the grid is presentational: it emits the
   * intent and this screen turns it into a request. That split is what stops a sort looking
   * applied while the rows on screen are still the previous page's, which is the most
   * convincing wrong answer this screen could give.
   */
  readonly gridSort = signal<GridSort | null>(null);
  readonly gridSearch = signal('');
  readonly gridFilters = signal<FilterClause[]>([]);

  /**
   * The size of the dataset with nothing narrowing it, once something has counted it.
   *
   * Null until a response arrives that was NOT filtered, and that is the only thing ever written
   * here: the moment a filter goes on, `preview().totalRows` becomes a count of the matches, and
   * a screen that overwrote this with it would have no way back to the size of the file. It is
   * what lets the grid print "1,204 of 250,000" instead of a bare "1,204" that reads as the whole
   * dataset having shrunk.
   */
  readonly datasetRows = signal<number | null>(null);

  /**
   * Whether the rows and the total on screen are narrowed.
   *
   * The server's own flag, which is authoritative because the server is what applied the filter.
   * The fallback is what THIS SCREEN asked for, used only when a response carries no flag at all
   * -- and it errs the same way the flag would: a search or a filter in hand means the count is
   * a count of matches, whatever the response forgot to say.
   */
  readonly previewFiltered = computed(() => {
    const preview = this.preview();
    if (!preview) return false;
    return preview.filtered ?? this.gridNarrowing();
  });

  /** Whether what the reader has asked for removes rows, as opposed to only reordering them. */
  private gridNarrowing(): boolean {
    return !!this.gridSearch().trim() || this.gridFilters().length > 0;
  }

  /**
   * The grid's columns: the preview's own order, carrying the schema's types.
   *
   * The preview's column list rather than the schema's, because the cells in a row are indexed by
   * position in THAT list. Where the two agree -- which is every plain preview -- this is the
   * same thing said twice; where they could ever disagree, the rows are what must win, or every
   * cell in the grid would be under the wrong heading.
   */
  readonly gridColumns = computed<GridColumn[]>(() => {
    const types = new Map(this.columns().map(column => [column.name, column.type]));
    const names = this.preview()?.columns ?? this.columns().map(column => column.name);
    return names.map(name => ({ name, type: types.get(name) ?? '' }));
  });

  /** Distinct per dataset: two files do not share a column layout. See DataGrid's storageKey. */
  readonly gridStorageKey = computed(() =>
    this.hasDataset() ? `${this.connection()}:${this.path()}` : '');

  // ---- the dataset registry ---------------------------------------------------------------

  /**
   * Whether the registry panel is open, and why it is behind a disclosure at all.
   *
   * DatasetRegistry reads the registry on creation. Rendering it unconditionally would spend that
   * read on every file open for a feature most readers never touch, and `@if` is what makes the
   * cost follow the click -- the same bargain the profile scan and the query library already make
   * on this screen. It is on the Details tab because naming a location is a fact about the file
   * rather than a question asked of it.
   */
  readonly registryOpen = signal(false);

  /**
   * Opens a dataset somebody registered by name.
   *
   * The registry stores a connection alias and a path, and neither is guaranteed to still be
   * readable from here: a name can outlive the connection it points at, and the picker on this
   * screen refuses several kinds of connection the registry never checked. So the connection is
   * put through the same gate pickConnection uses rather than being set directly, and a name that
   * leads somewhere this screen cannot go says so instead of opening a blank pane.
   */
  openRegistered(dataset: RegisteredDataset): void {
    const alias = dataset.connectionAlias;
    const path = dataset.datasetPath;
    if (!alias || !path) return;
    if (!this.readableConnections().some(option => option.bucket === alias)) {
      this.browseError.set(`"${dataset.datasetName}" is registered under ${alias}, which is not a `
        + 'connection Analytics Studio can read from here.');
      return;
    }
    if (alias !== this.connection()) {
      this.connection.set(alias);
      this.filter.set('');
      this.clearDataset();
    }
    // The folder the file sits in, so the rail lands beside it rather than at the bucket root --
    // a registered path is usually deep, and a reader who opens one wants its neighbours too.
    const at = path.lastIndexOf('/');
    this.prefix.set(at < 0 ? '' : path.slice(0, at + 1));
    this.browse();
    // The registry holds a path and never an ObjectSummary, so there is no size or modified date
    // to show. selected() stays null, which is the same state a folder-as-dataset open leaves.
    this.selected.set(null);
    this.load(path);
  }

  /** The outcome of the last cell copy, said out loud because a clipboard write can be refused. */
  readonly copyNote = signal('');

  /**
   * A cell was copied -- or was not, which is the half worth saying.
   *
   * DataGrid does the clipboard write itself and reports what happened; this only narrates it.
   * A silent failure here is a reader pasting whatever was on the clipboard before.
   */
  onCopyCell(copy: GridCopy): void {
    this.copyNote.set(copy.copied
      ? `Copied ${copy.column}${copy.value === null ? ' (it is null, so nothing was copied)' : ''}.`
      : `Your browser would not let the page write to the clipboard, so ${copy.column} `
        + 'was not copied.');
  }

  /**
   * A new sort, from a header click. Null is a real request: object storage has no row order.
   *
   * Every one of the three below goes back to page 0, and that is not tidiness. Page 7 of an
   * unsorted file and page 7 of a sorted one hold different rows, and page 7 of a filter that
   * matched forty rows does not exist at all -- so keeping the page number would ask the server
   * for a window that is either meaningless or empty, and an empty answer reads as "the filter
   * matched nothing".
   */
  onGridSort(sort: GridSort | null): void {
    this.gridSort.set(sort);
    this.loadPage(0);
  }

  onGridSearch(search: string): void {
    this.gridSearch.set(search);
    this.loadPage(0);
  }

  onGridFilters(filters: FilterClause[]): void {
    this.gridFilters.set(filters);
    this.loadPage(0);
  }


  private clearGridState(): void {
    this.gridSort.set(null);
    this.gridSearch.set('');
    this.gridFilters.set([]);
    this.datasetRows.set(null);
    this.copyNote.set('');
  }

  ngOnInit(): void {
    this.storage.buckets().subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) { this.browseError.set(response.message); return; }
        this.connections.set(response.data ?? []);
        // Open on the first READABLE connection rather than an empty shell: the screen's whole
        // job is reading data, and an empty picker shows nothing about what it does. First
        // readable, not simply first, because the rail's order is the storage list's order and
        // an FTP connection is as likely to lead it as anything else.
        const first = this.readableConnections()[0];
        if (first) this.pickConnection(first.bucket);
      },
      error: () => this.browseError.set('Could not load your storage connections.'),
    });
  }

  // ---- browsing ------------------------------------------------------------------------

  pickConnection(bucket: string): void {
    // The option is already disabled, so nothing in the template can get here. This is the
    // second door being locked as well: selecting an unreadable connection would browse a tree
    // that refuses every file in it, which is the exact experience the option gating removes.
    if (!this.readableConnections().some(option => option.bucket === bucket)) return;
    this.connection.set(bucket);
    this.prefix.set('');
    this.filter.set('');
    this.clearDataset();
    this.browse();
  }

  openFolder(key: string): void {
    this.prefix.set(key);
    this.filter.set('');
    this.browse();
  }

  goToCrumb(prefix: string): void {
    this.prefix.set(prefix);
    this.filter.set('');
    this.browse();
  }

  goToRoot(): void {
    this.prefix.set('');
    this.filter.set('');
    this.browse();
  }

  private browse(): void {
    const connection = this.connection();
    if (!connection) return;
    this.browsing.set(true);
    this.browseError.set('');
    this.storage.listObjects(connection, this.prefix()).subscribe({
      next: response => {
        this.browsing.set(false);
        if (response.status !== API_SUCCESS) { this.browseError.set(response.message); return; }
        this.entries.set(response.data?.objects ?? []);
      },
      error: err => {
        this.browsing.set(false);
        this.browseError.set(err?.error?.message || 'Could not list this folder.');
      },
    });
  }

  // ---- opening a dataset ---------------------------------------------------------------

  openFile(entry: ObjectSummary): void {
    if (!this.readable(entry.key)) return;
    this.selected.set(entry);
    this.load(entry.key);
  }

  /**
   * Reads the current folder as ONE dataset, by pattern.
   *
   * The case this exists for: a folder holding a file per day, or per partition, that is only
   * meaningful read together. DuckDB unions them, so the row count and every column below cover
   * every matching file rather than one of them.
   */
  openFolderAsDataset(extension: string): void {
    this.selected.set(null);
    this.load(`${this.prefix()}*.${extension}`);
  }

  /** Extensions present in this folder, so "read all of these together" only offers real ones. */
  readonly folderFormats = computed(() => {
    const seen = new Set<string>();
    for (const file of this.files()) {
      const match = READABLE_FILE.exec(file.key);
      if (match) seen.add(match[1].toLowerCase());
    }
    return [...seen].sort();
  });

  private load(path: string): void {
    this.path.set(path);
    this.tab.set('overview');
    this.loading.set(true);
    this.error.set('');
    this.columns.set([]);
    this.preview.set(null);
    // A profile describes one dataset and nothing else. Carrying the last one into this open
    // would put another file's column statistics under this file's name.
    this.clearProfile();
    // The same argument, one tab along: a result table left standing under a new file's heading
    // claims to be that file's answer. The SQL itself STAYS -- it is the reader's own work, and
    // running the statement they just wrote against the next file is a normal thing to want.
    this.clearResult();
    // The Canvas does NOT keep its picks the way the SQL editor keeps its text, and the reason is
    // the difference between the two: a statement is prose that may well still apply, while a
    // dimension is the name of a column in the file being closed. Carrying "region" into a file
    // with no region column produces an analysis that fails at the server; carrying it into a
    // file that HAS a region column meaning something else produces one that does not.
    this.clearCanvas();
    // A sort names a column of the file being closed and a filter names a value in it, so neither
    // survives the open -- the same argument the Canvas's picks lose. datasetRows goes with them:
    // it is the size of a different file.
    this.clearGridState();

    const connection = this.connection();
    this.analytics.schema(connection, path).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.loading.set(false);
          // The server's message is written for a reader, so it is shown rather than replaced.
          this.error.set(response.message);
          return;
        }
        this.columns.set(response.data.columns ?? []);
        this.format.set(response.data.format);
        this.multiFile.set(response.data.multiFile);
        this.loadPage(0);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The dataset could not be read.');
      },
    });
  }

  /**
   * One page of rows, in the order and the narrowing the grid asked for.
   *
   * <b>THE ONE THING HERE THAT PREVENTS A WRONG NUMBER RATHER THAN A SLOW ONE IS
   * knownTotalFiltered.</b> Everything else in the shape is the reader's request; that flag is
   * the PROVENANCE of the total travelling beside it, and it is read off the response that
   * produced that total rather than derived from what is being asked for now. The two are
   * different questions and the difference is the whole defect:
   *
   *   filter on   -> the server counts the matches, answers totalRows=1,204 with filtered=true.
   *   filter off  -> this request does not narrow, so the server WOULD reuse a carried total.
   *                  The total in hand is 1,204, counted under the filter that has just been
   *                  removed. Reused, the pager offers two pages of a dataset with four hundred
   *                  and the file appears to have permanently shrunk for having been filtered
   *                  once -- rows the reader can no longer reach and nothing on screen saying so.
   *
   * So the flag echoes `preview().filtered`, which is the flag of the response the number came
   * from, and the server refuses the total on exactly that request. Deriving it from
   * `gridNarrowing()` instead would be right on every request except the one that matters, since
   * clearing a filter is precisely when the screen is not narrowing and the number in hand is.
   */
  loadPage(page: number): void {
    const path = this.path();
    if (!path) return;
    this.loading.set(true);
    // Carry the total forward. A page turn is TWO server queries -- a COUNT(*) and the page --
    // against a governor that admits four at a time, and the count is one this screen is already
    // holding from the page before it. load() clears preview() before every fresh open, so this
    // is undefined exactly when nothing has counted the dataset yet, which is the one case where
    // sending a number would be inventing one.
    const carried = this.preview();
    const knownTotal = carried?.totalRows;
    const sort = this.gridSort();
    const filters = this.gridFilters();
    const search = this.gridSearch().trim();
    // What THIS request narrows by, which is not what the carried total was counted under.
    const narrowing = !!search || filters.length > 0;
    const shape: PreviewShape = {
      sort: sort?.column,
      direction: sort?.direction,
      search: search || undefined,
      filters: filters.length ? filters : undefined,
      // The flag of the response that produced knownTotal, not a description of this request.
      knownTotalFiltered: !!carried?.filtered,
    };
    this.analytics.preview(this.connection(), path, page, knownTotal, undefined, shape).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(response.message);
          return;
        }
        // The flag is settled ONCE, here, and the rest of the screen reads it off the stored
        // page. A response that carries no flag falls back to what this request asked for, and
        // it falls the cautious way: a search in hand means the count is a count of matches,
        // whatever the response forgot to say. Normalising at the point it arrives means the
        // provenance sent back on the next request cannot disagree with what is on screen --
        // which, on the request that clears a filter, is the whole of the defect.
        const filtered = response.data.filtered ?? narrowing;
        this.preview.set({ ...response.data, filtered });
        // The size of the FILE, remembered only from a response that counted the whole of it.
        // Without this the grid can print "1,204 matching" and never "1,204 of 250,000", because
        // the response carrying the filtered total has no way to say what it was filtered from.
        if (!filtered) this.datasetRows.set(response.data.totalRows);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The dataset could not be read.');
      },
    });
  }

  nextPage(): void {
    const preview = this.preview();
    if (preview && preview.page + 1 < this.pageCount()) this.loadPage(preview.page + 1);
  }

  previousPage(): void {
    const preview = this.preview();
    if (preview && preview.page > 0) this.loadPage(preview.page - 1);
  }

  retry(): void {
    if (this.path()) this.load(this.path());
  }

  private clearDataset(): void {
    this.path.set('');
    this.selected.set(null);
    this.columns.set([]);
    this.preview.set(null);
    this.error.set('');
    this.clearProfile();
    this.clearResult();
    this.clearCanvas();
    this.clearGridState();
    // The second dataset is a path inside the connection that is being left behind, so it cannot
    // survive the change: the same key under a different connection is a different file, or no
    // file at all. Only pickConnection reaches here -- opening another file keeps the join.
    this.clearSecond();
  }

  // ---- profiling -----------------------------------------------------------------------

  /**
   * The four tabs that are readings of the one SUMMARIZE scan.
   *
   * A list rather than a chain of ORs in showTab, because it is the thing that has to stay true:
   * add a fifth reading and forget to name it here and the tab renders its empty state forever,
   * with nothing having been asked for and no error to explain it.
   */
  private static readonly SCAN_TABS: Tab[] = ['compact', 'columns', 'profile', 'quality'];

  /**
   * Moves to a tab, fetching the profile the first time one of the four tabs that needs it is
   * opened.
   *
   * Lazy on purpose. Opening a file already costs three sessions and three permits against a
   * governor that admits four at a time across the whole JVM, and a profile is a full scan
   * rather than a footer read. Charging every file open for a tab most readers never open is
   * the wrong direction; charging the reader who opens it, once, is not.
   *
   * A failed scan is NOT retried by coming back to the tab. The error stays put with its own
   * "Try again" beneath it, because a request that failed for load will fail again immediately
   * and silently spending another permit per tab click is exactly the behaviour the governor
   * exists to stop.
   */
  showTab(tab: Tab): void {
    this.tab.set(tab);
    // The library is lazy for the same reason the profile is, though the cost is a database read
    // rather than a governor permit: neither is worth spending on a reader who opened a file to
    // look at its columns.
    if (tab === 'sql') { this.openLibrary(); return; }
    // Run history on the same terms. It is the tab a reader opens to find out what happened, so
    // it is fetched on arrival -- and only on arrival, because a workspace's whole history is not
    // worth a database round trip to somebody reading a column list.
    if (tab === 'activity') { this.openRuns(); return; }
    // The Canvas fetches its saved analyses on the same terms, and NOTHING ELSE: opening the tab
    // does not run an analysis. A GROUP BY over a hundred-megabyte file is a governor permit and
    // a full scan, and spending one because somebody clicked a tab is how a screen becomes
    // expensive to look at.
    if (tab === 'canvas') { this.openAnalyses(); return; }
    // Charts draws the result the console already has. It runs nothing, which is the point of it
    // being a tab rather than a second console.
    if (!Analytics.SCAN_TABS.includes(tab)) return;
    if (this.profile() || this.profileLoading() || this.profileError()) return;
    this.loadProfile();
  }

  loadProfile(): void {
    const path = this.path();
    if (!path) return;
    this.profileLoading.set(true);
    this.profileError.set('');
    this.analytics.profile(this.connection(), path).subscribe({
      next: response => {
        this.profileLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          // The server's refusal is written for a reader, so it is shown rather than replaced.
          // Falls back like the transport branch below. An empty message here would leave
          // profileError falsy, and a FAILED scan would render as the clean empty state -- the
          // one failure mode where saying nothing is worse than saying the wrong thing.
          this.profileError.set(response.message || 'The dataset could not be profiled.');
          return;
        }
        this.profile.set(response.data);
      },
      error: err => {
        this.profileLoading.set(false);
        this.profileError.set(err?.error?.message || 'The dataset could not be profiled.');
      },
    });
  }

  private clearProfile(): void {
    this.profile.set(null);
    this.profileLoading.set(false);
    this.profileError.set('');
  }

  /**
   * The four quartile blocks of a numeric column, or none where there is no spread to draw.
   *
   * The five points are min, the three estimated quartiles and max, and each gap between them
   * holds about a quarter of the rows. Whether they parse is the only test applied: a DATE column
   * has quartiles and they are dates, a VARCHAR column has none at all, and both fall out here
   * without this having to know which is which.
   *
   * A column whose every value is identical has a span of zero and gets nothing rather than four
   * blocks of a division by zero -- "one value throughout" is the Quality tab's sentence, not a
   * chart.
   */
  private spreadOf(column: ColumnProfile): QuartileSegment[] {
    const points =
      [column.min, column.approxQ25, column.approxQ50, column.approxQ75, column.max].map(asNumber);
    if (points.some(point => point === null)) return [];
    const edges = points as number[];
    const span = edges[4] - edges[0];
    if (!(span > 0)) return [];
    return [0, 1, 2, 3].map(index => {
      const from = edges[index];
      const to = edges[index + 1];
      return {
        from, to,
        width: ((to - from) / span) * 100,
        label: `About a quarter of the values sit between ${this.number(from)} `
          + `and ${this.number(to)}`,
      };
    });
  }

  /** The profile as the tab draws it, one entry per column in the order the file has them. */
  readonly profileColumns = computed<ColumnView[]>(() => {
    const rows = this.profile()?.totalRows ?? 0;
    return (this.profile()?.columns ?? []).map(column => {
      const measured = column.nullPercentage !== null && column.nullPercentage !== undefined;
      const nullPercent = measured ? Number(column.nullPercentage) : 0;
      const text = TEXT_TYPE.test(column.type ?? '');
      const spread = this.spreadOf(column);
      return {
        name: column.name,
        type: column.type,
        shortType: this.shortType(column.type),
        text,
        measured,
        nullPercent,
        // The server's own complement rather than a second subtraction here, so the two figures
        // cannot round apart and disagree by a hundredth on screen.
        filledPercent: column.completeness === null || column.completeness === undefined
          ? 100 - nullPercent : Number(column.completeness),
        rows,
        approxNullRows: column.approxNullRows ?? 0,
        approxDistinct: column.approxDistinct ?? 0,
        // Null rather than 0 on an empty file: there is no share of nothing, and a zero would
        // read as "no distinct values" on the one file where nothing was measured at all.
        distinctPercent: rows ? ((column.approxDistinct ?? 0) / rows) * 100 : null,
        allNull: !!column.allNull,
        constant: !!column.constant,
        typeSurprise: column.typeSurprise ?? null,
        keyLike: !!column.keyLike,
        min: column.min,
        max: column.max,
        avg: column.avg,
        std: column.std,
        // A text column's extremes are shown exactly as the file holds them. Tidying "007" to 7
        // would print a value that is not in the file, on the one column type where the string
        // IS the value.
        minLabel: text ? (column.min ?? '') : this.stat(column.min),
        maxLabel: text ? (column.max ?? '') : this.stat(column.max),
        avgLabel: this.stat(column.avg),
        stdLabel: this.stat(column.std),
        // Written out as well as drawn. The spread bar has held these three since it shipped and
        // never named one of them, so 06's "percentile values" were on screen as widths only.
        q25Label: this.stat(column.approxQ25),
        medianLabel: this.stat(column.approxQ50),
        q75Label: this.stat(column.approxQ75),
        spread,
        spreadSummary: spread.length
          ? `About a quarter of the rows in each block, from ${this.stat(column.min)} through an `
            + `estimated median of ${this.stat(column.approxQ50)} to ${this.stat(column.max)}.`
          : '',
      };
    });
  });

  /**
   * What the Quality tab leads with.
   *
   * The flags come from the server, which derived them beside the statistics they rest on; what
   * is decided here is only how loudly each one is said and in what words. The thresholds that
   * ARE here -- 25% for "mostly empty", six standard deviations for a far-out extreme -- are
   * presentation decisions rather than facts about the data, so they live beside the sentences
   * they choose between.
   *
   * Note the two things deliberately absent. DUPLICATE ROWS are not flagged, because SUMMARIZE
   * cannot count them and ColumnProfileDto says so in as many words: it needs its own
   * count(DISTINCT ...) scan, and a number invented for the tab to lead with would be the one
   * thing this screen must not do. The tab says that out loud rather than staying quiet about it.
   * KEY-LIKE columns are not flagged either -- an id column is not a problem, and putting one on
   * every dataset's attention list would make "nothing needs attention" a state no file reaches.
   * It is shown on the Profile card instead, where describing a column is the point.
   */
  readonly qualityFindings = computed<QualityFinding[]>(() => {
    const findings: QualityFinding[] = [];
    for (const column of this.profileColumns()) {
      if (!column.rows || !column.measured) continue;

      if (column.allNull) {
        findings.push({
          column: column.name, level: 'crit', title: 'Empty column',
          detail: 'Nothing found in it: 100% of rows null, and not one distinct value. '
            + 'Both signals agree, which is as close to certain as one scan gets.',
        });
        continue;
      }

      if (column.nullPercent >= 25) {
        findings.push({
          column: column.name, level: 'warn', title: 'Mostly empty',
          detail: `${this.percent(column.nullPercent)}% of rows have no value — about `
            + `${column.approxNullRows.toLocaleString()} of ${column.rows.toLocaleString()}.`,
        });
      } else if (column.nullPercent >= 5) {
        findings.push({
          column: column.name, level: 'note', title: 'Some values missing',
          detail: `${this.percent(column.nullPercent)}% of rows have no value — about `
            + `${column.approxNullRows.toLocaleString()} of ${column.rows.toLocaleString()}.`,
        });
      }

      // "Every row that HAS a value" is the half of this that has to be on screen: a column of
      // 'GB' with a third of its rows missing is constant, and a reader who assumes otherwise
      // has just been told the wrong thing about a third of the file.
      if (column.constant) {
        findings.push({
          column: column.name, level: 'warn', title: 'One value throughout',
          detail: 'Estimated at a single distinct value, so every row that has a value probably '
            + 'carries the same one. Rows with no value are not counted in that.',
        });
      }

      // The type surprise gap 25 asks for by name, and the one place a text column's alphabetical
      // ordering is a problem rather than a label. Hedged because the server decided it from the
      // two extreme values alone: a column of leading-zero postcodes lands here too, and casting
      // it to a number is exactly what would destroy it.
      if (column.typeSurprise === 'NUMBER') {
        findings.push({
          column: column.name, level: 'note', title: 'Numbers read as text',
          detail: `Read as ${column.type}, but its lowest and highest values are both numbers, so `
            + 'sorting it goes alphabetically — "9" after "100". Judged from those two values '
            + 'alone, so a column of leading-zero codes would look the same and should stay text.',
        });
      } else if (column.typeSurprise === 'DATE') {
        findings.push({
          column: column.name, level: 'note', title: 'Dates read as text',
          detail: `Read as ${column.type}, but its lowest and highest values both look like `
            + 'dates. Judged from those two values alone, so it is a question rather than a fault.',
        });
      }

      const outlier = this.outlierOf(column);
      if (outlier) findings.push(outlier);
    }

    // Loudest first, then the emptiest column, so the thing to look at is the thing at the top.
    const order = { crit: 0, warn: 1, note: 2 };
    return findings.sort((a, b) => order[a.level] - order[b.level]
      || (this.nullOf(b.column) - this.nullOf(a.column))
      || a.column.localeCompare(b.column));
  });

  /**
   * A numeric column whose extreme sits implausibly far from its own mean.
   *
   * This is arithmetic on four figures the server calls exact -- min, max, avg and std -- and it
   * is deliberately NOT called outlier detection. SUMMARIZE returns no rows, so nothing here can
   * say whether that maximum is one stray or ten thousand of them, and the sentence on screen
   * says so rather than implying a search that did not happen.
   *
   * Six standard deviations rather than the textbook three: this is a hint on a screen a reader
   * scans, and at three every mildly skewed column -- a price, a duration, anything with a floor
   * at zero and a long tail -- would raise one.
   */
  private outlierOf(column: ColumnView): QualityFinding | null {
    const avg = asNumber(column.avg);
    const std = asNumber(column.std);
    if (avg === null || std === null || !(std > 0)) return null;

    const high = asNumber(column.max);
    const low = asNumber(column.min);
    const above = high === null ? 0 : (high - avg) / std;
    const below = low === null ? 0 : (avg - low) / std;
    const worst = Math.max(above, below);
    if (worst < 6) return null;

    const far = above >= below ? column.maxLabel : column.minLabel;
    const side = above >= below ? 'above' : 'below';
    return {
      column: column.name, level: 'note', title: 'An extreme far from the mean',
      detail: `${far} sits ${Math.round(worst)} standard deviations ${side} the mean of `
        + `${this.number(avg)}. The summary cannot say whether that is one stray row or many.`,
    };
  }

  /** How empty a column is, by name -- the tie-break that puts the worst finding first. */
  private nullOf(name: string): number {
    return this.profileColumns().find(column => column.name === name)?.nullPercent ?? 0;
  }

  /**
   * How many columns were actually EXAMINED, which is not the same as how many exist.
   *
   * This counted every column, so a header-only file -- a dataset with columns and no rows, which
   * is the normal shape of a botched export and exactly the file this tab exists for -- reported
   * "Checked 2 columns: none is empty, none is more than 5% empty..." having examined nothing.
   * Five specific claims, every one of them false, and "none is empty" the precise opposite of the
   * truth. The quality loop skips a column with no rows (`!column.rows` at :678); the count now
   * agrees with the loop rather than with the schema.
   */
  readonly qualityChecked = computed(() =>
    this.profileColumns().filter(column => column.rows && column.measured).length);

  /** The columns that raised nothing, counted rather than listed. */
  readonly qualityClearCount = computed(() => {
    const flagged = new Set(this.qualityFindings().map(finding => finding.column));
    return Math.max(0, this.qualityChecked() - flagged.size);
  });

  /**
   * A dataset that was actually scanned, actually examined, and had nothing to say.
   *
   * Drives the tab's empty state. It was computed and never rendered -- three tests asserted it
   * while the screen was driven by a looser expression that did not require a profile to exist,
   * so "Nothing needs attention." could be reached before anything had been scanned. Requiring
   * profile() AND qualityChecked() means the clean message can only appear after a scan that
   * examined something.
   */
  readonly qualityClean = computed(() =>
    !!this.profile() && !!this.qualityChecked() && !this.qualityFindings().length);

  /**
   * Scanned, with no findings to list -- for any of three different reasons.
   *
   * All three want an empty state rather than a table of nothing; they want DIFFERENT WORDS. A
   * clean dataset, a dataset with no rows, and a dataset with no columns are three distinct facts,
   * and the tab used to tell a reader the first one in all three cases.
   */
  readonly qualityEmpty = computed(() => !!this.profile() && !this.qualityFindings().length);

  /** "Nothing wrong" and "nothing to look at" are not the same sentence. */
  readonly qualityEmptyMessage = computed(() =>
    this.qualityChecked() ? 'Nothing needs attention.' : 'Nothing to check.');

  /**
   * The loudest thing said about each column, by name.
   *
   * Findings are already sorted loudest-first, so the FIRST one per column is the worst one --
   * which is what a single indicator in a dense row has to be. Built once as a map rather than
   * searched per row, because Compact is one row per column on a file that can have two hundred.
   */
  private readonly findingsByColumn = computed(() => {
    const grouped = new Map<string, QualityFinding[]>();
    for (const finding of this.qualityFindings()) {
      const existing = grouped.get(finding.column);
      if (existing) existing.push(finding);
      else grouped.set(finding.column, [finding]);
    }
    return grouped;
  });

  /** Findings are sorted loudest-first, so the head of each list is the worst one. */
  private readonly worstFinding = computed(() => {
    const worst = new Map<string, QualityFinding>();
    for (const [column, findings] of this.findingsByColumn()) worst.set(column, findings[0]);
    return worst;
  });

  /**
   * Every finding on one column, for the Columns card to show beside the statistics.
   *
   * Off the grouped map rather than a filter per call. The template calls this once per card on
   * every change-detection pass, and a filter would be columns times findings each time -- on a
   * tab whose whole purpose is a file with two hundred columns in it.
   */
  findingsFor(column: string): QualityFinding[] {
    return this.findingsByColumn().get(column) ?? [];
  }

  // ---- the compact view ------------------------------------------------------------------

  /**
   * The first value the CURRENT PAGE holds for a column, and which kind of nothing it is.
   *
   * A specimen, not a statistic. It comes from the page of rows the Data tab is holding, so it
   * moves with the page, the sort and the filter -- and it is labelled that way on the tab
   * rather than left to be read as "a typical value", which is a claim one page cannot make.
   *
   * The three absences are kept apart on purpose, the same distinction the grid draws in every
   * cell: a null is the file having no value, a blank is the file having an empty one, and
   * "none" is this page having no row to look at.
   */
  private sampleOf(name: string): { sample: string; kind: CompactRow['sampleKind'] } {
    const preview = this.preview();
    if (!preview) return { sample: '', kind: 'none' };
    const index = preview.columns.indexOf(name);
    if (index < 0 || !preview.rows.length) return { sample: '', kind: 'none' };
    for (const row of preview.rows) {
      const cell = row[index];
      if (cell === null || cell === undefined) continue;
      if (!String(cell).trim()) return { sample: '', kind: 'blank' };
      return { sample: String(cell), kind: 'value' };
    }
    // Every row on this page had nothing in it, which is itself worth showing.
    return { sample: '', kind: 'null' };
  }

  /**
   * 06's dense mode: one row per column, seven fields, nothing recomputed.
   *
   * Everything here comes off the SUMMARIZE the other three column tabs are already reading,
   * plus the page of rows the Data tab is already holding. The only decision made here is which
   * figure earns the "key metric" slot, and it is made from what the engine RETURNED rather than
   * from a type name -- a mean where there is one, an estimated median where there are quantiles
   * and no mean, and the extremes otherwise. That is the same test the Profile card applies, and
   * it is the honest one: whether a statistic exists is the engine's answer to whether it applies.
   */
  readonly compactRows = computed<CompactRow[]>(() => {
    const worst = this.worstFinding();
    return this.profileColumns().map(column => {
      const { sample, kind } = this.sampleOf(column.name);
      const finding = worst.get(column.name) ?? null;
      const checked = !!column.rows && column.measured;

      // Which figure says most about this column. avgLabel is present only where the engine
      // returned a mean, medianLabel only where it returned quantiles -- so this asks the data
      // rather than a list of type names that would need keeping in step with DuckDB.
      let metricName = 'range';
      let metricValue = column.minLabel || column.maxLabel
        ? `${column.minLabel || '—'} → ${column.maxLabel || '—'}` : 'N/A';
      let metricEstimated = false;
      if (column.avgLabel) {
        metricName = 'mean';
        metricValue = column.avgLabel;
      } else if (column.medianLabel) {
        metricName = 'median';
        metricValue = column.medianLabel;
        metricEstimated = true;
      }

      return {
        name: column.name,
        type: column.type,
        shortType: column.shortType,
        sample,
        sampleKind: kind,
        // "N/A", never 0 -- 06 says so in as many words, and a zero here would claim a fully
        // populated column on a file where nothing was measured.
        nullLabel: column.measured ? `${this.percent(column.nullPercent)}%` : 'N/A',
        distinctLabel: column.distinctPercent === null
          ? 'N/A' : `≈ ${this.percent(column.distinctPercent)}%`,
        metricName,
        metricValue,
        metricEstimated,
        level: finding?.level ?? null,
        quality: finding ? finding.title : (checked ? 'clear' : 'not checked'),
        qualityDetail: finding ? finding.detail
          : (checked ? 'Nothing on this column raised a finding.'
            : 'This column was not examined: the dataset has no rows to measure it against.'),
        checked,
      };
    });
  });

  // ---- the profile view: aggregates, not columns ------------------------------------------

  /**
   * How many columns the file has of each type -- 06's "data-type summaries".
   *
   * Grouped on the SHORT type, so DECIMAL(18,3) and DECIMAL(10,2) are both DECIMAL. The full
   * spelling belongs on the Columns card, where one column is being described; here the question
   * is what the file is made of, and eleven decimal widths is noise against that.
   *
   * Every column has exactly one type, so these counts do add up to the whole and a percentage
   * of them is a real share -- which is not true of most of what this screen draws, and is why
   * it is said here rather than assumed.
   */
  readonly typeBands = computed<ProfileBand[]>(() => {
    const counts = new Map<string, number>();
    for (const column of this.profileColumns()) {
      counts.set(column.shortType, (counts.get(column.shortType) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({
        name, value,
        detail: `${value} ${value === 1 ? 'column is' : 'columns are'} ${name}.`,
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  });

  /**
   * Columns banded by how much of them is there.
   *
   * A COUNT OF COLUMNS in each band, and the tab says so twice -- because "42% empty" over a
   * file reads as a statement about cells, and nothing on this screen has ever counted a cell.
   * The bands are the same thresholds the Quality tab raises findings at, so the two tabs cannot
   * disagree about which columns are a problem.
   */
  readonly completenessBands = computed<ProfileBand[]>(() => {
    const bands: ProfileBand[] = [
      { name: 'Nothing missing', value: 0, detail: 'No empty rows measured in these columns.' },
      { name: 'Under 5% empty', value: 0, detail: 'A few rows with no value.' },
      { name: '5–25% empty', value: 0, detail: 'Some values missing — the Quality tab lists these.' },
      { name: 'Over 25% empty', value: 0, detail: 'Mostly empty.' },
      { name: 'Entirely empty', value: 0, detail: '100% null and no distinct value: nothing in them.' },
    ];
    for (const column of this.profileColumns()) {
      if (!column.measured) continue;
      if (column.allNull) bands[4].value++;
      else if (column.nullPercent >= 25) bands[3].value++;
      else if (column.nullPercent >= 5) bands[2].value++;
      else if (column.nullPercent > 0) bands[1].value++;
      else bands[0].value++;
    }
    return bands;
  });

  /**
   * Columns banded by how many different values they hold.
   *
   * EVERY BAND HERE RESTS ON THE HYPERLOGLOG SKETCH, so the whole chart is labelled estimated
   * rather than each bar -- a distinct count measured 3.7% low on a million values will not move
   * a column between "a handful" and "thousands", but it can and does move one across the line
   * into "almost every row different", which is why that band is worded as a suggestion.
   */
  readonly cardinalityBands = computed<ProfileBand[]>(() => {
    const bands: ProfileBand[] = [
      { name: 'One value', value: 0, detail: 'Estimated at a single distinct value throughout.' },
      { name: 'Under 10', value: 0, detail: 'A handful of values — a category or a flag.' },
      { name: '10 to 1,000', value: 0, detail: 'A vocabulary rather than a category.' },
      { name: 'Over 1,000', value: 0, detail: 'Many different values.' },
      {
        name: 'Almost every row different', value: 0,
        detail: 'About as many distinct values as rows, so it may be a key. The distinct count '
          + 'is an estimate, so this cannot prove uniqueness.',
      },
    ];
    for (const column of this.profileColumns()) {
      if (!column.rows) continue;
      if (column.keyLike) bands[4].value++;
      else if (column.approxDistinct <= 1) bands[0].value++;
      else if (column.approxDistinct < 10) bands[1].value++;
      else if (column.approxDistinct <= 1000) bands[2].value++;
      else bands[3].value++;
    }
    return bands;
  });

  /**
   * The mean of the per-column filled percentages, and it is NOT the share of cells that have a
   * value.
   *
   * Two things separate it from that figure and both are on screen beside it: it weights every
   * column equally regardless of how much data is in it, and each of the percentages it averages
   * was already rounded to two places by the engine. It is a summary of the bands above, offered
   * because a reader wants one number for "how complete is this file" -- and it says which
   * number it is, because the one they will assume it is has never been counted here.
   */
  readonly averageFilled = computed<number | null>(() => {
    const measured = this.profileColumns().filter(column => column.measured);
    if (!measured.length) return null;
    return measured.reduce((sum, column) => sum + column.filledPercent, 0) / measured.length;
  });

  /** Whether the aggregate tab has anything at all to draw. */
  readonly profileEmpty = computed(() => !!this.profile() && !this.profileColumns().length);

  /**
   * A percentage as the engine gave it, with a trailing ".00" dropped.
   *
   * Not rounded further. The engine's two decimal places are the whole of what is known about
   * this figure, and printing "38%" where it measured 38.24 would throw away precision the
   * screen is entitled to show.
   */
  percent(value: number): string {
    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  /** A measured value, with enough digits to be recognised and not a float's whole tail. */
  number(value: number): string {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined,
      { maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2 });
  }

  /**
   * A statistic as text, tidied only where it is safely a number.
   *
   * SUMMARIZE prints a mean at full double precision -- 402.14285714285717 -- which is sixteen
   * digits of a figure the file has nowhere near sixteen digits of. Where the text parses it is
   * written the way every other number on this screen is; where it does not, it is passed
   * through untouched, because a date is already in the form its reader wants and a word has no
   * other form.
   */
  stat(text: string | null | undefined): string {
    const value = asNumber(text);
    return value === null ? (text ?? '') : this.number(value);
  }

  /**
   * The object's own timestamp, in the reader's locale.
   *
   * The storage API answers with a raw ISO string, which rendered as
   * "2026-09-08T14:55:40.779Z" on the overview -- precise, and not what anybody reads a
   * modified date for.
   */
  modifiedAt(): string {
    const raw = this.selected()?.lastModified;
    if (!raw) return '';
    const at = new Date(raw);
    return isNaN(at.getTime()) ? raw : at.toLocaleString();
  }

  /**
   * A column's type, shortened for the rail.
   *
   * DuckDB spells a decimal as DECIMAL(18,3) and a nested type far longer than that, which wraps
   * badly in a 200px column. The full type is kept in the title attribute.
   */
  shortType(type: string): string {
    const at = type.indexOf('(');
    return at < 0 ? type : type.slice(0, at);
  }

  // ---- the SQL console -----------------------------------------------------------------

  /**
   * The statement, held here rather than inside the editor.
   *
   * SqlEditor takes a value and emits a valueChange and knows nothing else about this screen, so
   * loading a saved query, reusing one out of history and typing are the same operation from its
   * side: something set this signal. That is the whole reason the editor is a component.
   */
  readonly sql = signal('');
  readonly running = signal(false);
  readonly result = signal<QueryResult | null>(null);

  /**
   * The statement that produced the result now in hand, and the reason Charts can be a tab.
   *
   * The chart used to sit under the result table, and that geography was the safeguard: editing
   * the SQL and not re-running it was visibly editing the thing right above the picture. On its
   * own tab the picture and the statement are never on screen together, so a reader can change
   * the query, switch across, and study a chart of the answer to a question they no longer asked.
   * Holding what actually ran is the only way to notice, and `chartStale` is where it is said.
   */
  readonly ranSql = signal('');

  /**
   * The server's sentence about a query that did not return rows.
   *
   * Kept apart from error(), which belongs to the dataset. A refused query does not mean the file
   * could not be read, and putting the two in one signal would have a bad statement blank the
   * Data tab.
   */
  readonly queryError = signal('');

  /** The second dataset's path, or '' for a query over one. Always inside connection(). */
  readonly secondPath = signal('');
  readonly secondColumns = signal<DatasetColumn[]>([]);
  readonly secondLoading = signal(false);
  readonly secondError = signal('');

  readonly savedQueries = signal<SavedQuery[]>([]);
  readonly savedLoading = signal(false);
  readonly savedError = signal('');

  readonly recentRuns = signal<QueryRun[]>([]);
  readonly runsLoading = signal(false);
  readonly runsError = signal('');

  readonly saveName = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');

  /** The saved query the editor is holding, so Save can offer to update it rather than fork it. */
  readonly loadedQuery = signal<SavedQuery | null>(null);

  /** The row being renamed in place, and the name being typed onto it. */
  readonly renamingId = signal<number | null>(null);
  readonly renameName = signal('');

  /**
   * Whether the library has been asked for at all.
   *
   * A flag rather than "is the list empty", because an empty library is the normal state of a new
   * workspace and asking that question would re-fetch on every visit to the tab for exactly the
   * people who have nothing in it.
   */
  private readonly libraryAsked = signal(false);

  /**
   * The table names the editor completes from, which is the whole interface to a join.
   *
   * "dataset" and "dataset2" are not names this screen chose -- they are what the server exposes
   * the two resolved datasets as, and they are the only handles the SQL gets. Feeding them here
   * means completing a column after "dataset2." asks the second file, which is also the clearest
   * way the screen can teach the naming: the editor answers with the right columns or it does not.
   */
  readonly editorSchema = computed<Record<string, string[]>>(() => {
    const schema: Record<string, string[]> = { dataset: this.columns().map(c => c.name) };
    if (this.secondPath()) schema['dataset2'] = this.secondColumns().map(c => c.name);
    return schema;
  });

  readonly canRun = computed(() => !!this.sql().trim() && this.hasDataset() && !this.running());

  /** True while the console is showing an answer that is not the whole answer. See QueryResult. */
  /**
   * Whether this result is partial.
   *
   * `!== false`, not `!!`. The screen's default for "the server did not say" must be the cautious
   * answer, not the confident one: with `!!undefined` a missing flag printed "everything the query
   * matched", which is the exact claim this tab exists to avoid making without evidence. The flag
   * is a primitive boolean on the DTO so it is always serialised today -- this is about which way
   * the screen falls when that stops being true.
   */
  readonly truncated = computed(() => {
    const result = this.result();
    return !!result && result.truncated !== false;
  });

  /**
   * What the second dataset can be: the files the rail is showing, plus the folder patterns.
   *
   * Read off the rail rather than given a browser of its own, because the rail IS the browser and
   * it is on screen the whole time this tab is open. A reader who wants a file from somewhere
   * else walks there in the rail and this list follows them, which is one navigation model on the
   * screen instead of two that can disagree about where they are. It follows the rail's FILTER
   * too, for the same reason -- the filter box is six inches away, and a picker offering a file
   * the list beside it is currently hiding is the two disagreeing.
   *
   * The dataset already open is excluded. Joining a file to itself is legal SQL and a real thing
   * to want, but it is spelled by naming "dataset" twice in the statement, not by resolving and
   * paying for the same file a second time.
   */
  readonly secondOptions = computed(() => {
    const current = this.path();
    const files = this.files()
      .filter(entry => this.readable(entry.key))
      .map(entry => ({ path: entry.key, label: entry.name }));
    const folders = this.folderFormats()
      .map(extension => ({
        path: `${this.prefix()}*.${extension}`,
        label: `all *.${extension} in this folder`,
      }));
    return [...files, ...folders].filter(option => option.path !== current);
  });

  /**
   * A saved query that was written against a different file from the one open.
   *
   * It still runs -- the console sends the dataset that is open, not the one the row remembers --
   * and that is exactly why it has to be said. A statement written against a sales export and run
   * against a refunds export will usually fail on a missing column, but the case worth warning
   * about is the one where both files have the columns it names and the answer is simply about
   * the wrong data.
   */
  readonly loadedElsewhere = computed(() => {
    const query = this.loadedQuery();
    if (!query) return '';
    const here = query.connectionAlias === this.connection() && query.datasetPath === this.path();
    return here ? '' : `${query.connectionAlias}/${query.datasetPath}`;
  });

  /** Fills an empty console with something runnable, rather than leaving a blank page. */
  useStarter(): void {
    this.sql.set(STARTER_SQL);
  }

  // ---- taking the result away ------------------------------------------------------------

  readonly exportFormat = signal<'csv' | 'tsv' | 'json'>('csv');
  readonly exporting = signal(false);
  readonly exportError = signal('');
  /** What the last write-back put in the bucket, so the screen can name the object it made. */
  readonly written = signal<WriteBackResult | null>(null);
  readonly writeFolder = signal('');

  /**
   * Downloads the result as a file.
   *
   * The QUERY is sent, not the rows the browser is holding. A client that posted its own rows
   * could post any rows, and the file would carry an application filename over data the
   * application never produced. It costs a second execution and buys a file that means something.
   */
  downloadResult(): void {
    const statement = this.sql();
    if (!statement.trim() || !this.path() || this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set('');
    this.written.set(null);

    const second = this.secondPath();
    this.analytics.download({
      connection: this.connection(), path: this.path(), sql: statement,
      connection2: second ? this.connection() : undefined,
      path2: second || undefined,
      format: this.exportFormat(),
    }).subscribe({
      next: response => {
        this.exporting.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.exportError.set(response.message || 'The result could not be exported.');
          return;
        }
        this.save(response.data);
      },
      error: err => {
        this.exporting.set(false);
        this.exportError.set(err?.error?.message || 'The result could not be exported.');
      },
    });
  }

  /**
   * Hands the file to the browser.
   *
   * The server sends base64 because the ResponseDto envelope is JSON and a CSV holding a quote,
   * a newline or a non-ASCII byte does not survive being a JSON string unchanged. Decoded here
   * through Uint8Array rather than atob alone, because atob yields one char per BYTE and building
   * a Blob from that string would re-encode every byte above 127 as UTF-8 and corrupt the file.
   */
  private save(file: ExportFile): void {
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);

    // The server already marks a partial export in the FILENAME and inside the file itself, so
    // this is the third place it is said rather than the only one. Said here too because the
    // file is about to leave the screen, and this is the last moment the reader is looking.
    if (file.truncated) {
      this.exportError.set(file.notice
        || 'That file holds part of the answer, not all of it.');
    }
  }

  /**
   * Writes the result into the connection's own bucket.
   *
   * The bucket is never named here and cannot be: the server takes it from the connection record,
   * the same way every read does. All this sends is a folder inside it.
   */
  writeResultBack(): void {
    const statement = this.sql();
    if (!statement.trim() || !this.path() || this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set('');
    this.written.set(null);

    const second = this.secondPath();
    this.analytics.writeBack({
      connection: this.connection(), path: this.path(), sql: statement,
      connection2: second ? this.connection() : undefined,
      path2: second || undefined,
      folder: this.writeFolder().trim() || undefined,
      format: this.exportFormat(),
    }).subscribe({
      next: response => {
        this.exporting.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.exportError.set(response.message || 'The result could not be written back.');
          return;
        }
        this.written.set(response.data);
        // Written, and the rail is now out of date about what is in that folder.
        this.browse();
      },
      error: err => {
        this.exporting.set(false);
        this.exportError.set(err?.error?.message || 'The result could not be written back.');
      },
    });
  }

  /**
   * Runs what is in the editor.
   *
   * The trimmed text is what gets checked for emptiness and the UNTRIMMED text is what gets sent,
   * because the server stores the statement as submitted and a history row is only re-runnable if
   * it is what somebody wrote.
   */
  run(): void {
    const statement = this.sql();
    if (!statement.trim() || !this.path() || this.running()) return;
    this.running.set(true);
    this.queryError.set('');
    this.result.set(null);
    // What is being sent, recorded before the answer comes back. The Charts tab compares the
    // editor against this to know whether the picture is of the statement now on screen.
    this.ranSql.set(statement);

    // Named before it is sent, so there is something to cancel while it is in flight. The
    // endpoint is synchronous, so an id minted by the server would only reach this screen with
    // the rows -- by which point there is nothing left to stop.
    const runId = 'ui-' + Date.now().toString(36) + '-'
      + Math.random().toString(36).slice(2, 8);
    this.runningId.set(runId);

    const second = this.secondPath();
    this.analytics.query({
      connection: this.connection(), path: this.path(), sql: statement,
      queryId: runId,
      connection2: second ? this.connection() : undefined,
      path2: second || undefined,
    }).subscribe({
      next: response => {
        this.running.set(false);
        this.runningId.set('');
        this.stopping.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          // The server's own sentence, unchanged. Several of these are the statement gate
          // refusing a query that named a location of its own, and a paraphrase would turn a
          // specific security refusal into a generic failure the reader cannot act on.
          this.queryError.set(response.message || 'The query could not be run.');
        } else {
          this.result.set(response.data);
        }
        // Refused, failed or fine, the server wrote a history row for it before answering.
        this.loadRuns();
      },
      error: err => {
        this.running.set(false);
        this.runningId.set('');
        this.stopping.set(false);
        this.queryError.set(err?.error?.message || 'The query could not be run.');
        this.loadRuns();
      },
    });
  }

  /** The id of the run in flight, so the stop control has something to name. */
  readonly runningId = signal('');

  /** True from pressing stop until the run answers. The request may still win the race. */
  readonly stopping = signal(false);

  readonly canStop = computed(() => this.running() && !!this.runningId() && !this.stopping());

  /**
   * Asks the server to stop the run in flight.
   *
   * Does NOT clear the result or stop waiting on its own. The query is synchronous, so the
   * original request is still open and will answer -- with rows if it finished first, or with the
   * engine's interruption if the cancel won. Letting the screen decide the outcome here would
   * mean guessing at a race the server has already settled, and the history row is the record.
   */
  stop(): void {
    const runId = this.runningId();
    if (!runId || this.stopping()) return;
    this.stopping.set(true);
    this.analytics.cancel(runId).subscribe({
      // Nothing to do on either path. A cancel that arrives late, names a finished run, or names
      // nothing at all is answered identically by design -- the server will not say which, because
      // telling them apart would confirm an id is live in another workspace.
      next: () => {},
      error: () => this.stopping.set(false),
    });
  }

  /**
   * Picks the second dataset, and reads its schema straight away.
   *
   * The schema call is not only for completion. It is also the earliest point at which "that file
   * cannot be read" can be said -- before a statement is written against columns the reader
   * guessed at, rather than as a refusal on the query they finally ran.
   */
  pickSecond(path: string): void {
    this.secondPath.set(path);
    this.secondColumns.set([]);
    this.secondError.set('');
    if (!path) return;
    this.secondLoading.set(true);
    this.analytics.schema(this.connection(), path).subscribe({
      next: response => {
        this.secondLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.secondError.set(response.message || 'That dataset could not be read.');
          return;
        }
        this.secondColumns.set(response.data.columns ?? []);
      },
      error: err => {
        this.secondLoading.set(false);
        this.secondError.set(err?.error?.message || 'That dataset could not be read.');
      },
    });
  }

  clearSecond(): void {
    this.secondPath.set('');
    this.secondColumns.set([]);
    this.secondLoading.set(false);
    this.secondError.set('');
  }

  private clearResult(): void {
    this.result.set(null);
    this.queryError.set('');
    this.running.set(false);
    // There is no result, so there is no statement that produced one. Left standing it would
    // make the drift warning compare the editor against a query whose answer has been thrown away.
    this.ranSql.set('');
  }

  // ---- a chart of the result -------------------------------------------------------------

  /**
   * What a reader picked, held BY NAME rather than by index or by column.
   *
   * A name survives the next query and an index does not: run the same statement with one more
   * column in front and index 2 is a different column, silently, under a chart that still looks
   * like the one being read a moment ago. A name that is no longer in the result falls back to
   * the default below, which is visible -- the picker moves.
   *
   * '' means "whatever this result suggests", which is also the state every first run is in.
   */
  readonly chartLabelName = signal('');
  readonly chartValueName = signal('');
  readonly chartKindName = signal<ChartKind | ''>('');

  /**
   * Every column of the result, measured by parsing it.
   *
   * One pass per column over the rows the browser is already holding. It is recomputed only when
   * result() changes, which is once per query, and the alternative -- asking the server what the
   * column types were -- would be a second execution of the statement to learn something the
   * rows in hand already say.
   */
  readonly chartColumns = computed<ColumnReading[]>(() => {
    const result = this.result();
    if (!result) return [];
    const rows = result.rows ?? [];
    return (result.columns ?? []).map((name, index) => {
      const texts = new Set<string>();
      const values = new Set<number>();
      let missing = 0;
      let unparsed = 0;
      let negative = 0;
      for (const row of rows) {
        const cell = row[index];
        // A null and a cell of spaces are both "no value here". Neither is a zero and neither
        // is a category, so they are counted apart from text that simply is not a number.
        //
        // Read through String() rather than assuming one. The server declares rows as
        // (string | null)[][] and a JSON number arriving instead threw "cell.trim is not a
        // function" from inside a computed, which takes the whole tab down -- while the result
        // table above renders the same value without complaint. Coerced rather than counted as
        // missing, because a number IS a value: calling it absent would be the second wrong
        // answer, and this screen's whole argument is that an unknown and a zero are different.
        if (cell === null || cell === undefined) { missing++; continue; }
        const text = String(cell);
        if (!text.trim()) { missing++; continue; }
        texts.add(text);
        const value = asNumber(text);
        if (value === null) { unparsed++; continue; }
        values.add(value);
        if (value < 0) negative++;
      }
      return {
        name, index, rows: rows.length, missing, unparsed, negative,
        numbers: rows.length - missing - unparsed,
        distinct: texts.size, distinctNumbers: values.size,
      };
    });
  });

  /**
   * The column whose values name the marks, or null when there is nothing to name them with.
   *
   * Null on a one-column result, deliberately: labelling a number with itself produces a chart
   * of a column against itself, which draws and means nothing. That is the state the empty
   * message and the kind reasons both have to be able to explain, and it is why this is a
   * nullable column rather than an index defaulting to zero.
   */
  readonly labelColumn = computed<ColumnReading | null>(() => {
    const columns = this.chartColumns();
    if (columns.length < 2) return null;
    const picked = columns.find(column => column.name === this.chartLabelName());
    // A column with no numbers in it is a name. Where every column parses, the first one is
    // taken, because `select region, month, sum(amount)` puts what a row IS before what it
    // measures.
    return picked ?? columns.find(column => !column.numbers) ?? columns[0];
  });

  /**
   * The column drawn as a length, or null when nothing in the result parses.
   *
   * The LAST numeric column by default rather than the first, which is the other half of the
   * same observation: an aggregate lands at the end of a select list and an id at the front, and
   * a bar chart of an id is a chart of nothing at all.
   */
  readonly valueColumn = computed<ColumnReading | null>(() => {
    const label = this.labelColumn()?.name;
    const usable = this.chartColumns().filter(c => c.numbers > 0 && c.name !== label);
    const picked = usable.find(column => column.name === this.chartValueName());
    return picked ?? usable[usable.length - 1] ?? null;
  });

  /**
   * The two pickers, each without the column the other is using.
   *
   * One column cannot be both. Picking it twice would group a value by itself and then add the
   * duplicates together -- a chart of how often each number occurs, drawn as though it were a
   * chart of the numbers, which is the distribution kind wearing the wrong label.
   */
  readonly chartLabelOptions = computed(() =>
    this.chartColumns().filter(column => column.name !== this.valueColumn()?.name));

  readonly chartValueOptions = computed(() =>
    this.chartColumns().filter(c => c.numbers > 0 && c.name !== this.labelColumn()?.name));

  /**
   * The marks of a categorical chart, and everything that was left out getting there.
   *
   * ROWS SHARING A LABEL ARE ADDED TOGETHER, which is the one interpretation this screen makes
   * of a reader's data, so it is returned as a count rather than done quietly: `merged` is how
   * many rows disappeared into a label they shared, and the note under the chart says so
   * whenever it is not zero. Adding is right for the counts and totals a group-by produces and
   * wrong for an average, and only the reader knows which they wrote.
   *
   * It is not optional, either. Both the ring and the ranked bars track their marks by name, so
   * two marks called "north" is a duplicate-key error rather than a chart -- and drawing the
   * three kinds from three differently-grouped arrays would let switching kind change the total.
   *
   * The two exclusions are counted apart because they are different facts about the data: a row
   * with no number in the value column is a measurement nobody has, and a row with nothing in
   * the label column is a measurement of nothing nameable. Neither becomes a zero.
   */
  readonly chartCategories = computed(() => {
    const label = this.labelColumn();
    const value = this.valueColumn();
    const rows = this.result()?.rows ?? [];
    if (!label || !value) return { points: [] as ChartPoint[], noNumber: 0, noLabel: 0, merged: 0 };

    const points = new Map<string, ChartPoint>();
    let noNumber = 0;
    let noLabel = 0;
    let drawn = 0;
    for (const row of rows) {
      const amount = asNumber(row[value.index]);
      if (amount === null) { noNumber++; continue; }
      const name = (row[label.index] ?? '').trim();
      if (!name) { noLabel++; continue; }
      const existing = points.get(name);
      if (existing) { existing.value += amount; existing.rows++; } else {
        points.set(name, { name, value: amount, rows: 1 });
      }
      drawn++;
    }
    // Insertion order is the result's own order, which is what the ordered kind is FOR: a query
    // ending in `order by month` has already said how its categories should read.
    return { points: [...points.values()], noNumber, noLabel, merged: drawn - points.size };
  });

  /** The same marks for all three categorical kinds -- Bar, Slice and RankedItem agree on them. */
  readonly chartData = computed<ChartPoint[]>(() => this.chartCategories().points);

  /**
   * How many rows a ranked bar lists, given to the chart AND to the sentence about it.
   *
   * One constant reaching both, because the disclosure is only true while the two agree: a
   * template that said 8 to app-ranked-bar while the note said 6 would be a chart quietly
   * dropping two categories under a line claiming it had not.
   */
  readonly rankedRows = RANKED_ROWS;

  /** Every number in the value column, unsorted and unrounded, for the distribution to bin. */
  readonly chartValues = computed<number[]>(() => {
    const value = this.valueColumn();
    if (!value) return [];
    const values: number[] = [];
    for (const row of this.result()?.rows ?? []) {
      const parsed = asNumber(row[value.index]);
      if (parsed !== null) values.push(parsed);
    }
    return values;
  });

  /**
   * Why a distribution cannot be drawn, or '' when it can.
   *
   * The only kind that needs no label column, so it is also the only chart a one-column result
   * can have -- which is worth knowing, because "select duration from dataset" is a perfectly
   * normal thing to write.
   */
  private readonly distributionIssue = computed(() => {
    const value = this.valueColumn();
    if (!value) return this.noNumbersIssue();
    if (value.numbers < DISTRIBUTION_MIN) {
      return `Only ${value.numbers} ${value.numbers === 1 ? 'number' : 'numbers'} in `
        + `"${value.name}" — too few to have a shape worth drawing.`;
    }
    if (value.distinctNumbers < 2) {
      return `Every number in "${value.name}" is the same one, so there is no distribution.`;
    }
    return '';
  });

  /** The reason shared by every kind when the result has nothing to draw a length from. */
  private noNumbersIssue(): string {
    if (!this.result()) return 'Nothing has run yet.';
    return this.chartColumns().length === 1
      ? `Nothing in "${this.chartColumns()[0].name}" parses as a number.`
      : 'No column in this result has numbers in it.';
  }

  /**
   * The four kinds, each carrying the reason it cannot draw THESE columns.
   *
   * Listed and inert rather than filtered away, the same treatment an unreadable connection and
   * an unreadable file already get on this screen: the reason a ring is not on offer is a fact
   * about the reader's own data, and it is more useful than the option silently not being there.
   *
   * A negative value stops all three of the categorical kinds at once, and that is not a
   * limitation being worked around -- it is the truth about drawing a quantity as a length.
   * app-bar-chart floors a bar at zero height and app-ranked-bar drops the row outright, so a
   * loss of -400 would appear as an absence beside a profit of 400. The distribution stays
   * available and puts it on the axis where it belongs.
   */
  readonly chartKinds = computed<ChartKindOption[]>(() => {
    const label = this.labelColumn();
    const value = this.valueColumn();
    const points = this.chartCategories().points;

    let categorical = '';
    if (!value) {
      categorical = this.noNumbersIssue();
    } else if (!label) {
      categorical = 'This result has one column, so there is nothing to label its values with.';
    } else if (!points.length) {
      categorical = `No row has both a label in "${label.name}" and a number in "${value.name}".`;
    } else if (value.negative) {
      categorical = `"${value.name}" holds ${value.negative} negative `
        + `${value.negative === 1 ? 'value' : 'values'}, and a length cannot be negative. `
        + 'The distribution can show them.';
    }

    const many = points.length;
    return [
      {
        id: 'bar', label: 'Bars, in the order the query returned them',
        issue: categorical || (many > ORDERED_BARS
          ? `${many} categories cannot stand side by side with their names on them.` : ''),
      },
      { id: 'ranked', label: 'Ranked bars, largest first', issue: categorical },
      {
        id: 'donut', label: 'Share of the total',
        issue: categorical || (many > DONUT_SLICES
          ? `A ring of ${many} slices cannot be read; ${DONUT_SLICES} is the most this draws.`
          : ''),
      },
      { id: 'histogram', label: 'Distribution of one column', issue: this.distributionIssue() },
    ];
  });

  /**
   * The kind actually drawn: the one picked, or the first that these columns support.
   *
   * A fallback rather than a stored default, because the columns move under the pick. A reader
   * who chose a ring over six categories and then ran a query returning four hundred would
   * otherwise be looking at a control that says "share of the total" over an empty frame.
   */
  readonly chartKind = computed<ChartKind | null>(() => {
    const kinds = this.chartKinds();
    const picked = kinds.find(kind => kind.id === this.chartKindName() && !kind.issue);
    return (picked ?? kinds.find(kind => !kind.issue))?.id ?? null;
  });

  readonly chartDrawn = computed(() => !!this.result() && !!this.chartKind());

  /**
   * The editor has moved on from the statement this chart is of.
   *
   * The safeguard the old layout got from geography. With the chart under the result, editing the
   * SQL was visibly editing the thing directly above the picture; on its own tab the two are
   * never on screen together, and a chart of the previous answer looks exactly as finished as a
   * chart of the current one. Compared on the exact text rather than a normalised form: a change
   * to whitespace inside a string literal is a change to the query, and this screen has no
   * business deciding which edits do not count.
   */
  readonly chartStale = computed(() =>
    !!this.result() && !this.running() && this.sql() !== this.ranSql());

  /**
   * Why there is no chart, in the words of whatever is actually stopping it.
   *
   * The kind reasons live on the picker, and the picker is not rendered in an empty state -- so
   * they are gathered here instead. "No chart" with no reason beside it reads as a screen that
   * failed, and the true answer is usually about the data: a query that matched nothing, or a
   * result of names with no numbers anywhere in it.
   */
  readonly chartEmptyMessage = computed(() => {
    const result = this.result();
    if (!result) return 'Nothing has run yet — a chart is drawn from a result, not from the file.';
    if (!result.rows?.length) return 'That query matched no rows, so there is nothing to draw.';
    return [...new Set(this.chartKinds().map(kind => kind.issue).filter(Boolean))].join(' ');
  });

  /** What the chart claims to be, in one line above it. */
  readonly chartCaption = computed(() => {
    const value = this.valueColumn();
    if (!value) return '';
    if (this.chartKind() === 'histogram') return `How "${value.name}" is spread`;
    return `"${value.name}" by "${this.labelColumn()?.name}"`;
  });

  /**
   * What this chart is NOT showing, in the reader's own numbers.
   *
   * Every line here exists because the chart above it cannot say the thing itself. A bar has no
   * way to mention the rows that never became a bar, and a ring cannot say that its slices were
   * added up out of four hundred rows -- so a picture that has quietly narrowed, merged or
   * ranked its input looks identical to one that drew everything it was given. Truncation is the
   * exception and is NOT in this list: it is louder than a note, because it is the one that
   * makes the whole chart wrong rather than partial.
   */
  readonly chartNotes = computed<string[]>(() => {
    const kind = this.chartKind();
    const value = this.valueColumn();
    if (!kind || !value) return [];
    const notes: string[] = [];
    const rows = value.rows.toLocaleString();
    const { points, noNumber, noLabel, merged } = this.chartCategories();
    const distribution = kind === 'histogram';

    if (distribution) {
      notes.push(`Drawn from ${value.numbers.toLocaleString()} of the ${rows} rows in this result.`);
    } else {
      const drawn = value.rows - noNumber - noLabel;
      notes.push(`Drawn from ${drawn.toLocaleString()} of the ${rows} rows in this result, `
        + `as ${points.length.toLocaleString()} ${points.length === 1 ? 'category' : 'categories'}.`);
    }

    const skipped = distribution ? value.rows - value.numbers : noNumber;
    if (skipped) {
      notes.push(`${skipped.toLocaleString()} ${skipped === 1 ? 'row has' : 'rows have'} no number `
        + `in "${value.name}" — left out rather than counted as zero, because an unknown value is `
        + 'not a zero.');
    }

    if (!distribution && noLabel) {
      notes.push(`${noLabel.toLocaleString()} ${noLabel === 1 ? 'row has' : 'rows have'} nothing in `
        + `"${this.labelColumn()?.name}" to be called, so ${noLabel === 1 ? 'it is' : 'they are'} `
        + 'not on the chart either.');
    }

    if (!distribution && merged) {
      notes.push(`${merged.toLocaleString()} of the rows drawn shared a label with another one; `
        + 'their numbers were added together. That is right for a count or a total and wrong for '
        + 'an average.');
    }

    if (kind === 'ranked') {
      // Counted over the rows RankedBar will actually rank, not over every point. It filters
      // value > 0 BEFORE taking its top N, so its universe is smaller than this one -- and with
      // three zero categories among ten, this said "Showing the 8 largest of 10 ... the rest are
      // added together as one Other row" above a chart of seven rows and no Other row at all. A
      // disclosure that is wrong is worse than none, because it is read as having been checked.
      const ranked = points.filter(point => point.value > 0).length;
      if (ranked > RANKED_ROWS) {
        notes.push(`Showing the ${RANKED_ROWS} largest of ${ranked.toLocaleString()}. `
          + 'The rest are added together as one "Other" row rather than dropped.');
      }
      const flat = points.filter(point => !point.value).length;
      if (flat) {
        notes.push(`${flat} ${flat === 1 ? 'category adds' : 'categories add'} up to zero, and a `
          + 'ranked bar has no row for a zero.');
      }
    }

    if (kind === 'donut') {
      notes.push(`Each slice is a share of the sum of "${value.name}". A ring asserts that the `
        + 'parts add up to a whole, which is true of counts and totals and false of averages.');
    }

    return notes;
  });

  /**
   * How an axis value is written under the distribution.
   *
   * The component's own default rounds to a whole number, which is right for a duration in
   * seconds and destroys a column of rates: every bin edge between 0 and 1 would be labelled
   * "0" or "1". number() is what the rest of this screen writes a measured value with.
   */
  readonly chartNumber = (value: number): string => this.number(value);

  // ---- the library ---------------------------------------------------------------------

  private openLibrary(): void {
    if (this.libraryAsked()) return;
    this.libraryAsked.set(true);
    this.loadSavedQueries();
  }

  /**
   * Whether the run history has been asked for.
   *
   * Set inside loadRuns rather than here, so the fetch that follows every run counts as having
   * asked -- otherwise a reader who ran three queries and then opened Activity would spend a
   * fourth read to be handed the list this screen was already holding.
   */
  private readonly runsAsked = signal(false);

  private openRuns(): void {
    if (this.runsAsked()) return;
    this.loadRuns();
  }

  loadSavedQueries(): void {
    this.savedLoading.set(true);
    this.savedError.set('');
    this.analytics.fetchAllQueries().subscribe({
      next: response => {
        this.savedLoading.set(false);
        if (response.status !== API_SUCCESS) {
          this.savedError.set(response.message || 'Your saved queries could not be loaded.');
          return;
        }
        this.savedQueries.set(response.data ?? []);
      },
      error: err => {
        this.savedLoading.set(false);
        this.savedError.set(err?.error?.message || 'Your saved queries could not be loaded.');
      },
    });
  }

  loadRuns(): void {
    this.runsLoading.set(true);
    this.runsError.set('');
    this.runsAsked.set(true);
    this.analytics.fetchRecentRuns(25).subscribe({
      next: response => {
        this.runsLoading.set(false);
        if (response.status !== API_SUCCESS) {
          this.runsError.set(response.message || 'The run history could not be loaded.');
          return;
        }
        this.recentRuns.set(response.data ?? []);
      },
      error: err => {
        this.runsLoading.set(false);
        this.runsError.set(err?.error?.message || 'The run history could not be loaded.');
      },
    });
  }

  /** Stores what is in the editor as a NEW saved query, under the name that was typed. */
  saveAsNew(): void {
    if (!this.saveName().trim() || !this.sql().trim() || !this.path()) return;
    this.store({
      queryName: this.saveName().trim(),
      connectionAlias: this.connection(),
      datasetPath: this.path(),
      // Exactly as typed. The row ceiling belongs to the engine's configuration on the day it
      // runs, so a saved query must not carry a tidied or rewritten copy of itself.
      queryText: this.sql(),
    });
  }

  /**
   * Writes the editor's text back over the saved query it came from.
   *
   * Separate from saveAsNew rather than inferred from whether a query is loaded. Guessing would
   * mean the same button silently overwrites somebody's saved work on one visit and forks it on
   * the next, and the two are not recoverable from each other.
   */
  updateLoaded(): void {
    const loaded = this.loadedQuery();
    if (!loaded?.analyticsQueryId || !this.sql().trim()) return;
    this.store({
      analyticsQueryId: loaded.analyticsQueryId,
      queryName: this.saveName().trim() || loaded.queryName,
      connectionAlias: this.connection(),
      datasetPath: this.path(),
      queryText: this.sql(),
    });
  }

  private store(query: SavedQuery): void {
    this.saving.set(true);
    this.saveError.set('');
    this.analytics.saveQuery(query).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.saveError.set(response.message || 'The query could not be saved.');
          return;
        }
        // The row the server built, not the payload that was sent: it carries the id a new save
        // was given, and it is what Update has to point at from here on.
        this.loadedQuery.set(response.data);
        this.saveName.set(response.data.queryName ?? query.queryName);
        this.loadSavedQueries();
      },
      error: err => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message || 'The query could not be saved.');
      },
    });
  }

  /**
   * Puts a saved query back in the editor.
   *
   * It does NOT move the dataset to the one the row names. A saved query is a statement, and the
   * dataset it runs against is whatever is open -- which is the behaviour that lets one query be
   * pointed at this month's file. Where those disagree, loadedElsewhere says so on screen rather
   * than this quietly reopening a file the reader did not ask for.
   */
  loadSaved(query: SavedQuery): void {
    this.sql.set(query.queryText ?? '');
    this.saveName.set(query.queryName ?? '');
    this.loadedQuery.set(query);
    this.clearResult();
    this.saveError.set('');
  }

  startRename(query: SavedQuery): void {
    this.renamingId.set(query.analyticsQueryId ?? null);
    this.renameName.set(query.queryName ?? '');
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameName.set('');
  }

  applyRename(): void {
    const id = this.renamingId();
    const name = this.renameName().trim();
    if (!id || !name) return;
    this.analytics.renameQuery(id, name).subscribe({
      next: response => {
        this.cancelRename();
        if (response.status !== API_SUCCESS) {
          this.savedError.set(response.message || 'The query could not be renamed.');
          return;
        }
        // The one in the editor carries its own copy of the name; a rename that left the header
        // saying the old one would be the screen disagreeing with itself.
        const loaded = this.loadedQuery();
        if (loaded?.analyticsQueryId === id) {
          this.loadedQuery.set({ ...loaded, queryName: name });
          this.saveName.set(name);
        }
        this.loadSavedQueries();
      },
      error: err => {
        this.cancelRename();
        this.savedError.set(err?.error?.message || 'The query could not be renamed.');
      },
    });
  }

  /**
   * Deletes a saved query, behind the same confirmation every other destructive control here has.
   *
   * The body says what deleting does NOT do, because the pair is easy to get wrong: the history
   * rows this query produced survive it -- the server unhooks them rather than removing them --
   * and somebody deleting a query to erase a record would otherwise think they had.
   */
  async removeSaved(query: SavedQuery): Promise<void> {
    const id = query.analyticsQueryId;
    if (!id) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Delete this saved query?',
      body: `"${query.queryName}" will be removed. The record of the times it was run stays in `
        + 'the history below.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteQuery(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.savedError.set(response.message || 'The query could not be deleted.');
          return;
        }
        if (this.loadedQuery()?.analyticsQueryId === id) this.loadedQuery.set(null);
        this.loadSavedQueries();
      },
      error: err => {
        this.savedError.set(err?.error?.message || 'The query could not be deleted.');
      },
    });
  }

  /**
   * Puts a statement from the history back in the editor, without running it.
   *
   * Without running it on purpose. A row in this list may be one the engine refused or one that
   * took thirty seconds, and a single click that re-spends a governor permit on either is a
   * control that punishes curiosity.
   */
  reuseRun(run: QueryRun): void {
    this.sql.set(run.queryText ?? '');
    this.loadedQuery.set(null);
    this.saveName.set('');
    this.clearResult();
  }

  /**
   * A run's row count, or '' where there was none.
   *
   * A method rather than a template expression because zero is a real answer and null is not the
   * same one: a query that matched nothing returns 0 rows, a refusal returns no count at all, and
   * `@if (run.rowCount)` would draw both as the second.
   */
  runRows(run: QueryRun): string {
    const rows = run.rowCount;
    return rows === null || rows === undefined ? '' : rows.toLocaleString();
  }

  /** A run's timestamp in the reader's locale, falling back to the raw text if it will not parse. */
  runWhen(run: QueryRun): string {
    const raw = run.dateCreated;
    if (!raw) return '';
    const at = new Date(raw);
    return isNaN(at.getTime()) ? raw : at.toLocaleString();
  }

  /**
   * How long a run took INSIDE the engine, which is not how long the person waited.
   *
   * The server measures wall clock around the query and nothing else, so this figure excludes the
   * network and the queue in front of it. It is labelled on screen rather than presented as the
   * response time, because the two differ most exactly when the module is under load.
   */
  runTook(run: QueryRun): string {
    const ms = run.durationMs;
    if (ms === null || ms === undefined) return '';
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString(undefined,
      { maximumFractionDigits: 1 })} s`;
  }

  /**
   * Puts a statement from the history in the console and goes there.
   *
   * The Activity tab is not where a query is written, so the row's control has to land the reader
   * somewhere they can read and run it. It still does NOT run -- reuseRun's reason holds: a row
   * here may be one the engine refused or one that took thirty seconds, and a single click that
   * re-spends a governor permit on either is a control that punishes curiosity.
   */
  openRunInConsole(run: QueryRun): void {
    this.reuseRun(run);
    this.showTab('sql');
  }

  /**
   * The runs the engine turned away, which are the interesting ones.
   *
   * REFUSED is not a kind of failure and this is not a count of things that broke. A refusal is
   * the statement gate or the governor declining a query BEFORE it reached the engine -- most
   * often a statement that tried to write, attach or name a storage location of its own -- so a
   * run of them is a record of what this workspace attempted, which is the half of a history
   * worth leading with. TIMED_OUT is counted apart for the same reason: it is a limit, not a bug.
   */
  readonly refusedRuns = computed(() =>
    this.recentRuns().filter(run => run.runStatus === 'REFUSED'));

  readonly failedRuns = computed(() =>
    this.recentRuns().filter(run => run.runStatus === 'FAILED'));

  readonly stoppedRuns = computed(() => this.recentRuns().filter(
    run => run.runStatus === 'CANCELLED' || run.runStatus === 'TIMED_OUT'));

  /**
   * Only the runs against the dataset now open.
   *
   * Not a filter the reader applies -- a count, shown beside the total. The history is the whole
   * workspace's on purpose (the server scopes it to the caller, not to a file), and a reader
   * looking at one file wants to know which of these rows are about it before reading any of them.
   */
  readonly runsHere = computed(() => {
    const connection = this.connection();
    const path = this.path();
    if (!path) return [];
    return this.recentRuns().filter(
      run => run.connectionAlias === connection && run.datasetPath === path);
  });

  // ---- the canvas: dimensions, a measure, filters, drill and a pivot ----------------------

  readonly aggregations = AGGREGATIONS;
  readonly topNChoices = TOP_N_CHOICES;
  readonly maxDimensions = 3;

  /**
   * The dimensions, IN ORDER, because the order is the analysis.
   *
   * Department x Status and Status x Department group the same rows into the same buckets and
   * are not the same picture: the first dimension is the one a pivot puts down the side and the
   * one a chart labels its marks with. A Set would lose that, and so would three independent
   * signals -- this is one ordered list of at most three, and the slots in the template are a
   * view of it rather than the state itself.
   */
  readonly dimensions = signal<string[]>([]);
  readonly aggregation = signal<Aggregation>('COUNT_ROWS');
  readonly measureField = signal('');

  /** The filter tree the builder edits. Replaced wholesale; see FilterBuilder's own note. */
  readonly canvasFilters = signal<FilterGroup>(emptyFilterGroup());

  /**
   * Filters added by CLICKING a result rather than by building one.
   *
   * Held apart from the builder's tree on purpose, and it is not a tidiness decision. A chip a
   * reader added with one click has to come off with one click, and finding that clause again
   * inside a nested tree to remove it is a lookup that can fail. Keeping them in a flat list
   * beside the tree makes "remove this chip" exact.
   */
  readonly crossFilters = signal<FilterClause[]>([]);

  /**
   * The drill trail, ECHOED from the server and never composed here.
   *
   * The endpoints are stateless, so the trail travels on every request -- and the server is the
   * side that applied the filters and swapped the dimensions, so it is the side entitled to say
   * what the trail is. This client carries the list from one response into the next request
   * without interpreting a single step of it. That is not deference for its own sake: the moment
   * a client's idea of the accumulated filters differs from the server's, the figure and the
   * breadcrumb above it are describing two different questions and nothing on screen says so.
   */
  readonly drillPath = signal<Drill[]>([]);

  readonly topNLimit = signal<number | null>(null);
  readonly topNOther = signal(true);
  readonly topNCustom = signal('');

  readonly sortBy = signal<'MEASURE' | 'DIMENSION'>('MEASURE');
  readonly sortDirection = signal<'ASC' | 'DESC'>('DESC');

  readonly canvasKindName = signal<CanvasKind | ''>('');

  readonly analysisResult = signal<AnalysisResult | null>(null);
  readonly analysisError = signal('');
  readonly analysing = signal(false);
  readonly analysisRunId = signal('');
  readonly analysisStopping = signal(false);

  /** Which dimension a drill replaces, and what replaces it. Both picked before a row is clicked. */
  readonly drillDimension = signal('');
  readonly drillNext = signal('');

  readonly analyses = signal<SavedAnalysis[]>([]);
  readonly analysesLoading = signal(false);
  readonly analysesError = signal('');
  /**
   * Why the last reopen failed, held apart from analysesError.
   *
   * Two different failures with two different remedies. "The list could not be read" is about
   * the request that fetches them; "this one will not parse" is about a row that is already in
   * the list and stays in it. Folding the second into the first meant it was invisible while the
   * list was still loading, which is exactly when somebody clicks a stale row.
   */
  readonly analysisOpenError = signal('');
  readonly analysisName = signal('');
  readonly savingAnalysis = signal(false);
  readonly analysisSaveError = signal('');
  readonly loadedAnalysis = signal<SavedAnalysis | null>(null);
  private readonly analysesAsked = signal(false);

  /** Whether the chosen aggregation is a question about a column rather than about rows. */
  readonly measureNeedsField = computed(() =>
    AGGREGATIONS.find(a => a.id === this.aggregation())?.needsField ?? true);

  /** What the chosen aggregation cannot say about itself, or '' where there is nothing to add. */
  readonly aggregationHedge = computed(() =>
    AGGREGATIONS.find(a => a.id === this.aggregation())?.hedge ?? '');

  /**
   * Three slots, each holding a dimension or ''.
   *
   * A view of dimensions(), padded to the next free slot. Padding to exactly one empty slot
   * rather than always three keeps the row from offering a third dimension before a second has
   * been picked, which is an analysis nobody can express anyway -- the dimensions are ordered.
   */
  readonly dimensionSlots = computed<string[]>(() => {
    const picked = this.dimensions();
    return picked.length < this.maxDimensions ? [...picked, ''] : picked;
  });

  /** Columns still available for a given slot: everything not already used by another slot. */
  dimensionOptions(slot: number): DatasetColumn[] {
    const taken = new Set(this.dimensions().filter((_, at) => at !== slot));
    return this.columns().filter(column => !taken.has(column.name));
  }

  /**
   * Sets, replaces or clears one dimension slot.
   *
   * Clearing a middle slot COMPACTS the list rather than leaving a hole, because a hole is not a
   * state the contract has: dimensions are "1..3, in order", and a gap would have to be sent as
   * either two dimensions or three, one of which is empty.
   *
   * It also drops the drill trail, and that is the load-bearing half. A drill is a narrowing of
   * one particular analysis -- it replaced a dimension and added a filter for a value of it --
   * so an analysis whose dimensions have since been re-picked has no trail to be at the end of.
   * Keeping the filters while dropping the dimensions they came from would leave the reader
   * filtered to "region = north" by a step they can no longer see or undo.
   */
  /**
   * What the server says the analysis is grouped by RIGHT NOW, which is not what it was built from.
   *
   * dimensions() is the ROOT: the list a reader picked, and the list the request carries. A drill
   * does not change it — the drill path travels beside it and the server applies the substitution,
   * which is what lets drill-up put the original dimension back.
   *
   * Conflating the two was a real defect. The response's dimensions were written straight back
   * into dimensions(), so after one drill the root WAS the drilled column: clicking "All rows"
   * then asked the server to restore a root that had already been overwritten, and a reader who
   * drilled region into east by customer landed on all fifty thousand customers instead of the
   * five regions they started from. The breadcrumb promised a return and delivered a different
   * analysis.
   *
   * Empty until a run answers, and emptied whenever the root changes, because a grouping reported
   * for a different analysis describes nothing.
   */
  readonly groupedBy = signal<string[]>([]);

  /** What is on screen: the server's grouping where there is one, the root before the first run. */
  readonly effectiveDimensions = computed(() =>
    this.groupedBy().length ? this.groupedBy() : this.dimensions());

  setDimension(slot: number, name: string): void {
    const next = [...this.dimensions()];
    if (!name) next.splice(slot, 1);
    else if (slot >= next.length) next.push(name);
    else next[slot] = name;
    this.dimensions.set(next.slice(0, this.maxDimensions));
    // The reported grouping described the analysis that just stopped existing.
    this.groupedBy.set([]);
    this.clearDrills();
    // The drill controls name columns; a dimension list that changed may have taken one away.
    if (!next.includes(this.drillDimension())) this.drillDimension.set(next[next.length - 1] ?? '');
    if (next.includes(this.drillNext())) this.drillNext.set('');
  }

  /**
   * The filters actually sent: the built tree, then the clicked chips.
   *
   * THE DRILL STEPS ARE NOT IN HERE, and that is the correction the shipped DTO forced. The
   * server derives a drill's predicates from drillPath itself, so adding them here as well would
   * apply every one of them twice -- harmless for an equality and not harmless at all for the
   * null groups, which the server narrows with IS NULL and an echo here would narrow with an
   * equality that is never true.
   *
   * An OR tree from the builder is NESTED rather than spread. Spreading `(a OR b)` into a list
   * joined by AND turns a filter that admitted either into one that demands both, silently, and
   * only when a chip happens to be present -- which is the worst possible time to change what a
   * reader's filter means.
   */
  readonly activeFilters = computed<FilterGroup>(() => {
    const built = pruneFilters(this.canvasFilters());
    const clicked: FilterNode[] = [...this.crossFilters()];
    if (!clicked.length) return built;
    const base: FilterNode[] = !built.clauses.length ? []
      : built.op === 'AND' ? built.clauses : [built];
    return { op: 'AND', clauses: [...base, ...clicked] };
  });

  /** Conditions the builder is showing, including ones still being typed. */
  readonly builtFilterCount = computed(() => countFilterClauses(this.canvasFilters()));

  /**
   * Conditions on screen that are NOT being sent, because an operand is still missing.
   *
   * Shown rather than swallowed. A half-typed BETWEEN dropped quietly is a predicate the reader
   * believes is applied to the rows they are about to read.
   */
  readonly unfinishedFilterCount = computed(() =>
    this.builtFilterCount() - countFilterClauses(pruneFilters(this.canvasFilters())));

  /** Everything narrowing the result right now, as removable chips. */
  readonly filterChips = computed(() => {
    const chips: { key: string; label: string; kind: 'clicked' | 'drill'; index: number }[] = [];
    this.crossFilters().forEach((clause, index) => chips.push({
      key: `click-${index}`, label: describeClause(clause), kind: 'clicked', index,
    }));
    // Labelled from the trail's own crumb where there is one, so a chip and the breadcrumb over
    // it never word the same step differently. The fallback is only reached when the server sent
    // a trail without crumbs, which crumbsMissing already says out loud.
    const crumbs = this.crumbTrail();
    this.drillPath().forEach((step, index) => chips.push({
      key: `drill-${index}`,
      label: crumbs[index + 1]?.label
        ?? `${step.dimension}: ${step.value === null ? 'no value' : step.value}`,
      kind: 'drill', index,
    }));
    return chips;
  });

  /**
   * True when anything at all is narrowing the rows the figures are computed over.
   *
   * Named apart from filtered(), which is the storage rail's "the file list is filtered". Two
   * things called filtered on one screen is how a template ends up asking one of them and
   * meaning the other.
   */
  readonly analysisFiltered = computed(() => this.activeFilters().clauses.length > 0);

  readonly topNActive = computed(() => this.topNLimit() !== null);

  /**
   * The analysis exactly as it will be sent.
   *
   * A computed rather than a method so the template can show the reader what is about to run --
   * the dimension count, the measure, how many filters -- from the same value the request is
   * built from. A screen that describes the analysis from one place and sends another is a screen
   * that can describe an analysis nobody ran.
   */
  readonly analysisRequest = computed<AnalysisRequest>(() => {
    const filters = this.activeFilters();
    const limit = this.topNLimit();
    return {
      connection: this.connection(),
      path: this.path(),
      dimensions: this.dimensions(),
      measure: this.measureNeedsField()
        ? { aggregation: this.aggregation(), field: this.measureField() }
        : { aggregation: this.aggregation() },
      filters: filters.clauses.length ? filters : undefined,
      topN: limit === null ? undefined : { limit, includeOther: this.topNOther() },
      sort: { by: this.sortBy(), direction: this.sortDirection() },
      drillPath: this.drillPath(),
    };
  });

  readonly canAnalyse = computed(() =>
    this.hasDataset() && !this.analysing()
    && (!this.measureNeedsField() || !!this.measureField()));

  /** Why Run is disabled, said out loud rather than left as a greyed-out control. */
  readonly analyseBlocker = computed(() => {
    if (!this.hasDataset()) return 'Open a dataset first.';
    if (this.measureNeedsField() && !this.measureField()) {
      return 'Pick the column to measure. Only "Count rows" is a question about rows rather '
        + 'than about a column.';
    }
    return '';
  });

  readonly canStopAnalysis = computed(() =>
    this.analysing() && !!this.analysisRunId() && !this.analysisStopping());

  /**
   * Runs the analysis.
   *
   * Named before it is sent for the reason run() names a query: the endpoint is synchronous, so
   * an id minted by the server would arrive with the rows, which is after there is anything left
   * to stop.
   *
   * A fresh run KEEPS the drill trail, because analysisRequest() sends it -- changing the Top-N
   * of a drilled-into view should not silently climb back out of it. The trail is dropped only
   * where it stops meaning anything: when the dimensions it drilled through are re-picked.
   */
  runAnalysis(): void {
    if (!this.canAnalyse()) return;
    const runId = 'ui-' + Date.now().toString(36) + '-'
      + Math.random().toString(36).slice(2, 8);
    this.beginAnalysis(runId);
    this.analytics.analyze({ ...this.analysisRequest(), queryId: runId })
      .subscribe(this.analysisHandler());
  }

  /**
   * Narrows into one value of one dimension.
   *
   * Nothing is composed here. The step goes with the trail, the server decides what it implies,
   * and the answer carries the new trail and the new dimensions -- which analysisHandler adopts.
   * Composing it on this side first would be a second implementation of the server's own rule,
   * and a failed drill would leave the screen holding a narrowing that never happened.
   *
   * A NULL value is passed through as null rather than skipped. The group with no value in it is
   * a group a reader can see rows in, and the server narrows it with IS NULL; turning it into an
   * empty string here would drill into a value the data does not contain.
   */
  drillInto(value: string | null): void {
    const dimension = this.drillDimension();
    // Against the EFFECTIVE grouping: a reader drills through the column in front of them, which
    // after one step is no longer in the root list.
    if (!dimension || !this.effectiveDimensions().includes(dimension) || this.analysing()) return;
    const runId = 'ui-' + Date.now().toString(36) + '-'
      + Math.random().toString(36).slice(2, 8);
    this.beginAnalysis(runId);
    this.analytics.drill(
      { ...this.analysisRequest(), queryId: runId },
      { dimension, value, nextDimension: this.drillNext() || undefined },
    ).subscribe(this.analysisHandler(() => this.drillNext.set('')));
  }

  /**
   * Climbs back out, by however many steps the reader asked for.
   *
   * The count is worked out from the SERVER'S crumb list where there is one -- crumbClick passes
   * what the crumbs say -- so the control does what the thing on screen says it will do. More
   * steps than there are is not an error at the far end either: the server answers it as the
   * root, which is exactly what clicking the first crumb means.
   */
  drillUp(steps: number): void {
    if (steps <= 0 || !this.drillPath().length || this.analysing()) return;
    const runId = 'ui-' + Date.now().toString(36) + '-'
      + Math.random().toString(36).slice(2, 8);
    this.beginAnalysis(runId);
    this.analytics.drillUp({ ...this.analysisRequest(), queryId: runId }, steps)
      .subscribe(this.analysisHandler());
  }

  /**
   * Clicking a crumb removes every filter after it.
   *
   * Index 0 is "All rows", so clicking crumb i keeps i drills. The count comes from the crumb
   * list on screen rather than from drillPath(), because the crumbs are what the reader clicked.
   */
  crumbClick(index: number): void {
    const crumbs = this.crumbTrail();
    if (index >= crumbs.length - 1) return;
    this.drillUp((crumbs.length - 1) - index);
  }

  /** The server's crumbs, unmodified. Empty when it sent none -- see crumbsMissing. */
  readonly crumbTrail = computed<AnalysisCrumb[]>(() => this.analysisResult()?.crumbs ?? []);

  /**
   * True when there is a drill trail but the server did not describe it.
   *
   * Said on screen rather than papered over with a locally built trail. The contract puts the
   * crumbs on every response so the client never reconstructs them; a response without them is a
   * server that is not holding up its half, and inventing the labels here would hide exactly that.
   */
  readonly crumbsMissing = computed(() =>
    !!this.drillPath().length && !this.crumbTrail().length);

  private beginAnalysis(runId: string): void {
    this.analysing.set(true);
    this.analysisStopping.set(false);
    this.analysisRunId.set(runId);
    this.analysisError.set('');
  }

  /**
   * The one response handler the three analysis calls share.
   *
   * It is also the ONE place the analysis state is adopted from an answer: the trail and the
   * dimensions come back on every response, and taking them here means a drill, a drill-up and a
   * plain re-run cannot end up with three slightly different ideas of where the reader is.
   *
   * `applied` runs only on success and only carries what is genuinely local -- resetting a
   * picker, say -- never anything the server has already decided.
   */
  private analysisHandler(applied?: () => void) {
    return {
      next: (response: { status: string; message: string; data?: AnalysisResult }) => {
        this.analysing.set(false);
        this.analysisRunId.set('');
        this.analysisStopping.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          // The server's own sentence. On this path it is as likely to be the statement gate or
          // the governor as a fault, and a paraphrase would lose which.
          this.analysisError.set(response.message || 'The analysis could not be run.');
          return;
        }
        this.analysisResult.set(response.data);
        // The server's answer about where the reader now is. Guarded rather than assumed: a
        // response without dimensions is not a response saying "no dimensions", and clearing the
        // pickers on one would empty an analysis that ran perfectly well.
        this.drillPath.set(response.data.drillPath ?? []);
        if (response.data.dimensions) {
          // Into groupedBy, NOT into dimensions. What comes back is the EFFECTIVE grouping after
          // the drill path was applied; the root is what this client sent and must keep sending,
          // or drill-up has nothing to restore from.
          this.groupedBy.set(response.data.dimensions.slice(0, this.maxDimensions));
          // The next drill needs a dimension of its own to replace, and the one just used is gone.
          if (!this.effectiveDimensions().includes(this.drillDimension())) {
            const grouped = this.effectiveDimensions();
            this.drillDimension.set(grouped[grouped.length - 1] ?? '');
          }
        }
        if (applied) applied();
      },
      error: (err: { error?: { message?: string } }) => {
        this.analysing.set(false);
        this.analysisRunId.set('');
        this.analysisStopping.set(false);
        this.analysisError.set(err?.error?.message || 'The analysis could not be run.');
      },
    };
  }

  /** Stops the analysis in flight. Same race, same silence, as the console's stop control. */
  stopAnalysis(): void {
    const runId = this.analysisRunId();
    if (!runId || this.analysisStopping()) return;
    this.analysisStopping.set(true);
    this.analytics.cancel(runId).subscribe({
      next: () => {},
      error: () => this.analysisStopping.set(false),
    });
  }

  // ---- cross-filtering -------------------------------------------------------------------

  /**
   * Clicking a result narrows everything derived from it.
   *
   * One filter, applied once, re-runs the analysis -- so the table, the pivot and the chart all
   * narrow together because all three are drawn from the one result. That is the difference
   * between this and a click that filters a chart in the browser: the numbers change, not just
   * what is drawn, so an average stays an average OF the rows that match.
   *
   * WHAT IT DOES NOT NARROW is the Data tab's preview, and the screen says so rather than
   * leaving the reader to assume. The preview endpoint takes connection, path, page and size and
   * has no filter parameter at all; adding one is spec 06's filterable-grid work, which is not
   * built. A chip that appeared to filter a table it cannot reach would be worse than no chip.
   */
  crossFilter(field: string, value: string | null): void {
    // A null cell filters to IS NULL and not to an equality. "= NULL" is never true, so an
    // equality here would hand back an empty result for a group the reader can see has rows in
    // it -- and they would read that emptiness as the answer.
    const clause: FilterClause = value === null || value === undefined
      ? { field, operator: 'IS_NULL' }
      : { field, operator: 'EQ', value };
    const already = this.crossFilters().some(existing =>
      existing.field === clause.field && existing.operator === clause.operator
      && existing.value === clause.value);
    if (already) return;
    this.crossFilters.set([...this.crossFilters(), clause]);
    this.runAnalysis();
  }

  /**
   * The raw value of the drill dimension in one row.
   *
   * RAW, not rendered. The rendered form is what a reader sees -- a plain decimal, a date without
   * its phantom midnight -- and sending it back as a filter operand would ask the server to match
   * a string it did not produce.
   */
  drillValueOf(row: { cells: { column?: AnalysisColumn; raw: string | null }[] }): string | null {
    const dimension = this.drillDimension();
    const cell = row.cells.find(entry => entry.column?.name === dimension);
    // null, not '': the group with no value in it is drilled as IS NULL server-side, and an
    // empty string here would drill into a value the data does not contain.
    return cell ? cell.raw : null;
  }

  /**
   * Whether a chart mark can be cross-filtered.
   *
   * Only on a one-dimension analysis. A mark on two or three dimensions is labelled with all of
   * them joined -- "north · active" -- and that string is not a value in any column, so filtering
   * on it would be a filter that matches nothing while looking like it matched something. The
   * marks are inert there rather than wrong, and the table underneath still filters per cell.
   */
  readonly markClickable = computed(() => this.dimensionColumns().length === 1);

  crossFilterFromMark(name: string): void {
    const first = this.dimensionColumns()[0];
    if (!first || !this.markClickable()) return;
    this.crossFilter(first.name, name);
  }

  removeChip(chip: { kind: 'clicked' | 'drill'; index: number }): void {
    if (chip.kind === 'drill') {
      // A drill filter comes off by climbing back out of it, not by deleting a clause: the
      // dimension it displaced has to come back with it, and only the server knows which.
      this.drillUp(this.drillPath().length - chip.index);
      return;
    }
    this.crossFilters.set(this.crossFilters().filter((_, at) => at !== chip.index));
    this.runAnalysis();
  }

  /** Clears the clicked filters. The built tree and the drill trail are left where they are. */
  clearCrossFilters(): void {
    if (!this.crossFilters().length) return;
    this.crossFilters.set([]);
    this.runAnalysis();
  }

  setFilters(group: FilterGroup): void {
    this.canvasFilters.set(group);
  }

  // ---- reading the result faithfully -----------------------------------------------------

  /**
   * One cell, rendered as what its column says it is.
   *
   * This is the rendering rule from the contract and it is a correctness rule. A measure column
   * arriving as "7.466125E7" is 74,661,250 and a reader glancing at it sees seven-point-four; a
   * DATE arriving as "2024-01-01 00:00:00.0" claims a midnight the column cannot hold. Both are
   * fixed on the string, never through a float -- see plainDecimal.
   *
   * TIMESTAMP is deliberately left whole. It genuinely carries a time, and trimming it would be
   * this function inventing the opposite error.
   */
  renderCell(column: AnalysisColumn | null | undefined, raw: string | null): string {
    if (raw === null || raw === undefined) return '';
    if (!column) return raw;
    if (DATE_ONLY_TYPE.test(column.type ?? '')) return dateOnly(raw);
    if (isNumericType(column.type)) return plainDecimal(raw);
    return raw;
  }

  /**
   * The measure column, by the name the server gave it.
   *
   * The response names it outright so nothing here has to work it out. The role scan is only the
   * fallback for a response that did not, and it is a fallback rather than the rule because "the
   * last MEASURE column" is a guess and `measure` is an answer.
   */
  readonly measureColumn = computed<AnalysisColumn | null>(() => {
    const result = this.analysisResult();
    const columns = result?.columns ?? [];
    const named = result?.measure
      ? columns.find(column => column.name === result.measure) : undefined;
    if (named) return named;
    for (let i = columns.length - 1; i >= 0; i--) {
      if (columns[i].role === 'MEASURE') return columns[i];
    }
    return null;
  });

  readonly dimensionColumns = computed<AnalysisColumn[]>(() =>
    (this.analysisResult()?.columns ?? []).filter(column => column.role === 'DIMENSION'));

  /**
   * The rows, pre-rendered, with the two facts each cell needs to be interactive.
   *
   * Pre-rendered because renderCell would otherwise run once per cell per change-detection pass,
   * and a hundred-row result at four columns is four hundred regex tests for a screen that has
   * not changed. `isNull` is carried separately from the text because a null and an empty string
   * are different facts and the table draws them differently -- the same distinction the preview
   * table draws.
   */
  readonly analysisRows = computed(() => {
    const result = this.analysisResult();
    if (!result) return [];
    const columns = result.columns ?? [];
    const otherLabel = result.other?.label ?? '';
    return (result.rows ?? []).map(row => {
      const cells = row.map((raw, index) => ({
        column: columns[index],
        raw,
        text: this.renderCell(columns[index], raw),
        isNull: raw === null || raw === undefined,
      }));
      return {
        cells,
        // The rolled-up row, which is not a category and must not behave like one: it cannot be
        // cross-filtered to and it cannot be drilled into, because "Other" is not a value in the
        // data -- it is this many values the reader has not been shown.
        //
        // Matched on the LABEL, which is the only signal in the response, and the server's own
        // Drill type says why that is imperfect: a dataset is perfectly entitled to contain the
        // value "Other". The failure is one-directional and conservative -- a real row spelled
        // like the roll-up goes inert, never the reverse -- and the note under the table says so
        // rather than leaving a reader to wonder why one row will not click.
        isOther: !!otherLabel && cells.some(
          cell => cell.column?.role === 'DIMENSION' && cell.raw === otherLabel),
      };
    });
  });

  readonly analysisTruncated = computed(() => !!this.analysisResult()?.truncated);
  readonly otherBucket = computed(() => this.analysisResult()?.other ?? null);

  /**
   * Whether the distinct count on screen is exact, and this screen does not assume it either way.
   *
   * THE SAME WORD MEANS TWO DIFFERENT THINGS ON TWO TABS OF THIS SCREEN, which is exactly why it
   * is labelled. The Profile tab's distinct counts come from SUMMARIZE's approx_unique -- a
   * HyperLogLog sketch, measured 3.7% low over a million distinct values. The Canvas's come from
   * a grouped count(DISTINCT ...), which is exact, and the shipped builder aliases that column
   * "<field>_distinct_count". A reader who has learnt to distrust one has no way of knowing the
   * other is trustworthy unless it is said.
   *
   * Read off the column NAME rather than hard-coded, because the name is what actually arrived:
   * a server that later swapped in an approximation would rename the column and this would follow
   * it, where a constant would go on claiming exactness for a sketch. Anything unrecognised is
   * reported as UNSTATED rather than rounded up to either answer.
   */
  readonly distinctExactness = computed<'estimated' | 'exact' | 'unstated' | ''>(() => {
    if (this.aggregation() !== 'DISTINCT_COUNT' || !this.analysisResult()) return '';
    const name = this.measureColumn()?.name ?? '';
    if (/approx/i.test(name)) return 'estimated';
    if (/(^|_)distinct_count$/i.test(name) || /exact/i.test(name)) return 'exact';
    return 'unstated';
  });

  readonly distinctNote = computed(() => {
    switch (this.distinctExactness()) {
      case 'estimated':
        return `The server named this column "${this.measureColumn()?.name}", so this distinct `
          + 'count is a sketch rather than a count. The same sketch on the Profile tab measured '
          + '3.7% low over a million distinct values.';
      case 'exact':
        return 'This distinct count is exact — a count of the different values in each group. It '
          + 'is not the same figure as the Profile tab\'s distinct count, which is an estimate.';
      case 'unstated':
        return 'The server does not say whether this distinct count is exact or estimated, and '
          + 'this screen will not guess. Treat it as approximate unless you have checked: the '
          + 'distinct counts on the Profile tab are sketches, measured 3.7% low over a million '
          + 'distinct values.';
      default:
        return '';
    }
  });

  /** Aggregations whose parts add up, which is what a total or a share is allowed to assume. */
  readonly additive = computed(() => ADDITIVE.includes(this.aggregation()));

  // ---- the pivot -------------------------------------------------------------------------

  /**
   * Two dimensions as a matrix, as the SERVER shaped it, with the totals added here.
   *
   * The grid arrives on the ordinary response when the analysis has exactly two dimensions, so
   * its presence IS the answer to "can this be drawn as a grid" -- and rebuilding it from the
   * flat rows would be a second implementation of the same rearrangement, which could disagree
   * with the server's about which dimension is the row axis and transpose somebody's chart
   * without saying so.
   *
   * The direct engine route was never available in any case: DuckDB has a PIVOT statement and
   * StatementGate refuses it by name, because PIVOT and UNPIVOT are reads DuckDB declines to
   * serialise and so arrive at the gate indistinguishable from a write.
   *
   * What is added here is the row TOTAL, and only where the parts add up to it. A row of averages
   * has no total, and printing the sum of them would be a number the data does not contain.
   */
  readonly pivot = computed(() => {
    const grid = this.analysisResult()?.pivot;
    if (!grid) return null;
    const measure = this.measureColumn();
    const additive = this.additive();
    const rows = (grid.rows ?? []).map(row => ({
      label: row.key === null || row.key === undefined
        ? '' : this.renderCell(this.dimensionColumns()[0], row.key),
      values: row.cells.map(cell =>
        cell === null || cell === undefined ? null : this.renderCell(measure, cell)),
      total: additive
        ? row.cells.reduce<number | null>((sum, text) => {
            const value = asNumber(text);
            return value === null ? sum : (sum ?? 0) + value;
          }, null)
        : null,
    }));
    return {
      rowDimension: grid.rowDimension,
      columnDimension: grid.columnDimension,
      columns: grid.columnValues ?? [],
      rows,
      additive,
      /** True when the column dimension had more values than a grid can carry, so none is drawn. */
      columnsTruncated: !!grid.columnsTruncated,
    };
  });

  /** Why the pivot shows no totals, said where the totals would have been. */
  readonly pivotTotalNote = computed(() => this.additive() ? ''
    : `Rows have no total: ${this.aggregationLabel()} does not add up. The ${this.aggregationLabel().toLowerCase()} `
      + 'of a row is not the sum of the cells in it, so no figure is offered rather than a wrong one.');

  aggregationLabel(): string {
    return AGGREGATIONS.find(a => a.id === this.aggregation())?.label ?? this.aggregation();
  }

  // ---- a chart of the analysis -----------------------------------------------------------

  /**
   * The marks: one per result row, labelled by its dimensions and measured by the measure.
   *
   * Rows whose measure does not parse are LEFT OUT and counted, never coerced to zero -- the same
   * rule the SQL tab's chart keeps, and for the same reason: a bar moved down by an amount
   * nobody measured is worse than a bar that is not there.
   */
  readonly canvasPoints = computed<ChartPoint[]>(() => {
    const result = this.analysisResult();
    const measure = this.measureColumn();
    if (!result || !measure) return [];
    const columns = result.columns ?? [];
    const measureAt = columns.indexOf(measure);
    const dimensionAt = columns
      .map((column, index) => ({ column, index }))
      .filter(entry => entry.column.role === 'DIMENSION')
      .map(entry => entry.index);
    if (measureAt < 0 || !dimensionAt.length) return [];
    const points: ChartPoint[] = [];
    for (const row of result.rows ?? []) {
      const value = asNumber(row[measureAt]);
      if (value === null) continue;
      const name = dimensionAt
        .map(index => this.renderCell(columns[index], row[index]) || '(null)')
        .join(' · ');
      points.push({ name, value, rows: 1 });
    }
    return points;
  });

  /** Rows the chart could not draw, because their measure is not a number. */
  readonly canvasUnparsed = computed(() =>
    (this.analysisResult()?.rows?.length ?? 0) - this.canvasPoints().length);

  /**
   * Marks whose measure is zero or below.
   *
   * Counted because RankedBar DROPS them -- `data().filter(d => d.value > 0)` -- and a dropped
   * bar looks exactly like a category that was never in the data. On this screen that is a
   * realistic result rather than an edge case: a SUM over refunds is negative, and a COUNT over a
   * group that a filter emptied is zero. The rows stay in the table; the note says the chart is
   * missing them.
   */
  readonly canvasNonPositive = computed(() =>
    this.canvasPoints().filter(point => point.value <= 0).length);

  /**
   * The kinds on offer, each with the reason it cannot draw THIS result or ''.
   *
   * The same pattern as the console's chart picker and the connection picker: an option that
   * cannot work stays listed and inert with the reason on it, because the reason is a fact about
   * the reader's analysis rather than about the screen.
   */
  readonly canvasKinds = computed<{ id: CanvasKind; label: string; issue: string }[]>(() => {
    const result = this.analysisResult();
    const points = this.canvasPoints().length;
    const dimensions = this.dimensionColumns().length;
    const noNumbers = !result ? 'Nothing has run yet.'
      : !points ? 'No row in this result has a measure that reads as a number.' : '';
    return [
      { id: 'table', label: 'Table', issue: result ? '' : 'Nothing has run yet.' },
      {
        id: 'pivot', label: 'Pivot',
        // The server sends the grid when it can be drawn, so its ABSENCE is the reason rather
        // than a rule reimplemented here. Two dimensions is the usual reason it is absent; too
        // many column values is the other, and it says which.
        issue: !result ? 'Nothing has run yet.'
          : dimensions !== 2
            ? `A pivot needs exactly two dimensions; this analysis has ${dimensions}.`
          : result.pivot?.columnsTruncated
            ? `${result.pivot.columnDimension} has more values than a grid can carry. A Top-N `
              + 'narrows it.'
          : !result.pivot ? 'The server did not send a grid for this analysis.'
          : '',
      },
      { id: 'ranked', label: 'Ranked bars', issue: noNumbers },
      {
        id: 'bar', label: 'Bars in order',
        issue: noNumbers || (points > ORDERED_BARS
          ? `${points} bars is past what this chart can label; the ranked view keeps the largest.` : ''),
      },
      {
        id: 'donut', label: 'Share of the total',
        issue: noNumbers
          || (!this.additive()
            ? `A ring divides a total, and ${this.aggregationLabel().toLowerCase()} has no total to divide.`
            : this.canvasNonPositive()
              // A ring asserts that the parts make the whole. A negative part cannot be a share
              // of anything, and a zero one draws as nothing while still being counted in.
              ? `${this.canvasNonPositive()} of these figures is zero or below, and a share of a `
                + 'total cannot include one.'
              : points > DONUT_SLICES
                ? `${points} slices is past the six colours this palette can tell apart.` : ''),
      },
    ];
  });

  /**
   * The kind being drawn: what was picked if it still works, otherwise the first that does.
   *
   * Falls back rather than drawing nothing, and falls back VISIBLY -- the picker moves with it,
   * the same way the console's does when a new result takes a chart kind away.
   */
  readonly canvasKind = computed<CanvasKind | null>(() => {
    const kinds = this.canvasKinds();
    const picked = kinds.find(kind => kind.id === this.canvasKindName());
    if (picked && !picked.issue) return picked.id;
    return kinds.find(kind => !kind.issue)?.id ?? null;
  });

  /** What the figure claims to be, in one line above it. */
  readonly canvasCaption = computed(() => {
    const measure = this.aggregationLabel()
      + (this.measureNeedsField() && this.measureField() ? ` of ${this.measureField()}` : '');
    const dimensions = this.effectiveDimensions();
    return dimensions.length ? `${measure} by ${dimensions.join(' × ')}`
      : `${measure}, over every matching row`;
  });

  /**
   * What the figure cannot say about itself.
   *
   * Every line here is a row, a category or a whole tail that is not on screen, or a claim the
   * numbers on screen are not entitled to make. The truncation and the roll-up are said again ON
   * the figure as well, because these read as a footnote and a footnote is read after the number
   * has already been believed.
   */
  readonly canvasNotes = computed<string[]>(() => {
    const notes: string[] = [];
    const result = this.analysisResult();
    if (!result) return notes;

    if (result.truncated) {
      notes.push('This result stopped at the server\'s row ceiling. Groups that match are '
        + 'missing from it, and nothing here can say how many or which way they would move a '
        + 'figure. Narrow it with a filter or a smaller Top-N.');
    }

    const other = this.otherBucket();
    if (other) {
      // valueCount, never values.length. The list is capped on a high-cardinality dimension and
      // the server says so; reporting the length of a sample as the size of the bucket would turn
      // its own honesty about the cap into a smaller, wrong number.
      const count = other.valueCount;
      const listed = (other.values ?? []).join(', ');
      notes.push(`${count} ${count === 1 ? 'value was' : 'values were'} rolled into `
        + `"${other.label}"${listed ? ': ' + listed : ''}`
        + (other.valuesTruncated ? ', and more that are not listed.' : '.'));
    } else if (this.topNActive() && !this.topNOther()) {
      notes.push(`Top ${this.topNLimit()} with no Other bucket: anything outside the top `
        + `${this.topNLimit()} is absent from this result entirely, not summarised in it.`);
    }

    const drawn = this.canvasKind() !== 'table' && this.canvasKind() !== 'pivot';
    const unparsed = this.canvasUnparsed();
    if (unparsed > 0 && drawn) {
      notes.push(`${unparsed} ${unparsed === 1 ? 'row is' : 'rows are'} not drawn: the measure `
        + 'does not read as a number. They are left out rather than counted as zero.');
    }
    const nonPositive = this.canvasNonPositive();
    if (nonPositive > 0 && this.canvasKind() === 'ranked') {
      notes.push(`${nonPositive} ${nonPositive === 1 ? 'figure is' : 'figures are'} zero or below `
        + 'and the ranked view does not draw a bar for those. They are in the table.');
    }

    if (this.analysisFiltered()) {
      notes.push(`${countFilterClauses(this.activeFilters())} filters are on. Every figure here `
        + 'is over the rows that match them — a category with no matching rows is absent from '
        + 'this result, which is not the same as its value being zero.');
    }

    if (this.distinctNote()) notes.push(this.distinctNote());
    if (this.aggregationHedge() && this.aggregation() === 'MEDIAN') {
      notes.push(this.aggregationHedge());
    }

    // What "last 7 days" actually meant, in dates. A relative window is not reproducible from the
    // request alone -- it depends on when it ran -- so two charts taken an hour either side of
    // midnight legitimately differ, and this is the only thing that lets a reader see why.
    const windows = result.resolvedWindows ?? {};
    for (const [window, range] of Object.entries(windows)) {
      notes.push(`"${window}" resolved to ${range}.`);
    }

    if (this.multiFile()) {
      notes.push('Every figure covers all the files the pattern matches, read as one dataset.');
    }
    return notes;
  });

  /** The empty state, which is four different facts and not one. */
  readonly canvasEmptyMessage = computed(() => {
    if (!this.hasDataset()) return 'Open a dataset to analyse it.';
    if (this.analyseBlocker()) return this.analyseBlocker();
    if (!this.analysisResult()) return 'Nothing has run yet.';
    if (!this.analysisResult()!.rows?.length) {
      return this.analysisFiltered()
        ? 'No rows match these filters. That is an answer: the rows are excluded, not zero.'
        : 'The analysis returned no rows.';
    }
    return 'Nothing to draw from this result.';
  });

  setTopN(limit: number | null): void {
    this.topNLimit.set(limit);
    if (limit === null) this.topNCustom.set('');
  }

  /**
   * A custom N, applied only once it is a usable number.
   *
   * A blank or a zero clears the Top-N rather than asking for the top nothing, and a negative is
   * refused the same way: an N the server would have to interpret is an N this screen should not
   * send.
   */
  setCustomTopN(text: string): void {
    this.topNCustom.set(text);
    const limit = Math.floor(Number(text));
    this.topNLimit.set(Number.isFinite(limit) && limit > 0 ? limit : null);
  }

  private clearDrills(): void {
    this.drillPath.set([]);
  }

  /**
   * Everything the Canvas holds about ONE dataset, cleared.
   *
   * The saved-analysis list is not cleared with it: those are the reader's own work across every
   * dataset, they are fetched once, and re-fetching them on every file open would spend a
   * database read to be told what this screen is already holding.
   */
  private clearCanvas(): void {
    this.dimensions.set([]);
    this.aggregation.set('COUNT_ROWS');
    this.measureField.set('');
    this.canvasFilters.set(emptyFilterGroup());
    this.crossFilters.set([]);
    this.drillPath.set([]);
    this.topNLimit.set(null);
    this.topNCustom.set('');
    this.topNOther.set(true);
    this.sortBy.set('MEASURE');
    this.sortDirection.set('DESC');
    this.canvasKindName.set('');
    this.analysisResult.set(null);
    this.analysisError.set('');
    this.analysing.set(false);
    this.analysisRunId.set('');
    this.analysisStopping.set(false);
    this.drillDimension.set('');
    this.drillNext.set('');
    this.loadedAnalysis.set(null);
    this.analysisName.set('');
    this.analysisSaveError.set('');
  }

  // ---- saving an analysis ----------------------------------------------------------------

  private openAnalyses(): void {
    if (this.analysesAsked()) return;
    this.analysesAsked.set(true);
    this.loadAnalyses();
  }

  loadAnalyses(): void {
    this.analysesLoading.set(true);
    this.analysesError.set('');
    this.analytics.fetchAllAnalyses().subscribe({
      next: response => {
        this.analysesLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.analysesError.set(response.message || 'Saved analyses could not be read.');
          return;
        }
        this.analyses.set(response.data);
      },
      error: err => {
        this.analysesLoading.set(false);
        this.analysesError.set(err?.error?.message || 'Saved analyses could not be read.');
      },
    });
  }

  /**
   * The configuration as the row stores it: ONE JSON string.
   *
   * The chart kind is NOT in here. AnalyticsAnalysis lifts visualization_type into its own
   * column so a listing can show it without parsing, and its javadoc calls a value stored in two
   * places "one row that can disagree with itself".
   *
   * The filters saved are the COMPOSED ones -- built, clicked and drilled. A saved analysis is
   * the view somebody was looking at, and a drill is part of that view. What does not survive is
   * the trail back up: the filters a drill added are kept as filters, and reopening lands on the
   * narrowed analysis with no crumbs behind it. That is stated on the Save control rather than
   * discovered on reopening.
   */
  readonly analysisConfig = computed(() => JSON.stringify({
    dimensions: this.dimensions(),
    measure: this.analysisRequest().measure,
    filters: this.activeFilters(),
    topN: this.analysisRequest().topN ?? null,
    sort: this.analysisRequest().sort ?? null,
  }));

  readonly canSaveAnalysis = computed(() =>
    !!this.analysisName().trim() && this.hasDataset() && !this.savingAnalysis()
    && (!this.measureNeedsField() || !!this.measureField()));

  saveAnalysis(update = false): void {
    if (!this.canSaveAnalysis()) return;
    this.savingAnalysis.set(true);
    this.analysisSaveError.set('');
    const existing = this.loadedAnalysis();
    this.analytics.saveAnalysis({
      analyticsAnalysisId: update ? existing?.analyticsAnalysisId : undefined,
      analysisName: this.analysisName().trim(),
      connectionAlias: this.connection(),
      datasetPath: this.path(),
      visualizationType: this.canvasKind() ?? 'table',
      analysisConfig: this.analysisConfig(),
    }).subscribe({
      next: response => {
        this.savingAnalysis.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.analysisSaveError.set(response.message || 'The analysis could not be saved.');
          return;
        }
        this.loadedAnalysis.set(response.data);
        this.loadAnalyses();
      },
      error: err => {
        this.savingAnalysis.set(false);
        this.analysisSaveError.set(err?.error?.message || 'The analysis could not be saved.');
      },
    });
  }

  /**
   * Puts a saved analysis back on the canvas, WITHOUT running it.
   *
   * Not running it is the same decision reuseRun makes about a history row: an analysis may be a
   * full scan over a hundred megabytes, and a single click that spends a governor permit on one
   * is a control that punishes browsing the list.
   *
   * A configuration that will not parse is reported rather than partially applied. Half a
   * restored analysis -- the dimensions but not the filters -- is an analysis that looks like the
   * saved one and answers a different question.
   */
  openAnalysis(saved: SavedAnalysis): void {
    let config: {
      dimensions?: string[]; measure?: { aggregation?: Aggregation; field?: string };
      filters?: FilterGroup; topN?: { limit: number; includeOther: boolean } | null;
      sort?: { by: 'MEASURE' | 'DIMENSION'; direction: 'ASC' | 'DESC' } | null;
    };
    try {
      config = JSON.parse(saved.analysisConfig ?? '{}');
    } catch {
      this.analysisOpenError.set(
        `"${saved.analysisName}" could not be reopened: its saved configuration is not readable.`);
      return;
    }
    this.analysisOpenError.set('');
    this.analysisResult.set(null);
    this.analysisError.set('');
    this.drillPath.set([]);
    this.crossFilters.set([]);
    this.dimensions.set((config.dimensions ?? []).slice(0, this.maxDimensions));
    this.aggregation.set(config.measure?.aggregation ?? 'COUNT_ROWS');
    this.measureField.set(config.measure?.field ?? '');
    this.canvasFilters.set(config.filters ?? emptyFilterGroup());
    this.topNLimit.set(config.topN?.limit ?? null);
    this.topNOther.set(config.topN?.includeOther ?? true);
    this.topNCustom.set(config.topN && !TOP_N_CHOICES.includes(config.topN.limit)
      ? String(config.topN.limit) : '');
    this.sortBy.set(config.sort?.by ?? 'MEASURE');
    this.sortDirection.set(config.sort?.direction ?? 'DESC');
    this.canvasKindName.set((saved.visualizationType as CanvasKind) || '');
    this.loadedAnalysis.set(saved);
    this.analysisName.set(saved.analysisName);
    this.drillDimension.set(this.dimensions()[this.dimensions().length - 1] ?? '');
    this.drillNext.set('');
  }

  /**
   * True when the analysis on screen was saved against a DIFFERENT dataset.
   *
   * The same warning the SQL library carries: a saved analysis names its dataset, and running it
   * against the file that happens to be open produces an answer under a name that means something
   * else. It is a warning rather than a block because running the same cut over this month's file
   * is exactly what a saved analysis is for.
   */
  readonly analysisFromElsewhere = computed(() => {
    const saved = this.loadedAnalysis();
    if (!saved) return '';
    if (saved.connectionAlias === this.connection() && saved.datasetPath === this.path()) return '';
    return `"${saved.analysisName}" was saved against ${saved.connectionAlias}/${saved.datasetPath}.`;
  });

  async removeAnalysis(saved: SavedAnalysis): Promise<void> {
    const id = saved.analyticsAnalysisId;
    if (!id) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Delete this analysis?',
      body: `"${saved.analysisName}" will be removed. The dataset it reads is untouched.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteAnalysis(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.analysesError.set(response.message || 'The analysis could not be deleted.');
          return;
        }
        if (this.loadedAnalysis()?.analyticsAnalysisId === id) this.loadedAnalysis.set(null);
        this.loadAnalyses();
      },
      error: err => {
        this.analysesError.set(err?.error?.message || 'The analysis could not be deleted.');
      },
    });
  }

  /** A saved analysis's timestamp in the reader's locale, or the raw text if it will not parse. */
  analysisWhen(saved: SavedAnalysis): string {
    const raw = saved.dateUpdated || saved.dateCreated;
    if (!raw) return '';
    const at = new Date(raw);
    return isNaN(at.getTime()) ? raw : at.toLocaleString();
  }
}
