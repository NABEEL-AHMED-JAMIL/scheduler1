import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { parseTopicPartition } from '../../../shared/ui/topic';

export interface PipelineField {
  pipelineFieldId?: number;
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

export interface Pipeline {
  /** The editor's name; the author was already carried. */
  updatedByName?: string | null;

  pipelineKey?: number;
  pipelineId: string;
  pipelineName: string;
  /** The topic (source task type) it publishes on; the server names it on the way out. */
  sourceTaskTypeId?: number | null;
  topicName?: string | null;
  kafkaTopic?: string | null;
  description?: string | null;
  status?: string;
  dateCreated?: string;
  createdBy?: number;
  createdByName?: string | null;
  /** Absent, not null, when the server has nothing: its DTOs omit null fields. */
  fields?: PipelineField[];
}

/** The set the server accepts; anything else is silently stored as text. */
export const FIELD_TYPES = ['text', 'textarea', 'number', 'url', 'select', 'checkbox', 'date'];

/**
 * One entry in a select: what the task stores, and what the operator reads.
 *
 * These were the same string until 2026-09-14. A dropdown's only storage is the free-text
 * `field_options` column, one choice per line, and `<option [value]="choice">{{ choice }}</option>`
 * bound that one line to both halves -- so an author had to choose between a cryptic dropdown
 * (type the worker's token) and an unparseable payload (type the human label). Nothing else in
 * the platform reads the column, which is why the split could be made here rather than in a new
 * table or a new column.
 */
export interface FieldChoice {
  /** What lands in the task's XML tag, and what the worker receives. */
  value: string;
  /** What the operator picks from. Falls back to the value when the author wrote only one. */
  label: string;
}

/**
 * Splits the stored text into one trimmed line per choice.
 *
 * The comma branch is a read-side tolerance for data the ETL demo seeder wrote
 * (`etl_demo_catalogue.py`, nine select fields, e.g. `options="records,lines"`). That string was
 * posted verbatim and stored verbatim, and a newline-only split turned the whole thing into a
 * single choice reading "records,lines" -- which no default ever matched, so the dropdown opened
 * blank and the only thing in it was junk. The guard is deliberately narrow so it cannot eat a
 * legitimate single choice: it needs exactly one line, no `=` on it (an author writing the
 * value/label form is not writing a comma list), and no whitespace anywhere in it. That last
 * condition is what keeps a real one-line choice like `Doe, John` intact -- machine-written token
 * lists never carry a space, and human labels almost always do.
 */
function choiceLines(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].includes('=') && lines[0].includes(',')
      && !/\s/.test(lines[0])) {
    return lines[0].split(',').map(line => line.trim()).filter(Boolean);
  }
  return lines;
}

/**
 * Reads the stored choices for a select.
 *
 * The format is one choice per line, and on each line the FIRST `=` optionally separates the
 * stored value from the displayed label. Two properties made that the format worth having over a
 * JSON array or a second column:
 *
 * It is a strict superset of what is already in the database, so nothing had to be migrated. A
 * line with no `=` is the legacy case and is returned exactly as it was read, as both halves --
 * which is not a nicety but a hard requirement: `task-edit.ts` seeds a select from the task's
 * already-saved tag and deletes that tag when the control comes back blank, so the day a legacy
 * option stops resolving to itself is the day every existing task on that pipeline opens blank
 * and silently drops its answer on save.
 *
 * And splitting at the first `=` only, with the whole remainder taken as the label, means a label
 * may contain `=`, `:` or `,` freely -- `eq=Equals (a = b)` reads correctly with no escaping. The
 * one thing the format cannot represent is a `=` inside a *value*; rather than invent an escape
 * character (which would have to reinterpret backslashes already sitting in legacy rows, trading
 * a rare break for a rarer one), the dialog refuses that input by name and the restriction is
 * written down in V36's column comment.
 */
export function parseFieldChoices(fieldOptions: string | null | undefined): FieldChoice[] {
  return choiceLines(fieldOptions ?? '').map(line => {
    const separator = line.indexOf('=');
    // Legacy branch: no separator at all, or a line starting with one (an empty value is not a
    // value). Either way the whole line is what it has always been -- value and label alike.
    if (separator <= 0) return { value: line, label: line };
    const value = line.slice(0, separator).trim();
    const label = line.slice(separator + 1).trim();
    return { value, label: label || value };
  });
}

/**
 * Writes choices back in the format above.
 *
 * A choice whose label equals its value is written as a bare line rather than `x=x`, so a form
 * whose options were plain before and were never edited round-trips to byte-identical text. That
 * matters more than it looks: the alternative rewrites every legacy row on the first unrelated
 * save, which would make a diff of the column useless for telling apart "somebody changed the
 * choices" from "somebody opened the form".
 */
export function serializeFieldChoices(choices: FieldChoice[]): string {
  return choices
    .map(choice => ({
      value: String(choice?.value ?? '').trim(),
      label: String(choice?.label ?? '').trim(),
    }))
    .filter(choice => choice.value || choice.label)
    .map(choice => {
      // Either half alone is a complete choice; the missing one is the other.
      const value = choice.value || choice.label;
      const label = choice.label || choice.value;
      return label === value ? value : `${value}=${label}`;
    })
    .join('\n');
}

/**
 * The rules a select's choices have to satisfy, mirroring PipelineServiceImpl.validate.
 *
 * All three describe a form that saves happily today and then misbehaves on somebody else's
 * screen, which is why they are rules and not hints. A select with no choices offers the operator
 * nothing but "None", and if it is also required the task can never be made valid. Two choices
 * sharing a value mean the second is unreachable -- and the task screen tracks its options by
 * index precisely because this used to collide. A default that is not among the values is the
 * quiet one: the control is seeded with it, `required` passes because a non-empty string is
 * non-empty, no <option> matches so the dropdown paints blank, and the operator saves a value
 * they were never shown.
 *
 * Takes the wire shape rather than the form group so both sides check the same bytes.
 */
export function validateSelectChoices(rows: PipelineField[]): string | null {
  for (const field of rows) {
    if (field.fieldType !== 'select') continue;
    const name = field.label?.trim() || field.tagKey?.trim() || 'dropdown';
    const choices = parseFieldChoices(field.fieldOptions);
    if (!choices.length) {
      return `The "${name}" dropdown has no choices. Add at least one, or change its type.`;
    }
    const values = new Set<string>();
    for (const choice of choices) {
      if (values.has(choice.value)) {
        return `"${name}" offers "${choice.value}" twice. Each choice needs its own value.`;
      }
      values.add(choice.value);
    }
    const fallback = (field.defaultValue ?? '').trim();
    if (fallback && !values.has(fallback)) {
      return `"${name}" defaults to "${fallback}", which is not one of its choices. `
        + 'A task would open on a blank dropdown and still send that value.';
    }
  }
  return null;
}

@Component({
  selector: 'app-pipeline-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit pipeline' : 'New pipeline'"
        subtitle="A pipeline is its id, the topic it publishes on, and the fields a task on it fills in -- creating one here is what makes it choosable on Source Task, in place of a hand-written XML tag."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create pipeline'"
        [saving]="saving()" size="xwide"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <div class="form-grid">
          <app-field label="Pipeline ID" for="pipelineId" [required]="true"
                     [control]="form.get('pipelineId')" [submitted]="submitted()"
                     hint="The id the worker routes on, and what Source Task's Pipeline field will show. One form per pipeline.">
            <input id="pipelineId" class="input mono" formControlName="pipelineId"
                   placeholder="F768926" />
          </app-field>

          <app-field label="Name" for="pipelineName" [required]="true"
                     [control]="form.get('pipelineName')" [submitted]="submitted()">
            <input id="pipelineName" class="input" formControlName="pipelineName"
                   placeholder="Hurricane season collection" />
          </app-field>
        </div>

        <app-field label="Topic" for="pipelineTopic" [required]="true"
                   [control]="form.get('sourceTaskTypeId')" [submitted]="submitted()"
                   hint="The Kafka topic this pipeline's messages go out on. Many pipelines can share one; a task picks the topic first, then the pipeline.">
          <select id="pipelineTopic" class="input" formControlName="sourceTaskTypeId">
            <option [ngValue]="null">Choose a topic…</option>
            @for (t of data.topics ?? []; track t.sourceTaskTypeId) {
              <option [ngValue]="t.sourceTaskTypeId">{{ t.serviceName }}@if (kafkaTopicOf(t)) { — {{ kafkaTopicOf(t) }} }@if (t.kafkaConnectionProfileName) { ({{ t.kafkaConnectionProfileName }}) }</option>
            }
          </select>
        </app-field>

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

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-2.5 items-start" formArrayName="fields">
          @for (row of fields.controls; track row; let i = $index) {
            <!-- A trailing odd-one-out spans both columns: with the grid's own width and just
                 one field (or an odd last field), leaving it in a single column stranded a full
                 card's width of empty space beside it. -->
            <div class="card p-3 flex flex-col gap-2.5"
                 [class.xl:col-span-2]="i === fields.length - 1 && fields.length % 2 === 1"
                 [formGroupName]="i">
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
                @if (row.get('fieldType')?.value === 'select') {
                  <!-- A dropdown's default has to BE one of its choices, and typing it by hand
                       was how it stopped being one: rename a choice and the default silently
                       keeps the old spelling, which then matches no <option>, so every new task
                       renders that field blank while still holding -- and sending -- the stale
                       value. Picking it from the choices themselves removes the class of
                       mistake; validate() still rejects a stale one on an untouched form. -->
                  <app-field label="Default value" [for]="'defaultValue' + i"
                             [control]="row.get('defaultValue')" [submitted]="submitted()"
                             hint="The choice a new task starts on.">
                    <select [id]="'defaultValue' + i" class="input" formControlName="defaultValue">
                      <option value="">(none)</option>
                      @for (choice of defaultValueOptions(i); track $index) {
                        <option [value]="choice.value">{{ choice.label }}</option>
                      }
                    </select>
                  </app-field>
                } @else {
                  <app-field label="Default value" [for]="'defaultValue' + i"
                             [control]="row.get('defaultValue')" [submitted]="submitted()">
                    <input [id]="'defaultValue' + i" class="input mono" formControlName="defaultValue" />
                  </app-field>
                }

                <app-field label="Help text" [for]="'helpText' + i"
                           [control]="row.get('helpText')" [submitted]="submitted()">
                  <input [id]="'helpText' + i" class="input" formControlName="helpText"
                         placeholder="Shown under the field" />
                </app-field>
              </div>

              @if (row.get('fieldType')?.value === 'select') {
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="label">Choices</span>
                    <button type="button" class="btn btn-default btn-sm" (click)="addChoice(i)">
                      <app-icon name="plus" />Add choice
                    </button>
                  </div>
                  <!-- This was one textarea hinted "One per line.", and the line was both halves
                       at once. Two boxes per row because the two halves answer to different
                       people: the value is the worker's contract and the label is the operator's
                       reading of it, and neither should have to be spelled the other's way. -->
                  <p class="field-note text-[color:var(--text-muted)]">
                    The value is what the task stores and the worker receives. The label is what
                    the operator picks from — leave it empty to show the value itself.
                  </p>

                  @if (!choicesArray(i).length) {
                    <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                      <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                      <span>A dropdown with no choices offers the operator nothing but “None”.</span>
                    </p>
                  }

                  <div class="flex flex-col gap-1.5" formArrayName="choices">
                    @for (choice of choicesArray(i).controls; track choice; let c = $index) {
                      <div class="flex items-center gap-1.5" [formGroupName]="c">
                        <input class="input mono flex-1" formControlName="value"
                               placeholder="lines"
                               [attr.aria-label]="'Choice ' + (c + 1) + ' value'" />
                        <span class="text-[color:var(--text-muted)] text-xs shrink-0"
                              aria-hidden="true">shows as</span>
                        <input class="input flex-1" formControlName="label"
                               placeholder="JSON Lines (one object per line)"
                               [attr.aria-label]="'Choice ' + (c + 1) + ' label'" />
                        <button type="button" class="btn btn-ghost btn-icon btn-sm"
                                aria-label="Remove choice" (click)="removeChoice(i, c)">
                          <app-icon name="trash" class="icon-crit" />
                        </button>
                      </div>
                    }
                  </div>
                </div>
              }

              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="checkbox" formControlName="required" />
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
export class PipelineDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ form?: Pipeline; topics?: { sourceTaskTypeId: number; serviceName: string; queueTopicPartition?: string; kafkaConnectionProfileName?: string }[] }>(DIALOG_DATA);
  kafkaTopicOf(t: { queueTopicPartition?: string }): string { return parseTopicPartition(t.queueTopicPartition).topic; }
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly fieldTypes = FIELD_TYPES;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.form?.pipelineKey);

  /** Bumped on every structural edit so the preview and parent lists recompute. */
  private readonly revision = signal(0);

  readonly form: FormGroup = this.fb.group({
    pipelineKey: [this.data.form?.pipelineKey ?? null],
    pipelineId: [this.data.form?.pipelineId ?? '', Validators.required],
    pipelineName: [this.data.form?.pipelineName ?? '', Validators.required],
    sourceTaskTypeId: [this.data.form?.sourceTaskTypeId ?? null, Validators.required],
    description: [this.data.form?.description ?? ''],
    status: [this.data.form?.status ?? 'Active'],
    fields: this.fb.array(
      (this.data.form?.fields ?? [])
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(field => this.fieldGroup(field))),
  });

  get fields(): FormArray { return this.form.get('fields') as FormArray; }

  private fieldGroup(field?: Partial<PipelineField>): FormGroup {
    const group = this.fb.group({
      pipelineFieldId: [field?.pipelineFieldId ?? null],
      tagKey: [field?.tagKey ?? '', Validators.required],
      tagParent: [field?.tagParent ?? ''],
      label: [field?.label ?? '', Validators.required],
      fieldType: [field?.fieldType ?? 'text'],
      required: [field?.required ?? false],
      defaultValue: [field?.defaultValue ?? ''],
      helpText: [field?.helpText ?? ''],
      /*
       * The choices, parsed out of the stored text once on open and written back out in rows().
       * The raw `fieldOptions` control this replaced is gone deliberately rather than kept in
       * parallel: two representations of the same thing is how the textarea and the rows would
       * drift, and the parse is a strict superset of the stored format, so a form whose choices
       * are plain lines and are never touched still serializes back to the same bytes.
       */
      choices: this.fb.array(
        parseFieldChoices(field?.fieldOptions).map(choice => this.choiceGroup(choice))),
    });
    // A tag rename changes what other rows can nest under, and the preview.
    group.valueChanges.subscribe(() => this.revision.update(n => n + 1));
    return group;
  }

  private choiceGroup(choice?: FieldChoice): FormGroup {
    return this.fb.group({
      value: [choice?.value ?? ''],
      label: [choice?.label ?? ''],
    });
  }

  /** The choice rows of one field. Always present, even while the type is not `select`. */
  choicesArray(index: number): FormArray {
    return this.fields.at(index).get('choices') as FormArray;
  }

  addChoice(index: number): void {
    this.choicesArray(index).push(this.choiceGroup());
    this.revision.update(n => n + 1);
  }

  removeChoice(index: number, choiceIndex: number): void {
    this.choicesArray(index).removeAt(choiceIndex);
    this.revision.update(n => n + 1);
  }

  /** One field's choices as value/label pairs, with each half standing in for a missing other. */
  private choicesFor(index: number): FieldChoice[] {
    this.revision();
    return this.choicesArray(index).controls
      .map(row => {
        const value = String(row.get('value')?.value ?? '').trim();
        const label = String(row.get('label')?.value ?? '').trim();
        return { value: value || label, label: label || value };
      })
      .filter(choice => choice.value);
  }

  /**
   * What the Default value dropdown offers for a select.
   *
   * A default that is not among the choices is carried as a last entry rather than dropped, so
   * that opening an older form shows the stale value instead of an empty box that looks like a
   * deliberate "(none)". Saving is still refused until it is resolved -- see validate().
   */
  defaultValueOptions(index: number): FieldChoice[] {
    const choices = this.choicesFor(index);
    const current = String(this.fields.at(index).get('defaultValue')?.value ?? '').trim();
    if (current && !choices.some(choice => choice.value === current)) {
      return [...choices, { value: current, label: `${current} (not one of the choices)` }];
    }
    return choices;
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
  private validate(rows: PipelineField[]): string | null {
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
    const choiceProblem = validateSelectChoices(rows);
    if (choiceProblem) return choiceProblem;
    return this.findNestingCycle(rows);
  }

  /**
   * Refuses a choice whose value carries the separator the format is built on.
   *
   * Checked against the boxes rather than the serialized text because by then it is already too
   * late to see: a value of `a=b` written out as a line reads back as value `a`, label `b`, so
   * the shared rule in validateSelectChoices -- which parses what the server will be sent -- can
   * only ever see the truncation, never the intent. Refused by name here instead of escaped,
   * because an escape character would have to reinterpret backslashes that are already sitting
   * in legacy rows, which trades a rare break for a rarer and much more surprising one.
   */
  private validateChoiceInputs(): string | null {
    for (let i = 0; i < this.fields.length; i++) {
      const row = this.fields.at(i);
      if (row.get('fieldType')?.value !== 'select') continue;
      const name = String(row.get('label')?.value ?? '').trim() || `Field #${i + 1}`;
      for (const choice of this.choicesArray(i).controls) {
        if (String(choice.get('value')?.value ?? '').includes('=')) {
          return `A choice on "${name}" has "=" in its value. "=" is what separates a choice's `
            + 'value from its label, so it cannot appear in the value itself.';
        }
      }
    }
    return null;
  }

  /**
   * Refuses a set of fields whose nesting loops back on itself.
   *
   * Existing before this: the parent dropdown offers every *other* field, so A under B and B
   * under A is two clicks away, and nothing rejected it -- both parents exist, which was the
   * only thing checked. A cycle has no root, so `preview` (which walks down from the fields with
   * no parent) rendered neither field, and the form saved happily with tags that the XML
   * generator then nests inside each other in an order nobody asked for. Silent on both sides,
   * so it is caught here by name.
   */
  private findNestingCycle(rows: PipelineField[]): string | null {
    const parentOf = new Map<string, string>();
    for (const field of rows) {
      const key = field.tagKey.trim();
      const parent = field.tagParent?.trim();
      if (parent) parentOf.set(key, parent);
    }
    for (const start of parentOf.keys()) {
      const path: string[] = [start];
      const seen = new Set<string>([start]);
      let current = parentOf.get(start);
      while (current) {
        if (seen.has(current)) {
          path.push(current);
          return path.length === 2 && path[0] === path[1]
            ? `<${start}> is set to nest under itself.`
            : `These fields nest in a loop: ${path.map(t => `<${t}>`).join(' under ')}. `
              + 'One of them has to sit at the top level.';
        }
        seen.add(current);
        path.push(current);
        current = parentOf.get(current);
      }
    }
    return null;
  }

  private rows(): PipelineField[] {
    return this.fields.controls.map((row, index) => {
      const value = row.getRawValue();
      return {
        pipelineFieldId: value.pipelineFieldId ?? undefined,
        tagKey: String(value.tagKey ?? '').trim(),
        tagParent: String(value.tagParent ?? '').trim() || null,
        label: String(value.label ?? '').trim(),
        fieldType: value.fieldType || 'text',
        required: !!value.required,
        defaultValue: value.defaultValue || null,
        helpText: value.helpText || null,
        /*
         * Sent whatever the type currently reads. This used to be nulled for anything but
         * `select`, and because saveForm replaces the field list wholesale (it clears the rows
         * and rebuilds them, with orphanRemoval deleting the old ones), a save committed while a
         * field's type happened to read `text` DELETED its choices with no warning and no undo --
         * and the choices editor is hidden for a non-select, so nothing on screen said what was
         * at stake. Carrying an unused string in a nullable TEXT column costs nothing, and the
         * task screen already ignores it for every type but select.
         */
        fieldOptions: serializeFieldChoices(this.choicesFor(index)) || null,
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
    if (this.form.get('pipelineId')?.invalid || this.form.get('pipelineName')?.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    // Before rows(), because serializing the choices is what hides this particular mistake.
    const inputProblem = this.validateChoiceInputs();
    if (inputProblem) {
      this.form.markAllAsTouched();
      this.toast.error(inputProblem);
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
    const payload: Pipeline = {
      pipelineKey: value.pipelineKey ?? undefined,
      pipelineId: String(value.pipelineId).trim(),
      pipelineName: String(value.pipelineName).trim(),
      sourceTaskTypeId: value.sourceTaskTypeId,
      description: value.description || null,
      status: value.status,
      fields: rows,
    };

    this.saving.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/pipeline.json/save`, payload).subscribe({
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
