import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, from, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AlertsApi } from '../../settings/alerts/alerts.api';
import { ReportStudioApi } from '../../report-studio/report-studio.api';
import { WorkflowDetail, WorkflowsApi } from '../../workflows/workflows.api';
import { MAX_WORKFLOWS, TeamUsageReader, alertUses, reportUses, usageSummary, workflowUses } from './teams-usage';

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

  it('reads a bounded number of calls: the list, at most MAX_WORKFLOWS definitions four at a time, and reuses a reading for a minute', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ key: `w${i}`, name: `W${i}`, status: i === 0 ? 'Archived' : 'Active' }));
    let inFlight = 0; let most = 0;
    const fetch = vi.fn((_key: string) => {
      inFlight++; most = Math.max(most, inFlight);
      return new Promise(r => setTimeout(r, 1)).then(() => { inFlight--; return { status: 'SUCCESS', data: detail({ steps: [] }) }; });
    });
    const workflows = { list: vi.fn(() => of({ status: 'SUCCESS', data: many })), fetch: (k: string) => from(fetch(k)) };
    const alerts = { rules: vi.fn(() => of({ status: 'SUCCESS', data: { rules: [] } })) };
    const reports = { settings: vi.fn(() => of(null)) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: WorkflowsApi, useValue: workflows }, { provide: AlertsApi, useValue: alerts }, { provide: ReportStudioApi, useValue: reports },
      { provide: AuthService, useValue: { isTenantAdmin: signal(true), canOpen: () => true } }] });
    const reader = TestBed.inject(TeamUsageReader);
    const usage = await firstValueFrom(reader.read());
    expect(workflows.list).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(MAX_WORKFLOWS);
    expect(fetch).not.toHaveBeenCalledWith('w0');
    expect(most).toBeLessThanOrEqual(4);
    expect(usage.known).toEqual(['workflow', 'approval', 'alert']);
    expect(usage.capped).toBe(true);
    await firstValueFrom(reader.read());
    expect(workflows.list, 'reused within a minute').toHaveBeenCalledTimes(1);
    await firstValueFrom(reader.read(true));
    expect(workflows.list, 'Refresh reads again').toHaveBeenCalledTimes(2);
  });

  it('asks nothing a member may not read: no alerts or Report Studio, no designer without its page', async () => {
    const workflows = { list: vi.fn(() => of({ status: 'SUCCESS', data: [] })), fetch: vi.fn() };
    const alerts = { rules: vi.fn() };
    const reports = { settings: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: WorkflowsApi, useValue: workflows }, { provide: AlertsApi, useValue: alerts }, { provide: ReportStudioApi, useValue: reports },
      { provide: AuthService, useValue: { isTenantAdmin: signal(false), canOpen: () => false } }] });
    const usage = await firstValueFrom(TestBed.inject(TeamUsageReader).read());
    expect(workflows.list).not.toHaveBeenCalled();
    expect(alerts.rules).not.toHaveBeenCalled();
    expect(reports.settings).not.toHaveBeenCalled();
    expect(usage.known).toEqual([]);
  });
});

