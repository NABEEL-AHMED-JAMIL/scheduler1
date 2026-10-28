import { Component, DestroyRef, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { BoardApi } from './board-api';
import { AppLoading, InlineStatus, loadErrorText } from '../../../shared/ui/loading';
import { BoardFilterDef, chipText } from './board-filters';

/**
 * One dimension filter of a board's bar: "Department: Cardiology +1 ▾", and under it a picker -- a search, the
 * column's values most frequent first with their row counts, a box each. Several may be chosen.
 *
 * The values come from the server (analytics.json/values) through the masked scan, so a reader who may not see a
 * column's values sees its masks and nothing else. The choice is a draft until Apply (or the picker closing with a
 * change in it): ticking three departments is one re-run of the board, not three.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-board-filter-chip',
  imports: [Icon, AppLoading, InlineStatus],
  host: { class: 'board-filter-chip' },
  styles: `
    :host { position: relative; display: inline-flex; }
    .bf-chip { display: inline-flex; align-items: center; gap: 0.375rem; height: 1.75rem; padding: 0 0.625rem; border-radius: 999px;
      border: 1px solid var(--border-strong); background: var(--surface-raised); color: var(--text-primary); font-size: 12px;
      line-height: 1rem; white-space: nowrap; cursor: pointer; transition: border-color 120ms, background-color 120ms; max-width: 22rem; }
    .bf-chip:hover { border-color: var(--text-muted); }
    .bf-chip:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
    .bf-chip.is-on { border-color: var(--accent-text); background: var(--accent-soft); }
    .bf-chip-label { color: var(--text-secondary); }
    .bf-chip-value { font-weight: 600; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .bf-pop { position: absolute; top: calc(100% + 0.375rem); left: 0; z-index: 40; width: 20rem; max-width: calc(100vw - 2rem);
      display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
    .bf-list { max-height: 17rem; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 1px; margin: 0 -0.25rem; }
    .bf-option { display: flex; align-items: center; gap: 0.5rem; padding: 0.3125rem 0.375rem; border-radius: var(--radius-md); font-size: 13px;
      cursor: pointer; min-width: 0; }
    .bf-option:hover { background: var(--surface-sunken); }
    .bf-option-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bf-option-count { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .bf-foot { display: flex; align-items: center; gap: 0.5rem; }
  `,
  template: `
    <button type="button" class="bf-chip" [class.is-on]="values().length > 0" [attr.aria-expanded]="open()" aria-haspopup="dialog"
            [attr.data-filter]="def().key" [title]="values().length ? def().label + ': ' + values().join(', ') : def().label + ': all'"
            (click)="toggle()">
      <span class="bf-chip-label">{{ def().label }}</span>
      <span class="bf-chip-value">{{ text() }}</span>
      <app-icon name="chevronDown" size="0.85em" />
    </button>
    @if (open()) {
      <div class="card shadow-xl bf-pop" role="dialog" [attr.aria-label]="'Filter by ' + def().label" (keydown.escape)="close(false)">
        <label class="relative block">
          <span class="sr-only">Search {{ def().label }}</span>
          <app-icon name="search" size="0.9em" class="absolute left-2 top-1/2 -translate-y-1/2 icon-muted" />
          <input type="search" class="input pl-7 py-1 text-sm w-full" [placeholder]="'Search ' + def().label.toLowerCase()" [value]="search()"
                 (input)="onSearch($any($event.target).value)" data-test="bf-search" />
        </label>
        <!-- Owner 2026-10-27: a status line while the values come, and Try again when they could not be read. -->
        @if (loading()) {
          <div class="py-2"><app-loading shape="inline" label="Loading the values…" /></div>
        } @else if (error()) {
          <app-inline-status class="py-1" [error]="error()" [retryable]="!!def().source" (retry)="retry()" />
        } @else {
          <div class="bf-list" role="group" [attr.aria-label]="def().label + ' values'">
            @for (option of options(); track option.value) {
              <label class="bf-option">
                <input type="checkbox" class="checkbox" [checked]="draft().includes(option.value)" (change)="flip(option.value)" />
                <span class="bf-option-text" [title]="option.value">{{ option.value }}</span>
                @if (option.count !== null) { <span class="bf-option-count">{{ option.count.toLocaleString() }}</span> }
              </label>
            } @empty {
              <p class="text-xs text-[color:var(--text-muted)] px-1.5 py-2">{{ search() ? 'No value matches that search.' : 'This column has no values.' }}</p>
            }
          </div>
          @if (more()) { <p class="text-[11px] text-[color:var(--text-muted)]">The most frequent {{ options().length }} of {{ distinct().toLocaleString() }} values. Search for the rest.</p> }
        }
        <div class="bf-foot">
          <button type="button" class="btn btn-ghost btn-xs" [disabled]="!draft().length" (click)="draft.set([])">Clear</button>
          <span class="text-[11px] text-[color:var(--text-muted)]">{{ draft().length ? draft().length + ' chosen' : 'All values' }}</span>
          <button type="button" class="btn btn-primary btn-xs ms-auto" data-test="bf-apply" (click)="close(true)">Apply</button>
        </div>
      </div>
    }
  `,
})
export class BoardFilterChip {
  private readonly api = inject(BoardApi);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly destroyRef = inject(DestroyRef);

  readonly def = input.required<BoardFilterDef>();
  /** The values chosen now (the board owns them). */
  readonly values = input<string[]>([]);
  /** ZT-A13: the board the chip is on -- a Saved Analyses reader may list only the values a filter of that board lists. */
  readonly boardId = input<number | null>(null);
  readonly changed = output<string[]>();

  readonly open = signal(false);
  readonly draft = signal<string[]>([]);
  readonly search = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly fetched = signal<{ value: string; count: number }[]>([]);
  readonly distinct = signal(0);
  readonly more = signal(false);
  private readonly searches = new Subject<string>();
  private inFlight: Subscription | null = null;

  readonly text = computed(() => chipText(this.values()));

  /** The values listed: what the server sent, with any chosen value it did not send kept at the top (no count). */
  readonly options = computed(() => {
    const listed = this.fetched();
    const known = new Set(listed.map(o => o.value));
    const extra = this.draft().filter(v => !known.has(v) && (!this.search() || v.toLowerCase().includes(this.search().toLowerCase())))
      .map(value => ({ value, count: null as number | null }));
    return [...extra, ...listed.map(o => ({ value: o.value, count: o.count as number | null }))];
  });

  constructor() {
    this.searches.pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef)).subscribe(term => this.fetch(term));
  }

  toggle(): void {
    if (this.open()) { this.close(true); return; }
    this.draft.set([...this.values()]);
    this.search.set('');
    this.open.set(true);
    this.fetch('');
  }

  onSearch(term: string): void {
    this.search.set(term);
    this.searches.next(term);
  }

  flip(value: string): void {
    this.draft.update(now => now.includes(value) ? now.filter(v => v !== value) : [...now, value]);
  }

  /** Closes the picker; applies the draft when asked and when it differs from what is on. */
  close(apply: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.inFlight?.unsubscribe();
    this.loading.set(false);
    if (!apply) return;
    const next = this.draft();
    const now = this.values();
    if (next.length !== now.length || next.some(v => !now.includes(v))) this.changed.emit(next);
  }

  retry(): void { this.fetch(this.search()); }

  private fetch(term: string): void {
    const source = this.def().source;
    if (!source) {
      this.error.set('This filter names no dataset to read its values from. Its editor can set one in Edit filters.');
      return;
    }
    this.inFlight?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.inFlight = this.api.values(source.connection, source.path, source.column, term, 200, this.boardId()).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(loadErrorText(response, 'The values could not be read.'));
          return;
        }
        this.fetched.set(response.data.values ?? []);
        this.distinct.set(response.data.distinct ?? 0);
        this.more.set(!!response.data.more);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(loadErrorText(err, 'The values could not be read.'));
      },
    });
  }

  /** A click outside closes the picker and applies what was ticked. */
  @HostListener('document:mousedown', ['$event'])
  onDocument(event: MouseEvent): void {
    if (this.open() && event.target instanceof Node && !this.host.contains(event.target)) this.close(true);
  }
}
