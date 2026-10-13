import { Component, computed, input, signal } from '@angular/core';
import { Markdown } from '../../../shared/ui/markdown';
import { formatDuration } from '../../../shared/ui/time-format';

/** One AI step of a run, as aiPrompt.json/runsForJob answers it. */
export interface RunAiAnswer {
  run: {
    runId: number;
    status?: string | null;
    promptVersion?: number | null;
    stepTag?: string | null;
    output?: string | null;
    error?: string | null;
    latencyMs?: number | null;
    tokensIn?: number | null;
    tokensOut?: number | null;
    attempts?: number | null;
  };
  promptName?: string | null;
}

/** The search over an answer: its prompt, its step tag, what it answered or why it failed. */
export function answerMatches(a: RunAiAnswer, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [a.promptName, a.run.stepTag, a.run.output, a.run.error].some(v => (v ?? '').toLowerCase().includes(q));
}

/**
 * UX review 2026-10-12 (R1): the run's AI answers, a tab of their own -- collapsed, one line each (prompt, step, outcome,
 * time, tokens), opened one at a time, searchable, and the failed ones first to find. Thirty raw JSON answers used to come
 * before the review and the steps.
 */
@Component({
  selector: 'app-run-ai-answers',
  imports: [Markdown],
  template: `
    <div class="flex flex-col gap-3" data-test="ai-answers">
      <div class="flex flex-wrap items-center gap-2">
        <div class="search-field flex-1 min-w-48 max-w-md">
          <input class="input" type="search" placeholder="Search the answers" aria-label="Search the AI answers" data-test="ai-search"
                 [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
        <span class="text-xs text-[color:var(--text-muted)]" data-test="ai-count">
          {{ shown().length === answers().length ? answers().length + ' answer' + (answers().length === 1 ? '' : 's') : shown().length + ' of ' + answers().length }}
          @if (failed()) { · <span class="text-crit-500">{{ failed() }} failed</span> }
        </span>
      </div>
      <ul class="flex flex-col gap-1.5">
        @for (a of shown(); track a.run.runId) {
          <li>
            <details class="card p-0 ai-answer" [attr.data-run]="a.run.runId">
              <summary class="flex flex-wrap items-center gap-2 px-3 py-2 cursor-pointer select-none text-xs">
                <span class="pill" [class]="'pill ' + (a.run.status === 'ok' ? 'pill-ok' : 'pill-crit')">{{ a.run.status === 'ok' ? 'Answered' : 'Failed' }}</span>
                <span class="font-medium">{{ a.promptName || 'prompt' }}</span>
                <span class="text-[color:var(--text-muted)]">v{{ a.run.promptVersion }} → <span class="mono">&lt;{{ a.run.stepTag }}&gt;</span></span>
                <span class="ml-auto text-[color:var(--text-muted)] whitespace-nowrap tabular">
                  @if (a.run.latencyMs != null) { {{ latency(a.run.latencyMs) }} }
                  @if (a.run.tokensIn != null) { · {{ a.run.tokensIn }}→{{ a.run.tokensOut }} tokens }
                  @if ((a.run.attempts ?? 1) > 1) { · {{ a.run.attempts }} attempts }
                </span>
              </summary>
              <div class="px-3 pb-3 text-xs">
                @if (a.run.status === 'ok') {
                  @if (isJson(a.run.output)) { <pre class="prompt-out ai-step-output">{{ a.run.output }}</pre> }
                  @else { <div class="prompt-out ai-step-output ai-step-md"><app-markdown [source]="a.run.output ?? ''" /></div> }
                } @else {
                  <div class="text-crit-500">{{ a.run.error }}</div>
                }
              </div>
            </details>
          </li>
        } @empty {
          <li class="text-sm text-[color:var(--text-muted)] p-4 text-center">
            {{ answers().length ? 'No answer matches "' + query().trim() + '".' : 'This run has no AI steps.' }}</li>
        }
      </ul>
    </div>
  `,
})
export class RunAiAnswers {
  readonly answers = input<RunAiAnswer[]>([]);
  readonly query = signal('');
  /** The failed answers first (what a reader looks for), then in the run's order. */
  readonly shown = computed(() => {
    const term = this.query();
    const list = this.answers().filter(a => answerMatches(a, term));
    return [...list.filter(a => a.run.status !== 'ok'), ...list.filter(a => a.run.status === 'ok')];
  });
  readonly failed = computed(() => this.answers().filter(a => a.run.status !== 'ok').length);

  isJson(output: string | null | undefined): boolean { return /^\s*[[{]/.test(output ?? ''); }
  latency(ms: number): string { return formatDuration(ms / 1000); }
}
