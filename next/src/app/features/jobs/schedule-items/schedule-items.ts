import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItemCheckbox, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { crumbsFor } from '../../../core/nav/nav-tree';
import { PageHeader } from '../../../shared/ui/page-header';
import { Icon } from '../../../shared/ui/icon';
import { Pagination } from '../../../shared/ui/pagination';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { DateRange, DateRangePicker, presetRange } from '../../../shared/ui/date-range';
import { RunItemsApi, refusalText } from '../run-items/run-items.api';
import { fieldText } from '../run-items/run-items.model';
import {
  AcrossPage, AcrossRow, AcrossStatus, Comparison, acrossQuery, afterText, beforeText, compareTitle, headline, reportText, rowLook,
  sameSteps, ticked, versionText,
} from './schedule-items.model';

/** The day a range's end names, as the instant the next day starts (local), for Core's [from, to). */
function dayStart(day: string, plusDays = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return null;
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
}

/**
 * A schedule's Items tab (MIG-421, the design's screen 3): every run that processed an item -- found by its name or key,
 * or a value such as "risk = High" -- newest first, with how the run started, the pipeline version it ran, the item's
 * status, the fields chosen and its report; tick two runs to compare them, step by step, with what changed in the
 * pipeline between them. Read from the item records alone; masked values stay masked, and are never found by their text.
 */
@Component({
  selector: 'app-schedule-items',
  imports: [PageHeader, Icon, Pagination, EmptyState, ServerTimePipe, RouterLink, DateRangePicker, CdkMenu, CdkMenuItemCheckbox, CdkMenuTrigger],
  styles: `
    .si-tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border-subtle); }
    .si-tab { padding: 0.625rem 0.875rem; font-size: 0.875rem; color: var(--text-secondary); border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .si-tab[aria-current="page"] { color: var(--text-primary); font-weight: 600; border-bottom-color: var(--text-primary); }
    .si-tab:hover { color: var(--text-primary); }
    .si-search { width: min(30rem, 100%); }
    .si-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
    .si-grid.has-compare { grid-template-columns: minmax(0, 1fr) minmax(22rem, 26.25rem); }
    @media (max-width: 1279px) { .si-grid.has-compare { grid-template-columns: minmax(0, 1fr); } }
    .si-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .si-table th { text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); padding: 0.625rem 0.75rem;
                   background: var(--surface-sunken); white-space: nowrap; }
    .si-table td { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border-subtle); vertical-align: middle; }
    .si-table tr.is-ticked > td { background: color-mix(in oklab, var(--info-soft) 45%, var(--surface-raised)); }
    .si-field { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .si-diff { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; }
    .si-diff > div { padding: 0.375rem 0.625rem; font-size: 0.75rem; overflow-wrap: anywhere; }
    .si-path { background: var(--surface-sunken); color: var(--text-secondary); }
    .si-before { background: var(--crit-soft); color: var(--crit-text); }
    .si-after { background: var(--ok-soft); color: var(--ok-text); }
  `,
  template: `
    <div class="page">
      <app-page-header [title]="(jobName() || 'Schedule') + ' · items'" [trail]="trail()">
        <p subtitle class="page-subtitle">Every run that processed an item, newest first. Search an item's name, or a value such as
          <span class="mono">risk = High</span>; tick two runs to compare them.</p>
      </app-page-header>

      <nav class="si-tabs" aria-label="Schedule">
        <a class="si-tab" [routerLink]="['/pipelines/schedules', jobId(), 'executions']" data-test="tab-runs">Runs</a>
        <a class="si-tab" aria-current="page" data-test="tab-items">Items</a>
      </nav>

      <div class="flex flex-wrap items-center gap-2" role="search">
        <label class="si-search relative flex items-center">
          <span class="sr-only">Find an item</span>
          <app-icon name="search" size="0.95em" class="icon-muted absolute left-2.5 pointer-events-none" />
          <input class="input w-full pl-8 mono" type="search" placeholder="An item's name, or a value like risk = High"
                 [value]="searchText()" (input)="typed($any($event.target).value)" (keydown.enter)="searchNow()" data-test="across-search" />
        </label>
        <app-date-range [value]="range()" [presets]="['7d', '30d', '90d', 'all']" label="Runs started" (rangeChange)="setRange($event)" />
        <label class="flex items-center gap-1.5 text-sm">
          <span class="sr-only">Status</span>
          <select class="select select-sm" [value]="status()" (change)="setStatus($any($event.target).value)" data-test="across-status">
            <option value="all">Status: any</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
            <option value="check">Check by hand</option>
          </select>
        </label>
        @if (key()) {
          <span class="pill pill-brand inline-flex items-center gap-1.5" data-test="across-key">
            Item: <span class="mono">{{ keyLabel() }}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-xs" aria-label="Show every item" (click)="clearKey()"><app-icon name="close" size="0.8em" /></button>
          </span>
        }
        <span class="flex-1"></span>
        @if (page()?.fields?.length) {
          <button type="button" class="btn btn-default btn-sm" [cdkMenuTriggerFor]="columnsMenu" data-test="across-columns">
            <app-icon name="columns" />Columns@if (fields().length) { <span class="tabular">({{ fields().length }})</span> }
          </button>
          <ng-template #columnsMenu>
            <div cdkMenu class="card shadow-xl py-1 min-w-56 max-h-96 overflow-auto text-sm" aria-label="Fields to show">
              @for (f of page()!.fields; track f) {
                <button cdkMenuItemCheckbox class="menu-item" [cdkMenuItemChecked]="fields().includes(f)" [attr.data-field]="f" (cdkMenuItemTriggered)="toggleField(f)">
                  <app-icon [name]="fields().includes(f) ? 'check' : 'plus'" size="0.9em" /><span class="mono">{{ f }}</span>
                  @if (masked(f)) { <span class="ml-auto inline-flex items-center gap-1 text-xs text-[color:var(--text-muted)]"><app-icon name="lock" size="0.85em" />Masked</span> }
                </button>
              }
            </div>
          </ng-template>
        }
      </div>

      <div class="si-grid" [class.has-compare]="compareRuns().length === 2">
        <div class="card overflow-clip" data-test="across-card">
          @if (headline(); as h) {
            <div class="flex flex-wrap items-baseline gap-2.5 px-4 py-3 border-b border-subtle">
              <h2 class="mono text-base font-medium" data-test="across-title">{{ h.title }}</h2>
              <span class="text-sm text-[color:var(--text-secondary)]">{{ h.sub }}</span>
            </div>
          }
          @if (page()?.note) { <p class="px-4 py-2 text-xs text-[color:var(--text-secondary)] border-b border-subtle">{{ page()!.note }}</p> }
          @if (error() && !page()) {
            <div class="p-8 flex flex-col items-start gap-3" role="alert">
              <p class="text-sm text-crit-500">{{ error() }}</p>
              <button type="button" class="btn btn-default btn-sm" (click)="load()">Try again</button>
            </div>
          } @else if (!page()) {
            <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]" aria-busy="true">Reading the schedule's items…</p>
          } @else if (!page()!.items.length) {
            <app-empty-state class="p-8" icon="list" [title]="emptyTitle()" [message]="emptyMessage()" />
          } @else {
            <div class="overflow-x-auto" [attr.aria-busy]="loading()">
              <table class="si-table" data-test="across-table">
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    @if (page()!.distinctKeys > 1) { <th scope="col">Item</th> }
                    <th scope="col">When</th>
                    <th scope="col">Pipeline version</th>
                    <th scope="col">Status</th>
                    @for (f of fields(); track f) {
                      <th scope="col" [attr.data-field-col]="f"><span class="inline-flex items-center gap-1">{{ short(f) }}@if (masked(f)) { <app-icon name="lock" size="0.85em" label="Masked" /> }</span></th>
                    }
                    <th scope="col">Report</th>
                    <th scope="col"><span class="sr-only">Compare</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of page()!.items; track r.jobQueueId + '|' + r.key) {
                    <tr [class.is-ticked]="isTicked(r)" [attr.data-run]="r.jobQueueId">
                      <td>
                        <a class="font-semibold" [routerLink]="['/pipelines/schedules', jobId(), 'runs', r.jobQueueId]" [queryParams]="{ tab: 'items' }">#{{ r.jobQueueId }}</a>
                        <div class="text-xs text-[color:var(--text-secondary)]">{{ r.triggerLabel || '—' }}</div>
                      </td>
                      @if (page()!.distinctKeys > 1) {
                        <td><button type="button" class="link-inline mono text-xs" (click)="showKey(r)" [title]="r.key">{{ r.label }}</button></td>
                      }
                      <td class="tabular whitespace-nowrap text-[color:var(--text-secondary)]">{{ r.startedAt ? (r.startedAt | serverTime:'recent') : '—' }}</td>
                      <td class="text-[color:var(--text-secondary)]">{{ version(r) }}</td>
                      <td class="whitespace-nowrap"><span class="pill pill-{{ look(r).tone }}">{{ look(r).label }}</span></td>
                      @for (f of fields(); track f) {
                        <td class="si-field font-semibold" [title]="field(r, f)">{{ field(r, f) }}</td>
                      }
                      <td>
                        @if (r.report?.fileRef) {
                          <button type="button" class="link-inline text-sm" (click)="openReport(r)" [attr.aria-label]="'Open the report of run ' + r.jobQueueId">{{ report(r) }}</button>
                        } @else { <span class="text-[color:var(--text-secondary)]">{{ report(r) }}</span> }
                      </td>
                      <td class="text-right whitespace-nowrap">
                        <label class="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)]">
                          <input type="checkbox" [checked]="isTicked(r)" (change)="tick(r)" [attr.aria-label]="'Compare run ' + r.jobQueueId" data-test="across-compare" />Compare
                        </label>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-pagination [total]="page()!.total" [page]="pageNo() + 1" [size]="size()" (goTo)="goTo($event - 1)" (setSize)="setSize($event)" />
          }
        </div>

        @if (compareRuns().length === 2) {
          <section class="card flex flex-col overflow-clip" aria-label="Compare two runs" data-test="compare">
            @if (comparison(); as c) {
              <div class="px-4 py-3 border-b border-subtle">
                <h2 class="text-[0.9375rem] font-semibold" data-test="compare-title">{{ title(c).title }}</h2>
                <p class="text-sm text-[color:var(--text-secondary)] mt-0.5">{{ title(c).sub }}</p>
              </div>
              <div class="px-4 py-3 flex flex-col gap-3 text-sm max-h-[44rem] overflow-auto">
                @if (c.masked.length) {
                  <p class="flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)]" data-test="compare-masked">
                    <app-icon name="lock" size="0.9em" />Masked for you in both runs: <span class="mono">{{ c.masked.join(', ') }}</span></p>
                }
                @for (s of changedSteps(c); track s.key) {
                  <div class="flex flex-col gap-2" [attr.data-compare-step]="s.key">
                    <h3 class="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">{{ s.name }}</h3>
                    @for (ch of s.changes; track ch.path) {
                      <div class="si-diff">
                        <div class="si-path mono">{{ ch.path }}</div>
                        <div class="si-before mono">− {{ before(ch) }}</div>
                        <div class="si-after mono">+ {{ after(ch) }}</div>
                      </div>
                    }
                    @if (s.truncated) { <p class="text-xs text-[color:var(--text-muted)]">The first {{ s.changes.length }} changes.</p> }
                  </div>
                }
                @for (s of oneSided(c); track s.key) {
                  <p class="text-xs text-[color:var(--text-secondary)]">{{ s.name }}: {{ s.note }}</p>
                }
                <p class="text-[color:var(--text-secondary)] leading-relaxed" data-test="compare-pipeline">{{ c.pipeline.note }}
                  @if (same(c).length) { {{ sameLine(c) }} }</p>
              </div>
            } @else if (compareError()) {
              <p class="p-4 text-sm text-crit-500" role="alert">{{ compareError() }}</p>
            } @else {
              <p class="p-4 text-xs text-[color:var(--text-muted)]" aria-busy="true">Comparing the two runs…</p>
            }
          </section>
        }
      </div>
    </div>
  `,
})
export class ScheduleItems implements OnInit {
  readonly jobId = input.required<string>();
  /** "All runs of this item": an exact item key (?key=). */
  readonly keyParam = input<string>('', { alias: 'key' });
  /** A search from the address (?search=). */
  readonly searchParam = input<string>('', { alias: 'search' });

  private readonly api = inject(RunItemsApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly jobName = signal('');
  readonly searchText = signal('');
  readonly searchApplied = signal('');
  readonly key = signal('');
  readonly status = signal<AcrossStatus>('all');
  readonly range = signal<DateRange>({ ...presetRange('30d'), preset: '30d' });
  readonly pageNo = signal(0);
  readonly size = signal(25);
  readonly fields = signal<string[]>([]);
  readonly page = signal<AcrossPage | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly compareRuns = signal<number[]>([]);
  /** The two rows ticked, in the order ticked (their item keys may differ: the same file in two folders). */
  readonly compareRows = signal<AcrossRow[]>([]);
  readonly comparison = signal<Comparison | null>(null);
  readonly compareError = signal('');

  readonly trail = computed(() => [...crumbsFor(`/pipelines/schedules/${this.jobId()}`, 'here').slice(0, -1),
    { label: this.jobName() ? `${this.jobName()} · items` : 'Schedule items' }]);
  readonly headline = computed(() => headline(this.page()));
  readonly keyLabel = computed(() => this.page()?.keys?.find(k => k.key === this.key())?.label ?? this.key().split('/').pop() ?? this.key());
  readonly emptyTitle = computed(() => this.searchApplied() || this.key() ? 'No run processed it' : 'No items yet');
  readonly emptyMessage = computed(() => this.searchApplied() || this.key()
    ? 'No run of this schedule in the dates shown processed an item that matches. Try a wider date range.'
    : 'This schedule\'s runs have no items yet: only pipelines that work item by item (a file, a recording, a row at a time) have them.');

  private request?: Subscription;
  private compareRequest?: Subscription;
  private typing: ReturnType<typeof setTimeout> | null = null;
  private fieldsPicked = false;
  private started = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.request?.unsubscribe(); this.compareRequest?.unsubscribe(); if (this.typing) clearTimeout(this.typing); });
    // The address names an item ("All runs of this item") or a search: it follows the address.
    effect(() => {
      const key = (this.keyParam() ?? '').trim();
      const search = (this.searchParam() ?? '').trim();
      untracked(() => {
        if (this.started && key === this.key() && search === this.searchApplied()) return;
        this.started = true;
        this.key.set(key);
        this.searchText.set(key ? key.split('/').pop() ?? key : search);
        this.searchApplied.set(key ? '' : search);
        this.pageNo.set(0);
        this.compareRuns.set([]);
        this.compareRows.set([]);
        this.comparison.set(null);
        if (key) this.range.set({ ...presetRange('all'), preset: 'all' });
        this.load();
      });
    });
  }

  ngOnInit(): void {
    this.readName();
  }

  look(r: AcrossRow) { return rowLook(r); }
  version(r: AcrossRow): string { return versionText(r.pipelineVersion); }
  report(r: AcrossRow): string { return reportText(r); }
  field(r: AcrossRow, f: string): string { return fieldText(r.fields?.[f]); }
  masked(f: string): boolean { return (this.page()?.masked ?? []).includes(f); }
  short(f: string): string { const last = f.split('.').pop() ?? f; return last.charAt(0).toUpperCase() + last.slice(1); }
  isTicked(r: AcrossRow): boolean { return this.compareRuns().includes(r.jobQueueId); }
  title(c: Comparison) { return compareTitle(c); }
  before = beforeText;
  after = afterText;
  same(c: Comparison): string[] { return sameSteps(c); }
  sameLine(c: Comparison): string {
    const names = sameSteps(c);
    return names.length ? `Unchanged in both runs: ${names.join(', ')}.` : '';
  }
  changedSteps(c: Comparison) { return c.steps.filter(s => s.changes.length); }
  oneSided(c: Comparison) { return c.steps.filter(s => !s.changes.length && s.note); }

  load(): void {
    const job = Number(this.jobId());
    if (!job) return;
    this.loading.set(true);
    this.error.set('');
    this.request?.unsubscribe();
    const r = this.range();
    this.request = this.api.acrossRuns(acrossQuery(job, {
      key: this.key(), search: this.searchApplied(), status: this.status(), page: this.pageNo(), size: this.size(), fields: this.fields(),
      from: r.from ? dayStart(r.from) : null, to: r.to ? dayStart(r.to, 1) : null,
    })).subscribe({
      next: page => {
        this.loading.set(false);
        this.page.set(page);
        if (page.jobName && !this.jobName()) this.jobName.set(page.jobName);
        // The design's first column: a risk, when the items keep one (once; the reader's own choice stands after).
        if (!this.fieldsPicked && !this.fields().length) {
          const risk = page.fields.find(f => /(^|\.)risk$/i.test(f));
          this.fieldsPicked = true;
          if (risk) { this.fields.set([risk]); this.load(); }
        }
      },
      error: err => { this.loading.set(false); this.error.set(refusalText(err, 'The schedule\'s items could not be read.')); },
    });
  }

  private readName(): void {
    const job = Number(this.jobId());
    if (!job) return;
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const found = (Array.isArray(response.data) ? response.data : []).find(j => Number(j.jobId) === job);
        if (found?.jobName) this.jobName.set(String(found.jobName));
      },
      error: () => { /* the title stays generic */ },
    });
  }

  typed(text: string): void {
    this.searchText.set(text);
    if (this.typing) clearTimeout(this.typing);
    this.typing = setTimeout(() => this.searchNow(), 400);
  }

  searchNow(): void {
    if (this.typing) { clearTimeout(this.typing); this.typing = null; }
    const text = this.searchText().trim();
    if (!this.key() && text === this.searchApplied()) return;
    this.key.set('');
    this.searchApplied.set(text);
    this.pageNo.set(0);
    this.compareRuns.set([]);
    this.compareRows.set([]);
    this.comparison.set(null);
    this.router.navigate([], { queryParams: { search: text || null, key: null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.load();
  }

  showKey(r: AcrossRow): void {
    this.router.navigate([], { queryParams: { key: r.key, search: null }, queryParamsHandling: 'merge' });
  }

  clearKey(): void {
    this.router.navigate([], { queryParams: { key: null, search: null }, queryParamsHandling: 'merge' });
  }

  setStatus(s: string): void {
    this.status.set((['all', 'done', 'failed', 'check'].includes(s) ? s : 'all') as AcrossStatus);
    this.pageNo.set(0);
    this.load();
  }

  setRange(r: DateRange): void {
    this.range.set(r);
    this.pageNo.set(0);
    this.load();
  }

  goTo(page: number): void { this.pageNo.set(Math.max(0, page)); this.load(); }

  setSize(size: number): void { this.size.set(size); this.pageNo.set(0); this.load(); }

  toggleField(f: string): void {
    this.fieldsPicked = true;
    this.fields.update(list => list.includes(f) ? list.filter(x => x !== f) : [...list, f]);
    this.load();
  }

  /** Ticks a run to compare (two at most: a third drops the first ticked); two ticked compare at once. */
  tick(r: AcrossRow): void {
    const rows = this.page()?.items ?? [];
    const next = ticked(this.compareRuns(), r.jobQueueId);
    // Both runs must be of one item -- by name (ZT-I22: the same file from another folder) -- or a tick starts again from it.
    const picked = next.map(id => id === r.jobQueueId ? r : this.compareRows().find(x => x.jobQueueId === id) ?? rows.find(x => x.jobQueueId === id)!);
    const same = new Set(picked.map(x => x.label)).size === 1;
    this.compareRows.set(same ? picked : [r]);
    this.compareRuns.set(this.compareRows().map(x => x.jobQueueId));
    this.comparison.set(null);
    this.compareError.set('');
    if (this.compareRuns().length === 2) this.compare();
  }

  private compare(): void {
    const [a, b] = this.compareRows();
    this.compareRequest?.unsubscribe();
    this.compareRequest = this.api.compare(Number(this.jobId()), a.key, a.jobQueueId, b.jobQueueId, b.key).subscribe({
      next: c => this.comparison.set(c),
      error: err => this.compareError.set(refusalText(err, 'The two runs could not be compared.')),
    });
  }

  /** The report's PDF, opened in a new tab (fetched with the sign-in's token; the file read is logged and audited). */
  openReport(r: AcrossRow): void {
    const fileRef = r.report?.fileRef;
    if (!fileRef) return;
    const tab = window.open('', '_blank');
    this.api.file(r.jobQueueId, r.ref, String(fileRef), true).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url; else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: err => { tab?.close(); this.toast.error(refusalText(err, 'The report could not be opened.')); },
    });
  }
}
