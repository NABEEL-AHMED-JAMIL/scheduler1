import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { localIsoDay } from '../../../shared/ui/local-day';
import { Bar } from '../../../shared/charts/bar-chart';
import { statusColor } from '../../../shared/charts/status-color';

/**
 * UX review 2026-10-12 (B3, E1): Runs › Latest as an explorer -- facets on the left (when, status, pipeline, started
 * by) whose counts come from the server, a time histogram above the list, and the list itself, all read with one set
 * of filters. Core answers the counts (POST message.json/runFacets) with the same body as the list
 * (message.json/fetchLogs), each facet counted with every other filter applied but not its own, so picking a status
 * still shows what the others hold.
 */

/** The window the explorer reads: whole days, as the runs endpoints take them ("yyyy-MM-dd", both included). */
export type RunWindow = 'today' | '2d' | '7d' | '30d';

export const RUN_WINDOWS: { id: RunWindow; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: '2d', label: 'Since yesterday' }, { id: '7d', label: 'Last 7 days' }, { id: '30d', label: 'Last 30 days' },
];

export interface FacetCount { key: string; label?: string; count: number; }
export interface PipelineCount { taskDetailId: number; taskName: string; count: number; }
export interface HistogramBucket { start: string; total: number; counts: Record<string, number>; }

export interface RunFacets {
  total: number;
  statuses: FacetCount[];
  pipelines: PipelineCount[];
  triggers: FacetCount[];
  histogram: { bucket: 'hour' | 'day'; buckets: HistogramBucket[] };
}

export interface ExplorerFilter {
  window: RunWindow;
  statuses: string[];
  pipelines: number[];
  triggers: string[];
}

export const NO_FILTER: ExplorerFilter = { window: '2d', statuses: [], pipelines: [], triggers: [] };

/** The two days a window covers, on the reader's own calendar. */
export function windowDays(window: RunWindow, today: Date = new Date()): { fromDate: string; toDate: string } {
  const back = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return localIsoDay(d); };
  const toDate = localIsoDay(today);
  switch (window) {
    case 'today': return { fromDate: toDate, toDate };
    case '7d': return { fromDate: back(6), toDate };
    case '30d': return { fromDate: back(29), toDate };
    default: return { fromDate: back(1), toDate };
  }
}

/** The body both reads take: the window's days, and only the filters that are on. */
export function explorerBody(filter: ExplorerFilter, limit: number, today: Date = new Date()): Record<string, unknown> {
  const body: Record<string, unknown> = { ...windowDays(filter.window, today), limit };
  if (filter.statuses.length) body['jobStatuses'] = filter.statuses;
  if (filter.pipelines.length) body['taskDetailIds'] = filter.pipelines;
  if (filter.triggers.length) body['triggers'] = filter.triggers;
  return body;
}

/** A list with the value added, or taken out when it was there. */
export function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

/** How many filters are on, the window aside. */
export function activeCount(filter: ExplorerFilter): number {
  return filter.statuses.length + filter.pipelines.length + filter.triggers.length;
}

const STATUS_ORDER = ['Completed', 'Failed', 'Running', 'Start', 'Queue', 'Skip', 'Interrupt', 'Missed'];

/**
 * The histogram's bars: one a bucket, stacked by status (counts, which add up to the bar). An hour reads "14:00", a
 * day "12 Oct"; the bucket's start is the bar's meta, so a click can narrow to it.
 */
export function histogramBars(facets: RunFacets | null): Bar[] {
  if (!facets?.histogram?.buckets?.length) return [];
  const hourly = facets.histogram.bucket === 'hour';
  return facets.histogram.buckets.map(b => {
    const statuses = Object.keys(b.counts ?? {}).sort((x, y) => rank(x) - rank(y));
    return {
      name: bucketName(b.start, hourly),
      value: b.total,
      meta: b.start,
      segments: statuses.filter(s => (b.counts[s] ?? 0) > 0).map(s => ({ label: s, value: b.counts[s], color: statusColor(s) })),
    };
  });
}

function rank(status: string): number {
  const at = STATUS_ORDER.indexOf(status);
  return at < 0 ? STATUS_ORDER.length : at;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14:00" for an hour, "12 Oct" for a day: the bucket's own wall clock, never shifted. */
export function bucketName(start: string, hourly: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(start ?? '');
  if (!m) return start ?? '';
  if (hourly && m[4]) return `${m[4]}:${m[5]}`;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

@Injectable({ providedIn: 'root' })
export class RunExplorerApi {
  private readonly http = inject(HttpClient);

  facets(body: Record<string, unknown>): Observable<ApiResponse<RunFacets>> {
    return this.http.post<ApiResponse<RunFacets>>(`${API_BASE}/message.json/runFacets`, body);
  }
}
