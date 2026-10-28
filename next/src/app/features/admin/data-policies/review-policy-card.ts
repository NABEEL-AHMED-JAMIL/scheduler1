import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { instantOf } from '../../../core/instant';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { BulkReviewApi, DocumentReviewPolicy, RunReviewPolicy } from '../../../shared/ui/bulk/bulk-review.api';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';

interface Draft { runs: boolean; documents: boolean; ruleFailures: boolean; }

/**
 * Administration › Data policies: the workspace's bulk review policy (2026-10-12). Whether runs may be approved in bulk
 * (Core), whether documents may (ai-service), and whether a bulk approve takes documents whose rules fail. Rejecting in
 * bulk stays allowed either way; a pipeline can also require individual review on its own (Settings). A workspace
 * administrator changes it; every other member reads it, with the page's lock note. Shown only to a session with a
 * workspace -- a platform administrator's own sign-in has none.
 */
@Component({
  selector: 'app-review-policy-card',
  imports: [Icon, ServerTimePipe, AppLoading, InlineStatus],
  template: `
    @if (hasWorkspace()) {
      <section class="card p-4 flex flex-col gap-3" aria-labelledby="review-policy-title" data-review-policy>
        <div class="flex items-start gap-2">
          <app-icon name="checkCircle" class="shrink-0 mt-0.5" />
          <div class="min-w-0">
            <h2 id="review-policy-title" class="font-semibold text-sm">Bulk review</h2>
            <p class="text-sm text-[color:var(--text-secondary)]">
              Whether reviewers may approve many runs or documents in one decision. Each item is still decided and recorded on its own;
              rejecting in bulk is always allowed. A pipeline can require individual review in its Settings.
            </p>
          </div>
        </div>
        <!-- Owner 2026-10-27: Try again is a coloured button (app-inline-status), the loading line a status for readers. -->
        @if (error()) {
          <app-inline-status data-review-policy-error [error]="error()" (retry)="load()" />
        } @else if (draft(); as d) {
          <ul class="flex flex-col gap-2.5">
            <li>
              @if (canEdit()) {
                <label class="inline-flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" class="checkbox shrink-0" role="switch" [checked]="d.runs" (change)="set('runs', $any($event.target).checked)" data-policy-runs />
                  Allow bulk approve of runs
                </label>
              } @else {
                <p class="text-sm"><span class="font-medium">Bulk approve of runs:</span> {{ d.runs ? 'On' : 'Off' }}</p>
              }
              <p class="field-note text-[color:var(--text-muted)]">Off: runs are approved one by one on their page or in Review.</p>
            </li>
            <li>
              @if (canEdit()) {
                <label class="inline-flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" class="checkbox shrink-0" role="switch" [checked]="d.documents" (change)="set('documents', $any($event.target).checked)" data-policy-documents />
                  Allow bulk approve of documents
                </label>
              } @else {
                <p class="text-sm"><span class="font-medium">Bulk approve of documents:</span> {{ d.documents ? 'On' : 'Off' }}</p>
              }
            </li>
            <li class="pl-6">
              @if (canEdit()) {
                <label class="inline-flex items-center gap-2 text-sm" [class.opacity-60]="!d.documents">
                  <input type="checkbox" class="checkbox shrink-0" [checked]="d.ruleFailures" [disabled]="!d.documents"
                         (change)="set('ruleFailures', $any($event.target).checked)" data-policy-rule-failures />
                  Include documents whose rules fail
                </label>
              } @else {
                <p class="text-sm">Documents whose rules fail: {{ d.ruleFailures ? 'included' : 'left out' }}</p>
              }
              <p class="field-note text-[color:var(--text-muted)]">Off (the default): a document with a failing rule is skipped and approved on its own screen. On: the failures are accepted, and the override is recorded on each.</p>
            </li>
          </ul>
          <p class="text-xs text-[color:var(--text-muted)]" data-review-policy-state>
            @if (savedAt()) { Last changed {{ savedAt() | serverTime:'recent' }}. } @else { Not saved yet: these are the defaults. }
          </p>
          @if (canEdit()) {
            <div class="flex items-center justify-end gap-2">
              <button type="button" class="btn btn-default btn-intent-crit btn-sm" [disabled]="!changed() || saving()" (click)="discard()">Discard</button>
              <button type="button" class="btn btn-primary btn-sm" [disabled]="!changed() || saving()" (click)="save()" data-review-policy-save>
                <app-icon name="save" [busy]="saving()" />{{ saving() ? 'Saving…' : 'Save review policy' }}
              </button>
            </div>
          } @else {
            <p class="text-sm text-[color:var(--text-muted)]" data-read-only>
              <app-icon name="lock" size="0.9em" class="align-[-0.1em]" /> Only a workspace administrator can change the review policy.
            </p>
          }
        } @else {
          <app-loading shape="panel" [count]="3" label="Loading the review policy…" />
        }
      </section>
    }
  `,
})
export class ReviewPolicyCard implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  /** Looked up when used: a page shown without a workspace never reads it (nor needs an HTTP client in a screen test). */
  private get api(): BulkReviewApi { return this.injector.get(BulkReviewApi); }
  private readonly toast = inject(ToastService);

  readonly hasWorkspace = computed(() => typeof this.auth.user === 'function' && !!this.auth.user()?.tenantId);
  readonly canEdit = computed(() => typeof this.auth.isTenantAdmin === 'function' && this.auth.isTenantAdmin());
  readonly runs = signal<RunReviewPolicy | null>(null);
  readonly documents = signal<DocumentReviewPolicy | null>(null);
  readonly draft = signal<Draft | null>(null);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly saved = computed<Draft | null>(() => {
    const r = this.runs();
    const d = this.documents();
    return r && d ? { runs: r.bulkApproveRuns !== false, documents: d.bulkApprove !== false, ruleFailures: !!d.bulkApproveRuleFailures } : null;
  });
  readonly runsChanged = computed(() => !!this.draft() && !!this.saved() && this.draft()!.runs !== this.saved()!.runs);
  readonly documentsChanged = computed(() => {
    const a = this.draft();
    const b = this.saved();
    return !!a && !!b && (a.documents !== b.documents || a.ruleFailures !== b.ruleFailures);
  });
  readonly changed = computed(() => this.runsChanged() || this.documentsChanged());
  /** The later of the two saves. */
  readonly savedAt = computed(() => {
    const times = [this.runs()?.updatedAt, this.documents()?.updatedAt].filter((t): t is string => !!t && !!instantOf(t));
    return times.sort((a, b) => instantOf(a)!.getTime() - instantOf(b)!.getTime()).at(-1) ?? null;
  });

  ngOnInit(): void {
    if (this.hasWorkspace()) this.load();
  }

  load(): void {
    this.error.set('');
    this.draft.set(null);
    forkJoin([this.api.runPolicy(), this.api.documentPolicy()]).subscribe({
      next: ([r, d]) => {
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'The review policy for runs could not be read.'); return; }
        if (d?.status !== API_SUCCESS || !d.data) { this.error.set(d?.message || 'The review policy for documents could not be read.'); return; }
        this.runs.set(r.data);
        this.documents.set(d.data);
        this.draft.set(this.saved());
      },
      error: err => this.error.set(refusal(err, 'The review policy could not be read.')),
    });
  }

  set(key: keyof Draft, on: boolean): void {
    this.draft.update(d => d ? { ...d, [key]: on } : d);
  }

  discard(): void { this.draft.set(this.saved()); }

  /**
   * Saves what changed: Core's part, ai-service's part, or both. Each service refuses with a 4xx and its sentence (Core's
   * since 2026-10-12, as ai-service's), so each call's refusal is caught on its own: the other part's save is kept, and the
   * refusal's message is shown.
   */
  save(): void {
    const d = this.draft();
    if (!d || !this.canEdit() || !this.changed() || this.saving()) return;
    const calls: Observable<ApiResponse<RunReviewPolicy | DocumentReviewPolicy>>[] = [];
    if (this.runsChanged()) calls.push(this.api.saveRunPolicy({ bulkApproveRuns: d.runs }));
    if (this.documentsChanged()) calls.push(this.api.saveDocumentPolicy({ bulkApprove: d.documents, bulkApproveRuleFailures: d.ruleFailures }));
    this.saving.set(true);
    forkJoin(calls.map(call => call.pipe(catchError(err =>
      of<ApiResponse<RunReviewPolicy | DocumentReviewPolicy>>({ status: 'ERROR', message: refusal(err, 'The review policy could not be saved.') }))))).subscribe({
      next: answers => {
        this.saving.set(false);
        const refused = answers.find(a => a?.status !== API_SUCCESS);
        for (const a of answers) {
          if (a?.status !== API_SUCCESS || !a.data) continue;
          if ('bulkApproveRuns' in a.data) this.runs.set(a.data as RunReviewPolicy);
          else this.documents.set(a.data as DocumentReviewPolicy);
        }
        if (refused) { this.toast.error(refused.message || 'The review policy could not be saved.'); return; }
        this.draft.set(this.saved());
        this.toast.success('Review policy saved.');
      },
      error: err => { this.saving.set(false); this.toast.error(refusal(err, 'The review policy could not be saved.')); },
    });
  }
}
