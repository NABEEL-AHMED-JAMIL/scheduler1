import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { QueryDefinition, QuerySchedule } from './types';

@Component({
  selector: 'app-query-schedule-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit schedule' : 'Schedule query'"
        [subtitle]="'Runs ' + data.query.queryName + ' on a fixed interval and writes the result to storage.'"
        [confirmLabel]="isEdit() ? 'Save schedule' : 'Schedule'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <app-field label="Run every" for="intervalMinutes" [required]="true"
                   [control]="form.get('intervalMinutes')" [submitted]="submitted()"
                   hint="Minutes between runs. The first run happens one interval from now."
                   [errorMessages]="{ min: 'Use at least one minute between runs.' }">
          <input id="intervalMinutes" type="number" min="1" class="input"
                 formControlName="intervalMinutes" placeholder="60" />
        </app-field>

        <div class="form-section">
          <div class="form-section-title">Output</div>
          <div class="form-grid">
            <app-field label="Bucket" for="outputBucket" [required]="true"
                       [control]="form.get('outputBucket')" [submitted]="submitted()"
                       hint="Storage connection alias to write into.">
              <input id="outputBucket" class="input" formControlName="outputBucket" />
            </app-field>

            <app-field label="Prefix" for="outputPrefix"
                       [control]="form.get('outputPrefix')" [submitted]="submitted()"
                       hint="Folder within the bucket.">
              <input id="outputPrefix" class="input mono" formControlName="outputPrefix"
                     placeholder="reports/daily" />
            </app-field>
          </div>

          <app-field label="File name template" for="outputFileNameTemplate"
                     [control]="form.get('outputFileNameTemplate')" [submitted]="submitted()"
                     hint="Without a timestamp placeholder each run overwrites the last file.">
            <input id="outputFileNameTemplate" class="input mono"
                   formControlName="outputFileNameTemplate"
                   placeholder="orders-{timestamp}.csv" />
          </app-field>
        </div>

        <app-field label="Status" for="scheduleStatus" [control]="form.get('status')"
                   [submitted]="submitted()"
                   hint="Inactive keeps the schedule but stops it running.">
          <select id="scheduleStatus" class="input" formControlName="status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class QueryScheduleDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ query: QueryDefinition; schedule?: QuerySchedule }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.schedule);

  readonly form: FormGroup = this.fb.group({
    scheduleId: [this.data.schedule?.scheduleId ?? null],
    queryId: [this.data.query.queryId],
    databaseConnectionProfileId: [this.data.query.databaseConnectionProfileId],
    intervalMinutes: [this.data.schedule?.intervalMinutes ?? 60,
      [Validators.required, Validators.min(1)]],
    outputBucket: [this.data.schedule?.outputBucket ?? '', Validators.required],
    outputPrefix: [this.data.schedule?.outputPrefix ?? ''],
    outputFileNameTemplate: [this.data.schedule?.outputFileNameTemplate ?? ''],
    status: [this.data.schedule?.status ?? 'Active'],
  });

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    const payload = this.form.getRawValue();
    payload.intervalMinutes = Number(payload.intervalMinutes);
    const req = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/queryEngine.json/schedules/update`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/queryEngine.json/schedules/add`, payload);
    req.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.ref.close(true); }
        else this.toast.error(r.message);
      },
      error: e => { this.saving.set(false); this.toast.error(e?.error?.message || 'The schedule could not be saved.'); },
    });
  }
}
