/**
 * MIG-251 on MIG-242 (Core's part): the model each AI step of a job runs on, as sourceJob.json/aiModelChoice answers
 * it -- the job's AI steps, each with its schedule setting and the models it may run on. The schedule editor saves the
 * setting (aiModelChoice/save); "Run with…" runs once on chosen models (runSourceJobWith). Both send the same body.
 */

/** One model a step may run on (ai-service's model option). */
export interface ModelOption {
  modelOptionId: number;
  connectionId?: number;
  connectionName?: string | null;
  provider?: string | null;
  model?: string | null;
  effectiveModel?: string | null;
  isDefault?: boolean | null;
  connectionActive?: boolean | null;
}

export interface AiStepChoice {
  stepKey: string;
  label?: string | null;
  runIn?: string | null;
  promptId?: number | null;
  /** The schedule's setting; absent when the step runs on its default. */
  modelOptionId?: string | number | null;
  options?: ModelOption[];
  /** ai-service could not be asked for this step's models. */
  optionsError?: string | null;
}

/** Step tag to model option id; '' is the step's default. */
export type ModelPicks = Record<string, string>;

export interface ModelChoiceBody {
  jobId: number;
  steps: { stepKey: string; modelOptionId: string }[];
}

/** The job's AI steps, or none when the answer is not a choice (an unknown endpoint answers an empty list). */
export function stepsOf(data: unknown): AiStepChoice[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const steps = (data as { steps?: unknown }).steps;
  return Array.isArray(steps) ? steps.filter(s => s && typeof s === 'object' && typeof s.stepKey === 'string') : [];
}

/** What each step runs on today: the schedule's setting, else its default (''). */
export function picksOf(steps: AiStepChoice[]): ModelPicks {
  const picks: ModelPicks = {};
  for (const step of steps) {
    picks[step.stepKey] = step.modelOptionId === null || step.modelOptionId === undefined ? '' : String(step.modelOptionId);
  }
  return picks;
}

/** The body both saves take: every step with a model chosen. A step left out runs on its default. */
export function choiceBody(jobId: number, picks: ModelPicks): ModelChoiceBody {
  return {
    jobId,
    steps: Object.entries(picks)
      .filter(([, option]) => !!option)
      .map(([stepKey, modelOptionId]) => ({ stepKey, modelOptionId })),
  };
}

/** Whether any step differs from what it runs on today. */
export function picksChanged(steps: AiStepChoice[], picks: ModelPicks): boolean {
  const before = picksOf(steps);
  return steps.some(step => (before[step.stepKey] ?? '') !== (picks[step.stepKey] ?? ''));
}

/** "OpenAI prod · gpt-4.1-mini", the model it resolves to when that differs, and "(default)" on the step's own default. */
export function optionLabel(option: ModelOption): string {
  const model = option.effectiveModel || option.model || 'model';
  const name = option.connectionName ? `${option.connectionName} · ${model}` : model;
  const inactive = option.connectionActive === false ? ' — connection off' : '';
  return `${name}${option.isDefault ? ' (default)' : ''}${inactive}`;
}
