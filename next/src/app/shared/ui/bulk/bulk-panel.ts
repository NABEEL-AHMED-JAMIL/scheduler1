import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../icon';
import { SidePanel } from '../side-panel';
import {
  BulkAction, BulkAnswer, BulkItem, BulkSource, COMMENT_MAX, CONFIRM_ABOVE, ItemGroup, byGroup, byReason, countOf, itemLabel, newBulkId,
  refusal,
} from './bulk.model';

export interface BulkPanelData<T> {
  action: BulkAction;
  rows: T[];
  source: BulkSource<T>;
}

type Stage = 'checking' | 'check-failed' | 'ready' | 'sending' | 'send-failed' | 'result';

/** The dry run's comment when a rejection's own is not typed yet: nothing is written by a dry run, the comment included. */
export const DRY_RUN_COMMENT = 'Checking which items can be rejected.';

/**
 * The confirm panel of a bulk decision, over the right of the list. On open it asks the service what would happen (a dry
 * run, with a fresh bulk id): how many would be decided, by pipeline, workflow or document type, and which would be
 * skipped and why. Then a comment -- required to reject -- that is applied to each item, and above 25 items the count
 * typed back; the button says what it does ("Approve 12"). The decision goes with the SAME bulk id as the dry run, and a
 * retry after a lost answer reuses it, so the service records each item once. Then the answer, item by item, each with a
 * link to it; Done closes and the list reloads.
 */
@Component({
  selector: 'app-bulk-panel',
  imports: [SidePanel, Icon, RouterLink, NgTemplateOutlet],
  styles: `
    .bulk-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .bulk-list > li { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0;
      border-bottom: 1px solid var(--border-subtle); font-size: 0.875rem; }
    .bulk-list > li:last-child { border-bottom: 0; }
    .bulk-count { flex: none; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
    .bulk-items { list-style: none; margin: 0.25rem 0 0; padding: 0 0 0 1.25rem; display: flex; flex-direction: column; gap: 0.2rem;
      font-size: 0.8125rem; }
    .bulk-flat { padding-left: 0; }
    .bulk-items .bulk-why { color: var(--text-muted); font-size: 0.75rem; }
    .bulk-reason > summary { cursor: pointer; display: flex; align-items: baseline; gap: 0.5rem; padding: 0.4rem 0; font-size: 0.875rem; }
    .bulk-reason > summary .bulk-count { margin-left: auto; }
    .bulk-section + .bulk-section { margin-top: 1.25rem; }
    .bulk-heading { font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.4rem; }
  `,
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="subtitle()" data-bulk-panel [attr.data-bulk-action]="data.action">
      @switch (stage()) {
        @case ('checking') {
          <p class="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]" role="status" data-bulk-checking>
            <span class="spinner"></span>Checking which of the {{ countOf(data.rows.length) }} can be {{ past() }}…
          </p>
        }
        @case ('check-failed') {
          <div class="flex flex-col items-start gap-2" role="alert" data-bulk-check-failed>
            <p class="text-sm text-crit-500 flex items-start gap-1.5"><app-icon name="alert" size="0.95em" class="mt-0.5 shrink-0" />{{ error() }}</p>
            <button type="button" class="btn btn-default btn-sm" (click)="check()" data-bulk-recheck><app-icon name="refresh" />Try again</button>
          </div>
        }
        @case ('result') {
          @if (result(); as r) {
            <div data-bulk-result>
              <p class="text-sm font-medium mb-3" role="status" data-bulk-result-line>{{ resultLine() }}</p>
              @if (r.done.length) {
                <section class="bulk-section" data-bulk-result-done>
                  <h3 class="bulk-heading"><app-icon name="checkCircle" size="0.95em" class="icon-ok" />{{ data.action === 'approve' ? 'Approved' : 'Rejected' }} ({{ r.done.length }})</h3>
                  <ul class="bulk-items bulk-flat">
                    @for (item of r.done; track item.id) { <li><ng-container *ngTemplateOutlet="named; context: { $implicit: item }" /></li> }
                  </ul>
                </section>
              }
              @if (r.skipped.length) {
                <section class="bulk-section" data-bulk-result-skipped>
                  <h3 class="bulk-heading"><app-icon name="skip" size="0.95em" />Skipped ({{ r.skipped.length }})</h3>
                  <ul class="bulk-items bulk-flat">
                    @for (item of r.skipped; track item.id) {
                      <li [attr.data-bulk-reason]="item.reason"><ng-container *ngTemplateOutlet="named; context: { $implicit: item }" />
                        <span class="bulk-why block">{{ item.message || reasonOf(item) }}</span></li>
                    }
                  </ul>
                </section>
              }
              @if (r.failed.length) {
                <section class="bulk-section" data-bulk-result-failed>
                  <h3 class="bulk-heading text-crit-500"><app-icon name="xCircle" size="0.95em" />Failed ({{ r.failed.length }})</h3>
                  <ul class="bulk-items bulk-flat">
                    @for (item of r.failed; track item.id) {
                      <li><ng-container *ngTemplateOutlet="named; context: { $implicit: item }" /><span class="bulk-why block">{{ item.message || 'Could not be recorded.' }}</span></li>
                    }
                  </ul>
                </section>
              }
            </div>
          }
        }
        @default {
          @if (plan(); as p) {
            <section class="bulk-section" data-bulk-plan>
              <p class="text-sm font-medium" data-bulk-plan-line>{{ planLine() }}</p>
              @if (p.done.length) {
                <h3 class="bulk-heading mt-3">By {{ data.source.groupNoun }}</h3>
                <ul class="bulk-list" data-bulk-groups>
                  @for (g of groups(); track g.key) {
                    <li [attr.data-bulk-group]="g.label"><span class="min-w-0 truncate" [title]="g.label">{{ g.label }}</span><span class="bulk-count">{{ g.items.length }}</span></li>
                  }
                </ul>
              }
            </section>
            @if (p.skipped.length) {
              <section class="bulk-section" data-bulk-skipped>
                <h3 class="bulk-heading"><app-icon name="skip" size="0.95em" />Will be skipped ({{ p.skipped.length }})</h3>
                @for (g of reasons(); track g.key) {
                  <details class="bulk-reason" [attr.data-bulk-reason]="g.key">
                    <summary><span>{{ g.label }}</span><span class="bulk-count">{{ g.items.length }}</span></summary>
                    <ul class="bulk-items">
                      @for (item of g.items; track item.id) {
                        <li>{{ label(item) }}@if (item.message && item.message !== g.label) { <span class="bulk-why"> — {{ item.message }}</span> }</li>
                      }
                    </ul>
                  </details>
                }
              </section>
            }
            @if (p.failed.length) {
              <section class="bulk-section" data-bulk-unchecked>
                <h3 class="bulk-heading text-crit-500"><app-icon name="alert" size="0.95em" />Could not be checked ({{ p.failed.length }})</h3>
                <ul class="bulk-items bulk-flat">
                  @for (item of p.failed; track item.id) { <li>{{ label(item) }} <span class="bulk-why">— {{ item.message || 'Could not be checked.' }}</span></li> }
                </ul>
              </section>
            }
            @if (p.done.length) {
              <div class="form-lock bulk-section">
                <label class="label" for="bulk-comment">Comment @if (data.action === 'reject') { <span class="text-crit-500">(required)</span> } @else { <span class="text-[color:var(--text-muted)] font-normal">(optional)</span> }</label>
                <textarea id="bulk-comment" class="input resize-y" rows="3" [attr.maxlength]="max" [value]="comment()"
                          [disabled]="stage() === 'sending'" (input)="comment.set($any($event.target).value)"
                          [attr.aria-invalid]="commentProblem() ? 'true' : null" aria-describedby="bulk-comment-note"
                          [placeholder]="data.action === 'reject' ? 'Say why these are rejected' : 'A note kept with each decision'" data-bulk-comment></textarea>
                <p id="bulk-comment-note" class="field-note flex justify-between gap-2 text-[color:var(--text-muted)]">
                  <span>One comment is applied to each item.</span><span class="tabular-nums">{{ comment().trim().length }}/{{ max }}</span>
                </p>
                @if (needsTyped()) {
                  <label class="label mt-3" for="bulk-confirm">Type {{ p.done.length }} to confirm</label>
                  <input id="bulk-confirm" class="input max-w-40" inputmode="numeric" autocomplete="off" [value]="typed()"
                         [disabled]="stage() === 'sending'" (input)="typed.set($any($event.target).value)" data-bulk-confirm />
                  <p class="field-note text-[color:var(--text-muted)]">More than {{ confirmAbove }} items: say how many, so a decision this wide is never one click.</p>
                }
              </div>
            }
            @if (stage() === 'send-failed') {
              <div class="bulk-section flex flex-col items-start gap-2" role="alert" data-bulk-send-failed>
                <p class="text-sm text-crit-500 flex items-start gap-1.5"><app-icon name="alert" size="0.95em" class="mt-0.5 shrink-0" />{{ error() }}</p>
                <p class="text-xs text-[color:var(--text-muted)]">Trying again sends the same decision: an item already recorded is not recorded twice.</p>
              </div>
            }
          }
        }
      }
      <div foot class="flex items-center gap-2 w-full">
        @if (stage() === 'result') {
          <button type="button" class="btn btn-primary btn-sm ml-auto" (click)="close()" data-bulk-done>Done</button>
        } @else {
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="stage() === 'sending'" (click)="ref.close()" data-bulk-cancel>Cancel</button>
          @if (stage() === 'send-failed') {
            <button type="button" class="btn btn-default btn-sm ml-auto" (click)="send()" data-bulk-retry><app-icon name="refresh" />Try again</button>
          }
          <button type="button" class="btn btn-sm" [class.ml-auto]="stage() !== 'send-failed'" [class.btn-primary]="data.action === 'approve'"
                  [class.btn-danger]="data.action === 'reject'" [disabled]="!canSend()" (click)="send()" data-bulk-act>
            <app-icon [name]="data.action === 'approve' ? 'check' : 'close'" [busy]="stage() === 'sending'" />{{ actLabel() }}
          </button>
        }
      </div>
    </app-side-panel>

    <ng-template #named let-item>
      @if (item.link) {
        <a class="link-inline" [routerLink]="item.link" (click)="close()">{{ label(item) }}</a>
      } @else { <span>{{ label(item) }}</span> }
      @if (item.group) { <span class="bulk-why"> · {{ item.group }}</span> }
    </ng-template>
  `,
})
export class BulkPanel<T> implements OnInit {
  readonly ref = inject<DialogRef<BulkAnswer | undefined, BulkPanel<T>>>(DialogRef);
  readonly data = inject<BulkPanelData<T>>(DIALOG_DATA);

  readonly max = COMMENT_MAX;
  readonly confirmAbove = CONFIRM_ABOVE;
  /** One id for the dry run, the decision and any retry of it. */
  readonly bulkId = newBulkId();
  readonly stage = signal<Stage>('checking');
  readonly error = signal('');
  readonly plan = signal<BulkAnswer | null>(null);
  readonly result = signal<BulkAnswer | null>(null);
  readonly comment = signal('');
  readonly typed = signal('');

  readonly verb = computed(() => this.data.action === 'approve' ? 'Approve' : 'Reject');
  readonly past = computed(() => this.data.action === 'approve' ? 'approved' : 'rejected');
  readonly heading = computed(() => `${this.verb()} ${countOf(this.data.rows.length, this.data.source.noun)}`);
  readonly subtitle = computed(() => this.stage() === 'result' ? 'The decision is recorded item by item.' : 'Each item is decided on its own, as if one by one.');
  readonly groups = computed<ItemGroup[]>(() => byGroup(this.plan()?.done ?? [], `No ${this.data.source.groupNoun}`));
  readonly reasons = computed<ItemGroup[]>(() => byReason(this.plan()?.skipped ?? []));
  readonly toDecide = computed(() => this.plan()?.done.length ?? 0);
  readonly needsTyped = computed(() => this.toDecide() > CONFIRM_ABOVE);

  readonly planLine = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const of = countOf(this.data.rows.length, this.data.source.noun);
    if (!p.done.length) return `None of the ${of} can be ${this.past()}.`;
    return `${p.done.length} of the ${of} will be ${this.past()}.`;
  });

  readonly commentProblem = computed(() => {
    const text = this.comment().trim();
    if (text.length > COMMENT_MAX) return `At most ${COMMENT_MAX} characters.`;
    if (this.data.action === 'reject' && !text) return 'Say why: a comment is required to reject.';
    return '';
  });

  readonly canSend = computed(() => {
    const stage = this.stage();
    if (stage !== 'ready' && stage !== 'send-failed') return false;
    if (!this.toDecide() || this.commentProblem()) return false;
    return !this.needsTyped() || this.typed().trim() === String(this.toDecide());
  });

  readonly actLabel = computed(() => {
    if (this.stage() === 'sending') return this.data.action === 'approve' ? 'Approving…' : 'Rejecting…';
    return this.toDecide() ? `${this.verb()} ${this.toDecide()}` : `Nothing to ${this.data.action}`;
  });

  readonly resultLine = computed(() => {
    const r = this.result();
    if (!r) return '';
    const parts = [`${r.done.length} ${this.past()}`];
    if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
    if (r.failed.length) parts.push(`${r.failed.length} failed`);
    return parts.join(', ') + '.';
  });

  ngOnInit(): void {
    this.check();
  }

  /** The dry run: the same checks, nothing written. */
  check(): void {
    this.stage.set('checking');
    this.error.set('');
    const typed = this.comment().trim();
    const comment = typed || (this.data.action === 'reject' ? DRY_RUN_COMMENT : null);
    this.data.source.send(this.data.rows, { action: this.data.action, comment, bulkId: this.bulkId, dryRun: true }).subscribe({
      next: r => {
        if (r?.status === API_SUCCESS && r.data) { this.plan.set(normalised(r.data)); this.stage.set('ready'); }
        else { this.error.set(r?.message || 'What would happen could not be checked.'); this.stage.set('check-failed'); }
      },
      error: err => { this.error.set(refusal(err, 'What would happen could not be checked.')); this.stage.set('check-failed'); },
    });
  }

  /** The decision, with the dry run's bulk id; a retry sends it again with the same one. */
  send(): void {
    if (!this.canSend()) return;
    this.stage.set('sending');
    this.error.set('');
    const comment = this.comment().trim() || null;
    this.data.source.send(this.data.rows, { action: this.data.action, comment, bulkId: this.bulkId, dryRun: false }).subscribe({
      next: r => {
        if (r?.status === API_SUCCESS && r.data) { this.result.set(normalised(r.data)); this.stage.set('result'); }
        else { this.error.set(r?.message || 'The decision could not be sent.'); this.stage.set('send-failed'); }
      },
      error: err => { this.error.set(refusal(err, 'The decision could not be sent.')); this.stage.set('send-failed'); },
    });
  }

  /** Closes with the answer, when there is one: the list reloads and the decided rows leave it. */
  close(): void {
    this.ref.close(this.result() ?? undefined);
  }

  label(item: BulkItem): string { return itemLabel(item); }
  reasonOf(item: BulkItem): string { return byReason([item])[0]?.label ?? 'Skipped'; }
  countOf(n: number): string { return countOf(n, this.data.source.noun); }
}

/** An answer with its three lists always there. */
function normalised(answer: BulkAnswer): BulkAnswer {
  return { ...answer, done: answer.done ?? [], skipped: answer.skipped ?? [], failed: answer.failed ?? [] };
}
