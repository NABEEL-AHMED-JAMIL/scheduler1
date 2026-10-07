/**
 * MIG-251 on MIG-239: a job's inbox trigger -- the "Event" way to start a job: when a file arrives in the workspace's
 * inbox -- and what the inbox's files did to the job, as Core's sourceJob.json/inboxTrigger and inboxArrivals answer.
 */

export interface InboxTrigger {
  jobId: number;
  configured: boolean;
  enabled?: boolean;
  /** A glob on the arriving file's name ('*' any run, '?' one character); absent for every file. */
  filePattern?: string | null;
  dateUpdated?: string | null;
  /** MIG-360: how many files that waited one run takes (1: a run per file). */
  batchSize?: number | null;
  /** MIG-360: how many files wait for the job's next run now. */
  waiting?: number | null;
}

export interface InboxArrival {
  arrivalId: string;
  bucket?: string;
  key?: string;
  fileName: string;
  bytes?: number | null;
  /** Started (jobQueueId is its run), Waiting (MIG-360: for the run in flight to end; place is its turn) or Skipped (reason says why). */
  outcome: 'Started' | 'Waiting' | 'Skipped' | string;
  reason?: string | null;
  jobQueueId?: number | null;
  dateCreated?: string | null;
  /** MIG-360: a waiting file's place in the line -- 1 is taken by the next run. */
  place?: number | null;
  startedAt?: string | null;
}

/** The trigger, or null when the answer is not one (an unknown endpoint answers an empty list). */
export function triggerOf(data: unknown): InboxTrigger | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as InboxTrigger;
}

/** Only the arrivals that are arrivals: anything else in the answer is dropped rather than drawn. */
export function arrivalsOf(data: unknown): InboxArrival[] {
  return Array.isArray(data) ? data.filter(a => a && typeof a === 'object' && typeof a.fileName === 'string') : [];
}

/** The trigger in one sentence, in the words Core's save answers with. */
export function triggerSentence(trigger: InboxTrigger | null | undefined): string {
  if (!trigger?.configured) return 'No file in the inbox starts this job.';
  if (trigger.enabled === false) return 'The inbox trigger is off: files that arrive do not start this job.';
  const files = trigger.filePattern
    ? `Every file named like ${trigger.filePattern} that arrives in the inbox starts this job.`
    : 'Every file that arrives in the inbox starts this job.';
  const batch = Number(trigger.batchSize ?? 1);
  return batch > 1 ? `${files} Files that arrive while a run is going wait; the next run takes up to ${batch} of them.` : files;
}

/** MIG-360: how many files wait for the job's next run, or '' when none do. */
export function waitingSentence(trigger: InboxTrigger | null | undefined): string {
  const waiting = Number(trigger?.waiting ?? 0);
  if (!waiting) return '';
  return waiting === 1 ? '1 file waits for the run in flight to end.' : `${waiting} files wait for the run in flight to end, in the order they arrived.`;
}

/** MIG-360: how many files one run may take. */
export const BATCH_MAX = 50;
export function batchProblem(batch: number | string | null | undefined): string {
  const value = Number(batch);
  return Number.isInteger(value) && value >= 1 && value <= BATCH_MAX ? '' : `Files per run is a whole number from 1 to ${BATCH_MAX}.`;
}

/** Each run a file started, by its run id. */
export function runsStartedByFile(arrivals: InboxArrival[]): Map<number, InboxArrival> {
  const map = new Map<number, InboxArrival>();
  for (const arrival of arrivals) {
    if (arrival.outcome === 'Started' && arrival.jobQueueId) map.set(Number(arrival.jobQueueId), arrival);
  }
  return map;
}

/** Core's pattern rule, checked before the round trip: a file's name, never a folder, at most 255 characters. */
export const PATTERN_MAX = 255;
export function patternProblem(pattern: string | null | undefined): string {
  const value = (pattern ?? '').trim();
  if (!value) return '';
  if (/[\\/]/.test(value) || value.includes('..')) return 'A file pattern matches the file\'s name, not a folder: use e.g. *.csv or invoices_*.pdf.';
  if (value.length > PATTERN_MAX) return `A file pattern is at most ${PATTERN_MAX} characters.`;
  return '';
}
