import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { DataText } from '../../../shared/ui/data-text';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { StepsApi } from './steps.service';
import { AppLoading, InlineStatus, loadErrorText } from '../../../shared/ui/loading';
import { StepLogLine, Timeline, TimelineStep, durationText, errorText, runFinished } from './steps.model';

export interface RunDrawerData {
  jobQueueId: number;
  jobId: number;
  jobName: string;
}

/** How often an unfinished run is read again. */
export const FOLLOW_MS = 1500;

/**
 * What Run now started (MIG-249), followed as it runs: the run's status and each step's -- how long it took, rows in
 * and out, tries, its status line or error, the datasets it wrote -- with each step's own log a click away. The whole
 * Executions screen, attempts and all, is MIG-251's; this is the builder's quick look.
 */
@Component({
  selector: 'app-run-drawer',
  imports: [SidePanel, Icon, StatusPill, DataText, ServerTimePipe, RouterLink, AppLoading, InlineStatus],
  template: `
    <app-side-panel [heading]="'Run #' + data.jobQueueId" [subtitle]="data.jobName">
      <div class="flex flex-col gap-3 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-[color:var(--text-secondary)]">Run</span>
          <!-- Owner 2026-10-27: the run's status once it has been read, not an assumed "Queue" before. -->
          @if (timeline(); as t) { <app-status [label]="t.runStatus || 'Queue'" /> }
          @else if (!error()) { <app-loading shape="inline" label="Reading the run…" /> }
          @if (following()) {
            <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1.5" role="status">
              <app-icon name="refresh" class="spin" size="0.9em" />Following the run…
            </span>
          }
          @if ((timeline()?.attempts?.length ?? 0) > 1) {
            <span class="text-xs text-[color:var(--text-muted)] ml-auto">Attempt {{ timeline()!.attempt }} of {{ timeline()!.attempts.length }}</span>
          }
        </div>
        @if (error()) {
          <p class="text-sm text-crit-500 flex flex-wrap items-center gap-2" role="alert">{{ error() }}
            <button type="button" class="btn btn-default btn-sm" (click)="retry()"><app-icon name="refresh" />Try again</button></p>
        }
        @if (timeline(); as t) {
          @if (t.legacy) {
            <p class="text-xs text-[color:var(--text-muted)]" role="note">This run took the legacy path: its worker ran it, so it shows as one step.</p>
          }
          <ol class="list-none m-0 p-0 min-w-0" aria-label="Steps of this run">
            @for (s of t.steps; track s.index) {
              <li class="run-step" [attr.data-run-step]="s.key">
                <span class="step-index">{{ s.index + 1 }}</span>
                <div class="min-w-0">
                  <div class="text-sm font-medium">{{ s.key }} <span class="mono text-xs text-[color:var(--text-muted)]">{{ s.task }}</span></div>
                  <div class="text-xs text-[color:var(--text-secondary)] mt-0.5 flex flex-wrap gap-x-3">
                    @if (s.durationMs != null) { <span>{{ duration(s.durationMs) }}</span> }
                    @if (s.recordsIn != null || s.recordsOut != null) { <span>{{ s.recordsIn ?? 0 }} in → {{ s.recordsOut ?? 0 }} out</span> }
                    @if ((s.tries ?? 0) > 1) { <span>{{ s.tries }} tries</span> }
                    @if (s.startedAt) { <span>{{ s.startedAt | serverTime:'timeSec' }}</span> }
                  </div>
                  @if (s.statusMessage) { <app-data-text class="text-xs block mt-1" [value]="s.statusMessage" label="Status" [lines]="2" /> }
                  @if (errorOf(s); as e) { <app-data-text class="text-xs text-crit-500 block mt-1" [value]="e" label="Error" [lines]="3" /> }
                  @for (d of s.datasets ?? []; track d.runDatasetId) {
                    <div class="text-xs text-[color:var(--text-muted)] mt-1 min-w-0">
                      <app-data-text [value]="d.name + ': ' + (d.rowCount ?? 0) + ' row(s) · ' + d.columns.join(', ')" label="Dataset" />
                    </div>
                  }
                  @if (s.stepExecutionId) {
                    <button type="button" class="link-inline text-xs mt-1" (click)="toggleLog(s)"
                            [attr.aria-expanded]="logOpen() === s.stepExecutionId">{{ logOpen() === s.stepExecutionId ? 'Hide log' : 'Show log' }}</button>
                    @if (logOpen() === s.stepExecutionId) {
                      <div class="run-log mt-1.5">
                        @if (logError()) {
                          <app-inline-status [error]="logError()" (retry)="readLog(s.stepExecutionId!)" />
                        } @else if (logLoading()) {
                          <app-loading shape="inline" label="Loading the log…" />
                        } @else {
                        @for (line of logLines(); track $index) {
                          <div><span class="text-[color:var(--text-muted)]">{{ line.loggedAt | serverTime:'timeSec' }} {{ line.level }}</span> <app-data-text [value]="line.message ?? ''" label="Log line" /></div>
                        } @empty { <span class="text-[color:var(--text-muted)]">No lines.</span> }
                        }
                      </div>
                    }
                  }
                </div>
                <app-status [label]="s.status || 'Queue'" />
              </li>
            } @empty {
              <li class="text-sm text-[color:var(--text-muted)] py-2">Queued: the steps appear once the run starts.</li>
            }
          </ol>
        } @else if (!error()) {
          <p class="text-sm text-[color:var(--text-muted)]">Waiting for the run to start…</p>
        }
      </div>
      <ng-container foot>
        <a class="btn btn-default btn-sm" [routerLink]="['/pipelines/schedules', data.jobId, 'executions']" (click)="ref.close()">
          <app-icon name="history" />Executions
        </a>
        <span class="flex-1"></span>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class RunDrawer {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<RunDrawerData>(DIALOG_DATA);
  private readonly api = inject(StepsApi);

  readonly timeline = signal<Timeline | null>(null);
  readonly following = signal(true);
  readonly error = signal('');
  readonly logOpen = signal<number | null>(null);
  readonly logLines = signal<StepLogLine[]>([]);
  readonly logLoading = signal(false);
  /** Owner 2026-10-27: a log that could not be read says so (it read as "No lines."). */
  readonly logError = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** A run still Queue answers "not found" for a moment on some paths; a few misses are waited out. */
  private misses = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.stopped = true; if (this.timer) clearTimeout(this.timer); });
    this.read();
  }

  read(): void {
    this.api.timeline(this.data.jobQueueId).subscribe({
      next: r => {
        if (this.stopped) return;
        if (r.status === API_SUCCESS && r.data) {
          this.misses = 0;
          this.error.set('');
          this.timeline.set(r.data);
          const done = runFinished(r.data.runStatus) && r.data.steps.every(s => runFinished(s.status));
          if (done) { this.following.set(false); return; }
        } else if (++this.misses > 5) {
          this.following.set(false);
          this.error.set(r.message || 'The run could not be read.');
          return;
        }
        this.next();
      },
      error: () => { if (!this.stopped && ++this.misses <= 5) this.next(); else { this.following.set(false); this.error.set('The run could not be read.'); } },
    });
  }

  /** Try again after the run could not be read: follows it again from the start. */
  retry(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.misses = 0;
    this.error.set('');
    this.following.set(true);
    this.read();
  }

  private next(): void {
    this.timer = setTimeout(() => { this.timer = null; this.read(); }, FOLLOW_MS);
  }

  duration(ms: number | null | undefined): string { return durationText(ms); }

  errorOf(step: TimelineStep): string { return errorText(step.error); }

  toggleLog(step: TimelineStep): void {
    if (!step.stepExecutionId) return;
    if (this.logOpen() === step.stepExecutionId) { this.logOpen.set(null); return; }
    this.logOpen.set(step.stepExecutionId);
    this.readLog(step.stepExecutionId);
  }

  readLog(stepExecutionId: number): void {
    this.logLines.set([]);
    this.logError.set('');
    this.logLoading.set(true);
    this.api.stepLog(stepExecutionId).subscribe({
      next: r => {
        if (this.logOpen() !== stepExecutionId) return;
        this.logLoading.set(false);
        if (r.status !== API_SUCCESS) { this.logError.set(loadErrorText(r, 'The log could not be read.')); return; }
        this.logLines.set(r.data?.lines ?? []);
      },
      error: err => {
        if (this.logOpen() !== stepExecutionId) return;
        this.logLoading.set(false);
        this.logError.set(loadErrorText(err, 'The log could not be read.'));
      },
    });
  }
}
