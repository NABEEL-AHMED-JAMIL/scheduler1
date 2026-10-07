import { Component, OnInit, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Pagination } from '../../shared/ui/pagination';
import { PAGE_SIZES } from '../../shared/ui/pager';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import {
  AGE_FILTERS, CLAIM_FILTERS, CONFIDENCE_FILTERS, DocumentType, Extraction, OcrDocument, QUEUE_STATUSES, fileName, lowLine,
  refusalText, statusLabel,
} from './documents.model';
import { DocumentsApi } from './documents.service';
import { ConfidenceBar } from './confidence-bar';

/**
 * The review queue (MIG-272, Documents > Review queue, page key document-review): the documents Document Intelligence
 * did not approve on its own, oldest first, with how many values need a look, the least sure one, how long each has
 * waited and who has claimed it. Filters by type, state, claim, confidence and age go to the service; a row opens the
 * document's review screen, and Start reviewing opens the first one nobody else holds.
 */
@Component({
  selector: 'app-review-queue',
  imports: [RouterLink, Icon, TableShell, StatusPill, Pagination, ServerTimePipe, ConfidenceBar],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Review queue</h1>
          <p class="page-subtitle">
            Documents that Document Intelligence did not approve on its own, oldest first. Open one to check the values it was
            not sure about, correct them, and approve or reject it.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-default btn-sm" (click)="load()" [disabled]="loading()">
            <app-icon name="refresh" [class.spin]="loading()" />Refresh
          </button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="!firstFree()" (click)="start()"><app-icon name="play" />Start reviewing</button>
        </div>
      </div>

      <app-table-shell data-test="queue" heading="Documents" columnsKey="document-review-queue" [loading]="loading()" [error]="error()"
                       [isEmpty]="!items().length" [shown]="items().length" [total]="total()"
                       [emptyMessage]="hasFilters() ? 'No document matches the current filters.' : status() === 'Review' ? 'Nothing is waiting for review.' : 'No documents here yet.'"
                       emptyIcon="checkCircle" (retry)="load()">
        <ng-container toolbar>
          <select class="input max-w-36" aria-label="State" [value]="status()" (change)="set(status, $any($event.target).value)">
            @for (s of statuses; track s) { <option [value]="s" [selected]="s === status()">{{ s === 'Review' ? 'In review' : s }}</option> }
          </select>
          <select class="input max-w-44" aria-label="Document type" [value]="typeId()" (change)="set(typeId, $any($event.target).value)">
            <option value="">All types</option>
            @for (t of types(); track t.documentTypeId) { <option [value]="t.documentTypeId" [selected]="t.documentTypeId + '' === typeId()">{{ t.name }}</option> }
          </select>
          <select class="input max-w-44" aria-label="Claimed" [value]="claimed()" (change)="set(claimed, $any($event.target).value)">
            @for (c of claims; track c.value) { <option [value]="c.value" [selected]="c.value === claimed()">{{ c.label }}</option> }
          </select>
          <select class="input max-w-48" aria-label="Confidence" [value]="confidence()" (change)="set(confidence, $any($event.target).value)">
            @for (c of confidences; track c.value) { <option [value]="c.value" [selected]="c.value === confidence()">{{ c.label }}</option> }
          </select>
          <select class="input max-w-48" aria-label="Waiting" [value]="age()" (change)="set(age, $any($event.target).value)">
            @for (a of ages; track a.value) { <option [value]="a.value" [selected]="a.value === age()">{{ a.label }}</option> }
          </select>
          @if (hasFilters()) { <button type="button" class="btn btn-ghost btn-sm" (click)="clear()"><app-icon name="close" />Clear</button> }
        </ng-container>

        <table class="table-modern">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th class="text-right">To check</th>
              <th>Least sure</th>
              <th>Waiting since</th>
              <th>Claimed</th>
              <th class="text-right">State</th>
            </tr>
          </thead>
          <tbody>
            @for (e of items(); track e.extractionId) {
              <tr>
                <td class="max-w-72">
                  <a class="link-inline font-medium [overflow-wrap:anywhere]" [routerLink]="['/documents/review', e.extractionId]">{{ nameOf(e) }}</a>
                  <span class="block text-xs text-[color:var(--text-muted)]">Extraction {{ e.extractionId }} · OCR {{ e.ocrDocumentId }}</span>
                </td>
                <td class="text-xs whitespace-nowrap">{{ e.documentTypeName || e.documentTypeKey || 'Not classified' }}@if (e.documentTypeVersion) {&ngsp;<span class="text-[color:var(--text-muted)]">v{{ e.documentTypeVersion }}</span>}</td>
                <td class="text-right text-xs whitespace-nowrap">{{ e.reviewCount ?? 0 }} of {{ e.fieldCount ?? 0 }}</td>
                <td><app-confidence-bar [value]="e.minConfidence" [low]="(e.minConfidence ?? 0) < line(e)" /></td>
                <td class="text-xs whitespace-nowrap">@if (e.dateFinished || e.dateCreated) { {{ (e.dateFinished || e.dateCreated) | serverTime: 'recent' }} } @else { — }</td>
                <td class="text-xs whitespace-nowrap">
                  @if (e.claimActive && e.claimedBy != null) {
                    <span class="pill" [class.pill-brand]="e.claimedBy === me()" [class.pill-warn]="e.claimedBy !== me()">
                      <app-icon name="lock" size="0.8em" />{{ e.claimedBy === me() ? 'You' : e.claimedByName || 'User ' + e.claimedBy }}
                    </span>
                  } @else { <span class="text-[color:var(--text-muted)]">—</span> }
                </td>
                <td class="text-right"><app-status [label]="label(e)" /></td>
              </tr>
            }
          </tbody>
        </table>
        <app-pagination pager [total]="total()" [page]="page()" [size]="size()" (goTo)="goTo($event)" (setSize)="setSize($event)" />
      </app-table-shell>
    </div>
  `,
})
export class ReviewQueue implements OnInit {
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly statuses = QUEUE_STATUSES;
  readonly claims = CLAIM_FILTERS;
  readonly confidences = CONFIDENCE_FILTERS;
  readonly ages = AGE_FILTERS;

  readonly status = signal<string>('Review');
  readonly typeId = signal('');
  readonly claimed = signal('');
  readonly confidence = signal('');
  readonly age = signal('');
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);

  readonly items = signal<Extraction[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly types = signal<DocumentType[]>([]);
  private readonly reads = signal<Map<number, OcrDocument>>(new Map());

  readonly me = computed(() => this.auth.user()?.appUserId ?? null);
  readonly hasFilters = computed(() => this.status() !== 'Review' || !!this.typeId() || !!this.claimed() || !!this.confidence() || !!this.age());
  /** The first document in Review nobody else holds. */
  readonly firstFree = computed(() => this.status() !== 'Review' ? null
    : this.items().find(e => !(e.claimActive && e.claimedBy != null && e.claimedBy !== this.me())) ?? null);

  ngOnInit(): void {
    this.load();
    this.api.types().subscribe({ next: r => { if (r.status === API_SUCCESS) this.types.set(r.data ?? []); }, error: () => { /* the filter lists no types */ } });
    this.api.reads().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.reads.set(new Map((r.data ?? []).map(d => [d.ocrDocumentId, d]))); },
      error: () => { /* rows are named by their OCR number */ },
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.queue({
      status: this.status(), documentTypeId: this.typeId() ? Number(this.typeId()) : null,
      claimed: this.claimed(), maxConfidence: this.confidence() ? Number(this.confidence()) : null,
      olderThanMinutes: this.age() ? Number(this.age()) : null, page: this.page() - 1, size: this.size(),
    }).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'Could not load the queue.'); return; }
        this.items.set(r.data.items ?? []);
        this.total.set(r.data.total ?? 0);
      },
      error: err => { this.loading.set(false); this.error.set(refusalText(err, 'Could not load the queue.')); },
    });
  }

  set(filter: WritableSignal<string>, value: string): void {
    filter.set(value);
    this.page.set(1);
    this.load();
  }

  clear(): void {
    this.status.set('Review');
    this.typeId.set('');
    this.claimed.set('');
    this.confidence.set('');
    this.age.set('');
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void { this.page.set(page); this.load(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.load(); }

  start(): void {
    const first = this.firstFree();
    if (first) this.router.navigate(['/documents/review', first.extractionId]);
    else this.toast.info('Nothing is waiting that someone else has not claimed.');
  }

  nameOf(e: Extraction): string {
    const read = this.reads().get(e.ocrDocumentId);
    return read ? fileName(read.sourceKey) : `OCR document ${e.ocrDocumentId}`;
  }

  label(e: Extraction): string { return statusLabel(e); }
  line(e: Extraction): number { return lowLine(e.autoApproveThreshold); }
}
