import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { Combobox } from '../../../shared/ui/combobox';
import { Dialog } from '@angular/cdk/dialog';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { ModelConnection } from '../ai-providers';
import { Prompt, PromptRun, PromptVariable, placeholdersOf } from './prompt-model';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { SENSITIVITY_LEVELS, SENSITIVITY_TEXT } from '../../../shared/ui/sensitivity';
import { ManagedBanner } from '../../../shared/ui/managed-banner';

/**
 * The prompt editor, with Try it beside it: the template and its variables on the left, the
 * rendered input and the model's answer on the right, so a change is run before it is
 * saved. Every save is a version; "Save & activate" is what a pipeline step may then run.
 */
@Component({
  selector: 'app-prompt-edit',
  imports: [ReactiveFormsModule, RouterLink, Field, Icon, Combobox, ServerTimePipe, DecimalPipe, ManagedBanner],
  templateUrl: './prompt-edit.html',
})
export class PromptEdit implements OnInit {
  readonly promptId = input<string>();
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  /** MIG-254: a MANAGED workspace's prompts are our team's to change (and to try): shown, not saved. */
  readonly locked = computed(() => this.auth.builderLocked());
  private readonly dialog = inject(Dialog);

  readonly isEdit = computed(() => !!this.promptId());
  readonly loading = signal(false);
  /**
   * Why the prompt being edited could not be read. While set, no form is shown: a blank "Edit
   * prompt" form had nothing loaded, so its save carried no promptId and created a new prompt
   * rather than a version of this one.
   */
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly loaded = signal<Prompt | null>(null);
  readonly connections = signal<ModelConnection[]>([]);
  readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  /** MIG-243: the level of the data a prompt is sent -- the workspace's data policy for it decides the models and tools. */
  readonly sensitivities = [
    { value: '', label: 'Not set (read as internal)' },
    ...SENSITIVITY_LEVELS.map(l => ({ value: l as string, label: SENSITIVITY_TEXT[l].label })),
  ];

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    tenantId: [null as number | null],
    connectionId: [null as number | null],
    model: [''],
    systemInstructions: [''],
    userTemplate: ['', Validators.required],
    outputMode: ['text'],
    outputSchema: [''],
    temperature: [null as number | null],
    maxTokens: [null as number | null],
    tags: [''],
    dataSensitivity: [''],
    variables: this.fb.array([] as FormGroup[]),
  });
  get variables(): FormArray<FormGroup> { return this.form.get('variables') as FormArray<FormGroup>; }

  private readonly tenantIdValue = toSignal(this.form.get('tenantId')!.valueChanges, { initialValue: null as number | null });
  /** The workspace the prompt belongs to: the one it was saved in, else the one picked. */
  readonly effectiveTenantId = computed<number | null>(() => {
    const t = this.loaded() ? this.loaded()!.tenantId : this.tenantIdValue();
    return t == null ? null : Number(t);
  });
  /** A platform administrator on a new prompt, before a workspace is picked. */
  readonly needsWorkspace = computed(() => this.isPlatformAdmin() && !this.isEdit() && this.effectiveTenantId() == null);
  /**
   * The connections this prompt can run on. A platform administrator's list holds every
   * workspace's, and the editor offered all of them -- and, with none picked, named another
   * workspace's default as where Try it would run. A prompt runs on its own workspace's
   * connections, so that is what is offered. A tenant administrator's list is already scoped by the server.
   */
  readonly scopedConnections = computed(() => {
    if (!this.isPlatformAdmin()) return this.connections();
    if (this.needsWorkspace()) return [];
    const t = this.effectiveTenantId();
    return this.connections().filter(c => (c.tenantId == null ? null : Number(c.tenantId)) === t);
  });
  /** aiPrompt.json/get carries no tenantName, so the name comes from the workspace list. */
  readonly workspaceName = computed(() =>
    this.tenants().find(t => t.tenantId === this.effectiveTenantId())?.tenantName ?? this.loaded()?.tenantName ?? '');

  readonly connectionOptions = computed(() => this.scopedConnections().map(c => ({
    value: String(c.connectionId), label: c.name + (c.isDefault ? ' (default)' : ''), hint: `${c.provider} · ${c.defaultModel}`,
  })));
  readonly tenantOptions = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: t.tenantName })));

  private readonly connectionIdValue = toSignal(this.form.get('connectionId')!.valueChanges, { initialValue: null as number | null });
  private readonly templateValue = toSignal(this.form.get('userTemplate')!.valueChanges, { initialValue: '' });
  private readonly outputModeValue = toSignal(this.form.get('outputMode')!.valueChanges, { initialValue: 'text' });
  readonly outputMode = computed(() => this.outputModeValue() ?? 'text');
  /** The connection a run would use: the one named, else the workspace default. */
  readonly connection = computed(() => {
    const id = this.connectionIdValue();
    const list = this.scopedConnections();
    return id != null ? list.find(c => c.connectionId === Number(id)) ?? null : list.find(c => c.isDefault) ?? null;
  });
  readonly modelHint = computed(() => {
    if (this.needsWorkspace()) return 'Pick a workspace first; its connections and models are offered here.';
    const c = this.connection();
    return c ? `Blank runs on the connection's default, ${c.defaultModel}.${c.models?.length ? ' Listed: ' + c.models.slice(0, 6).join(', ') + (c.models.length > 6 ? '…' : '') : ''}` : 'Pick a connection, or set a workspace default, so there is somewhere to run.';
  });
  /** Placeholders the template names that no variable declares -- shown, and refused at save. */
  readonly undeclared = computed(() => {
    const declared = new Set(this.declaredNames());
    return placeholdersOf(this.templateValue() ?? '').filter(n => !declared.has(n));
  });
  private readonly variablesVersion = signal(0);
  /** Only names a placeholder can use: a chip for "bad-name" would insert a placeholder that never fills. */
  readonly declaredNames = computed(() => { this.variablesVersion(); return this.variables.controls.map(g => (g.get('name')!.value ?? '').trim()).filter(n => VARIABLE_NAME.test(n)); });

  // ---- Try it ---------------------------------------------------------------------------------
  readonly trying = signal(false);

  /**
   * Try it on a file. A variable can take its value from an object in any bucket -- read the
   * way the file chat reads it, whatever the type (a PDF, a spreadsheet, an image described by
   * the vision model, a recording transcribed) -- without that text becoming the saved sample:
   * a sample is a line or two that documents the variable, and sixty thousand characters of a
   * CSV are not that. So the file's text lives here, keyed by variable, and rides along as
   * `values` on the try alone. A variable named file_name is filled with the file's name at
   * the same time, which is what every file-type prompt asks for beside the text.
   */
  readonly trySources = signal<Record<string, TrySource>>({});
  readonly reading = signal<string | null>(null);
  readonly trySourceList = computed(() => Object.values(this.trySources()));

  fromFile(variableName: string): void {
    const name = (variableName || '').trim();
    if (!name) { this.toast.error('Name the variable first.'); return; }
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({ heading: `Fill {{${name}}} from a file` }))
      .closed.subscribe(picked => { if (picked) this.readObject(name, picked); });
  }

  private readObject(variable: string, picked: PickedObject): void {
    this.reading.set(variable);
    this.http.get<ApiResponse<ObjectText>>(`${API_BASE}/aiPrompt.json/objectText`, { params: { bucket: picked.bucket, key: picked.key } }).subscribe({
      next: r => {
        this.reading.set(null);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'That file could not be read.'); return; }
        const d = r.data;
        this.trySources.update(all => {
          const next = { ...all, [variable]: { variable, bucket: d.bucket, key: d.key, name: d.name, kind: d.kind, chars: d.chars, totalChars: d.totalChars, truncated: d.truncated, text: d.text } };
          const fileName = this.variables.controls.map(g => g.get('name')!.value).find(n => n === 'file_name' && n !== variable);
          if (fileName) next[fileName] = { variable: fileName, bucket: d.bucket, key: d.key, name: d.name, kind: 'name', chars: d.name.length, totalChars: d.name.length, truncated: false, text: d.name };
          return next;
        });
        this.toast.success(r.message);
      },
      error: err => { this.reading.set(null); this.toast.error(err?.error?.message || 'That file could not be read.'); },
    });
  }

  clearSource(variable: string): void {
    this.trySources.update(all => { const next = { ...all }; delete next[variable]; return next; });
  }
  sourceOf(variable: string): TrySource | undefined { return this.trySources()[variable]; }
  readonly lastRun = signal<PromptRun | null>(null);
  readonly runs = signal<PromptRun[]>([]);
  readonly showRendered = signal(false);

  constructor() {
    // A placeholder typed into the template gets a variable row, so the two never drift.
    effect(() => {
      const missing = this.undeclared();
      untracked(() => { for (const name of missing) if (!this.variables.controls.some(g => g.get('name')!.value === name)) this.addVariable({ name, type: 'text', required: true, sample: '' }); });
    });
    // Picking another workspace on a new prompt drops a connection that workspace does not have.
    this.form.get('tenantId')!.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.isPlatformAdmin() || this.isEdit()) return;
      const id = this.form.get('connectionId')!.value;
      if (id != null && !this.scopedConnections().some(c => c.connectionId === Number(id))) this.form.patchValue({ connectionId: null });
    });
  }

  ngOnInit(): void {
    this.http.get<ApiResponse<ModelConnection[]>>(`${API_BASE}/aiConnection.json/list`).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.connections.set(r.data ?? []); },
      error: () => {},
    });
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({ next: r => { if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []); }, error: () => {} });
    }
    if (this.isEdit()) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.http.get<ApiResponse<Prompt>>(`${API_BASE}/aiPrompt.json/get`, { params: { promptId: this.promptId()! } }).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); this.router.navigate(['/ai/prompts']); return; }
        const p = r.data;
        this.loaded.set(p);
        this.form.patchValue({
          name: p.name, description: p.description ?? '', tenantId: p.tenantId ?? null, connectionId: p.connectionId ?? null, model: p.model ?? '',
          systemInstructions: p.systemInstructions ?? '', userTemplate: p.userTemplate, outputMode: p.outputMode, outputSchema: p.outputSchema ?? '',
          temperature: p.temperature ?? null, maxTokens: p.maxTokens ?? null, tags: p.tags ?? '', dataSensitivity: p.dataSensitivity ?? '',
        });
        this.variables.clear();
        for (const v of p.variables ?? []) this.addVariable(v);
        this.loadRuns();
      },
      error: err => { this.loading.set(false); this.loadError.set(err?.error?.message || 'Could not load the prompt.'); },
    });
  }

  private loadRuns(): void {
    if (!this.promptId()) return;
    this.http.get<ApiResponse<PromptRun[]>>(`${API_BASE}/aiPrompt.json/runs`, { params: { promptId: this.promptId()!, limit: 10 } }).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.runs.set(r.data ?? []); },
      error: () => {},
    });
  }

  addVariable(v?: Partial<PromptVariable>): void {
    this.variables.push(this.fb.group({
      name: [v?.name ?? '', [Validators.required, Validators.pattern(VARIABLE_NAME)]],
      type: [v?.type ?? 'text'],
      required: [v?.required ?? true],
      sample: [v?.sample ?? ''],
    }));
    this.variablesVersion.update(n => n + 1);
  }
  removeVariable(i: number): void { this.variables.removeAt(i); this.variablesVersion.update(n => n + 1); }
  onVariableChanged(): void { this.variablesVersion.update(n => n + 1); }

  /** Puts {{name}} at the caret of the template box. */
  insertVariable(name: string, box: HTMLTextAreaElement): void {
    const start = box.selectionStart ?? box.value.length, end = box.selectionEnd ?? start;
    const next = box.value.slice(0, start) + `{{${name}}}` + box.value.slice(end);
    this.form.patchValue({ userTemplate: next });
    queueMicrotask(() => { box.focus(); box.setSelectionRange(start + name.length + 4, start + name.length + 4); });
  }

  private body(activate: boolean): any {
    const v = this.form.getRawValue();
    return {
      promptId: this.loaded()?.promptId, version: this.loaded()?.version,
      name: v.name, description: v.description || null, tenantId: v.tenantId, connectionId: v.connectionId ? Number(v.connectionId) : null,
      model: v.model || null, systemInstructions: v.systemInstructions || null, userTemplate: v.userTemplate,
      variables: this.variables.controls.map(g => ({ name: g.get('name')!.value, type: g.get('type')!.value, required: !!g.get('required')!.value, sample: g.get('sample')!.value || null })),
      outputMode: v.outputMode, outputSchema: v.outputMode === 'json' ? (v.outputSchema || null) : null,
      temperature: v.temperature === null || v.temperature === '' ? null : Number(v.temperature),
      maxTokens: v.maxTokens === null || v.maxTokens === '' ? null : Number(v.maxTokens),
      tags: v.tags || null, activate,
      // The service keeps the level when the field is missing and clears it when it is blank: always sent, so it is as shown.
      dataSensitivity: v.dataSensitivity ?? '',
    };
  }

  private valid(): boolean {
    this.submitted.set(true);
    // Every control shows its own error now, and the toast names what is actually wrong: it used
    // to blame the name and template whatever failed, including a variable name or the temperature.
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const f = this.form;
      this.toast.error(
        f.get('name')!.invalid || f.get('userTemplate')!.invalid ? 'Fill in the name and the message template.'
        : this.variables.invalid ? 'Name every variable with letters, digits and underscores, starting with a letter or underscore.'
        : 'Check the highlighted fields.');
      return false;
    }
    if (this.undeclared().length) { this.toast.error(`Declare ${this.undeclared().map(n => '{{' + n + '}}').join(', ')} as a variable, or take it out of the template.`); return false; }
    if (this.isPlatformAdmin() && !this.isEdit() && this.form.get('tenantId')!.value == null) { this.toast.error('Pick the workspace this prompt belongs to.'); return false; }
    return true;
  }

  save(activate: boolean): void {
    if (this.locked()) return;
    // Editing, with nothing read back: saving would create a prompt, not a version of this one.
    if (this.isEdit() && !this.loaded()) return;
    if (!this.valid()) return;
    this.saving.set(true);
    this.http.post<ApiResponse<Prompt>>(`${API_BASE}/aiPrompt.json/save`, this.body(activate)).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.router.navigate(['/ai/prompts']);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The prompt could not be saved.'); },
    });
  }

  tryIt(): void {
    if (this.locked() || !this.valid()) return;
    this.trying.set(true);
    this.lastRun.set(null);
    const values: Record<string, string> = {};
    for (const source of this.trySourceList()) values[source.variable] = source.text;
    this.http.post<ApiResponse<PromptRun>>(`${API_BASE}/aiPrompt.json/try`, { ...this.body(false), values }).subscribe({
      next: r => {
        this.trying.set(false);
        if (r.data) this.lastRun.set(r.data);
        if (r.status !== API_SUCCESS) this.toast.error(r.message);
        this.loadRuns();
      },
      error: err => { this.trying.set(false); this.toast.error(err?.error?.message || 'The try could not run.'); },
    });
  }

  prettyOutput(run: PromptRun): string {
    if (!run.output) return '';
    if (this.outputMode() !== 'json') return run.output;
    try { return JSON.stringify(JSON.parse(run.output), null, 2); } catch { return run.output; }
  }
}

/** What a {{placeholder}} can be called; the server holds variables to the same rule. */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What GET aiPrompt.json/objectText answers. */
interface ObjectText {
  bucket: string; key: string; name: string; kind: 'text' | 'transcript' | 'description';
  text: string; chars: number; totalChars: number; truncated: boolean;
}

/** A Try-it value that came from a file, and where. */
export interface TrySource {
  variable: string; bucket: string; key: string; name: string;
  kind: 'text' | 'transcript' | 'description' | 'name';
  chars: number; totalChars: number; truncated: boolean; text: string;
}
