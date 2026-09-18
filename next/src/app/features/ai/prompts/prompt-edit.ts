import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { Combobox } from '../../../shared/ui/combobox';
import { ModelConnection } from '../ai-providers';
import { Prompt, PromptRun, PromptVariable, placeholdersOf } from './prompt-model';

/**
 * The prompt editor, with Try it beside it: the template and its variables on the left, the
 * rendered input and the model's answer on the right, so a change is run before it is
 * saved. Every save is a version; "Save & activate" is what a pipeline step may then run.
 */
@Component({
  selector: 'app-prompt-edit',
  imports: [ReactiveFormsModule, RouterLink, Field, Icon, Combobox, DatePipe, DecimalPipe],
  templateUrl: './prompt-edit.html',
})
export class PromptEdit implements OnInit {
  readonly promptId = input<string>();
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly isEdit = computed(() => !!this.promptId());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly loaded = signal<Prompt | null>(null);
  readonly connections = signal<ModelConnection[]>([]);
  readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

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
    variables: this.fb.array([] as FormGroup[]),
  });
  get variables(): FormArray<FormGroup> { return this.form.get('variables') as FormArray<FormGroup>; }

  readonly connectionOptions = computed(() => this.connections().map(c => ({
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
    return id != null ? this.connections().find(c => c.connectionId === Number(id)) ?? null : this.connections().find(c => c.isDefault) ?? null;
  });
  readonly modelHint = computed(() => {
    const c = this.connection();
    return c ? `Blank runs on the connection's default, ${c.defaultModel}.${c.models?.length ? ' Listed: ' + c.models.slice(0, 6).join(', ') + (c.models.length > 6 ? '…' : '') : ''}` : 'Pick a connection, or set a workspace default, so there is somewhere to run.';
  });
  /** Placeholders the template names that no variable declares -- shown, and refused at save. */
  readonly undeclared = computed(() => {
    const declared = new Set(this.declaredNames());
    return placeholdersOf(this.templateValue() ?? '').filter(n => !declared.has(n));
  });
  private readonly variablesVersion = signal(0);
  readonly declaredNames = computed(() => { this.variablesVersion(); return this.variables.controls.map(g => (g.get('name')!.value ?? '').trim()).filter(Boolean); });

  // ---- Try it ---------------------------------------------------------------------------------
  readonly trying = signal(false);
  readonly lastRun = signal<PromptRun | null>(null);
  readonly runs = signal<PromptRun[]>([]);
  readonly showRendered = signal(false);

  constructor() {
    // A placeholder typed into the template gets a variable row, so the two never drift.
    effect(() => {
      const missing = this.undeclared();
      untracked(() => { for (const name of missing) if (!this.variables.controls.some(g => g.get('name')!.value === name)) this.addVariable({ name, type: 'text', required: true, sample: '' }); });
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

  private load(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<Prompt>>(`${API_BASE}/aiPrompt.json/get`, { params: { promptId: this.promptId()! } }).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); this.router.navigate(['/ai/prompts']); return; }
        const p = r.data;
        this.loaded.set(p);
        this.form.patchValue({
          name: p.name, description: p.description ?? '', tenantId: p.tenantId ?? null, connectionId: p.connectionId ?? null, model: p.model ?? '',
          systemInstructions: p.systemInstructions ?? '', userTemplate: p.userTemplate, outputMode: p.outputMode, outputSchema: p.outputSchema ?? '',
          temperature: p.temperature ?? null, maxTokens: p.maxTokens ?? null, tags: p.tags ?? '',
        });
        this.variables.clear();
        for (const v of p.variables ?? []) this.addVariable(v);
        this.loadRuns();
      },
      error: err => { this.loading.set(false); this.toast.error(err?.error?.message || 'Could not load the prompt.'); },
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
      name: [v?.name ?? '', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)]],
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
    };
  }

  private valid(): boolean {
    this.submitted.set(true);
    if (this.form.invalid) { this.toast.error('Fill in the name and the message template.'); return false; }
    if (this.undeclared().length) { this.toast.error(`Declare ${this.undeclared().map(n => '{{' + n + '}}').join(', ')} as a variable, or take it out of the template.`); return false; }
    if (this.isPlatformAdmin() && !this.isEdit() && this.form.get('tenantId')!.value == null) { this.toast.error('Pick the workspace this prompt belongs to.'); return false; }
    return true;
  }

  save(activate: boolean): void {
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
    if (!this.valid()) return;
    this.trying.set(true);
    this.lastRun.set(null);
    this.http.post<ApiResponse<PromptRun>>(`${API_BASE}/aiPrompt.json/try`, this.body(false)).subscribe({
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
