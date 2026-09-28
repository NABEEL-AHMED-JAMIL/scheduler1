import { describe, it, expect } from 'vitest';
import { JobFacts, JobRun, answerFor } from './job-assistant.answers';

/**
 * The assistant's sentences were assembled from raw fields: "It runs weeks at 09:30." for a weekly
 * job, "every 1" on the Frequency row, the next run as a raw ISO stamp, "1 runs recorded", and a
 * "most common first" list that never grouped because every failure message carries its own run id.
 */
const weekly: JobFacts = {
  jobId: 2836, jobName: 'weekly load', jobStatus: 'Active', execution: 'Auto',
  schedule: { frequency: 'Weekly', intervalValue: '1', startTime: '09:30:00', daysOfWeek: 'MON,WED,FRI',
              nextRunAt: '2026-09-28T09:30:00' },
};

const textOf = (answer: ReturnType<typeof answerFor>) =>
  answer.blocks.filter(b => b.kind === 'text').map(b => (b as { text: string }).text).join(' ');
const rowsOf = (answer: ReturnType<typeof answerFor>) =>
  (answer.blocks.find(b => b.kind === 'facts') as { rows: { label: string; value: string }[] }).rows;

describe('the schedule, in words', () => {
  it('says "every week on Mon, Wed, Fri" for a weekly job pinned to days', () => {
    expect(textOf(answerFor('schedule', weekly, []))).toBe('It runs every week on Mon, Wed, Fri at 09:30.');
  });

  it('counts a longer interval in plural units', () => {
    const fortnightly = { ...weekly, schedule: { ...weekly.schedule!, intervalValue: '2', daysOfWeek: undefined } };
    expect(textOf(answerFor('schedule', fortnightly, []))).toBe('It runs every 2 weeks at 09:30.');
  });

  it('names the day of a monthly job', () => {
    const monthly = { ...weekly, schedule: { frequency: 'Monthly', intervalValue: '1', startTime: '06:00', dayOfMonth: 0 } };
    expect(textOf(answerFor('schedule', monthly, []))).toBe('It runs every month on the last day at 06:00.');
  });

  it('reads the same in the expired sentence', () => {
    const expired = { ...weekly, schedule: { ...weekly.schedule!, expired: true } };
    expect(textOf(answerFor('schedule', expired, [])))
      .toBe('The schedule has expired — it ran every week on Mon, Wed, Fri at 09:30 and will not run again.');
  });

  it('drops "every 1" from the Frequency row and names the days', () => {
    expect(rowsOf(answerFor('schedule', weekly, [])).find(r => r.label === 'Frequency')!.value).toBe('Weekly on Mon, Wed, Fri');
  });

  it('formats the next run like every other time', () => {
    // A Chicago wall-clock stamp, read as such (the test zone is the server's).
    expect(rowsOf(answerFor('schedule', weekly, [])).find(r => r.label === 'Next run')!.value).toBe('28 Sep 2026, 09:30');
  });
});

describe('counts in the singular', () => {
  const one: JobRun[] = [{ jobQueueId: 7359, jobStatus: 'Failed', jobStatusMessage: 'boom' }];

  it('says "1 run recorded"', () => {
    expect(textOf(answerFor('history', weekly, one))).toBe('1 run recorded, most recent first.');
  });

  it('says "1 of 1 run failed"', () => {
    expect(textOf(answerFor('failures', weekly, one))).toContain('1 of 1 run failed.');
  });
});

describe('failure reasons, grouped', () => {
  it('groups messages that differ only by their run id', () => {
    const runs: JobRun[] = [7400, 7399, 7398, 7397, 7396].map(id => ({
      jobQueueId: id, jobStatus: 'Failed',
      jobStatusMessage: `Input CSV not found: etl-bucket/in/run-${id}/orders.csv (run #${id})`,
    }));
    const rows = rowsOf(answerFor('failures', weekly, runs));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('5×');
    // The newest real message, not the grouping key.
    expect(rows[0].value).toBe('Input CSV not found: etl-bucket/in/run-7400/orders.csv (run #7400)');
  });
});

/**
 * MIG-295 (UI review jobs#10/#11): the schedule's Starts and Ends rows printed the API's
 * "2026-09-01" under a Next run row that read "28 Sep 2026, 09:30", and "Runs take 1m 0s".
 */
describe('the schedule and run lengths, on the console clock', () => {
  it('writes the start and end days as the rest of the console does', () => {
    const dated = { ...weekly, schedule: { ...weekly.schedule!, startDate: '2026-09-01', endDate: '2027-03-31' } };
    const rows = rowsOf(answerFor('schedule', dated, []));
    expect(rows.find(r => r.label === 'Starts')?.value).toBe('1 Sep 2026 at 09:30');
    expect(rows.find(r => r.label === 'Ends')?.value).toBe('31 Mar 2027');
  });

  it('says how long runs take with the shared duration format', () => {
    const runs: JobRun[] = [
      { jobQueueId: 1, jobStatus: 'Completed', startTime: '2026-09-01T09:00:00', endTime: '2026-09-01T09:01:00' },
    ];
    expect(textOf(answerFor('stats', weekly, runs))).toContain('Runs take 1m on average.');
  });
});
