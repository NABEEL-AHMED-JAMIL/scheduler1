import { describe, it, expect } from 'vitest';
import { StepTimeline } from './run-steps.model';
import { approvalGroups, approvalRoute, fromNow, liveDuration, reviewersWords, spanWords, waitingApproval } from './run-approval.model';

/**
 * Run page polish 2026-10-12: a run waiting at an Approval step says where it waits, who it waits on by the group's name,
 * since when and until when, and how long it has waited -- live -- instead of "Still running" and a dash.
 */
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-13T10:15:00Z');
const APPROVAL = { approvalId: 1006, status: 'PENDING', waiting: true, title: 'Approve 3 bulk-review test rows of run 8298',
  reviewers: { kind: 'group', value: '1063' }, requestedAt: new Date(NOW - 7 * HOUR - 5 * 60_000).toISOString(),
  expiresAt: new Date(NOW + 65 * HOUR).toISOString() };
const TIMELINE = { jobQueueId: 8298, jobId: 2977, runStatus: 'Running', attempt: 1, attempts: [1], legacy: false, waitingForApproval: true,
  steps: [
    { stepExecutionId: 1, index: 0, key: 'rows', task: 'sample', status: 'Completed', log: 'step' },
    { stepExecutionId: 2, index: 1, key: 'approve', name: 'Approve the test rows', task: 'approval', status: 'Running', log: 'step', approval: APPROVAL },
    { stepExecutionId: 3, index: 2, key: 'save', task: 'save_file', status: 'Queue', log: 'step' },
  ] } as StepTimeline;

describe('A run waiting at an Approval step', () => {
  it('finds the step it waits at and its request', () => {
    const w = waitingApproval(TIMELINE)!;
    expect(w.step.key).toBe('approve');
    expect(w.approval.approvalId).toBe(1006);
    const decided = { ...TIMELINE, steps: TIMELINE.steps.map(s => s.approval ? { ...s, approval: { ...APPROVAL, status: 'APPROVED', waiting: false } } : s) };
    expect(waitingApproval(decided)).toBeNull();
    expect(waitingApproval(null)).toBeNull();
  });

  it('names the group, never its id; a role as its people; an unreadable group plainly', () => {
    const names = new Map([['1063', 'Reviewer']]);
    expect(reviewersWords({ kind: 'group', value: '1063' }, names)).toBe('the Reviewer group');
    expect(reviewersWords({ kind: 'group', value: '1063' }, new Map())).toBe('the pipeline\'s reviewer group');
    expect(reviewersWords({ kind: 'role', value: 'TENANT_USER' }, names)).toBe('the workspace users');
    expect(reviewersWords({ kind: 'role', value: 'TENANT_ADMIN' }, names)).toBe('the workspace administrators');
    expect(reviewersWords(null, names)).toBe('the workspace administrators');
    expect(approvalGroups(TIMELINE)).toEqual(['1063']);
  });

  it('says a span coarsely, and a moment next to now', () => {
    expect([spanWords(20_000), spanWords(45 * 60_000), spanWords(7 * HOUR + 5 * 60_000), spanWords(65 * HOUR), spanWords(48 * HOUR)])
      .toEqual(['<1 min', '45 min', '7 h', '2 d 17 h', '2 d']);
    expect(fromNow(APPROVAL.requestedAt, NOW)).toBe('7 h ago');
    expect(fromNow(APPROVAL.expiresAt, NOW)).toBe('in 2 d 17 h');
    expect(fromNow(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now');
    expect(fromNow(null, NOW)).toBe('');
  });

  it('counts the wait, live, while the run waits; the run\'s own time otherwise', () => {
    const waiting = waitingApproval(TIMELINE);
    expect(liveDuration('2026-10-13 00:00:00', waiting, NOW)).toBe('Running · waiting 7 h');
    expect(liveDuration('2026-10-13 00:00:00', waiting, NOW + HOUR)).toBe('Running · waiting 8 h');
    // Naive times are Chicago wall-clock: 05:00 there is 10:00 UTC, a quarter of an hour before NOW.
    expect(liveDuration('2026-10-13 05:00:00', null, NOW)).toBe('Running · 15 min');
    expect(liveDuration(null, null, NOW)).toBe('Running');
  });

  it('lets the group decide here, points the others with the inbox to it, and gives the rest nothing to press', () => {
    expect(approvalRoute(true, true)).toBe('decide');
    expect(approvalRoute(false, true)).toBe('inbox');
    expect(approvalRoute(false, false)).toBe('none');
  });
});
