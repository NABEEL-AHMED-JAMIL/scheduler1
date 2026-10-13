import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { AiModelPicks } from './ai-model-picks';
import { AiStepChoice, ModelPicks, choiceBody, picksOf, stepsOf } from './ai-model-choice';
import { RunParameterFields } from '../run-parameters/run-parameter-fields';
import { ParameterValues, RunParameter, initialValues, parametersOf, valueProblems, valuesBody } from '../run-parameters/run-parameters';

export interface RunWithData {
  jobId: number;
  jobName: string;
}

/**
 * MIG-347: "Run with…" also gives the run its pipeline's parameters -- typed inputs starting at their defaults, checked as
 * the server checks them (sourceJob.json/runSourceJobWith's parameters). A pipeline with parameters and no AI step is run
 * with values alone; one with both shows both.
 *
 * MIG-251: "Run with a different AI model…" (was "Run with…") -- Run now, with the model each AI step runs on chosen for this run only
 * (sourceJob.json/runSourceJobWith, MIG-242's Core part). Each step starts from what it runs on today: the schedule's
 * setting, else its default. Core makes Run now's checks too, so a refusal is said here and the dialog stays open.
 *
 * A job whose pipeline has no AI step has nothing to choose: the dialog says so and offers no Run, rather than a second
 * Run now under another name.
 */
@Component({
  selector: 'app-run-with-dialog',
  imports: [FormDialog, Icon, AiModelPicks, RunParameterFields],
  template: `
    <app-form-dialog
        [heading]="parameters().length ? 'Run with…' : 'Run with a different AI model'"
        [subtitle]="subtitle()"
        confirmLabel="Run" busyLabel="Starting…"
        [cancelLabel]="hasChoice() ? 'Cancel' : 'Close'"
        [showConfirm]="hasChoice()"
        [confirmDisabled]="hasProblems()"
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
      } @else if (!hasChoice()) {
        <p class="flex items-start gap-2 text-sm text-[color:var(--text-secondary)]">
          <app-icon name="info" class="mt-0.5 shrink-0 icon-info" />
          <span>This job's pipeline has no AI steps, so there is no model to choose. Run now runs it as it is.</span>
        </p>
      } @else {
        @if (parameters().length) {
          <h3 class="text-sm font-semibold m-0 mb-2">Parameters</h3>
          <app-run-parameter-fields [parameters]="parameters()" [(values)]="values" idPrefix="run-with-param" />
        }
        @if (steps().length) {
          @if (parameters().length) { <h3 class="text-sm font-semibold mt-5 mb-2">AI models</h3> }
          <app-ai-model-picks [steps]="steps()" [(picks)]="picks" idPrefix="run-with" />
        }
        <p class="field-note text-[color:var(--text-muted)] mt-4">
          For this run only: the schedule keeps its own settings; the next scheduled run is not changed.
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
  /** MIG-347: the pipeline's run parameters and this run's values. */
  readonly parameters = signal<RunParameter[]>([]);
  readonly values = signal<ParameterValues>({});
  readonly hasChoice = computed(() => this.steps().length > 0 || this.parameters().length > 0);
  readonly hasProblems = computed(() => Object.keys(valueProblems(this.parameters(), this.values())).length > 0);
  readonly subtitle = computed(() => this.parameters().length
    ? `Run ${this.data.jobName} now with the values${this.steps().length ? ' and models' : ''} below, for this run only.`
    : `Run ${this.data.jobName} now, choosing the model each AI step runs on for this run only.`);

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
          const parameters = parametersOf(response.data);
          this.parameters.set(parameters);
          this.values.set(initialValues(parameters));
        },
        error: err => {
          this.loading.set(false);
          this.problem.set(err?.error?.message || 'This job\'s AI steps could not be read.');
        },
      });
  }

  run(): void {
    if (this.running() || !this.hasChoice() || this.hasProblems()) return;
    this.running.set(true);
    const body: Record<string, unknown> = { ...choiceBody(this.data.jobId, this.picks()) };
    const parameters = valuesBody(this.parameters(), this.values());
    if (parameters) body['parameters'] = parameters;
    this.http.post<ApiResponse>(`${API_BASE}/sourceJob.json/runSourceJobWith`, body).subscribe({
      next: response => {
        this.running.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(this.parameters().length ? `${this.data.jobName} queued to run with the values chosen.`
            : `${this.data.jobName} queued to run with the models chosen.`);
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
