import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AssistantApi } from './assistant.api';
import { ConversationApi } from './conversation.api';
import {
  ConversationKind, ConversationOutcome, ConversationPage, ConversationRow, DAY_LABEL, DayGroup, KIND_LABEL, OUTCOME_LABEL, badgeOf, kindIcon,
  kindOf, relativeTime, titleOf, viewerZone,
} from './conversation.model';

const PAGE = 50;
const KINDS: ConversationKind[] = ['pipeline', 'question', 'run'];
const OUTCOMES: ConversationOutcome[] = ['pipeline_saved', 'pipeline_draft', 'run_completed', 'run_failed', 'run_running', 'run_not_started',
  'waiting', 'answered', 'failed', 'working'];
const DAYS: DayGroup[] = ['today', 'yesterday', 'week', 'older'];

/**
 * AI › AI Assistant › All conversations (2026-10-12), the Explorer pattern (etl-platform/docs/design/references): facets
 * on the left -- kind, status, day, pinned -- with the server's counts, a search over titles and messages, a dense table
 * (title, kind, status, pipeline, messages, updated), and a detail panel beside it with the first question, what it came
 * to, and Open, Pin and Delete. Every filter is the server's: nothing is read whole.
 */
@Component({
  selector: 'app-conversations-page',
  imports: [Icon, RouterLink, ServerTimePipe],
  templateUrl: './conversations-page.html',
  styles: [`
    .cp-grid { display: grid; gap: 1rem; align-items: start; }
    .cp-facets { display: flex; flex-direction: column; gap: 1rem; }
    .cp-facet legend { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.375rem; }
    .cp-opt { display: flex; align-items: center; gap: 0.5rem; padding: 0.2rem 0.25rem; border-radius: var(--radius-md); font-size: 0.8125rem; cursor: pointer; }
    .cp-opt:hover { background: var(--surface-sunken); }
    .cp-count { margin-left: auto; font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .cp-title { max-width: 28rem; }
    .cp-q { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tr.cp-row { cursor: pointer; }
    tr.cp-row:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .cp-detail { position: sticky; top: 1rem; }
    .cp-wide { display: none; }
    @media (min-width: 1024px) {
      .cp-grid { grid-template-columns: 14rem minmax(0, 1fr); }
      .cp-grid.cp-open { grid-template-columns: 13rem minmax(0, 1fr) 20rem; }
    }
    @media (min-width: 1536px) {
      .cp-grid.cp-open { grid-template-columns: 15rem minmax(0, 1fr) 26rem; }
      .cp-wide { display: table-cell; }
    }
    @media (min-width: 1280px) { .cp-grid:not(.cp-open) .cp-wide { display: table-cell; } }
    @media (max-width: 1535px) { .cp-grid.cp-open .cp-title { max-width: 14rem; } }
  `],
})
export class ConversationsPage {
  private readonly api = inject(ConversationApi);
  private readonly assistant = inject(AssistantApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly kinds = KINDS;
  readonly outcomes = OUTCOMES;
  readonly days = DAYS;
  readonly kindLabel = KIND_LABEL;
  readonly outcomeLabel = OUTCOME_LABEL;
  readonly dayLabel = DAY_LABEL;
  readonly zone = viewerZone();

  readonly q = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  readonly kind = signal<ConversationKind[]>([]);
  readonly outcome = signal<ConversationOutcome[]>([]);
  readonly updated = signal<DayGroup | null>(null);
  readonly pinnedOnly = signal(false);

  readonly rows = signal<ConversationRow[]>([]);
  readonly total = signal(0);
  readonly facets = signal<ConversationPage['facets']>({});
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly now = signal(new Date());

  readonly selected = computed(() => this.rows().find(r => r.conversationId === this.selectedId()) ?? null);
  readonly more = computed(() => this.rows().length < this.total());
  readonly filtered = computed(() => !!(this.q().trim() || this.kind().length || this.outcome().length || this.updated() || this.pinnedOnly()));

  private request?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const ticker = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(ticker);
      clearTimeout(this.searchTimer);
      this.request?.unsubscribe();
    });
    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.request = this.api.list(this.filter(0)).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The conversations could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.total.set(r.data.total ?? 0);
        this.facets.set(r.data.facets ?? {});
        if (this.selectedId() != null && !this.rows().some(x => x.conversationId === this.selectedId())) this.selectedId.set(null);
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
    this.api.list(this.filter(this.rows().length)).subscribe({
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

  private filter(offset: number) {
    return { q: this.q(), kind: this.kind(), outcome: this.outcome(), updated: this.updated(), pinned: this.pinnedOnly(), offset, limit: PAGE };
  }

  search(text: string): void {
    this.q.set(text);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 250);
  }

  toggleKind(k: ConversationKind): void {
    this.kind.update(list => (list.includes(k) ? list.filter(x => x !== k) : [...list, k]));
    this.load();
  }

  toggleOutcome(o: ConversationOutcome): void {
    this.outcome.update(list => (list.includes(o) ? list.filter(x => x !== o) : [...list, o]));
    this.load();
  }

  pickDay(d: DayGroup | null): void {
    this.updated.set(d);
    this.load();
  }

  togglePinned(): void {
    this.pinnedOnly.update(v => !v);
    this.load();
  }

  clearAll(): void {
    this.q.set('');
    this.kind.set([]);
    this.outcome.set([]);
    this.updated.set(null);
    this.pinnedOnly.set(false);
    this.load();
  }

  select(c: ConversationRow): void {
    this.selectedId.set(this.selectedId() === c.conversationId ? null : c.conversationId);
  }

  openInAssistant(c: ConversationRow): void {
    this.router.navigate(['/ai/assistant'], { queryParams: { c: c.conversationId } });
  }

  togglePin(c: ConversationRow): void {
    const pinned = !c.pinned;
    this.api.pin(c.conversationId, pinned).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'Not changed.'); return; }
        this.toast.success(pinned ? 'Pinned.' : 'Unpinned.');
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'The conversation could not be pinned.'),
    });
  }

  async remove(c: ConversationRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete "${titleOf(c)}"?`,
      body: 'The conversation and its messages go. Runs it started, a pipeline it created, and their executions, stay.',
      confirmLabel: 'Delete conversation', danger: true,
    });
    if (!ok) return;
    this.assistant.remove(c.conversationId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'Not deleted.'); return; }
        this.toast.success('Conversation deleted.');
        this.selectedId.set(null);
        this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'The conversation could not be deleted.'),
    });
  }

  // ------------------------------------------------------------------------------------------------- the template's

  count(facet: 'kind' | 'outcome' | 'updated', key: string): number {
    return this.facets()?.[facet]?.[key] ?? 0;
  }

  dayTotal(): number {
    const days = this.facets()?.updated ?? {};
    return Object.values(days).reduce((a, b) => a + b, 0);
  }

  pinnedCount(): number { return this.facets()?.pinned?.['pinned'] ?? 0; }
  title(c: ConversationRow): string { return titleOf(c); }
  icon(c: ConversationRow): string { return kindIcon(c); }
  kindOf(c: ConversationRow): ConversationKind { return kindOf(c); }
  badge(c: ConversationRow) { return badgeOf(c); }
  time(c: ConversationRow): string { return relativeTime(c.dateUpdated, this.now(), this.zone); }

  /** A row's keyboard: Enter or Space selects it, as a click does. */
  key(event: KeyboardEvent, c: ConversationRow): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(c);
    }
  }
}
