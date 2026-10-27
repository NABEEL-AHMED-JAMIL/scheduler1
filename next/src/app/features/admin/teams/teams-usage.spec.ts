import { describe, it, expect } from 'vitest';
import { WorkflowDetail } from '../../workflows/workflows.api';
import { alertUses, reportUses, usageSummary, workflowUses } from './teams-usage';

/** UX2: where a team is used, read from the definitions and settings that name it ({ kind: 'team', value }). */
const detail = (steps: unknown, currentVersion = 2): WorkflowDetail => ({
  id: 1, key: 'leave', name: 'Leave request', status: 'Active', currentVersion,
  versions: [{ version: 1, steps: JSON.stringify({ steps: [{ key: 'old', type: 'task', assignee: { kind: 'team', value: '9' } }] }) },
    { version: 2, steps: typeof steps === 'string' ? steps : JSON.stringify(steps) }],
} as unknown as WorkflowDetail);

describe('UX2: where a team is used', () => {
  it('reads a workflow\'s current version: an Approval step is an approval, a task or notice to a team a workflow use', () => {
    const uses = workflowUses(detail({ steps: [
      { key: 'mgr', name: 'Manager approval', type: 'approval', assignee: { kind: 'team', value: '6' } },
      { key: 'do', name: 'Book it', type: 'task', assignee: { kind: 'team', value: 6 } },
      { key: 'tell', name: 'Tell HR', type: 'notify', to: { kind: 'team', value: '7' } },
      { key: 'me', name: 'Requester', type: 'task', assignee: { kind: 'requester' } },
    ] }));
    expect(uses.get(6)).toEqual([
      { kind: 'approval', label: 'Leave request › Manager approval', link: '/workflows/designer', queryParams: { key: 'leave' } },
      { kind: 'workflow', label: 'Leave request', link: '/workflows/designer', queryParams: { key: 'leave' } },
    ]);
    expect(uses.get(7)?.map(u => u.kind)).toEqual(['workflow']);
    expect(uses.has(9), 'an older version does not count').toBe(false);
  });

  it('takes a bare steps array, and ignores steps it cannot read', () => {
    expect(workflowUses(detail([{ key: 'a', type: 'task', assignee: { kind: 'team', value: '3' } }])).get(3)?.length).toBe(1);
    expect(workflowUses(detail('{not json')).size).toBe(0);
  });

  it('reads alert rules\' teams and Report Studio\'s reviewers and publishers', () => {
    const into = alertUses([{ name: 'Runs failed', teams: [6, 7] }, { name: 'Missed', teams: [] }] as never);
    reportUses({ approvals: { reviewers: { kind: 'team', value: '6' } }, publishing: { publishers: { kind: 'role', value: 'TENANT_ADMIN' } } } as never, into);
    expect(into.get(6)?.map(u => u.label)).toEqual(['Runs failed', 'Report Studio reviewers']);
    expect(into.get(7)?.map(u => u.kind)).toEqual(['alert']);
    expect(reportUses(null).size).toBe(0);
  });

  it('sums them up in a fixed order', () => {
    const into = alertUses([{ name: 'A', teams: [1] }, { name: 'B', teams: [1] }] as never);
    reportUses({ approvals: { reviewers: { kind: 'team', value: '1' } }, publishing: { publishers: null } } as never, into);
    workflowUses(detail({ steps: [{ key: 'x', name: 'X', type: 'approval', assignee: { kind: 'team', value: '1' } }] }), into);
    expect(usageSummary(into.get(1)).map(s => s.text)).toEqual(['1 approval', '2 alerts', 'Report Studio']);
    expect(usageSummary(undefined)).toEqual([]);
  });
});
