import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { formatDuration } from '../../../shared/ui/time-format';
import { messageOf } from './image-actions';
import {
  AiModelOption, AiPromptOption, AiSide, DescribeResult, FIXED_RULES, ImageAiApi, ImageAiSettings, ImageType, TRY_PHOTOS, TryPhoto, TypeSave,
  canMeasure,
} from './image-ai';
import { NOT_SURE, fieldLabel, targetWords } from './image.model';

export interface AiSettingsData { focus?: string; }

type Target = 'red_region' | 'contrast';
type SideKey = 'suggest' | 'ask';
type SideDraft = Pick<AiSide, 'promptId' | 'model' | 'on'>;

/** A type's saved setting, as the editor holds it. */
export function typeSave(t: ImageType): TypeSave {
  return { promptId: t.promptBuiltIn ? null : t.promptId ?? null, model: ('chosenModel' in t ? t.chosenModel : t.model) ?? null, measured: !!t.measured && canMeasure(t),
    target: (t.target ?? (t.measured ? 'red_region' : null)) as Target | null, offered: !!t.offered,
    timeoutSeconds: t.timeoutSeconds ?? null, answerTokens: t.answerTokens ?? null };
}

/** What changed for one type, in words: "model gemma3:4b → qwen3.5:9b". */
export function typeChanges(before: TypeSave, after: TypeSave, promptName: (id: number | null) => string, modelName: (m: string | null) => string): string[] {
  const out: string[] = [];
  if (before.promptId !== after.promptId) out.push(`prompt ${promptName(before.promptId)} → ${promptName(after.promptId)}`);
  if (before.model !== after.model) out.push(`model ${modelName(before.model)} → ${modelName(after.model)}`);
  if (before.measured !== after.measured) out.push(after.measured ? 'measured' : 'not measured');
  else if (after.measured && before.target !== after.target) out.push(`target ${targetWords(after.target)}`);
  if (before.offered !== after.offered) out.push(after.offered ? 'offered' : 'not offered');
  if (before.timeoutSeconds !== after.timeoutSeconds || before.answerTokens !== after.answerTokens) out.push('limits');
  return out;
}

const IMAGE_REVIEW_TAG = 'image review';

/** Whether a prompt option carries the Image review tag. */
export function taggedImageReview(p: AiPromptOption): boolean {
  const tags = Array.isArray(p.tags) ? p.tags : (p.tags ?? '').split(',');
  return tags.some(t => t.trim().toLowerCase() === IMAGE_REVIEW_TAG);
}

/** The built-in prompt of a type: builtInKey image-<base> (a bare <base> is read the same). */
export function isOwnBuiltIn(p: AiPromptOption, base: string): boolean {
  return p.builtIn && (p.builtInKey === `image-${base}` || p.builtInKey === base);
}

/** A type's prompt choices: its own built-in, the workspace's Image review prompts, then the workspace's others that fit. */
export function promptsForType(prompts: readonly AiPromptOption[], base: string): AiPromptOption[] {
  const sideKind = (p: AiPromptOption) => p.kind === 'suggest' || p.kind === 'ask';
  const own = prompts.filter(p => isOwnBuiltIn(p, base));
  const mine = prompts.filter(p => !p.builtIn && !sideKind(p));
  const tagged = mine.filter(taggedImageReview);
  const others = mine.filter(p => !taggedImageReview(p) && p.fits);
  return [...own, ...tagged, ...others];
}

/** The suggestion's or Ask's choices: its built-in prompt, then the workspace's that fit it. */
export function promptsForSide(prompts: readonly AiPromptOption[], k: 'suggest' | 'ask'): AiPromptOption[] {
  const fitsSide = (p: AiPromptOption) => (k === 'suggest' ? p.fitsSuggest : p.fitsAsk) ?? (p.kind === k && p.fits);
  return [...prompts.filter(p => p.builtIn && (p.kind === k || p.builtInKey === `image-${k}`)), ...prompts.filter(p => !p.builtIn && fitsSide(p))];
}

/** "local · Active · reads photos · thinks", or why a model cannot be used. */
export function modelLine(m: AiModelOption | null | undefined): string {
  if (!m) return '';
  if (!m.usable) return m.reason || (m.readsPhotos ? 'cannot be used here' : 'text only: cannot read photos');
  return ['local', m.active ? 'Active' : 'Off', m.readsPhotos ? 'reads photos' : 'text only', m.thinks ? 'thinks' : '', m.usesTools ? 'uses tools' : '']
    .filter(Boolean).join(' · ');
}

/**
 * AI settings for Image review (owner-approved design 2026-11-03, types-settings), administrators only: per image type, which
 * prompt and model write the draft description, whether it is measured and against which target, and whether it is offered
 * at upload -- a table of the types on top (Offered always a switch), the editor for one below. Add a type copies a built-in
 * one. The suggestion's and Ask's own prompt, model and switch. The fixed rules for every type, locked. Try it on a synthetic
 * photo: the saved choice and the change side by side. Save says what is unsaved; the audit line says who changed it last.
 * Moving to a bigger model is a change here only (a model on the platform's list that reads photos): no code.
 */
@Component({
  selector: 'app-image-ai-settings',
  imports: [SidePanel, Icon, Segmented, ServerTimePipe, AppLoading, InlineStatus],
  styles: `
    .as-sec { padding: 1rem 0; border-bottom: 1px solid var(--border-subtle); }
    .as-sec:first-child { padding-top: 0; }
    .as-sec:last-child { border-bottom: 0; }
    .as-sec h3 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.625rem; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--text-secondary); }
    .as-sec h3 .as-end { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 500; }
    .as-t { width: 100%; border-collapse: collapse; font-size: 0.8125rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
    .as-t th { text-align: left; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary);
      padding: 0.5rem 0.625rem; border-bottom: 1px solid var(--border-subtle); }
    .as-t td { padding: 0.5rem 0.625rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    .as-t tr:last-child td { border-bottom: 0; }
    .as-t tbody tr { cursor: pointer; }
    .as-t tbody tr:hover { background: var(--surface-inset); }
    .as-t tbody tr.as-on { background: var(--surface-sunken); box-shadow: inset 3px 0 0 var(--text-primary); }
    .as-offer { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: var(--text-secondary); }
    .as-edit { margin-top: 0.75rem; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); }
    .as-row { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: 0.75rem; padding: 0.75rem; border-bottom: 1px solid var(--border-subtle); font-size: 0.8125rem; }
    .as-row:last-child { border-bottom: 0; }
    .as-row > span:first-child { color: var(--text-secondary); padding-top: 0.25rem; }
    .as-head { background: var(--surface-inset); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    .as-opt { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.5rem 0.625rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
      margin-bottom: 0.375rem; cursor: pointer; }
    .as-opt.on { border-color: var(--text-primary); background: var(--surface-inset); }
    .as-opt.off { cursor: default; opacity: 0.75; }
    .as-opt input { margin-top: 0.1875rem; }
    .as-opt .as-link { margin-left: auto; white-space: nowrap; font-size: 0.75rem; }
    .as-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
    .as-models { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .as-models .as-opt { margin: 0; padding: 0.375rem 0.625rem; align-items: center; }
    .as-why { font-size: 0.75rem; color: var(--warn-text); }
    .as-rule { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.25rem 0; font-size: 0.8125rem; }
    .as-rule app-icon { flex: none; margin-top: 0.125rem; color: var(--text-muted); }
    .as-try { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .as-thumb { width: 5.75rem; height: 4.25rem; border-radius: var(--radius-md); border: 2px solid transparent; background: var(--surface-sunken);
      cursor: pointer; padding: 0; }
    .as-thumb.on { border-color: var(--text-primary); }
    .as-cmp { display: grid; grid-template-columns: 7rem minmax(0, 1fr) minmax(0, 1fr); margin-top: 0.75rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg); font-size: 0.8125rem; }
    .as-cmp.one { grid-template-columns: 7rem minmax(0, 1fr); }
    .as-cmp > div { padding: 0.4375rem 0.625rem; border-bottom: 1px solid var(--border-subtle); min-width: 0; overflow-wrap: anywhere; }
    .as-cmp > .h { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); }
    .as-cmp > .k { color: var(--text-muted); }
    .as-cmp > .chg { background: var(--info-soft); }
    .as-add { display: grid; grid-template-columns: minmax(0, 1fr) 11rem auto auto; gap: 0.5rem; align-items: end; margin-top: 0.5rem; }
    .as-side { display: grid; grid-template-columns: 8rem minmax(0, 1fr) minmax(0, 1fr) auto; gap: 0.5rem 0.75rem; align-items: center; font-size: 0.8125rem; }
    .as-limits summary { cursor: pointer; }
    .as-lim { display: grid; grid-template-columns: repeat(2, minmax(0, 12rem)); gap: 0.5rem 1rem; }
    .as-muted { color: var(--text-muted); }
    .as-row > span.as-name { color: var(--text-primary); }
    .as-sec h3 .as-quiet { font-weight: 400; color: var(--text-muted); }
    .as-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: var(--radius-sm); }
    .as-thumb { overflow: hidden; }
    .as-audit { font-size: 0.75rem; color: var(--text-muted); margin: 0.75rem 0 0; }
    @media (max-width: 760px) { .as-row, .as-side, .as-add { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    <app-side-panel heading="AI settings for Image review" subtitle="Per image type: which prompt and model write the draft description, and whether it is measured. Sizes come only from the ruler, in code.">
      @if (state.error()) {
        <app-inline-status [error]="state.error()" (retry)="load()" />
      } @else if (!settings()) {
        <app-loading shape="rows" label="Loading the AI settings…" [count]="5" />
      } @else {
        @let s = settings()!;
        @if (!s.canChange) {
          <p class="text-sm text-[color:var(--text-secondary)] mt-0" data-test="as-read-only"><app-icon name="lock" size="0.9em" /> Only administrators change these settings. You can read them.</p>
        } @else {
          <p class="m-0 mb-3"><span class="pill pill-neutral">Administrators</span></p>
        }

        <section class="as-sec" data-test="as-types">
          <h3>Image types <button type="button" class="link-inline as-end" (click)="openCatalog()" data-test="as-catalog">About the built-in types</button></h3>
          <table class="as-t">
            <thead><tr><th>Type</th><th>Offered</th><th>Prompt · model</th><th>Measured</th></tr></thead>
            <tbody>
              @for (t of s.types; track t.key) {
                @let d = draftOf(t.key);
                <tr [class.as-on]="selected() === t.key" (click)="select(t.key)" [attr.data-type-row]="t.key">
                  <td class="font-medium">{{ t.name }} <span class="pill ml-1" [class.pill-neutral]="t.builtIn" [class.pill-info]="!t.builtIn">{{ t.builtIn ? 'Built in' : 'Ours' }}</span></td>
                  <td (click)="$event.stopPropagation()">
                    <label class="as-offer" data-test="as-offered"><input type="checkbox" role="switch" class="sw" [checked]="d.offered" [disabled]="!s.canChange"
                           (change)="patch(t.key, { offered: $any($event.target).checked })" [attr.aria-label]="'Offer ' + t.name + ' at upload'" />{{ d.offered ? 'Yes' : 'No' }}</label>
                  </td>
                  <td>@if (d.offered) { {{ promptShort(t, d.promptId) }} · <span class="mono text-xs">{{ modelName(d.model) }}</span> }
                    @else { <span class="text-[color:var(--text-muted)]">not offered here</span> }</td>
                  <td [class.as-muted]="!(d.measured && canMeasure(t))">{{ d.measured && canMeasure(t) ? 'Ruler · ' + targetWords(d.target) : 'Never' }}</td>
                </tr>
              }
            </tbody>
          </table>

          @if (s.canChange) {
            @if (adding(); as a) {
              <div class="as-add" data-test="as-add-form">
                <div class="field m-0"><label class="label" for="as-new-name">Name</label>
                  <input id="as-new-name" class="input input-sm" [value]="a.name" (input)="adding.set({ name: $any($event.target).value, baseKey: a.baseKey })" placeholder="Pressure-ulcer heel check" maxlength="80" /></div>
                <div class="field m-0"><label class="label" for="as-new-base">Copied from</label>
                  <select id="as-new-base" class="input input-sm" (change)="adding.set({ name: a.name, baseKey: $any($event.target).value })">
                    @for (b of builtIns(); track b.key) { <option [value]="b.key" [selected]="a.baseKey === b.key">{{ b.name }}</option> }
                  </select></div>
                <button type="button" class="btn btn-primary btn-sm" (click)="addType()" [disabled]="busy() || !a.name.trim()" data-test="as-add-save">Add</button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="adding.set(null)">Cancel</button>
              </div>
              <p class="text-xs text-[color:var(--text-muted)] mt-1 mb-0">It starts as a copy of the base type's settings. A copy of X-ray, Tissue slide or Other photo is never measured.</p>
            } @else {
              <button type="button" class="btn btn-default btn-sm mt-2" (click)="adding.set({ name: '', baseKey: builtIns()[0]?.key ?? 'wound' })" data-test="as-add"><app-icon name="plus" />Add a type</button>
            }
          }

          @if (current(); as t) {
            @let d = draftOf(t.key);
            <div class="as-edit" data-test="as-editor" [attr.data-editing]="t.key">
              <div class="as-row as-head"><span class="font-semibold as-name">{{ t.name }}</span>
                <span class="text-xs text-[color:var(--text-muted)] self-center">{{ t.builtIn ? 'Built in' : 'Ours, copied from ' + baseName(t) }} · fields come from the chosen prompt's output schema</span></div>
              <div class="as-row"><span>Prompt</span>
                <div>
                  @for (p of promptsFor(t); track p.promptId) {
                    <label class="as-opt" [class.on]="chosenPrompt(t, d) === p.promptId" [class.off]="!p.fits" [attr.data-prompt]="p.promptId">
                      <input type="radio" [name]="'as-prompt-' + t.key" [checked]="chosenPrompt(t, d) === p.promptId" [disabled]="!p.fits || !s.canChange"
                             (change)="patch(t.key, { promptId: p.builtIn ? null : p.promptId })" />
                      <div class="min-w-0">
                        <div class="font-medium">{{ p.name }} <span class="pill pill-neutral mono">v{{ p.version }}</span>@if (p.builtIn) { <span class="pill pill-neutral ml-1">Platform</span> }</div>
                        @if (p.fits) {
                          <div class="as-chips">@for (f of p.fields; track f) { <span class="pill pill-neutral mono">{{ f }}</span> }</div>
                        } @else {
                          <div class="as-why">{{ whyNot(p) }}</div>
                        }
                      </div>
                      @if (p.builtIn) {
                        @if (s.canChange) { <button type="button" class="link-inline as-link" (click)="$event.preventDefault(); duplicate(p)" data-test="as-duplicate">Duplicate to edit</button> }
                      } @else {
                        <button type="button" class="link-inline as-link" (click)="$event.preventDefault(); openPrompt(p.promptId)">Open</button>
                      }
                    </label>
                  } @empty { <p class="text-sm text-[color:var(--text-muted)] m-0">No description prompt yet.</p> }
                </div>
              </div>
              <div class="as-row"><span>Model</span>
                <div>
                  <div class="as-models">
                    <label class="as-opt" [class.on]="d.model === null" data-model="">
                      <input type="radio" [name]="'as-model-' + t.key" [checked]="d.model === null" [disabled]="!s.canChange" (change)="patch(t.key, { model: null })" />
                      <span>Platform default@if (s.fallbackModel) { · <span class="mono">{{ s.fallbackModel }}</span> }</span></label>
                    @for (m of modelChoices(d.model); track m.model) {
                      <label class="as-opt" [class.on]="d.model === m.model" [class.off]="!m.usable" [attr.data-model]="m.model" [title]="m.usable ? '' : modelLine(m)">
                        <input type="radio" [name]="'as-model-' + t.key" [checked]="d.model === m.model" [disabled]="!m.usable || !s.canChange" (change)="patch(t.key, { model: m.model })" />
                        <span class="mono">{{ m.model }}</span></label>
                    }
                  </div>
                  <p class="text-xs text-[color:var(--text-muted)] mt-2 mb-0" data-test="as-model-line">{{ d.model ? modelLine(modelOf(d.model)) : 'The platform\\'s default model for photos' + (s.fallbackModel ? ' (' + s.fallbackModel + ')' : '') }}</p>
                  @for (g of unusableGroups(); track g.reason) {
                    <p class="text-xs text-[color:var(--text-muted)] mt-1 mb-0" [attr.data-unusable]="g.models.join(' ')">Not offered: <span class="mono">{{ g.models.join(', ') }}</span> ({{ g.reason }})</p>
                  }
                  <details class="as-limits mt-2" [open]="d.timeoutSeconds != null || d.answerTokens != null">
                    <summary class="text-xs text-[color:var(--text-secondary)]">Limits for this type (optional)</summary>
                  <div class="as-lim mt-2">
                    <div class="field m-0"><label class="label" [attr.for]="'as-to-' + t.key">Call timeout (seconds)</label>
                      <input class="input input-sm" type="number" min="5" max="900" [id]="'as-to-' + t.key" [value]="d.timeoutSeconds ?? ''" [disabled]="!s.canChange"
                             [placeholder]="limitHint(d.model, 'callTimeoutSeconds')" (input)="patch(t.key, { timeoutSeconds: num($any($event.target).value) })" /></div>
                    <div class="field m-0"><label class="label" [attr.for]="'as-tok-' + t.key">Answer tokens</label>
                      <input class="input input-sm" type="number" min="50" max="32000" [id]="'as-tok-' + t.key" [value]="d.answerTokens ?? ''" [disabled]="!s.canChange"
                             [placeholder]="limitHint(d.model, 'answerTokens')" (input)="patch(t.key, { answerTokens: num($any($event.target).value) })" /></div>
                  </div>
                  </details>
                </div>
              </div>
              <div class="as-row"><span>Measurement</span>
                <div>
                  @if (canMeasure(t)) {
                    <label class="sw-row"><input type="checkbox" role="switch" class="sw" [checked]="d.measured" [disabled]="!s.canChange"
                           (change)="patch(t.key, { measured: $any($event.target).checked, target: d.target ?? 'red_region' })" data-test="as-measured" />Measure against a paper ruler</label>
                    @if (d.measured) {
                      <div class="flex flex-wrap items-center gap-2 mt-2"><span class="text-[color:var(--text-secondary)]">Target</span>
                        <app-segmented [value]="d.target ?? 'red_region'" (valueChange)="s.canChange && patch(t.key, { target: $event })" [options]="targetOptions" ariaLabel="What is measured" /></div>
                      <p class="text-xs text-[color:var(--text-muted)] mt-1 mb-0">{{ d.target === 'contrast' ? 'Dark region: a darker area on skin.' : 'Red region: a red area against the skin around it.' }} No ruler found means no size.</p>
                    }
                  } @else {
                    <p class="m-0 text-[color:var(--text-secondary)]" data-test="as-never-measured">Never: there is no paper ruler to read. {{ t.name }} is described only.</p>
                  }
                </div>
              </div>
              <div class="as-row"><span>Offered</span>
                <label class="sw-row"><input type="checkbox" role="switch" class="sw" [checked]="d.offered" [disabled]="!s.canChange" (change)="patch(t.key, { offered: $any($event.target).checked })" />
                  People can choose {{ t.name }} when they upload</label></div>
              @if (!t.builtIn && s.canChange) {
                <div class="as-row"><span></span><div><button type="button" class="btn btn-default btn-sm btn-intent-crit" (click)="removeType(t)" data-test="as-remove"><app-icon name="trash" />Delete this type</button></div></div>
              }
            </div>
          }
        </section>

        <section class="as-sec" data-test="as-rules">
          <h3><app-icon name="lock" size="0.95em" />Always applied, every type <span class="as-end as-quiet">added by the platform in code; not editable</span></h3>
          @for (r of rules(); track r) { <div class="as-rule"><app-icon name="lock" size="0.9em" /><span>{{ r }}</span></div> }
        </section>

        @if (current(); as t) {
          <section class="as-sec" data-test="as-try">
            <h3>Try it on a photo</h3>
            <div class="as-try">
              @for (ph of shownTryPhotos(); track ph.name) {
                <button type="button" class="as-thumb" [class.on]="tryPick() === ph.name" (click)="tryPick.set(ph.name)"
                        [attr.aria-label]="'Synthetic test image · ' + (ph.label || ph.name)" [attr.aria-pressed]="tryPick() === ph.name">
                  @if (thumb(ph.name); as src) { <img [src]="src" alt="" /> }</button>
              }
              <span class="text-xs text-[color:var(--text-muted)]">Synthetic test image · {{ t.name }}</span>
              <button type="button" class="btn btn-default btn-sm ml-auto" (click)="tryIt()" [disabled]="trying() || !tryPick()" data-test="as-try-run">
                @if (trying()) { <app-icon name="refresh" [busy]="true" /> } @else { <app-icon name="play" /> }Try it</button>
            </div>
            @if (tryResult(); as r) {
              @if (tryError()) { <p class="text-sm text-[color:var(--crit-text)] mt-2 mb-0" role="alert">{{ tryError() }}</p> }
              <div class="as-cmp" [class.one]="!r.change" data-test="as-try-result">
                <div class="h"></div>
                <div class="h">Now · {{ r.now?.model || modelName(saved(t.key).model) }}@if (r.now?.tookMs != null) { · {{ took(r.now!.tookMs!) }} }</div>
                @if (r.change) { <div class="h">Your change · {{ r.change.model || modelName(draftOf(t.key).model) }}@if (r.change.tookMs != null) { · {{ took(r.change.tookMs!) }} }</div> }
                @for (f of tryFields(); track f) {
                  <div class="k">{{ f }}</div>
                  <div [class.as-muted]="!cell(r.now, f)">{{ cell(r.now, f) || notSure }}</div>
                  @if (r.change) { <div [class.chg]="cell(r.now, f) !== cell(r.change, f)" [class.as-muted]="!cell(r.change, f)">{{ cell(r.change, f) || notSure }}</div> }
                }
              </div>
              <p class="text-xs text-[color:var(--text-muted)] mt-2 mb-0">A try is recorded as a try and never saved to a photo.</p>
            }
          </section>
        }
        <section class="as-sec" data-test="as-sides">
          <h3>The suggestion and Ask</h3>
          @for (k of sideKeys; track k) {
            @let d = sideOf(k);
            <div class="as-side mb-2" [attr.data-side]="k">
              <span class="font-medium">{{ k === 'suggest' ? 'Type suggestion' : 'Ask' }}</span>
              <select class="input input-sm" [attr.aria-label]="(k === 'suggest' ? 'Suggestion' : 'Ask') + ' prompt'" [disabled]="!s.canChange" (change)="patchSide(k, { promptId: idOrNull($any($event.target).value) })">
                @for (p of promptsOfKind(k); track p.promptId) { <option [value]="p.builtIn ? '' : p.promptId" [selected]="sidePrompt(k) === p.promptId">{{ p.name }} v{{ p.version }}{{ p.builtIn ? ' (Platform)' : '' }}</option> }
              </select>
              <select class="input input-sm" [attr.aria-label]="(k === 'suggest' ? 'Suggestion' : 'Ask') + ' model'" [disabled]="!s.canChange" (change)="patchSide(k, { model: $any($event.target).value || null })">
                <option value="" [selected]="!d.model">Platform default{{ s.fallbackModel ? ' · ' + s.fallbackModel : '' }}</option>
                @for (m of modelChoices(d.model); track m.model) { <option [value]="m.model" [selected]="d.model === m.model" [disabled]="!m.usable">{{ m.model }}{{ m.usable ? '' : ' · ' + modelLine(m) }}</option> }
              </select>
              <label class="sw-row"><input type="checkbox" role="switch" class="sw" [checked]="d.on" [disabled]="!s.canChange" (change)="patchSide(k, { on: $any($event.target).checked })"
                     [attr.aria-label]="(k === 'suggest' ? 'Suggest a type at upload' : 'Ask about an image') + ' on'" />{{ d.on ? 'On' : 'Off' }}</label>
            </div>
          }
          <p class="text-xs text-[color:var(--text-muted)] m-0">The suggestion is one small call at upload when nobody chose a type; it is a draft and the person's choice wins. Ask answers questions about what is visible; a question asking for a diagnosis gets a fixed reply and no model is asked.</p>
        </section>

        @if (s.lastChange?.byName) {
          <p class="as-audit" data-test="as-audit">Last changed by {{ s.lastChange!.byName }}@if (s.lastChange!.at) { · {{ s.lastChange!.at | serverTime: 'recent' }} }</p>
        }
      }
      <ng-container foot>
        <span class="text-xs text-[color:var(--text-secondary)] mr-auto" data-test="as-unsaved">{{ unsaved() || 'No unsaved change' }}</span>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close(savedOnce)" [disabled]="busy()">{{ unsaved() ? 'Cancel' : 'Close' }}</button>
        @if (settings()?.canChange) {
          <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="busy() || !unsaved()" data-test="as-save"><app-icon name="check" />Save</button>
        }
      </ng-container>
    </app-side-panel>
  `,
})
export class AiSettingsSheet implements OnInit {
  readonly ref = inject<DialogRef<boolean | undefined>>(DialogRef);
  private readonly data = inject<AiSettingsData | null>(DIALOG_DATA, { optional: true });
  private readonly api = inject(ImageAiApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router, { optional: true });

  readonly state = createLoadState();
  readonly settings = signal<ImageAiSettings | null>(null);
  readonly drafts = signal<Record<string, TypeSave>>({});
  readonly sides = signal<Record<SideKey, SideDraft>>({ suggest: { promptId: null, model: null, on: true }, ask: { promptId: null, model: null, on: true } });
  readonly selected = signal<string>('');
  readonly adding = signal<{ name: string; baseKey: string } | null>(null);
  readonly busy = signal(false);
  readonly tryPick = signal('');
  readonly trying = signal(false);
  readonly tryResult = signal<{ now: DescribeResult | null; change: DescribeResult | null } | null>(null);
  readonly tryError = signal('');
  private readonly thumbs = signal<Record<string, string>>({});
  savedOnce = false;

  readonly sideKeys: SideKey[] = ['suggest', 'ask'];
  readonly targetOptions: { id: Target; label: string }[] = [{ id: 'red_region', label: 'Red region' }, { id: 'contrast', label: 'Dark region' }];
  readonly notSure = NOT_SURE;
  readonly canMeasure = canMeasure;
  readonly targetWords = targetWords;
  readonly modelLine = modelLine;

  readonly current = computed(() => this.settings()?.types.find(t => t.key === this.selected()) ?? null);
  readonly builtIns = computed(() => (this.settings()?.types ?? []).filter(t => t.builtIn));
  readonly unusable = computed(() => (this.settings()?.models ?? []).filter(m => !m.usable));
  /** The models that cannot be used, one line per reason ("text only: cannot read photos"). */
  readonly unusableGroups = computed(() => {
    const by = new Map<string, string[]>();
    for (const m of this.unusable()) { const r = modelLine(m); by.set(r, [...(by.get(r) ?? []), m.model]); }
    return [...by.entries()].map(([reason, models]) => ({ reason, models }));
  });
  /** The try photos shown: the type's own synthetic photo (design types-settings), or all when none is its own. */
  readonly shownTryPhotos = computed(() => {
    const own = this.tryPhotos().filter(p => p.name === this.tryPick());
    return own.length ? own : this.tryPhotos();
  });
  readonly rules = computed(() => this.settings()?.rules?.length ? this.settings()!.rules! : FIXED_RULES);
  readonly tryPhotos = computed<TryPhoto[]>(() => {
    const list = this.settings()?.tryPhotos;
    const named = list?.length ? list : Object.values(TRY_PHOTOS);
    return named.map(p => (typeof p === 'string' ? { name: p } : p));
  });
  readonly tryFields = computed(() => {
    const r = this.tryResult();
    const order = [...(r?.now?.fieldOrder ?? Object.keys(r?.now?.fields ?? {})), ...(r?.change?.fieldOrder ?? Object.keys(r?.change?.fields ?? {}))];
    return [...new Set(order)];
  });
  /** "Unsaved: Skin lesion model gemma3:4b → qwen3.5:9b". */
  readonly unsaved = computed(() => {
    const s = this.settings();
    if (!s) return '';
    const lines: string[] = [];
    for (const t of s.types) {
      const changes = typeChanges(typeSave(t), this.draftOf(t.key), id => this.promptLabel(t, id), m => this.modelName(m));
      if (changes.length) lines.push(`${t.name} ${changes.join(', ')}`);
    }
    for (const k of this.sideKeys) if (this.sideChanged(k)) lines.push(k === 'suggest' ? 'the suggestion' : 'Ask');
    if (!lines.length) return '';
    return `Unsaved: ${lines.slice(0, 2).join('; ')}${lines.length > 2 ? `; and ${lines.length - 2} more` : ''}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u)));
  }

  ngOnInit(): void { this.load(); }

  load(keep = ''): void {
    this.state.start();
    this.api.settings().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'The AI settings could not be read.'); return; }
        const s = { ...r.data, types: [...(r.data.types ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), prompts: r.data.prompts ?? [], models: r.data.models ?? [] };
        this.settings.set(s);
        this.drafts.set(Object.fromEntries(s.types.map(t => [t.key, typeSave(t)])));
        this.sides.set({ suggest: this.sideSave(s.suggest), ask: this.sideSave(s.ask) });
        const want = keep || this.selected() || this.data?.focus || '';
        this.select(s.types.some(t => t.key === want) ? want : s.types[0]?.key ?? '');
        if (this.data?.focus === 'add' && s.canChange && !keep) this.adding.set({ name: '', baseKey: this.builtIns()[0]?.key ?? 'wound' });
        this.state.done();
        this.loadThumbs();
      },
      error: err => this.state.fail(err, 'The AI settings could not be read.'),
    });
  }

  private sideSave(s: AiSide | null | undefined): SideDraft {
    return { promptId: s?.promptId ?? null, model: (s && 'chosenModel' in s ? s.chosenModel : s?.model) ?? null, on: s?.on ?? true };
  }

  private loadThumbs(): void {
    for (const p of this.tryPhotos()) {
      if (this.thumbs()[p.name]) continue;
      this.api.tryPhoto(p.name).subscribe({
        next: blob => this.thumbs.update(t => ({ ...t, [p.name]: URL.createObjectURL(blob) })),
        error: () => undefined,
      });
    }
  }

  thumb(name: string): string { return this.thumbs()[name] ?? ''; }

  select(key: string): void {
    this.selected.set(key);
    this.tryResult.set(null);
    this.tryError.set('');
    const t = this.settings()?.types.find(x => x.key === key);
    if (t) {
      const want = TRY_PHOTOS[t.baseKey ?? t.key] ?? '';
      this.tryPick.set(this.tryPhotos().some(p => p.name === want) ? want : this.tryPhotos().find(p => p.typeKey === (t.baseKey ?? t.key))?.name ?? this.tryPhotos()[0]?.name ?? '');
    }
  }

  draftOf(key: string): TypeSave {
    return this.drafts()[key] ?? { promptId: null, model: null, measured: false, target: null, offered: false, timeoutSeconds: null, answerTokens: null };
  }

  saved(key: string): TypeSave {
    const t = this.settings()?.types.find(x => x.key === key);
    return t ? typeSave(t) : this.draftOf(key);
  }

  patch(key: string, change: Partial<TypeSave>): void {
    if (!this.settings()?.canChange) return;
    this.drafts.update(d => ({ ...d, [key]: { ...this.draftOf(key), ...change } }));
  }

  sideOf(k: SideKey): SideDraft { return this.sides()[k]; }

  patchSide(k: SideKey, change: Partial<SideDraft>): void {
    this.sides.update(s => ({ ...s, [k]: { ...s[k], ...change } }));
  }

  private sideChanged(k: SideKey): boolean {
    const saved = this.sideSave(this.settings()?.[k]), now = this.sides()[k];
    return saved.promptId !== now.promptId || saved.model !== now.model || saved.on !== now.on;
  }

  /**
   * The prompts a type can choose, in order: its own built-in one (builtInKey image-<base>), then the workspace's prompts tagged
   * Image review (fitting or not, with why), then any other workspace prompt that fits. Other types' built-ins and the
   * suggestion's and Ask's are never listed here.
   */
  promptsFor(t: ImageType): AiPromptOption[] {
    return promptsForType(this.settings()?.prompts ?? [], t.baseKey ?? t.key);
  }

  /** The suggestion's or Ask's choices: its built-in prompt, and the workspace's prompts that fit it (fitsSuggest, fitsAsk). */
  promptsOfKind(k: SideKey): AiPromptOption[] {
    return promptsForSide(this.settings()?.prompts ?? [], k);
  }

  /** "Doesn't fit: has no photo input…": ai's reason already says Doesn't fit. */
  whyNot(p: AiPromptOption): string {
    const r = (p.reason ?? '').trim();
    if (!r) return "Doesn't fit: needs JSON output and a photo input.";
    return /^doesn['’]t fit/i.test(r) ? r : `Doesn't fit: ${r}`;
  }

  /** The usable models, and the chosen one even when it cannot be used any more. */
  modelChoices(chosen: string | null): AiModelOption[] {
    return (this.settings()?.models ?? []).filter(m => m.usable || m.model === chosen);
  }

  private builtInPrompt(t: ImageType): AiPromptOption | null {
    return this.promptsFor(t).find(p => p.builtIn) ?? null;
  }

  /** The prompt chosen: its id, or the built-in one's for null. */
  chosenPrompt(t: ImageType, d: TypeSave): number | null {
    return d.promptId ?? this.builtInPrompt(t)?.promptId ?? null;
  }

  sidePrompt(k: SideKey): number | null {
    return this.sides()[k].promptId ?? this.promptsOfKind(k).find(p => p.builtIn)?.promptId ?? null;
  }

  idOrNull(v: string): number | null { const n = Number(v); return v && n > 0 ? n : null; }

  num(v: string): number | null { const n = Number(v); return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null; }

  /** "built in v1", or "Wound · Riverside v3". */
  promptShort(t: ImageType, id: number | null): string {
    const p = id == null ? this.builtInPrompt(t) : this.settings()?.prompts.find(x => x.promptId === id);
    if (!p) return id == null ? (t.promptName ? `${t.promptName}${t.promptVersion != null ? ' v' + t.promptVersion : ''}` : 'built in') : `prompt ${id}`;
    return p.builtIn ? `built in v${p.version}` : `${p.name} v${p.version}`;
  }

  promptLabel(t: ImageType, id: number | null): string {
    return this.promptShort(t, id);
  }

  modelOf(model: string | null): AiModelOption | null {
    return model ? this.settings()?.models.find(m => m.model === model) ?? null : null;
  }

  modelName(model: string | null): string {
    return model ?? (this.settings()?.fallbackModel ? `${this.settings()!.fallbackModel} (default)` : 'the default model');
  }

  limitHint(model: string | null, key: 'callTimeoutSeconds' | 'answerTokens'): string {
    const v = this.modelOf(model ?? this.settings()?.fallbackModel ?? null)?.[key];
    return v != null ? `the model's: ${v}` : "the model's";
  }

  baseName(t: ImageType): string {
    return this.settings()?.types.find(x => x.key === t.baseKey)?.name ?? t.baseKey ?? '';
  }

  took(ms: number): string { return formatDuration(ms / 1000); }

  cell(r: DescribeResult | null | undefined, f: string): string {
    const v = r?.fields?.[f];
    return v == null ? '' : String(v).trim();
  }

  labelOf = fieldLabel;

  openCatalog(): void {
    this.ref.close(this.savedOnce);
    void this.router?.navigate(['/tools/images'], { queryParams: { view: 'types' } });
  }

  openPrompt(id: number): void {
    this.ref.close(this.savedOnce);
    void this.router?.navigate(['/pipelines/prompts', id, 'edit']);
  }

  async duplicate(p: AiPromptOption): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.duplicate(p.promptId));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The prompt could not be duplicated.'); return; }
      this.toast.success(`${p.name} is copied into this workspace: edit it in Prompts, then choose it here.`);
      this.openPrompt(r.data.promptId);
    } catch (err) {
      this.toast.error(messageOf(err) || 'The prompt could not be duplicated.');
    } finally {
      this.busy.set(false);
    }
  }

  async addType(): Promise<void> {
    const a = this.adding();
    if (!a?.name.trim()) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.addType(a.name.trim(), a.baseKey));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The type could not be added.'); return; }
      this.toast.success(`${r.data.name} is added, as a copy of ${this.settings()?.types.find(t => t.key === a.baseKey)?.name ?? a.baseKey}.`);
      this.adding.set(null);
      this.savedOnce = true;
      this.load(r.data.key);
    } catch (err) {
      this.toast.error(messageOf(err) || 'The type could not be added.');
    } finally {
      this.busy.set(false);
    }
  }

  async removeType(t: ImageType): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: `Delete ${t.name}?`, confirmLabel: 'Delete type', danger: true,
      body: 'It is no longer offered at upload. Images already of this type keep their type and description.' });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.removeType(t.key));
      if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The type could not be deleted.'); return; }
      this.toast.success(`${t.name} is deleted.`);
      this.savedOnce = true;
      this.selected.set('');
      this.load();
    } catch (err) {
      this.toast.error(messageOf(err) || 'The type could not be deleted.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Try the saved choice and, when it was changed, the change too, on the synthetic photo picked. */
  async tryIt(): Promise<void> {
    const t = this.current();
    const photo = this.tryPick();
    if (!t || !photo) return;
    const saved = this.saved(t.key), draft = this.draftOf(t.key);
    const changed = saved.promptId !== draft.promptId || saved.model !== draft.model;
    this.trying.set(true);
    this.tryError.set('');
    this.tryResult.set(null);
    const one = async (d: TypeSave): Promise<DescribeResult | null> => {
      const r = await firstValueFrom(this.api.tryIt({ typeKey: t.key, promptId: d.promptId, model: d.model, photo }));
      if (r.status !== API_SUCCESS || !r.data) throw { error: { message: r.message } };
      if (r.data.status !== 'ok') this.tryError.set(r.data.status === 'held'
        ? 'The answer was not the type\'s fields, so it was held and not shown.' : r.data.message || 'The model did not answer.');
      return r.data;
    };
    try {
      const now = await one(saved);
      const change = changed ? await one(draft) : null;
      this.tryResult.set({ now, change });
    } catch (err) {
      this.tryError.set(messageOf(err) || 'It could not be tried.');
      this.tryResult.set({ now: null, change: null });
    } finally {
      this.trying.set(false);
    }
  }

  async save(): Promise<void> {
    const s = this.settings();
    if (!s?.canChange) return;
    this.busy.set(true);
    try {
      for (const t of s.types) {
        const d = this.draftOf(t.key);
        if (!typeChanges(typeSave(t), d, () => '', () => '').length) continue;
        const body: TypeSave = { ...d, measured: d.measured && canMeasure(t), target: d.measured && canMeasure(t) ? d.target ?? 'red_region' : null };
        const r = await firstValueFrom(this.api.saveType(t.key, body));
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || `${t.name} could not be saved.`); return; }
      }
      if (this.sideKeys.some(k => this.sideChanged(k))) {
        const r = await firstValueFrom(this.api.saveSettings({ suggest: this.sides().suggest, ask: this.sides().ask }));
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The suggestion and Ask could not be saved.'); return; }
      }
      this.toast.success('Saved. New images use it; earlier descriptions keep the prompt and model that wrote them.');
      this.ref.close(true);
    } catch (err) {
      this.toast.error(messageOf(err) || 'The AI settings could not be saved.');
    } finally {
      this.busy.set(false);
    }
  }
}
