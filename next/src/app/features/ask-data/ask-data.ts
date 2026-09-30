import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subscription, TimeoutError } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { AskDataApi } from './ask-data.api';
import { AskAnswer, AskSourceRef, AskTurn, QUESTION_MAX, Searched, refusalText, searchedText, segments } from './ask-data.model';

/**
 * Ask your data (Wave 5, Data > Ask your data, page key ask-data): a question in plain language, answered by the
 * workspace's model only from the documents and pipeline results the person can see, with numbered citations that open
 * each source. The examples are built from what the workspace actually has; the session's questions stay on the page
 * (newest first) until it is left -- nothing is saved.
 */
@Component({
  selector: 'app-ask-data',
  imports: [RouterLink, Icon],
  templateUrl: './ask-data.html',
})
export class AskData implements OnInit {
  private readonly api = inject(AskDataApi);
  private readonly destroyRef = inject(DestroyRef);

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
    this.loadSuggestions();
  }

  loadSuggestions(): void {
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

  searchedOf(answer: AskAnswer): string {
    return searchedText(answer.searched);
  }

  kindLabel(s: AskSourceRef): string {
    return s.kind === 'document' ? 'Document' : 'Pipeline result';
  }

  seconds(ms: number | null | undefined): string {
    return ms == null ? '' : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
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
