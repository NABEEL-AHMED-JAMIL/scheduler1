import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';
import { refusalOf } from '../../../shared/ui/blob-refusal';
import { DatasetFormat, RunOutput, StepLogLine, StepTimeline, attachmentName, engineTimeline, outputsOf, stepStillGoing } from './run-steps.model';

/** Run statuses after which nothing about the run's steps changes again. */
const TERMINAL = ['Completed', 'Failed', 'Interrupt', 'Skip', 'Missed', 'Stop'];

/**
 * One run's steps, outputs and step lines, read once for the whole run page (UX review 2026-10-12, run page fix): the
 * summary strip, the Steps table, the Map, the AI answers, the Outputs and the Log all read the same answers. Before,
 * each tab drew its own copy of the steps card and read the run again.
 *
 * Provided by the run page. A legacy run -- one the step engine did not take -- has no timeline (null) and `legacy`
 * true, and every part that needs steps draws nothing for it.
 */
@Injectable()
export class RunTimelineStore implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly storage = inject(StorageService);

  readonly timeline = signal<StepTimeline | null>(null);
  /** The run is a legacy one, or its steps could not be read: there is nothing step-shaped to draw. */
  readonly legacy = signal(false);
  /** The steps could not be read (the next read of the page tries again). */
  readonly readError = signal(false);
  /** What the shown attempt put out (runOutputs); null until read, 'error' when it could not be. */
  readonly outputs = signal<RunOutput[] | 'error' | null>(null);
  readonly outputList = computed(() => { const o = this.outputs(); return Array.isArray(o) ? o : []; });
  /** Each step's own lines by its step execution, read once; 'error' when they could not be read. */
  readonly lines = signal<Map<number, StepLogLine[] | 'error'>>(new Map());
  /**
   * Owner 2026-10-27: another attempt is being read; the Steps table keeps the shown attempt's rows under a blur until
   * it lands instead of showing the old attempt as though it were the new one.
   */
  readonly switching = signal(false);
  /** The download in flight ("d<runDatasetId>" or "o<runOutputId>"), so its button cannot be pressed twice. */
  readonly busy = signal('');

  private jobQueueId: string | null = null;
  private requestedAttempt: number | null = null;
  private settled = false;
  private request?: Subscription;
  private requestFor: number | null | undefined;
  private outputsRequest?: Subscription;
  private readonly pending = new Set<number>();

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.outputsRequest?.unsubscribe();
  }

  /**
   * Reads the run's steps (the page calls this with each of its own reads, so a running run's steps move with its
   * entries). A run whose steps have all settled is not read again; another run starts over.
   */
  load(jobQueueId: string): void {
    if (this.jobQueueId !== jobQueueId) {
      this.jobQueueId = jobQueueId;
      this.settled = false;
      this.requestedAttempt = null;
      this.timeline.set(null);
      this.legacy.set(false);
      this.readError.set(false);
      this.outputs.set(null);
      this.lines.set(new Map());
      this.request?.unsubscribe();
    }
    if (this.settled) return;
    const attempt = this.requestedAttempt;
    if (this.request && !this.request.closed && this.requestFor === attempt) return;
    const params: Record<string, string> = { jobQueueId };
    if (attempt !== null) params['attempt'] = String(attempt);
    this.request?.unsubscribe();
    this.requestFor = attempt;
    this.request = this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/stepExecutions`, { params }).subscribe({
      next: response => {
        this.switching.set(false);
        this.readError.set(response.status !== API_SUCCESS);
        if (response.status !== API_SUCCESS) return;
        const timeline = engineTimeline(response.data);
        if (!timeline) {
          this.settled = true;
          this.legacy.set(true);
          return;
        }
        const going = timeline.steps.some(step => stepStillGoing(step.status));
        this.settled = !going && TERMINAL.includes(timeline.runStatus ?? '');
        // A step that is still going gains lines: its cached ones are dropped, so they are read again.
        const stale = timeline.steps.filter(step => stepStillGoing(step.status) && step.stepExecutionId !== null)
          .map(step => step.stepExecutionId!);
        if (stale.length) {
          this.lines.update(map => {
            const next = new Map(map);
            stale.forEach(id => next.delete(id));
            return next;
          });
        }
        this.timeline.set(timeline);
        this.loadOutputs(jobQueueId, timeline.attempt);
      },
      // The run's entries are the point of the page; losing the steps must not break it.
      error: () => { this.switching.set(false); this.readError.set(true); },
    });
  }

  /**
   * Try again after the steps could not be read (owner 2026-10-27: the tabs that need them say so instead of "Reading
   * the run's steps…" for ever). Clears the failure first so the tabs show loading again while it reads.
   */
  retry(): void {
    if (!this.jobQueueId) return;
    this.readError.set(false);
    this.load(this.jobQueueId);
  }

  /** Try again on the outputs alone, after they could not be read (the Steps table's Output column says so). */
  retryOutputs(): void {
    const timeline = this.timeline();
    if (!this.jobQueueId || !timeline) return;
    this.outputs.set(null);
    this.loadOutputs(this.jobQueueId, timeline.attempt);
  }

  /** Another attempt of a retried run; null follows the latest. */
  chooseAttempt(attempt: number | null): void {
    if (!this.jobQueueId) return;
    this.requestedAttempt = attempt;
    this.settled = false;
    if (this.timeline()) this.switching.set(true);
    this.lines.set(new Map());
    this.outputs.set(null);
    this.load(this.jobQueueId);
  }

  /** The shown attempt's outputs, re-read with the timeline while the run is going: a step records them as it ends. */
  private loadOutputs(jobQueueId: string, attempt: number): void {
    const params: Record<string, string> = { jobQueueId };
    if (Number.isInteger(attempt)) params['attempt'] = String(attempt);
    this.outputsRequest?.unsubscribe();
    this.outputsRequest = this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/runOutputs`, { params }).subscribe({
      next: response => this.outputs.set((response.status === API_SUCCESS ? outputsOf(response.data) : null) ?? 'error'),
      error: () => this.outputs.set('error'),
    });
  }

  /** A step's own lines, read once (sourceJob.json/stepLogs). */
  readLines(stepExecutionId: number | null | undefined): void {
    if (stepExecutionId === null || stepExecutionId === undefined) return;
    if (this.lines().has(stepExecutionId) || this.pending.has(stepExecutionId)) return;
    this.pending.add(stepExecutionId);
    this.http.get<ApiResponse<{ lines?: StepLogLine[] }>>(`${API_BASE}/sourceJob.json/stepLogs`,
      { params: { stepExecutionId: String(stepExecutionId) } }).subscribe({
      next: response => {
        this.pending.delete(stepExecutionId);
        const lines = response.status === API_SUCCESS ? (response.data?.lines ?? []) : 'error';
        this.lines.update(map => new Map(map).set(stepExecutionId, lines));
      },
      error: () => {
        this.pending.delete(stepExecutionId);
        this.lines.update(map => new Map(map).set(stepExecutionId, 'error'));
      },
    });
  }

  /**
   * A dataset in one format. Fetched through HttpClient, so the token goes with it, and saved from a blob under the
   * name the server gives (Content-Disposition, exposed by CORS). A refusal (404, 410, 400) is JSON inside the blob.
   */
  downloadDataset(runDatasetId: number, format: DatasetFormat, name: string): void {
    if (this.busy()) return;
    this.busy.set(`d${runDatasetId}`);
    this.http.get(`${API_BASE}/sourceJob.json/runDataset`, {
      params: { runDatasetId: String(runDatasetId), format }, responseType: 'blob', observe: 'response',
    }).subscribe({
      next: response => {
        this.busy.set('');
        if (!response.body) { this.toast.error('The server returned an empty file.'); return; }
        const served = attachmentName(response.headers.get('content-disposition'));
        StorageService.saveBlob(response.body, served || `${name.replace(/\.(csv|jsonl?|parquet|pdf)$/i, '')}.${format}`);
      },
      error: async err => {
        this.busy.set('');
        this.toast.error(await refusalOf(err) || `${name} could not be downloaded.`);
      },
    });
  }

  /** A bucket upload, from storage, exactly as the object browser downloads one. */
  downloadUpload(output: RunOutput): void {
    if (!output.bucket || !output.key || this.busy()) return;
    this.busy.set(`o${output.runOutputId}`);
    this.storage.download(output.bucket, output.key).subscribe({
      next: blob => {
        this.busy.set('');
        StorageService.saveBlob(blob, StorageService.fileNameOf(output.key!));
      },
      error: async err => {
        this.busy.set('');
        this.toast.error(await refusalOf(err) || `${output.name} could not be downloaded.`);
      },
    });
  }
}
