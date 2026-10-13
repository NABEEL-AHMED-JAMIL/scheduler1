import { Component, DestroyRef, ElementRef, ViewEncapsulation, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { AssistantApi } from './assistant.api';
import { Conversation } from './assistant.model';
import { ConversationApi } from './conversation.api';
import {
  CHIPS, Chip, ConversationKind, ConversationRow, KIND_LABEL, ListGroup, badgeOf, browserStorage, groupRows, kindIcon, kindOf, matchesChip, mergeRecent,
  readRail, rowTime, titleOf, viewerZone, writeRail,
} from './conversation.model';

/** One page of the side list; Load more asks for the next. */
export const PAGE = 50;
/** How long typing in the search waits before it asks. */
export const SEARCH_DEBOUNCE_MS = 250;
/** How many conversations the folded rail shows as icons. */
export const RAIL_ITEMS = 12;

/**
 * The AI Assistant's conversation list (owner 2026-10-12: "Conversations list not look good so need a view"). Pinned
 * conversations first, then Today, Yesterday, This week and Older; a search (titles and every message, on the server);
 * chips for All, Pipelines, Questions and Runs; and each row says what the conversation was (its icon), a short title,
 * what it came to (Pipeline created -- a link to it --, Not saved with its errors, a run's end, Answered) and when. Pin,
 * rename and delete appear on hover or focus, and in the row's menu, which the keyboard reaches. The list folds to an icon
 * rail to give the chat room, remembered per viewer.
 *
 * The page owns opening and deleting a conversation (`opened`, `remove`); conversations it has just touched (`recent`)
 * are laid over the list at once and the list is read again shortly after.
 *
 * Unencapsulated, with cl- names: the rail narrows the page's grid column, which only a rule outside this component can.
 */
@Component({
  selector: 'app-conversation-list',
  imports: [Icon, RouterLink, NgTemplateOutlet, CdkMenu, CdkMenuItem, CdkMenuTrigger, ServerTimePipe],
  templateUrl: './conversation-list.html',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'cl-host', '[class.cl-rail]': 'rail()' },
  styles: [`
    .cl-host { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    @media (min-width: 1280px) {
      .ai-grid:has(> .ai-history .cl-rail) { grid-template-columns: 3.25rem minmax(26rem, 1fr) minmax(30rem, 1.2fr); }
    }
    @media (min-width: 1536px) {
      .ai-grid:has(> .ai-history .cl-host:not(.cl-rail)) { grid-template-columns: 18.5rem minmax(26rem, 0.95fr) minmax(30rem, 1.15fr); }
    }
    .cl-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0.25rem 0.5rem 0.5rem; }
    .cl-group { position: sticky; top: 0; z-index: 2; background: var(--surface-raised); padding: 0.625rem 0.5rem 0.25rem;
      font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
    /*
     * A row (owner 2026-10-13: "the click border does not look good"): 54 px, the kind's icon in a fixed 2 rem box, the
     * title on one line with the time beside it, the status under the title. Three states, none of which moves the row:
     * hover sinks it; the open conversation takes the accent's soft tint and a 3 px mark drawn inside the row, clear of
     * the card's edge; keyboard focus alone draws a ring (:focus-visible -- a mouse click draws none).
     */
    .cl-row { position: relative; display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; grid-template-rows: 1.25rem 1.125rem;
      column-gap: 0.625rem; row-gap: 0.125rem; align-items: center; min-height: 3.375rem; padding: 0.4375rem 0.625rem 0.4375rem 0.75rem;
      border-radius: var(--radius-lg); }
    .cl-row::before { content: ''; position: absolute; left: 0.25rem; top: 0.75rem; bottom: 0.75rem; width: 3px; border-radius: var(--radius-full);
      background: transparent; }
    .cl-row:hover, .cl-row:has(:focus-visible) { background: var(--surface-sunken); }
    .cl-row.cl-active { background: var(--row-selected-bg); }
    .cl-row.cl-active::before { background: var(--accent-mark-strong); }
    .cl-kind { grid-row: 1 / 3; align-self: center; display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius-md);
      background: var(--surface-inset); color: var(--text-secondary); }
    /* A question's icon box and a neutral pill are greys of the hovered row's own grey: an edge keeps each a shape on it. */
    .cl-kind:not(.cl-pipeline):not(.cl-run) { box-shadow: inset 0 0 0 1px var(--border-subtle); }
    .cl-meta .pill-neutral { border-color: var(--border-subtle); }
    .cl-kind.cl-pipeline { background: var(--pill-brand-bg); color: var(--pill-brand-fg); }
    .cl-kind.cl-run { background: var(--pill-info-bg); color: var(--pill-info-fg); }
    .cl-open { grid-column: 2; grid-row: 1; text-align: left; min-width: 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cl-open::after { content: ''; position: absolute; inset: 0; border-radius: var(--radius-lg); }
    .cl-open:focus { outline: none; }
    .cl-open:focus-visible::after { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .cl-active .cl-open { font-weight: 600; }
    /* --text-muted is a card's grey; on the selected tint it is under 4.5:1 (contrast.spec.ts measures this pair). */
    .cl-active .cl-time { color: var(--text-secondary); }
    .cl-time { grid-column: 3; grid-row: 1; font-size: 11px; line-height: 1.25rem; color: var(--text-muted); white-space: nowrap;
      font-variant-numeric: tabular-nums; }
    .cl-meta { grid-column: 2 / 4; grid-row: 2; display: flex; align-items: center; gap: 0.375rem; min-width: 0; }
    .cl-meta .pill { max-width: 100%; overflow: hidden; text-overflow: ellipsis; line-height: 1rem; padding-block: 0; }
    .cl-lift { position: relative; z-index: 1; }
    .cl-actions { position: absolute; top: 0.375rem; right: 0.375rem; z-index: 1; display: flex; gap: 0.125rem; padding-left: 0.375rem;
      background: inherit; border-radius: var(--radius-md); opacity: 0; pointer-events: none; }
    .cl-row:hover .cl-actions, .cl-row:has(:focus-visible) .cl-actions, .cl-actions.cl-menu-open { opacity: 1; pointer-events: auto; }
    /* While pin and More show, the title ends (with its ellipsis) before them rather than being cut under them. */
    .cl-row:hover .cl-open, .cl-row:has(:focus-visible) .cl-open, .cl-row:has(.cl-menu-open) .cl-open { padding-right: 1rem; }
    .cl-pin-on { color: var(--accent-text); }
    .cl-rail-list { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.5rem 0; overflow-y: auto; min-height: 0; }
    .cl-rail-btn.cl-active { background: var(--row-selected-bg); color: var(--accent-text); }
    @media (prefers-reduced-motion: no-preference) { .cl-actions { transition: opacity 120ms ease-out; } }
  `],
})
export class ConversationList {
  private readonly api = inject(ConversationApi);
  private readonly assistant = inject(AssistantApi);
  private readonly toast = inject(ToastService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Conversations the page has just touched (a new one, an answer, a rename): laid over the list at once. */
  readonly recent = input<Conversation[]>([]);
  readonly activeId = input<number | null>(null);
  /** While the assistant works, opening another conversation waits. */
  readonly disabled = input(false);

  readonly opened = output<number>();
  /** The page confirms and deletes (and starts a new chat when it was the open one). */
  readonly remove = output<Conversation>();
  readonly renamed = output<Conversation>();
  /** The close button of the folded-away list (narrower screens). */
  readonly closed = output<void>();

  readonly chips = CHIPS;
  readonly kindLabel = KIND_LABEL;
  readonly zone = viewerZone();

  readonly rows = signal<ConversationRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly query = signal('');
  readonly chip = signal<Chip>('all');
  readonly rail = signal(readRail(browserStorage()));
  readonly renamingId = signal<number | null>(null);
  readonly renameText = signal('');
  readonly menuOpenId = signal<number | null>(null);
  /** Ticks every minute so "5 min" moves on. */
  readonly now = signal(new Date());

  /** The rows the chip and search allow, with the page's own fresher copies laid over them. */
  readonly shown = computed(() => {
    const chip = this.chip();
    const q = this.query().trim().toLowerCase();
    const merged = mergeRecent(this.rows(), this.recent() as ConversationRow[]);
    const known = new Set(this.rows().map(r => r.conversationId));
    // A just-touched conversation the server has not listed yet shows only when it plainly belongs here.
    return merged.filter(r => matchesChip(r, chip) && (known.has(r.conversationId) || !q || titleOf(r).toLowerCase().includes(q)));
  });
  readonly groups = computed<ListGroup[]>(() => groupRows(this.shown(), this.now(), this.zone));
  readonly railRows = computed(() => this.groups().flatMap(g => g.rows).slice(0, RAIL_ITEMS));
  readonly more = computed(() => this.rows().length < this.total());

  private request?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private lastRecent: Conversation[] | null = null;

  constructor() {
    const ticker = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(ticker);
      clearTimeout(this.searchTimer);
      clearTimeout(this.refreshTimer);
      this.request?.unsubscribe();
    });
    // The page's list moved (an answer, a rename, a delete): drop what it dropped, and read the list again shortly.
    effect(() => {
      const recent = this.recent();
      untracked(() => {
        const before = this.lastRecent;
        this.lastRecent = recent;
        if (before === null) return;
        const still = new Set(recent.map(c => c.conversationId));
        const gone = before.filter(c => !still.has(c.conversationId)).map(c => c.conversationId);
        if (gone.length) {
          this.rows.update(list => list.filter(r => !gone.includes(r.conversationId)));
          this.total.update(n => Math.max(0, n - gone.length));
        }
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.load(), 800);
      });
    });
    this.load();
  }

  // ------------------------------------------------------------------------------------------------- reading

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    const chip = this.chip();
    this.request = this.api.list({ q: this.query(), kind: chip === 'all' ? [] : [chip], limit: Math.max(PAGE, this.rows().length) }).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The conversations could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.total.set(r.data.total ?? 0);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The conversations could not be read.');
      },
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.more()) return;
    this.loadingMore.set(true);
    const chip = this.chip();
    this.api.list({ q: this.query(), kind: chip === 'all' ? [] : [chip], offset: this.rows().length, limit: PAGE }).subscribe({
      next: r => {
        this.loadingMore.set(false);
        if (r.status !== API_SUCCESS || !r.data) return;
        const have = new Set(this.rows().map(x => x.conversationId));
        this.rows.update(list => [...list, ...(r.data!.rows ?? []).filter(x => !have.has(x.conversationId))]);
        this.total.set(r.data.total ?? this.total());
      },
      error: () => this.loadingMore.set(false),
    });
  }

  search(text: string): void {
    this.query.set(text);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), SEARCH_DEBOUNCE_MS);
  }

  clearSearch(): void {
    if (!this.query()) return;
    this.query.set('');
    clearTimeout(this.searchTimer);
    this.load();
  }

  pick(chip: Chip): void {
    if (this.chip() === chip) return;
    this.chip.set(chip);
    this.load();
  }

  toggleRail(): void {
    const next = !this.rail();
    this.rail.set(next);
    writeRail(browserStorage(), next);
  }

  /** From the rail: unfold, with the search ready. */
  searchFromRail(): void {
    this.rail.set(false);
    writeRail(browserStorage(), false);
    setTimeout(() => (this.host.nativeElement.querySelector('input[type="search"]') as HTMLInputElement | null)?.focus());
  }

  // ------------------------------------------------------------------------------------------------- a row

  open(c: ConversationRow): void {
    if (this.disabled() || this.renamingId() === c.conversationId) return;
    this.opened.emit(c.conversationId);
  }

  togglePin(c: ConversationRow): void {
    const pinned = !c.pinned;
    this.patch(c.conversationId, { pinned });
    this.api.pin(c.conversationId, pinned).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.patch(c.conversationId, { pinned: !pinned }); this.toast.error(r.message || 'Not changed.'); }
      },
      error: err => {
        this.patch(c.conversationId, { pinned: !pinned });
        this.toast.error(err?.error?.message || 'The conversation could not be pinned.');
      },
    });
  }

  startRename(c: ConversationRow): void {
    this.renameText.set(titleOf(c));
    this.renamingId.set(c.conversationId);
    setTimeout(() => (this.host.nativeElement.querySelector('[data-rename]') as HTMLInputElement | null)?.select());
  }

  cancelRename(): void {
    this.renamingId.set(null);
  }

  saveRename(c: ConversationRow): void {
    if (this.renamingId() !== c.conversationId) return;
    const title = this.renameText().trim();
    if (!title || title.length > 200) return;
    this.renamingId.set(null);
    if (title === titleOf(c)) return;
    const before = { title: c.title, shortTitle: c.shortTitle, renamed: c.renamed };
    this.patch(c.conversationId, { title, shortTitle: title, renamed: true });
    this.assistant.rename(c.conversationId, title).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.patch(c.conversationId, before); this.toast.error(r.message || 'Not renamed.'); return; }
        this.renamed.emit({ ...c, title, shortTitle: title, renamed: true } as Conversation);
      },
      error: err => {
        this.patch(c.conversationId, before);
        this.toast.error(err?.error?.message || 'The conversation could not be renamed.');
      },
    });
  }

  askRemove(c: ConversationRow): void {
    this.remove.emit(c);
  }

  // ------------------------------------------------------------------------------------------------- the template's

  title(c: ConversationRow): string { return titleOf(c); }
  icon(c: ConversationRow): string { return kindIcon(c); }
  kind(c: ConversationRow): ConversationKind { return kindOf(c); }
  badge(c: ConversationRow) { return badgeOf(c); }
  /** Under a day header the row says the time, not the day again (rowTime). */
  when(c: ConversationRow, group: ListGroup['id']): string { return rowTime(c.dateUpdated, group, this.now(), this.zone); }
  tip(c: ConversationRow): string {
    const parts = [titleOf(c), KIND_LABEL[kindOf(c)]];
    if (c.firstQuestion && c.firstQuestion !== titleOf(c)) parts.push(`“${c.firstQuestion.length > 160 ? c.firstQuestion.slice(0, 159) + '…' : c.firstQuestion}”`);
    if (c.messageCount) parts.push(`${c.messageCount} messages`);
    return parts.join(' · ');
  }

  private patch(id: number, change: Partial<ConversationRow>): void {
    this.rows.update(list => list.map(r => (r.conversationId === id ? { ...r, ...change } : r)));
  }
}
