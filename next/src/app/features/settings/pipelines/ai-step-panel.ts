import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { Combobox } from '../../../shared/ui/combobox';
import { Prompt } from '../../ai/prompts/prompt-model';

/** What the panel hands back when the person is done. */
export interface AiStepConfig {
  promptId: number | null;
  variableMap: Record<string, string>;
  onError: 'fail' | 'continue';
}

/**
 * Configures one AI step of a pipeline, in a drawer beside the (already full) pipeline
 * dialog: which prompt runs, which earlier field feeds each of its variables, and what a
 * failed call does to the run. Only fields above the step can be read -- a later one has
 * no value yet when the step runs before dispatch -- so that is all the box offers.
 */
@Component({
  selector: 'app-ai-step-panel',
  imports: [SidePanel, Icon, Combobox, RouterLink],
  template: `
    <app-side-panel [heading]="'AI step · <' + data.tagKey + '>'" subtitle="Runs before dispatch; the answer is written to this tag.">
      <div class="form-stack">
        <div>
          <label class="label" for="aiStepPrompt">Prompt</label>
          <app-combobox id="aiStepPrompt" [selected]="promptId()" (selectedChange)="pickPrompt($event)"
                        placeholder="Search active prompts…" [allowClear]="false" [options]="promptOptions()" />
          @if (!prompts().length && loaded()) {
            <p class="text-xs text-warn-600 mt-1">No active prompt in this workspace. <a class="link-inline" routerLink="/ai/prompts/new" (click)="ref.close()">Create one</a> first.</p>
          } @else if (prompt(); as p) {
            <p class="text-xs text-[color:var(--text-muted)] mt-1">v{{ p.version }} · {{ p.connectionName || 'workspace default' }} · <span class="mono">{{ p.effectiveModel || '' }}</span> · {{ p.outputMode === 'json' ? 'JSON' : 'text' }} output</p>
          }
        </div>

        @if (prompt(); as p) {
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
                        <select class="input" [value]="map()[v.name] || ''" (change)="setSource(v.name, $any($event.target).value)">
                          <option value="">{{ v.required ? '— pick a field —' : '(not sent)' }}</option>
                          @for (f of data.fieldsAbove; track f.tagKey) { <option [value]="f.tagKey">{{ f.label }} &lt;{{ f.tagKey }}&gt;</option> }
                        </select>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (!data.fieldsAbove.length) {
                <p class="text-xs text-warn-600 mt-1.5">Nothing sits above this step yet — move it below the fields it should read.</p>
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
  readonly promptId = signal<number | null>(this.data.current?.promptId ?? null);
  readonly map = signal<Record<string, string>>({ ...(this.data.current?.variableMap ?? {}) });
  readonly onError = signal<'fail' | 'continue'>(this.data.current?.onError ?? 'fail');

  readonly promptOptions = computed(() => this.prompts().map(p => ({ value: String(p.promptId), label: p.name, hint: `v${p.version} · ${p.variables.map(v => v.name).join(', ')}` })));
  readonly prompt = computed(() => this.prompts().find(p => p.promptId === this.promptId()) ?? null);
  readonly missing = computed(() => (this.prompt()?.variables ?? []).filter(v => v.required && !this.map()[v.name]).map(v => v.name));

  constructor() {
    this.http.get<ApiResponse<Prompt[]>>(`${API_BASE}/aiPrompt.json/list`).subscribe({
      next: r => {
        this.loaded.set(true);
        if (r.status === API_SUCCESS) this.prompts.set((r.data ?? []).filter(p => p.status === 'Active').map(p => ({ ...p, variables: p.variables ?? [] })));
      },
      error: () => this.loaded.set(true),
    });
  }

  pickPrompt(id: string): void {
    const next = id ? Number(id) : null;
    if (next !== this.promptId()) this.map.set({});
    this.promptId.set(next);
  }

  setSource(variable: string, tag: string): void {
    this.map.update(m => { const n = { ...m }; if (tag) n[variable] = tag; else delete n[variable]; return n; });
  }

  apply(): void {
    this.ref.close({ promptId: this.promptId(), variableMap: this.map(), onError: this.onError() });
  }
}
