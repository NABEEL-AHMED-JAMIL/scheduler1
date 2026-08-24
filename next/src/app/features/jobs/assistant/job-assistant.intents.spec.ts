import { describe, it, expect } from 'vitest';
import { classify, PRESETS } from './job-assistant.intents';
import { JobFacts, JobRun, answerFor, computeStats, runsToCsv } from './job-assistant.answers';

const JOB = 1244;

const facts: JobFacts = {
  jobId: JOB,
  jobName: 'Batch Demo',
  jobStatus: 'Active',
  execution: 'Auto',
  taskName: 'Send Email Batch',
  bucket: 'etl-bucket',
  outputFolder: 'email-batch/output',
  schedule: { frequency: 'Daily', intervalValue: '1', startTime: '09:00:00', nextRunAt: '2026-09-01T09:00' },
};

const runs: JobRun[] = [
  { jobQueueId: 1, jobStatus: 'Completed', startTime: '2026-08-01T09:00:00', endTime: '2026-08-01T09:00:30' },
  { jobQueueId: 2, jobStatus: 'Completed', startTime: '2026-08-02T09:00:00', endTime: '2026-08-02T09:01:00' },
  { jobQueueId: 3, jobStatus: 'Failed', startTime: '2026-08-03T09:00:00', endTime: '2026-08-03T09:00:10',
    jobStatusMessage: 'All 3 email(s) failed to send' },
  { jobQueueId: 4, jobStatus: 'Skip', jobStatusMessage: 'Job skip, already in queue.' },
];

describe('scoping', () => {
  // The whole point of the assistant: it must not answer about a job it was not given.
  it('refuses a question naming a different job', () => {
    for (const q of ['what about job #1300', 'tell me about job 1300', 'compare with #999']) {
      const scoped = classify(q, JOB);
      expect(scoped.intent).toBe('out-of-scope');
    }
  });

  it('reports which job was asked about, so the refusal can name it', () => {
    expect(classify('how does job #1300 compare?', JOB).mentionedJobId).toBe(1300);
  });

  it('accepts a question naming its own job', () => {
    expect(classify(`what does job #${JOB} write?`, JOB).intent).toBe('target');
    expect(classify(`is job #${JOB} failing?`, JOB).intent).toBe('failures');
  });

  it.each([
    'show me all jobs',
    'list every job',
    'what about other tasks',
    'all tenants please',
    'how many users are there',
  ])('refuses fleet-wide question: %s', question => {
    expect(classify(question, JOB).intent).toBe('out-of-scope');
  });

  it('names the job it is bound to when it refuses', () => {
    const answer = answerFor('out-of-scope', facts, runs, 1300);
    expect(answer.refused).toBe(true);
    const text = answer.blocks.map(b => (b as any).text).join(' ');
    expect(text).toContain('#1244');
    expect(text).toContain('#1300');
  });
});

describe('intent matching', () => {
  it.each([
    ['when does it run next?', 'schedule'],
    ['how often does this run', 'schedule'],
    ['where does it write files', 'target'],
    ['which bucket does it use', 'target'],
    ['what has been failing', 'failures'],
    ['why did it error', 'failures'],
    ['show the run statistics', 'stats'],
    ['how many runs', 'stats'],
    ['recent run history', 'history'],
    ['summarise this job', 'summary'],
  ])('%s -> %s', (question, expected) => {
    expect(classify(question, JOB).intent).toBe(expected);
  });

  it('falls back to a guide rather than guessing', () => {
    expect(classify('asdfgh', JOB).intent).toBe('unknown');
    const answer = answerFor('unknown', facts, runs);
    expect((answer.blocks[0] as any).text).toContain('#1244');
  });

  it('every preset maps to an intent that produces blocks', () => {
    for (const preset of PRESETS) {
      expect(answerFor(preset.id, facts, runs).blocks.length).toBeGreaterThan(0);
    }
  });
});

describe('statistics', () => {
  it('counts each status', () => {
    const stats = computeStats(runs);
    expect(stats.total).toBe(4);
    expect(stats.byStatus).toEqual({ Completed: 2, Failed: 1, Skip: 1 });
  });

  it('rates success against runs that reached a verdict, not against every run', () => {
    // 2 completed of 3 finished. The skipped run never ran, so counting it would understate it.
    expect(computeStats(runs).successRate).toBe(67);
  });

  it('averages only runs that recorded both ends', () => {
    // 30s, 60s and 10s -- the skipped run has no times and must not count as zero.
    expect(computeStats(runs).averageSeconds).toBeCloseTo(33.3, 1);
    expect(computeStats(runs).longestSeconds).toBe(60);
  });

  it('reports nothing rather than zero when a job has never run', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.successRate).toBeNull();
    expect(stats.averageSeconds).toBeNull();
  });

  it('says so plainly when there is nothing to count', () => {
    const answer = answerFor('stats', facts, []);
    expect((answer.blocks[0] as any).text).toContain('never run');
  });
});

describe('failures', () => {
  it('groups identical messages and counts them', () => {
    const many: JobRun[] = [
      ...runs,
      { jobQueueId: 5, jobStatus: 'Failed', jobStatusMessage: 'All 3 email(s) failed to send' },
    ];
    const answer = answerFor('failures', facts, many);
    const factsBlock = answer.blocks.find(b => b.kind === 'facts') as any;
    expect(factsBlock.rows[0].label).toBe('2×');
  });

  it('says nothing failed rather than showing an empty table', () => {
    const clean = runs.filter(r => r.jobStatus !== 'Failed');
    const answer = answerFor('failures', facts, clean);
    expect((answer.blocks[0] as any).text).toContain('No run');
    expect(answer.blocks.some(b => b.kind === 'runs')).toBe(false);
  });
});

describe('csv export', () => {
  it('has a header and one row per run', () => {
    const lines = runsToCsv(facts, runs).split('\n');
    expect(lines[0]).toContain('Run,Job,Status');
    expect(lines).toHaveLength(runs.length + 1);
  });

  it('quotes a message containing a comma so the columns survive', () => {
    const csv = runsToCsv(facts, [
      { jobQueueId: 9, jobStatus: 'Failed', jobStatusMessage: 'failed, then failed again' },
    ]);
    expect(csv).toContain('"failed, then failed again"');
  });

  it('escapes an embedded quote by doubling it', () => {
    const csv = runsToCsv(facts, [
      { jobQueueId: 9, jobStatus: 'Failed', jobStatusMessage: 'said "no"' },
    ]);
    expect(csv).toContain('"said ""no"""');
  });

  it('leaves duration empty when a run never finished', () => {
    const csv = runsToCsv(facts, [{ jobQueueId: 9, jobStatus: 'Running', startTime: '2026-08-01T09:00:00' }]);
    // trailing empty duration and message rather than a zero that reads as instant
    expect(csv.split('\n')[1]).toMatch(/,,$/);
  });
});
