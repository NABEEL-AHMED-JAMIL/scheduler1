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
import { ListOrder, RunItemsApi, refusalText } from './run-items.api';
import {
  CellLook, FILTER_LABEL, ItemFilter, ItemStep, ItemsPage, MAX_ZIP_ITEMS, NO_SELECTION, RunItem, Selection, SelectionAnswer, cellLook,
  fieldText, filterCount, filtersOf, isSelected, itemLook, itemPanelConfig, itemStats, itemSub, itemTime, itemsQuery, pageState,
  retriedSentence, retryLabel, retryRefusal, selectedCount, selectionBody, stepColumns, stepDescription, stepShortName, toggled, withPage,
  zipItemsLabel,
} from './run-items.model';
import { ItemPanelData, RunItemPanel } from './run-item-panel';
import { ItemFilesData, RunItemFiles } from './run-item-files';
import { ReviewChoice, ReviewDialogData, RunItemsReview } from './run-items-review';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

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
  imports: [Icon, StatStrip, Pagination, EmptyState, CdkMenu, CdkMenuItemCheckbox, CdkMenuTrigger, AppLoading, InlineStatus, LoadError, BlurLoader, SortHeader],
  styles: `
    .ri-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    /* ZT-I35: headers in the design's sentence case, a step by its short name (its whole name on hover). */
    .ri-table th { text-align: left; font-weight: 600; font-size: 0.75rem; color: var(--text-secondary); padding: 0.5rem 0.75rem;
                   border-bottom: 1px solid var(--border-subtle); white-space: nowrap; background: var(--surface-sunken); }
    .ri-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    .ri-table tbody tr:last-child td { border-bottom: 0; }
    .ri-table tr.is-failed > td { background: color-mix(in oklab, var(--crit-soft) 35%, var(--surface-raised)); }
    .ri-table tr.is-child > td { background: var(--surface-inset); }
    .ri-table tr.is-child.is-failed > td { background: color-mix(in oklab, var(--crit-soft) 35%, var(--surface-inset)); }
    .ri-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22rem; display: block; }
    .ri-sub { font-size: 0.75rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22rem; }
    .ri-child-name { padding-left: 1.5rem; }
    .ri-cell-none { color: var(--text-muted); }
    /* ZT-I35: a step's files as a chip -- its one file's type and name, or the count. */
    .ri-chip { display: inline-flex; align-items: center; gap: 0.375rem; max-width: 15rem; height: 1.625rem; padding: 0 0.5rem;
               border: 1px solid var(--border-control); border-radius: var(--radius-md); font-size: 0.75rem; font-weight: 500;
               background: var(--surface-raised); color: var(--text-primary); }
    .ri-chip:hover { background: var(--surface-sunken); }
    .ri-chip:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .ri-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .ri-search { width: min(24rem, 100%); }
    .ri-field { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* ZT-I15: at 1024 the table scrolls inside its card; Open stays at its right edge, over the row's own background. */
    .ri-table .ri-open { position: sticky; right: 0; background: var(--surface-raised); }
    .ri-table th.ri-open { background: var(--surface-sunken); }
    /* MIG-421: the selection's box column and the floating bar of what to do with the selected items. */
    .ri-pick { width: 2.5rem; padding-right: 0 !important; }
    .ri-table tr.is-picked > td { background: color-mix(in oklab, var(--info-soft) 45%, var(--surface-raised)); }
    .ri-bar { position: sticky; bottom: 1rem; z-index: 5; align-self: center; display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem;
              padding: 0.625rem 0.75rem 0.625rem 1.125rem; border-radius: var(--radius-card); background: var(--text-primary); color: var(--surface-raised);
              box-shadow: 0 12px 32px var(--shadow-color); max-width: calc(100% - 1rem); }
    .ri-bar .btn-bar { height: 2.125rem; padding: 0 0.875rem; border-radius: var(--radius-md); font-size: 0.875rem; border: 1px solid color-mix(in oklab, var(--surface-raised) 35%, transparent);
                       background: transparent; color: inherit; }
    .ri-bar .btn-bar.is-main { background: var(--surface-raised); color: var(--text-primary); border-color: transparent; font-weight: 500; }
    .ri-bar .btn-bar:disabled { opacity: 0.5; }
    .ri-bar .ri-bar-link { color: color-mix(in oklab, var(--surface-raised) 75%, transparent); font-size: 0.8125rem; text-decoration: underline; }
    .ri-bar .ri-bar-rule { width: 1px; height: 1.5rem; background: color-mix(in oklab, var(--surface-raised) 30%, transparent); }
  `,
  template: `
    <section class="flex flex-col gap-3" data-test="run-items" aria-label="Items">
      @if (data()) {
        <app-stat-strip [items]="tiles()" [cols]="3" [smCols]="5" [lgCols]="5" size="md" label="This run's items" data-test="items-summary" />
      }

      <div class="card overflow-clip">
        <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-subtle">
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show items">
            @for (f of filters(); track f) {
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
          @if (refs().length) {
            <span class="pill pill-brand inline-flex items-center gap-1.5" data-test="items-refs">
              {{ refsLabel() }}
              <button type="button" class="btn btn-ghost btn-icon btn-xs" aria-label="Show every item" (click)="showAll()"><app-icon name="close" size="0.8em" /></button>
            </span>
          }
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

        <!-- Owner 2026-10-27: a filter, search or page that fails keeps the rows and says so above them (the error was set
             and never shown); the first load is a skeleton, its failure the shared error with Try again. -->
        @if (error() && data()) {
          <div class="px-4 py-2 border-b border-subtle" data-test="items-reload-error"><app-inline-status [error]="error()" (retry)="load()" /></div>
        }
        @if (error() && !data()) {
          <app-load-error [message]="error()" (retry)="load()" />
        } @else if (!data()) {
          <app-loading shape="rows" label="Reading the run's items…" />
        } @else if (!rows().length) {
          <app-empty-state class="p-8" icon="list" [title]="emptyTitle()" [message]="emptyMessage()">
            @if (status() !== 'all' || searchApplied()) {
              <button type="button" class="btn btn-default btn-sm" (click)="clear()">Show every item</button>
            }
          </app-empty-state>
        } @else {
          <app-blur-loader [active]="loading()" label="Reading the items…">
          <div class="overflow-x-auto relative" [attr.aria-busy]="loading()">
            <table class="ri-table" data-test="items-table">
              <thead>
                <tr>
                  <th scope="col" class="ri-pick">
                    <input type="checkbox" data-test="items-pick-page" [checked]="pageTick() === 'all'" [indeterminate]="pageTick() === 'some'"
                           [attr.aria-label]="'Select the ' + rows().length + ' items on this page'" (change)="tickPage($any($event.target).checked)" />
                  </th>
                  <!-- Owner 2026-10-27: these four sort on the server (Core's runItems); step and field columns stay plain. -->
                  <th scope="col" appSort="position" [sortBy]="sort" class="text-right">#</th>
                  <th scope="col" appSort="label" [sortBy]="sort">Item</th>
                  <th scope="col" appSort="status" [sortBy]="sort">Status</th>
                  @for (s of columns(); track s.key) { <th scope="col" [attr.data-step]="s.key" [attr.title]="desc(s) || null">{{ short(s) }}</th> }
                  @for (f of fields(); track f) {
                    <th scope="col" [attr.data-field-col]="f">
                      <span class="inline-flex items-center gap-1">{{ f }}@if (isMasked(f)) { <app-icon name="lock" size="0.85em" label="Masked" title="Masked for you" /> }</span>
                    </th>
                  }
                  <th scope="col" appSort="time" [sortBy]="sort" class="text-right">Time</th>
                  <th scope="col" class="ri-open"><span class="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                @for (item of rows(); track item.ref) {
                  <tr [class.is-failed]="item.status === 'failed'" [class.is-picked]="picked(item.ref)" [attr.data-ref]="item.ref">
                    <td class="ri-pick"><input type="checkbox" [checked]="picked(item.ref)" (change)="tick(item.ref)" [attr.aria-label]="'Select ' + item.label" data-test="item-pick" /></td>
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
                                                   [attr.aria-label]="short(s) + ' for ' + item.label + ': view'" (click)="open(item, s.key)">{{ c.text }}</button> }
                          @case ('file') { <button type="button" class="ri-chip" [title]="c.title" data-test="cell-file"
                                                   [attr.aria-label]="short(s) + ' for ' + item.label + ': ' + c.text" (click)="openFiles(item, s)">
                                             <app-icon [name]="c.icon ?? 'file'" size="0.95em" class="icon-muted shrink-0" /><span>{{ c.text }}</span></button> }
                          @case ('files') { <button type="button" class="ri-chip" [title]="c.title" data-test="cell-files"
                                                    [attr.aria-label]="short(s) + ' for ' + item.label + ': ' + c.text" (click)="openFiles(item, s)">
                                              <app-icon [name]="c.icon ?? 'layers'" size="0.95em" class="icon-muted shrink-0" /><span>{{ c.text }}</span></button> }
                          @case ('failed') { <button type="button" class="link-inline text-xs text-crit-500" [title]="c.title"
                                                     [attr.aria-label]="short(s) + ' failed for ' + item.label" (click)="open(item, s.key)">{{ c.text }}</button> }
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
                    <td class="text-right ri-open">
                      <button type="button" class="btn btn-default btn-xs" [attr.aria-label]="'Open ' + item.label" data-test="item-open" (click)="open(item)">Open</button>
                    </td>
                  </tr>
                  @if (isOpen(item.ref)) {
                    @let kids = children().get(item.ref)!;
                    @for (child of kids.items; track child.ref) {
                      <tr class="is-child" [class.is-failed]="child.status === 'failed'" [attr.data-child]="child.ref">
                        <td></td>
                        <td></td>
                        <td><span class="ri-name ri-child-name" [title]="child.label">{{ child.label }}</span></td>
                        <td class="whitespace-nowrap"><span class="pill pill-{{ look(child).tone }}">{{ look(child).label }}</span></td>
                        @for (s of columns(); track s.key) {
                          <td class="whitespace-nowrap">
                            @let c = cell(child, s);
                            @switch (c.kind) {
                              @case ('view') { <button type="button" class="link-inline text-xs font-medium" [attr.aria-label]="short(s) + ' for ' + child.label + ': view'" (click)="open(child, s.key)">{{ c.text }}</button> }
                              @case ('file') { <button type="button" class="ri-chip" [title]="c.title" [attr.aria-label]="short(s) + ' for ' + child.label + ': ' + c.text" (click)="openFiles(child, s)">
                                <app-icon [name]="c.icon ?? 'file'" size="0.95em" class="icon-muted shrink-0" /><span>{{ c.text }}</span></button> }
                              @case ('files') { <button type="button" class="ri-chip" [title]="c.title" [attr.aria-label]="short(s) + ' for ' + child.label + ': ' + c.text" (click)="openFiles(child, s)">
                                <app-icon [name]="c.icon ?? 'layers'" size="0.95em" class="icon-muted shrink-0" /><span>{{ c.text }}</span></button> }
                              @case ('failed') { <span class="text-xs text-crit-500">{{ c.text }}</span> }
                              @case ('none') { <span class="ri-cell-none" [title]="c.title">—</span> }
                              @default { <span class="text-xs text-[color:var(--text-secondary)]" [title]="c.title">{{ c.text }}</span> }
                            }
                          </td>
                        }
                        @for (f of fields(); track f) { <td class="ri-field text-[color:var(--text-secondary)]">{{ field(child, f) }}</td> }
                        <td class="text-right tabular whitespace-nowrap text-[color:var(--text-secondary)]">{{ time(child) }}</td>
                        <td class="text-right whitespace-nowrap ri-open">
                          @if (child.status === 'failed' && canRetry()) {
                            <button type="button" class="btn btn-default btn-xs" data-test="child-retry" [disabled]="retrying()"
                                    [attr.aria-label]="'Retry ' + child.label + ' of ' + item.label" (click)="retryChild(child)">Retry page</button>
                          } @else {
                            <button type="button" class="btn btn-default btn-xs" [attr.aria-label]="'Open ' + child.label + ' of ' + item.label" (click)="open(child)">Open</button>
                          }
                        </td>
                      </tr>
                    }
                    <tr class="is-child">
                      <td></td>
                      <td [attr.colspan]="span()" class="text-xs text-[color:var(--text-secondary)]" data-test="children-foot">
                        @if (kids.loading) { <app-loading shape="inline" label="Reading the pages…" /> }
                        @else if (kids.error) {
                          <app-inline-status [error]="kids.error" (retry)="childPage(item, kids.page)" />
                        }
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
          </app-blur-loader>
          <app-pagination [total]="data()!.total" [page]="page() + 1" [size]="size()" (goTo)="goTo($event - 1)" (setSize)="setSize($event)" />
        }
      </div>

      @if (selected() > 0) {
        <div class="ri-bar" role="region" [attr.aria-label]="selected() + ' items selected'" data-test="items-bar">
          <span class="text-sm font-semibold tabular" data-test="bar-count">{{ selected() }} selected</span>
          @if (!selection().all && (data()?.total ?? 0) > selected()) {
            <button type="button" class="ri-bar-link" data-test="bar-select-all" (click)="selectAll()">Select all {{ data()!.total }} matching</button>
          }
          <span class="ri-bar-rule" aria-hidden="true"></span>
          @if (canRetry()) {
            <button type="button" class="btn-bar is-main" data-test="bar-retry" [disabled]="!(counted()?.failed) || bulkBusy() || !!retryWhy()"
                    [title]="!(counted()?.failed) ? 'None of the selected items failed' : retryWhy() || 'Retry only the failed items of the selection'"
                    (click)="retrySelected()">{{ retryText() }}</button>
          }
          <button type="button" class="btn-bar" data-test="bar-zip" [disabled]="bulkBusy() || selected() > maxZip"
                  [title]="zipTitle()"
                  (click)="downloadZip()">{{ zipText() }}</button>
          <button type="button" class="btn-bar" data-test="bar-csv" [disabled]="bulkBusy()" (click)="downloadCsvOfSelection()">Export CSV</button>
          @if (canRetry()) {
            <button type="button" class="btn-bar" data-test="bar-review" [disabled]="bulkBusy()" (click)="sendToReview()">Send to review</button>
          }
          <button type="button" class="btn btn-ghost btn-icon btn-sm text-inherit" aria-label="Clear the selection" data-test="bar-clear" (click)="clearSelection()">
            <app-icon name="close" /></button>
        </div>
      }
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
  /** MIG-421: the schedule, for "All runs of this item". */
  readonly jobId = input<string | number | null>(null);
  /** MIG-421: only these items (a Task inbox task's link, ?items=2,6,9). */
  readonly refs = input<string[]>([]);

  private readonly api = inject(RunItemsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly filters = computed(() => filtersOf(this.data()?.summary));
  readonly filterLabel = FILTER_LABEL;
  readonly maxZip = MAX_ZIP_ITEMS;
  /** MIG-421: what is ticked, and what Core says it is (how many, how many failed). */
  readonly selection = signal<Selection>(NO_SELECTION);
  readonly counted = signal<SelectionAnswer | null>(null);
  readonly bulkBusy = signal(false);
  readonly showRefs = signal(true);
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

  /**
   * Owner 2026-10-27 ("add a sort on each table"): #, Item, Status and Time sort on the server (Core reads the run's items
   * whole and sorts them before cutting the page), so every page is in that order; a document's pages follow the same
   * order. A new order goes back to the first page and folds the opened documents. The list's own order is # ascending (item
   * order, exactly Core's default), and that order sends no sort.
   */
  readonly sort = createTableSort<RunItem>({
    id: 'run-items',
    server: true,
    initial: { key: 'position', direction: 'asc' },
    columns: {
      position: { value: item => item.position, kind: 'number', first: 'asc' },
      label: { value: item => item.label, kind: 'text' },
      status: { value: item => itemLook(item).label, kind: 'status' },
      time: { value: item => item.durationMs, kind: 'number' },
    },
    onChange: () => {
      this.page.set(0);
      this.children.set(new Map());
      this.load();
    },
  });

  /** What a read carries: the column and direction, or nothing for item order. */
  private order(): ListOrder {
    const picked = this.sort.param();
    return picked && !(picked.sort === 'position' && picked.dir === 'asc') ? { sort: picked.sort, dir: picked.dir } : {};
  }

  readonly rows = computed(() => this.data()?.items ?? []);
  readonly activeRefs = computed(() => this.showRefs() ? this.refs() : []);
  readonly refsLabel = computed(() => `Showing the ${this.activeRefs().length === 1 ? 'item' : this.activeRefs().length + ' items'} sent to review`);
  readonly selected = computed(() => selectedCount(this.selection(), this.data()?.total ?? 0));
  readonly pageTick = computed(() => pageState(this.selection(), this.rows().map(r => r.ref)));
  readonly retryText = computed(() => retryLabel(this.counted()?.failed ?? 0));
  readonly zipText = computed(() => zipItemsLabel(this.selected()));
  readonly zipTitle = computed(() => this.selected() > MAX_ZIP_ITEMS ? `A zip holds at most ${MAX_ZIP_ITEMS} items` : 'Each item\'s files in a folder of its own');
  readonly columns = computed(() => stepColumns(this.data()?.steps ?? []));
  readonly fieldList = computed(() => this.data()?.fields ?? []);
  readonly span = computed(() => 6 + this.columns().length + this.fields().length);
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
    // The page's own first read is in item order: a remembered column order reads again instead.
    if (first && first.page === 0 && first.size === this.size() && !this.activeRefs().length && !this.order().sort) this.data.set(first);
    else this.load();
  }

  count(f: ItemFilter): number { return filterCount(this.data()?.summary, f); }
  look(item: RunItem) { return itemLook(item); }
  sub(item: RunItem): string { return itemSub(item); }
  time(item: RunItem): string { return itemTime(item.durationMs); }
  cell(item: RunItem, step: ItemStep): CellLook { return cellLook(item.cells?.[step.key]); }
  /** ZT-I35: a step by its short name; its whole name, when that says more, on hover. */
  readonly short = stepShortName;
  readonly desc = stepDescription;
  field(item: RunItem, f: string): string { return fieldText(item.fields?.[f]); }
  isMasked(f: string): boolean { return (this.data()?.masked ?? []).includes(f); }

  /** Reads the page asked for; `quiet` keeps the rows on screen while it does. */
  load(quiet = false): void {
    const id = Number(this.jobQueueId());
    if (!id) return;
    if (!quiet) this.loading.set(true);
    this.error.set('');
    this.request?.unsubscribe();
    this.request = this.api.list({ ...itemsQuery(id, {
      status: this.status(), search: this.searchApplied(), page: this.page(), size: this.size(), fields: this.fields(), refs: this.activeRefs(),
    }), ...untracked(() => this.order()) }).subscribe({
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
    this.clearSelection();
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
    this.clearSelection();
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
      jobId: this.jobId() ?? null,
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
    this.api.list({ ...itemsQuery(Number(this.jobQueueId()), {
      status: failedOnly ? 'failed' : 'all', parent: item.ref, page, size: CHILD_PAGE, fields: this.fields(),
    }), ...this.order() }).subscribe({
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

  // MIG-421: bulk select.
  picked(ref: string): boolean { return isSelected(this.selection(), ref); }

  tick(ref: string): void { this.setSelection(toggled(this.selection(), ref)); }

  tickPage(on: boolean): void { this.setSelection(withPage(this.selection(), this.rows().map(r => r.ref), on)); }

  /** "Select all N matching": every item the filter and search find, on every page. */
  selectAll(): void { this.setSelection({ all: true, refs: [], except: [] }); }

  clearSelection(): void { this.selection.set(NO_SELECTION); this.counted.set(null); }

  showAll(): void { this.showRefs.set(false); this.page.set(0); this.clearSelection(); this.load(); }

  private bodyOf() {
    return selectionBody(Number(this.jobQueueId()), this.selection(), this.status(), this.searchApplied());
  }

  /** What Core says the selection is -- how many, how many failed -- asked again as it changes. */
  private setSelection(next: Selection): void {
    this.selection.set(next);
    if (!selectedCount(next, this.data()?.total ?? 0)) { this.counted.set(null); return; }
    this.api.selection(this.bodyOf()).subscribe({
      next: answer => this.counted.set(answer),
      error: () => this.counted.set(null),
    });
  }

  async retrySelected(): Promise<void> {
    const failed = this.counted()?.failed ?? 0;
    if (!failed || this.bulkBusy()) return;
    const ok = await confirmWith(this.dialog, {
      title: `Retry ${plural(failed, 'failed item')}?`,
      body: `Only the failed ${failed === 1 ? 'item' : 'items'} of the ${plural(this.selected(), 'item')} selected ${failed === 1 ? 'runs' : 'run'} again, `
        + 'each from the step it failed at; the others are left as they are, and only what runs again is billed.',
      confirmLabel: retryLabel(failed),
    });
    if (!ok) return;
    this.bulkBusy.set(true);
    this.api.retry({ ...this.bodyOf(), onlyFailed: true, from: 'failed_step' }).subscribe({
      next: answer => {
        this.bulkBusy.set(false);
        this.toast.success(retriedSentence(answer.data, answer.message));
        this.clearSelection();
        this.afterRetry();
      },
      error: err => { this.bulkBusy.set(false); this.toast.error(refusalText(err, 'The items could not be retried.')); },
    });
  }

  downloadZip(): void {
    if (this.bulkBusy()) return;
    this.bulkBusy.set(true);
    const id = Number(this.jobQueueId());
    this.api.zipMany(this.bodyOf()).subscribe({
      next: response => {
        this.bulkBusy.set(false);
        if (!response.body) { this.toast.error('The server returned an empty file.'); return; }
        StorageService.saveBlob(response.body, attachmentName(response.headers.get('content-disposition')) || `run-${id}-items.zip`);
      },
      error: async err => { this.bulkBusy.set(false); this.toast.error(await refusalOf(err) || refusalText(err, 'The files could not be downloaded.')); },
    });
  }

  downloadCsvOfSelection(): void {
    if (this.bulkBusy()) return;
    const sel = this.selection();
    this.bulkBusy.set(true);
    const id = Number(this.jobQueueId());
    this.api.csv(id, sel.all ? this.status() : 'all', sel.all ? this.searchApplied() : '', this.fields(), sel.all ? [] : sel.refs, sel.all ? sel.except : [])
      .subscribe({
        next: response => {
          this.bulkBusy.set(false);
          if (!response.body) { this.toast.error('The server returned an empty file.'); return; }
          StorageService.saveBlob(response.body, attachmentName(response.headers.get('content-disposition')) || `run-${id}-items.csv`);
        },
        error: async err => { this.bulkBusy.set(false); this.toast.error(await refusalOf(err) || 'The items could not be downloaded.'); },
      });
  }

  sendToReview(): void {
    if (this.bulkBusy()) return;
    const data: ReviewDialogData = { count: this.selected(), labels: this.counted()?.labels ?? [] };
    this.dialog.open<ReviewChoice | null>(RunItemsReview, { data, hasBackdrop: true }).closed.subscribe(choice => {
      if (!choice) return;
      this.bulkBusy.set(true);
      this.api.review({ ...this.bodyOf(), reviewers: choice.reviewers, note: choice.note || undefined }).subscribe({
        next: answer => {
          this.bulkBusy.set(false);
          this.toast.success(`Sent ${plural(answer.data?.items ?? this.selected(), 'item')} to review: a task in Review › Approvals.`);
          this.clearSelection();
        },
        error: err => { this.bulkBusy.set(false); this.toast.error(refusalText(err, 'The items were not sent to review.')); },
      });
    });
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
