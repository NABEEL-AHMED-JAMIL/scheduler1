import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { RunParameter } from '../../jobs/run-parameters/run-parameters';
import { dayLabel } from '../../../shared/ui/time-format';

/**
 * MIG-347: backfills, Core's answers under sourceJob.json (Schedules' page; a tenant user's are their own schedules').
 *
 * - POST backfills/preview and backfills/start {jobId, from, to, step, concurrency, rerunCompleted, parameters}: what it
 *   would run (the periods in the workspace's billing zone, which already completed, the values, the cost estimate for an
 *   administrator, what start would refuse), and starting it.
 * - GET backfills?jobId&status&page&limit: the workspace's backfills, newest first, with their progress.
 * - GET backfills/detail?backfillId&state&page: one, with a page of its periods and their runs, and (administrators) its
 *   estimate and what its runs were billed so far.
 * - POST backfills/pause, resume, cancel, retryFailed {backfillId}.
 * - GET backfills/ofRun?jobQueueId: the backfill a run is part of (absent for none).
 * Refusals are 4xx with the sentence in the envelope.
 */
export type BackfillStep = 'DAILY' | 'HOURLY' | 'WEEKLY';
export type BackfillStatus = 'RUNNING' | 'PAUSED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';

export interface BackfillRequest {
  jobId: number;
  from: string;
  to: string;
  step: BackfillStep;
  concurrency: number;
  rerunCompleted: boolean;
  parameters: Record<string, string> | null;
}

export interface Estimate {
  perRun: number | string | null;
  total: number | string | null;
  currency: string | null;
  basis?: string | null;
  unavailable?: string | null;
}

export interface PreviewDate { date: string; start: string; end: string; completed: boolean; }

export interface BackfillPreview {
  jobId: number;
  jobName: string;
  zone: string;
  step: BackfillStep;
  from: string;
  to: string;
  periods: number;
  alreadyCompleted: number;
  willRun: number;
  rerunCompleted: boolean;
  concurrency: number;
  maxConcurrency: number;
  maxPeriods: number;
  dates: PreviewDate[];
  parameters: RunParameter[];
  values: Record<string, string>;
  warnings: string[];
  openBackfills: number;
  maxOpen: number;
  estimate: Estimate | null;
  estimateNote?: string;
}

export interface BackfillCounts { pending: number; queued: number; completed: number; failed: number; skipped: number; cancelled: number; }

export interface Backfill {
  backfillId: number;
  jobId: number;
  jobName: string | null;
  status: BackfillStatus;
  step: BackfillStep;
  from: string;
  to: string;
  zone: string;
  concurrency: number;
  rerunCompleted: boolean;
  parameters: Record<string, string>;
  total: number;
  counts: BackfillCounts;
  done: number;
  holdReason: string | null;
  createdBy: number | null;
  createdVia: 'console' | 'api';
  dateCreated: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  eta: { seconds: number; at: string; basis: string } | null;
  estimate?: Estimate;
  periods?: BackfillPeriod[];
  billed?: { runs: number; billedRuns?: number; total?: number | string; currency?: string; unavailable?: string };
}

export interface BackfillPeriod {
  date: string;
  start: string;
  end: string;
  state: 'PENDING' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
  jobQueueId: number | null;
  tries: number;
  note: string | null;
  runStatus: string | null;
  runStartedAt: string | null;
  runEndedAt: string | null;
}

export interface BackfillPage { rows: Backfill[]; total: number; page: number; limit: number; maxOpen: number; maxConcurrency: number; }

export interface RunBackfill {
  backfillId: number;
  jobId: number;
  step: BackfillStep;
  status: BackfillStatus;
  date: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodState: string | null;
}

@Injectable({ providedIn: 'root' })
export class BackfillsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/sourceJob.json/backfills`;

  preview(request: BackfillRequest): Observable<ApiResponse<BackfillPreview>> {
    return this.http.post<ApiResponse<BackfillPreview>>(`${this.base}/preview`, request);
  }

  start(request: BackfillRequest): Observable<ApiResponse<Backfill>> {
    return this.http.post<ApiResponse<Backfill>>(`${this.base}/start`, request);
  }

  list(query: { jobId?: number | null; status?: BackfillStatus[]; page?: number; limit?: number }): Observable<ApiResponse<BackfillPage>> {
    const params: Record<string, string | string[]> = { page: String(query.page ?? 1), limit: String(query.limit ?? 25) };
    if (query.jobId) params['jobId'] = String(query.jobId);
    if (query.status?.length) params['status'] = query.status;
    return this.http.get<ApiResponse<BackfillPage>>(this.base, { params });
  }

  detail(backfillId: number, state?: string | null, page = 1): Observable<ApiResponse<Backfill>> {
    const params: Record<string, string> = { backfillId: String(backfillId), page: String(page) };
    if (state) params['state'] = state;
    return this.http.get<ApiResponse<Backfill>>(`${this.base}/detail`, { params });
  }

  act(action: 'pause' | 'resume' | 'cancel' | 'retryFailed', backfillId: number): Observable<ApiResponse<Backfill>> {
    return this.http.post<ApiResponse<Backfill>>(`${this.base}/${action}`, { backfillId });
  }

  ofRun(jobQueueId: number): Observable<ApiResponse<RunBackfill | null>> {
    return this.http.get<ApiResponse<RunBackfill | null>>(`${this.base}/ofRun`, { params: { jobQueueId: String(jobQueueId) } });
  }
}

// ---------------------------------------------------------------------------------------------------- words, shared

export const STEP_WORDS: Record<BackfillStep, { label: string; unit: string; units: string }> = {
  DAILY: { label: 'Daily', unit: 'day', units: 'days' },
  HOURLY: { label: 'Hourly', unit: 'hour', units: 'hours' },
  WEEKLY: { label: 'Weekly', unit: 'week', units: 'weeks' },
};

/** "14 days", "1 hour". */
export function periodsText(count: number, step: BackfillStep): string {
  const w = STEP_WORDS[step] ?? STEP_WORDS.DAILY;
  return `${count} ${count === 1 ? w.unit : w.units}`;
}

/** The periods that ran or were skipped as done; a cancelled one never ran, so it is not counted as done. */
export function doneOf(b: Pick<Backfill, 'counts'>): number {
  return b.counts.completed + b.counts.failed + b.counts.skipped;
}

/** A money amount to a cent or, below a cent, to its first figures: "$1.42", "$0.0031". */
export function money(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const n = Number(amount);
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(n)) return '—';
  const code = (currency || 'USD').toUpperCase();
  const digits = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits })
      .format(n);
  } catch {
    return `${n.toFixed(digits)} ${code}`;
  }
}

/** The progress bar's parts, in percent of the total: done (completed + skipped), failed, running, waiting. */
export function progressParts(b: Pick<Backfill, 'total' | 'counts'>): { completed: number; failed: number; running: number; waiting: number } {
  const total = Math.max(1, b.total);
  const pct = (n: number) => Math.round((n / total) * 1000) / 10;
  return {
    completed: pct(b.counts.completed + b.counts.skipped),
    failed: pct(b.counts.failed),
    running: pct(b.counts.queued),
    waiting: pct(b.counts.pending + b.counts.cancelled),
  };
}

/** "about 4 min", "about 2 h 10 min", "under a minute". */
export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `about ${h} h ${m} min` : `about ${h} h`;
}

/**
 * A period as a person reads it: "6 Oct" for a day or a week, "6 Oct 14:00" for an hour -- its clock in the backfill's
 * zone, 24-hour, whoever reads it.
 */
export function periodLabel(day: string, start: string, step: BackfillStep | null | undefined, zone?: string | null): string {
  const label = dayLabel(day).replace(/ \d{4}$/, '');
  if (step !== 'HOURLY') return label;
  const at = new Date(start);
  if (!Number.isFinite(at.getTime())) return label;
  try {
    return `${label} ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone || undefined }).format(at)}`;
  } catch {
    return label;
  }
}

/** Whether a backfill may still change: running or paused. */
export const isOpen = (status: string | null | undefined) => status === 'RUNNING' || status === 'PAUSED';

export interface Look { tone: 'brand' | 'warn' | 'neutral' | 'ok' | 'crit'; icon: string; word: string; }

/**
 * A backfill's or a period's chip: the console's tones (the status chip's), kept here so the shared chip -- in every
 * page's first load -- carries none of a backfill's words.
 */
export function lookOf(state: string | null | undefined): Look {
  switch (state) {
    case 'RUNNING': return { tone: 'brand', icon: 'zap', word: 'Running' };
    case 'QUEUED': return { tone: 'brand', icon: 'zap', word: 'Running' };
    case 'PAUSED': return { tone: 'warn', icon: 'pause', word: 'Paused' };
    case 'PENDING': return { tone: 'neutral', icon: 'clock', word: 'Waiting' };
    case 'COMPLETED': return { tone: 'ok', icon: 'checkCircle', word: 'Completed' };
    case 'FAILED': return { tone: 'crit', icon: 'xCircle', word: 'Failed' };
    case 'SKIPPED': return { tone: 'neutral', icon: 'skip', word: 'Skipped' };
    case 'CANCELLED': return { tone: 'neutral', icon: 'stop', word: 'Cancelled' };
    default: return { tone: 'neutral', icon: 'info', word: String(state ?? '') };
  }
}

/** The word a status chip says. */
export function statusWord(status: string | null | undefined): string {
  switch (status) {
    case 'RUNNING': return 'Running';
    case 'PAUSED': return 'Paused';
    case 'CANCELLED': return 'Cancelled';
    case 'COMPLETED': return 'Completed';
    case 'FAILED': return 'Failed';
    default: return String(status ?? '');
  }
}

/** A refusal's sentence from an error answer (4xx with the envelope), or the fallback. */
export function refusalOf(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string } } | null;
  return e?.error?.message || fallback;
}
