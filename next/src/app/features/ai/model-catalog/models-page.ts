import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { ToastService } from '../../../shared/ui/toast.service';
import { AppLoading, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { confirmWith } from '../../../shared/ui/confirm';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { AI_PROVIDERS, providerOf, providerPill } from '../ai-providers';
import { CatalogChange, CatalogModel, ModelCatalogApi, isCloudName, sameModel, whereText } from './model-catalog';

/** The model being added or changed, as typed. */
interface Draft {
  catalogId: number | null;
  modelName: string;
  displayName: string;
  provider: string;
  local: boolean;
  note: string;
  active: boolean;
}

const BLANK: Draft = { catalogId: null, modelName: '', displayName: '', provider: 'Ollama', local: true, note: '', active: true };

/** A model's name as a provider writes it: letters, digits and . _ : / - @ +, no spaces (the service checks the same). */
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,254}$/;

/**
 * Platform › Models (owner 2026-11-02), the platform's main administrator's: the list of models that may be used at all.
 * A workspace administrator picks from it -- a data policy's allowed models, a connection's default model, a prompt's
 * model -- and a model call whose model is not on it, or is switched off here, is refused. Adding a model here does not
 * install it: the backend team installs a model on the machines (or the provider offers it); this list says which may be
 * used. Every change is recorded (who, when, from what to what) and shown under Changes.
 */
@Component({
  selector: 'app-models-page',
  imports: [PageHeader, RefreshButton, Icon, AppLoading, LoadError, ServerTimePipe, AdvancedSelect],
  template: `
<div class="page">
  <app-page-header title="Models"
                   subtitle="The models the platform may use. Workspaces choose from the models switched on here; a model that is not on the list, or is switched off, is refused whenever something calls it. Adding a model here does not install it — the backend team installs it.">
    <div class="flex items-center gap-2">
      <app-refresh-button [loading]="state.loading()" (refresh)="load()" />
      <button type="button" class="btn btn-primary btn-sm" data-add (click)="startAdd()" [disabled]="!!draft()"><app-icon name="plus" />Add a model</button>
    </div>
  </app-page-header>

  <section class="card p-4 flex items-start gap-2 text-sm text-[color:var(--text-secondary)]" data-explain>
    <app-icon name="info" class="shrink-0 mt-0.5" />
    <div class="flex flex-col gap-1">
      <p><b>Local</b> models run on your own machines (Ollama). <b>Hosted</b> models run at a provider; sensitive data reaches a hosted model only on a
        connection a workspace administrator has marked as covered by a signed Business Associate Agreement (BAA), and only where the workspace's data
        policy allows it. An Ollama cloud model (its name ends in <span class="mono">-cloud</span>) runs on Ollama's servers, so it is hosted.</p>
      <p>Switching a model off stops every call that uses it, in every workspace, until it is switched on again. Nothing is ever deleted from the list.</p>
    </div>
  </section>

  @if (draft(); as d) {
    <section class="card p-4 flex flex-col gap-4" aria-labelledby="model-editor-title" data-editor>
      <h2 class="section-title m-0" id="model-editor-title">{{ d.catalogId ? 'Change ' + (editingName() || 'model') : 'Add a model' }}</h2>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label class="label" for="mProvider">Runs on</label>
          <app-advanced-select id="mProvider" [options]="providerOptions" [value]="d.provider" (valueChange)="setProvider($event)" />
          <p class="field-note text-[color:var(--text-muted)]">The kind of model connection that runs it.</p>
        </div>
        <div>
          <label class="label" for="mName">Model name</label>
          <input id="mName" class="input mono" name="modelName" [value]="d.modelName" (input)="setName($any($event.target).value)" maxlength="255"
                 [placeholder]="hint()" [class.input-invalid]="!!nameProblem()" [attr.aria-invalid]="nameProblem() ? 'true' : null"
                 aria-describedby="mName-note" autocomplete="off" spellcheck="false" />
          @if (nameProblem()) { <p class="field-note text-crit-500" id="mName-note">{{ nameProblem() }}</p> }
          @else { <p class="field-note text-[color:var(--text-muted)]" id="mName-note">Exactly as the provider names it — for Ollama, as <span class="mono">ollama list</span> shows it.</p> }
        </div>
        <div>
          <label class="label" for="mDisplay">Display name</label>
          <input id="mDisplay" class="input" name="displayName" [value]="d.displayName" (input)="patch({ displayName: $any($event.target).value })"
                 maxlength="120" placeholder="Qwen3 8B" />
          <p class="field-note text-[color:var(--text-muted)]">What people see when they choose it.</p>
        </div>
        <div>
          <span class="label" id="mWhere">Where it runs</span>
          <div class="flex flex-col gap-1.5 text-sm" role="radiogroup" aria-labelledby="mWhere">
            <label class="inline-flex items-center gap-2"><input type="radio" name="where" [checked]="d.local" [disabled]="!canBeLocal()" (change)="patch({ local: true })" />Local — on your own machines</label>
            <label class="inline-flex items-center gap-2"><input type="radio" name="where" [checked]="!d.local" (change)="patch({ local: false })" />Hosted — at a provider</label>
          </div>
          @if (!canBeLocal()) { <p class="field-note text-[color:var(--text-muted)]">{{ d.provider === 'Ollama' ? 'An Ollama cloud model runs on Ollama\\'s servers.' : 'Only an Ollama model runs locally.' }}</p> }
        </div>
        <div class="md:col-span-2 xl:col-span-3">
          <label class="label" for="mNote">Note <span class="text-[color:var(--text-muted)] font-normal">(optional)</span></label>
          <input id="mNote" class="input" name="note" [value]="d.note" (input)="patch({ note: $any($event.target).value })" maxlength="500"
                 placeholder="What it is good for, or who asked for it" />
        </div>
        <div>
          <span class="label">Status</span>
          <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" role="switch" name="active" [checked]="d.active"
                 (change)="patch({ active: $any($event.target).checked })" />{{ d.active ? 'On — may be used' : 'Off — refused everywhere' }}</label>
        </div>
      </div>
      @if (saveError()) { <p class="text-sm text-crit-500 flex items-start gap-1.5" role="alert" data-save-error><app-icon name="alert" size="0.9em" class="mt-0.5" />{{ saveError() }}</p> }
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="cancel()" [disabled]="saving()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" data-save (click)="save()" [disabled]="saving() || !!nameProblem() || !d.modelName.trim() || !d.displayName.trim()">
          <app-icon name="save" />{{ saving() ? 'Saving…' : d.catalogId ? 'Save changes' : 'Add to the list' }}</button>
      </div>
    </section>
  }

  @if (state.error()) {
    <section class="card"><app-load-error [message]="state.error()" (retry)="load()" /></section>
  } @else {
    <section class="card overflow-hidden" aria-labelledby="models-title" data-models>
      <div class="px-4 pt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="section-title m-0" id="models-title">The list</h2>
        <p class="text-xs text-[color:var(--text-muted)]">{{ onCount() }} on · {{ models().length - onCount() }} off</p>
      </div>
      <div class="overflow-x-auto mt-3">
        <table class="table-modern">
          <thead><tr><th>Model</th><th>Model name</th><th>Runs on</th><th>Where</th><th>Note</th><th>Status</th><th>Last changed</th><th class="th-actions w-40">Actions</th></tr></thead>
          <tbody>
            @if (state.pending()) {
              <tr><td colspan="8" class="p-0"><app-loading shape="rows" label="Loading the list of models…" [count]="3" /></td></tr>
            } @else if (!models().length) {
              <tr><td colspan="8" class="text-center text-[color:var(--text-muted)] py-6">No model is on the list yet, so every model call is refused. Add the models the backend team has installed.</td></tr>
            }
            @for (m of models(); track m.catalogId) {
              <tr [attr.data-model]="m.modelName" [class.opacity-70]="!m.active">
                <td class="font-medium">{{ m.displayName }}</td>
                <td class="mono text-xs">{{ m.modelName }}</td>
                <td><span [class]="pill(m.provider)">{{ providerLabel(m.provider) }}</span></td>
                <td><span class="pill" [class.pill-ok]="m.local" [class.pill-info]="!m.local">{{ where(m) }}</span></td>
                <td class="text-xs text-[color:var(--text-secondary)] max-w-72">{{ m.note || '—' }}</td>
                <td>@if (m.active) { <span class="pill pill-ok"><app-icon name="check" size="0.9em" />On</span> } @else { <span class="pill pill-warn"><app-icon name="pause" size="0.9em" />Off</span> }</td>
                <td class="text-xs text-[color:var(--text-secondary)] whitespace-nowrap">{{ m.dateUpdated | serverTime:'recent' }}</td>
                <td>
                  <div class="flex items-center justify-end gap-1">
                    <button type="button" class="btn btn-default btn-sm" (click)="startEdit(m)" [disabled]="!!draft()" [attr.aria-label]="'Change ' + m.displayName"><app-icon name="edit" />Change</button>
                    <button type="button" class="btn btn-default btn-sm" [class.btn-intent-crit]="m.active" (click)="toggle(m)" [disabled]="busy() === m.catalogId"
                            [attr.aria-label]="(m.active ? 'Switch off ' : 'Switch on ') + m.displayName">{{ m.active ? 'Switch off' : 'Switch on' }}</button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card overflow-hidden" aria-labelledby="changes-title" data-changes>
      <div class="px-4 pt-4"><h2 class="section-title m-0" id="changes-title">Changes</h2>
        <p class="section-sub">Who changed the list, and how — newest first.</p></div>
      <div class="overflow-x-auto mt-3">
        <table class="table-modern">
          <thead><tr><th>When</th><th>Model</th><th>Change</th><th>From</th><th>To</th><th>By</th></tr></thead>
          <tbody>
            @if (historyState.pending()) {
              <tr><td colspan="6" class="p-0"><app-loading shape="rows" label="Loading the changes…" [count]="2" /></td></tr>
            } @else if (historyState.error()) {
              <tr><td colspan="6"><app-load-error [message]="historyState.error()" (retry)="loadHistory()" /></td></tr>
            } @else if (!history().length) {
              <tr><td colspan="6" class="text-center text-[color:var(--text-muted)] py-6">No change yet.</td></tr>
            }
            @for (h of history(); track $index) {
              <tr>
                <td class="text-xs whitespace-nowrap">{{ h.at | serverTime:'recent' }}</td>
                <td class="text-sm">{{ h.note }}</td>
                <td class="text-sm">{{ actionText(h.action) }}</td>
                <td class="mono text-xs">{{ h.from || '—' }}</td>
                <td class="mono text-xs">{{ h.to || '—' }}</td>
                <td class="text-sm">{{ h.byName || (h.by ? 'User ' + h.by : '—') }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  }
</div>
  `,
})
export class ModelsPage implements OnInit {
  private readonly api = inject(ModelCatalogApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly state = createLoadState();
  readonly historyState = createLoadState();
  readonly models = signal<CatalogModel[]>([]);
  readonly history = signal<CatalogChange[]>([]);
  readonly draft = signal<Draft | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly busy = signal<number | null>(null);

  readonly onCount = computed(() => this.models().filter(m => m.active).length);
  readonly providerOptions: AdvancedOption[] = AI_PROVIDERS.map(p => ({ value: p.key, label: p.label, description: p.key === 'Ollama' ? 'Local' : 'Hosted' }));
  readonly hint = computed(() => providerOf(this.draft()?.provider).modelHint);
  readonly canBeLocal = computed(() => { const d = this.draft(); return !!d && d.provider === 'Ollama' && !isCloudName(d.modelName); });
  readonly editingName = computed(() => this.models().find(m => m.catalogId === this.draft()?.catalogId)?.displayName ?? '');
  readonly nameProblem = computed(() => {
    const d = this.draft();
    const name = d?.modelName.trim() ?? '';
    if (!d || !name) return '';
    if (!MODEL_NAME.test(name)) return 'Letters, digits and . _ : / - @ + only, no spaces.';
    const same = this.models().find(m => m.catalogId !== d.catalogId && m.provider === d.provider && sameModel(m.modelName, name));
    return same ? `On the list already, as "${same.displayName}".` : '';
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.state.start();
    this.api.list().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.state.fail(r, 'The list of models could not be read.'); return; }
        this.models.set(r.data ?? []);
        this.state.done();
      },
      error: err => this.state.fail(err, 'The list of models could not be read.'),
    });
    this.loadHistory();
  }

  loadHistory(): void {
    this.historyState.start();
    this.api.history().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.historyState.fail(r, 'The changes could not be read.'); return; }
        this.history.set(r.data ?? []);
        this.historyState.done();
      },
      error: err => this.historyState.fail(err, 'The changes could not be read.'),
    });
  }

  startAdd(): void { this.saveError.set(''); this.draft.set({ ...BLANK }); }

  startEdit(m: CatalogModel): void {
    this.saveError.set('');
    this.draft.set({ catalogId: m.catalogId, modelName: m.modelName, displayName: m.displayName, provider: m.provider, local: m.local, note: m.note ?? '', active: m.active });
  }

  cancel(): void { this.draft.set(null); this.saveError.set(''); }

  patch(change: Partial<Draft>): void {
    this.saveError.set('');
    this.draft.update(d => (d ? { ...d, ...change } : d));
  }

  setProvider(provider: string): void {
    this.patch({ provider, local: provider === 'Ollama' && !isCloudName(this.draft()?.modelName) });
  }

  setName(modelName: string): void {
    const d = this.draft();
    this.patch({ modelName, local: !!d && d.local && d.provider === 'Ollama' && !isCloudName(modelName) });
  }

  save(): void {
    const d = this.draft();
    if (!d || this.saving() || this.nameProblem()) return;
    this.saving.set(true);
    this.api.save({ catalogId: d.catalogId, modelName: d.modelName.trim(), displayName: d.displayName.trim(), provider: d.provider,
      local: this.canBeLocal() && d.local, note: d.note.trim() || null, active: d.active }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.saveError.set(r.message); return; }
        this.toast.success(r.message);
        this.draft.set(null);
        this.load();
      },
      error: err => { this.saving.set(false); this.saveError.set(loadErrorText(err, 'The model could not be saved.')); },
    });
  }

  async toggle(m: CatalogModel): Promise<void> {
    if (m.active) {
      const ok = await confirmWith(this.dialog, {
        title: `Switch off ${m.displayName}?`,
        body: `Every call that uses ${m.modelName} — in every workspace, on every connection — is refused until it is switched on again. Pipelines, prompts and data policies that name it stay as they are.`,
        confirmLabel: 'Switch off', danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(m.catalogId);
    this.api.setActive(m.catalogId, !m.active).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.load();
      },
      error: err => { this.busy.set(null); this.toast.error(loadErrorText(err, 'The model could not be switched.')); },
    });
  }

  pill(provider: string): string { return providerPill(provider); }
  providerLabel(provider: string): string { return providerOf(provider).key === provider ? providerOf(provider).label : provider; }
  where(m: CatalogModel): string { return whereText(m); }
  actionText(action: string): string {
    return ({ added: 'Added', edited: 'Changed', activate: 'Switched on', deactivate: 'Switched off' } as Record<string, string>)[action] ?? action;
  }
}
