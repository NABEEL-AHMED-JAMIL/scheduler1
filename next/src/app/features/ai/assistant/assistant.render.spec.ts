import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { JobEvent, JobEventsService } from '../../../core/socket/job-events.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AssistantApi } from './assistant.api';
import { AssistantMessage } from './assistant.model';
import { Assistant } from './assistant';
import { DataPolicyApi } from '../../admin/data-policies/data-policy.api';

const CONV = { conversationId: 1000, title: 'Run the job', status: 'active' };
const m = (x: Partial<AssistantMessage>): AssistantMessage => ({ messageId: 1, conversationId: 1000, seq: 1, role: 'assistant', content: '',
  toolRunId: null, runStatus: null, card: null, links: [], artifact: null, ...x });

/** The page as drawn: the card's buttons, a blocked call, the result's links, model text kept as text. */
function render(messages: AssistantMessage[], calls: unknown[] = [], policy: unknown = { status: 'SUCCESS', message: '', data: { levels: [] } }) {
  const api = {
    conversations: () => of({ status: 'SUCCESS', data: [CONV] }),
    conversation: () => of({ status: 'SUCCESS', data: { conversation: CONV, messages } }),
    tools: () => of({ status: 'SUCCESS', data: [
      { name: 'get_jobs', title: 'Jobs', kind: 'read', available: true, enabledInWorkspace: true, youMayUse: true, requiresConfirmation: false },
      { name: 'join_data', title: 'Join', kind: 'read', available: false, unavailableReason: 'No endpoint.', enabledInWorkspace: true, youMayUse: false } ] }),
    trace: vi.fn(() => of({ status: 'SUCCESS', data: { run: { toolRunId: 1004, status: 'answered', model: 'qwen3:8b' }, calls } })),
    decide: vi.fn(() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [] } })),
    decideAsync: vi.fn(() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [] } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Assistant],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AssistantApi, useValue: api },
      { provide: DataPolicyApi, useValue: { get: vi.fn(() => of(policy)) } },
      { provide: HttpClient, useValue: {
        get: (url: string) => of(url.endsWith('/appUser.json/me') ? { status: 'SUCCESS', data: { tenantName: 'Acme' } } : { status: 'SUCCESS', data: [] }),
        post: () => of({ status: 'SUCCESS', data: [] }) } },
      { provide: JobEventsService, useValue: { events: new Subject<JobEvent>().asObservable(), connected: signal(true) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'c' ? '1000' : null) } } } },
      { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AuthService, useValue: { isManagedSession: () => false, canManageAgents: () => false, isTenantAdmin: () => false, displayName: () => 'Tess User',
        role: () => 'TENANT_USER', user: signal({ appUserId: 4597 }) } },
    ],
  });
  const fixture = TestBed.createComponent(Assistant);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api };
}

/** The same page with the Context tab open: what the assistant works under. */
function renderContext(policy: unknown) {
  const drawn = render([], [], policy);
  drawn.fixture.componentInstance.tab.set('context');
  drawn.fixture.detectChanges();
  return drawn;
}

const CARD = { actionId: 'a1', tool: 'run_pipeline', arguments: { jobId: 2848 }, summary: 'Run a pipeline job (jobId=2848).', expiresAt: null, state: 'pending' as const };

describe('AI Assistant -- as drawn', () => {
  it('asks before it runs: a pending card with Run pipeline and Cancel', () => {
    const { el, fixture, api } = render([m({ messageId: 2, seq: 2, card: CARD, content: 'Please confirm.' })]);
    const card = el.querySelector('[data-card]')!;
    expect(card.getAttribute('data-state')).toBe('pending');
    const buttons = Array.from(card.querySelectorAll('button')).map(b => b.textContent!.trim());
    expect(buttons).toEqual(['Run pipeline', 'Cancel']);
    (card.querySelectorAll('button')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.decideAsync).toHaveBeenCalledWith('a1', true);
    expect(el.querySelector('[data-card]')!.getAttribute('data-state')).toBe('confirmed');
    expect(el.querySelector('[data-card]')!.querySelectorAll('button').length).toBe(0);
  });

  it('shows a blocked call as blocked, with its reason, in the Tool calls tab', () => {
    const { el, fixture } = render([m({ messageId: 3, seq: 3, toolRunId: 1004, content: 'I could not.' })], [
      { callId: 1, toolRunId: 1004, seq: 1, toolName: 'get_jobs', toolKind: 'read', arguments: '{"limit":1}', outcome: 'allowed', httpStatus: 200, durationMs: 436, resultRows: 1 },
      { callId: 2, toolRunId: 1004, seq: 2, toolName: 'join_data', toolKind: 'read', arguments: '{}', outcome: 'blocked', reason: 'join_data is not available.' },
    ]);
    el.querySelector<HTMLButtonElement>('[data-trace-open="1004"]')!.click();
    fixture.detectChanges();
    const blocked = el.querySelector('[data-call="join_data"]')!;
    expect(blocked.getAttribute('data-outcome')).toBe('blocked');
    expect(blocked.textContent).toContain('Blocked');
    expect(blocked.querySelector('.pill-crit')).toBeTruthy();
    blocked.querySelector('button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-call="join_data"]')!.textContent).toContain('join_data is not available.');
    const allowed = el.querySelector('[data-call="get_jobs"]')!;
    expect(allowed.textContent).toContain('436 ms');
    allowed.querySelector('button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-call="get_jobs"]')!.textContent).toContain('HTTP 200 · 1 row');
    expect(el.querySelector('[data-call="get_jobs"] pre')!.textContent).toContain('"limit": 1');
    expect(el.querySelector('[data-trace-summary]')!.textContent).toContain('qwen3:8b');
  });

  it('links a run the assistant started to its logs and its executions, followed live', () => {
    const { el } = render([m({ messageId: 4, seq: 4, content: 'Queued.', links: [{ kind: 'execution', jobId: 2848, jobName: 'UI-CHECK', jobQueueId: 7404, status: 'Completed' }] })]);
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('app-run-follow a')).map(a => [a.textContent!.trim(), a.getAttribute('href')]);
    // UX review B6 (AI2): a completed run leads to what it made first (its Outputs, until a dashboard it feeds is known).
    expect(links).toEqual([['See results', '/pipelines/schedules/2848/runs/7404?tab=outputs'], ['Open the run', '/pipelines/schedules/2848/runs/7404'],
      ['All runs', '/pipelines/schedules/2848/executions']]);
  });

  it('draws a designed flow in the Flow tab, with its verdict', () => {
    const designed = { kind: 'pipeline-flow', name: 'Labs', trigger: { type: 'inbox' }, valid: false, saved: false,
      problems: [{ step: 'check', message: 'check needs a setting: contractName.', kind: 'setting' }],
      flow: { nodes: [{ id: 'trigger-node', kind: 'trigger', label: 'A file lands in the inbox' },
        { id: 'read', kind: 'read', label: 'Read', task: 'read_file', problems: [] },
        { id: 'check', kind: 'process', label: 'Check', task: 'validate', problems: [{ step: 'check', message: 'check needs a setting: contractName.', kind: 'setting' }] }],
        edges: [{ from: 'trigger-node', to: 'read', label: 'file' }, { from: 'read', to: 'check', label: 'rows' }] },
      definition: { version: 1, source: { type: 'task' }, steps: [{ key: 'read', task: 'read_file' }, { key: 'check', task: 'validate' }] } };
    const { el, fixture } = render([m({ messageId: 7, seq: 7, content: 'Drawn.', artifact: designed as never })]);
    expect(el.querySelector('[data-artifact="pipeline-flow"]')!.textContent).toContain('1 setting to fill');
    const panel = el.querySelector('app-flow-panel')!;
    expect(panel.querySelector('[data-verdict]')!.textContent).toContain('1 setting to fill');
    expect(panel.querySelectorAll('app-flow-graph [data-node], app-flow-graph g[role="button"]').length).toBeGreaterThanOrEqual(3);
    expect(panel.querySelector('[data-create]')).toBeNull();
    expect(panel.querySelector('[data-flow-hint]')!.textContent).toContain('Check');
    (panel.querySelector('[data-flow-hint] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(panel.querySelector('[data-inspector]')!.textContent).toContain('needs a setting: contractName');
  });

  it('never renders model output as markup', () => {
    const { el } = render([m({ messageId: 5, seq: 5, content: 'Hi <img src=x onerror=alert(1)>\n```html\n<script>x()</script>\n```' })]);
    const answer = el.querySelector('[data-role="assistant"]')!;
    expect(answer.querySelector('img')).toBeNull();
    expect(answer.querySelector('script')).toBeNull();
    expect(answer.querySelector('pre')!.textContent).toBe('<script>x()</script>');
    expect(answer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('offers no step builder to a tenant user, only the copy', () => {
    const { el } = render([m({ messageId: 6, seq: 6, artifact: { kind: 'pipeline-draft', format: 'yaml', text: 'steps: []', pipelineKey: 1, valid: true } })]);
    const draft = el.querySelector('[data-artifact="pipeline-draft"]')!;
    expect(draft.textContent).toContain('Not saved');
    const labels = Array.from(draft.querySelectorAll('button')).map(b => b.textContent!.trim());
    expect(labels).toEqual(['Copy']);
  });
});

/** MIG-254: the Context panel's data policy is the workspace's own (it said "None configured" before MIG-243). */
describe('AI Assistant -- the data policy it works under', () => {
  const context = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-context] dt')).map(dt =>
    `${dt.textContent!.trim()} ${(dt.nextElementSibling?.textContent ?? '').replace(/\s+/g, ' ').trim()}`).join(' | ');
  const levels = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-policy] li')).map(li => Array.from(li.children).map(c => c.textContent!.trim()).join(' '));

  it('shows the defaults when the workspace saved none, level by level, and links to the policy', () => {
    const { el } = renderContext({ status: 'SUCCESS', message: '', data: { levels: [] } });
    expect(context(el)).toContain('Data policy Defaults (not saved)');
    expect(context(el)).not.toContain('None configured');
    expect(el.querySelector('[data-context] a[href="/administration/data-policies"]')).not.toBeNull();
    expect(levels(el)).toEqual([
      'Public Any model · write tools on · pipeline retention',
      'Internal Any model · write tools on · pipeline retention',
      'Sensitive Local only · write tools off · pipeline retention',
    ]);
  });

  it('shows a saved level as saved', () => {
    const { el } = renderContext({ status: 'SUCCESS', message: '', data: { levels: [
      { sensitivity: 'internal', modelRule: 'baa', allowedModels: [], retentionDays: 7, aiWriteTools: false, minFieldsWarning: true, saved: true },
    ] } });
    expect(context(el)).toContain('Data policy Partly saved');
    expect(levels(el)[1]).toBe('Internal BAA-signed or local · write tools off · 7 days');
  });

  it('says so when the policy cannot be read', () => {
    const { el } = renderContext({ status: 'ERROR', message: 'Pick the workspace whose data policy to read.' });
    expect(context(el)).toContain('Data policy Not available');
    expect(el.querySelector('[data-policy]')).toBeNull();
  });
});
