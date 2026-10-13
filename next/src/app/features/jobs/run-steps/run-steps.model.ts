import { AttemptDetail } from '../retry/run-retry';

/**
 * MIG-251: what Core's step engine (MIG-230) says about one run, as sourceJob.json/stepExecutions answers it, and the
 * few readings the Executions screens make of it.
 *
 * A run the step engine did not take -- every run before MIG-230, and every job whose task still dispatches to a worker
 * -- answers `legacy: true` with one step whose log is the run's own ("run"). Those runs keep today's screen exactly:
 * nothing here is drawn for them.
 */

/** One dataset a step wrote (run_dataset). Wave 4: it downloads as csv, json or jsonl (sourceJob.json/runDataset). */
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
  /** The step's name in its pipeline ("Vision model: DRAFT label"); null when it has none. */
  name?: string | null;
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
  /** MIG-345: a step a resumed attempt did not run again -- the attempt whose output it reused; null for a step that ran. */
  reusedFromAttempt?: number | null;
  /** MIG-346: an Approval step's request -- waiting, or how it was decided (times are UTC instants). */
  approval?: StepApproval | null;
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

/** MIG-346: an Approval step's request: PENDING while the run waits; APPROVED, REJECTED, EXPIRED or CANCELLED once settled. */
export interface StepApproval {
  approvalId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | string;
  waiting: boolean;
  title?: string | null;
  reviewers?: { kind?: string | null; value?: string | null } | null;
  requestedAt?: string | null;
  expiresAt?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  /** Who decided, for their picture. */
  decidedByUserId?: number | null;
  comment?: string | null;
}

/**
 * MIG-346: who an approval goes to, in words -- a group by its name when the reader may read it ("the Reviewer group"),
 * else "the pipeline's reviewer group"; never its id (run page polish 2026-10-12).
 */
export function approvalReviewers(approval: StepApproval, groupNames: ReadonlyMap<string, string> = new Map()): string {
  const who = approval.reviewers;
  if (!who?.kind) return 'the workspace administrators';
  if (who.kind === 'role') return who.value === 'TENANT_USER' ? 'the workspace users' : 'the workspace administrators';
  const name = who.value ? groupNames.get(String(who.value)) : undefined;
  return name ? `the ${name} group` : 'the pipeline\'s reviewer group';
}

/** MIG-346: an approval's outcome as a sentence ("Approved by Ana Ruiz (user 4641): totals match"). */
export function approvalOutcome(approval: StepApproval, groupNames?: ReadonlyMap<string, string>): string {
  const said = approval.comment ? `: ${approval.comment}` : '';
  switch (approval.status) {
    case 'APPROVED': return `Approved by ${approval.decidedBy ?? 'a reviewer'}${said}`;
    case 'REJECTED': return `Rejected by ${approval.decidedBy ?? 'a reviewer'}${said}`;
    case 'EXPIRED': return 'Nobody decided in time; the request expired';
    case 'CANCELLED': return 'The run was closed before anyone decided';
    default: return `Waiting for approval by ${approvalReviewers(approval, groupNames)} in Review`;
  }
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
  /** MIG-345: the run's attempts someone asked for (a resume or a restart), oldest first. */
  attemptDetails?: AttemptDetail[];
  /** MIG-346: the run waits at an Approval step of this attempt. */
  waitingForApproval?: boolean;
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

/** Wave 4: the formats sourceJob.json/runDataset writes a dataset in. */
export type DatasetFormat = 'csv' | 'json' | 'jsonl' | 'pdf';
export const DATASET_FORMATS: { id: DatasetFormat; label: string }[] = [
  { id: 'csv', label: 'CSV' }, { id: 'json', label: 'JSON' }, { id: 'jsonl', label: 'JSONL' },
];

/** MIG-255: a report (render_pdf) is a PDF, not rows -- it downloads only as itself. */
export const PDF_FORMAT: { id: DatasetFormat; label: string }[] = [{ id: 'pdf', label: 'PDF' }];

/** The formats a kept file or dataset offers: a PDF report only as its PDF, anything else as rows. */
export function formatsFor(name: string, format?: string | null): { id: DatasetFormat; label: string }[] {
  return format === 'pdf' || /\.pdf$/i.test(name) ? PDF_FORMAT : DATASET_FORMATS;
}

/**
 * One thing a run put out (run_output, sourceJob.json/runOutputs): a file it kept ("file", downloadable through its
 * dataset until it expires) or an upload to a bucket ("bucket", downloadable from storage by alias and key).
 */
export interface RunOutput {
  runOutputId: number;
  stepExecutionId?: number | null;
  attempt?: number | null;
  stepIndex?: number | null;
  stepKey?: string | null;
  task?: string | null;
  kind: 'file' | 'bucket';
  name: string;
  format?: string | null;
  rowCount?: number | null;
  byteCount?: number | null;
  /** ADR-027: a PDF's pages (render_pdf); null for any other file. */
  pageCount?: number | null;
  recordedAt?: string | null;
  runDatasetId?: number | null;
  expiresAt?: string | null;
  expired?: boolean | null;
  bucket?: string | null;
  key?: string | null;
}

/** The outputs in an answer, or null for anything that is not one. */
export function outputsOf(data: unknown): RunOutput[] | null {
  const outputs = (data as { outputs?: unknown } | null)?.outputs;
  return Array.isArray(outputs) ? outputs as RunOutput[] : null;
}

/** The file name in a Content-Disposition header ("attachment; filename=..." or filename*=UTF-8''...); '' for none. */
export function attachmentName(disposition: string | null | undefined): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

/**
 * MIG-345: the step a retry of this attempt would resume from -- the first that did not complete -- when the run failed
 * on the latest attempt; null otherwise (Core decides whether it can, and says why not).
 */
export function failedStep(timeline: StepTimeline | null | undefined): StepExecution | null {
  if (!timeline || timeline.runStatus !== 'Failed') return null;
  const latest = Math.max(...(timeline.attempts?.length ? timeline.attempts : [timeline.attempt]));
  if (timeline.attempt !== latest) return null;
  return timeline.steps.find(step => step.status !== 'Completed') ?? null;
}
