import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { Field } from '../../shared/ui/field';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Icon } from '../../shared/ui/icon';
import { FormRenderer } from './form-renderer';
import {
  BOOLEAN_TYPES, CHOICE_TYPES, DynamicForm, DynamicFormField, FIELD_TYPES, SECTION_TYPE,
  TEXTUAL_TYPES, validateForm,
} from './dynamic-form.model';

@Component({
  selector: 'app-dynamic-form-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon, FormRenderer],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit form' : 'New form'"
        subtitle="Fields are shown in this order, and each one collects an answer under its name."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create form'"
        [saving]="saving()" size="wide"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <div class="form-grid">
          <app-field label="Form name" for="formName" [required]="true"
                     [control]="form.get('formName')" [submitted]="submitted()">
            <input id="formName" class="input" formControlName="formName"
                   placeholder="Email delivery configuration" />
          </app-field>

          <app-field label="Status" for="formStatus" [control]="form.get('status')"
                     [submitted]="submitted()">
            <select id="formStatus" class="input" formControlName="status">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </app-field>
        </div>

        <app-field label="Description" for="formDescription"
                   [control]="form.get('description')" [submitted]="submitted()">
          <textarea id="formDescription" class="input" rows="2" formControlName="description"
                    placeholder="What this form is for"></textarea>
        </app-field>

        <!-- Fields ----------------------------------------------------------------- -->
        <div class="flex items-center justify-between gap-2 pt-1">
          <div>
            <h3 class="text-sm font-semibold">Fields</h3>
            <p class="field-note text-[color:var(--text-muted)]">
              A section is a heading rather than an input, so it collects nothing.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <select class="input max-w-40" [value]="typeToAdd()"
                    (change)="typeToAdd.set($any($event.target).value)">
              @for (type of fieldTypes; track type) { <option [value]="type">{{ type }}</option> }
            </select>
            <button type="button" class="btn btn-default btn-sm" (click)="addField()">
              <app-icon name="plus" />Add
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2.5" formArrayName="fields">
          @for (row of fields.controls; track row; let i = $index) {
            <div class="card p-3 flex flex-col gap-2.5" [formGroupName]="i">
              <div class="flex items-center gap-2">
                <span class="pill pill-neutral mono">{{ row.get('fieldType')?.value }}</span>
                <span class="text-xs text-[color:var(--text-muted)] mono">#{{ i + 1 }}</span>
                <span class="ml-auto flex items-center gap-1">
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Move up"
                          [disabled]="i === 0" (click)="move(i, -1)"><app-icon name="arrowUp" /></button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Move down"
                          [disabled]="i === fields.length - 1" (click)="move(i, 1)"><app-icon name="arrowDown" /></button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Remove field"
                          (click)="removeField(i)"><app-icon name="trash" class="icon-crit" /></button>
                </span>
              </div>

              <div class="form-grid">
                <app-field label="Label" [for]="'lbl'+i" [required]="true"
                           [control]="row.get('fieldLabel')" [submitted]="submitted()">
                  <input [id]="'lbl'+i" class="input" formControlName="fieldLabel" />
                </app-field>

                @if (row.get('fieldType')?.value !== 'section') {
                  <app-field label="Name" [for]="'nm'+i" [required]="true"
                             [control]="row.get('fieldName')" [submitted]="submitted()"
                             hint="The key the answer is stored under.">
                    <input [id]="'nm'+i" class="input mono" formControlName="fieldName" />
                  </app-field>
                }
              </div>

              <div class="form-grid">
                <app-field [label]="row.get('fieldType')?.value === 'section' ? 'Sub-heading' : 'Placeholder'"
                           [for]="'ph'+i" [control]="row.get('placeHolder')" [submitted]="submitted()">
                  <input [id]="'ph'+i" class="input" formControlName="placeHolder" />
                </app-field>

                <app-field label="Width" [for]="'w'+i" [control]="row.get('fieldWidth')"
                           [submitted]="submitted()" hint="Columns out of 12.">
                  <select [id]="'w'+i" class="input" formControlName="fieldWidth">
                    <option [value]="12">Full width</option>
                    <option [value]="6">Half</option>
                    <option [value]="4">Third</option>
                    <option [value]="3">Quarter</option>
                  </select>
                </app-field>
              </div>

              @if (isChoice(row)) {
                <app-field label="Choices" [for]="'op'+i" [control]="row.get('fieldOptions')"
                           [submitted]="submitted()" hint="One per line.">
                  <textarea [id]="'op'+i" class="input mono" rows="3" formControlName="fieldOptions"></textarea>
                </app-field>
              }

              @if (isTextual(row)) {
                <div class="form-grid">
                  <app-field label="Min length" [for]="'mn'+i" [control]="row.get('minLength')"
                             [submitted]="submitted()">
                    <input [id]="'mn'+i" type="number" class="input" formControlName="minLength" />
                  </app-field>
                  <app-field label="Max length" [for]="'mx'+i" [control]="row.get('maxLength')"
                             [submitted]="submitted()">
                    <input [id]="'mx'+i" type="number" class="input" formControlName="maxLength" />
                  </app-field>
                </div>
                <app-field label="Pattern" [for]="'pt'+i" [control]="row.get('pattern')"
                           [submitted]="submitted()" hint="A regular expression the answer must match.">
                  <input [id]="'pt'+i" class="input mono" formControlName="pattern" />
                </app-field>
              }

              @if (row.get('fieldType')?.value !== 'section') {
                <div class="flex flex-wrap items-center gap-4">
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" formControlName="mandatory" /> Required
                  </label>
                  <app-field label="Default" [for]="'df'+i" [control]="row.get('defaultValue')"
                             [submitted]="submitted()" class="flex-1 min-w-40">
                    <input [id]="'df'+i" class="input mono" formControlName="defaultValue"
                           [placeholder]="isBoolean(row) ? 'true or false' : ''" />
                  </app-field>
                </div>
              }

              @if (row.get('fieldType')?.value === 'password') {
                <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                  <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                  <span>
                    Submissions are stored as plain text, so whatever is typed here is readable by
                    anyone who can open this form's submissions. Do not collect real credentials.
                  </span>
                </p>
              }
            </div>
          }
          @if (!fields.length) {
            <p class="text-sm text-[color:var(--text-muted)]">
              No fields yet. Pick a type above and add one.
            </p>
          }
        </div>

        <!-- Preview ---------------------------------------------------------------- -->
        @if (fields.length) {
          <div class="flex flex-col gap-2 pt-1">
            <h3 class="text-sm font-semibold">Preview</h3>
            <p class="field-note text-[color:var(--text-muted)]">
              Exactly what someone opening the form will see.
            </p>
            <div class="rounded p-3.5 bg-inset">
              <app-form-renderer [fields]="previewFields()" [readOnly]="true" />
            </div>
          </div>
        }
      </form>

      <span footer-start class="text-xs text-[color:var(--text-muted)]">
        {{ inputCount() }} input{{ inputCount() === 1 ? '' : 's' }}
      </span>
    </app-form-dialog>
  `,
})
export class DynamicFormDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ form?: DynamicForm }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly fieldTypes = FIELD_TYPES;
  readonly typeToAdd = signal<string>('text');
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.form?.dynamicFormId);

  /** Bumped on every structural edit so the preview recomputes. */
  private readonly revision = signal(0);

  readonly form: FormGroup = this.fb.group({
    dynamicFormId: [this.data.form?.dynamicFormId ?? null],
    formName: [this.data.form?.formName ?? '', Validators.required],
    description: [this.data.form?.description ?? ''],
    status: [this.data.form?.status ?? 'Active'],
    fields: this.fb.array(
      [...(this.data.form?.fields ?? [])]
        .sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0))
        .map(f => this.fieldGroup(f))),
  });

  get fields(): FormArray { return this.form.get('fields') as FormArray; }

  private fieldGroup(field?: Partial<DynamicFormField>): FormGroup {
    const group = this.fb.group({
      dynamicFormFieldId: [field?.dynamicFormFieldId ?? null],
      fieldType: [field?.fieldType ?? this.typeToAdd()],
      fieldName: [field?.fieldName ?? ''],
      fieldLabel: [field?.fieldLabel ?? '', Validators.required],
      placeHolder: [field?.placeHolder ?? ''],
      defaultValue: [field?.defaultValue ?? ''],
      mandatory: [field?.mandatory ?? false],
      pattern: [field?.pattern ?? ''],
      minLength: [field?.minLength ?? null],
      maxLength: [field?.maxLength ?? null],
      fieldWidth: [field?.fieldWidth ?? 6],
      fieldOptions: [field?.fieldOptions ?? ''],
    });
    group.valueChanges.subscribe(() => this.revision.update(n => n + 1));
    return group;
  }

  isChoice(row: any): boolean { return CHOICE_TYPES.includes(row.get('fieldType')?.value); }
  isTextual(row: any): boolean { return TEXTUAL_TYPES.includes(row.get('fieldType')?.value); }
  isBoolean(row: any): boolean { return BOOLEAN_TYPES.includes(row.get('fieldType')?.value); }

  addField(): void {
    const type = this.typeToAdd();
    // A name is the key an answer is stored under, so it is suggested rather than left blank.
    const suggested = type === SECTION_TYPE ? '' : `${type}_${this.fields.length + 1}`;
    this.fields.push(this.fieldGroup({ fieldType: type, fieldName: suggested,
      fieldLabel: type === SECTION_TYPE ? 'Section' : '',
      fieldWidth: type === 'textarea' || type === SECTION_TYPE ? 12 : 6 }));
    this.revision.update(n => n + 1);
  }

  removeField(i: number): void { this.fields.removeAt(i); this.revision.update(n => n + 1); }

  move(i: number, delta: number): void {
    const target = i + delta;
    if (target < 0 || target >= this.fields.length) return;
    const row = this.fields.at(i);
    this.fields.removeAt(i);
    this.fields.insert(target, row);
    this.revision.update(n => n + 1);
  }

  readonly inputCount = computed(() => {
    this.revision();
    return this.fields.controls.filter(r => r.get('fieldType')?.value !== SECTION_TYPE).length;
  });

  readonly previewFields = computed<DynamicFormField[]>(() => {
    this.revision();
    return this.rows();
  });

  private rows(): DynamicFormField[] {
    return this.fields.controls.map((row, index) => {
      const v = row.getRawValue();
      const isSection = v.fieldType === SECTION_TYPE;
      return {
        dynamicFormFieldId: v.dynamicFormFieldId ?? undefined,
        fieldOrder: index,
        fieldType: v.fieldType,
        // A section still needs a name to satisfy the server's validation, so one is derived.
        fieldName: (v.fieldName || '').trim() || (isSection ? `section_${index + 1}` : ''),
        fieldLabel: (v.fieldLabel || '').trim(),
        placeHolder: v.placeHolder || null,
        defaultValue: v.defaultValue || null,
        mandatory: isSection ? false : !!v.mandatory,
        pattern: v.pattern || null,
        minLength: v.minLength === '' ? null : v.minLength,
        maxLength: v.maxLength === '' ? null : v.maxLength,
        fieldWidth: Number(v.fieldWidth) || 6,
        fieldOptions: CHOICE_TYPES.includes(v.fieldType) ? (v.fieldOptions || null) : null,
      };
    });
  }

  /**
   * Saves the form, then reconciles its fields.
   *
   * addForm and updateForm persist the form row only -- they read nothing from the fields
   * list -- so fields have to be added, updated and deleted one call at a time. This sends the
   * form first, because a new field needs the id the form save returns.
   */
  async save(): Promise<void> {
    this.submitted.set(true);
    const rows = this.rows();
    const payload: DynamicForm = {
      dynamicFormId: this.form.get('dynamicFormId')?.value ?? undefined,
      formName: (this.form.get('formName')?.value ?? '').trim(),
      description: this.form.get('description')?.value || null,
      status: this.form.get('status')?.value,
    };
    const problem = validateForm({ ...payload, fields: rows });
    if (problem) {
      this.form.markAllAsTouched();
      this.toast.error(problem);
      return;
    }

    this.saving.set(true);
    try {
      const saved = await this.send<ApiResponse<DynamicForm>>(
        this.isEdit() ? 'PUT' : 'POST',
        this.isEdit() ? '/dynamicForm.json/updateForm' : '/dynamicForm.json/addForm', payload);
      if (saved.status !== API_SUCCESS) {
        this.saving.set(false);
        this.toast.error(saved.message);
        return;
      }
      const formId = payload.dynamicFormId ?? saved.data?.dynamicFormId;
      if (!formId) {
        this.saving.set(false);
        this.toast.error('The form saved but returned no id, so its fields were not written.');
        return;
      }

      // Anything that was there before and is not there now has been removed.
      const keptIds = new Set(rows.map(r => r.dynamicFormFieldId).filter(Boolean));
      const removed = (this.data.form?.fields ?? [])
        .map(f => f.dynamicFormFieldId)
        .filter((id): id is number => !!id && !keptIds.has(id));

      const failures: string[] = [];
      for (const id of removed) {
        const r = await this.send<ApiResponse>('DELETE',
          `/dynamicForm.json/deleteField?dynamicFormFieldId=${id}`);
        if (r.status !== API_SUCCESS) failures.push(r.message);
      }
      for (const field of rows) {
        const r = field.dynamicFormFieldId
          ? await this.send<ApiResponse>('PUT', '/dynamicForm.json/updateField', field)
          : await this.send<ApiResponse>('POST',
              `/dynamicForm.json/addField?dynamicFormId=${formId}`, field);
        if (r.status !== API_SUCCESS) failures.push(`${field.fieldLabel}: ${r.message}`);
      }

      this.saving.set(false);
      if (failures.length) {
        // The form itself saved, so say which fields did not rather than implying nothing did.
        this.toast.error(`Form saved, but ${failures.length} field(s) failed: ${failures[0]}`);
      } else {
        this.toast.success(saved.message);
      }
      this.ref.close(true);
    } catch (err: any) {
      this.saving.set(false);
      this.toast.error(err?.error?.message || 'The form could not be saved.');
    }
  }

  /** One place for the request plumbing, so the reconcile loop reads as the steps it performs. */
  private send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const url = `${API_BASE}${path}`;
    const call = method === 'POST' ? this.http.post<T>(url, body ?? {})
      : method === 'PUT' ? this.http.put<T>(url, body ?? {})
      : this.http.delete<T>(url);
    return firstValueFrom(call);
  }
}
