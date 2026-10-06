/**
 * Telling a slow run apart from one that has stopped reporting.
 *
 * A run that never reports back leaves its job showing Queue, Start or Running for ever, and
 * nothing on screen says anything is wrong. That is not hypothetical: a worker holding a stale
 * callback token did all of its work and wrote every output file, but each status callback was
 * rejected with 401, so the job sat in Start looking busy while being entirely finished.
 *
 * MIG-63: the verdict is the server's. The thirty-minute rule that used to live here now lives in
 * process (process.util.RunStall) and every SourceJobDto carries it as `stalled`. This file only
 * reads that flag and words the badge; it does not judge a run itself, so the console and the
 * server can never disagree about which runs are stalled.
 *
 * The clock is a parameter rather than a call to `Date.now()` inside the wording, so the age can
 * be tested exactly instead of by waiting.
 */

import { instantMs } from '../../core/instant';

/** A run has been dispatched and has not yet reported a verdict. */
export const IN_FLIGHT = ['queue', 'start', 'running'];

/** Only the fields the badge needs, so run rows work as well as job rows. */
export interface StallCandidate {
  /** The server's verdict (SourceJobDto.stalled). Absent means the server gave none. */
  stalled?: boolean | null;
  jobRunningStatus?: string | null;
  lastJobRun?: string | null;
}

/** Whether a manual run or skip would collide with a run already under way. Not a stall check. */
export function isInFlight(job: StallCandidate): boolean {
  return IN_FLIGHT.includes((job.jobRunningStatus ?? '').toLowerCase());
}

/** The server's stall verdict, and nothing else. */
export function isStalled(job: StallCandidate): boolean {
  return job.stalled === true;
}

/**
 * How long since the run last reported, in the roundest unit that still tells you something --
 * wording for a badge the server has already decided to show. Empty when the age cannot be said:
 * no timestamp, an unparseable one, or one in the future from this browser's clock.
 *
 * Through instantMs, which reads an offset-less timestamp in the zone the server pins rather
 * than in the reader's own; `new Date(...)` would put the age hours out for anyone elsewhere.
 */
export function stalledFor(job: StallCandidate, now: number = Date.now()): string {
  if (!job.lastJobRun) return '';
  const started = instantMs(job.lastJobRun);
  if (started === null) return '';
  const elapsed = now - started;
  if (elapsed < 0) return '';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 120) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * The Stalled badge's tooltip. The server judged the run on its own clock, so this browser may be
 * unable to measure the age (a drifting clock puts lastJobRun in the future); the sentence then
 * falls back to the threshold the server applies rather than reading "No update for .".
 */
export function stallHint(job: StallCandidate, now: number = Date.now()): string {
  const age = stalledFor(job, now) || 'over half an hour';
  return `No update for ${age}. The worker may have stopped reporting — check its logs and its callback token.`;
}
