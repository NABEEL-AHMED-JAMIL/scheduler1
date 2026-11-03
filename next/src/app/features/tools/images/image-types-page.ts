import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { messageOf } from './image-actions';
import { AiSettingsSheet } from './ai-settings-sheet';
import { ImageAiApi, ImageType, ImageTypesStore, TRY_PHOTOS, measuredText, neverText } from './image-ai';

/** The Prompts collection, narrowed to Image review's prompts. */
export const IMAGE_REVIEW_TAG = 'Image review';

/**
 * Image types (owner-approved design 2026-11-03, types-catalog), reached from Image review's header: one card per type, as
 * the console's card grid (Templates) -- a synthetic photo, the type's name, Built in or Ours, Measured or Not measured; its
 * measurement, the fields its prompt fills, what it never says, its prompt (a link to Prompts, tag Image review) and its
 * warning. Read-only for everyone but administrators, who have AI settings, Add a type, and Duplicate to edit on each card
 * (a workspace type copied from it, opened in AI settings).
 */
@Component({
  selector: 'app-image-types-page',
  imports: [PageHeader, Icon, AppLoading, InlineStatus, RouterLink],
  styleUrls: ['./images.css'],
  styles: `
    .tc-lock { display: flex; gap: 0.5rem; align-items: flex-start; margin-top: 1rem; padding: 0.75rem 0.875rem; border-radius: var(--radius-lg);
      background: var(--surface-inset); border: 1px solid var(--border-subtle); font-size: 0.8125rem; line-height: 1.5; }
    .tc-lock app-icon { flex: none; margin-top: 0.125rem; color: var(--text-muted); }
    .tc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr)); gap: 1rem; margin-top: 1.25rem; }
    .tc { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
    .tc-photo { aspect-ratio: 16 / 9; background: var(--surface-sunken); border-bottom: 1px solid var(--border-subtle); overflow: hidden; }
    .tc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tc-b { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; flex: 1 1 auto; }
    .tc-h { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
    .tc-h h3 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
    .tc-h .tc-end { margin-left: auto; }
    .tc dl { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: 0.5rem 0.75rem; margin: 0; font-size: 0.8125rem; }
    .tc dt { color: var(--text-muted); }
    .tc dd { margin: 0; overflow-wrap: anywhere; }
    .tc-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .tc-never { color: var(--text-secondary); }
    .tc-warn { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.5rem 0.75rem; border-radius: var(--radius-lg); background: var(--pill-warn-bg);
      font-size: 0.75rem; line-height: 1.45; }
    .tc-warn app-icon { flex: none; margin-top: 0.0625rem; color: var(--warn-text); }
    .tc-foot { margin-top: auto; }
  `,
  template: `
    <div class="page-tool">
      <app-page-header title="Image types" crumb="Image types" [hub]="false"
                       subtitle="Each type has its own description prompt (in Prompts, tag Image review), the fields it fills, whether it is measured, and what it never says. Built-in types are read-only; duplicate one to make your own.">
        @if (store.canChange()) {
          <button type="button" class="btn btn-default btn-sm" (click)="settings()" data-test="types-ai-settings"><app-icon name="settings" />AI settings</button>
          <button type="button" class="btn btn-primary btn-sm" (click)="settings('add')" data-test="types-add"><app-icon name="plus" />Add a type</button>
        }
      </app-page-header>

      <div class="tc-lock" data-test="types-rules"><app-icon name="lock" />
        <span><b>Every type:</b> describe, measure, sort and route; never diagnose. Questions like “is there a fracture?” or “is this tissue abnormal?” are not answered.
          Sizes only from a paper ruler, in code; unsure fields stay empty; always a draft; local models only.</span></div>

      @if (state.error()) {
        <div class="card p-4 mt-5"><app-inline-status [error]="state.error()" (retry)="load()" /></div>
      } @else if (!store.loaded() && state.pending()) {
        <div class="mt-5"><app-loading shape="rows" label="Loading the image types…" [count]="4" /></div>
      } @else {
        <div class="tc-grid" data-test="types-grid">
          @for (t of types(); track t.key) {
            <section class="card tc" [attr.data-type]="t.key">
              <div class="tc-photo">@if (thumb(t); as src) { <img [src]="src" [alt]="'Synthetic test image · ' + t.name" /> }</div>
              <div class="tc-b">
                <div class="tc-h"><h3>{{ t.name }}</h3>
                  <span class="pill" [class.pill-neutral]="t.builtIn" [class.pill-info]="!t.builtIn">{{ t.builtIn ? 'Built in' : 'Ours' }}</span>
                  @if (!t.offered) { <span class="pill pill-warn">Not offered here</span> }
                  <span class="pill tc-end" [class.pill-ok]="t.measured" [class.pill-neutral]="!t.measured">{{ t.measured ? 'Measured' : 'Not measured' }}</span></div>
                <dl>
                  <dt>Measured</dt><dd>{{ measuredText(t) + (!t.measured && t.description ? ': ' + t.description : '') }}</dd>
                  <dt>Fields</dt><dd class="tc-chips">@for (f of t.fields; track f) { <span class="pill pill-neutral mono">{{ f }}</span> } @empty { — }</dd>
                  @if (never(t)) { <dt>Never</dt><dd class="tc-never">{{ never(t) }}</dd> }
                  <dt>Prompt</dt><dd>@if (t.promptName) { <a class="link-inline" routerLink="/pipelines/prompts" [queryParams]="{ tag: tag }" data-test="type-prompt">{{ t.promptName }}</a>@if (t.promptVersion != null) { v{{ t.promptVersion }} } } @else { — }</dd>
                </dl>
                @if (t.note) { <div class="tc-warn" data-test="type-note"><app-icon name="alert" size="0.95em" /><span>{{ t.note }}</span></div> }
                @if (store.canChange()) {
                  <button type="button" class="btn btn-default btn-sm self-start tc-foot" (click)="duplicate(t)" [disabled]="busy()" data-test="type-duplicate"><app-icon name="copy" />Duplicate to edit</button>
                }
              </div>
            </section>
          } @empty {
            <p class="text-sm text-[color:var(--text-muted)]">No image type is set up yet.</p>
          }
        </div>
        @if (!store.canChange()) {
          <p class="text-xs text-[color:var(--text-muted)] mt-4" data-test="types-read-only">Read-only: an administrator of this workspace chooses each type's prompt and model in AI settings.</p>
        }
      }
    </div>
  `,
})
export class ImageTypesPage implements OnInit {
  readonly store = inject(ImageTypesStore);
  private readonly api = inject(ImageAiApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly state = createLoadState();
  readonly busy = signal(false);
  readonly tag = IMAGE_REVIEW_TAG;
  readonly measuredText = measuredText;
  private readonly thumbs = signal<Record<string, string>>({});
  readonly types = computed(() => this.store.types());

  constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u)));
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.state.start();
    this.api.types().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'The image types could not be read.'); return; }
        this.store.types.set([...(r.data.types ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        this.store.canChange.set(!!r.data.canChange);
        this.store.loaded.set(true);
        this.state.done();
        this.loadThumbs();
      },
      error: err => this.state.fail(err, 'The image types could not be read.'),
    });
  }

  private loadThumbs(): void {
    const names = new Set(this.types().map(t => TRY_PHOTOS[t.baseKey ?? t.key]).filter(Boolean));
    for (const name of names) {
      if (this.thumbs()[name]) continue;
      this.api.tryPhoto(name).subscribe({ next: blob => this.thumbs.update(m => ({ ...m, [name]: URL.createObjectURL(blob) })), error: () => undefined });
    }
  }

  thumb(t: ImageType): string {
    return this.thumbs()[TRY_PHOTOS[t.baseKey ?? t.key] ?? ''] ?? '';
  }

  never(t: ImageType): string { return neverText(t.never); }

  settings(focus?: string): void {
    this.dialog.open<boolean | undefined>(AiSettingsSheet, sidePanelConfig({ focus }, 'wide', 'right')).closed.subscribe(saved => {
      if (saved) { this.store.load(true); this.load(); }
    });
  }

  /** A workspace type copied from this one (its settings), opened in AI settings to choose its prompt and model. */
  async duplicate(t: ImageType): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.addType(`${t.name} (ours)`, t.baseKey ?? t.key));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The type could not be duplicated.'); return; }
      this.toast.success(`${r.data.name} is made from ${t.name}. Choose its prompt and model here; duplicate the prompt to change its wording.`);
      this.store.load(true);
      this.load();
      this.settings(r.data.key);
    } catch (err) {
      this.toast.error(messageOf(err) || 'The type could not be duplicated.');
    } finally {
      this.busy.set(false);
    }
  }
}
