import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { RetentionApi } from './retention.api';
import { RetentionHold } from './retention.model';

export interface RetentionHoldPanelData {
  tenantId: number | null;
}

type Scope = 'WORKSPACE' | 'PIPELINE' | 'RUN';

/**
 * MIG-354: a legal hold, placed over the right of the page -- the whole workspace, one pipeline (its runs, their outputs
 * and logs, its forms' submissions and the files its runs took), or one run -- with the reason it is placed (who asked,
 * and what for). While it is on, retention removes nothing in its scope. The hold and who placed it are recorded.
 */
@Component({
  selector: 'app-retention-hold-panel',
  imports: [SidePanel, Icon],
  template: `
    <app-side-panel heading="Place a legal hold" subtitle="Nothing in its scope is removed while it is on" data-test="retention-hold-panel">
      <div class="form-lock flex flex-col gap-4">
        <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="hold-scope-label">
          <p id="hold-scope-label" class="label m-0">Hold</p>
          <label class="flex items-start gap-2 text-sm"><input type="radio" name="hold-scope" class="mt-0.5" [checked]="scope() === 'WORKSPACE'"
                 (change)="scope.set('WORKSPACE')" data-test="hold-workspace" />
            <span>The whole workspace<span class="block field-note text-[color:var(--text-muted)]">Every kind of data; no pass removes anything.</span></span></label>
          <label class="flex items-start gap-2 text-sm"><input type="radio" name="hold-scope" class="mt-0.5" [checked]="scope() === 'PIPELINE'"
                 (change)="scope.set('PIPELINE')" data-test="hold-pipeline" />
            <span>One pipeline<span class="block field-note text-[color:var(--text-muted)]">Its runs' outputs and logs, its forms' submissions and the files its runs took.</span></span></label>
          <label class="flex items-start gap-2 text-sm"><input type="radio" name="hold-scope" class="mt-0.5" [checked]="scope() === 'RUN'"
                 (change)="scope.set('RUN')" data-test="hold-run" />
            <span>One run<span class="block field-note text-[color:var(--text-muted)]">Its outputs, datasets and logs.</span></span></label>
        </div>
        @if (scope() === 'PIPELINE') {
          <div>
            <label class="label" for="hold-job">Pipeline</label>
            <select id="hold-job" class="input" [value]="jobId() ?? ''" (change)="jobId.set(+$any($event.target).value || null)" data-test="hold-job">
              <option value="">Choose a pipeline</option>
              @for (p of pipelines(); track p.jobId) { <option [value]="p.jobId">{{ p.jobName }} (#{{ p.jobId }})</option> }
            </select>
          </div>
        }
        @if (scope() === 'RUN') {
          <div>
            <label class="label" for="hold-run">Run number</label>
            <input id="hold-run" class="input" inputmode="numeric" [value]="runId() ?? ''" (input)="runId.set(+$any($event.target).value || null)"
                   placeholder="e.g. 8209" data-test="hold-run-id" />
            <p class="field-note text-[color:var(--text-muted)]">The number on the run's page.</p>
          </div>
        }
        <div>
          <label class="label" for="hold-reason">Reason</label>
          <textarea id="hold-reason" class="input" rows="3" maxlength="500" [value]="reason()" (input)="reason.set($any($event.target).value)"
                    placeholder="Who asked for the hold, and what for" data-test="hold-reason"></textarea>
        </div>
        @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert" data-test="hold-error">{{ error() }}</p> }
      </div>
      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm ml-auto" [disabled]="!ready() || saving()" (click)="save()" data-test="hold-save">
          <app-icon name="lock" [busy]="saving()" />Place the hold
        </button>
      </div>
    </app-side-panel>
  `,
})
export class RetentionHoldPanel implements OnInit {
  readonly ref = inject<DialogRef<RetentionHold, RetentionHoldPanel>>(DialogRef);
  readonly data = inject<RetentionHoldPanelData>(DIALOG_DATA);
  private readonly api = inject(RetentionApi);

  readonly scope = signal<Scope>('WORKSPACE');
  readonly jobId = signal<number | null>(null);
  readonly runId = signal<number | null>(null);
  readonly reason = signal('');
  readonly pipelines = signal<{ jobId: number; jobName: string }[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly ready = computed(() => !!this.reason().trim()
    && (this.scope() === 'WORKSPACE' || (this.scope() === 'PIPELINE' && !!this.jobId()) || (this.scope() === 'RUN' && !!this.runId())));

  ngOnInit(): void {
    this.api.pipelines().subscribe({
      next: r => this.pipelines.set((r?.data ?? []).map(j => ({ jobId: j.jobId, jobName: j.jobName }))),
      error: () => this.pipelines.set([]),
    });
  }

  save(): void {
    if (!this.ready() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const scope = this.scope();
    this.api.placeHold(this.data.tenantId, {
      scope, jobId: scope === 'PIPELINE' ? this.jobId() : null, runId: scope === 'RUN' ? this.runId() : null, reason: this.reason().trim(),
    }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'The hold was not placed.'); return; }
        this.ref.close(r.data);
      },
      error: err => { this.saving.set(false); this.error.set(refusal(err, 'The hold was not placed.')); },
    });
  }
}
