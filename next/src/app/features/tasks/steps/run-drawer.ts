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
  imports: [SidePanel, Icon, StatusPill, DataText, ServerTimePipe, RouterLink],
  template: `
    <app-side-panel [heading]="'Run #' + data.jobQueueId" [subtitle]="data.jobName">
      <div class="flex flex-col gap-3 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-[color:var(--text-secondary)]">Run</span>
          <app-status [label]="timeline()?.runStatus || 'Queue'" />
          @if (following()) {
            <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1.5" role="status">
              <app-icon name="refresh" class="spin" size="0.9em" />Following the run…
            </span>
          }
          @if ((timeline()?.attempts?.length ?? 0) > 1) {
            <span class="text-xs text-[color:var(--text-muted)] ml-auto">Attempt {{ timeline()!.attempt }} of {{ timeline()!.attempts.length }}</span>
          }
        </div>
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
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
                        @for (line of logLines(); track $index) {
                          <div><span class="text-[color:var(--text-muted)]">{{ line.loggedAt | serverTime:'timeSec' }} {{ line.level }}</span> <app-data-text [value]="line.message ?? ''" label="Log line" /></div>
                        } @empty { <span class="text-[color:var(--text-muted)]">{{ logLoading() ? 'Reading…' : 'No lines.' }}</span> }
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
        <a class="btn btn-ghost btn-sm" [routerLink]="['/pipelines/schedules', data.jobId, 'executions']" (click)="ref.close()">
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

  private next(): void {
    this.timer = setTimeout(() => { this.timer = null; this.read(); }, FOLLOW_MS);
  }

  duration(ms: number | null | undefined): string { return durationText(ms); }

  errorOf(step: TimelineStep): string { return errorText(step.error); }

  toggleLog(step: TimelineStep): void {
    if (!step.stepExecutionId) return;
    if (this.logOpen() === step.stepExecutionId) { this.logOpen.set(null); return; }
    this.logOpen.set(step.stepExecutionId);
    this.logLines.set([]);
    this.logLoading.set(true);
    this.api.stepLog(step.stepExecutionId).subscribe({
      next: r => { this.logLoading.set(false); this.logLines.set(r.status === API_SUCCESS ? r.data?.lines ?? [] : []); },
      error: () => this.logLoading.set(false),
    });
  }
}
