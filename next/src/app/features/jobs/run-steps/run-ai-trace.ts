import { Component, computed, inject } from '@angular/core';
import { RunAiStep } from './run-steps.model';
import { RunTimelineStore } from './run-timeline.store';

/**
 * The run's AI trace, on the AI answers tab: what each AI step ran on and who chose the model (the run, the schedule's
 * setting, or the step's default). Nothing is drawn for a run with no AI steps.
 */
@Component({
  selector: 'app-run-ai-trace',
  template: `
    @if (steps().length) {
      <section class="card p-4" aria-labelledby="run-ai-trace-heading" data-test="ai-trace">
        <h2 id="run-ai-trace-heading" class="detail-head">AI trace</h2>
        <ul class="side-panel-list text-xs">
          @for (a of steps(); track a.stepKey + '-' + (a.attempt ?? 1)) {
            <li>
              <div class="min-w-0">
                <span [class]="outcomePill(a.outcome)">{{ outcomeLabel(a.outcome) }}</span>
                <span class="ml-1 mono font-medium">&lt;{{ a.stepKey }}&gt;</span>
                <span class="text-[color:var(--text-secondary)]">
                  on <span class="mono">{{ a.model || a.modelProfile || 'its default model' }}</span>, {{ choiceLabel(a) }}
                  @if (a.modelChoice) { ({{ a.modelChoice }}) }
                </span>
                @if (a.error) { <div class="text-crit-500 mt-0.5 log-message">{{ a.error }}</div> }
              </div>
              <span class="text-[color:var(--text-muted)] whitespace-nowrap">
                @if (a.promptId) { prompt #{{ a.promptId }} }
                @if (a.promptVersion) { v{{ a.promptVersion }} }
                @if (a.runIn === 'worker') { · in the worker }
              </span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class RunAiTrace {
  private readonly store = inject(RunTimelineStore);
  readonly steps = computed<RunAiStep[]>(() => this.store.timeline()?.aiSteps ?? []);

  /** ai-service's outcome words, as the run's AI steps say them elsewhere. */
  outcomeLabel(outcome: string | null | undefined): string {
    switch (outcome) {
      case 'answered': return 'Answered';
      case 'failed': return 'Failed';
      case 'refused': return 'Refused';
      case 'handed': return 'Handed to the worker';
      default: return outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : 'Asked';
    }
  }

  outcomePill(outcome: string | null | undefined): string {
    if (outcome === 'answered') return 'pill pill-ok';
    if (outcome === 'failed' || outcome === 'refused') return 'pill pill-crit';
    return 'pill pill-neutral';
  }

  /** Who picked the model: the run (Run with…), the schedule's setting, or nobody (the step's default). */
  choiceLabel(step: RunAiStep): string {
    switch (step.profileSource) {
      case 'run': return 'chosen for this run';
      case 'schedule': return 'the schedule\'s setting';
      default: return 'the step\'s default';
    }
  }
}
