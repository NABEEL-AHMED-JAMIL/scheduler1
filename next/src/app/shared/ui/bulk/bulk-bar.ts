import { Component, computed, inject, input, output } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Icon } from '../icon';
import { sidePanelConfig } from '../side-panel';
import { BULK_CAP, BulkAction, BulkAnswer, BulkSelection, countOf } from './bulk.model';
import { BulkPanel, BulkPanelData } from './bulk-panel';

/**
 * The bar of a list with rows picked: "12 selected · Reject · Approve · Clear", kept at the foot of the list's view while
 * the list scrolls. With the whole page picked and more matching the list's filter it offers Select all matching (the
 * first {@link BULK_CAP}). Reject and Approve open the confirm panel (BulkPanel); a decision made there clears the
 * selection and is handed to the list (`decided`), which reloads.
 */
@Component({
  selector: 'app-bulk-bar',
  imports: [Icon],
  styles: `
    :host { display: contents; }
    .bulk-bar { position: sticky; bottom: 0.75rem; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem;
      padding: 0.5rem 0.75rem; border: 1px solid var(--border-strong); border-radius: var(--radius-lg);
      background: var(--surface-raised); box-shadow: 0 8px 24px -12px var(--shadow-color); font-size: 0.875rem; }
    .bulk-bar.is-flush { position: static; border-width: 1px 0 0; border-radius: 0; box-shadow: none; }
    .bulk-bar-count { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bulk-bar-note { font-size: 0.75rem; color: var(--text-secondary); min-width: 0; }
    .bulk-bar-actions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
  `,
  template: `
    <p class="sr-only" aria-live="polite" data-bulk-live>{{ liveText() }}</p>
    @if (selection().count()) {
      <div class="bulk-bar" [class.is-flush]="flush()" role="region" aria-label="Decide the selected items together" data-bulk-bar>
        <span class="bulk-bar-count" data-bulk-count>{{ selection().count() }} selected</span>
        @if (selection().matching()) {
          <span class="bulk-bar-note flex items-center gap-1.5" role="status"><span class="spinner"></span>Selecting what matches…</span>
        } @else if (selection().matched(); as m) {
          <span class="bulk-bar-note" data-bulk-matched>
            {{ matchedText(m) }}
          </span>
        } @else if (offerMatching()) {
          <span class="bulk-bar-note">
            All {{ pageCount() }} on this page are selected.
            <button type="button" class="link-inline" (click)="selection().selectMatching()" data-bulk-matching>{{ matchingLabel() }}</button>
          </span>
        } @else if (selection().full()) {
          <span class="bulk-bar-note">At most {{ selection().cap }} at a time.</span>
        }
        @if (selection().matchError()) { <span class="bulk-bar-note text-crit-500" role="alert">{{ selection().matchError() }}</span> }
        <div class="bulk-bar-actions">
          @if (kind() === 'retry') {
            <button type="button" class="btn btn-primary btn-sm" [disabled]="selection().matching()" (click)="open('retry')" data-bulk-retry-runs>
              <app-icon name="refresh" />Retry from failed step
            </button>
          } @else {
          @if (canReject()) {
            <button type="button" class="btn btn-default btn-sm btn-intent-crit" [disabled]="selection().matching()" (click)="open('reject')" data-bulk-reject>
              <app-icon name="close" />Reject
            </button>
          }
          <button type="button" class="btn btn-primary btn-sm" [disabled]="selection().matching()" (click)="open('approve')" data-bulk-approve>
            <app-icon name="check" />Approve
          </button>
          }
          <button type="button" class="btn btn-ghost btn-sm" (click)="selection().clear()" data-bulk-clear>Clear</button>
        </div>
      </div>
    }
  `,
})
export class BulkBar {
  private readonly dialog = inject(Dialog);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly selection = input.required<BulkSelection<any>>();
  /** The rows of the page that can be picked: all picked, and more matching, offers Select all matching. */
  readonly pageRows = input<unknown[]>([]);
  /** More rows match the list's filter than this page holds. */
  readonly moreMatch = input(false);
  /** How many match (null when the list cannot say). */
  readonly matchTotal = input<number | null>(null);
  readonly canReject = input(true);
  /** MIG-355: what the picked rows are for -- a review decision (Reject, Approve) or a retry of failed runs. */
  readonly kind = input<'review' | 'retry'>('review');
  /** Inside a list's own frame (the inbox's list): drawn as its foot rather than floating over it. */
  readonly flush = input(false);
  readonly decided = output<BulkAnswer>();

  readonly cap = BULK_CAP;
  readonly pageCount = computed(() => this.pageRows().length);

  readonly offerMatching = computed(() => {
    const s = this.selection();
    return !!s.source.matching && this.moreMatch() && this.pageCount() > 0 && s.pageState(this.pageRows()) === 'all';
  });

  readonly matchingLabel = computed(() => {
    const total = this.matchTotal();
    const cap = this.selection().cap;
    if (total == null) return `Select all matching (up to ${cap})`;
    if (total > cap) return `Select the first ${cap} of ${total.toLocaleString('en-US')} matching`;
    return `Select all ${total.toLocaleString('en-US')} matching`;
  });

  readonly liveText = computed(() => {
    const n = this.selection().count();
    return n ? `${countOf(n, this.selection().source.noun)} selected.` : '';
  });

  /** What Select all matching took: all of them, or the first of more. */
  matchedText(m: { total: number | null; taken: number }): string {
    if (m.total == null) return `The first ${m.taken} matching are selected; more match.`;
    if (m.total > m.taken) return `The first ${m.taken} of ${m.total.toLocaleString('en-US')} matching are selected.`;
    return `All ${m.taken} matching are selected.`;
  }

  open(action: BulkAction): void {
    const s = this.selection();
    const rows = s.rows();
    if (!rows.length) return;
    const data: BulkPanelData<unknown> = { action, rows, source: s.source };
    const ref = this.dialog.open<BulkAnswer | undefined, BulkPanelData<unknown>, BulkPanel<unknown>>(BulkPanel, sidePanelConfig(data, 'narrow', 'right'));
    ref.closed.subscribe(answer => {
      // Closed with the panel's own X after deciding: the answer is still the panel's.
      const decided = answer ?? ref.componentInstance?.result() ?? null;
      if (!decided || decided.dryRun) return;
      s.clear();
      this.decided.emit(decided);
    });
  }
}
