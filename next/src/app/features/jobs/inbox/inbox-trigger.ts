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
}

export interface InboxArrival {
  arrivalId: string;
  bucket?: string;
  key?: string;
  fileName: string;
  bytes?: number | null;
  /** Started (jobQueueId is its run) or Skipped (reason says why). */
  outcome: 'Started' | 'Skipped' | string;
  reason?: string | null;
  jobQueueId?: number | null;
  dateCreated?: string | null;
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
  return trigger.filePattern
    ? `Every file named like ${trigger.filePattern} that arrives in the inbox starts this job.`
    : 'Every file that arrives in the inbox starts this job.';
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
