import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';

/**
 * Reports redesign, features 3 and 4 (owner 2026-11-02, "build all"; design schedule.html): generate many reports from the
 * console, on a schedule, and deliver each once it is approved. media-service's reportGenerate.json schedule endpoints (page
 * report-generate), and reportLibrary.json/deliveries and /upcomingDeliveries for the report page and the overview.
 */

export type ScheduleStatus = 'ON' | 'PAUSED' | 'ARCHIVED';
export type ScheduleState = ScheduleStatus | 'WILL_FAIL';
export type Repeat = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export const DAYS: Day[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DAY_WORDS: Record<Day, string> = { SUN: 'Sun', MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' };

export interface Assignee { kind: 'team' | 'role' | 'user'; value: string; }

/** What a schedule makes, in the six steps of the schedule page. */
export interface ScheduleSpec {
  template: { templateId: string; version: 'latest' | number; watermark: 'DRAFT' | 'NONE' };
  formats: ('PDF' | 'HTML')[];
  data: {
    kind: 'SOURCE' | 'PIPELINE'; sourceId?: string; sourceName?: string; pipelineId?: number; pipelineName?: string; stepKey?: string;
    rows: { dateField?: string; lastDays?: number; where: { field: string; op: 'eq' | 'ne' | 'empty' | 'notEmpty'; value?: string }[] };
    ifFailed?: 'SKIP' | 'LAST_GOOD'; waitMinutes?: number; skipUnchanged?: boolean;
  };
  split: { mode: 'ALL' | 'PER_GROUP'; groupBy?: string; name: string };
  approval: { reviewers: Assignee | null; needed: 1 | 2; meaning: string; remindAfterDays: number };
  delivery: { email: { userIds: number[] } | null; bucket: { connection: string; path: string } | null; webhook: boolean };
  timing: { repeat: Repeat; days?: Day[]; dayOfMonth?: number; at: string; date?: string };
}

export interface ScheduleBody extends ScheduleSpec { scheduleId?: string; rowVersion?: number; name: string; }

export interface RunView {
  runId: string; kind: 'SCHEDULED' | 'MANUAL'; status: 'DUE' | 'WAITING' | 'MAKING' | 'DONE' | 'SKIPPED' | 'FAILED';
  dueAt: string; startedAt?: string; endedAt?: string; waitUntil?: string; reportsPlanned?: number; reportsMade: number; reportsFailed: number;
  rowsRead?: number; message?: string | null; dataLabel?: string | null; pipelineRunId?: number;
}

export interface ScheduleSummary {
  scheduleId: string; name: string; status: ScheduleStatus; state: ScheduleState; templateId: string; templateName?: string | null;
  rowVersion: number; nextRunAt?: string; problem?: string | null; when: string; makes: string; then: string; lastRun?: RunView;
}

export interface DeliveryView {
  deliveryId: string; reportId: string; reportLabel?: string; version: number; channel: 'LIBRARY' | 'EMAIL' | 'BUCKET' | 'WEBHOOK';
  status: 'PENDING' | 'SENT' | 'FAILED'; attempts: number; createdAt: string; sentAt?: string; target: string; error?: string;
}

export interface ScheduleDetail extends ScheduleSummary {
  spec: ScheduleSpec; zone: string; nextRuns: string[]; runs: RunView[]; runsTotal: number; deliveries: DeliveryView[];
  createdBy?: string | null; createdAt?: string | null; updatedAt?: string | null;
}

export interface RunReport {
  position: number; name: string; rows: number; status: 'PENDING' | 'QUEUED' | 'MADE' | 'FAILED' | 'CANCELLED';
  reportId?: string; reportLabel?: string; version?: number; approved?: boolean; errorCode?: string; error?: string;
}

export interface RunDetail extends RunView { scheduleId: string; scheduleName: string; reports: RunReport[]; reportsTotal: number; }

export interface PlanCheck { level: 'OK' | 'WARNING' | 'ERROR'; about: string; text: string; }

export interface SchedulePlan {
  checks: PlanCheck[]; zone?: string; when?: string; makes?: string; then?: string; nextRuns?: string[]; templateName?: string;
  templateVersion?: number; reportsPlanned?: number; maxReports?: number; exampleName?: string; bucketExample?: string;
  firstReports?: { position: number; name: string; rows: number }[];
  data?: { label: string; rowsRead: number; rowsKept: number; undated: number; sensitive: boolean; note?: string; pipelineRunId?: number;
    runEndedAt?: string; columns: string[]; missingFields: string[]; fieldsNeeded: number };
  approval?: { people: number; needed: number; meaning: string; assignee: Assignee };
}

export interface Recipient { userId: number; name: string; role?: string | null; emailable: boolean; email?: string; teams: number[]; }

export interface Upcoming {
  zone: string; schedules: number;
  upcoming: { scheduleId: string; name: string; at?: string; state: ScheduleState; makes: string; then: string }[];
}

export interface ReportDeliveries {
  deliveries: DeliveryView[]; schedule?: { scheduleId: string; name: string; then: string };
}

export const STATE_WORDS: Record<ScheduleState, string> = { ON: 'On', PAUSED: 'Paused', ARCHIVED: 'Archived', WILL_FAIL: 'Will fail' };
export const RUN_WORDS: Record<RunView['status'], string> = {
  DUE: 'Starting', WAITING: 'Waiting for its pipeline', MAKING: 'Making reports', DONE: 'Done', SKIPPED: 'Skipped', FAILED: 'Failed',
};
export const CHANNEL_WORDS: Record<DeliveryView['channel'], string> = { LIBRARY: 'Library', EMAIL: 'Email link', BUCKET: 'Bucket folder', WEBHOOK: 'Webhook' };

/** The pill's tone for a schedule's state. */
export function scheduleTone(s: ScheduleState | string): 'ok' | 'warn' | 'crit' | 'neutral' {
  return s === 'ON' ? 'ok' : s === 'WILL_FAIL' ? 'crit' : s === 'PAUSED' ? 'warn' : 'neutral';
}

/** The pill's tone for a run. */
export function runTone(s: RunView['status'] | string): 'ok' | 'warn' | 'crit' | 'neutral' {
  return s === 'DONE' ? 'ok' : s === 'FAILED' ? 'crit' : s === 'SKIPPED' || s === 'WAITING' ? 'warn' : 'neutral';
}

/** A new schedule's defaults: the design's weekly Monday 07:00, one report per row group, one approval, the library. */
export function blankSchedule(): ScheduleBody {
  return {
    name: '',
    template: { templateId: '', version: 'latest', watermark: 'DRAFT' },
    formats: ['PDF'],
    data: { kind: 'PIPELINE', rows: { where: [] }, ifFailed: 'SKIP', waitMinutes: 120, skipUnchanged: true },
    split: { mode: 'PER_GROUP', groupBy: '', name: '' },
    approval: { reviewers: null, needed: 1, meaning: 'REVIEWED', remindAfterDays: 2 },
    delivery: { email: null, bucket: null, webhook: false },
    timing: { repeat: 'WEEKLY', days: ['MON'], at: '07:00' },
  };
}

/** The placeholders a name pattern reads: {field} of the data, or one of the run's own. */
export const SPECIAL_NAMES = ['year', 'month', 'week', 'date', 'n', 'count', 'schedule'];

export function placeholders(pattern: string): string[] {
  return [...pattern.matchAll(/\{([^{}]{1,64})\}/g)].map(m => m[1].trim());
}

@Injectable({ providedIn: 'root' })
export class SchedulesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/reportGenerate.json`;
  private readonly library = `${API_BASE}/reportLibrary.json`;

  private static data$<T>(o: Observable<ApiResponse<T>>): Observable<T> {
    return o.pipe(map(r => r.data as T));
  }

  list(archived = false): Observable<{ schedules: ScheduleSummary[]; total: number; zone: string }> {
    return SchedulesApi.data$(this.http.get<ApiResponse<{ schedules: ScheduleSummary[]; total: number; zone: string }>>(`${this.base}/schedules`,
      { params: { archived: String(archived) } }));
  }

  get(scheduleId: string): Observable<ScheduleDetail> {
    return SchedulesApi.data$(this.http.get<ApiResponse<ScheduleDetail>>(`${this.base}/schedule`, { params: { scheduleId } }));
  }

  run(runId: string, offset = 0): Observable<RunDetail> {
    return SchedulesApi.data$(this.http.get<ApiResponse<RunDetail>>(`${this.base}/scheduleRun`, { params: { runId, offset: String(offset) } }));
  }

  recipients(): Observable<Recipient[]> {
    return this.http.get<ApiResponse<{ people: Recipient[] }>>(`${this.base}/scheduleRecipients`).pipe(map(r => r.data?.people ?? []));
  }

  save(body: ScheduleBody): Observable<ScheduleDetail> {
    return SchedulesApi.data$(this.http.post<ApiResponse<ScheduleDetail>>(`${this.base}/saveSchedule`, body));
  }

  pause(scheduleId: string): Observable<ScheduleDetail> {
    return SchedulesApi.data$(this.http.post<ApiResponse<ScheduleDetail>>(`${this.base}/pauseSchedule`, null, { params: { scheduleId } }));
  }

  resume(scheduleId: string): Observable<ScheduleDetail> {
    return SchedulesApi.data$(this.http.post<ApiResponse<ScheduleDetail>>(`${this.base}/resumeSchedule`, null, { params: { scheduleId } }));
  }

  archive(scheduleId: string): Observable<unknown> {
    return SchedulesApi.data$(this.http.post<ApiResponse<unknown>>(`${this.base}/archiveSchedule`, null, { params: { scheduleId } }));
  }

  runNow(scheduleId: string): Observable<RunView> {
    return SchedulesApi.data$(this.http.post<ApiResponse<RunView>>(`${this.base}/runSchedule`, null, { params: { scheduleId } }));
  }

  plan(body: ScheduleBody, checkFolder = false): Observable<SchedulePlan> {
    return SchedulesApi.data$(this.http.post<ApiResponse<SchedulePlan>>(`${this.base}/schedulePlan`, body,
      { params: { checkFolder: String(checkFolder) } }));
  }

  /** "Make the first 3 now (test)": report {@code index} (0 to 2) as a preview PDF. */
  test(body: ScheduleBody, index: number): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.base}/scheduleTest`, body, { params: { index: String(index) }, responseType: 'blob', observe: 'response' });
  }

  deliveries(reportId: string): Observable<ReportDeliveries> {
    return SchedulesApi.data$(this.http.get<ApiResponse<ReportDeliveries>>(`${this.library}/deliveries`, { params: { reportId } }));
  }

  upcoming(days = 7): Observable<Upcoming> {
    return SchedulesApi.data$(this.http.get<ApiResponse<Upcoming>>(`${this.library}/upcomingDeliveries`, { params: { days: String(days) } }));
  }
}
