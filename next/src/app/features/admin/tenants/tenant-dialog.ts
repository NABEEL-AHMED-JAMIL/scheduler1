import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

@Component({
  selector: 'app-tenant-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit tenant' : 'New tenant'"
        subtitle="Every job, bucket, task and agent belongs to a tenant."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="space-y-3.5">
        <app-field label="Tenant name" for="tenantName" [required]="true"
                   [control]="form.get('tenantName')" [submitted]="submitted()">
          <input id="tenantName" class="input" formControlName="tenantName"
                 placeholder="Ministry of Justice" />
        </app-field>

        <app-field label="Tenant code" for="tenantCode" [required]="true"
                   [control]="form.get('tenantCode')" [submitted]="submitted()"
                   [errorMessages]="{ pattern: 'Use lowercase letters, digits, dots, dashes or underscores — no spaces or capitals.' }"
                   [hint]="isEdit()
                     ? 'Changing the code does not move any data, but anything referring to the old code stops matching.'
                     : 'Filled in from the name as you type. Must be unique across every tenant.'">
          <input id="tenantCode" class="input mono" formControlName="tenantCode"
                 placeholder="ministry-of-justice" />
        </app-field>

        <app-field label="Status" for="tenantStatus" [control]="form.get('status')"
                   [submitted]="submitted()"
                   hint="Suspending a tenant stops its users signing in; its data is kept.">
          <select id="tenantStatus" class="input" formControlName="status">
            <option value="Active">Active</option>
            <option value="Suspended">Suspended — sign-in blocked</option>
            <option value="Inactive">Inactive — not in use</option>
          </select>
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class TenantDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ tenant?: any }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.tenant);

  readonly form: FormGroup = this.fb.group({
    tenantId: [this.data.tenant?.tenantId ?? null],
    tenantName: [this.data.tenant?.tenantName ?? '', Validators.required],
    tenantCode: [this.data.tenant?.tenantCode ?? '',
      [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9._-]*$/)]],
    status: [this.data.tenant?.status ?? 'Active'],
  });

  constructor() {
    if (this.isEdit()) return;
    // While creating, keep the code in step with the name until someone edits the code
    // themselves -- typing a name and hitting Create is the common path, and the backend
    // rejects a missing or malformed code.
    const codeControl = this.form.get('tenantCode')!;
    codeControl.valueChanges.subscribe(() => {
      if (codeControl.dirty) this.codeTouchedByUser = true;
    });
    this.form.get('tenantName')!.valueChanges.subscribe((name: string) => {
      if (this.codeTouchedByUser) return;
      codeControl.setValue(this.slugify(name ?? ''), { emitEvent: false });
    });
  }

  private codeTouchedByUser = false;

  private slugify(value: string): string {
    return value.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

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
      ? this.http.put<ApiResponse>(`${API_BASE}/tenant.json/updateTenant`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/tenant.json/addTenant`, payload);

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          this.ref.close(true);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The tenant could not be saved.');
      },
    });
  }
}
