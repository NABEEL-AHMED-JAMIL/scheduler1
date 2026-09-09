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
  totalRows: number;
  multiFile: boolean;
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
   */
  preview(connection: string, path: string, page = 0, knownTotal?: number, pageSize?: number)
      : Observable<ApiResponse<DatasetPreview>> {
    const params: Record<string, string> = { connection, path, page: String(page) };
    // Absent means "the server's own default". Sending a size it would only clamp is noise.
    if (pageSize) params['pageSize'] = String(pageSize);
    // Positive only, matching the server's own condition: an empty dataset legitimately totals
    // zero, and asserting that would turn "I have not counted" into "there is nothing here".
    if (knownTotal && knownTotal > 0) params['knownTotal'] = String(knownTotal);
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
