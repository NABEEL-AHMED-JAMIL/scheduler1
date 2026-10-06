import { Component, input, model } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { AiStepChoice, ModelPicks, optionLabel } from './ai-model-choice';

/**
 * MIG-251: one row per AI step of a job -- the step, where it runs, and the model it runs on -- for the schedule
 * editor's AI models section and the "Run with…" dialog. The first choice is always the step's default; a step whose
 * models ai-service could not list, or that has no list, says so instead of offering a choice it cannot make.
 */
@Component({
  selector: 'app-ai-model-picks',
  imports: [Icon],
  template: `
    <div class="space-y-3">
      @for (step of steps(); track step.stepKey) {
        <div class="ai-model-pick grid gap-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-3"
             [attr.data-step]="step.stepKey">
          <label class="min-w-0 text-sm" [attr.for]="idPrefix() + '-' + step.stepKey">
            <span class="block font-medium truncate">{{ step.label || step.stepKey }}</span>
            <span class="block text-[11px] text-[color:var(--text-muted)] truncate">
              <span class="mono">&lt;{{ step.stepKey }}&gt;</span>
              · {{ step.runIn === 'worker' ? 'runs in the worker' : 'runs on the server' }}
            </span>
          </label>
          @if (step.optionsError) {
            <p class="flex items-start gap-1.5 text-xs text-warn-500">
              <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />{{ step.optionsError }}
            </p>
          } @else if (!step.options?.length) {
            <p class="text-xs text-[color:var(--text-muted)]">Runs on its prompt's model; no other model is allowed for this step.</p>
          } @else {
            <select class="input" [id]="idPrefix() + '-' + step.stepKey"
                    [attr.aria-label]="'Model for ' + (step.label || step.stepKey)"
                    (change)="pick(step.stepKey, $any($event.target).value)">
              <option value="" [selected]="!picks()[step.stepKey]">The step's default</option>
              @for (option of step.options; track option.modelOptionId) {
                <option [value]="'' + option.modelOptionId" [disabled]="option.connectionActive === false"
                        [selected]="picks()[step.stepKey] === '' + option.modelOptionId">{{ label(option) }}</option>
              }
            </select>
          }
        </div>
      }
    </div>
  `,
})
export class AiModelPicks {
  readonly steps = input.required<AiStepChoice[]>();
  readonly picks = model.required<ModelPicks>();
  /** Keeps two lists on one page (never today) from sharing ids. */
  readonly idPrefix = input('ai-model');

  readonly label = optionLabel;

  pick(stepKey: string, option: string): void {
    this.picks.update(picks => ({ ...picks, [stepKey]: option }));
  }
}
