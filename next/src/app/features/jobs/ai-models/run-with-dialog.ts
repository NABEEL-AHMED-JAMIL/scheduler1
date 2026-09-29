import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { AiModelPicks } from './ai-model-picks';
import { AiStepChoice, ModelPicks, choiceBody, picksOf, stepsOf } from './ai-model-choice';

export interface RunWithData {
  jobId: number;
  jobName: string;
}

/**
 * MIG-251: "Run with…" -- Run now, with the model each AI step runs on chosen for this run only
 * (sourceJob.json/runSourceJobWith, MIG-242's Core part). Each step starts from what it runs on today: the schedule's
 * setting, else its default. Core makes Run now's checks too, so a refusal is said here and the dialog stays open.
 *
 * A job whose pipeline has no AI step has nothing to choose: the dialog says so and offers no Run, rather than a second
 * Run now under another name.
 */
@Component({
  selector: 'app-run-with-dialog',
  imports: [FormDialog, Icon, AiModelPicks],
  template: `
    <app-form-dialog
        heading="Run with…"
        [subtitle]="'Run ' + data.jobName + ' now, choosing the model each AI step runs on for this run only.'"
        confirmLabel="Run" busyLabel="Starting…"
        [cancelLabel]="steps().length ? 'Cancel' : 'Close'"
        [showConfirm]="steps().length > 0"
        [saving]="running()"
        (cancelled)="ref.close(false)" (confirmed)="run()">
      @if (loading()) {
        <p class="flex items-center gap-2 text-sm text-[color:var(--text-muted)]" role="status">
          <app-icon name="refresh" class="spin" />Reading this job's AI steps…
        </p>
      } @else if (problem()) {
        <p class="flex items-start gap-2 text-sm text-crit-500" role="alert">
          <app-icon name="alert" class="mt-0.5 shrink-0" />{{ problem() }}
        </p>
      } @else if (!steps().length) {
        <p class="flex items-start gap-2 text-sm text-[color:var(--text-secondary)]">
          <app-icon name="info" class="mt-0.5 shrink-0 icon-info" />
          <span>This job's pipeline has no AI steps, so there is no model to choose. Run now runs it as it is.</span>
        </p>
      } @else {
        <app-ai-model-picks [steps]="steps()" [(picks)]="picks" idPrefix="run-with" />
        <p class="field-note text-[color:var(--text-muted)] mt-4">
          The schedule keeps its own setting; the next scheduled run is not changed.
        </p>
      }
    </app-form-dialog>
  `,
})
export class RunWithDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<RunWithData>(DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly problem = signal('');
  readonly steps = signal<AiStepChoice[]>([]);
  readonly picks = signal<ModelPicks>({});
  readonly running = signal(false);
  readonly hasSteps = computed(() => this.steps().length > 0);

  constructor() {
    this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/aiModelChoice`, { params: { jobId: String(this.data.jobId) } })
      .subscribe({
        next: response => {
          this.loading.set(false);
          if (response.status !== API_SUCCESS) {
            this.problem.set(response.message || 'This job\'s AI steps could not be read.');
            return;
          }
          const steps = stepsOf(response.data);
          this.steps.set(steps);
          this.picks.set(picksOf(steps));
        },
        error: err => {
          this.loading.set(false);
          this.problem.set(err?.error?.message || 'This job\'s AI steps could not be read.');
        },
      });
  }

  run(): void {
    if (this.running() || !this.hasSteps()) return;
    this.running.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/sourceJob.json/runSourceJobWith`, choiceBody(this.data.jobId, this.picks())).subscribe({
      next: response => {
        this.running.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(`${this.data.jobName} queued to run with the models chosen.`);
          this.ref.close(true);
        } else {
          this.toast.error(response.message || 'The run could not be started.');
        }
      },
      error: err => {
        this.running.set(false);
        this.toast.error(err?.error?.message || 'The run could not be started.');
      },
    });
  }
}
