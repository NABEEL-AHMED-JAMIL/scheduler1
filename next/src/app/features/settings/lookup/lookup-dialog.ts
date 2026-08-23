import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

export interface LookupData {
  lookupId?: number;
  lookupType: string;
  lookupValue: string;
  description?: string;
  parentLookupId?: number;
  encrypted?: boolean;
  children?: LookupData[];
  childCount?: number;
}

@Component({
  selector: 'app-lookup-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  template: `
    <app-form-dialog
        [heading]="heading()"
        [subtitle]="data.parent
          ? 'An entry under ' + data.parent.lookupType + '.'
          : 'Shared key and value data the forms and pipelines read from.'"
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <app-field label="Type" for="lookupType" [required]="true"
                   [control]="form.get('lookupType')" [submitted]="submitted()"
                   [hint]="data.parent ? 'A label for this entry.' : 'The key the application looks this up by.'">
          <input id="lookupType" class="input mono" formControlName="lookupType"
                 [placeholder]="data.parent ? 'Batch Email Delivery Pipeline' : 'PIPELINE_IDS'" />
        </app-field>

        <app-field label="Value" for="lookupValue" [required]="true"
                   [control]="form.get('lookupValue')" [submitted]="submitted()">
          <input id="lookupValue" class="input" formControlName="lookupValue"
                 [placeholder]="data.parent ? 'F76800' : 'Pipeline ids'" />
        </app-field>

        <app-field label="Description" for="lookupDescription"
                   [control]="form.get('description')" [submitted]="submitted()">
          <textarea id="lookupDescription" class="input" rows="2" formControlName="description"
                    placeholder="What this is for"></textarea>
        </app-field>

        <label class="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" class="mt-0.5" formControlName="encrypted" />
          <span>
            Store encrypted
            <span class="block text-xs text-[color:var(--text-muted)] mt-0.5 leading-snug">
              For values that are secrets. The value stops being readable here once saved.
            </span>
          </span>
        </label>
      </form>
    </app-form-dialog>
  `,
})
export class LookupDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ lookup?: LookupData; parent?: LookupData }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.lookup?.lookupId);

  readonly heading = computed(() => {
    if (this.isEdit()) return 'Edit lookup';
    return this.data.parent ? 'New entry' : 'New lookup';
  });

  readonly form: FormGroup = this.fb.group({
    lookupId: [this.data.lookup?.lookupId ?? null],
    lookupType: [this.data.lookup?.lookupType ?? '', Validators.required],
    lookupValue: [this.data.lookup?.lookupValue ?? '', Validators.required],
    description: [this.data.lookup?.description ?? ''],
    encrypted: [this.data.lookup?.encrypted ?? false],
    parentLookupId: [this.data.lookup?.parentLookupId ?? this.data.parent?.lookupId ?? null],
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
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/setting.json/updateLookupData`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/setting.json/addLookupData`, payload);

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.ref.close(true); }
        else this.toast.error(response.message);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The lookup could not be saved.');
      },
    });
  }
}
