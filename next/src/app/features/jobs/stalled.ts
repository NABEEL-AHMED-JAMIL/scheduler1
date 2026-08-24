/**
 * Telling a slow run apart from one that has stopped reporting.
 *
 * A run that never reports back leaves its job showing Queue, Start or Running for ever, and
 * nothing on screen says anything is wrong. That is not hypothetical: a worker holding a stale
 * callback token did all of its work and wrote every output file, but each status callback was
 * rejected with 401, so the job sat in Start looking busy while being entirely finished.
 *
 * The clock is a parameter rather than a call to `Date.now()` inside the check, so the threshold
 * can be tested at an exact age instead of by waiting half an hour.
 */

/** A run has been dispatched and has not yet reported a verdict. */
export const IN_FLIGHT = ['queue', 'start', 'running'];

/** Far longer than any run here takes, so crossing it means quiet rather than slow. */
export const STALLED_AFTER_MS = 30 * 60 * 1000;

/** Only the two fields the judgement needs, so run rows work as well as job rows. */
export interface StallCandidate {
  jobRunningStatus?: string | null;
  lastJobRun?: string | null;
}

export function isInFlight(job: StallCandidate): boolean {
  return IN_FLIGHT.includes((job.jobRunningStatus ?? '').toLowerCase());
}

/**
 * How long the run has been in flight, or null when that cannot be said: it is not in flight,
 * it has no start time, the start time is unparseable, or it starts in the future. A future
 * start is a clock disagreement between the app and the database, not a stall, and calling it
 * one would flag every job on a host whose timezone drifts.
 */
export function inFlightFor(job: StallCandidate, now: number = Date.now()): number | null {
  if (!isInFlight(job) || !job.lastJobRun) return null;
  const started = new Date(job.lastJobRun).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsed = now - started;
  return elapsed < 0 ? null : elapsed;
}

export function isStalled(job: StallCandidate, now: number = Date.now()): boolean {
  const elapsed = inFlightFor(job, now);
  return elapsed !== null && elapsed > STALLED_AFTER_MS;
}

/** The age in the roundest unit that still tells you something. */
export function stalledFor(job: StallCandidate, now: number = Date.now()): string {
  const elapsed = inFlightFor(job, now);
  if (elapsed === null) return '';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 120) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
