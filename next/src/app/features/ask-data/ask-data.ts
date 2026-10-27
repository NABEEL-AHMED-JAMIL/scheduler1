import { ModelSetupBanner } from '../ai/model-setup-banner';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subscription, TimeoutError } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { AskDataApi } from './ask-data.api';
import { AskAnswer, AskQuery, AskSourceRef, AskTurn, QUESTION_MAX, Searched, answerCell, chartAnswerOf, csvOf, figureColumns, linkParts, refusalText, searchedText, segments } from './ask-data.model';
import { AuthService } from '../../core/auth/auth.service';
import { AskIndex } from './ask-index';
import { ChartAnswerSlot } from '../analytics/charts/chart-answer-slot';
import { NeedsWorkspace } from '../../shared/ui/needs-workspace';
import { PageHeader } from '../../shared/ui/page-header';
import { Section } from '../../shared/ui/section';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import type { PinnedChart } from '../analytics/analytics.service';
import { AskHistory, EXAMPLE_QUESTIONS, clearHistory, historyKey, readHistory, saveHistory, withPin, withQuestion } from './ask-history';
import { formatDuration, elapsedDuration } from '../../shared/ui/time-format';

/**
 * Ask your data (Wave 5, Data > Ask your data, page key ask-data): a question in plain language, answered by the
 * workspace's model only from the documents and pipeline results the person can see, with numbered citations that open
 * each source. A workspace administrator also chooses what the workspace's search index holds (MIG-281, AskIndex).
 * The examples are built from what the workspace actually has; the session's questions stay on the page
 * (newest first) until it is left -- nothing is saved server-side but a chart pinned to a dashboard (MIG-357).
 * UX final AD1: below the question, the viewer's own recent questions and the answers they pinned from here (kept in
 * this browser, ask-history.ts), the hint that a chart answer can be pinned, and on a first visit a few examples.
 */
@Component({
  selector: 'app-ask-data',
  imports: [PageHeader, RouterLink, Icon, ChartAnswerSlot, AskIndex, ModelSetupBanner, NeedsWorkspace, Section, ServerTimePipe],
  templateUrl: './ask-data.html',
})
export class AskData implements OnInit {
  private readonly api = inject(AskDataApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  /** MIG-281: a workspace administrator chooses what the search index holds. */
  readonly isAdmin = computed(() => this.auth.isTenantAdmin());
  /** A sign-in with no workspace (a platform administrator's own): answers come from a workspace's data, so nothing is asked (review L6). */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);

  readonly max = QUESTION_MAX;
  readonly question = signal('');
  readonly turns = signal<AskTurn[]>([]);
  readonly suggestions = signal<string[]>([]);
  readonly searched = signal<Searched | null>(null);
  readonly warnings = signal<string[]>([]);
  readonly suggestionsLoading = signal(true);
  readonly suggestionsError = signal<string | null>(null);
  /** Seconds the question in hand has been waited for. */
  readonly elapsed = signal(0);
  /** The source a citation was just clicked for. */
  readonly highlighted = signal<string | null>(null);

  readonly asking = computed(() => this.turns().some(t => t.state === 'asking'));
  readonly canAsk = computed(() => !this.asking() && !!this.question().trim() && this.question().length <= this.max);
  readonly searchedLabel = computed(() => searchedText(this.searched()));
  readonly nothingToSearch = computed(() => {
    const s = this.searched();
    return !!s && s.documents === 0 && s.runOutputs === 0;
  });

  /** UX final AD1: this viewer's recent questions and pinned answers, remembered in this browser. */
  private readonly historyKey = computed(() => historyKey(this.auth.user()?.tenantId, this.auth.user()?.appUserId));
  readonly history = signal<AskHistory>({ questions: [], pins: [] });
  readonly examples = EXAMPLE_QUESTIONS;
  /** A first visit: nothing asked here before, in this session or earlier. */
  readonly firstVisit = computed(() => !this.turns().length && !this.history().questions.length && !this.history().pins.length);

  private nextId = 1;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private inFlight: Subscription | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopTicker();
      this.inFlight?.unsubscribe();
      if (this.highlightTimer) clearTimeout(this.highlightTimer);
    });
  }

  ngOnInit(): void {
    if (this.noWorkspace()) return;
    this.history.set(readHistory(this.historyKey()));
    this.loadSuggestions();
  }

  /** An example fills the box for the person to adjust and ask; it is not asked for them. */
  useExample(example: string, box?: HTMLTextAreaElement): void {
    this.question.set(example);
    box?.focus();
  }

  /** Remembers a pin made from an answer here, with the question that drew it. */
  onPinned(turn: AskTurn, pinned: PinnedChart): void {
    this.remember(withPin(this.history(), {
      question: turn.question, title: pinned.widget?.widgetTitle || turn.question,
      dashboardId: pinned.dashboard.analyticsDashboardId, dashboardName: pinned.dashboard.dashboardName,
      widgetId: pinned.widget?.analyticsDashboardWidgetId ?? null,
    }));
  }

  forgetHistory(): void {
    clearHistory(this.historyKey());
    this.history.set({ questions: [], pins: [] });
  }

  private remember(next: AskHistory): void {
    this.history.set(next);
    saveHistory(this.historyKey(), next);
  }

  loadSuggestions(): void {
    if (this.noWorkspace()) return;
    this.suggestionsLoading.set(true);
    this.suggestionsError.set(null);
    this.api.suggestions().subscribe({
      next: res => {
        this.suggestionsLoading.set(false);
        if (res.status !== API_SUCCESS || !res.data) {
          this.suggestionsError.set(refusalText(200, res.message));
          return;
        }
        this.suggestions.set(res.data.suggestions ?? []);
        this.searched.set(res.data.searched ?? null);
        this.warnings.set(res.data.warnings ?? []);
      },
      error: (err: unknown) => {
        this.suggestionsLoading.set(false);
        this.suggestionsError.set(this.errorText(err));
      },
    });
  }

  use(suggestion: string): void {
    this.question.set(suggestion);
    this.ask();
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.ask();
    }
  }

  ask(text?: string): void {
    const q = (text ?? this.question()).replace(/\s+/g, ' ').trim();
    if (!q || q.length > this.max || this.asking()) return;
    const id = this.nextId++;
    this.turns.update(ts => [{ id, question: q, state: 'asking' }, ...ts]);
    this.remember(withQuestion(this.history(), q));
    this.question.set('');
    this.startTicker();
    this.inFlight = this.api.ask(q).subscribe({
      next: res => {
        if (res.status === API_SUCCESS && res.data) this.settle(id, { state: 'answered', answer: res.data });
        else this.settle(id, { state: 'failed', error: refusalText(200, res.message) });
      },
      error: (err: unknown) => this.settle(id, { state: 'failed', error: this.errorText(err) }),
    });
  }

  retry(turn: AskTurn): void {
    this.turns.update(ts => ts.filter(t => t.id !== turn.id));
    this.ask(turn.question);
  }

  clear(): void {
    if (this.asking()) return;
    this.turns.set([]);
  }

  /** The answer as text and citation links, citing only the sources it was given. */
  parts(answer: AskAnswer) {
    return segments(answer.answer, new Set(answer.sources.map(s => s.n)));
  }

  anchor(turn: AskTurn, n: number): string {
    return `ask-${turn.id}-source-${n}`;
  }

  /** A citation's source, scrolled to and marked for a moment. */
  showSource(turn: AskTurn, n: number): void {
    const id = this.anchor(turn, n);
    document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    this.highlighted.set(id);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlighted.set(null), 1600);
  }

  /**
   * MIG-357: a query answer as the chart card draws it -- the model's kind (overruled by the fit rules when it cannot draw
   * the rows), Change chart, Chart settings and Pin to dashboard.
   */
  readonly chartAnswerOf = chartAnswerOf;
  /** UX review 2026-10-12: which columns are figures, and a cell as the table shows it. */
  readonly figureColumns = figureColumns;
  readonly answerCell = answerCell;
  /** Pinning puts a tile on a dashboard: whoever may change them (Edit dashboards or Analytics Studio), not a viewer. */
  readonly canPin = computed(() => this.auth.canEditDashboards());

  shownRows(q: AskQuery): (string | null)[][] {
    return q.rows.slice(0, 20);
  }

  analyticsParams(q: AskQuery): Record<string, string> {
    return { connection: q.dataset.connection, path: q.dataset.path, name: q.dataset.name, sql: q.sql };
  }

  downloadCsv(q: AskQuery): void {
    const url = URL.createObjectURL(new Blob([csvOf(q)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${q.dataset.name.replace(/[^\w.-]+/g, '-').toLowerCase()}-answer.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  searchedOf(answer: AskAnswer): string {
    return searchedText(answer.searched);
  }

  kindLabel(s: AskSourceRef): string {
    return s.kind === 'document' ? 'Document' : s.kind === 'form' ? 'Form submissions' : s.kind === 'file' ? 'File' : 'Pipeline result';
  }

  /** A source's console link as a route and its query ("/forms/submissions?formId=3"): routerLink alone would encode the "?". */
  linkOf(s: AskSourceRef): { path: string; query: Record<string, string> } {
    return linkParts(s.link);
  }

  /** How long an answer took, in the console's duration words ("4.2 sec", "15 sec"); nothing when unmeasured. */
  seconds(ms: number | null | undefined): string {
    return ms == null ? '' : formatDuration(ms / 1000);
  }

  /** The counter while the model reads: "45 sec", "2 min 05 sec". */
  elapsedText(): string {
    return elapsedDuration(this.elapsed());
  }

  private settle(id: number, patch: Partial<AskTurn>): void {
    this.turns.update(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)));
    const answered = patch.answer;
    if (answered?.searched) this.searched.set(answered.searched);
    if (answered?.warnings) this.warnings.set(answered.warnings);
    this.inFlight = null;
    this.stopTicker();
  }

  private errorText(err: unknown): string {
    if (err instanceof TimeoutError) return refusalText(504, null);
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string } | null;
      return refusalText(err.status, body && typeof body === 'object' ? body.message : null);
    }
    return refusalText(-1, null);
  }

  private startTicker(): void {
    this.stopTicker();
    this.elapsed.set(0);
    this.ticker = setInterval(() => this.elapsed.update(s => s + 1), 1000);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
}
