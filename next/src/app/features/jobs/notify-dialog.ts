import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Icon } from '../../shared/ui/icon';

export interface NotifyData {
  jobId: number;
  jobName: string;
  completeJob?: boolean;
  failJob?: boolean;
  skipJob?: boolean;
}

/**
 * Just the three email switches, reachable from the row.
 *
 * Changing who gets told a job failed should not mean opening the whole job form and picking
 * a way past the schedule to find three checkboxes.
 */
@Component({
  selector: 'app-notify-dialog',
  imports: [FormDialog, Icon],
  template: `
    <app-form-dialog
        heading="Email notifications"
        [subtitle]="'Who hears about ' + data.jobName + ', and when.'"
        confirmLabel="Save"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <div class="space-y-1">
        @for (option of options; track option.key) {
          <label class="notify-row">
            <input type="checkbox" class="mt-0.5"
                   [checked]="state()[option.key]"
                   (change)="toggle(option.key, $any($event.target).checked)" />
            <app-icon [name]="option.icon" [class]="option.intent" size="1em" class="mt-0.5 shrink-0" />
            <span class="min-w-0">
              <span class="block text-sm">{{ option.label }}</span>
              <span class="block text-xs text-[color:var(--text-muted)] leading-snug mt-0.5">
                {{ option.hint }}
              </span>
            </span>
          </label>
        }
      </div>

      @if (!anyOn()) {
        <p class="field-note text-[color:var(--text-muted)] flex items-start gap-1.5 mt-3">
          <app-icon name="info" size="0.9em" class="mt-px shrink-0" />
          <span>With all three off, nothing is emailed about this job — it will only be visible here.</span>
        </p>
      }
    </app-form-dialog>
  `,
})
export class NotifyDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<NotifyData>(DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);

  readonly options = [
    { key: 'completeJob' as const, label: 'When it completes', icon: 'checkCircle',
      intent: 'icon-ok', hint: 'A run finished without error.' },
    { key: 'failJob' as const, label: 'When it fails', icon: 'xCircle',
      intent: 'icon-crit', hint: 'A run ended in an error. Usually the one worth having on.' },
    { key: 'skipJob' as const, label: 'When a run is skipped', icon: 'alert',
      intent: 'icon-warn', hint: 'A scheduled run was skipped rather than started.' },
  ];

  readonly state = signal({
    completeJob: !!this.data.completeJob,
    failJob: !!this.data.failJob,
    skipJob: !!this.data.skipJob,
  });

  anyOn(): boolean {
    const s = this.state();
    return s.completeJob || s.failJob || s.skipJob;
  }

  toggle(key: 'completeJob' | 'failJob' | 'skipJob', on: boolean): void {
    this.state.update(s => ({ ...s, [key]: on }));
  }

  /**
   * updateSourceJob replaces the whole job, so the current record is read first and only the
   * three flags are changed. Sending a partial payload would blank the schedule.
   */
  save(): void {
    this.saving.set(true);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: this.data.jobId } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.saving.set(false);
          this.toast.error(response.message || 'That job could not be read.');
          return;
        }
        const job = response.data;
        const payload: any = {
          jobId: job.jobId,
          jobName: job.jobName,
          taskDetail: { taskDetailId: job.taskDetail?.taskDetailId },
          execution: job.execution,
          priority: job.priority,
          jobStatus: job.jobStatus,
          ...this.state(),
        };
        if (job.scheduler) {
          payload.schedulers = [{
            startDate: job.scheduler.startDate,
            endDate: job.scheduler.endDate,
            startTime: job.scheduler.startTime,
            frequency: job.scheduler.frequency,
            intervalValue: job.scheduler.intervalValue,
            daysOfWeek: job.scheduler.daysOfWeek,
            dayOfMonth: job.scheduler.dayOfMonth,
          }];
        }
        this.http.put<ApiResponse>(`${API_BASE}/sourceJob.json/updateSourceJob`, payload).subscribe({
          next: saved => {
            this.saving.set(false);
            if (saved.status === API_SUCCESS) {
              this.toast.success(`Notifications updated for ${job.jobName}.`);
              this.ref.close(true);
            } else { this.toast.error(saved.message); }
          },
          error: err => {
            this.saving.set(false);
            this.toast.error(err?.error?.message || 'The notifications could not be saved.');
          },
        });
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'That job could not be read.');
      },
    });
  }
}
