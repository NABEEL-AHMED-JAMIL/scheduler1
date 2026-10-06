import { describe, it, expect } from 'vitest';
import { runsToCsv, JobFacts } from './job-assistant.answers';
const facts = { jobId: 1, jobName: 'x' } as JobFacts;
describe('csv injection', () => {
  it.each(['=1+1', '+1', '-1+1', '@SUM(A1)', '=HYPERLINK("http://evil","click")'])(
    'neutralises a leading %s', payload => {
      const csv = runsToCsv(facts, [{ jobQueueId: 1, jobStatus: 'Failed', jobStatusMessage: payload }]);
      const cell = csv.split('\n')[1].split(',').pop() ?? '';
      expect(cell.replace(/^"/, '').startsWith(payload[0])).toBe(false);
    });
});
