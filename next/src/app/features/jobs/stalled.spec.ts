import { describe, it, expect } from 'vitest';
import { isInFlight, isStalled, stalledFor, stallHint } from './stalled';

const NOW = new Date('2026-08-24T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
/**
 * The same instant in the format the API actually sends: Java LocalDateTime, no offset, written
 * in the zone ModelApplication pins (America/Chicago). The age in the tooltip has to be read from
 * this format, not only from a Z-suffixed string the REST API never produces.
 */
const agoAsTheApiSendsIt = (ms: number) => {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(new Date(NOW - ms))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return `${parts['year']}-${parts['month']}-${parts['day']}`
    + `T${String(Number(parts['hour']) % 24).padStart(2, '0')}:${parts['minute']}:${parts['second']}`;
};
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

/**
 * MIG-63: the verdict is the server's (process.util.RunStall, serialised on every SourceJobDto
 * as `stalled`). The console used to run its own copy of the thirty-minute rule; two copies of
 * one rule is two chances to disagree, so the console now only reads the flag.
 */
describe('stall verdict comes from the server', () => {
  it('shows a run the server marks stalled, even when the timestamps say it is fresh', () => {
    expect(isStalled({ stalled: true, jobRunningStatus: 'Start', lastJobRun: ago(2 * MINUTE) })).toBe(true);
  });

  it('shows a run the server marks stalled, even when the status looks finished', () => {
    expect(isStalled({ stalled: true, jobRunningStatus: 'Completed', lastJobRun: ago(HOUR) })).toBe(true);
  });

  it('does not show a run the server clears, however long the timestamps say it has been quiet', () => {
    // job 1193's shape -- in Start for six hours -- which the old client rule would have flagged.
    expect(isStalled({ stalled: false, jobRunningStatus: 'Start', lastJobRun: ago(6 * HOUR) })).toBe(false);
  });

  it('does not invent a verdict when the server sent none', () => {
    expect(isStalled({ jobRunningStatus: 'Running', lastJobRun: ago(10 * 24 * HOUR) })).toBe(false);
    expect(isStalled({ stalled: null, jobRunningStatus: 'Running', lastJobRun: ago(10 * 24 * HOUR) })).toBe(false);
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
    expect(stalledFor({ lastJobRun: ago(elapsed) }, NOW)).toBe(expected);
  });

  it('reads the API\'s own offset-less format as the same age', () => {
    expect(stalledFor({ lastJobRun: agoAsTheApiSendsIt(45 * MINUTE) }, NOW)).toBe('45 minutes');
  });

  it('is empty when there is no age to report', () => {
    expect(stalledFor({ lastJobRun: null }, NOW)).toBe('');
    expect(stalledFor({}, NOW)).toBe('');
    expect(stalledFor({ lastJobRun: 'not a date' }, NOW)).toBe('');
    // A clock disagreement between this browser and the server is not a negative age.
    expect(stalledFor({ lastJobRun: new Date(NOW + 5 * HOUR).toISOString() }, NOW)).toBe('');
  });
});

describe('badge tooltip', () => {
  it('reads exactly as before for a run the server flagged', () => {
    expect(stallHint({ stalled: true, jobRunningStatus: 'Start', lastJobRun: ago(6 * HOUR) }, NOW)).toBe(
      'No update for 6 hours. The worker may have stopped reporting — check its logs and its callback token.');
  });

  it('never says "for ." when this browser cannot measure the age the server judged', () => {
    // The server decided on its own clock; a drifting browser clock can put lastJobRun in the
    // future from here, which is no reason to print a broken sentence.
    expect(stallHint({ stalled: true, lastJobRun: new Date(NOW + HOUR).toISOString() }, NOW)).toBe(
      'No update for over half an hour. The worker may have stopped reporting — check its logs and its callback token.');
  });
});
