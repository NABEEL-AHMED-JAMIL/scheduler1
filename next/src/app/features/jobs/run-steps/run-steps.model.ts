/**
 * MIG-251: what Core's step engine (MIG-230) says about one run, as sourceJob.json/stepExecutions answers it, and the
 * few readings the Executions screens make of it.
 *
 * A run the step engine did not take -- every run before MIG-230, and every job whose task still dispatches to a worker
 * -- answers `legacy: true` with one step whose log is the run's own ("run"). Those runs keep today's screen exactly:
 * nothing here is drawn for them.
 */

/** One dataset a step wrote (run_dataset). There is no download for these yet: Core has no endpoint that serves one. */
export interface StepDataset {
  runDatasetId: number;
  name: string;
  rowCount?: number | null;
  columns?: string[] | null;
  expiresAt?: string | null;
}

export interface StepError {
  message?: string;
  tries?: number;
  timedOut?: boolean;
}

export interface StepExecution {
  stepExecutionId: number | null;
  index: number;
  key: string;
  task: string;
  /** A JobStatus name: Queue, Running, Completed, Failed, Skip or Interrupt. */
  status: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  recordsIn?: number | null;
  recordsOut?: number | null;
  tries?: number | null;
  onError?: string | null;
  statusMessage?: string | null;
  error?: StepError | string | null;
  datasets?: StepDataset[];
  /** "step": the step's own lines (stepLogs); "run": a legacy run, whose lines are the run's audit log. */
  log: 'step' | 'run';
}

/** What an AI step of the run asked for and ran on (run_ai_step): the run's AI trace. */
export interface RunAiStep {
  jobQueueId?: number;
  attempt?: number;
  stepKey: string;
  runIn?: string;
  promptId?: number | null;
  promptVersion?: number | null;
  modelProfile?: string | null;
  profileSource?: string | null;
  outcome?: string | null;
  model?: string | null;
  connectionId?: number | null;
  modelOptionId?: number | null;
  modelChoice?: string | null;
  reused?: boolean;
  error?: string | null;
  dateCreated?: string | null;
}

export interface StepTimeline {
  jobQueueId: number;
  jobId: number;
  runStatus?: string | null;
  attempt: number;
  attempts: number[];
  legacy: boolean;
  pipelineDefinitionId?: number | null;
  steps: StepExecution[];
  aiSteps?: RunAiStep[];
}

export interface StepLogLine {
  lineNo: number;
  level?: string | null;
  message: string;
  loggedAt?: string | null;
}

/**
 * The timeline worth drawing, or null. A legacy run, a run with no steps, and anything that is not a timeline (an
 * empty list is what an unknown endpoint answers in the characterisation fixtures) all read as "nothing to add".
 */
export function engineTimeline(data: unknown): StepTimeline | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const timeline = data as StepTimeline;
  if (timeline.legacy !== false || !Array.isArray(timeline.steps) || !timeline.steps.length) return null;
  if (timeline.steps.every(step => step.log !== 'step')) return null;
  return timeline;
}

/** "3 → 3", "— → 3": records in and out, a dash for a count the step did not report. */
export function recordsLabel(step: StepExecution): string {
  const count = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value.toLocaleString('en-GB'));
  return `${count(step.recordsIn)} → ${count(step.recordsOut)}`;
}

/** The step's error as one sentence: the engine stores {message, tries, timedOut}, an older row a bare string. */
export function errorText(step: StepExecution): string {
  const error = step.error;
  if (!error) return '';
  if (typeof error === 'string') return error;
  const message = error.message ?? '';
  return error.timedOut ? `${message} (timed out)`.trim() : message;
}

/** The step a person most likely opened the run for: the first that failed, else the first that is still going, else the first. */
export function focusStep(steps: StepExecution[]): StepExecution | null {
  const logged = steps.filter(step => step.log === 'step' && step.stepExecutionId !== null);
  return logged.find(step => step.status === 'Failed')
    ?? logged.find(step => step.status === 'Running')
    ?? logged[0]
    ?? null;
}

/** Statuses a step can still leave: while any step holds one the timeline is re-read with the run's own poll. */
export function stepStillGoing(status: string | null | undefined): boolean {
  return status === 'Queue' || status === 'Start' || status === 'Running';
}
