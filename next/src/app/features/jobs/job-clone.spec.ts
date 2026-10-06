import { describe, it, expect } from 'vitest';
import { clonePayload } from './job-clone';

describe('clonePayload', () => {
  const source = {
    jobId: 41, jobName: 'Nightly export', taskDetail: { taskDetailId: 7 }, execution: 'Auto',
    priority: 3, jobStatus: 'Active', completeJob: true, failJob: true, skipJob: false,
    maxAttempts: 4, retryBackoffSeconds: 300,
    scheduler: { startDate: '2026-09-01', endDate: null, startTime: '02:00', frequency: 'Daily',
                 intervalValue: 1, daysOfWeek: null, dayOfMonth: null },
  };

  /** The copy fell back to one attempt: a job set to retry four times silently stopped retrying. */
  it('keeps the retry policy', () => {
    const copy = clonePayload(source);
    expect(copy.maxAttempts).toBe(4);
    expect(copy.retryBackoffSeconds).toBe(300);
  });

  it('is a new, inactive job with a name that tells it apart', () => {
    const copy = clonePayload(source);
    expect(copy.jobId).toBeUndefined();
    expect(copy.jobName).toBe('Nightly export (copy)');
    expect(copy.jobStatus).toBe('Inactive');
  });

  it('keeps the task, execution, priority, notifications and schedule', () => {
    const copy = clonePayload(source);
    expect(copy.taskDetail).toEqual({ taskDetailId: 7 });
    expect([copy.execution, copy.priority]).toEqual(['Auto', 3]);
    expect([copy.completeJob, copy.failJob, copy.skipJob]).toEqual([true, true, false]);
    expect(copy.schedulers).toEqual([{ startDate: '2026-09-01', endDate: null, startTime: '02:00',
      frequency: 'Daily', intervalValue: 1, daysOfWeek: null, dayOfMonth: null }]);
  });

  it('sends no schedule for a job that has none', () => {
    expect(clonePayload({ ...source, scheduler: null }).schedulers).toBeUndefined();
  });
});
