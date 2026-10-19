import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ActionsBar } from '../../../shared/ui/actions-bar';
import { Combobox } from '../../../shared/ui/combobox';
import { Field } from '../../../shared/ui/field';
import { FormRow } from '../../../shared/ui/form-row';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Section } from '../../../shared/ui/section';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { StatusPill } from '../../../shared/ui/status-pill';
import { ToastService } from '../../../shared/ui/toast.service';
import { createTopicSearch } from '../../../shared/ui/topic-search';
import { HasUnsavedChanges } from '../../../shared/ui/unsaved-changes.guard';
import { StepsApi } from '../../tasks/steps/steps.service';
import { UsagePipeline } from '../../tasks/steps/task-usage.model';
import { AiStepConfig, AiStepPanel } from '../pipelines/ai-step-panel';
import {
  FIELD_TYPES, FieldChoice, Pipeline, PipelineField, parseFieldChoices, serializeFieldChoices, validateSelectChoices,
} from '../pipelines/pipeline.model';

/**
 * Settings › Task Registry › New / Edit registry task (owner #18, 2026-10-19): a page of its own, wide, instead of the
 * dialog it was -- at /settings/task-registry/new (?copyOf=<key> for Duplicate) and /settings/task-registry/<key>. A
 * registry task is a Legacy pipeline: its id, the topic it publishes on, and the payload fields a pipeline on it fills
 * in, with any AI steps. The page reads the row it edits (pipeline.json/get) and saves exactly the request the dialog
 * saved (pipeline.json/save; legacy-save.golden.ts holds it). Beside the form, on the right: the payload preview, the
 * pipelines that use it, and what the parts mean. Leaving with unsaved changes asks first (unsavedChangesGuard), and a
 * reload or close warns.
 */
@Component({
  selector: 'app-registry-task-editor',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, Section, FormRow, Field, Combobox, Icon, ActionsBar, StatusPill],
  templateUrl: './registry-task-editor.html',
  styles: `
    .rte-layout { display: grid; gap: 1.25rem; }
    @media (min-width: 80rem) {
      .rte-layout { grid-template-columns: minmax(0, 1fr) 24rem; align-items: start; }
      .rte-aside { position: sticky; top: 4.5rem; }
    }
    @media (min-width: 120rem) { .rte-layout { grid-template-columns: minmax(0, 1fr) 30rem; } }
    .rte-main { display: grid; gap: 1.25rem; min-width: 0; }
    .rte-aside { display: grid; gap: 1.25rem; min-width: 0; }
    .rte-fields { display: grid; gap: 0.75rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
    @media (min-width: 100rem) { .rte-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .rte-wide { grid-column: 1 / -1; } }
    .rte-preview { max-height: 28rem; }
  `,
})
export class RegistryTaskEditor implements OnInit, HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router, { optional: true });
  private readonly auth = inject(AuthService);
  private readonly steps = inject(StepsApi);
  private readonly directory = inject(WorkspaceDirectory);

  readonly fieldTypes = FIELD_TYPES;
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  /** The row as read (edit), or the copy (duplicate), or nothing (new). */
  readonly original = signal<Pipeline | null>(null);
  readonly isEdit = computed(() => !!this.original()?.pipelineKey);
  readonly copyOf = signal<string>('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly ready = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  /** Set once saved, so leaving afterwards does not ask. */
  private saved = false;

  readonly topicSearch = createTopicSearch(this.http);
  readonly topicLabel = computed(() => this.topicSearch.selectedLabel() || this.original()?.topicName || '');
  readonly noTopicsYet = signal(false);
  readonly topicHint = computed(() => this.noTopicsYet()
    ? 'This workspace has no topic yet. Add one under Settings › Kafka & Topics (it publishes through the platform’s connection unless you add your own), then come back.'
    : 'The Kafka topic this pipeline\'s messages go out on. Many pipelines can share one; a task picks the topic first, then the pipeline.');

  /** Owner #17: the pipelines that use this registry task (edit only). */
  readonly users = signal<UsagePipeline[] | null>(null);

  /** Bumped on every edit so the preview, the parent lists and the change state recompute. */
  private readonly revision = signal(0);

  form: FormGroup = this.build(null);
  private snapshot = '';

  get fields(): FormArray { return this.form.get('fields') as FormArray; }

  readonly heading = computed(() => {
    const p = this.original();
    if (this.isEdit()) return p?.pipelineName || 'Edit registry task';
    return this.copyOf() ? 'Duplicate registry task' : 'New registry task';
  });

  ngOnInit(): void {
    const key = Number(this.route.snapshot.paramMap.get('pipelineKey'));
    const copyOf = Number(this.route.snapshot.queryParamMap.get('copyOf'));
    if (Number.isFinite(key) && key > 0) {
      this.read(key, false);
    } else if (Number.isFinite(copyOf) && copyOf > 0) {
      this.read(copyOf, true);
    } else {
      this.start(null);
      this.http.get<ApiResponse<unknown[]>>(`${API_BASE}/setting.json/topics`, { params: { q: '', limit: 1 } }).subscribe({
        next: r => this.noTopicsYet.set(r.status === API_SUCCESS && (r.data ?? []).length === 0),
        error: () => this.noTopicsYet.set(false),
      });
    }
  }

  private read(key: number, copy: boolean): void {
    this.http.get<ApiResponse<Pipeline>>(`${API_BASE}/pipeline.json/get`, { params: { pipelineKey: key } }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.loading.set(false); this.error.set(r.message || 'That pipeline no longer exists.'); return; }
        const p = r.data;
        if (copy) {
          // A copy has to claim a different pipeline: one live form per pipeline is a unique index.
          this.copyOf.set(p.pipelineName);
          this.start({
            ...p, pipelineKey: undefined, pipelineId: '', pipelineName: `${p.pipelineName} (copy)`,
            fields: (p.fields ?? []).map(field => ({ ...field, pipelineFieldId: undefined })),
          });
        } else {
          this.start(p);
          this.steps.taskPipelines({ pipelineKey: key }, this.isPlatformAdmin() ? (p as Pipeline & { tenantId?: number }).tenantId ?? null : null)
            .subscribe({ next: u => this.users.set(u.status === API_SUCCESS ? u.data ?? [] : null), error: () => this.users.set(null) });
        }
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The pipeline could not be read.'); },
    });
  }

  /** Builds the form for this row (or an empty one) and takes the snapshot unsaved changes are measured against. */
  start(p: Pipeline | null): void {
    this.original.set(p);
    this.form = this.build(p);
    this.form.valueChanges.subscribe(() => this.revision.update(n => n + 1));
    this.snapshot = this.fingerprint();
    this.loading.set(false);
    this.ready.set(true);
    this.revision.update(n => n + 1);
  }

  private build(p: Pipeline | null): FormGroup {
    return this.fb.group({
      pipelineKey: [p?.pipelineKey ?? null],
      pipelineId: [p?.pipelineId ?? '', Validators.required],
      pipelineName: [p?.pipelineName ?? '', Validators.required],
      sourceTaskTypeId: [p?.sourceTaskTypeId ?? null, Validators.required],
      description: [p?.description ?? ''],
      status: [p?.status ?? 'Active'],
      fields: this.fb.array(
        (p?.fields ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(field => this.fieldGroup(field))),
    });
  }

  private fieldGroup(field?: Partial<PipelineField>): FormGroup {
    return this.fb.group({
      pipelineFieldId: [field?.pipelineFieldId ?? null],
      tagKey: [field?.tagKey ?? '', Validators.required],
      tagParent: [field?.tagParent ?? ''],
      label: [field?.label ?? '', Validators.required],
      fieldType: [field?.fieldType ?? 'text'],
      required: [field?.required ?? false],
      defaultValue: [field?.defaultValue ?? ''],
      helpText: [field?.helpText ?? ''],
      promptId: [field?.promptId ?? null],
      promptName: [field?.promptName ?? ''],
      variableMap: [field?.variableMap ?? ''],
      onError: [field?.onError ?? 'fail'],
      runIn: [field?.runIn ?? 'server'],
      // The choices, parsed out of the stored text once and written back out in rows() (see pipeline.model.ts).
      choices: this.fb.array(parseFieldChoices(field?.fieldOptions).map(choice => this.choiceGroup(choice))),
    });
  }

  private choiceGroup(choice?: FieldChoice): FormGroup {
    return this.fb.group({ value: [choice?.value ?? ''], label: [choice?.label ?? ''] });
  }

  // ---- unsaved changes ------------------------------------------------------------------------------------------

  /** The request a save would send, as text: what the page compares with what it opened with. */
  private fingerprint(): string {
    const v = this.form.getRawValue();
    return JSON.stringify({ id: v.pipelineId, name: v.pipelineName, topic: v.sourceTaskTypeId, d: v.description, s: v.status, f: this.rows() });
  }

  readonly changed = computed(() => { this.revision(); return this.ready() && !this.saved && this.fingerprint() !== this.snapshot; });
  readonly changeState = computed(() => (this.changed() ? 'Unsaved changes' : this.isEdit() ? 'No changes' : ''));

  hasUnsavedChanges(): boolean {
    return this.ready() && !this.saved && this.fingerprint() !== this.snapshot;
  }

  @HostListener('window:beforeunload', ['$event'])
  warnOnUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  // ---- fields -----------------------------------------------------------------------------------------------------

  choicesArray(index: number): FormArray { return this.fields.at(index).get('choices') as FormArray; }

  addChoice(index: number): void { this.choicesArray(index).push(this.choiceGroup()); this.revision.update(n => n + 1); }

  removeChoice(index: number, choiceIndex: number): void { this.choicesArray(index).removeAt(choiceIndex); this.revision.update(n => n + 1); }

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

  /** What the Default value dropdown offers for a select; a stale default is carried as a last entry, not dropped. */
  defaultValueOptions(index: number): FieldChoice[] {
    const choices = this.choicesFor(index);
    const current = String(this.fields.at(index).get('defaultValue')?.value ?? '').trim();
    if (current && !choices.some(choice => choice.value === current)) {
      return [...choices, { value: current, label: `${current} (not one of the choices)` }];
    }
    return choices;
  }

  mappedCount(index: number): number {
    try { return Object.keys(JSON.parse(this.fields.at(index).get('variableMap')!.value || '{}')).length; } catch { return 0; }
  }

  /** Opens the drawer for one AI step; the fields above it are what its variables may read. */
  configureAiStep(index: number): void {
    const row = this.fields.at(index);
    const above = this.fields.controls.slice(0, index)
      .map(g => ({ tagKey: String(g.get('tagKey')!.value ?? '').trim(), label: String(g.get('label')!.value ?? '').trim() }))
      .filter(f => f.tagKey);
    const current: Partial<AiStepConfig> = { promptId: row.get('promptId')!.value, onError: row.get('onError')!.value || 'fail', runIn: row.get('runIn')!.value || 'server' };
    try { current.variableMap = JSON.parse(row.get('variableMap')!.value || '{}'); } catch { current.variableMap = {}; }
    this.dialog.open<AiStepConfig | undefined>(AiStepPanel, sidePanelConfig({ tagKey: String(row.get('tagKey')!.value ?? '').trim() || '…', fieldsAbove: above, current }))
      .closed.subscribe(result => {
        if (!result) return;
        row.patchValue({ promptId: result.promptId, variableMap: JSON.stringify(result.variableMap), onError: result.onError, runIn: result.runIn, required: false });
        this.namePrompt(row, result.promptId);
      });
  }

  private namePrompt(row: { patchValue(v: object): void }, promptId: number | null): void {
    if (!promptId) { row.patchValue({ promptName: '' }); return; }
    this.http.get<ApiResponse<{ name: string }>>(`${API_BASE}/aiPrompt.json/get`, { params: { promptId } }).subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) row.patchValue({ promptName: r.data.name }); },
      error: () => {},
    });
  }

  addField(): void { this.fields.push(this.fieldGroup()); this.revision.update(n => n + 1); }

  removeField(index: number): void { this.fields.removeAt(index); this.revision.update(n => n + 1); }

  move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.fields.length) return;
    const row = this.fields.at(index);
    this.fields.removeAt(index);
    this.fields.insert(target, row);
    this.revision.update(n => n + 1);
  }

  /** Every other field's tag -- a field cannot nest under itself. */
  parentChoices(index: number): string[] {
    this.revision();
    return this.fields.controls.map((row, i) => (i === index ? '' : String(row.get('tagKey')?.value ?? '').trim())).filter(Boolean);
  }

  // ---- checks (the server's own rules and words) -----------------------------------------------------------------

  private validate(rows: PipelineField[]): string | null {
    if (!rows.length) return 'A form needs at least one field.';
    const keys = new Set<string>();
    for (const field of rows) {
      if (!field.tagKey?.trim()) return 'Every field needs an XML tag.';
      if (!field.label?.trim()) return `The field for "${field.tagKey.trim()}" needs a label.`;
      if (keys.has(field.tagKey.trim())) return `Two fields both write <${field.tagKey.trim()}>. Each tag can appear once.`;
      keys.add(field.tagKey.trim());
    }
    for (const field of rows) {
      const parent = field.tagParent?.trim();
      if (parent && !keys.has(parent)) return `"${field.label.trim()}" nests under <${parent}>, which no field creates.`;
    }
    const choiceProblem = validateSelectChoices(rows);
    if (choiceProblem) return choiceProblem;
    const above = new Set<string>();
    for (const field of rows) {
      if (field.fieldType === 'ai') {
        if (!field.promptId) return `The AI step <${field.tagKey.trim()}> has no prompt. Configure it first.`;
        let map: Record<string, string> = {};
        try { map = JSON.parse(field.variableMap || '{}'); } catch { map = {}; }
        for (const [variable, raw] of Object.entries(map)) {
          if ((raw || '').startsWith('object:')) {
            if (!above.has('input_folder')) return `The AI step <${field.tagKey.trim()}> reads each input object for {{${variable}}}, but no field above it writes <input_folder>.`;
            continue;
          }
          const source = (raw || '').replace(/^file:/, '');
          if (source && !above.has(source)) return `The AI step <${field.tagKey.trim()}> reads <${source}> for {{${variable}}}, which is not above it.`;
        }
      }
      above.add(field.tagKey.trim());
    }
    return this.findNestingCycle(rows);
  }

  /** A choice whose value carries "=", the separator the stored format is built on, is refused by name. */
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

  /** Fields whose nesting loops back on itself have no root: refused by name. */
  private findNestingCycle(rows: PipelineField[]): string | null {
    const parentOf = new Map<string, string>();
    for (const field of rows) {
      const parent = field.tagParent?.trim();
      if (parent) parentOf.set(field.tagKey.trim(), parent);
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
            : `These fields nest in a loop: ${path.map(t => `<${t}>`).join(' under ')}. One of them has to sit at the top level.`;
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
        // Sent whatever the type reads: saveForm replaces the list wholesale, so nulling it deleted a select's choices.
        fieldOptions: serializeFieldChoices(this.choicesFor(index)) || null,
        position: index,
        promptId: value.fieldType === 'ai' ? (value.promptId ?? null) : null,
        variableMap: value.fieldType === 'ai' ? (value.variableMap || null) : null,
        onError: value.fieldType === 'ai' ? (value.onError || 'fail') : null,
        runIn: value.fieldType === 'ai' ? (value.runIn || 'server') : null,
      };
    });
  }

  /** Nests each field under its parent so the shape is visible before anything is saved. */
  readonly preview = computed(() => {
    this.revision();
    if (!this.ready()) return '';
    const rows = this.fields.controls.map(row => row.getRawValue());
    const named = rows.filter(row => String(row.tagKey ?? '').trim());
    if (!named.length) return '';
    const childrenOf = (parent: string): string[] => named
      .filter(row => (String(row.tagParent ?? '').trim() || '') === parent)
      .map(row => {
        const tag = String(row.tagKey).trim();
        const nested = childrenOf(tag);
        if (nested.length) return `<${tag}>\n${nested.map(line => '  ' + line.replace(/\n/g, '\n  ')).join('\n')}\n</${tag}>`;
        return `<${tag}>${row.defaultValue ?? ''}</${tag}>`;
      });
    return ['<?xml version="1.0" encoding="UTF-8"?>', ...childrenOf('')].join('\n');
  });

  readonly fieldCount = computed(() => { this.revision(); return this.ready() ? this.fields.length : 0; });

  workspaceName(id: number | null | undefined): string {
    return id == null ? '' : this.directory.names().get(id) ?? `Workspace ${id}`;
  }

  // ---- save -------------------------------------------------------------------------------------------------------

  save(): void {
    this.submitted.set(true);
    if (this.form.get('pipelineId')?.invalid || this.form.get('pipelineName')?.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const inputProblem = this.validateChoiceInputs();
    if (inputProblem) { this.form.markAllAsTouched(); this.toast.error(inputProblem); return; }
    const rows = this.rows();
    const problem = this.validate(rows);
    if (problem) { this.form.markAllAsTouched(); this.toast.error(problem); return; }

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
          this.saved = true;
          this.toast.success(response.message);
          this.router?.navigate(['/settings/task-registry']);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The pipeline could not be saved.'); },
    });
  }

  cancel(): void {
    this.router?.navigate(['/settings/task-registry']);
  }
}
