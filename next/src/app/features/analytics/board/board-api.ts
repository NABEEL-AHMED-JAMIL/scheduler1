import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import type { ExportFile, FilterClause } from '../analytics.service';
import type { BoardFilterOutcome, BoardFilterWire, FilterFamily } from './board-filters';

/** A column of a table page, with DuckDB's own type name. */
export interface PageColumn { name: string; type: string }

/** One page of a saved statement's result (analytics-service TablePageDto). */
export interface TablePage {
  columns: string[];
  columnMeta: PageColumn[];
  rows: (string | null)[][];
  page: number;
  pageSize: number;
  /** Rows the table's filters and search leave. */
  totalRows: number;
  /** Rows under the board's filters alone. */
  unfilteredRows?: number;
  filtered: boolean;
  /** Few-valued text columns' values, on a page that asked for them. */
  facets?: Record<string, string[]>;
  /** Each number and date column's lowest and highest value, with the facets. */
  ranges?: Record<string, string[]>;
  boardFilters?: BoardFilterOutcome[];
  queryId?: string;
  durationMs?: number;
}

/** What a table asks of the server: the statement, the board's filters, and the table's own shape. */
export interface TableRequest {
  connection: string;
  path: string;
  connection2?: string | null;
  path2?: string | null;
  sql: string;
  boardFilters?: BoardFilterWire[];
  page: number;
  pageSize: number;
  sort?: string | null;
  direction?: 'ASC' | 'DESC' | null;
  search?: string | null;
  filters?: FilterClause[];
  facets?: boolean;
  queryId?: string;
  /** ZT-A13: the board and the table tile (a Saved Analyses reader is run the tile's own statement). */
  boardId?: number | null;
  widgetId?: number | null;
}

/** A column's values for a filter's picker (analytics-service ColumnValuesDto). */
export interface ColumnValues {
  column: string;
  type: string;
  family: FilterFamily | 'other';
  values: { value: string; count: number }[];
  distinct: number;
  more: boolean;
}

/**
 * The two reads a board's filters and its table widget need beyond a tile's run: a page of a statement's result, and
 * a column's values. Both under /analytics.json, which a viewer's Saved Analyses page already holds, so a viewer
 * filters and pages exactly as an editor does.
 */
@Injectable({ providedIn: 'root' })
export class BoardApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/analytics.json`;
  private readonly exports = `${API_BASE}/analyticsExport.json`;

  rows(request: TableRequest): Observable<ApiResponse<TablePage>> {
    return this.http.post<ApiResponse<TablePage>>(`${this.base}/rows`, tableBody(request));
  }

  /** ZT-A13: `boardId` -- a Saved Analyses reader may list only the values a filter of that board lists. */
  values(connection: string, path: string, column: string, search = '', limit = 200, boardId?: number | null): Observable<ApiResponse<ColumnValues>> {
    let params = new HttpParams().set('connection', connection).set('path', path).set('column', column).set('limit', limit);
    if (search.trim()) params = params.set('search', search.trim());
    if (boardId != null) params = params.set('boardId', boardId);
    return this.http.get<ApiResponse<ColumnValues>>(`${this.base}/values`, { params });
  }

  /** Every row of the table as the reader filtered it, as a CSV (the export endpoint; metered as a download is). */
  exportCsv(request: TableRequest, fileName: string): Observable<ApiResponse<ExportFile>> {
    const body = tableBody(request);
    delete body['page'];
    delete body['pageSize'];
    delete body['facets'];
    body['format'] = 'csv';
    body['fileName'] = fileName;
    return this.http.post<ApiResponse<ExportFile>>(`${this.exports}/download`, body);
  }
}

/** The body as the server reads it: only what is set travels, and a second dataset only as a pair. */
export function tableBody(request: TableRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    connection: request.connection, path: request.path, sql: request.sql, page: request.page, pageSize: request.pageSize,
  };
  if (request.connection2 && request.path2) {
    body['connection2'] = request.connection2;
    body['path2'] = request.path2;
  }
  if (request.boardFilters?.length) body['boardFilters'] = request.boardFilters;
  if (request.sort) {
    body['sort'] = request.sort;
    body['direction'] = request.direction ?? 'ASC';
  }
  if (request.search?.trim()) body['search'] = request.search.trim();
  if (request.filters?.length) body['filters'] = JSON.stringify(request.filters);
  if (request.facets) body['facets'] = true;
  if (request.queryId) body['queryId'] = request.queryId;
  if (request.boardId != null && request.widgetId != null) {
    body['boardId'] = request.boardId;
    body['widgetId'] = request.widgetId;
  }
  return body;
}
