import { Component, DestroyRef, Injector, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { BulkBar } from '../../shared/ui/bulk/bulk-bar';
import { BulkPanel, BulkPanelData } from '../../shared/ui/bulk/bulk-panel';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { BULK_CAP, BulkAction, BulkAnswer, BulkSelection } from '../../shared/ui/bulk/bulk.model';
import { TaskCountService } from '../workflows/task-count.service';
import { NeedsWorkspace } from '../../shared/ui/needs-workspace';
import { REVIEW_PAGE, ReviewItem, ReviewKind, ReviewLoad, ReviewViewer, ageOf, dueIn, loadReview } from './review-sources';
import { KIND_ICON, KIND_LABEL, linkOf, sendMixed } from './review-home.model';
import { ReviewItemPanel, ReviewItemPanelData, ReviewItemPanelResult } from './review-item-panel';

type KindFilter = '' | ReviewKind;
type WaitsFilter = '' | 'me' | 'teams' | 'open';

/**
 * Review › All waiting (UX review DR2, owner 2026-10-13, "go for best"): the reviewer's one list. Approvals (and the
 * reader's tasks about runs) from the Task inbox, runs waiting for an administrator's review from Core, documents in
 * review from ai-service -- read in parallel, as the reader, and laid out together: overdue first, then the soonest due,
 * then the longest waiting. Each row says what it is, where it comes from, since when it waits, on whom, and how long.
 *
 * A row opens its detail on the right (ReviewItemPanel), with the way to its own page and, when the reader may decide it,
 * Approve and Reject. Rows are picked for one bulk decision across kinds: the shared bulk bar and panel (a dry run first,
 * then an answer per item), each kind sent to its own service's bulk endpoint (review-home.model.ts, sendMixed). The tabs
 * beside it (Approvals, Runs, Documents) are each kind's own page with its own filters.
 */
@Component({
  selector: 'app-review-home',
  imports: [PageHeader, RefreshButton, EmptyState, Icon, RouterLink, ServerTimePipe, BulkBar, NeedsWorkspace],
  styles: `
    .review-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle); }
    .review-search { width: 16rem; max-width: 100%; }
    .review-kind { display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; font-size: 0.8125rem; color: var(--text-secondary); }
    .review-kind app-icon { color: var(--text-muted); }
    .review-row { cursor: pointer; }
    .review-row:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .review-what { max-width: 0; width: 34%; min-width: 14rem; }
    .review-count { font-variant-numeric: tabular-nums; }
    .seg-btn .review-count { color: var(--text-muted); font-weight: 500; }
    .seg-on .review-count { color: inherit; }
  `,
  template: `
    <div class="page" [attr.data-load-ms]="loadMs()">
      <app-page-header title="Review"
                       subtitle="Everything waiting for your decision — approvals, run results and documents — overdue first, then the longest waiting. Open one to see it, or pick several to decide together.">
        @if (!noWorkspace()) { <app-refresh-button [loading]="loading()" (refresh)="load()" /> }
      </app-page-header>

      @if (noWorkspace()) {
        <!-- A platform administrator's own sign-in has no workspace: the Task inbox's mine, teams and count each answered
             400 "Pick a workspace (tenantId)" and the page showed their errors (2026-10-20). Nothing is read. -->
        <app-needs-workspace what="Review is" todo="decide its approvals, runs and documents" icon="inbox" />
      } @else {

      @for (kind of failedKinds(); track kind) {
        <p class="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-sunken text-warn-500 mb-3" role="alert" [attr.data-failed]="kind">
          <app-icon name="alert" size="0.95em" />{{ failedText(kind) }}
          <button type="button" class="btn btn-default btn-sm ml-auto" (click)="load()"><app-icon name="refresh" />Try again</button></p>
      }

      <section class="card overflow-hidden" data-test="review-list" aria-labelledby="review-list-title">
        <h2 class="sr-only" id="review-list-title">Waiting for review</h2>
        <div class="review-tools">
          <div class="seg" role="group" aria-label="Which kind">
            <button type="button" class="seg-btn" [class.seg-on]="kind() === ''" [attr.aria-pressed]="kind() === ''" (click)="kind.set('')" data-kind="">
              All <span class="review-count">{{ countText(items().length + beyondTotal()) }}</span></button>
            @for (k of kinds(); track k) {
              <button type="button" class="seg-btn" [class.seg-on]="kind() === k" [attr.aria-pressed]="kind() === k" (click)="kind.set(k)" [attr.data-kind]="k">
                <app-icon [name]="icon[k]" size="0.95em" />{{ plural(k) }} <span class="review-count">{{ kindCount(k) }}</span></button>
            }
          </div>
          <input class="input review-search" type="search" placeholder="Search what, from, who" aria-label="Search the waiting items"
                 [value]="query()" (input)="query.set($any($event.target).value)" data-test="review-search" />
          <select class="input w-auto" aria-label="Waits on" [value]="waits()" (change)="waits.set($any($event.target).value)" data-test="review-waits">
            <option value="">Anyone</option>
            <option value="me">You</option>
            @if (viewer().tasks) { <option value="teams">Your teams</option> }
            <option value="open">Not claimed</option>
          </select>
          @if (filtered()) { <button type="button" class="btn btn-ghost btn-sm" (click)="clear()"><app-icon name="close" />Clear</button> }
          <span class="ml-auto text-xs text-[color:var(--text-muted)]" data-test="review-shown">{{ shownLine() }}</span>
        </div>

        @if (loading() && !loaded()) {
          <p class="px-4 py-6 text-sm text-[color:var(--text-secondary)] flex items-center gap-2" role="status"><span class="spinner"></span>Reading what waits for you…</p>
        } @else if (!shown().length) {
          <app-empty-state class="py-10 px-4 block" icon="checkCircle" data-test="review-empty"
                           [title]="filtered() ? 'Nothing matches these filters' : 'Nothing is waiting for your review'"
                           [message]="filtered() ? 'Clear the filters to see everything that waits.' : 'Approvals, run results and documents that need a person arrive here, with one count in the menu and on Home.'">
            @if (filtered()) { <button type="button" class="btn btn-default btn-sm" (click)="clear()">Clear the filters</button> }
          </app-empty-state>
        } @else {
          <div class="overflow-x-auto">
            <table class="table-modern">
              <thead>
                <tr>
                  <th class="w-10">
                    <input type="checkbox" class="checkbox" aria-label="Select everything shown that you may decide" data-bulk-page
                           [checked]="pageState() === 'all'" [indeterminate]="pageState() === 'some'" [disabled]="!pagePicks().length"
                           (change)="bulk.setPage(pagePicks(), $any($event.target).checked)" />
                  </th>
                  <th>Type</th>
                  <th>What</th>
                  <th>From</th>
                  <th class="whitespace-nowrap">Waiting since</th>
                  <th class="whitespace-nowrap">Waits on</th>
                  <th class="whitespace-nowrap text-right">Due / age</th>
                </tr>
              </thead>
              <tbody>
                @for (item of shown(); track item.uid) {
                  <tr class="review-row" [class.row-selected]="bulk.has(item)" tabindex="0" [attr.data-item]="item.kind + ':' + item.id"
                      (click)="open(item)" (keydown.enter)="open(item)">
                    <td (click)="$event.stopPropagation()">
                      <input type="checkbox" class="checkbox" [checked]="bulk.has(item)" [disabled]="!item.pickable" [title]="item.whyNot"
                             [attr.aria-label]="'Select ' + nameOf(item)" [attr.data-bulk-pick]="item.uid" (change)="pick(item, $any($event.target))" />
                    </td>
                    <td><span class="review-kind"><app-icon [name]="icon[item.kind]" size="0.95em" />{{ label[item.kind] }}</span></td>
                    <td class="review-what">
                      <a class="link-inline font-medium block truncate" [routerLink]="linkOf(item).path" [queryParams]="linkOf(item).query ?? null"
                         (click)="$event.stopPropagation()" [title]="nameOf(item)">{{ nameOf(item) }}</a>
                      @if (subOf(item); as sub) { <span class="block truncate text-xs text-[color:var(--text-muted)]" [title]="sub">{{ sub }}</span> }
                    </td>
                    <td class="max-w-56"><span class="block truncate" [title]="item.from">{{ item.from || '—' }}</span></td>
                    <td class="whitespace-nowrap text-[color:var(--text-secondary)]">@if (item.since) { {{ item.since | serverTime:'recent' }} } @else { — }</td>
                    <td class="whitespace-nowrap">{{ item.waitsOn }}</td>
                    <td class="whitespace-nowrap text-right" [class.text-crit-500]="item.overdue">{{ dueOrAge(item) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (beyondNotes().length) {
          <p class="px-4 py-3 m-0 text-xs text-[color:var(--text-secondary)] border-t border-[color:var(--border-subtle)]" data-test="review-beyond">
            @for (note of beyondNotes(); track note.link; let last = $last) {
              {{ note.text }} <a class="link-inline" [routerLink]="note.link">{{ note.linkText }}</a>@if (!last) { <span> · </span> }
            }
          </p>
        }
      </section>
      <app-bulk-bar [selection]="bulk" [pageRows]="pagePicks()" (decided)="decided($event)" />
      }
    </div>
  `,
})
export class ReviewHome implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private reading?: Subscription;

  readonly icon = KIND_ICON;
  readonly label = KIND_LABEL;
  readonly linkOf = linkOf;

  /** A sign-in with no workspace (a platform administrator's own): Review is a workspace's, so nothing is read. */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);

  readonly viewer = computed<ReviewViewer>(() => ({
    tasks: this.auth.canOpen('task-inbox'),
    documents: this.auth.canOpen('document-review'),
    admin: this.auth.isTenantAdmin(),
    me: this.auth.user()?.appUserId ?? null,
    runs: this.auth.canOpen('jobs') || this.auth.canOpen('queue'),
  }));
  /** The kinds the reader may see, in the tabs' order: a kind they may not open is not offered as a filter. */
  readonly kinds = computed<ReviewKind[]>(() => {
    const v = this.viewer();
    return [...(v.tasks ? ['approval' as const] : []), ...(v.tasks || v.admin ? ['run' as const] : []), ...(v.documents ? ['document' as const] : [])];
  });

  readonly answer = signal<ReviewLoad | null>(null);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  /** How long the three sources took to answer, in ms (DR2 asks under a second with 50+ items). */
  readonly loadMs = signal<number | null>(null);
  readonly now = signal(Date.now());
  /** Document file names, from the OCR list (read beside the sources; rows show "Document 1133" until it answers). */
  private readonly names = signal<Map<number, string>>(new Map());

  readonly kind = signal<KindFilter>('');
  readonly query = signal('');
  readonly waits = signal<WaitsFilter>('');

  readonly items = computed(() => this.answer()?.items ?? []);
  readonly filtered = computed(() => !!this.kind() || !!this.query().trim() || !!this.waits());
  readonly shown = computed(() => {
    const kind = this.kind();
    const q = this.query().trim().toLowerCase();
    const waits = this.waits();
    return this.items().filter(i => (!kind || i.kind === kind)
      && (!waits || (waits === 'me' ? i.waitsOn.startsWith('You') : waits === 'teams' ? i.waitsOn === 'Your teams'
        : !i.waitsOn.startsWith('Claimed by')))
      && (!q || [this.nameOf(i), i.title, i.from, i.waitsOn, this.subOf(i)].join(' ').toLowerCase().includes(q)));
  });

  readonly bulk = new BulkSelection<ReviewItem>({
    idOf: i => i.uid,
    noun: ['item', 'items'],
    groupNoun: 'source',
    // Looked up when sent: the screen's tests stand in their own HTTP client.
    send: (rows, request) => sendMixed(this.injector.get(BulkReviewApi), rows, request),
  });
  readonly pagePicks = computed(() => this.shown().filter(i => i.pickable));
  readonly pageState = computed(() => this.bulk.pageState(this.pagePicks()));

  readonly failedKinds = computed(() => this.answer()?.failed ?? []);
  readonly beyondTotal = computed(() => {
    const b = this.answer()?.beyond;
    return b ? b.tasks + b.documents : 0;
  });
  /** What did not fit the first pages, with the tab that lists it all. */
  readonly beyondNotes = computed(() => {
    const b = this.answer()?.beyond;
    if (!b) return [];
    return [
      ...(b.tasks ? [{ text: `${b.tasks} more ${b.tasks === 1 ? 'task waits' : 'tasks wait'} beyond the first ${REVIEW_PAGE} of each list.`, link: '/review/approvals', linkText: 'Open Approvals' }] : []),
      ...(b.runs ? [{ text: 'More runs wait than Core lists at once.', link: '/review/runs', linkText: 'Open Runs' }] : []),
      ...(b.documents ? [{ text: `${b.documents} more ${b.documents === 1 ? 'document waits' : 'documents wait'}.`, link: '/review/documents', linkText: 'Open Documents' }] : []),
    ];
  });

  readonly shownLine = computed(() => {
    const all = this.items().length;
    const shown = this.shown().length;
    if (this.filtered()) return `${shown} of ${all} shown`;
    return `${all} waiting${this.beyondTotal() ? `, ${this.beyondTotal()} more in the tabs` : ''}`;
  });

  constructor() {
    // A selection belongs to the list it was made from: another kind, search or filter starts it again.
    effect(() => {
      this.kind(); this.query(); this.waits();
      untracked(() => this.bulk.clear());
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.reading?.unsubscribe());
    if (this.noWorkspace()) { this.loading.set(false); return; }
    this.load();
    if (this.viewer().documents) this.readNames();
  }

  load(): void {
    this.reading?.unsubscribe();
    this.loading.set(true);
    const started = performance.now();
    this.reading = loadReview(this.http, this.viewer()).subscribe({
      next: load => {
        this.bulk.clear();
        this.now.set(Date.now());
        this.answer.set(load);
        this.loading.set(false);
        this.loaded.set(true);
        this.loadMs.set(Math.round(performance.now() - started));
      },
      error: () => { this.loading.set(false); this.loaded.set(true); },
    });
  }

  private readNames(): void {
    this.http.get<ApiResponse<{ ocrDocumentId: number; sourceKey?: string | null }[]>>(`${API_BASE}/documentOcr.json/fetchAll`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) return;
        this.names.set(new Map((r.data ?? []).map(d => [d.ocrDocumentId, d.sourceKey ?? ''] as [number, string])));
      },
      error: () => { /* documents are named by their number */ },
    });
  }

  /** A document by its file name when known; everything else by its title. */
  nameOf(item: ReviewItem): string {
    if (item.kind !== 'document' || !item.doc) return item.title;
    const key = this.names().get(item.doc.ocrDocumentId);
    return key ? key.slice(key.lastIndexOf('/') + 1) : item.title;
  }

  /** The line under the name: the run's request, the approval step, the document's values to check. */
  subOf(item: ReviewItem): string {
    if (item.kind === 'document' && item.doc) {
      const d = item.doc;
      return `${d.reviewCount ?? 0} of ${d.fieldCount ?? 0} values to check · extraction ${d.extractionId}`;
    }
    if (item.kind === 'run') return item.task ? item.task.name : 'Needs the internal review';
    if (item.task) return item.stepType === 'task' ? `Task: ${item.task.name}` : item.task.name;
    return '';
  }

  dueOrAge(item: ReviewItem): string {
    if (item.overdue) return 'Overdue';
    const due = dueIn(item.due, this.now());
    if (due) return due;
    const age = ageOf(item.since, this.now());
    return age ? `Waiting ${age}` : '—';
  }

  plural(kind: ReviewKind): string {
    return ({ approval: 'Approvals', run: 'Runs', document: 'Documents' })[kind];
  }

  kindCount(kind: ReviewKind): string {
    const b = this.answer()?.beyond;
    const n = this.items().filter(i => i.kind === kind).length;
    const extra = !b ? 0 : kind === 'approval' ? b.tasks : kind === 'document' ? b.documents : 0;
    return this.countText(n + extra) + (kind === 'run' && b?.runs ? '+' : '');
  }

  countText(n: number): string {
    return n.toLocaleString('en-US');
  }

  failedText(kind: ReviewKind): string {
    return ({ approval: 'Your approvals could not be read; the rest is listed.', run: 'The runs waiting for review could not be read; the rest is listed.',
      document: 'The documents in review could not be read; the rest is listed.' })[kind];
  }

  clear(): void {
    this.kind.set('');
    this.query.set('');
    this.waits.set('');
  }

  pick(item: ReviewItem, box: HTMLInputElement): void {
    if (!this.bulk.toggle(item, box.checked)) {
      box.checked = false;
      this.toast.error(`At most ${BULK_CAP} at a time.`);
    }
  }

  /** A row's detail on the right; its Approve or Reject opens the bulk panel for that one item. */
  open(item: ReviewItem): void {
    const data: ReviewItemPanelData = { item, name: this.nameOf(item) };
    const ref = this.dialog.open<ReviewItemPanelResult, ReviewItemPanelData, ReviewItemPanel>(ReviewItemPanel, sidePanelConfig(data, 'narrow', 'right'));
    ref.closed.subscribe(result => { if (result?.act) this.decideOne(item, result.act); });
  }

  private decideOne(item: ReviewItem, action: BulkAction): void {
    const one = new BulkSelection<ReviewItem>(this.bulk.source);
    const data: BulkPanelData<ReviewItem> = { action, rows: [item], source: one.source };
    const ref = this.dialog.open<BulkAnswer | undefined, BulkPanelData<ReviewItem>, BulkPanel<ReviewItem>>(BulkPanel, sidePanelConfig(data, 'narrow', 'right'));
    ref.closed.subscribe(answer => {
      const decided = answer ?? ref.componentInstance?.result() ?? null;
      if (decided && !decided.dryRun) this.decided(decided);
    });
  }

  /** A decision made: the list and the menu's count read again. */
  decided(_answer: BulkAnswer): void {
    this.load();
    this.injector.get(TaskCountService).refresh();
  }
}
