import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AssistantApi } from './assistant.api';
import { AssistantMessage } from './assistant.model';
import { Assistant } from './assistant';

const CONV = { conversationId: 1000, title: 'Run the job', status: 'active' };
const m = (x: Partial<AssistantMessage>): AssistantMessage => ({ messageId: 1, conversationId: 1000, seq: 1, role: 'assistant', content: '',
  toolRunId: null, runStatus: null, card: null, links: [], artifact: null, ...x });

/** The page as drawn: the card's buttons, a blocked call, the result's links, model text kept as text. */
function render(messages: AssistantMessage[], calls: unknown[] = []) {
  const api = {
    conversations: () => of({ status: 'SUCCESS', data: [CONV] }),
    conversation: () => of({ status: 'SUCCESS', data: { conversation: CONV, messages } }),
    tools: () => of({ status: 'SUCCESS', data: [
      { name: 'get_jobs', title: 'Jobs', kind: 'read', available: true, enabledInWorkspace: true, youMayUse: true, requiresConfirmation: false },
      { name: 'join_data', title: 'Join', kind: 'read', available: false, unavailableReason: 'No endpoint.', enabledInWorkspace: true, youMayUse: false } ] }),
    trace: vi.fn(() => of({ status: 'SUCCESS', data: { run: { toolRunId: 1004, status: 'answered', model: 'qwen3:8b' }, calls } })),
    decide: vi.fn(() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [] } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Assistant],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AssistantApi, useValue: api },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: { tenantName: 'Acme' } }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'c' ? '1000' : null) } } } },
      { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AuthService, useValue: { canManageAgents: () => false, isTenantAdmin: () => false, displayName: () => 'Tess User',
        role: () => 'TENANT_USER', user: signal({ appUserId: 4597 }) } },
    ],
  });
  const fixture = TestBed.createComponent(Assistant);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api };
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
    expect(api.decide).toHaveBeenCalledWith('a1', true);
    expect(el.querySelector('[data-card]')!.getAttribute('data-state')).toBe('confirmed');
    expect(el.querySelector('[data-card]')!.querySelectorAll('button').length).toBe(0);
  });

  it('shows a blocked call as blocked, with its reason', () => {
    const { el, fixture } = render([m({ messageId: 3, seq: 3, toolRunId: 1004, content: 'I could not.' })], [
      { callId: 1, toolRunId: 1004, seq: 1, toolName: 'get_jobs', toolKind: 'read', arguments: '{"limit":1}', outcome: 'allowed', httpStatus: 200, durationMs: 436, resultRows: 1 },
      { callId: 2, toolRunId: 1004, seq: 2, toolName: 'join_data', toolKind: 'read', arguments: '{}', outcome: 'blocked', reason: 'join_data is not available.' },
    ]);
    const toggle = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Show tool calls'))!;
    toggle.click();
    fixture.detectChanges();
    const blocked = el.querySelector('[data-call="join_data"]')!;
    expect(blocked.getAttribute('data-outcome')).toBe('blocked');
    expect(blocked.textContent).toContain('Blocked');
    expect(blocked.textContent).toContain('join_data is not available.');
    expect(blocked.querySelector('.pill-crit')).toBeTruthy();
    expect(el.querySelector('[data-call="get_jobs"]')!.textContent).toContain('HTTP 200 · 436 ms · 1 row');
    expect(el.querySelector('[data-blocked]')!.textContent).toContain('join_data');
  });

  it('links a result to its execution\'s run page', () => {
    const { el } = render([m({ messageId: 4, seq: 4, content: 'Queued.', links: [{ kind: 'execution', jobId: 2848, jobName: 'UI-CHECK', jobQueueId: 7404, status: 'Completed' }] })]);
    const open = el.querySelector<HTMLAnchorElement>('[data-link="execution"] a')!;
    expect(open.textContent!.trim()).toBe('Open execution');
    expect(open.getAttribute('href')).toBe('/pipelines/schedules/2848/runs/7404/logs');
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
    const draft = el.querySelector('[data-artifact]')!;
    expect(draft.textContent).toContain('Not saved');
    const labels = Array.from(draft.querySelectorAll('button')).map(b => b.textContent!.trim());
    expect(labels).toEqual(['Copy']);
  });
});
