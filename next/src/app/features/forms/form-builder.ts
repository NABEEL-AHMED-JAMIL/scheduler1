import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { ManagedBanner } from '../../shared/ui/managed-banner';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { AnswerChange, FormRenderer } from './form-renderer';
import {
  ALLOWED_EXTENSIONS, Answers, COLUMN_TYPES, FIELD_TYPES, FORM_STATUSES, FieldRule, FieldType, FormDraft, FormField, FormStatus, FormSummary,
  LinkableJob, MAX_FIELDS, RULE_OPS, blankField, definitionProblems, draftForSave, formTone, formsOf, lookupSources, optionsFromText,
  typeDefaults, typeLabel, uniqueKey,
} from './forms.model';

type RuleKind = 'showWhen' | 'requiredWhen';
import { FormsApi } from './forms.service';
import { WorkflowSummary, WorkflowsApi } from '../workflows/workflows.api';

/** A field while it is being built: whether its key still follows its label (a new field's does, a saved one's never). */
type BuilderField = FormField & { autoKey?: boolean };
type BuilderDraft = Omit<FormDraft, 'fields'> & { fields: BuilderField[] };

/**
 * Forms › Form builder (Wave 5 Forms lite; page 'forms'). Every member holding the page sees the workspace's Active forms
 * and fills them in; a workspace administrator also builds them: name, description, status (Draft, Active, Archived),
 * the fields -- added, reordered, removed, each with its label, key, type, required mark, help and a choice's options --
 * the job a submission starts, and a preview drawn exactly as the fill-in page draws it.
 *
 * In a MANAGED workspace building is our team's (MIG-244 builder action): the administrator sees the same editor
 * read-only, inside one .form-lock fieldset, and can still fill forms in.
 */
@Component({
  selector: 'app-form-builder',
  imports: [Icon, TableShell, ManagedBanner, ServerTimePipe, RouterLink, FormRenderer],
  templateUrl: './form-builder.html',
})
export class FormBuilder implements OnInit {
  private readonly api = inject(FormsApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly workflowsApi = inject(WorkflowsApi);
  /** MIG-279: the workspace's workflows a form may start (Active and published). */
  readonly workflows = signal<WorkflowSummary[]>([]);

  readonly forms = signal<FormSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showArchived = signal(false);
  readonly jobs = signal<LinkableJob[]>([]);

  /** The form open in the editor; null shows the list. */
  readonly draft = signal<BuilderDraft | null>(null);
  readonly editorLoading = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly attempted = signal(false);
  readonly previewing = signal(false);
  readonly previewAnswers = signal<Answers>({});
  readonly newType = signal<FieldType>('text');

  readonly isAdmin = computed(() => this.auth.isTenantAdmin());
  readonly canBuild = computed(() => this.auth.canBuild());
  /** Read-only editor: an administrator in a MANAGED workspace (our team builds there). */
  readonly locked = computed(() => !this.canBuild());
  readonly canSeeSubmissions = computed(() => this.auth.canOpen('form-submissions'));
  readonly problems = computed(() => { const d = this.draft(); return d ? definitionProblems(d) : {}; });
  readonly problemCount = computed(() => Object.keys(this.problems()).length);
  readonly fieldTypes = FIELD_TYPES;
  readonly statuses = FORM_STATUSES;
  readonly maxFields = MAX_FIELDS;
  readonly typeLabel = typeLabel;
  readonly tone = formTone;
  readonly columnTypes = COLUMN_TYPES;
  readonly ruleOps = RULE_OPS;
  readonly allowedExtensions = ALLOWED_EXTENSIONS;
  readonly optionsFromText = optionsFromText;
  readonly ruleKinds: { key: RuleKind; label: string; none: string }[] = [
    { key: 'showWhen', label: 'Show only when', none: 'Always shown' },
    { key: 'requiredWhen', label: 'Also required when', none: 'No extra rule' },
  ];
  /** Other forms' fields, fetched when a lookup names the form (by id). */
  readonly sourceForms = signal<Record<number, FormSummary>>({});
  /** The forms a lookup may read: every other form of the workspace. */
  readonly otherForms = computed(() => this.forms().filter(f => f.formId !== this.draft()?.formId));
  /** The preview's lookups: what the saved form's lookups offer now (a new or changed lookup shows its values once saved). */
  readonly previewLookups = signal<Record<string, string[]>>({});

  ngOnInit(): void {
    this.load();
    if (this.isAdmin()) {
      this.workflowsApi.list().subscribe({
        next: r => { if (r.status === API_SUCCESS) this.workflows.set((r.data ?? []).filter(w => w.status === 'Active' && w.currentVersion > 0)); },
        error: () => { /* no workflows to pick; a saved one still shows its key */ },
      });
      this.api.linkableJobs().subscribe({
        next: r => { if (r.status === API_SUCCESS) this.jobs.set(r.data ?? []); },
        error: () => { /* the job list stays empty; a saved link still shows its name */ },
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.showArchived()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.forms.set(formsOf(r.data));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The forms could not be read.'); },
    });
  }

  toggleArchived(): void {
    this.showArchived.update(v => !v);
    this.load();
  }

  // ---- the editor ----------------------------------------------------------------------------------------------

  newForm(): void {
    if (!this.canBuild()) return;
    const first = blankField([]);
    this.open({ formId: null, name: '', description: '', status: 'Draft', jobId: null, workflowKey: null, fields: [{ ...first, autoKey: true }] });
  }

  edit(form: FormSummary): void {
    if (!this.isAdmin()) return;
    this.editorLoading.set(true);
    this.api.fetch(form.formId).subscribe({
      next: r => {
        this.editorLoading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The form could not be opened.'); return; }
        const f = r.data;
        this.previewLookups.set(f.lookupValues ?? {});
        this.open({
          formId: f.formId, name: f.name, description: f.description ?? '', status: f.status, jobId: f.jobId ?? null,
          workflowKey: f.workflowKey ?? null,
          fields: (f.fields ?? []).map(field => ({ ...field, help: field.help ?? '', autoKey: false })),
        });
      },
      error: err => { this.editorLoading.set(false); this.toast.error(err?.error?.message || 'The form could not be opened.'); },
    });
  }

  private open(draft: BuilderDraft): void {
    this.draft.set(draft);
    for (const f of draft.fields) if (f.type === 'lookup' && f.lookup?.formId) this.loadSource(f.lookup.formId);
    this.saveError.set('');
    this.attempted.set(false);
    this.previewing.set(false);
    this.previewAnswers.set({});
  }

  close(): void {
    this.draft.set(null);
  }

  patch(patch: Partial<BuilderDraft>): void {
    if (this.locked()) return;
    this.draft.update(d => d ? { ...d, ...patch } : d);
  }

  /** The job a submission starts: an id from the list, or none. */
  setJob(value: string): void {
    this.patch({ jobId: value ? Number(value) : null });
  }

  setField(index: number, patch: Partial<BuilderField>): void {
    if (this.locked()) return;
    this.draft.update(d => {
      if (!d) return d;
      const fields = d.fields.map((f, i) => {
        if (i !== index) return f;
        const next: BuilderField = { ...f, ...patch };
        if (patch.key !== undefined) next.autoKey = false;
        if (patch.label !== undefined && f.autoKey) {
          next.key = uniqueKey(patch.label, d.fields.filter((_, j) => j !== index).map(o => o.key));
        }
        if (patch.type === 'choice' && !(next.options ?? []).length) next.options = ['Option 1'];
        if (patch.type && patch.type !== f.type) Object.assign(next, typeDefaults(patch.type), keepOwn(f, patch.type));
        return next;
      });
      return { ...d, fields };
    });
  }

  setOptions(index: number, text: string): void {
    this.setField(index, { options: optionsFromText(text) });
  }

  // ---- MIG-277: tables, files, lookups, rules ----------------------------------------------------------------

  setColumn(index: number, column: number, patch: Partial<FormField>): void {
    const f = this.draft()?.fields[index];
    if (!f) return;
    const columns = (f.columns ?? []).map((c, ci) => {
      if (ci !== column) return c;
      const next = { ...c, ...patch };
      if (patch.label !== undefined && (c.key === uniqueKey(c.label, []) || !c.key)) {
        next.key = uniqueKey(patch.label, (f.columns ?? []).filter((_, j) => j !== column).map(o => o.key));
      }
      if (patch.type === 'choice' && !(next.options ?? []).length) next.options = ['Option 1'];
      return next;
    });
    this.setField(index, { columns });
  }

  addColumn(index: number): void {
    const f = this.draft()?.fields[index];
    if (!f) return;
    const taken = (f.columns ?? []).map(c => c.key);
    const label = `Column ${taken.length + 1}`;
    this.setField(index, { columns: [...(f.columns ?? []), { key: uniqueKey(label, taken), label, type: 'text', required: false }] });
  }

  removeColumn(index: number, column: number): void {
    const f = this.draft()?.fields[index];
    if (!f) return;
    this.setField(index, { columns: (f.columns ?? []).filter((_, ci) => ci !== column) });
  }

  setAccept(index: number, text: string): void {
    const accept = [...new Set(text.split(/[\s,;]+/).map(a => a.trim().toLowerCase().replace(/^\./, '')).filter(a => !!a))];
    this.setField(index, { accept });
  }

  hasWorkflow(key: string): boolean {
    return this.workflows().some(w => w.key === key);
  }

  numberOr(text: string, otherwise: number): number {
    const n = Number(text);
    return text === '' || !Number.isFinite(n) ? otherwise : Math.round(n);
  }

  /** A lookup's source form: its fields are fetched to pick from, and its values for the preview. */
  setLookupForm(index: number, value: string): void {
    const formId = value ? Number(value) : null;
    this.setField(index, { lookup: { formId, field: '' } });
    if (formId) this.loadSource(formId);
  }

  sourceFields(formId: number | null | undefined): FormField[] {
    return formId ? lookupSources(this.sourceForms()[formId]?.fields) : [];
  }

  private loadSource(formId: number): void {
    if (this.sourceForms()[formId]) return;
    this.api.fetch(formId).subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) this.sourceForms.update(m => ({ ...m, [formId]: r.data! })); },
      error: () => { /* the field list stays empty; the save says what is wrong */ },
    });
  }

  ruleOf(f: FormField, which: RuleKind): FieldRule | null {
    return f[which] ?? null;
  }

  setRule(index: number, which: RuleKind, patch: Partial<FieldRule>): void {
    const f = this.draft()?.fields[index];
    if (!f) return;
    if (patch.field === '') { this.setField(index, { [which]: null }); return; }
    const current: FieldRule = f[which] ?? { field: '', op: 'eq', value: '' };
    const next: FieldRule = { ...current, ...patch };
    if (patch.field && patch.field !== current.field) {
      const target = this.draft()?.fields.find(x => x.key === patch.field);
      next.op = target?.type === 'table' || target?.type === 'file' || target?.type === 'signature' ? 'filled' : 'eq';
      next.value = target?.type === 'yesNo' ? true : '';
    }
    this.setField(index, { [which]: next });
  }

  needsValue(rule: FieldRule): boolean {
    return !!RULE_OPS.find(o => o.value === rule.op)?.needsValue;
  }

  targetOf(fields: FormField[], rule: FieldRule): FormField | undefined {
    return fields.find(f => f.key === rule.field);
  }

  ruleValueText(rule: FieldRule): string {
    return Array.isArray(rule.value) ? rule.value.join(', ') : rule.value == null ? '' : String(rule.value);
  }

  optionsText(field: FormField): string {
    return (field.options ?? []).join('\n');
  }

  addField(): void {
    const d = this.draft();
    if (this.locked() || !d || d.fields.length >= MAX_FIELDS) return;
    const field = blankField(d.fields.map(f => f.key), this.newType());
    this.patch({ fields: [...d.fields, { ...field, autoKey: true }] });
  }

  moveField(index: number, by: -1 | 1): void {
    const d = this.draft();
    const to = index + by;
    if (this.locked() || !d || to < 0 || to >= d.fields.length) return;
    const fields = [...d.fields];
    [fields[index], fields[to]] = [fields[to], fields[index]];
    this.patch({ fields });
  }

  removeField(index: number): void {
    const d = this.draft();
    if (this.locked() || !d) return;
    this.patch({ fields: d.fields.filter((_, i) => i !== index) });
  }

  previewChange(event: AnswerChange): void {
    this.previewAnswers.update(a => ({ ...a, [event.key]: event.value }));
  }

  save(): void {
    const d = this.draft();
    if (!d || this.locked() || this.saving()) return;
    this.attempted.set(true);
    if (this.problemCount()) { this.saveError.set('Fix the problems marked below, then save.'); return; }
    this.saving.set(true);
    this.saveError.set('');
    this.api.save(draftForSave(d)).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.saveError.set(r.message || 'The form was not saved.'); return; }
        this.toast.success(r.message || 'Form saved.');
        const f = r.data;
        this.previewLookups.set(f.lookupValues ?? {});
        this.draft.update(cur => cur ? { ...cur, formId: f.formId, fields: cur.fields.map(x => ({ ...x, autoKey: false })) } : cur);
        this.load();
      },
      error: err => { this.saving.set(false); this.saveError.set(err?.error?.message || 'The form was not saved. Try again.'); },
    });
  }

  setStatus(form: FormSummary, status: FormStatus): void {
    if (!this.canBuild()) return;
    this.api.setStatus(form.formId, status).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'The form\'s status was not changed.'),
    });
  }
}

/** What a field keeps of its own when its type changes to one that has the same setting. */
function keepOwn(f: FormField, type: FieldType): Partial<FormField> {
  if (type === 'table' && f.columns?.length) return { columns: f.columns, maxRows: f.maxRows };
  if (type === 'file' && f.accept?.length) return { accept: f.accept, maxSizeMb: f.maxSizeMb, maxFiles: f.maxFiles };
  if (type === 'lookup' && f.lookup) return { lookup: f.lookup };
  return {};
}
