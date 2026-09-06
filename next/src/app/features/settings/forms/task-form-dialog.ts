import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';

export interface TaskFormField {
  taskFormFieldId?: number;
  tagKey: string;
  tagParent?: string | null;
  label: string;
  fieldType: string;
  required: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  fieldOptions?: string | null;
  position: number;
}

export interface TaskForm {
  /** The editor's name; the author was already carried. */
  updatedByName?: string | null;

  taskFormId?: number;
  pipelineId: string;
  formName: string;
  description?: string | null;
  formStatus?: string;
  dateCreated?: string;
  createdBy?: number;
  createdByName?: string | null;
  /** Absent, not null, when the server has nothing: its DTOs omit null fields. */
  fields?: TaskFormField[];
}

/** The set the server accepts; anything else is silently stored as text. */
export const FIELD_TYPES = ['text', 'textarea', 'number', 'url', 'select', 'checkbox', 'date'];

@Component({
  selector: 'app-task-form-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit form' : 'New form'"
        subtitle="Describes the payload a pipeline expects, so a task can be filled in rather than hand-written."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create form'"
        [saving]="saving()" size="wide"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <div class="form-grid">
          <app-field label="Pipeline" for="pipelineId" [required]="true"
                     [control]="form.get('pipelineId')" [submitted]="submitted()"
                     hint="The pipelineId the worker routes on. One form per pipeline.">
            <input id="pipelineId" class="input mono" formControlName="pipelineId"
                   list="known-pipelines" placeholder="F768926" />
            <datalist id="known-pipelines">
              @for (id of data.pipelines; track id) { <option [value]="id"></option> }
            </datalist>
          </app-field>

          <app-field label="Form name" for="formName" [required]="true"
                     [control]="form.get('formName')" [submitted]="submitted()">
            <input id="formName" class="input" formControlName="formName"
                   placeholder="Hurricane season collection" />
          </app-field>
        </div>

        <app-field label="Description" for="formDescription"
                   [control]="form.get('description')" [submitted]="submitted()">
          <textarea id="formDescription" class="input" rows="2" formControlName="description"
                    placeholder="What a task on this pipeline collects"></textarea>
        </app-field>

        <!-- Fields ------------------------------------------------------------------ -->
        <div class="flex items-center justify-between gap-2 pt-1">
          <div>
            <h3 class="text-sm font-semibold">Fields</h3>
            <p class="field-note text-[color:var(--text-muted)]">
              Each field fills one XML tag. Order here is the order they are shown in.
            </p>
          </div>
          <button type="button" class="btn btn-default btn-sm" (click)="addField()">
            <app-icon name="plus" />Add field
          </button>
        </div>

        @if (!fields.length) {
          <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
            <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
            <span>A form needs at least one field.</span>
          </p>
        }

        <div class="flex flex-col gap-2.5" formArrayName="fields">
          @for (row of fields.controls; track row; let i = $index) {
            <div class="card p-3 flex flex-col gap-2.5" [formGroupName]="i">
              <div class="flex items-center gap-2">
                <span class="stat-glyph shrink-0"><app-icon name="template" /></span>
                <span class="text-xs text-[color:var(--text-muted)] mono">#{{ i + 1 }}</span>
                <span class="ml-auto flex items-center gap-1">
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Move up"
                          [disabled]="i === 0" (click)="move(i, -1)">
                    <app-icon name="arrowUp" />
                  </button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Move down"
                          [disabled]="i === fields.length - 1" (click)="move(i, 1)">
                    <app-icon name="arrowDown" />
                  </button>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Remove field"
                          (click)="removeField(i)">
                    <app-icon name="trash" class="icon-crit" />
                  </button>
                </span>
              </div>

              <div class="form-grid">
                <app-field label="XML tag" [for]="'tagKey' + i" [required]="true"
                           [control]="row.get('tagKey')" [submitted]="submitted()">
                  <input [id]="'tagKey' + i" class="input mono" formControlName="tagKey"
                         placeholder="start_year" />
                </app-field>

                <app-field label="Label" [for]="'label' + i" [required]="true"
                           [control]="row.get('label')" [submitted]="submitted()">
                  <input [id]="'label' + i" class="input" formControlName="label"
                         placeholder="First season" />
                </app-field>
              </div>

              <div class="form-grid">
                <app-field label="Type" [for]="'fieldType' + i" [control]="row.get('fieldType')"
                           [submitted]="submitted()">
                  <select [id]="'fieldType' + i" class="input" formControlName="fieldType">
                    @for (type of fieldTypes; track type) {
                      <option [value]="type">{{ type }}</option>
                    }
                  </select>
                </app-field>

                <app-field label="Nested under" [for]="'tagParent' + i"
                           [control]="row.get('tagParent')" [submitted]="submitted()"
                           hint="Another field's tag, or leave empty for the document root.">
                  <select [id]="'tagParent' + i" class="input" formControlName="tagParent">
                    <option value="">(root)</option>
                    @for (key of parentChoices(i); track key) {
                      <option [value]="key">{{ key }}</option>
                    }
                  </select>
                </app-field>
              </div>

              <div class="form-grid">
                <app-field label="Default value" [for]="'defaultValue' + i"
                           [control]="row.get('defaultValue')" [submitted]="submitted()">
                  <input [id]="'defaultValue' + i" class="input mono" formControlName="defaultValue" />
                </app-field>

                <app-field label="Help text" [for]="'helpText' + i"
                           [control]="row.get('helpText')" [submitted]="submitted()">
                  <input [id]="'helpText' + i" class="input" formControlName="helpText"
                         placeholder="Shown under the field" />
                </app-field>
              </div>

              @if (row.get('fieldType')?.value === 'select') {
                <app-field label="Choices" [for]="'fieldOptions' + i"
                           [control]="row.get('fieldOptions')" [submitted]="submitted()"
                           hint="One per line.">
                  <textarea [id]="'fieldOptions' + i" class="input mono" rows="3"
                            formControlName="fieldOptions"></textarea>
                </app-field>
              }

              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" formControlName="required" />
                Required
              </label>
            </div>
          }
        </div>

        <!-- Preview ----------------------------------------------------------------- -->
        @if (preview()) {
          <div class="flex flex-col gap-1.5 pt-1">
            <h3 class="text-sm font-semibold">Payload preview</h3>
            <p class="field-note text-[color:var(--text-muted)]">
              The shape a task on this pipeline will send, using the defaults above.
            </p>
            <pre class="mono text-xs leading-relaxed rounded p-2.5 overflow-auto max-h-64 whitespace-pre-wrap break-words bg-code border border-subtle"
                >{{ preview() }}</pre>
          </div>
        }
      </form>

      <span footer-start class="text-xs text-[color:var(--text-muted)]">
        {{ fields.length }} field{{ fields.length === 1 ? '' : 's' }}
      </span>
    </app-form-dialog>
  `,
})
export class TaskFormDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ form?: TaskForm; pipelines: string[] }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly fieldTypes = FIELD_TYPES;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.form?.taskFormId);

  /** Bumped on every structural edit so the preview and parent lists recompute. */
  private readonly revision = signal(0);

  readonly form: FormGroup = this.fb.group({
    taskFormId: [this.data.form?.taskFormId ?? null],
    pipelineId: [this.data.form?.pipelineId ?? '', Validators.required],
    formName: [this.data.form?.formName ?? '', Validators.required],
    description: [this.data.form?.description ?? ''],
    formStatus: [this.data.form?.formStatus ?? 'Active'],
    fields: this.fb.array(
      (this.data.form?.fields ?? [])
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(field => this.fieldGroup(field))),
  });

  get fields(): FormArray { return this.form.get('fields') as FormArray; }

  private fieldGroup(field?: Partial<TaskFormField>): FormGroup {
    const group = this.fb.group({
      taskFormFieldId: [field?.taskFormFieldId ?? null],
      tagKey: [field?.tagKey ?? '', Validators.required],
      tagParent: [field?.tagParent ?? ''],
      label: [field?.label ?? '', Validators.required],
      fieldType: [field?.fieldType ?? 'text'],
      required: [field?.required ?? false],
      defaultValue: [field?.defaultValue ?? ''],
      helpText: [field?.helpText ?? ''],
      fieldOptions: [field?.fieldOptions ?? ''],
    });
    // A tag rename changes what other rows can nest under, and the preview.
    group.valueChanges.subscribe(() => this.revision.update(n => n + 1));
    return group;
  }

  addField(): void {
    this.fields.push(this.fieldGroup());
    this.revision.update(n => n + 1);
  }

  removeField(index: number): void {
    this.fields.removeAt(index);
    this.revision.update(n => n + 1);
  }

  move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.fields.length) return;
    const row = this.fields.at(index);
    this.fields.removeAt(index);
    this.fields.insert(target, row);
    this.revision.update(n => n + 1);
  }

  /** Every other field's tag — a field cannot nest under itself. */
  parentChoices(index: number): string[] {
    this.revision();
    return this.fields.controls
      .map((row, i) => (i === index ? '' : String(row.get('tagKey')?.value ?? '').trim()))
      .filter(Boolean);
  }

  /**
   * Mirrors the server's checks so a problem is named here rather than after a round trip.
   * The messages are deliberately the server's own.
   */
  private validate(rows: TaskFormField[]): string | null {
    if (!rows.length) return 'A form needs at least one field.';
    const keys = new Set<string>();
    for (const field of rows) {
      if (!field.tagKey?.trim()) return 'Every field needs an XML tag.';
      if (!field.label?.trim()) return `The field for "${field.tagKey.trim()}" needs a label.`;
      if (keys.has(field.tagKey.trim())) {
        return `Two fields both write <${field.tagKey.trim()}>. Each tag can appear once.`;
      }
      keys.add(field.tagKey.trim());
    }
    for (const field of rows) {
      const parent = field.tagParent?.trim();
      if (parent && !keys.has(parent)) {
        return `"${field.label.trim()}" nests under <${parent}>, which no field creates.`;
      }
    }
    return null;
  }

  private rows(): TaskFormField[] {
    return this.fields.controls.map((row, index) => {
      const value = row.getRawValue();
      return {
        taskFormFieldId: value.taskFormFieldId ?? undefined,
        tagKey: String(value.tagKey ?? '').trim(),
        tagParent: String(value.tagParent ?? '').trim() || null,
        label: String(value.label ?? '').trim(),
        fieldType: value.fieldType || 'text',
        required: !!value.required,
        defaultValue: value.defaultValue || null,
        helpText: value.helpText || null,
        fieldOptions: value.fieldType === 'select' ? (value.fieldOptions || null) : null,
        position: index,
      };
    });
  }

  /** Nests each field under its parent so the shape is visible before anything is saved. */
  readonly preview = computed(() => {
    this.revision();
    const rows = this.fields.controls.map(row => row.getRawValue());
    const named = rows.filter(row => String(row.tagKey ?? '').trim());
    if (!named.length) return '';

    const childrenOf = (parent: string): string[] => named
      .filter(row => (String(row.tagParent ?? '').trim() || '') === parent)
      .map(row => {
        const tag = String(row.tagKey).trim();
        const nested = childrenOf(tag);
        if (nested.length) {
          return `<${tag}>\n${nested.map(line => '  ' + line.replace(/\n/g, '\n  ')).join('\n')}\n</${tag}>`;
        }
        return `<${tag}>${row.defaultValue ?? ''}</${tag}>`;
      });

    return ['<?xml version="1.0" encoding="UTF-8"?>', ...childrenOf('')].join('\n');
  });

  save(): void {
    this.submitted.set(true);
    if (this.form.get('pipelineId')?.invalid || this.form.get('formName')?.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const rows = this.rows();
    const problem = this.validate(rows);
    if (problem) {
      this.form.markAllAsTouched();
      this.toast.error(problem);
      return;
    }

    const value = this.form.getRawValue();
    const payload: TaskForm = {
      taskFormId: value.taskFormId ?? undefined,
      pipelineId: String(value.pipelineId).trim(),
      formName: String(value.formName).trim(),
      description: value.description || null,
      formStatus: value.formStatus,
      fields: rows,
    };

    this.saving.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/taskForm.json/saveForm`, payload).subscribe({
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
        this.toast.error(err?.error?.message || 'The form could not be saved.');
      },
    });
  }
}
