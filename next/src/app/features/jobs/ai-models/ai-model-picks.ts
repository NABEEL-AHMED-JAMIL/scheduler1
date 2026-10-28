import { Component, computed, input, model } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { AiStepChoice, ModelPicks, optionLabel } from './ai-model-choice';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';

/**
 * MIG-251: one row per AI step of a job -- the step, where it runs, and the model it runs on -- for the schedule
 * editor's AI models section and the "Run with…" dialog. The first choice is always the step's default; a step whose
 * models ai-service could not list, or that has no list, says so instead of offering a choice it cannot make.
 */
@Component({
  selector: 'app-ai-model-picks',
  imports: [Icon, AdvancedSelect],
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
            <app-advanced-select [id]="idPrefix() + '-' + step.stepKey" [ariaLabel]="'Model for ' + (step.label || step.stepKey)"
                                 [options]="modelOptions()[step.stepKey] ?? []" [value]="picks()[step.stepKey] || ''"
                                 (valueChange)="pick(step.stepKey, $event)" [allowClear]="true" clearLabel="The step's default"
                                 placeholder="The step's default" searchLabel="Search the models" />
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
  /** Each step's models: the model in monospace with its connection under it, a connection that is off listed and not picked. */
  readonly modelOptions = computed<Record<string, AdvancedOption[]>>(() => Object.fromEntries(this.steps().map(step => [step.stepKey,
    (step.options ?? []).map(o => ({
      value: '' + o.modelOptionId, label: o.effectiveModel || o.model || 'model', mono: true,
      description: [o.connectionName ?? '', o.provider ?? ''].filter(Boolean).join(' · ') || undefined,
      badge: o.connectionActive === false ? 'Connection off' : o.isDefault ? 'Default' : undefined,
      badgeTone: o.connectionActive === false ? 'warn' as const : 'neutral' as const,
      disabled: o.connectionActive === false, keywords: optionLabel(o),
    }))])));

  pick(stepKey: string, option: string): void {
    this.picks.update(picks => ({ ...picks, [stepKey]: option }));
  }
}
