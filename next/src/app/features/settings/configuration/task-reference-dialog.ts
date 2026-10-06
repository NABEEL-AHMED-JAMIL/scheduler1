import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { TaskReference, TaskReferenceKind, TenantOption, httpUrl, notBlank } from './configuration.models';

export interface TaskReferenceDialogData {
  kind: TaskReferenceKind;
  row?: TaskReference;
  tenants?: TenantOption[];
  tenantId?: number | null;
}

/** Adds or edits a home page or a task group. The kind never changes; the route chose it. */
@Component({
  selector: 'app-task-reference-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Combobox],
  template: `
    <app-form-dialog
        [heading]="heading()"
        [subtitle]="isHomePage ? 'A web address a task links to as its home page.' : 'A label that groups tasks together.'"
        [confirmLabel]="data.row ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        @if (needsWorkspace()) {
          <app-field label="Workspace" for="refTenant" [required]="true"
                     [control]="form.get('tenantId')" [submitted]="submitted()"
                     hint="Only this workspace's tasks can pick it.">
            <app-combobox id="refTenant" formControlName="tenantId" [numeric]="true"
                          placeholder="Search workspaces…" [allowClear]="false" [options]="tenantOptions()" />
          </app-field>
        }

        <app-field label="Name" for="refName" [required]="true"
                   [control]="form.get('name')" [submitted]="submitted()"
                   hint="What a task's dropdown shows. Unique in its workspace.">
          <input id="refName" class="input" formControlName="name" maxlength="255"
                 [placeholder]="isHomePage ? 'Claims portal' : 'Nightly loads'" />
        </app-field>

        <app-field [label]="isHomePage ? 'Address' : 'Value'" for="refValue" [required]="isHomePage"
                   [control]="form.get('value')" [submitted]="submitted()"
                   [hint]="isHomePage ? 'An http:// or https:// address.' : 'Optional: shown beside the name.'"
                   [errorMessages]="{ url: 'Enter an address that starts with http:// or https://.' }">
          <input id="refValue" class="input" [class.mono]="isHomePage" formControlName="value"
                 [type]="isHomePage ? 'url' : 'text'"
                 [placeholder]="isHomePage ? 'https://claims.example.com' : ''" />
        </app-field>

        <app-field label="Description" for="refDescription"
                   [control]="form.get('description')" [submitted]="submitted()">
          <textarea id="refDescription" class="input" rows="2" formControlName="description"
                    placeholder="What this is for"></textarea>
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class TaskReferenceDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<TaskReferenceDialogData>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly isHomePage = this.data.kind === 'HOME_PAGE';
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly needsWorkspace = computed(() => !this.data.row && this.auth.isPlatformAdmin());
  readonly tenantOptions = computed<ComboboxOption[]>(() =>
    (this.data.tenants ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName, hint: t.tenantCode ?? '' })));

  readonly heading = computed(() => {
    const noun = this.isHomePage ? 'home page' : 'task group';
    return this.data.row ? `Edit ${this.data.row.name}` : `New ${noun}`;
  });

  readonly form = this.fb.group({
    tenantId: [this.data.tenantId ?? null as number | null, this.needsWorkspace() ? Validators.required : []],
    name: [this.data.row?.name ?? '', [notBlank, Validators.maxLength(255)]],
    value: [this.data.row?.value ?? '', this.isHomePage ? [notBlank, httpUrl, Validators.maxLength(2048)] : [Validators.maxLength(2048)]],
    description: [this.data.row?.description ?? ''],
  });

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    const name = (v.name ?? '').trim();
    const value = (v.value ?? '').trim();
    const description = (v.description ?? '').trim();
    const url = `${API_BASE}/setting.json/taskReferences`;

    let request;
    if (this.data.row) {
      // The value goes back even when blank, so a group's label can be cleared.
      request = this.http.put<ApiResponse<TaskReference>>(url, { id: this.data.row.id, name, value, description });
    } else {
      const body: Record<string, unknown> = { kind: this.data.kind, name };
      if (value) body['value'] = value;
      if (description) body['description'] = description;
      if (this.needsWorkspace()) body['tenantId'] = v.tenantId;
      request = this.http.post<ApiResponse<TaskReference>>(url, body);
    }

    this.saving.set(true);
    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) { this.toast.success(response.message || 'Saved.'); this.ref.close(true); }
        else this.toast.error(response.message);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'It could not be saved.');
      },
    });
  }
}
