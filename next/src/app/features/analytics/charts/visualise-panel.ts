import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { Subscription, concatMap, from } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { AskDataApi } from '../../ask-data/ask-data.api';
import { AnalyticsService } from '../analytics.service';
import { kindInfo } from '../widget-kinds';
import { ChartAnswerCard } from './chart-answer-card';
import { ChartAnswer, Suggestion, suggestCharts, suggestionAnswer, tableAnswer } from './chart-answer';
import { AppLoading, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';

/** What is visualised: a file Analytics can read (a dataset, a run's upload), or a run's kept file read as rows. */
export interface VisualiseSource {
  name: string;
  connection?: string;
  path?: string;
  datasetId?: number | null;
  /** A run's kept file (Core's run dataset), read as JSON -- no query, nothing to pin. */
  runDatasetId?: number;
  rowCount?: number | null;
}

/** The most rows of a run's kept file read into the page to chart (the rest stay in the file). */
export const KEPT_ROWS = 5000;

interface Tried { suggestion: Suggestion; answer: ChartAnswer | null; error: string }

/**
 * MIG-357, "Visualise": suggested charts for any dataset or run output, computed from its shape with no AI -- the
 * columns' types say which counts, totals and trends make sense (suggestCharts) and each runs as one bounded query through
 * Analytics, as the person, metered and governed like a query typed in the Studio. Each is drawn with the dashboards'
 * chart engine, with Change chart, Chart settings and Pin to dashboard. "Ask AI for a chart" asks the workspace's model
 * for a chart of this data (askData.json/chart), for a person who holds Ask your data.
 *
 * A run's kept file is not in a storage connection Analytics can read, so it is read as rows (at most {@link KEPT_ROWS})
 * and drawn as it is: the kind the shape suits, and no pin -- a board reads its tiles from a connection.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-visualise-panel',
  imports: [SidePanel, Icon, ChartAnswerCard, AppLoading, LoadError],
  template: `
    <app-side-panel heading="Visualise" [subtitle]="data.name">
      <div class="flex flex-col gap-4 min-w-0" data-test="visualise">
        <!-- Owner 2026-10-27: a read that failed offers Try again; a file that cannot be charted says why, plainly. -->
        @if (error() && readFailed()) {
          <app-load-error data-test="visualise-error" [message]="error()" (retry)="ngOnInit()" />
        } @else if (error()) {
          <p class="text-sm text-crit-500 flex items-start gap-1.5" data-test="visualise-error"><app-icon name="alert" class="icon-crit mt-0.5 shrink-0" size="0.9em" />{{ error() }}</p>
        }
        @if (noSuggestion()) {
          <p class="text-sm text-[color:var(--text-secondary)]" data-test="no-suggestion">
            No column here lends itself to a suggested chart.@if (canAsk()) { Ask AI for one below. }
          </p>
        }
        @if (queryable() && tried().length) {
          <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Suggested charts" data-test="suggestions">
            @for (t of tried(); track t.suggestion.id; let i = $index) {
              <button type="button" role="tab" class="pill hover-brand" [class.pill-brand]="i === picked()" [class.pill-neutral]="i !== picked()"
                      [attr.aria-selected]="i === picked()" [attr.data-suggestion]="t.suggestion.id" (click)="pick(i)">
                {{ t.suggestion.title }}<span class="opacity-70"> · {{ kindLabel(t.suggestion.kind) }}</span>
              </button>
            }
            @if (aiAnswer()) {
              <button type="button" role="tab" class="pill hover-brand" [class.pill-brand]="picked() === -1" [class.pill-neutral]="picked() !== -1"
                      [attr.aria-selected]="picked() === -1" data-suggestion="ai" (click)="picked.set(-1)"><app-icon name="sparkle" size="0.85em" />AI's chart</button>
            }
          </div>
        }
        @if (loading()) {
          <app-loading data-test="visualise-loading" shape="spinner" [label]="loading()" />
        }
        @if (shown(); as answer) {
          <app-chart-answer [answer]="answer" [pinnable]="queryable()" [canPin]="canPin()" [height]="340" />
        } @else if (shownError()) {
          <p class="text-sm text-[color:var(--text-secondary)]" data-test="suggestion-error">{{ shownError() }}</p>
        }
        @if (queryable() && canAsk()) {
          <section class="card p-4 flex flex-col gap-2" aria-label="Ask AI for a chart" data-test="ask-ai">
            <label class="text-sm font-medium" for="visualise-ask">Ask AI for a chart of this data</label>
            <div class="flex items-start gap-2">
              <input id="visualise-ask" class="input flex-1 min-w-0" maxlength="500" placeholder="For example: average stay by department"
                     [value]="question()" (input)="question.set($any($event.target).value)" (keydown.enter)="askAi()" />
              <button type="button" class="btn btn-default btn-sm shrink-0" data-test="ask-ai-go" [disabled]="!question().trim() || asking()" (click)="askAi()">
                <app-icon name="sparkle" />{{ asking() ? 'Asking…' : 'Ask' }}
              </button>
            </div>
            <p class="text-[11px] text-[color:var(--text-muted)]">The model is shown the columns, never the rows; it chooses the query and the chart, and the figures are the query's.</p>
            @if (aiError()) { <p class="text-xs text-crit-500" data-test="ask-ai-error">{{ aiError() }}</p> }
          </section>
        }
      </div>
      <div foot class="flex w-full"><button type="button" class="btn btn-ghost btn-sm ms-auto" (click)="ref.close()">Close</button></div>
    </app-side-panel>
  `,
})
export class VisualisePanel implements OnInit {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<VisualiseSource>(DIALOG_DATA);
  private readonly analytics = inject(AnalyticsService);
  private readonly ask = inject(AskDataApi);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly queryable = computed(() => !!this.data.connection && !!this.data.path);
  readonly canAsk = computed(() => this.auth.canOpen('ask-data'));
  readonly canPin = computed(() => this.auth.canEditDashboards());
  readonly tried = signal<Tried[]>([]);
  readonly picked = signal(0);
  readonly loading = signal('');
  readonly error = signal('');
  /** The error is a read that failed (Try again can help), not a file Visualise cannot chart. */
  readonly readFailed = signal(false);
  /** The columns were read, and not one suggestion fits them: said, rather than an empty panel. */
  private readonly columnsRead = signal(false);
  readonly noSuggestion = computed(() => this.columnsRead() && !this.error() && !this.tried().length);
  readonly held = signal<ChartAnswer | null>(null);
  readonly question = signal('');
  readonly asking = signal(false);
  readonly aiAnswer = signal<ChartAnswer | null>(null);
  readonly aiError = signal('');

  readonly shown = computed<ChartAnswer | null>(() => {
    if (this.held()) return this.held();
    if (this.picked() === -1) return this.aiAnswer();
    return this.tried()[this.picked()]?.answer ?? null;
  });
  readonly shownError = computed(() => (this.picked() >= 0 ? this.tried()[this.picked()]?.error ?? '' : ''));

  private runs: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.runs?.unsubscribe());
  }

  ngOnInit(): void {
    this.error.set('');
    this.readFailed.set(false);
    if (this.queryable()) this.suggest();
    else if (this.data.runDatasetId != null) this.readKept();
    else this.error.set('There is nothing here to chart.');
  }

  kindLabel(kind: string): string {
    return kindInfo(kind)?.short ?? kind;
  }

  pick(index: number): void {
    this.picked.set(index);
  }

  /** The shape first (one footer read), then each suggestion's bounded query, one after another. */
  private suggest(): void {
    const connection = this.data.connection!;
    const path = this.data.path!;
    const dataset = { datasetId: this.data.datasetId ?? null, name: this.data.name, connection, path };
    this.loading.set('Reading the columns…');
    this.columnsRead.set(false);
    this.runs?.unsubscribe();
    this.analytics.schema(connection, path).subscribe({
      next: res => {
        if (res.status !== API_SUCCESS || !res.data) { this.loading.set(''); this.failRead(res, 'The columns could not be read.'); return; }
        const suggestions = suggestCharts(res.data.columns ?? []);
        this.columnsRead.set(true);
        this.tried.set(suggestions.map(suggestion => ({ suggestion, answer: null, error: '' })));
        this.loading.set('Running the suggested charts…');
        this.runs = from(suggestions.map((s, i) => [s, i] as const)).pipe(
          concatMap(([s, i]) => new Promise<void>(done => {
            this.analytics.query({ connection, path, sql: s.sql }).subscribe({
              next: r => {
                this.tried.update(list => list.map((t, at) => at !== i ? t : r.status === API_SUCCESS && r.data
                  ? { ...t, answer: suggestionAnswer(s, dataset, r.data) }
                  : { ...t, error: r.message || 'This chart\'s query could not be run.' }));
                done();
              },
              error: (err: { error?: { message?: string } }) => {
                this.tried.update(list => list.map((t, at) => at !== i ? t : { ...t, error: err?.error?.message || 'This chart\'s query could not be run.' }));
                done();
              },
            });
          })),
        ).subscribe({ complete: () => this.loading.set('') });
      },
      error: (err: unknown) => { this.loading.set(''); this.failRead(err, 'The columns could not be read.'); },
    });
  }

  private failRead(err: unknown, fallback: string): void {
    this.readFailed.set(true);
    this.error.set(loadErrorText(err, fallback));
  }

  /** A run's kept file, read as rows (JSON) when it is small enough to chart in the page. */
  private readKept(): void {
    if ((this.data.rowCount ?? 0) > KEPT_ROWS) {
      this.error.set(`This file has ${this.data.rowCount!.toLocaleString()} rows; Visualise reads a run's kept file up to ${KEPT_ROWS.toLocaleString()}. `
        + 'Save it to a storage connection and visualise it from there.');
      return;
    }
    this.loading.set('Reading the file…');
    this.http.get<unknown>(`${API_BASE}/sourceJob.json/runDataset`, { params: { runDatasetId: String(this.data.runDatasetId), format: 'json' } }).subscribe({
      next: body => {
        this.loading.set('');
        const table = rowsOf(body);
        if (!table) { this.error.set('This file is not a table of rows to chart.'); return; }
        this.held.set(tableAnswer(this.data.name, table.columns, table.rows.slice(0, KEPT_ROWS), table.rows.length > KEPT_ROWS));
      },
      error: (err: unknown) => { this.loading.set(''); this.failRead(err, 'The file could not be read.'); },
    });
  }

  askAi(): void {
    const q = this.question().replace(/\s+/g, ' ').trim();
    if (!q || this.asking() || !this.queryable()) return;
    this.asking.set(true);
    this.aiError.set('');
    this.ask.chart({ question: q, connection: this.data.connection, path: this.data.path, name: this.data.name, datasetId: this.data.datasetId ?? null })
      .subscribe({
        next: res => {
          this.asking.set(false);
          const query = res.data?.query;
          if (res.status !== API_SUCCESS || !query) { this.aiError.set(res.message || 'No chart came back.'); return; }
          this.aiAnswer.set({ sql: query.sql, dataset: query.dataset, columns: query.columns, rows: query.rows, rowCount: query.rowCount,
            truncated: query.truncated, chart: query.chart, summary: query.summary ?? null });
          this.picked.set(-1);
        },
        error: (err: { status?: number; error?: { message?: string } }) => {
          this.asking.set(false);
          this.aiError.set(err?.error?.message || (err?.status === 403 ? 'Ask your data is not part of your access.' : 'No chart came back. Try again.'));
        },
      });
  }
}

/** A JSON body of row objects (or {rows: [...]}) as columns and text cells; null when it is not one. */
export function rowsOf(body: unknown): { columns: string[]; rows: (string | null)[][] } | null {
  const list = Array.isArray(body) ? body : Array.isArray((body as { rows?: unknown })?.rows) ? (body as { rows: unknown[] }).rows
    : Array.isArray((body as { data?: unknown })?.data) ? (body as { data: unknown[] }).data : null;
  if (!list || !list.length || typeof list[0] !== 'object' || list[0] === null || Array.isArray(list[0])) return null;
  const columns = Object.keys(list[0] as Record<string, unknown>);
  const cell = (v: unknown): string | null => v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return { columns, rows: list.map(r => columns.map(c => cell((r as Record<string, unknown>)[c]))) };
}
