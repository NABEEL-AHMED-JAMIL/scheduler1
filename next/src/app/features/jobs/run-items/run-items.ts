import { Component, DestroyRef, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItemCheckbox, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { refusalOf } from '../../../shared/ui/blob-refusal';
import { StorageService } from '../../objects/storage.service';
import { attachmentName } from '../run-steps/run-steps.model';
import { plural } from '../run-steps/run-page.model';
import { RunItemsApi, refusalText } from './run-items.api';
import {
  CellLook, FILTER_LABEL, ITEM_FILTERS, ItemFilter, ItemStep, ItemsPage, RunItem, cellLook, fieldText, filterCount, itemLook,
  itemPanelConfig, itemStats, itemSub, itemTime, itemsQuery, retriedSentence, retryRefusal, stepColumns,
} from './run-items.model';
import { ItemPanelData, RunItemPanel } from './run-item-panel';
import { ItemFilesData, RunItemFiles } from './run-item-files';

/** A document's pages (or any item's sub-items), read when its row is opened. */
interface Children { items: RunItem[]; total: number; page: number; failedOnly: boolean; loading: boolean; error: string; }

/** How many sub-items an opened row lists at a time. */
export const CHILD_PAGE = 15;

/**
 * The run page's Items tab (MIG-420): for a pipeline that works item by item, every item with how far it got -- a
 * summary, filters by status with their counts, a search (an item's name, or a value such as "risk = High"), one column
 * per step (View its data, its files, or a dash where it did not run), the item's fields on request, and its time.
 * Open shows the item's panel; a step's "40 files ›" its files. Retry failed items retries every failed one from the
 * step it failed at.
 */
@Component({
  selector: 'app-run-items',
  imports: [Icon, StatStrip, Pagination, EmptyState, CdkMenu, CdkMenuItemCheckbox, CdkMenuTrigger],
  styles: `
    .ri-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    .ri-table th { text-align: left; font-weight: 600; font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase;
                   color: var(--text-muted); padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap;
                   background: var(--surface-sunken); }
    .ri-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    .ri-table tbody tr:last-child td { border-bottom: 0; }
    .ri-table tr.is-failed > td { background: color-mix(in oklab, var(--crit-soft) 35%, var(--surface-raised)); }
    .ri-table tr.is-child > td { background: var(--surface-inset); }
    .ri-table tr.is-child.is-failed > td { background: color-mix(in oklab, var(--crit-soft) 35%, var(--surface-inset)); }
    .ri-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22rem; display: block; }
    .ri-sub { font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22rem; }
    .ri-child-name { padding-left: 1.5rem; }
    .ri-cell-none { color: var(--text-muted); }
    .ri-search { width: min(24rem, 100%); }
    .ri-field { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
  template: `
    <section class="flex flex-col gap-3" data-test="run-items" aria-label="Items">
      @if (data()) {
        <app-stat-strip [items]="tiles()" [cols]="3" [smCols]="5" [lgCols]="5" size="md" label="This run's items" data-test="items-summary" />
      }

      <div class="card overflow-clip">
        <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-subtle">
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show items">
            @for (f of filters; track f) {
              <button type="button" class="btn btn-default btn-sm gap-1.5 ring-[color:var(--focus-ring)]" [class.ring-2]="status() === f"
                      [attr.aria-pressed]="status() === f" [attr.data-filter]="f" (click)="setStatus(f)">
                {{ filterLabel[f] + ' ' }}<span class="tabular font-semibold">{{ count(f) }}</span>
              </button>
            }
          </div>
          <label class="ri-search relative flex items-center">
            <span class="sr-only">Search items</span>
            <app-icon name="search" size="0.95em" class="icon-muted absolute left-2.5 pointer-events-none" />
            <input class="input input-sm w-full pl-8" type="search" placeholder="Search an item, or a value like risk = High"
                   [value]="searchText()" (input)="typed($any($event.target).value)" (keydown.enter)="searchNow()" data-test="items-search" />
          </label>
          <span class="flex-1"></span>
          @if (fieldList().length) {
            <button type="button" class="btn btn-default btn-sm" [cdkMenuTriggerFor]="columnsMenu" data-test="items-columns"
                    [attr.aria-label]="'Columns: ' + (fields().length ? fields().length + ' added' : 'add a field')">
              <app-icon name="columns" />Columns@if (fields().length) { <span class="tabular">({{ fields().length }})</span> }
            </button>
            <ng-template #columnsMenu>
              <div cdkMenu class="card shadow-xl py-1 min-w-56 text-sm" aria-label="Fields to show">
                @for (f of fieldList(); track f) {
                  <button cdkMenuItemCheckbox class="menu-item" [cdkMenuItemChecked]="fields().includes(f)" [attr.data-field]="f"
                          (cdkMenuItemTriggered)="toggleField(f)">
                    <app-icon [name]="fields().includes(f) ? 'check' : 'plus'" size="0.9em" />
                    <span class="mono">{{ f }}</span>
                    @if (isMasked(f)) { <span class="ml-auto inline-flex items-center gap-1 text-xs text-[color:var(--text-muted)]"><app-icon name="lock" size="0.85em" />Masked</span> }
                  </button>
                }
              </div>
            </ng-template>
          }
          <button type="button" class="btn btn-default btn-sm" (click)="downloadCsv()" [disabled]="csvBusy()" data-test="items-csv">
            <app-icon name="download" />Download CSV
          </button>
          @if (canRetry() && (data()?.summary?.failedItems ?? 0) > 0) {
            <button type="button" class="btn btn-primary btn-sm" data-test="items-retry-failed" [disabled]="!!retryWhy() || retrying()"
                    [title]="retryWhy() || 'Retry every failed item from the step it failed at'" (click)="retryFailed()">
              <app-icon name="play" />Retry failed items ({{ data()!.summary.failedItems }})
            </button>
          }
        </div>
        @if (retryWhy() && canRetry() && (data()?.summary?.failedItems ?? 0) > 0) {
          <p class="px-4 py-2 text-xs text-[color:var(--text-secondary)] border-b border-subtle" data-test="items-retry-why">{{ retryWhy() }}</p>
        }
        @if (data()?.maskNote) {
          <p class="flex items-center gap-1.5 px-4 py-2 text-xs text-[color:var(--text-secondary)] border-b border-subtle" data-test="items-mask-note">
            <app-icon name="lock" size="0.9em" />{{ data()!.maskNote }}</p>
        }

        @if (error() && !data()) {
          <div class="p-8 flex flex-col items-start gap-3" role="alert">
            <p class="text-sm text-crit-500">{{ error() }}</p>
            <button type="button" class="btn btn-default btn-sm" (click)="load()">Try again</button>
          </div>
        } @else if (!data()) {
          <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]" aria-busy="true">Reading the run's items…</p>
        } @else if (!rows().length) {
          <app-empty-state class="p-8" icon="list" [title]="emptyTitle()" [message]="emptyMessage()">
            @if (status() !== 'all' || searchApplied()) {
              <button type="button" class="btn btn-default btn-sm" (click)="clear()">Show every item</button>
            }
          </app-empty-state>
        } @else {
          <div class="overflow-x-auto" [attr.aria-busy]="loading()">
            <table class="ri-table" data-test="items-table">
              <thead>
                <tr>
                  <th scope="col" class="text-right">#</th>
                  <th scope="col">Item</th>
                  <th scope="col">Status</th>
                  @for (s of columns(); track s.key) { <th scope="col" [attr.data-step]="s.key">{{ s.name }}</th> }
                  @for (f of fields(); track f) {
                    <th scope="col" [attr.data-field-col]="f">
                      <span class="inline-flex items-center gap-1">{{ f }}@if (isMasked(f)) { <app-icon name="lock" size="0.85em" label="Masked" title="Masked for you" /> }</span>
                    </th>
                  }
                  <th scope="col" class="text-right">Time</th>
                  <th scope="col"><span class="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                @for (item of rows(); track item.ref) {
                  <tr [class.is-failed]="item.status === 'failed'" [attr.data-ref]="item.ref">
                    <td class="text-right tabular text-[color:var(--text-muted)]">{{ item.position ?? item.ref }}</td>
                    <td>
                      <div class="flex items-start gap-1.5 min-w-0">
                        @if (item.children?.total) {
                          <button type="button" class="btn btn-ghost btn-icon btn-xs shrink-0" data-test="item-expand"
                                  [attr.aria-expanded]="isOpen(item.ref)"
                                  [attr.aria-label]="(isOpen(item.ref) ? 'Hide the pages of ' : 'Show the pages of ') + item.label"
                                  (click)="toggleChildren(item)"><app-icon [name]="isOpen(item.ref) ? 'chevronDown' : 'chevronRight'" /></button>
                        }
                        <div class="min-w-0">
                          <span class="ri-name mono" [title]="item.label">{{ item.label }}</span>
                          @if (sub(item)) { <div class="ri-sub" [title]="sub(item)">{{ sub(item) }}</div> }
                        </div>
                      </div>
                    </td>
                    <td class="whitespace-nowrap" data-test="item-status"><span class="pill pill-{{ look(item).tone }}">{{ look(item).label }}</span></td>
                    @for (s of columns(); track s.key) {
                      <td class="whitespace-nowrap" [attr.data-cell]="s.key">
                        @let c = cell(item, s);
                        @switch (c.kind) {
                          @case ('view') { <button type="button" class="link-inline text-xs font-medium" [title]="c.title"
                                                   [attr.aria-label]="s.name + ' for ' + item.label + ': view'" (click)="open(item, s.key)">{{ c.text }}</button> }
                          @case ('files') { <button type="button" class="link-inline text-xs font-medium" [title]="c.title"
                                                    [attr.aria-label]="s.name + ' for ' + item.label + ': ' + c.text" (click)="openFiles(item, s)">{{ c.text }}</button> }
                          @case ('failed') { <button type="button" class="link-inline text-xs text-crit-500" [title]="c.title"
                                                     [attr.aria-label]="s.name + ' failed for ' + item.label" (click)="open(item, s.key)">{{ c.text }}</button> }
                          @case ('shared') { <span class="text-xs text-[color:var(--text-secondary)]" [title]="c.title">{{ c.text }}</span> }
                          @case ('done') { <span class="text-xs text-[color:var(--text-secondary)]" [title]="c.title">{{ c.text }}</span> }
                          @default { <span class="ri-cell-none" [title]="c.title">—</span> }
                        }
                        @if (item.cells?.[s.key]?.reused) { <span class="ml-1 text-[11px] text-[color:var(--text-muted)]" title="Reused from the earlier attempt">reused</span> }
                      </td>
                    }
                    @for (f of fields(); track f) {
                      <td class="ri-field text-[color:var(--text-secondary)]" [title]="field(item, f)">{{ field(item, f) }}</td>
                    }
                    <td class="text-right tabular whitespace-nowrap text-[color:var(--text-secondary)]">{{ time(item) }}</td>
                    <td class="text-right">
                      <button type="button" class="btn btn-default btn-xs" [attr.aria-label]="'Open ' + item.label" data-test="item-open" (click)="open(item)">Open</button>
                    </td>
                  </tr>
                  @if (isOpen(item.ref)) {
                    @let kids = children().get(item.ref)!;
                    @for (child of kids.items; track child.ref) {
                      <tr class="is-child" [class.is-failed]="child.status === 'failed'" [attr.data-child]="child.ref">
                        <td></td>
                        <td><span class="ri-name ri-child-name" [title]="child.label">{{ child.label }}</span></td>
                        <td class="whitespace-nowrap"><span class="pill pill-{{ look(child).tone }}">{{ look(child).label }}</span></td>
                        @for (s of columns(); track s.key) {
                          <td class="whitespace-nowrap">
                            @let c = cell(child, s);
                            @switch (c.kind) {
                              @case ('view') { <button type="button" class="link-inline text-xs font-medium" [attr.aria-label]="s.name + ' for ' + child.label + ': view'" (click)="open(child, s.key)">{{ c.text }}</button> }
                              @case ('files') { <button type="button" class="link-inline text-xs font-medium" [attr.aria-label]="s.name + ' for ' + child.label + ': ' + c.text" (click)="openFiles(child, s)">{{ c.text }}</button> }
                              @case ('failed') { <span class="text-xs text-crit-500">{{ c.text }}</span> }
                              @case ('none') { <span class="ri-cell-none" [title]="c.title">—</span> }
                              @default { <span class="text-xs text-[color:var(--text-secondary)]" [title]="c.title">{{ c.text }}</span> }
                            }
                          </td>
                        }
                        @for (f of fields(); track f) { <td class="ri-field text-[color:var(--text-secondary)]">{{ field(child, f) }}</td> }
                        <td class="text-right tabular whitespace-nowrap text-[color:var(--text-secondary)]">{{ time(child) }}</td>
                        <td class="text-right whitespace-nowrap">
                          @if (child.status === 'failed' && canRetry()) {
                            <button type="button" class="btn btn-default btn-xs" data-test="child-retry" [disabled]="retrying()"
                                    [attr.aria-label]="'Retry ' + child.label + ' of ' + item.label" (click)="retryChild(child)">Retry page</button>
                          } @else {
                            <button type="button" class="btn btn-ghost btn-xs" [attr.aria-label]="'Open ' + child.label + ' of ' + item.label" (click)="open(child)">Open</button>
                          }
                        </td>
                      </tr>
                    }
                    <tr class="is-child">
                      <td></td>
                      <td [attr.colspan]="span() - 1" class="text-xs text-[color:var(--text-secondary)]" data-test="children-foot">
                        @if (kids.loading) { Reading the pages… }
                        @else if (kids.error) { <span class="text-crit-500">{{ kids.error }}</span> }
                        @else {
                          <span class="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span class="tabular">{{ childRange(kids) }}</span>
                            @if (kids.page > 0) { <button type="button" class="link-inline" (click)="childPage(item, kids.page - 1)">Previous {{ childPageSize }}</button> }
                            @if ((kids.page + 1) * childPageSize < kids.total) { <button type="button" class="link-inline" (click)="childPage(item, kids.page + 1)">Next {{ childPageSize }}</button> }
                            @if (item.children?.failed) {
                              <button type="button" class="link-inline" data-test="children-failed" [attr.aria-pressed]="kids.failedOnly"
                                      (click)="childFailedOnly(item, !kids.failedOnly)">{{ kids.failedOnly ? 'Show all ' + item.children!.total : 'Failed only (' + item.children!.failed + ')' }}</button>
                            }
                          </span>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <app-pagination [total]="data()!.total" [page]="page() + 1" [size]="size()" (goTo)="goTo($event - 1)" (setSize)="setSize($event)" />
        }
      </div>
    </section>
  `,
})
export class RunItems implements OnInit {
  readonly jobQueueId = input.required<string>();
  /** The page's own first read (size 50, the address's status): drawn without asking again. */
  readonly first = input<ItemsPage | null>(null);
  readonly initialStatus = input<ItemFilter>('all');
  /** The run's duration as the page's summary writes it. */
  readonly runDuration = input('—');
  /** Retrying is Schedules' (Source Jobs) to do; a reviewer reads only. */
  readonly canRetry = input(false);
  /** Moves with each read of the run: a running run's items are read again with it. */
  readonly refreshKey = input(0);
  /** The filter chosen, for the address (?status=). */
  readonly statusChange = output<ItemFilter>();
  /** Items were queued again: the page re-reads the run. */
  readonly retried = output<void>();

  private readonly api = inject(RunItemsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly filters = ITEM_FILTERS;
  readonly filterLabel = FILTER_LABEL;
  readonly childPageSize = CHILD_PAGE;

  readonly status = signal<ItemFilter>('all');
  readonly searchText = signal('');
  readonly searchApplied = signal('');
  readonly page = signal(0);
  readonly size = signal(50);
  readonly fields = signal<string[]>([]);
  readonly data = signal<ItemsPage | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly csvBusy = signal(false);
  readonly retrying = signal(false);
  readonly children = signal<ReadonlyMap<string, Children>>(new Map());

  readonly rows = computed(() => this.data()?.items ?? []);
  readonly columns = computed(() => stepColumns(this.data()?.steps ?? []));
  readonly fieldList = computed(() => this.data()?.fields ?? []);
  readonly span = computed(() => 5 + this.columns().length + this.fields().length);
  readonly retryWhy = computed(() => retryRefusal(this.data()?.summary));
  readonly tiles = computed<StatStripItem[]>(() => {
    const summary = this.data()?.summary;
    if (!summary) return [];
    return itemStats(summary, this.runDuration()).map(s => ({
      label: s.label, value: s.value, foot: s.foot, ...(s.tone === 'ok' || s.tone === 'crit' ? { tone: s.tone } : {}),
    }));
  });
  readonly emptyTitle = computed(() => this.status() === 'all' && !this.searchApplied() ? 'No items yet' : 'No item matches');
  readonly emptyMessage = computed(() => this.status() === 'all' && !this.searchApplied()
    ? 'The run has not found its items yet; they appear here as its first step finds them.'
    : `No ${this.status() === 'all' ? '' : FILTER_LABEL[this.status()].toLowerCase() + ' '}item matches${this.searchApplied() ? ` “${this.searchApplied()}”` : ''}.`);

  private request?: Subscription;
  private typing: ReturnType<typeof setTimeout> | null = null;
  private keyShown = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.request?.unsubscribe(); if (this.typing) clearTimeout(this.typing); });
    // A running run's items move with each read of the run (the page's poll), quietly.
    effect(() => {
      const key = this.refreshKey();
      if (key !== this.keyShown && this.keyShown !== 0) untracked(() => this.load(true));
      this.keyShown = key;
    });
  }

  ngOnInit(): void {
    this.status.set(this.initialStatus());
    const first = this.first();
    if (first && first.page === 0 && first.size === this.size()) this.data.set(first);
    else this.load();
  }

  count(f: ItemFilter): number { return filterCount(this.data()?.summary, f); }
  look(item: RunItem) { return itemLook(item); }
  sub(item: RunItem): string { return itemSub(item); }
  time(item: RunItem): string { return itemTime(item.durationMs); }
  cell(item: RunItem, step: ItemStep): CellLook { return cellLook(item.cells?.[step.key]); }
  field(item: RunItem, f: string): string { return fieldText(item.fields?.[f]); }
  isMasked(f: string): boolean { return (this.data()?.masked ?? []).includes(f); }

  /** Reads the page asked for; `quiet` keeps the rows on screen while it does. */
  load(quiet = false): void {
    const id = Number(this.jobQueueId());
    if (!id) return;
    if (!quiet) this.loading.set(true);
    this.error.set('');
    this.request?.unsubscribe();
    this.request = this.api.list(itemsQuery(id, {
      status: this.status(), search: this.searchApplied(), page: this.page(), size: this.size(), fields: this.fields(),
    })).subscribe({
      next: page => {
        this.loading.set(false);
        this.data.set(page);
        // A page past the end (the filter shrank under it) goes back to the last one there is.
        if (!page.items.length && page.total > 0 && this.page() > 0) this.goTo(Math.max(0, Math.ceil(page.total / this.size()) - 1));
      },
      error: err => {
        this.loading.set(false);
        if (!quiet || !this.data()) this.error.set(refusalText(err, 'The run\'s items could not be read.'));
      },
    });
  }

  setStatus(f: ItemFilter): void {
    if (this.status() === f) return;
    this.status.set(f);
    this.page.set(0);
    this.children.set(new Map());
    this.statusChange.emit(f);
    this.load();
  }

  typed(text: string): void {
    this.searchText.set(text);
    if (this.typing) clearTimeout(this.typing);
    this.typing = setTimeout(() => this.searchNow(), 350);
  }

  searchNow(): void {
    if (this.typing) { clearTimeout(this.typing); this.typing = null; }
    const text = this.searchText().trim();
    if (text === this.searchApplied()) return;
    this.searchApplied.set(text);
    this.page.set(0);
    this.load();
  }

  clear(): void {
    this.searchText.set('');
    this.searchApplied.set('');
    if (this.status() !== 'all') { this.setStatus('all'); return; }
    this.page.set(0);
    this.load();
  }

  goTo(page: number): void {
    this.page.set(Math.max(0, page));
    this.load();
  }

  setSize(size: number): void {
    this.size.set(size);
    this.page.set(0);
    this.load();
  }

  toggleField(f: string): void {
    this.fields.update(list => list.includes(f) ? list.filter(x => x !== f) : [...list, f]);
    this.load(true);
  }

  // The item's panel and its files.
  open(item: RunItem, stepKey: string | null = null): void {
    const data: ItemPanelData = {
      jobQueueId: Number(this.jobQueueId()), ref: item.ref, stepKey, canRetry: this.canRetry(),
      status: item.parentRef ? null : this.status(), search: item.parentRef ? null : this.searchApplied(),
      childNoun: this.data()?.summary?.childNoun ?? 'page',
      onRetried: () => this.afterRetry(),
    };
    this.dialog.open(RunItemPanel, itemPanelConfig(data));
  }

  openFiles(item: RunItem, step: ItemStep): void {
    const data: ItemFilesData = { jobQueueId: Number(this.jobQueueId()), ref: item.ref, label: item.label, stepKey: step.key, stepName: step.name };
    this.dialog.open(RunItemFiles, itemPanelConfig(data));
  }

  // A document's pages.
  isOpen(ref: string): boolean { return this.children().has(ref); }

  toggleChildren(item: RunItem): void {
    if (this.isOpen(item.ref)) {
      const next = new Map(this.children());
      next.delete(item.ref);
      this.children.set(next);
      return;
    }
    this.readChildren(item, 0, false);
  }

  childPage(item: RunItem, page: number): void {
    this.readChildren(item, page, this.children().get(item.ref)?.failedOnly ?? false);
  }

  childFailedOnly(item: RunItem, on: boolean): void { this.readChildren(item, 0, on); }

  childRange(kids: Children): string {
    if (!kids.total) return 'No pages';
    const first = kids.page * CHILD_PAGE + 1;
    const last = Math.min(kids.total, first + kids.items.length - 1);
    return `${kids.failedOnly ? 'Failed pages' : 'Pages'} ${first}–${last} of ${kids.total.toLocaleString('en-GB')}`;
  }

  private readChildren(item: RunItem, page: number, failedOnly: boolean): void {
    const set = (patch: Partial<Children>) => {
      const next = new Map(this.children());
      const was = next.get(item.ref) ?? { items: [], total: 0, page, failedOnly, loading: true, error: '' };
      next.set(item.ref, { ...was, ...patch });
      this.children.set(next);
    };
    set({ loading: true, error: '', page, failedOnly });
    this.api.list(itemsQuery(Number(this.jobQueueId()), {
      status: failedOnly ? 'failed' : 'all', parent: item.ref, page, size: CHILD_PAGE, fields: this.fields(),
    })).subscribe({
      next: answer => set({ items: answer.items, total: answer.total, loading: false }),
      error: err => set({ loading: false, error: refusalText(err, 'The pages could not be read.') }),
    });
  }

  // Retrying.
  async retryFailed(): Promise<void> {
    const summary = this.data()?.summary;
    if (!summary?.failedItems || this.retryWhy() || this.retrying()) return;
    const n = summary.failedItems;
    const steps = (summary.failedAt ?? []).filter(f => f.count > 0).map(f => f.step);
    const ok = await confirmWith(this.dialog, {
      title: `Retry ${plural(n, 'failed item')}?`,
      body: `${n === 1 ? 'It runs' : 'They run'} again from the step ${n === 1 ? 'it' : 'each'} failed at${steps.length ? ` (${steps.join(', ')})` : ''}. `
        + 'The steps before are reused, not run again; the items that are done are left as they are.',
      confirmLabel: `Retry ${plural(n, 'item')}`,
    });
    if (!ok) return;
    this.send({ jobQueueId: Number(this.jobQueueId()), failed: true, from: 'failed_step' });
  }

  retryChild(child: RunItem): void {
    this.send({ jobQueueId: Number(this.jobQueueId()), refs: [child.ref], from: 'item' });
  }

  private send(body: Parameters<RunItemsApi['retry']>[0]): void {
    this.retrying.set(true);
    this.api.retry(body).subscribe({
      next: answer => {
        this.retrying.set(false);
        this.toast.success(retriedSentence(answer.data, answer.message));
        this.afterRetry();
      },
      error: err => {
        this.retrying.set(false);
        this.toast.error(refusalText(err, 'The items could not be retried.'));
      },
    });
  }

  private afterRetry(): void {
    this.children.set(new Map());
    this.retried.emit();
    this.load(true);
  }

  downloadCsv(): void {
    if (this.csvBusy()) return;
    this.csvBusy.set(true);
    const id = Number(this.jobQueueId());
    this.api.csv(id, this.status(), this.searchApplied(), this.fields()).subscribe({
      next: response => {
        this.csvBusy.set(false);
        if (!response.body) { this.toast.error('The server returned an empty file.'); return; }
        StorageService.saveBlob(response.body, attachmentName(response.headers.get('content-disposition')) || `run-${id}-items.csv`);
      },
      error: async err => {
        this.csvBusy.set(false);
        this.toast.error(await refusalOf(err) || 'The items could not be downloaded.');
      },
    });
  }
}
