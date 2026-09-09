import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

export interface DatasetColumn {
  name: string;
  /** DuckDB's own type name, shown as-is: it is what a user would write in SQL later. */
  type: string;
}

export interface DatasetSchema {
  bucket: string;
  path: string;
  format: string;
  multiFile: boolean;
  columns: DatasetColumn[];
}

export interface DatasetPreview {
  columns: string[];
  /**
   * Rows as arrays, not objects: it halves the payload on a wide file by not repeating the
   * column names, and it keeps the column ORDER the file had, which a JSON object would leave
   * to key ordering. A null cell is a real null, not an empty string.
   */
  rows: (string | null)[][];
  page: number;
  pageSize: number;
  /**
   * What the pager has to page through: the whole dataset, or what the narrowing left of it.
   *
   * Which of the two depends entirely on {@link filtered}, and reading one without the other is
   * the mistake DatasetPreviewDto's javadoc is written to prevent.
   */
  totalRows: number;
  multiFile: boolean;
  /**
   * Whether a filter or a search removed rows before `totalRows` was counted.
   *
   * A SORT does not set it -- ordering moves rows without removing any -- so this is exactly the
   * question "is that number the size of the file". It is also the flag that has to be echoed
   * back as `knownTotalFiltered` on the next request; see {@link PreviewShape}.
   */
  filtered: boolean;
}

/**
 * The order and the narrowing a grid is asking the server for, plus where its carried total
 * came from.
 *
 * All of it is server-side and none of it is approximated in the browser, because a page is a
 * window onto a file that may hold millions of rows: sorting the window sorts the wrong rows and
 * looks right doing it.
 *
 * <b>knownTotalFiltered is the one field here that prevents a wrong number rather than a slow
 * one.</b> The rest are the reader's request; this one is the provenance of the `knownTotal`
 * travelling beside it. The server reuses a carried total whenever the new request does not
 * narrow -- which is exactly the moment a filter is being CLEARED, while the client is still
 * holding the total counted under that filter. Reused there, the pager would offer two pages of
 * a dataset with four hundred, and the file would look permanently smaller for having been
 * filtered once. A server cannot tell one number from another by looking at it, so the caller
 * says where it came from: echo back the `filtered` flag of the response that produced the total
 * being carried, and nothing else.
 */
export interface PreviewShape {
  /** The column to order by, as the dataset spells it. Resolved against the schema server-side. */
  sort?: string;
  /** Only consulted when a sort column is named; the server defaults to ASC. */
  direction?: 'ASC' | 'DESC';
  /** Free text, matched case-insensitively against every text column over the whole dataset. */
  search?: string;
  /**
   * ANDed by the server. The Canvas's own clause vocabulary, compiled by the same compiler.
   *
   * A `FilterNode`, not a `FilterClause`: an element may itself be a group, which is what lets
   * the Canvas's builder -- where an OR is a real thing a reader can construct -- narrow this tab
   * without being flattened. Spreading `(a OR b)` into an ANDed list would turn a filter that
   * admitted either into one that demands both, and it would do it silently.
   * AnalyticsRestApi.filtersOf already deserialises a group here; only this type was narrower.
   */
  filters?: FilterNode[];
  /** True when the `knownTotal` being sent was counted under a filter or a search. */
  knownTotalFiltered?: boolean;
}

/**
 * One column as SUMMARIZE described it, plus the flags ColumnProfileDto derived from it.
 *
 * Mirrors process.analytics.dto.ColumnProfileDto field for field, and that class's javadoc is
 * the source of truth for what every figure here is worth. Read it before rendering any of
 * them: which numbers are exact is not visible from the types.
 *
 * FOUR OF THESE FIGURES ARE NOT EXACT, and this screen is not allowed to imply otherwise.
 *
 *   approxDistinct   a HyperLogLog sketch, measured 3.7% low on a million distinct values.
 *                    Shown with a "≈" and the word "estimated" beside it, never as a bare
 *                    integer, and never as an answer to "are these unique?".
 *   approxQ25/50/75  approx_quantile, not the quantile. On the measured column the exact first
 *                    quartile was 21.0 and this reported 18.375. The spread drawn from them is
 *                    labelled "quartiles estimated" and its blocks hold ABOUT a quarter each.
 *   approxNullRows   totalRows scaled by a percentage rounded to two decimal places. Rendered
 *                    with "about" in front of it, always.
 *   nullPercentage   the rounding cuts both ways on a large file: one null row in ten million
 *                    rounds to 0.00, and one non-null row in ten million rounds to 100.00.
 *
 * min and max ARE exact, and are the third thing on this screen that surprises a reader -- on a
 * text column they are lexicographic, so "9" is larger than "100". The Profile tab labels them
 * "first (A–Z)" and "last (A–Z)" there rather than "min" and "max".
 *
 * Every statistic is a STRING because one result column has to carry the minimum of a BIGINT, of
 * a DATE and of a VARCHAR at once, and only text holds all three. Parsing them here would work on
 * the amount columns and turn every date into NaN, so the parse happens per column in the
 * component, where a failure to parse is itself an answer.
 */
export interface ColumnProfile {
  name: string;
  /** DuckDB's own type name, the same spelling DatasetColumn carries. */
  type: string;
  /** Exact. Lexicographic on a text column -- see the note above. */
  min: string | null;
  max: string | null;
  /** Exact, and null on every non-numeric column: there is no mean of a set of words. */
  avg: string | null;
  std: string | null;
  /** Estimated. Null on VARCHAR and BOOLEAN, but PRESENT on DATE, as date text. */
  approxQ25: string | null;
  approxQ50: string | null;
  approxQ75: string | null;
  /** Estimated. Distinct NON-NULL values. */
  approxDistinct: number;
  /** Null only when the dataset has no rows at all, where there is no percentage to give. */
  nullPercentage: number | null;
  /** 100 - nullPercentage, carrying the same rounding and the same null case. */
  completeness: number | null;
  /** Approximate: reconstructed from the rounded percentage, never counted. */
  approxNullRows: number | null;

  // ---- flags the server derived from the figures above, at no extra query ----

  /** Both signals agree: 100.00% null AND no distinct values. */
  allNull: boolean;
  /** Every NON-NULL value is the same one, which is the half of it to say on screen. */
  constant: boolean;
  /** A suggestion, never a finding: it compares an estimate against the true row count. */
  keyLike: boolean;
  /** 'NUMBER', 'DATE' or null -- decided from the two extreme values only, so fallible both ways. */
  typeSurprise: 'NUMBER' | 'DATE' | null;
}

/**
 * Every column of a dataset, described without any of its rows.
 *
 * One request, two tabs. Profile and Quality are the same scan read two ways, because a file open
 * already costs three sessions against a governor that admits four at a time, and a second
 * profiling query per tab would have made that five for the same numbers twice.
 */
export interface DatasetProfile {
  bucket: string;
  path: string;
  format: string;
  multiFile: boolean;
  /** Exact, and free: SUMMARIZE carries it on every row, so no count(*) was run for it. */
  totalRows: number;
  columns: ColumnProfile[];
}

/**
 * A dataset to run a query against, and optionally a second one to join it to.
 *
 * connection2/path2 are absent for the overwhelming majority of queries and are absent as a PAIR:
 * the server resolves the second dataset separately, through the same tenant check as the first,
 * and treats half a second dataset as a mistake worth naming rather than a one-dataset query.
 */
export interface QueryRequest {
  connection: string;
  path: string;
  sql: string;
  connection2?: string;
  path2?: string;
}

/**
 * The answer to a query somebody wrote.
 *
 * Mirrors process.analytics.dto.QueryResultDto. Rows are arrays of text for the same two reasons
 * a preview page is -- the column order the query asked for survives, and a DECIMAL that arrives
 * as a JavaScript double has lost precision before anyone looks at it.
 *
 * TRUNCATED IS THE FIELD THIS TYPE EXISTS FOR, and it is the one a screen can get wrong quietly.
 * A query with no LIMIT of its own is wrapped in the server's row ceiling before it runs, so a
 * result can stop at the ceiling rather than at the end of the data. There is no way from here to
 * tell "exactly this many rows" from "this many, and more behind them" -- the only thing that
 * could is running the query again without the ceiling, which is what the ceiling is for. So
 * "there may be more" is the whole of what this flag can claim, and it has to be claimed loudly:
 * a reader handed ten thousand rows out of forty thousand and not told has a WRONG answer, not a
 * short one, and will go and act on it.
 */
export interface QueryResult {
  columns: string[];
  /** A null cell is a real null, not an empty string -- the same distinction a preview draws. */
  rows: (string | null)[][];
  /** Rows in THIS result, which is the whole answer only when truncated is false. */
  rowCount: number;
  truncated: boolean;
}

/** A result handed back as a file, base64 so it survives the ResponseDto envelope unchanged. */
export interface ExportFile {
  filename: string;
  contentType: string;
  content: string;
  bytes: number;
  rowCount: number;
  truncated: boolean;
  /** Present only when truncated. The server's own sentence about what is missing. */
  notice?: string;
}

/** What a write-back put into the connection's own bucket. */
export interface WriteBackResult {
  path: string;
  rowCount: number;
  truncated: boolean;
}

/**
 * A query somebody named and kept.
 *
 * Mirrors process.model.pojo.AnalyticsQuery. It names where it reads by connection ALIAS and
 * path, never a bucket, so a connection later repointed carries its saved queries with it. An
 * analyticsQueryId present on a save makes it an update of that row; absent, a new one.
 */
export interface SavedQuery {
  analyticsQueryId?: number;
  queryName: string;
  connectionAlias: string;
  datasetPath: string;
  queryText: string;
  dateCreated?: string;
  dateUpdated?: string;
  createdByName?: string;
}

/**
 * One query, as it actually ran.
 *
 * Mirrors process.model.pojo.AnalyticsQueryRun, which is the module's answer to "who read what,
 * and when". Written by the server from what it observed -- there is deliberately no endpoint
 * that accepts one -- so nothing here creates or edits a run.
 *
 * REFUSED is not a kind of failure and should not be drawn as one. FAILED reached the engine and
 * broke there; REFUSED never reached it, because the statement gate or the governor turned it
 * away, and errorMessage then holds the sentence the person was actually shown.
 */
export interface QueryRun {
  analyticsQueryRunId: number;
  /** Null for an ad-hoc query, and null again once the saved query it came from is deleted. */
  analyticsQueryId?: number | null;
  connectionAlias: string;
  datasetPath: string;
  /** As submitted, before the server's row ceiling was wrapped round it. */
  queryText: string;
  /**
   * What became of the run. Seven states, where the specification names six.
   *
   * REFUSED is the extra one and it earns its place: a statement the gate never ran is a distinct
   * outcome from one the engine ran and could not finish, and collapsing them would lose the
   * security signal that somebody asked for something they were not allowed to ask for.
   * COMPLETED is stored as SUCCESS because that is what the existing rows already say, and
   * rewriting stored evidence to match a spelling is the one edit an audit table must not take.
   */
  runStatus: 'SUCCESS' | 'FAILED' | 'REFUSED' | 'CANCELLED' | 'TIMED_OUT' | 'QUEUED' | 'RUNNING';
  /** Null when there was no result at all; zero is a real answer that a refusal never gave. */
  rowCount?: number | null;
  /** Wall clock INSIDE the engine, so not the round trip. Null on a refusal. */
  durationMs?: number | null;
  errorMessage?: string | null;
  dateCreated: string;
}

// ---- the analysis model, which is document 07 ----------------------------------------------

/**
 * The eight aggregations, and there are exactly eight.
 *
 * Not an open string. Document 07 names these and the server compiles each one to a specific
 * SQL function behind the statement gate, so a ninth invented here would be a request the engine
 * refuses -- and it would be refused at the far end of a round trip rather than at the picker.
 *
 * COUNT_ROWS is the one that ignores `field`, because counting rows is the only thing here that
 * is not a question about a column. Every other one requires it, and a measure with no field is
 * an incomplete analysis rather than a defaulted one: guessing a column would put a number on
 * screen that nobody asked for and that reads exactly like one they did.
 */
export type Aggregation =
  | 'COUNT_ROWS' | 'COUNT_NON_NULL' | 'DISTINCT_COUNT' | 'SUM'
  | 'AVERAGE' | 'MINIMUM' | 'MAXIMUM' | 'MEDIAN';

/** The fourteen operators document 07 lists, in the order it lists them. */
export type FilterOperator =
  | 'EQ' | 'NEQ' | 'CONTAINS' | 'STARTS_WITH' | 'GT' | 'LT' | 'BETWEEN'
  | 'IN' | 'NOT_IN' | 'IS_NULL' | 'IS_NOT_NULL'
  | 'DATE_RANGE' | 'RELATIVE_DATE' | 'NUMERIC_RANGE';

/**
 * One predicate over one column.
 *
 * The operand fields are deliberately separate from each other rather than one `unknown`: an
 * operator decides how many operands it takes, and keeping "the one value" apart from "the list"
 * means an operator change cannot silently reinterpret what was typed. Switching EQ to BETWEEN
 * does not turn a single value into a lower bound behind the reader's back -- the second bound
 * is simply missing, and a clause with a missing operand is not sent.
 */
export interface FilterClause {
  field: string;
  operator: FilterOperator;
  /** The single operand. Unused by IS_NULL, IS_NOT_NULL and by every two-bound operator. */
  value?: string | null;
  /** IN, NOT_IN, and the two-bound operators as exactly [low, high]. See clauseToWire. */
  values?: string[];
}

/**
 * AND or OR over a mixed list of clauses and further groups -- 07's "nested AND/OR groups".
 *
 * The nesting is what makes this a builder rather than a filter bar: `a AND (b OR c)` cannot be
 * written as a flat list of predicates, and every filter surface in this codebase up to now has
 * been a flat implicit AND over a fixed field vocabulary.
 */
export interface FilterGroup {
  op: 'AND' | 'OR';
  clauses: FilterNode[];
}

export type FilterNode = FilterClause | FilterGroup;

/**
 * Which of the two a node is.
 *
 * Tests `clauses`, not `op`: a group has both an op and a list, a clause has neither, and the
 * list is the half that cannot be confused with anything on a clause.
 */
export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return Array.isArray((node as FilterGroup).clauses);
}

/**
 * How many operands an operator takes. The one table the builder and the wire format agree on.
 *
 * 'many' is IN and NOT_IN, where the count is whatever the reader typed. 2 is the three
 * two-bound operators, which are three different operators rather than one BETWEEN because the
 * server needs to know whether to read the bounds as text, as dates or as numbers -- a fact the
 * operand values cannot carry on their own now that everything crosses the wire as a string.
 */
export const OPERAND_COUNT: Record<FilterOperator, 0 | 1 | 2 | 'many'> = {
  EQ: 1, NEQ: 1, CONTAINS: 1, STARTS_WITH: 1, GT: 1, LT: 1,
  BETWEEN: 2, NUMERIC_RANGE: 2, DATE_RANGE: 2,
  IN: 'many', NOT_IN: 'many',
  IS_NULL: 0, IS_NOT_NULL: 0,
  RELATIVE_DATE: 1,
};

/**
 * A clause as it goes on the wire, and THE ONE PLACE THIS CLIENT GUESSED PAST THE CONTRACT.
 *
 * The contract shows a single-operand clause and nothing else: `{field, operator, value}`. It
 * does not say how IN carries a list or how BETWEEN carries two bounds, and the endpoint did not
 * exist to read when this was written. The rule chosen here is the simplest one that covers all
 * fourteen without a third field: ONE OPERAND TRAVELS AS `value`, MANY TRAVEL AS `values`, and a
 * two-bound operator is exactly `values: [low, high]` in that order.
 *
 * It is a guess and it is isolated on purpose -- this function and its inverse are the only code
 * that knows the shape, so a shipped DTO that spells it differently is one edit here rather than
 * a search through the Canvas.
 *
 * Absent operands are dropped rather than sent empty, for the reason the join half is dropped in
 * query(): an empty string is present, and a server reading presence as intent would see a
 * BETWEEN with a blank bound as a bound of blank.
 */
export function clauseToWire(clause: FilterClause): Record<string, unknown> {
  const wire: Record<string, unknown> = { field: clause.field, operator: clause.operator };
  const operands = OPERAND_COUNT[clause.operator];
  if (operands === 1 && clause.value) wire['value'] = clause.value;
  if (operands === 2 || operands === 'many') {
    const values = (clause.values ?? []).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length) wire['values'] = values;
  }
  return wire;
}

/** A group as it goes on the wire, recursively. Empty groups are dropped by the caller. */
export function filtersToWire(group: FilterGroup): Record<string, unknown> {
  return {
    op: group.op,
    clauses: group.clauses.map(node =>
      isFilterGroup(node) ? filtersToWire(node) : clauseToWire(node)),
  };
}

export interface Measure {
  /** Absent only for COUNT_ROWS, which is a question about rows rather than about a column. */
  field?: string;
  aggregation: Aggregation;
}

/**
 * Keep the largest `limit` categories and roll the rest into one bucket.
 *
 * includeOther is not a cosmetic switch. With it off, the tail is GONE from the result and the
 * chart drawn from it is a chart of part of the data wearing the shape of all of it; with it on
 * the remainder is one visible row that can be pointed at. The Canvas defaults it on and says
 * out loud when a roll-up happened.
 */
export interface TopN { limit: number; includeOther: boolean; }

export interface AnalysisSort { by: 'MEASURE' | 'DIMENSION'; direction: 'ASC' | 'DESC'; }

/**
 * A whole analysis: where to read, how to cut it, and what to measure.
 *
 * Named by connection and path like every other request on this API -- the bucket comes from the
 * connection record server-side, so this shape cannot express "group somebody else's data".
 *
 * dimensions may be EMPTY, and that is a real analysis rather than a half-built one: no grouping
 * is one number over the filtered rows, which is what a KPI is.
 */
export interface AnalysisRequest {
  connection: string;
  path: string;
  /** One, two or three, in the order they group. Empty means no grouping at all. */
  dimensions: string[];
  measure: Measure;
  filters?: FilterGroup;
  topN?: TopN;
  sort?: AnalysisSort;
  /** Minted by the client, for the same reason query() mints one: so a run can be stopped. */
  queryId?: string;
  /**
   * The drill steps already taken, oldest first, echoed back exactly as the server sent them.
   *
   * THE DRILL STATE LIVES HERE AND NOWHERE ELSE ON THIS SIDE. The endpoints are stateless, so the
   * trail has to travel with every request -- and the server is the side that applied the filters
   * and replaced the dimensions, so it is the side entitled to say what the trail is. This client
   * carries the list from one response into the next request without interpreting it. Anything
   * else is the client recomputing analytical state it never computed, and the first divergence
   * shows up as a chart that disagrees with the breadcrumb above it.
   */
  drillPath?: Drill[];
  /** The step /analyze/drill is being asked to take. Read by that endpoint and no other. */
  into?: Drill;
  /** How many steps /analyze/drill-up should undo. Read by that endpoint and no other. */
  steps?: number;
}

/**
 * One narrowing: the value that was clicked, and what to look at inside it.
 *
 * The same shape describes a step being taken and a step already taken, because they are the same
 * thing at two moments -- which is why drillPath and `into` are the same type.
 */
export interface Drill {
  dimension: string;
  /**
   * The clicked value, or NULL for the group that has no value in it.
   *
   * Null is a real operand here and not an absent one: the server drills a null group as IS NULL
   * rather than as an equality, because "= NULL" is never true and would hand back an empty
   * analysis for a group the reader can see has rows in it.
   */
  value: string | null;
  /** Absent means "drop the drilled dimension without replacing it". */
  nextDimension?: string;
  /** True when the clicked row was the Top-N roll-up. The server refuses to drill into one. */
  otherBucket?: boolean;
}

/**
 * One column of an analysis result, WITH ITS TYPE -- which is the point.
 *
 * The SQL console's result carries bare column names and every value as text, and that is why
 * `sum(amount)` reaches a reader as "7.466125E7" and a DATE as a midnight that is not in the
 * data. A type on the column is what lets the Canvas render a number as a number and a date as a
 * date, and it is what 09 means by "typed column metadata".
 */
export interface AnalysisColumn {
  name: string;
  /** The engine's own type name, e.g. VARCHAR, DOUBLE, DATE. */
  type: string;
  role: 'DIMENSION' | 'MEASURE';
}

/**
 * One step of the drill trail, as the SERVER counted it.
 *
 * Rendered, never reconstructed. The client holds its own mirror of the drill stack because it
 * has to compose the next request, but the trail on screen is the server's answer -- if the two
 * ever disagree, the screen shows the disagreement instead of hiding it behind a local guess.
 */
export interface AnalysisCrumb { label: string; field?: string; value?: string; }

/**
 * The tail a Top-N rolled up: what the bucket is called, and which values went into it.
 *
 * `values` may be a SAMPLE. On a genuinely high-cardinality dimension the server caps the list and
 * says so with valuesTruncated, and valueCount is the exact number in the bucket either way -- so
 * a reader is never shown a partial list as though it were the whole roll-up.
 */
export interface OtherBucket {
  label: string;
  values: string[];
  /** Distinct values in the bucket, whether or not they are all listed. */
  valueCount: number;
  /** True when `values` is a sample of valueCount rather than all of it. */
  valuesTruncated: boolean;
}

/** One row of the pivot grid: the row dimension's value, and one cell per column value. */
export interface PivotRow {
  /** Null when the group is the one with no value in it. */
  key: string | null;
  /** Aligned to columnValues by position. A null cell has NO ROWS, which is not a zero. */
  cells: (string | null)[];
}

/**
 * The two-dimension result already shaped as a grid, composed server-side.
 *
 * Present when the analysis has exactly two dimensions and absent otherwise, so its PRESENCE is
 * the answer to "can this be drawn as a grid". Rebuilding it here from the flat rows would be a
 * second implementation of the same rearrangement, and the two could disagree about the order of
 * the axes -- which transposes somebody's chart without saying so.
 */
export interface PivotGrid {
  rowDimension: string;
  columnDimension: string;
  columnValues: string[];
  /** Null when columnsTruncated: a grid too wide to read is not drawn at all. */
  rows?: PivotRow[] | null;
  /** True when the column dimension had more values than a grid can carry. */
  columnsTruncated: boolean;
}

export interface AnalysisResult {
  columns: AnalysisColumn[];
  /** Strings on the wire, rendered faithfully on screen. See plainDecimal/dateOnly in analytics.ts. */
  rows: (string | null)[][];
  rowCount: number;
  /** True when the result stopped at the server's row ceiling. A partial answer, said loudly. */
  truncated: boolean;
  /** The dimensions this analysis grouped by AFTER drilling, which is what the pickers show. */
  dimensions?: string[];
  /** The measure column's name, so nothing here has to work out which column it is. */
  measure?: string;
  other?: OtherBucket | null;
  crumbs?: AnalysisCrumb[];
  /** The trail as data, to be sent back unchanged on the next request. */
  drillPath?: Drill[];
  pivot?: PivotGrid | null;
  /**
   * What each relative-date window actually resolved to, as "2024-03-01 to 2024-03-07".
   *
   * The answer to the question a token could not settle on its own. "Last 7 days" is not
   * reproducible from the request alone -- it depends on when it ran -- so two charts taken an
   * hour either side of midnight legitimately differ, and this is what lets a reader see why.
   */
  resolvedWindows?: Record<string, string>;
  queryId?: string;
  status?: string;
  durationMs?: number;
}

/**
 * An analysis somebody named and kept.
 *
 * Mirrors process.model.pojo.AnalyticsAnalysis. Two things about that row govern what is sent
 * here. The configuration is ONE JSON column, so dimensions, measure, filters, sort and top-N
 * are serialised into analysisConfig rather than spread across fields. And visualizationType is
 * lifted OUT of that JSON into its own column, so it must not also appear inside it -- the row's
 * own javadoc calls two places to say the same thing "one row that can disagree with itself".
 */
export interface SavedAnalysis {
  analyticsAnalysisId?: number;
  analysisName: string;
  connectionAlias: string;
  datasetPath: string;
  visualizationType?: string;
  /** JSON: {dimensions, measure, filters, topN, sort}. Never the chart kind. */
  analysisConfig: string;
  dateCreated?: string;
  dateUpdated?: string;
  createdByName?: string;
}

/**
 * A page of saved results: a name, a sentence saying what it is for, and the widgets on it.
 *
 * Mirrors process.model.pojo.AnalyticsDashboard. `widgets` is @Transient on that row and is
 * filled in only by fetchDashboardById -- the listing returns pages without their contents,
 * because a list of twelve boards does not need every tile on every one of them.
 */
export interface Dashboard {
  analyticsDashboardId?: number;
  dashboardName: string;
  dashboardDescription?: string | null;
  dateCreated?: string;
  dateUpdated?: string;
  createdByName?: string;
  /** Present on fetchDashboardById, in display order. Absent on the listing. */
  widgets?: DashboardWidget[];
}

/**
 * What a widget draws, and the whole of what this client will store in visualization_type.
 *
 * Four of the Canvas's five kinds. Pivot is deliberately not among them: the server composes a
 * pivot grid only for a two-dimension analysis, so it is a property of the RESULT rather than a
 * choice a widget can make in advance -- a board whose tile said "pivot" over an analysis that
 * later grew a third dimension would be a saved choice the data no longer supports. A tile that
 * needs a grid shows the table.
 *
 * The column is 32 characters and this client writes only these words into it, but the type is
 * read as a plain string coming back: the row may have been written by something else, and a
 * value this screen does not recognise is drawn as a table rather than as an error.
 */
export type WidgetVisualization = 'table' | 'ranked' | 'bar' | 'donut';

/**
 * One tile: a REFERENCE to a saved analysis or a saved query, and how to draw it.
 *
 * Mirrors process.model.pojo.AnalyticsDashboardWidget. Two things about that row govern this
 * shape and both are load-bearing.
 *
 * EXACTLY ONE of analyticsAnalysisId and analyticsQueryId is set -- a check constraint says so,
 * the service refuses both and neither with a sentence, and there is deliberately no third field
 * naming which kind it is. Which one is set IS the kind.
 *
 * AND THERE IS NOWHERE HERE TO PUT A RESULT. That is the point of the type rather than an
 * omission from it: a widget holds the question, never the answer. A stored answer would go
 * stale the moment the file behind it changed and nothing on screen could tell, which is the one
 * thing this module refuses to do.
 */
export interface DashboardWidget {
  analyticsDashboardWidgetId?: number;
  analyticsDashboardId: number;
  widgetTitle: string;
  /** Set for an analysis-backed widget; null for a query-backed one. Never both. */
  analyticsAnalysisId?: number | null;
  analyticsQueryId?: number | null;
  /** Null means "no chart kind pinned here": a table, or the analysis's own choice. */
  visualizationType?: string | null;
  /**
   * The rendering half as JSON, or null.
   *
   * Nothing this client writes uses it yet, and it is sent as null rather than as '{}' when
   * empty -- the row's own javadoc calls an empty object stored to avoid a null "a null with
   * extra steps". It is carried on the type because a widget round-trips through here on every
   * edit, and dropping a column the server stored would silently clear whatever put it there.
   */
  widgetConfig?: string | null;
  /** Where it sits, coarsely. The server defaults an absent one to 0. */
  displayOrder?: number;
  dateCreated?: string;
  dateUpdated?: string;
}

/**
 * A dataset somebody named and kept: one connection alias, and one path inside it.
 *
 * Mirrors process.model.pojo.AnalyticsDataset. THE BUCKET IS NOT ON IT and cannot be put on it
 * -- the alias is looked up at the moment the dataset is opened, so a connection later repointed
 * carries its registered datasets with it rather than leaving them reading the old bucket.
 *
 * datasetFormat is READ-ONLY here. The server takes it from the resolver, not from the wire,
 * because a label a caller could set to anything is a listing that lies; registerDataset() below
 * does not send it even when it is present on the object.
 */
export interface RegisteredDataset {
  analyticsDatasetId?: number;
  datasetName: string;
  connectionAlias: string;
  datasetPath: string;
  /** CSV, TSV, JSON or PARQUET, as the resolver named it. Never sent. */
  datasetFormat?: string;
  dateCreated?: string;
  createdByName?: string;
}

/**
 * The three analysis endpoints share one body, so they share one builder.
 *
 * Every optional part is omitted rather than sent null. `topN: null` and no topN at all are the
 * same intent to a reader and two different values to a parser, and the one thing this module
 * cannot afford is the server inferring something from a shape the client did not mean.
 */
function analysisBody(request: AnalysisRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    connection: request.connection,
    path: request.path,
    dimensions: request.dimensions,
    measure: request.measure.aggregation === 'COUNT_ROWS'
      // COUNT_ROWS ignores field, so sending one would put a column name in the record of what
      // was asked that had no part in the answer.
      ? { aggregation: 'COUNT_ROWS' }
      : { aggregation: request.measure.aggregation, field: request.measure.field },
  };
  if (request.filters && request.filters.clauses.length) {
    body['filters'] = filtersToWire(request.filters);
  }
  if (request.topN) body['topN'] = { ...request.topN };
  if (request.sort) body['sort'] = { ...request.sort };
  if (request.queryId) body['queryId'] = request.queryId;
  // Echoed, not rebuilt. Sent even on a plain /analyze, because a re-run of a drilled analysis
  // is still the drilled analysis -- dropping the trail there would climb back out of it while
  // the breadcrumb bar went on saying otherwise.
  if (request.drillPath && request.drillPath.length) body['drillPath'] = request.drillPath;
  return body;
}

/**
 * Analytics Studio's API: reading a dataset, querying one, and the library around both.
 *
 * A dataset is named by CONNECTION and path, never by a URL or a bucket -- the bucket comes from
 * the connection record on the server, so this client cannot ask for one. That is deliberate and
 * is the reason there is no bucket parameter to pass here.
 *
 * TWO CONTROLLERS, ONE CLIENT. The server splits /analytics.json from /analyticsLibrary.json and
 * says why in AnalyticsLibraryRestApi's header: only one of them opens a DuckDB session, takes a
 * governor permit or accepts SQL for execution, and keeping that door single is the module's
 * central security property. That is a fact about the server's own structure. From here both are
 * HTTP against the same screen with the same envelope, and a second injectable would add an
 * injection every consumer and every test of this screen has to know about to express a boundary
 * this side does not enforce.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/analytics.json`;
  private readonly library = `${API_BASE}/analyticsLibrary.json`;
  private readonly exports = `${API_BASE}/analyticsExport.json`;
  private readonly workspace = `${API_BASE}/analyticsWorkspace.json`;
  private readonly datasets = `${API_BASE}/analyticsDataset.json`;

  schema(connection: string, path: string): Observable<ApiResponse<DatasetSchema>> {
    return this.http.get<ApiResponse<DatasetSchema>>(`${this.base}/schema`, {
      params: { connection, path },
    });
  }

  /**
   * A page of rows, and the size of the dataset they came out of.
   *
   * knownTotal exists because preview is TWO queries -- a COUNT(*) and the page itself -- and
   * each one opens its own locked-down session and takes its own permit from a governor that
   * admits four at a time across the whole JVM. A page turn already holds the total from the
   * page before it, so re-counting spends half that ceiling to be told what the caller just
   * said. Passing it lets the server skip the COUNT and echo it back instead.
   *
   * It is sent ONLY when the total came from a previous response. On a first load nothing has
   * counted the dataset yet, and a number invented here would come straight back as fact.
   *
   * `shape` carries the grid's sort, search and filters -- see {@link PreviewShape}, and note in
   * particular that `knownTotalFiltered` travels with the total rather than being inferred from
   * the shape, because the two describe different requests: the shape is what is being asked for
   * now, the flag is what the carried number was counted under.
   */
  preview(connection: string, path: string, page = 0, knownTotal?: number, pageSize?: number,
          shape?: PreviewShape): Observable<ApiResponse<DatasetPreview>> {
    const params: Record<string, string> = { connection, path, page: String(page) };
    // Absent means "the server's own default". Sending a size it would only clamp is noise.
    if (pageSize) params['pageSize'] = String(pageSize);
    // Positive only, matching the server's own condition: an empty dataset legitimately totals
    // zero, and asserting that would turn "I have not counted" into "there is nothing here".
    if (knownTotal && knownTotal > 0) params['knownTotal'] = String(knownTotal);

    const sort = shape?.sort?.trim();
    if (sort) {
      params['sort'] = sort;
      // Only alongside a column. A direction on its own orders nothing and would read on the
      // wire as a sort that was asked for and quietly dropped.
      params['direction'] = shape?.direction === 'DESC' ? 'DESC' : 'ASC';
    }
    const search = shape?.search?.trim();
    if (search) params['search'] = search;
    // Clauses go through clauseToWire, the one place that knows how an operand travels. A second
    // serialiser here is the second guess at a shape the contract does not spell out.
    const filters = shape?.filters ?? [];
    if (filters.length) {
      params['filters'] = JSON.stringify(filters.map(node =>
        isFilterGroup(node) ? filtersToWire(node) : clauseToWire(node)));
    }
    // Unconditional rather than tied to knownTotal being present. The server ignores it without
    // one, and the failure this guards against is the flag being LEFT OFF a request that carries
    // a filtered total -- so there is no branch here that can omit it.
    if (shape?.knownTotalFiltered) params['knownTotalFiltered'] = 'true';

    return this.http.get<ApiResponse<DatasetPreview>>(`${this.base}/preview`, { params });
  }

  /**
   * Per-column statistics for the whole dataset.
   *
   * Not called on selection, unlike schema(). It is a full scan rather than a footer read, and
   * opening a file already spends three of the governor's four permits; this one is asked for
   * when a reader opens the tab that needs it and not before.
   */
  profile(connection: string, path: string): Observable<ApiResponse<DatasetProfile>> {
    return this.http.get<ApiResponse<DatasetProfile>>(`${this.base}/profile`, {
      params: { connection, path },
    });
  }

  /**
   * Runs SQL a person wrote, over one dataset or two.
   *
   * POST with a body rather than GET with parameters, and not for the usual REST reasons: SQL in
   * a query string is SQL in the access log, in the browser history and in every proxy between
   * here and there, and it is the one field on this API somebody composes themselves.
   *
   * The SQL names "dataset" and "dataset2" and nothing else. It never names a bucket, a URL or a
   * scan function, because the alias is still the only thing the API accepts -- which is what
   * keeps "read a different bucket with these credentials" a request this client cannot make even
   * now that it carries a statement.
   *
   * The empty halves of a second dataset are dropped rather than sent blank: the server reads
   * either half being present as "there is a join here", and an empty string is present.
   */
  query(request: QueryRequest & { queryId?: string }): Observable<ApiResponse<QueryResult>> {
    const body: Record<string, string> = {
      connection: request.connection, path: request.path, sql: request.sql,
    };
    // The CLIENT names the run, forced by this endpoint being synchronous: a server-minted id
    // would arrive with the rows, which is after there is anything left to stop. The server keys
    // its registry on (tenant, user, id), so a chosen id is scoped to the caller and can neither
    // collide with another workspace's run nor be squatted by one.
    if (request.queryId) body['queryId'] = request.queryId;
    if (request.connection2 && request.path2) {
      body['connection2'] = request.connection2;
      body['path2'] = request.path2;
    }
    return this.http.post<ApiResponse<QueryResult>>(`${this.base}/query`, body);
  }

  // ---- the analysis: document 07's canvas ------------------------------------------------

  /**
   * Runs a STRUCTURED analysis -- dimensions, a measure, filters -- rather than a statement.
   *
   * The difference from query() is the whole security argument of document 07 and it is worth
   * stating where the call is made: nothing on this path carries SQL. The client sends field
   * names and operator names out of a closed vocabulary, and the server composes the statement
   * itself behind the same gate and the same governor. A filter value is an operand, never a
   * fragment, so there is no concatenation for it to escape from.
   *
   * The body is built here rather than sent as the caller's object because an incomplete filter
   * must not travel: a group with no clauses is dropped, and clauseToWire drops empty operands.
   * An empty group sent as `{op:'AND',clauses:[]}` is a filter that means nothing, and a server
   * reading it as one is a server deciding what "no clauses" implies.
   */
  analyze(request: AnalysisRequest): Observable<ApiResponse<AnalysisResult>> {
    return this.http.post<ApiResponse<AnalysisResult>>(
      `${this.base}/analyze`, analysisBody(request));
  }

  /**
   * Narrows the analysis by one step: the clicked value becomes a filter, and the next dimension
   * replaces the drilled one.
   *
   * The SERVER composes that, not this client, which is why the whole analysis goes with the
   * step rather than a pre-composed one. Two implementations of the same composition -- one to
   * build the request and one to run it -- is exactly where a drill trail starts disagreeing
   * with the rows under it.
   */
  drill(request: AnalysisRequest, into: Drill): Observable<ApiResponse<AnalysisResult>> {
    const body = analysisBody(request);
    // value is sent even when null -- see Drill.value. Only nextDimension is dropped when absent,
    // because absent there means "drop the dimension" and '' would be a dimension named ''.
    const step: Record<string, unknown> = { dimension: into.dimension, value: into.value ?? null };
    if (into.nextDimension) step['nextDimension'] = into.nextDimension;
    if (into.otherBucket) step['otherBucket'] = true;
    body['into'] = step;
    return this.http.post<ApiResponse<AnalysisResult>>(`${this.base}/analyze/drill`, body);
  }

  /** Removes that many trailing drill filters, restoring the dimensions they replaced. */
  drillUp(request: AnalysisRequest, steps: number): Observable<ApiResponse<AnalysisResult>> {
    const body = analysisBody(request);
    body['steps'] = steps;
    return this.http.post<ApiResponse<AnalysisResult>>(`${this.base}/analyze/drill-up`, body);
  }

  // ---- the workspace: analyses somebody named and kept ------------------------------------

  fetchAllAnalyses(): Observable<ApiResponse<SavedAnalysis[]>> {
    return this.http.get<ApiResponse<SavedAnalysis[]>>(`${this.workspace}/fetchAllAnalyses`);
  }

  /**
   * Stores the analysis under a name, or updates the one the id names.
   *
   * Only the five fields a person decides are sent, for the reason saveQuery sends four: the
   * service copies exactly those onto a row whose tenant and audit columns come from the signed-in
   * context, and a tenantId on the wire here would be this client claiming an ownership it does
   * not get to claim.
   */
  saveAnalysis(analysis: SavedAnalysis): Observable<ApiResponse<SavedAnalysis>> {
    const body: Record<string, unknown> = {
      analysisName: analysis.analysisName,
      connectionAlias: analysis.connectionAlias,
      datasetPath: analysis.datasetPath,
      analysisConfig: analysis.analysisConfig,
    };
    if (analysis.visualizationType) body['visualizationType'] = analysis.visualizationType;
    if (analysis.analyticsAnalysisId) body['analyticsAnalysisId'] = analysis.analyticsAnalysisId;
    return this.http.post<ApiResponse<SavedAnalysis>>(`${this.workspace}/saveAnalysis`, body);
  }

  deleteAnalysis(analyticsAnalysisId: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.workspace}/deleteAnalysis`, {
      params: { analyticsAnalysisId: String(analyticsAnalysisId) },
    });
  }

  // ---- the workspace: dashboards, and the widgets arranged on them ------------------------

  /** Every board this workspace has, newest first, WITHOUT their widgets. */
  fetchAllDashboards(): Observable<ApiResponse<Dashboard[]>> {
    return this.http.get<ApiResponse<Dashboard[]>>(`${this.workspace}/fetchAllDashboards`);
  }

  /**
   * One board with its widgets in display order.
   *
   * This is metadata and nothing else: it opens no session, takes no governor permit and reads
   * no dataset. What the widgets POINT AT is run separately, one query at a time, by whoever is
   * showing them -- see the dashboard component, which is where that cost is decided.
   */
  fetchDashboardById(analyticsDashboardId: number): Observable<ApiResponse<Dashboard>> {
    return this.http.get<ApiResponse<Dashboard>>(`${this.workspace}/fetchDashboardById`, {
      params: { analyticsDashboardId: String(analyticsDashboardId) },
    });
  }

  /**
   * Stores the board under a name, or updates the one the id names.
   *
   * Only the two fields a person decides are sent, for the reason saveAnalysis sends five: the
   * service copies exactly those onto a row whose tenant and audit columns come from the
   * signed-in context, and a tenantId on the wire here would be this client claiming an
   * ownership it does not get to claim.
   *
   * The widgets are NOT sent. They are @Transient on that row and have their own endpoint; a
   * list posted here would be read by nothing and would look, from this side, as though a save
   * had persisted an arrangement it never touched.
   */
  saveDashboard(dashboard: Dashboard): Observable<ApiResponse<Dashboard>> {
    const body: Record<string, unknown> = { dashboardName: dashboard.dashboardName };
    // Sent only when there is one. A blank description and no description are the same intent to
    // a reader, and the server trims an empty one to null anyway -- so sending '' would be this
    // client asking for a write it does not mean.
    if (dashboard.dashboardDescription) {
      body['dashboardDescription'] = dashboard.dashboardDescription;
    }
    if (dashboard.analyticsDashboardId) body['analyticsDashboardId'] = dashboard.analyticsDashboardId;
    return this.http.post<ApiResponse<Dashboard>>(`${this.workspace}/saveDashboard`, body);
  }

  /**
   * Deletes the board and the widgets on it. What those widgets POINTED AT is untouched.
   *
   * Worth stating at the call site because the two are easy to conflate: a dashboard is an
   * arrangement of saved work, not the owner of it, so deleting one removes the page and leaves
   * every analysis and every saved query exactly where they were.
   */
  deleteDashboard(analyticsDashboardId: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.workspace}/deleteDashboard`, {
      params: { analyticsDashboardId: String(analyticsDashboardId) },
    });
  }

  /**
   * Puts a saved analysis or a saved query on a board, or edits a tile already there.
   *
   * EXACTLY ONE source id travels, and the caller decides which. Neither id is defaulted or
   * inferred here: the server refuses both-and-neither with a sentence, and a client that
   * quietly picked one when handed two would turn a caller's mistake into a tile silently
   * showing something other than what was asked for.
   *
   * tenantId is not sent and would not be read. The service takes the owning tenant from the
   * DASHBOARD rather than from the caller, which is what stops one workspace's analysis being
   * hung on another workspace's page.
   */
  saveWidget(widget: DashboardWidget): Observable<ApiResponse<DashboardWidget>> {
    const body: Record<string, unknown> = {
      analyticsDashboardId: widget.analyticsDashboardId,
      widgetTitle: widget.widgetTitle,
      // Sent explicitly rather than left to the server's default of 0, so a board's order is
      // this screen's arrangement and not a tie broken by row id.
      displayOrder: widget.displayOrder ?? 0,
    };
    if (widget.analyticsAnalysisId) body['analyticsAnalysisId'] = widget.analyticsAnalysisId;
    if (widget.analyticsQueryId) body['analyticsQueryId'] = widget.analyticsQueryId;
    if (widget.visualizationType) body['visualizationType'] = widget.visualizationType;
    // Only when there is one: see DashboardWidget.widgetConfig. An empty object here would be a
    // null with extra steps, and dropping a config the server holds would clear it by accident.
    if (widget.widgetConfig) body['widgetConfig'] = widget.widgetConfig;
    if (widget.analyticsDashboardWidgetId) {
      body['analyticsDashboardWidgetId'] = widget.analyticsDashboardWidgetId;
    }
    return this.http.post<ApiResponse<DashboardWidget>>(`${this.workspace}/saveWidget`, body);
  }

  /** Takes one tile off a board. The analysis or query it showed is untouched. */
  deleteWidget(analyticsDashboardWidgetId: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.workspace}/deleteWidget`, {
      params: { analyticsDashboardWidgetId: String(analyticsDashboardWidgetId) },
    });
  }

  // ---- the registry: datasets somebody named and kept -------------------------------------

  /**
   * Every dataset this workspace has registered, newest first.
   *
   * Metadata only. A registered dataset is a NAME for a location -- listing them reads no file,
   * opens no session and costs no governor permit, which is what makes the registry usable as a
   * starting point rather than as something to browse carefully.
   */
  fetchAllDatasets(): Observable<ApiResponse<RegisteredDataset[]>> {
    return this.http.get<ApiResponse<RegisteredDataset[]>>(`${this.datasets}/fetchAllDatasets`);
  }

  /**
   * One registered dataset, by the id the registry gave it.
   *
   * The id is new to this module and the server treats it carefully: a row the caller does not
   * own is refused with the same sentence as a row that does not exist, so walking the id space
   * tells a caller nothing about what other workspaces hold. There is nothing to interpret here
   * -- a refusal is a refusal, and this client must not read one as "it exists but is theirs".
   */
  fetchDatasetById(analyticsDatasetId: number): Observable<ApiResponse<RegisteredDataset>> {
    return this.http.get<ApiResponse<RegisteredDataset>>(`${this.datasets}/fetchDatasetById`, {
      params: { analyticsDatasetId: String(analyticsDatasetId) },
    });
  }

  /**
   * Names a location, having first proved the caller can read it.
   *
   * THREE FIELDS TRAVEL and no others. The server copies exactly name, alias and path onto a row
   * whose tenant and audit columns come from the signed-in context, and whose FORMAT comes from
   * the resolver -- so datasetFormat is deliberately dropped here even when the object carries
   * one, because a format the caller chose would be a label on a listing that the reader would
   * take as measured.
   *
   * A refusal is the resolver's own sentence and is shown verbatim: it says the same thing for
   * "no such connection" and "not yours", and paraphrasing it here would be this screen
   * inventing a distinction the server spent effort refusing to make.
   */
  registerDataset(dataset: RegisteredDataset): Observable<ApiResponse<RegisteredDataset>> {
    return this.http.post<ApiResponse<RegisteredDataset>>(`${this.datasets}/registerDataset`, {
      datasetName: dataset.datasetName,
      connectionAlias: dataset.connectionAlias,
      datasetPath: dataset.datasetPath,
    });
  }

  /** Forgets the name. The file it named is not touched -- this registry owns no data. */
  deleteDataset(analyticsDatasetId: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.datasets}/deleteDataset`, {
      params: { analyticsDatasetId: String(analyticsDatasetId) },
    });
  }

  // ---- the library: saved queries and the record of what ran -----------------------------

  fetchAllQueries(): Observable<ApiResponse<SavedQuery[]>> {
    return this.http.get<ApiResponse<SavedQuery[]>>(`${this.library}/fetchAllQueries`);
  }

  /**
   * Stores the query under a name, or updates the one the id names.
   *
   * Only the four fields a person decides are sent. The server copies exactly those onto a row
   * whose tenant and audit columns come from the signed-in context, so anything else put on the
   * wire here would be read by nothing -- and sending a tenantId would be this client claiming an
   * ownership it does not get to claim.
   */
  saveQuery(query: SavedQuery): Observable<ApiResponse<SavedQuery>> {
    const body: Record<string, unknown> = {
      queryName: query.queryName,
      connectionAlias: query.connectionAlias,
      datasetPath: query.datasetPath,
      queryText: query.queryText,
    };
    if (query.analyticsQueryId) body['analyticsQueryId'] = query.analyticsQueryId;
    return this.http.post<ApiResponse<SavedQuery>>(`${this.library}/saveQuery`, body);
  }

  renameQuery(analyticsQueryId: number, queryName: string): Observable<ApiResponse<SavedQuery>> {
    return this.http.put<ApiResponse<SavedQuery>>(`${this.library}/renameQuery`, null, {
      params: { analyticsQueryId: String(analyticsQueryId), queryName },
    });
  }

  deleteQuery(analyticsQueryId: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.library}/deleteQuery`, {
      params: { analyticsQueryId: String(analyticsQueryId) },
    });
  }

  /**
   * Recent runs, newest first.
   *
   * Asked without an analyticsQueryId, which gives the whole workspace's history rather than one
   * saved query's. That is the useful reading on a console: most of what a person runs here was
   * never saved under a name, and a history that only remembered the named queries would forget
   * exactly the ad-hoc statement they now want back.
   */
  fetchRecentRuns(limit?: number, analyticsQueryId?: number): Observable<ApiResponse<QueryRun[]>> {
    const params: Record<string, string> = {};
    if (limit) params['limit'] = String(limit);
    if (analyticsQueryId) params['analyticsQueryId'] = String(analyticsQueryId);
    return this.http.get<ApiResponse<QueryRun[]>>(`${this.library}/fetchRecentRuns`, { params });
  }

  /**
   * The result as a file the browser can save.
   *
   * The query runs again server-side rather than the browser posting back the rows it is holding:
   * a client that sent its own rows could send any rows, and the file would carry an application
   * filename over data the application never produced.
   */
  download(request: QueryRequest & { format: string; fileName?: string }): Observable<ApiResponse<ExportFile>> {
    return this.http.post<ApiResponse<ExportFile>>(`${this.exports}/download`, request);
  }

  /**
   * Stops a run the caller started.
   *
   * Answered the same way whether the run finished a moment ago, never existed, or belongs to
   * somebody else -- the server refuses to distinguish those, because telling them apart would
   * confirm that an id is live in another workspace. So there is nothing here to interpret: the
   * screen stops waiting, and the history row says what actually happened.
   */
  cancel(queryId: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(
      `${this.base}/query/${encodeURIComponent(queryId)}/cancel`, {});
  }

  /** The result written into the connection's own bucket. Never a bucket the caller names. */
  writeBack(request: QueryRequest & { folder?: string; fileName?: string; format?: string }):
    Observable<ApiResponse<WriteBackResult>> {
    return this.http.post<ApiResponse<WriteBackResult>>(`${this.exports}/writeBack`, request);
  }
}
