/**
 * MIG-345: retrying a failed run, as Core answers it -- sourceJob.json/retryPlan (what a retry would do, or why it cannot)
 * and sourceJob.json/retryRun (the retry itself: {jobQueueId, from: 'failed_step' | 'start'}).
 *
 * A retry is the run's next attempt, never a new run. "Retry from <step>" resumes at the step that failed: the steps
 * before it are not run again (their kept outputs are reused, and not billed twice). "Run again from the start" runs every
 * step again and is a workspace administrator's. Core decides both; the console only says what it answered.
 */

export type RetryFrom = 'failed_step' | 'start';

/** A step a resume would not run again. */
export interface ReusedStep {
  index: number;
  key: string;
  name?: string | null;
  task?: string | null;
  rowsOut?: number | null;
  /** When its kept output expires (Chicago wall clock); null when it wrote none (it passed its input on). */
  expiresAt?: string | null;
  inputFiles?: number;
}

export interface RetryPlan {
  jobQueueId: number;
  jobId: number;
  attempt: number;
  nextAttempt: number;
  resumable: boolean;
  /** The customer API's problem kind (pipeline-changed, input-changed, outputs-expired, …) and the reason in words. */
  refusalKind?: string | null;
  refusal?: string | null;
  fromIndex?: number | null;
  fromKey?: string | null;
  fromName?: string | null;
  definitionVersion?: number | null;
  ranVersion?: number | null;
  reused: ReusedStep[];
  inputFiles: number;
  inputsChecked?: boolean;
  restartable: boolean;
  restartRefusal?: string | null;
  /** On a refused retry: which was asked for. */
  mode?: string | null;
  /** UX review 2026-10-13: the backfill the run is part of -- its own Retry failed retries it, never these. */
  backfillId?: number | null;
}

/**
 * UX review 2026-10-13: a backfill's run is retried by its backfill (Runs › Backfills, Retry failed), with its date, in a
 * lane of its own -- Core refuses both of a run's retries. Every place that would offer them says this and links there.
 */
export function backfillRetryNote(backfillId: number): string {
  return `Part of backfill #${backfillId}: retry failed days from the backfill.`;
}

/** The backfill's detail on Runs › Backfills (its periods, and Retry failed). */
export function backfillLink(backfillId: number): { link: string; query: Record<string, string> } {
  return { link: '/runs/backfills', query: { backfill: String(backfillId) } };
}

/** An attempt someone asked for (run_attempt), as the run's timeline lists them. */
export interface AttemptDetail {
  attempt: number;
  previousAttempt: number;
  mode: 'resume' | 'restart' | string;
  fromStepIndex?: number | null;
  fromStepKey?: string | null;
  reusedSteps?: number;
  requestedVia?: 'console' | 'api' | 'platform' | string;
  requestedByUserId?: number | null;
  requestedBy?: string | null;
  requestedAt?: string | null;
}

/** The plan in an answer's data, or null when it is not one. */
export function planOf(data: unknown): RetryPlan | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const plan = data as RetryPlan;
  if (typeof plan.jobQueueId !== 'number' || typeof plan.resumable !== 'boolean') return null;
  return { ...plan, reused: Array.isArray(plan.reused) ? plan.reused : [], inputFiles: plan.inputFiles ?? 0 };
}

/** "step 3 <clean>", or "step 3 Clean rows <clean>" when the step has a name of its own. */
export function stepLabel(index: number | null | undefined, key: string | null | undefined, name?: string | null): string {
  const n = index === null || index === undefined ? '' : `step ${index + 1} `;
  const shownName = name && name !== key ? `${name} ` : '';
  return `${n}${shownName}<${key ?? '?'}>`.trim();
}

/** The resume button's words: "Retry from step 3 <clean>". */
export function resumeLabel(plan: Pick<RetryPlan, 'fromIndex' | 'fromKey'> | null | undefined): string {
  if (!plan || plan.fromIndex === null || plan.fromIndex === undefined) return 'Retry from the failed step';
  return `Retry from ${stepLabel(plan.fromIndex, plan.fromKey)}`;
}

/** One line for an attempt someone asked for: how it came about, by whom. */
export function attemptSentence(detail: AttemptDetail): string {
  const how = detail.mode === 'resume'
    ? `resumed from ${stepLabel(detail.fromStepIndex, detail.fromStepKey)}, reusing ${detail.reusedSteps ?? 0} `
      + `step${detail.reusedSteps === 1 ? '' : 's'} of attempt ${detail.previousAttempt}`
    : `run again from the start after attempt ${detail.previousAttempt} failed`;
  // Core names an API client "API client <id>"; a person by name.
  const who = detail.requestedBy ? ` by ${detail.requestedBy}` : detail.requestedVia === 'api' ? ' through the API'
    : detail.requestedVia === 'platform' ? ' automatically, after Core restarted while it ran' : '';
  return `Attempt ${detail.attempt}: ${how}${who}`;
}
