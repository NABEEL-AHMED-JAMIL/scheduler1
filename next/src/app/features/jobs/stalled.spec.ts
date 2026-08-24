import { describe, it, expect } from 'vitest';
import { STALLED_AFTER_MS, isInFlight, isStalled, inFlightFor, stalledFor } from './stalled';

const NOW = new Date('2026-08-24T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('in flight', () => {
  it.each(['Queue', 'Start', 'Running', 'running', 'START'])('%s is in flight', status => {
    expect(isInFlight({ jobRunningStatus: status })).toBe(true);
  });

  it.each(['Completed', 'Failed', 'Skip', 'Missed', 'Interrupt', '', null, undefined])(
    '%s is not in flight', status => {
      expect(isInFlight({ jobRunningStatus: status })).toBe(false);
    });
});

describe('stall detection', () => {
  it('does not accuse a run that is merely slow', () => {
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: ago(29 * MINUTE) }, NOW)).toBe(false);
  });

  it('flags a run once it passes the threshold', () => {
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: ago(31 * MINUTE) }, NOW)).toBe(true);
  });

  it('treats the threshold itself as not yet stalled', () => {
    // Exactly at the boundary the run has had precisely its allowance and no more.
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: ago(STALLED_AFTER_MS) }, NOW)).toBe(false);
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: ago(STALLED_AFTER_MS + 1) }, NOW)).toBe(true);
  });

  it('never flags a finished run, however old', () => {
    // The whole point: an old Completed run is history, not a problem.
    for (const status of ['Completed', 'Failed', 'Skip']) {
      expect(isStalled({ jobRunningStatus: status, lastJobRun: ago(10 * 24 * HOUR) }, NOW)).toBe(false);
    }
  });

  it('says nothing when there is no start time to measure from', () => {
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: null }, NOW)).toBe(false);
    expect(isStalled({ jobRunningStatus: 'Start' }, NOW)).toBe(false);
  });

  it('ignores an unparseable timestamp rather than flagging on NaN', () => {
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: 'not a date' }, NOW)).toBe(false);
  });

  it('does not flag a run that claims to start in the future', () => {
    // A clock or timezone disagreement between app and database, not a stalled worker --
    // and flagging it would light up every row on a host whose zone is offset.
    const future = new Date(NOW + 5 * HOUR).toISOString();
    expect(isStalled({ jobRunningStatus: 'Start', lastJobRun: future }, NOW)).toBe(false);
    expect(inFlightFor({ jobRunningStatus: 'Start', lastJobRun: future }, NOW)).toBeNull();
  });
});

describe('age wording', () => {
  it.each([
    [1 * MINUTE, '1 minute'],
    [45 * MINUTE, '45 minutes'],
    [3 * HOUR, '3 hours'],
    [47 * HOUR, '47 hours'],
    [72 * HOUR, '3 days'],
    [24 * HOUR + 30 * MINUTE, '24 hours'],
  ])('%dms reads as %s', (elapsed, expected) => {
    expect(stalledFor({ jobRunningStatus: 'Start', lastJobRun: ago(elapsed) }, NOW)).toBe(expected);
  });

  it('is empty when there is nothing to report, so no tooltip says "for "', () => {
    expect(stalledFor({ jobRunningStatus: 'Completed', lastJobRun: ago(HOUR) }, NOW)).toBe('');
    expect(stalledFor({ jobRunningStatus: 'Start', lastJobRun: null }, NOW)).toBe('');
  });
});

describe('the run this was built for', () => {
  it('flags job 1193: dispatched, worked, but every callback rejected', () => {
    // The worker finished and wrote 52 files; the run stayed in Start because each status
    // callback came back 401. Six hours in flight with no update is the shape of that failure.
    const job = { jobRunningStatus: 'Start', lastJobRun: ago(6 * HOUR) };
    expect(isStalled(job, NOW)).toBe(true);
    expect(stalledFor(job, NOW)).toBe('6 hours');
  });
});
