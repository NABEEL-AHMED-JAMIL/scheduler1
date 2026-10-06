import { Component, HostListener, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { DataText } from '../../shared/ui/data-text';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { confirmWith } from '../../shared/ui/confirm';
import {
  ExtractedField, OcrDocument, ReviewDetail, RuleOutcome, TableView, correctionsOf, documentFields, fieldName, fileName, isLow, lowLine,
  nextInQueue, nextRowIndex, refusalText, ruleText, shortcutOf, skippedWhy, statusLabel, statusOf, stepIndex, tableViews, typeLabel,
} from './documents.model';
import { DocumentsApi } from './documents.service';
import { PageViewer, ViewerBox } from './page-viewer';
import { ConfidenceBar } from './confidence-bar';
import { RejectDialog, RejectDialogData } from './reject-dialog';

type Busy = '' | 'save' | 'approve' | 'reject' | 'claim';

/** Whether the element is wholly inside the window. */
function inView(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
}

/** A new line item being typed: its cells go as table, row and column corrections. */
interface NewRow { tableKey: string; rowIndex: number; values: Record<string, string>; }

/**
 * One document under review (MIG-272, Documents > Review queue, page key document-review): the page image with a box
 * over every value (page-viewer.ts), and beside it the fields with their confidence -- the ones a reviewer should look
 * at flagged -- the type's rule checks, the line items and the corrections so far.
 *
 * Clicking a field (or its box) selects it: its box is highlighted and scrolled into view. A reviewer corrects values
 * in place; Approve & next saves them first, asks before approving over a failing rule, approves and opens the next
 * document in the queue; Reject asks why. Keys: A approves, R rejects, ↓ and ↑ move between fields, none while typing.
 *
 * Every decision carries the revision the reviewer has open; a document that changed meanwhile (409) is read again
 * with a message. A document no longer in Review -- or claimed by someone else -- is shown read-only.
 */
@Component({
  selector: 'app-document-review',
  imports: [RouterLink, Icon, StatusPill, DataText, ServerTimePipe, PageViewer, ConfidenceBar],
  templateUrl: './review.html',
  styles: [`
    .review-split { display: grid; gap: 1rem; align-items: start; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1024px) {
      .review-split { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
      .review-viewer { position: sticky; top: 4.5rem; }
    }
    .doc-field { display: grid; grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 4.5rem; gap: 0.5rem; align-items: center;
      padding: 0.375rem 0.5rem; margin: 0 -0.5rem; border-radius: var(--radius-lg); cursor: pointer; }
    .doc-field:hover { background: var(--surface-sunken); }
    .doc-field-active { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--info-mark); }
    .doc-field-active:hover { background: var(--accent-soft); }
    .doc-field-name { text-align: left; font-size: 0.75rem; color: var(--text-secondary); overflow-wrap: anywhere; }
    .doc-field-low .input, .input.doc-field-low { border-color: var(--color-warn-500);
      background: color-mix(in oklab, var(--color-warn-500) 9%, var(--surface-raised)); }
    .note-bar { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.5rem 0.75rem; border-radius: var(--radius-lg); font-size: 0.8125rem;
      border: 1px solid var(--border-subtle); background: var(--surface-sunken); color: var(--text-secondary); }
    .note-bar app-icon { margin-top: 0.15rem; flex: none; }
    .note-bar-warn { border-color: color-mix(in oklab, var(--color-warn-500) 45%, transparent); color: var(--warn-text);
      background: color-mix(in oklab, var(--color-warn-500) 10%, var(--surface-raised)); }
    .kbd { font-family: ui-monospace, monospace; font-size: 0.6875rem; padding: 0 0.25rem; border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong); border-bottom-width: 2px; color: var(--text-secondary); }
    .doc-field .input { min-height: 0; padding-top: 0.3rem; padding-bottom: 0.3rem; }
    .doc-cell { min-width: 8.5rem; }
    .doc-cell-active .input { box-shadow: 0 0 0 2px var(--info-mark); }
    @media (max-width: 640px) { .doc-field { grid-template-columns: minmax(0, 1fr) 4.25rem; } .doc-field-name { grid-column: 1 / -1; } }
  `],
})
export class DocumentReview {
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  readonly extractionId = signal(0);
  readonly detail = signal<ReviewDetail | null>(null);
  readonly read = signal<OcrDocument | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<Busy>('');
  /** What the reviewer has typed, by fieldId, until it is saved. */
  readonly edits = signal<Record<number, string>>({});
  readonly newRow = signal<NewRow | null>(null);
  readonly selected = signal<number | null>(null);
  readonly showCorrections = signal(false);
  /** Where this document is in the queue: "document 2 of 5". */
  readonly position = signal<{ at: number; total: number } | null>(null);

  private readonly me = computed(() => this.auth.user()?.appUserId ?? null);

  readonly definition = computed(() => this.detail()?.definition ?? null);
  readonly line = computed(() => lowLine(this.detail()?.autoApproveThreshold ?? this.definition()?.autoApproveThreshold));
  readonly fields = computed(() => documentFields(this.detail()?.fields ?? [], this.definition()));
  readonly tables = computed<TableView[]>(() => tableViews(this.detail()?.fields ?? [], this.definition()));
  /** ↑/↓ order: the document's fields, then each table's cells row by row. */
  readonly order = computed<number[]>(() => [
    ...this.fields().map(f => f.fieldId),
    ...this.tables().flatMap(t => t.rows.flatMap(r => r.cells.filter((c): c is ExtractedField => !!c).map(c => c.fieldId))),
  ]);
  /** The values a reviewer should look at; a decided document has none left to look at. */
  readonly flagged = computed(() => new Set(this.detail()?.status !== 'Review' ? []
    : (this.detail()?.fields ?? []).filter(f => isLow(f, this.line())).map(f => f.fieldId)));
  readonly boxes = computed<ViewerBox[]>(() => (this.detail()?.fields ?? [])
    .filter(f => f.page && f.box)
    .map(f => ({ id: f.fieldId, page: f.page as number, box: f.box!, label: fieldName(f, this.definition()), low: this.flagged().has(f.fieldId) })));
  readonly pageCount = computed(() => Math.max(1, this.read()?.pageCount ?? 0, ...(this.detail()?.fields ?? []).map(f => f.page ?? 0)));

  readonly claimedByOther = computed(() => {
    const d = this.detail();
    return !!d?.claimActive && d.claimedBy != null && d.claimedBy !== this.me();
  });
  readonly claimedByMe = computed(() => {
    const d = this.detail();
    return !!d?.claimActive && d.claimedBy != null && d.claimedBy === this.me();
  });
  readonly inReview = computed(() => this.detail()?.status === 'Review');
  readonly editable = computed(() => this.inReview() && !this.claimedByOther());
  readonly pending = computed(() => correctionsOf(this.detail()?.fields ?? [], this.edits(), this.newRow()));
  readonly dirty = computed(() => this.pending().length > 0);
  readonly checks = computed(() => this.detail()?.checks ?? null);
  readonly failedRules = computed(() => (this.checks()?.rules ?? []).filter(r => r.status === 'failed'));

  readonly title = computed(() => {
    const r = this.read();
    return r ? fileName(r.sourceKey) : this.detail() ? `Document ${this.detail()!.extractionId}` : 'Document';
  });
  readonly subtitle = computed(() => {
    const d = this.detail();
    if (!d) return '';
    const parts = [typeLabel(d)];
    const p = this.position();
    if (this.inReview() && p) parts.push(`document ${p.at} of ${p.total} in the review queue`);
    return parts.join(' · ');
  });
  readonly statusText = computed(() => this.detail() ? statusLabel(this.detail()!) : '');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = Number(params.get('extractionId'));
      this.extractionId.set(id);
      this.edits.set({});
      this.newRow.set(null);
      this.selected.set(null);
      this.detail.set(null);
      this.read.set(null);
      this.load();
    });
  }

  // -------------------------------------------------------------------------------------------- reading

  load(): void {
    const id = this.extractionId();
    if (!id) { this.loading.set(false); this.error.set('No document named.'); return; }
    this.loading.set(true);
    this.error.set('');
    this.api.review(id).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The document could not be read.'); return; }
        this.show(r.data);
        this.readFile(r.data.ocrDocumentId);
        this.locate();
      },
      error: err => { this.loading.set(false); this.error.set(refusalText(err, 'The document could not be read.')); },
    });
  }

  private show(d: ReviewDetail): void {
    this.detail.set(d);
    // Keep only what still differs from what is stored: a saved correction is part of the document now.
    const fields = new Map(d.fields.map(f => [f.fieldId, f]));
    const kept: Record<number, string> = {};
    for (const [id, value] of Object.entries(this.edits())) {
      const f = fields.get(Number(id));
      if (f && (value.trim() === '' ? null : value) !== (f.value ?? null)) kept[Number(id)] = value;
    }
    this.edits.set(kept);
  }

  private readFile(ocrDocumentId: number): void {
    if (this.read()?.ocrDocumentId === ocrDocumentId) return;
    this.api.read(ocrDocumentId).subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) this.read.set(r.data); },
      error: () => { /* the page count falls back to the fields' pages; the title to the document's number */ },
    });
  }

  /** Where the document stands in the queue, for the subtitle. */
  private locate(): void {
    if (!this.inReview()) { this.position.set(null); return; }
    this.api.queue({ status: 'Review', page: 0, size: 200 }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) return;
        const at = r.data.items.findIndex(i => i.extractionId === this.extractionId());
        this.position.set(at >= 0 ? { at: at + 1, total: r.data.total } : null);
      },
      error: () => this.position.set(null),
    });
  }

  // -------------------------------------------------------------------------------------------- selection

  isFlagged(f: ExtractedField): boolean { return this.flagged().has(f.fieldId); }
  nameOf(f: ExtractedField): string { return fieldName(f, this.definition()); }
  valueOf(f: ExtractedField): string { return f.fieldId in this.edits() ? this.edits()[f.fieldId] : (f.value ?? ''); }
  ruleWords(r: RuleOutcome): string { return ruleText(r, this.definition()); }
  skipped(r: RuleOutcome): string { return skippedWhy(r); }

  /**
   * Selects a value: the viewer highlights its box and centres it. `reveal` says what else comes into view -- the box,
   * when the value was picked from the list (on a phone the page image sits above the fields); the value's row, when
   * its box was clicked or the arrows moved; nothing when a reviewer is typing into it.
   */
  select(fieldId: number, reveal: 'box' | 'field' | 'none' = 'none'): void {
    this.selected.set(fieldId);
    if (reveal === 'none') return;
    afterNextRender(() => {
      const target = reveal === 'box' ? document.querySelector<HTMLElement>(`.doc-box[data-field-id="${fieldId}"]`)
        : document.querySelector<HTMLElement>(`[data-field="${fieldId}"]`);
      if (target && !inView(target)) target.scrollIntoView?.({ block: reveal === 'box' ? 'center' : 'nearest', behavior: 'smooth' });
    }, { injector: this.injector });
  }

  private step(delta: 1 | -1): void {
    const order = this.order();
    const at = stepIndex(order.indexOf(this.selected() ?? -1), delta, order.length);
    if (at >= 0) this.select(order[at], 'field');
  }

  // -------------------------------------------------------------------------------------------- corrections

  edit(fieldId: number, value: string): void {
    this.edits.update(e => ({ ...e, [fieldId]: value }));
  }

  addRow(table: TableView): void {
    this.newRow.set({ tableKey: table.key, rowIndex: nextRowIndex(this.detail()?.fields ?? [], table.key),
      values: Object.fromEntries(table.columns.map(c => [c.key, ''])) });
  }

  editNewRow(column: string, value: string): void {
    this.newRow.update(r => r ? { ...r, values: { ...r.values, [column]: value } } : r);
  }

  discard(): void {
    this.edits.set({});
    this.newRow.set(null);
  }

  /** Sends what changed at the revision on screen; resolves true when there is nothing left to save. */
  async save(): Promise<boolean> {
    const d = this.detail();
    const corrections = this.pending();
    if (!d || !corrections.length) return true;
    this.busy.set('save');
    try {
      const r = await firstValueFrom(this.api.correct(d.extractionId, d.revision, corrections));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The corrections were not saved.'); return false; }
      this.newRow.set(null);
      this.show(r.data);
      this.toast.success(r.message || 'Corrections saved.');
      return true;
    } catch (err) {
      this.refused(err, 'The corrections were not saved.');
      return false;
    } finally {
      this.busy.set('');
    }
  }

  // -------------------------------------------------------------------------------------------- decisions

  /** Saves what is typed, asks before approving over a failing rule, approves, and opens the next document. */
  async approve(): Promise<void> {
    if (!this.editable() || this.busy()) return;
    if (!(await this.save())) return;
    const d = this.detail();
    if (!d) return;
    const checks = d.checks;
    if (checks && !checks.canApprove) {
      this.toast.error(`This document cannot be approved yet: ${checks.blockingProblems.join(' ')}`);
      return;
    }
    let accept = false;
    if (checks?.anyRuleFailed) {
      const failed = checks.rules.filter(r => r.status === 'failed').map(r => r.message || this.ruleWords(r));
      accept = await confirmWith(this.dialog, {
        title: 'Approve anyway?',
        body: `A rule fails: ${failed.join(' ')} Approve only if the document is right as it is; that is recorded.`,
        confirmLabel: 'Approve anyway',
      });
      if (!accept) return;
    }
    this.busy.set('approve');
    this.api.approve(d.extractionId, d.revision, accept).subscribe({
      next: r => {
        this.busy.set('');
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message || 'Approved.');
        this.next();
      },
      error: err => { this.busy.set(''); this.refused(err, 'The document was not approved.'); },
    });
  }

  async reject(): Promise<void> {
    const d = this.detail();
    if (!d || !this.editable() || this.busy()) return;
    const data: RejectDialogData = { name: this.title() };
    const reason = await firstValueFrom(this.dialog.open<string | null>(RejectDialog, { data }).closed);
    if (!reason) return;
    this.busy.set('reject');
    this.api.reject(d.extractionId, reason).subscribe({
      next: r => {
        this.busy.set('');
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message || 'Rejected.');
        this.next();
      },
      error: err => { this.busy.set(''); this.refused(err, 'The document was not rejected.'); },
    });
  }

  claim(): void { this.claiming(this.claimedByMe() ? 'unclaim' : 'claim'); }

  private claiming(how: 'claim' | 'unclaim'): void {
    const d = this.detail();
    if (!d || this.busy()) return;
    this.busy.set('claim');
    (how === 'claim' ? this.api.claim(d.extractionId) : this.api.unclaim(d.extractionId)).subscribe({
      next: (r: ApiResponse<ReviewDetail>) => {
        this.busy.set('');
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; }
        this.show(r.data);
        this.toast.success(r.message);
      },
      error: err => { this.busy.set(''); this.refused(err, how === 'claim' ? 'The document was not claimed.' : 'The claim was not let go.'); },
    });
  }

  /** The next document in the queue that nobody else holds, or the queue when there is none. */
  private next(): void {
    const current = this.extractionId();
    this.api.queue({ status: 'Review', page: 0, size: 50 }).subscribe({
      next: r => {
        const free = (r.data?.items ?? []).filter(i => !(i.claimActive && i.claimedBy != null && i.claimedBy !== this.me()));
        const next = r.status === API_SUCCESS ? nextInQueue(free, current) : null;
        if (next) this.router.navigate(['/documents/review', next]);
        else { this.toast.info('Nothing else is waiting for review.'); this.router.navigate(['/documents/review']); }
      },
      error: () => this.router.navigate(['/documents/review']),
    });
  }

  /** A document that changed meanwhile is read again, and the reviewer told; anything else is said as it is. */
  private refused(err: unknown, fallback: string): void {
    if (statusOf(err) === 409) {
      this.toast.error(`${refusalText(err, fallback)} It has been read again; check it and decide once more.`);
      this.edits.set({});
      this.newRow.set(null);
      this.load();
      return;
    }
    this.toast.error(refusalText(err, fallback));
  }

  // -------------------------------------------------------------------------------------------- keys

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (this.dialog.openDialogs.length || !this.detail()) return;
    switch (shortcutOf(event)) {
      case 'approve': event.preventDefault(); void this.approve(); break;
      case 'reject': event.preventDefault(); void this.reject(); break;
      case 'next': event.preventDefault(); this.step(1); break;
      case 'previous': event.preventDefault(); this.step(-1); break;
    }
  }

  /** Who did it, by name: "you", their name, or (someone Identity no longer knows) their number. */
  reviewer(id: number | null | undefined, name?: string | null): string {
    if (id == null) return 'someone';
    return id === this.me() ? 'you' : name || `user ${id}`;
  }
}
