import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import { ConverterApi } from './converter.api';
import { ConversionRow, documentsTakes, kindLabel, problemOf } from './converter.model';

export type PreviewAction = 'download' | 'documents' | 'pipeline' | 'keep';
type Side = 'input' | 'output';

/** How many pages a side has: the row says when it knows, else the server's X-Page-Count, else one. */
export function pagesOf(row: ConversionRow, side: Side, header: number | null): number {
  const known = side === 'input' ? row.inputPages : row.outputPages;
  return Math.max(1, known ?? header ?? 1);
}

/**
 * A conversion's result beside its original, page by page (tools redesign): both sides rendered on the server as page
 * images, the checks the converter made (pages, fonts embedded, fonts substituted, text selectable), and what to do with
 * the result. The page owns the actions (dialogs, toasts); this only says which was chosen.
 */
@Component({
  selector: 'app-conversion-preview',
  imports: [Icon, Segmented, ServerTimePipe],
  styles: `
    :host { display: block; }
    .pv-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-bottom: 1px solid var(--border-subtle); }
    .pv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.125rem; padding: 1.125rem; background: var(--surface-sunken); }
    .pv-grid.one { grid-template-columns: minmax(0, 40rem); justify-content: center; }
    .pv-cap { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.5rem; min-height: 1.5rem; }
    .pv-paper { aspect-ratio: 210 / 297; background: var(--paper); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
                box-shadow: 0 1px 3px var(--shadow-color); display: grid; place-items: center; overflow: hidden; }
    .pv-paper img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .pv-checks { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; padding: 0.625rem 1rem; border-top: 1px solid var(--border-subtle); font-size: 0.8125rem; }
    .pv-checks span { display: inline-flex; align-items: center; gap: 0.375rem; }
    .pv-ok { color: var(--ok-text); } .pv-warn { color: var(--warn-text); }
    .pv-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border-subtle); }
    .pv-note { margin-left: auto; font-size: 0.75rem; color: var(--text-muted); }
    :host(.pv-full) { position: fixed; inset: 0; z-index: 60; overflow: auto; background: var(--surface-page); }
    @media (max-width: 47.99rem) { .pv-grid { grid-template-columns: 1fr; } }
  `,
  host: { '[class.pv-full]': 'full()' },
  template: `
    @if (row(); as r) {
      <div class="pv-head">
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold truncate m-0" data-test="preview-title">
            {{ r.inputFileName }} <span class="font-normal text-[color:var(--text-muted)]">→</span> {{ r.outputFormat.toUpperCase() }}
          </h2>
          <div class="text-xs text-[color:var(--text-muted)]">
            Converted {{ r.createdAt ? (r.createdAt | serverTime: 'recent') : '' }}@if (r.tookMs != null) { · {{ (r.tookMs / 1000).toFixed(1) }} s }
          </div>
        </div>
        @if (r.outcome !== 'FAILED') {
          <app-segmented [value]="mode()" (valueChange)="mode.set($event)" [options]="modes" ariaLabel="How to show the result" />
          <div class="flex items-center gap-1">
            <button type="button" class="btn btn-default btn-icon btn-sm" aria-label="Previous page" [disabled]="page() <= 1" (click)="go(-1)">
              <app-icon name="chevronLeft" /></button>
            <span class="text-sm tabular" data-test="preview-page">Page {{ page() }} of {{ pages() }}</span>
            <button type="button" class="btn btn-default btn-icon btn-sm" aria-label="Next page" [disabled]="page() >= pages()" (click)="go(1)">
              <app-icon name="chevronRight" /></button>
          </div>
          <button type="button" class="btn btn-default btn-icon btn-sm" [attr.aria-label]="full() ? 'Leave full screen' : 'Full screen'"
                  [title]="full() ? 'Leave full screen' : 'Full screen'" (click)="full.set(!full())"><app-icon [name]="full() ? 'close' : 'maximize'" /></button>
        }
      </div>

      @if (problem(); as p) {
        <div class="p-4 flex items-start gap-2 text-sm" role="alert" data-test="preview-problem">
          <app-icon [name]="p.icon" class="icon-crit shrink-0 mt-0.5" />
          <span><b>{{ p.title }}</b> <span class="text-[color:var(--crit-text)]">{{ p.text }}</span></span>
        </div>
      } @else {
        <div class="pv-grid" [class.one]="mode() === 'result'">
          @if (mode() === 'side') {
            <div class="min-w-0">
              <div class="pv-cap"><span class="pill pill-neutral">Original</span>{{ kind(r.inputFormat) }}@if (r.inputFileSize != null) { · {{ size(r.inputFileSize) }} }</div>
              <div class="pv-paper" data-test="preview-original">
                @if (images().input; as src) { <img [src]="src" [alt]="'Page ' + page() + ' of the original'" /> }
                @else if (failed().input) { <span class="text-xs text-[color:var(--text-muted)] p-4 text-center">{{ failed().input }}</span> }
                @else { <app-icon name="refresh" [busy]="true" class="icon-muted" /> }
              </div>
            </div>
          }
          <div class="min-w-0">
            <div class="pv-cap"><span class="pill pill-brand">Result</span>{{ r.outputFormat.toUpperCase() }}@if (r.outputFileSize != null) { · {{ size(r.outputFileSize) }} }@if (r.outputPages != null) { · {{ r.outputPages }} {{ r.outputPages === 1 ? 'page' : 'pages' }} }</div>
            <div class="pv-paper" data-test="preview-result">
              @if (images().output; as src) { <img [src]="src" [alt]="'Page ' + page() + ' of the result'" /> }
              @else if (failed().output) { <span class="text-xs text-[color:var(--text-muted)] p-4 text-center">{{ failed().output }}</span> }
              @else { <app-icon name="refresh" [busy]="true" class="icon-muted" /> }
            </div>
          </div>
        </div>
        @if (r.checks?.length || r.outcome === 'SHORTENED') {
          <div class="pv-checks" data-test="preview-checks">
            @if (r.outcome === 'SHORTENED' && r.rowCount != null) {
              <span class="pv-warn"><app-icon name="alert" />First {{ (r.rowsShown ?? 0).toLocaleString('en-US') }} of {{ r.rowCount.toLocaleString('en-US') }} rows printed; the full data is the file you converted</span>
            }
            @for (c of r.checks ?? []; track c.key + c.text) {
              <span [class.pv-ok]="c.ok" [class.pv-warn]="!c.ok"><app-icon [name]="c.ok ? 'checkCircle' : 'alert'" />{{ c.text }}</span>
            }
          </div>
        }
        <div class="pv-actions">
          <button type="button" class="btn btn-primary btn-sm" (click)="act.emit('download')" data-test="preview-download">
            <app-icon name="download" />Download {{ r.outputFormat.toUpperCase() }}</button>
          @if (canSend() && documentsTakes(r.outputFormat)) {
            <button type="button" class="btn btn-default btn-sm" (click)="act.emit('documents')" [disabled]="!!r.documents?.ocrDocumentId"
                    data-test="preview-documents"><app-icon name="inbox" />{{ r.documents?.ocrDocumentId ? 'Sent to Documents' : 'Send to Documents…' }}</button>
          }
          <button type="button" class="btn btn-default btn-sm" (click)="act.emit('pipeline')" data-test="preview-pipeline">
            <app-icon name="layers" />Start a pipeline…</button>
          @if (r.keptIn !== 'bucket') {
            <button type="button" class="btn btn-default btn-sm" (click)="act.emit('keep')" data-test="preview-keep"><app-icon name="folder" />Keep in a bucket…</button>
          }
          @if (canSend() && documentsTakes(r.outputFormat)) {
            <span class="pv-note">Send to Documents reads it as a document type (for example Discharge summary) and puts it in the review queue.</span>
          }
        </div>
      }
    } @else {
      <div class="p-10 text-center text-sm text-[color:var(--text-muted)]" data-test="preview-empty">
        <app-icon name="file" size="1.5rem" class="icon-muted" />
        <p class="mt-2">Pick a converted file in the queue or in Recent conversions to see it beside its original.</p>
      </div>
    }
  `,
})
export class ConversionPreview {
  private readonly api = inject(ConverterApi);

  readonly row = input<ConversionRow | null>(null);
  /** The reader may open Documents (its intake). */
  readonly canSend = input(false);
  readonly act = output<PreviewAction>();

  readonly modes: SegmentOption<'side' | 'result'>[] = [
    { id: 'side', label: 'Side by side', icon: 'columns' },
    { id: 'result', label: 'Result only' },
  ];
  readonly mode = signal<'side' | 'result'>('side');
  readonly page = signal(1);
  readonly full = signal(false);
  private readonly counted = signal<{ input: number | null; output: number | null }>({ input: null, output: null });
  readonly images = signal<{ input: string | null; output: string | null }>({ input: null, output: null });
  readonly failed = signal<{ input: string; output: string }>({ input: '', output: '' });
  readonly pages = computed(() => {
    const r = this.row();
    return r ? pagesOf(r, 'output', this.counted().output) : 1;
  });
  readonly problem = computed(() => { const r = this.row(); return r ? problemOf(r) : null; });
  readonly size = formatSize;
  readonly kind = kindLabel;
  readonly documentsTakes = documentsTakes;

  private loads: Subscription[] = [];

  constructor() {
    // A new row starts on its first page.
    effect(() => {
      this.row()?.conversionId;
      untracked(() => { this.page.set(1); this.counted.set({ input: null, output: null }); });
    });
    effect(() => {
      const r = this.row(), page = this.page(), side = this.mode() === 'side';
      untracked(() => this.load(r, page, side));
    });
    inject(DestroyRef).onDestroy(() => { this.loads.forEach(s => s.unsubscribe()); this.revoke(); });
  }

  go(by: number): void {
    this.page.set(Math.min(this.pages(), Math.max(1, this.page() + by)));
  }

  private load(r: ConversionRow | null, page: number, both: boolean): void {
    this.loads.forEach(s => s.unsubscribe());
    this.loads = [];
    this.revoke();
    this.failed.set({ input: '', output: '' });
    if (!r || r.outcome === 'FAILED') return;
    const sides: Side[] = both ? ['input', 'output'] : ['output'];
    for (const side of sides) {
      const inputPages = side === 'input' ? pagesOf(r, 'input', this.counted().input) : null;
      if (inputPages != null && r.inputPages != null && page > inputPages) {
        this.failed.update(f => ({ ...f, input: `The original has ${inputPages} ${inputPages === 1 ? 'page' : 'pages'}.` }));
        continue;
      }
      this.loads.push(this.api.page(r.conversionId, side, page).subscribe({
        next: response => {
          const header = Number(response.headers.get('X-Page-Count'));
          if (header > 0) this.counted.update(c => ({ ...c, [side]: header }));
          if (!response.body) return;
          const url = URL.createObjectURL(response.body);
          this.images.update(i => ({ ...i, [side]: url }));
        },
        error: () => this.failed.update(f => ({ ...f, [side]: side === 'input'
          ? 'The original could not be shown as pages.' : 'This page could not be shown; Download opens the file.' })),
      }));
    }
  }

  private revoke(): void {
    const { input, output } = this.images();
    if (input) URL.revokeObjectURL(input);
    if (output) URL.revokeObjectURL(output);
    this.images.set({ input: null, output: null });
  }
}
