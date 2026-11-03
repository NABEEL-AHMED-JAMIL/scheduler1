import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import { ConverterApi } from './converter.api';
import {
  ConversionRow, Problem, checkLines, documentsTakes, folderOf, kindLabel, panelMeta, problemOf, resultText, statusOf,
} from './converter.model';

export type PanelAction = 'download' | 'documents' | 'pipeline' | 'keep' | 'delete' | 'remove';
type Side = 'input' | 'output';
type PanelTab = 'result' | 'original' | 'details';

/** How many pages a side has: the row says when it knows, else the server's X-Page-Count, else one. */
export function pagesOf(row: ConversionRow, side: Side, header: number | null): number {
  const known = side === 'input' ? row.inputPages : row.outputPages;
  return Math.max(1, known ?? header ?? 1);
}

/** A file still in the page's queue (not yet a conversion on the server): its name, its state in words, its problem. */
export interface LocalItem {
  name: string;
  pill: { label: string; tone: 'ok' | 'info' | 'warn' | 'crit' | 'neutral' };
  meta: string;
  problem: Problem | null;
}

/**
 * The selected conversion, in the side panel (tools Option A, owner 2026-11-02; design converter-a.html): its status and
 * "DOCX → PDF · 3.1 s", Result / Original / Details, the page rendered on the server with Page 1 of 3 and the converter's
 * check line, and Next steps -- Download, Send to Documents, Start a pipeline, with Keep in a bucket and Delete under ⋮.
 * A failure says what happened and what to do next. The page owns the actions (dialogs, toasts); this says which.
 */
@Component({
  selector: 'app-conversion-panel',
  imports: [Icon, ServerTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  host: { class: 'tx-panel', role: 'region', '[attr.aria-label]': '"The selected conversion"' },
  styleUrls: ['../tools-panel.css'],
  styles: `
    .cp-pv { padding: 1rem; background: var(--surface-sunken); }
    .cp-paper { aspect-ratio: 210 / 297; background: var(--paper); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
      box-shadow: 0 1px 3px var(--shadow-color); display: grid; place-items: center; overflow: hidden; }
    .cp-paper img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .cp-pager { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.75rem; }
    .cp-pager .tp-ok, .cp-pager .tp-warn { margin-left: auto; }
  `,
  template: `
    @if (row(); as r) {
      @let st = statusOf(r);
      <div class="tp-h">
        <div class="tp-top">
          <span [class]="'pill pill-' + st.tone" data-test="panel-status"><app-icon [name]="st.icon" size="0.85em" />{{ st.label }}</span>
          <span class="text-xs text-[color:var(--text-muted)] tabular truncate" data-test="panel-meta">{{ meta() }}</span>
          <button type="button" class="btn btn-ghost btn-icon btn-xs tp-x" aria-label="Close" (click)="closed.emit()"><app-icon name="close" /></button>
        </div>
        <h2 data-test="panel-title">{{ r.name }}</h2>
      </div>
      @if (problem(); as p) {
        <div class="tp-body">
          <div class="tp-problem" role="alert" data-test="panel-problem"><app-icon [name]="p.icon" class="icon-crit shrink-0 mt-0.5" />
            <span><b>{{ p.title }}</b> {{ p.text }}</span></div>
          <dl class="tp-kv">
            <dt>File</dt><dd class="mono">{{ r.inputFileName }}</dd>
            <dt>Size</dt><dd>{{ r.inputFileSize != null ? size(r.inputFileSize) : '—' }}</dd>
            <dt>By</dt><dd>{{ by() }}</dd>
            <dt>When</dt><dd>{{ r.createdAt ? (r.createdAt | serverTime: 'recent') : '—' }}</dd>
          </dl>
          <div class="tp-next">
            <div class="tp-eyebrow">Next steps</div>
            <div class="tp-acts">
              <button type="button" class="btn btn-default btn-sm" (click)="act.emit('delete')" data-test="panel-delete"><app-icon name="trash" />Remove from the list</button>
            </div>
          </div>
        </div>
      } @else {
        <div class="tabs tp-tabs" role="tablist" aria-label="The selected conversion">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" class="tab" [class.tab-active]="tab() === t.id" [attr.aria-selected]="tab() === t.id"
                    (click)="tab.set(t.id)" [attr.data-tab]="t.id">{{ t.label }}</button>
          }
        </div>
        @if (tab() === 'details') {
          <div class="tp-body" data-test="panel-details">
            <dl class="tp-kv">
              <dt>Original</dt><dd><span class="mono">{{ r.inputFileName }}</span> · {{ kind(r.inputFormat) }}@if (r.inputFileSize != null) { · {{ size(r.inputFileSize) }} }</dd>
              <dt>Result</dt><dd><span class="mono">{{ r.outputFileName || '—' }}</span> · {{ result(r) }}</dd>
              @if (r.engine) { <dt>Converted by</dt><dd>{{ r.engine === 'libreoffice' ? 'LibreOffice, on this platform' : r.engine }}</dd> }
              <dt>Took</dt><dd>{{ r.tookMs != null ? (r.tookMs / 1000).toFixed(1) + ' s' : '—' }}</dd>
              <dt>By</dt><dd>{{ by() }}</dd>
              <dt>When</dt><dd>{{ r.createdAt ? (r.createdAt | serverTime: 'recent') : '—' }}</dd>
              <dt>Kept</dt><dd>{{ kept() || '—' }}</dd>
              @for (c of r.checks ?? []; track c.key + c.text; let first = $first) {
                <dt>{{ first ? 'Checks' : '' }}</dt><dd [class.tp-warn]="!c.ok">{{ c.text }}</dd>
              }
            </dl>
          </div>
        } @else {
          <div class="cp-pv">
            <div class="cp-paper" [attr.data-test]="tab() === 'result' ? 'preview-result' : 'preview-original'">
              @if (image(); as src) { <img [src]="src" [alt]="'Page ' + page() + ' of the ' + (tab() === 'result' ? 'result' : 'original')" /> }
              @else if (failedText()) { <span class="text-xs text-[color:var(--text-muted)] p-4 text-center">{{ failedText() }}</span> }
              @else { <app-icon name="refresh" [busy]="true" class="icon-muted" /> }
            </div>
            <div class="cp-pager">
              <button type="button" class="btn btn-default btn-icon btn-xs" aria-label="Previous page" [disabled]="page() <= 1" (click)="go(-1)"><app-icon name="chevronLeft" /></button>
              <span class="tabular" data-test="preview-page">Page {{ page() }} of {{ pages() }}</span>
              <button type="button" class="btn btn-default btn-icon btn-xs" aria-label="Next page" [disabled]="page() >= pages()" (click)="go(1)"><app-icon name="chevronRight" /></button>
              @if (tab() === 'result') {
                @if (checks().warn) { <span class="tp-warn" data-test="preview-checks"><app-icon name="alert" />{{ checks().warn }}</span> }
                @else if (checks().ok) { <span class="tp-ok" data-test="preview-checks"><app-icon name="checkCircle" />{{ checks().ok }}</span> }
              } @else {
                <span class="tp-ok text-[color:var(--text-muted)]">{{ kind(r.inputFormat) }}@if (r.inputFileSize != null) { · {{ size(r.inputFileSize) }} }</span>
              }
            </div>
          </div>
        }
        <div class="tp-body">
          <div class="tp-next" data-test="next-steps">
            <div class="tp-eyebrow">Next steps</div>
            <div class="tp-acts">
              <button type="button" class="btn btn-primary btn-sm" (click)="act.emit('download')" data-test="preview-download">
                <app-icon name="download" />Download {{ r.outputFormat.toUpperCase() }}</button>
              @if (canSend() && takes(r.outputFormat)) {
                <button type="button" class="btn btn-default btn-sm" (click)="act.emit('documents')" [disabled]="!!r.documents?.ocrDocumentId"
                        data-test="preview-documents"><app-icon name="inbox" />{{ r.documents?.ocrDocumentId ? 'Sent to Documents' : 'Send to Documents' }}</button>
              }
              <button type="button" class="btn btn-default btn-sm" (click)="act.emit('pipeline')" data-test="preview-pipeline"><app-icon name="layers" />Start a pipeline</button>
              <button type="button" class="btn btn-default btn-icon btn-sm" [cdkMenuTriggerFor]="more" aria-label="More for this conversion" data-test="panel-more"><app-icon name="dots" /></button>
              <ng-template #more>
                <div cdkMenu class="card shadow-xl py-1 min-w-52 text-sm">
                  @if (r.keptIn !== 'bucket') {
                    <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="act.emit('keep')" data-test="preview-keep"><app-icon name="folder" />Keep in a bucket…</button>
                  }
                  <button cdkMenuItem class="menu-item menu-item-danger" (cdkMenuItemTriggered)="act.emit('delete')"><app-icon name="trash" class="icon-crit" />Delete</button>
                </div>
              </ng-template>
            </div>
            <div class="tp-foot" data-test="panel-kept">
              @if (r.keptIn === 'bucket' && r.bucketName) {
                Kept in <a class="link-inline" routerLink="/data/files" [queryParams]="{ bucket: r.bucketName, prefix: folder(r) }">{{ r.bucketName }}/{{ folder(r) }}</a>
              } @else if (r.documents?.ocrDocumentId) {
                Sent to <a class="link-inline" routerLink="/documents/in">Documents</a> as document {{ r.documents!.ocrDocumentId }}@if (kept()) { · {{ kept() }} }
              } @else {
                {{ kept() || 'Kept 30 days' }} · Keep in a bucket from ⋮
              }
            </div>
          </div>
        </div>
      }
    } @else if (local(); as l) {
      <div class="tp-h">
        <div class="tp-top">
          <span [class]="'pill pill-' + l.pill.tone" data-test="panel-status">{{ l.pill.label }}</span>
          <span class="text-xs text-[color:var(--text-muted)] truncate">{{ l.meta }}</span>
          <button type="button" class="btn btn-ghost btn-icon btn-xs tp-x" aria-label="Close" (click)="closed.emit()"><app-icon name="close" /></button>
        </div>
        <h2 data-test="panel-title">{{ l.name }}</h2>
      </div>
      <div class="tp-body">
        @if (l.problem; as p) {
          <div class="tp-problem" role="alert" data-test="panel-problem"><app-icon [name]="p.icon" class="icon-crit shrink-0 mt-0.5" />
            <span><b>{{ p.title }}</b> {{ p.text }}</span></div>
        } @else {
          <p class="text-sm m-0">It is on its way; it appears with its result here when the converter answers. You can leave this page.</p>
        }
        <div class="tp-next">
          <div class="tp-eyebrow">Next steps</div>
          <div class="tp-acts">
            <button type="button" class="btn btn-default btn-sm" (click)="act.emit('remove')" data-test="panel-remove"><app-icon name="close" />{{ l.problem ? 'Remove from the list' : 'Stop and remove' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConversionPanel {
  private readonly api = inject(ConverterApi);

  readonly row = input<ConversionRow | null>(null);
  readonly local = input<LocalItem | null>(null);
  readonly canSend = input(false);
  /** "You", or the person's name. */
  readonly by = input('—');
  /** "Kept until 2 Dec", or empty. */
  readonly kept = input('');
  readonly act = output<PanelAction>();
  readonly closed = output<void>();

  readonly tabs: { id: PanelTab; label: string }[] = [{ id: 'result', label: 'Result' }, { id: 'original', label: 'Original' }, { id: 'details', label: 'Details' }];
  readonly tab = signal<PanelTab>('result');
  readonly page = signal(1);
  private readonly counted = signal<{ input: number | null; output: number | null }>({ input: null, output: null });
  readonly image = signal<string | null>(null);
  readonly failedText = signal('');
  readonly side = computed<Side>(() => (this.tab() === 'original' ? 'input' : 'output'));
  readonly pages = computed(() => { const r = this.row(); return r ? pagesOf(r, this.side(), this.counted()[this.side()]) : 1; });
  readonly problem = computed(() => { const r = this.row(); return r ? problemOf(r) : null; });
  readonly meta = computed(() => { const r = this.row(); return r ? panelMeta(r) : ''; });
  readonly checks = computed(() => { const r = this.row(); return r ? checkLines(r) : { ok: '', warn: '' }; });
  readonly size = formatSize;
  readonly kind = kindLabel;
  readonly takes = documentsTakes;
  readonly folder = folderOf;
  readonly result = resultText;
  readonly statusOf = statusOf;
  private load: Subscription | null = null;

  constructor() {
    // A new conversion opens on its result's first page.
    effect(() => {
      this.row()?.conversionId;
      untracked(() => { this.tab.set('result'); this.page.set(1); this.counted.set({ input: null, output: null }); });
    });
    effect(() => {
      const r = this.row(), page = this.page(), tab = this.tab();
      untracked(() => this.read(r, page, tab));
    });
    inject(DestroyRef).onDestroy(() => { this.load?.unsubscribe(); this.revoke(); });
  }

  go(by: number): void {
    this.page.set(Math.min(this.pages(), Math.max(1, this.page() + by)));
  }

  private read(r: ConversionRow | null, page: number, tab: PanelTab): void {
    this.load?.unsubscribe();
    this.load = null;
    this.revoke();
    this.failedText.set('');
    if (!r || r.outcome === 'FAILED' || tab === 'details') return;
    const side: Side = tab === 'original' ? 'input' : 'output';
    this.load = this.api.page(r.conversionId, side, page).subscribe({
      next: response => {
        const header = Number(response.headers.get('X-Page-Count'));
        if (header > 0) this.counted.update(c => ({ ...c, [side]: header }));
        if (response.body) this.image.set(URL.createObjectURL(response.body));
      },
      error: () => this.failedText.set(side === 'input' ? 'The original could not be shown as pages.' : 'This page could not be shown; Download opens the file.'),
    });
  }

  private revoke(): void {
    const url = this.image();
    if (url) URL.revokeObjectURL(url);
    this.image.set(null);
  }
}
