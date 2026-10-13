import { describe, it, expect } from 'vitest';
import { fromJson, subjectWho, toJson } from './designer.model';

/**
 * UX review 2026-10-12: the built-in run review and step approval name their approver on each request
 * (assignee {kind: subject, value: reviewers}); the designer said "someone", showed a blank "Who approves", and dropped the
 * field on a save, which workflow-service refuses.
 */
const BUILT_IN = JSON.stringify({ steps: [{ key: 'review', type: 'approval', name: "Review the run's results",
  assignee: { kind: 'subject', value: 'reviewers' }, rejectNeedsComment: true, next: 'end' }] });

describe('a subject assignee', () => {
  it('reads as the reviewers named on the request, or the field it names', () => {
    expect(subjectWho('reviewers')).toBe('The reviewers named on the request');
    expect(subjectWho(null)).toBe('The reviewers named on the request');
    expect(subjectWho('dataOwner')).toBe('Whoever the request names as its data owner');
  });

  it('keeps its field through the designer and back', () => {
    const steps = fromJson(BUILT_IN);
    expect(steps[0].assignee).toEqual({ kind: 'subject', value: 'reviewers' });
    expect(toJson(steps).steps[0]["assignee"]).toEqual({ kind: 'subject', value: 'reviewers' });
  });
});
