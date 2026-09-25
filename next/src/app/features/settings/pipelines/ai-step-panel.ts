import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Combobox } from '../../../shared/ui/combobox';
import { Prompt } from '../../ai/prompts/prompt-model';

/** What the panel hands back when the person is done. */
export interface AiStepConfig {
  promptId: number | null;
  /** prompt variable → source tag, or "file:<tag>" when the tag names an object the worker reads. */
  variableMap: Record<string, string>;
  onError: 'fail' | 'continue';
  /** "server": before dispatch (default). "worker": the consumer runs it, and may read a file. */
  runIn: 'server' | 'worker';
}

/**
 * Configures one AI step of a pipeline, in a drawer beside the (already full) pipeline
 * dialog: which prompt runs, which earlier field feeds each of its variables, and what a
 * failed call does to the run. Only fields above the step can be read -- a later one has
 * no value yet when the step runs before dispatch -- so that is all the box offers.
 */
@Component({
  selector: 'app-ai-step-panel',
  imports: [SidePanel, Combobox, RouterLink],
  template: `
    <app-side-panel [heading]="'AI step · <' + data.tagKey + '>'" [subtitle]="runIn() === 'worker' ? 'The worker runs it as the task runs; the answer is written to this tag.' : 'Runs before dispatch; the answer is written to this tag.'">
      <div class="form-stack">
        <div>
          <label class="label" for="aiStepPrompt">Prompt</label>
          <app-combobox id="aiStepPrompt" [selected]="promptId()" (selectedChange)="pickPrompt($event)"
                        placeholder="Search active prompts…" [allowClear]="false" [options]="promptOptions()" />
          @if (!loaded()) {
            <p class="text-xs text-[color:var(--text-muted)] mt-1 flex items-center gap-1.5">
              <span class="spinner [--spinner-size:0.85rem]" role="status" aria-label="Loading prompts"></span>Loading prompts…
            </p>
          } @else if (loadError()) {
            <p class="text-xs text-crit-500 mt-1" role="alert">{{ loadError() }}
              <button type="button" class="link-inline ml-1" (click)="loadPrompts()">Try again</button></p>
          } @else if (!prompts().length) {
            <p class="text-xs text-warn-500 mt-1">No active prompt in this workspace. <a class="link-inline" routerLink="/assistants/prompts/new" (click)="ref.close()">Create one</a> first.</p>
          } @else if (prompt(); as p) {
            <p class="text-xs text-[color:var(--text-muted)] mt-1">v{{ p.version }} · {{ p.connectionName || 'workspace default' }} · <span class="mono">{{ p.effectiveModel || '' }}</span> · {{ p.outputMode === 'json' ? 'JSON' : 'text' }} output</p>
          }
        </div>

        @if (prompt(); as p) {
          <div>
            <label class="label" for="aiStepRunIn">Runs</label>
            <select id="aiStepRunIn" class="input" [value]="runIn()" (change)="setRunIn($any($event.target).value)">
              <option value="server">Before dispatch, on the server</option>
              <option value="worker">In the worker, as the task runs</option>
            </select>
            <p class="text-xs text-[color:var(--text-muted)] mt-1">
              @if (runIn() === 'worker' && loopsObjects()) { Runs once per object under the task's input folder; each answer is written to the output folder as &lt;object&gt;.{{ data.tagKey }}.json or .txt, and this tag holds the manifest. }
              @else if (runIn() === 'worker') { The worker resolves the variables — including a file a field names, or each object in the input folder — and asks the console to run the prompt; the key stays on the server. }
              @else { The answer is in the task's document before the worker receives it; the worker needs no change. }
            </p>
          </div>

          <div>
            <span class="label">Variables</span>
            <p class="text-xs text-[color:var(--text-muted)] mb-1.5">Each of the prompt's variables reads one field above this step.</p>
            @if (!p.variables.length) {
              <p class="text-sm rounded-md px-3 py-2 bg-sunken">This prompt has no variables; it says the same thing every run.</p>
            } @else {
              <table class="table-modern">
                <thead><tr><th>Variable</th><th>Reads field</th></tr></thead>
                <tbody>
                  @for (v of p.variables; track v.name) {
                    <tr>
                      <td><span class="mono">{{ '{{' }}{{ v.name }}{{ '}}' }}</span>@if (v.required) { <span class="text-crit-500" title="required"> *</span> }
                        @if (v.description) { <div class="text-xs text-[color:var(--text-muted)]">{{ v.description }}</div> }</td>
                      <td>
                        <div class="flex flex-col gap-1">
                          <!-- selected on the option, not value on the select: the options render
                               after the select's value would be set, and the browser then resets it. -->
                          <select class="input min-w-0 flex-1" [attr.aria-label]="'Field for ' + v.name"
                                  (change)="setSource(v.name, $any($event.target).value)">
                            <option value="" [selected]="!tagOf(v.name)">{{ v.required ? '— pick a field —' : '(not sent)' }}</option>
                            @for (f of data.fieldsAbove; track f.tagKey) { <option [value]="f.tagKey" [selected]="f.tagKey === tagOf(v.name)">{{ f.label }} &lt;{{ f.tagKey }}&gt;</option> }
                            @if (runIn() === 'worker' && hasInputFolder()) {
                              <!-- The worker loops over the task's input folder: one run per object, each
                                   answer written to the output folder. -->
                              <option value="object:text" [selected]="map()[v.name] === 'object:text'">Each input object — its contents</option>
                              <option value="object:name" [selected]="map()[v.name] === 'object:name'">Each input object — its key</option>
                            }
                          </select>
                          @if (runIn() === 'worker' && tagOf(v.name) && !isObject(v.name)) {
                            <select class="input" [value]="asFile(v.name) ? 'file' : 'text'" [attr.aria-label]="'How to send ' + v.name" (change)="setAs(v.name, $any($event.target).value)"
                                    title="Send the tag's text, or the contents of the object the tag names">
                              <option value="text">send the tag's text</option>
                              <option value="file">send the contents of the object it names</option>
                            </select>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (!data.fieldsAbove.length) {
                <p class="text-xs text-warn-500 mt-1.5">Nothing sits above this step yet — move it below the fields it should read.</p>
              }
            }
          </div>

          <div>
            <label class="label" for="aiStepOnError">If the model call fails</label>
            <select id="aiStepOnError" class="input" [value]="onError()" (change)="onError.set($any($event.target).value)">
              <option value="fail">Fail the run — nothing is dispatched</option>
              <option value="continue">Continue with the tag empty</option>
            </select>
            <p class="text-xs text-[color:var(--text-muted)] mt-1">A failure is a provider error, the daily budget, or JSON that never validated. Either way the run's history records it.</p>
          </div>
        }
      </div>
      <div foot>
        <span class="text-xs text-[color:var(--text-muted)]">{{ missing().length ? missing().length + ' required variable(s) still unmapped' : 'Ready' }}</span>
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="!promptId() || missing().length > 0" (click)="apply()">Apply</button>
      </div>
    </app-side-panel>
  `,
})
export class AiStepPanel {
  readonly ref = inject<DialogRef<AiStepConfig | undefined>>(DialogRef);
  readonly data = inject<{ tagKey: string; fieldsAbove: { tagKey: string; label: string }[]; current?: Partial<AiStepConfig> }>(DIALOG_DATA);
  private readonly http = inject(HttpClient);

  readonly prompts = signal<Prompt[]>([]);
  readonly loaded = signal(false);
  /** Why the prompt list could not be read; an empty workspace and a failed request are not the same. */
  readonly loadError = signal('');
  readonly promptId = signal<number | null>(this.data.current?.promptId ?? null);
  readonly map = signal<Record<string, string>>({ ...(this.data.current?.variableMap ?? {}) });
  readonly onError = signal<'fail' | 'continue'>(this.data.current?.onError ?? 'fail');
  readonly runIn = signal<'server' | 'worker'>(this.data.current?.runIn ?? 'server');

  readonly promptOptions = computed(() => this.prompts().map(p => ({ value: String(p.promptId), label: p.name, hint: `v${p.version} · ${p.variables.map(v => v.name).join(', ')}` })));
  readonly prompt = computed(() => this.prompts().find(p => p.promptId === this.promptId()) ?? null);
  readonly missing = computed(() => (this.prompt()?.variables ?? []).filter(v => v.required && !this.tagOf(v.name)).map(v => v.name));

  /** The tag a variable reads, without the file: marker; an object: source reads as itself. */
  tagOf(variable: string): string { return (this.map()[variable] || '').replace(/^file:/, ''); }
  isObject(variable: string): boolean { return (this.map()[variable] || '').startsWith('object:'); }
  readonly loopsObjects = computed(() => Object.values(this.map()).some(v => v.startsWith('object:')));
  /** The per-object loop needs the pipeline to say where its objects are. */
  readonly hasInputFolder = computed(() => this.data.fieldsAbove.some(f => f.tagKey === 'input_folder'));
  asFile(variable: string): boolean { return (this.map()[variable] || '').startsWith('file:'); }
  setAs(variable: string, mode: string): void {
    const tag = this.tagOf(variable);
    if (tag) this.map.update(m => ({ ...m, [variable]: mode === 'file' ? 'file:' + tag : tag }));
  }
  /** A step moved back to the server cannot read files; those become plain text reads. */
  setRunIn(mode: string): void {
    const next = mode === 'worker' ? 'worker' : 'server';
    this.runIn.set(next);
    // Back on the server a step cannot read files or loop over objects: those sources go.
    if (next === 'server') this.map.update(m => Object.fromEntries(Object.entries(m).filter(([, v]) => !v.startsWith('object:')).map(([k, v]) => [k, v.replace(/^file:/, '')])));
  }

  constructor() {
    this.loadPrompts();
  }

  loadPrompts(): void {
    this.loaded.set(false);
    this.loadError.set('');
    this.http.get<ApiResponse<Prompt[]>>(`${API_BASE}/aiPrompt.json/list`).subscribe({
      next: r => {
        this.loaded.set(true);
        if (r.status === API_SUCCESS) this.prompts.set((r.data ?? []).filter(p => p.status === 'Active').map(p => ({ ...p, variables: p.variables ?? [] })));
        else this.loadError.set(r.message || 'The prompts could not be loaded.');
      },
      error: err => {
        this.loaded.set(true);
        this.loadError.set(err?.error?.message || 'The prompts could not be loaded.');
      },
    });
  }

  pickPrompt(id: string): void {
    const next = id ? Number(id) : null;
    if (next !== this.promptId()) this.map.set({});
    this.promptId.set(next);
  }

  setSource(variable: string, tag: string): void {
    this.map.update(m => { const n = { ...m }; if (tag) n[variable] = (this.asFile(variable) ? 'file:' : '') + tag; else delete n[variable]; return n; });
  }

  apply(): void {
    this.ref.close({ promptId: this.promptId(), variableMap: this.map(), onError: this.onError(), runIn: this.runIn() });
  }
}
