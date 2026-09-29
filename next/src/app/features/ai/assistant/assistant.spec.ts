import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { PipelineDraftHandoff } from '../../tasks/steps/draft-handoff';
import { AssistantApi } from './assistant.api';
import { AssistantMessage, ToolDef } from './assistant.model';
import { Assistant } from './assistant';

const CONV = { conversationId: 1000, title: 'Run the job', status: 'active', dateUpdated: '2026-09-29T11:58:34.393+00:00' };
const m = (x: Partial<AssistantMessage>): AssistantMessage => ({ messageId: 1, conversationId: 1000, seq: 1, role: 'assistant', content: '',
  toolRunId: null, runStatus: null, card: null, links: [], artifact: null, ...x });
const CARD = { actionId: 'act-1', tool: 'run_pipeline', arguments: { jobId: 2848 }, summary: 'Run a pipeline job (jobId=2848).',
  expiresAt: null, state: 'pending' as const };
const tool = (t: Partial<ToolDef>): ToolDef => ({ name: 'get_jobs', title: 'Jobs', description: '', kind: 'read', requiresConfirmation: false,
  requiredRole: 'TENANT_USER', page: 'jobs', coreTask: null, returnsDatasetReference: false, parameters: null, available: true,
  unavailableReason: null, enabledInWorkspace: true, switchedInWorkspace: false, youMayUse: true, ...t });

interface Setup {
  query?: Record<string, string>;
  admin?: boolean;
  send?: () => Observable<any>;
  decide?: () => Observable<any>;
}

function screenWith(setup: Setup = {}) {
  const api = {
    conversations: vi.fn(() => of({ status: 'SUCCESS', data: [CONV] })),
    conversation: vi.fn(() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [
      m({ messageId: 1000, seq: 1, role: 'user', content: 'Run the job' }),
      m({ messageId: 1002, seq: 3, toolRunId: 1004, runStatus: 'awaiting_confirmation', card: { ...CARD } }),
    ] } })),
    send: vi.fn(setup.send ?? (() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [
      m({ messageId: 2000, seq: 6, role: 'user', content: 'Which jobs?' }),
      m({ messageId: 2001, seq: 7, content: 'Two jobs.', toolRunId: 1010, runStatus: 'answered' }),
    ], run: { toolRunId: 1010, status: 'answered' } } }))),
    decide: vi.fn(setup.decide ?? (() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [
      m({ messageId: 1003, seq: 4, role: 'tool-summary', content: 'You confirmed: Run a pipeline job (jobId=2848).' }),
      m({ messageId: 1004, seq: 5, toolRunId: 1004, runStatus: 'answered', content: 'Queued.',
        links: [{ kind: 'execution', jobId: 2848, jobName: 'UI-CHECK', jobQueueId: 7404, status: 'Completed' }] }),
    ] } }))),
    trace: vi.fn(() => of({ status: 'SUCCESS', data: { run: { toolRunId: 1004, status: 'answered' }, calls: [] } })),
    tools: vi.fn(() => of({ status: 'SUCCESS', data: [tool({}), tool({ name: 'run_pipeline', kind: 'write', requiresConfirmation: true }),
      tool({ name: 'transform_data', available: false, unavailableReason: 'No endpoint.' })] })),
    rename: vi.fn(() => of({ status: 'SUCCESS', message: 'Renamed.' })),
    remove: vi.fn(() => of({ status: 'SUCCESS', message: 'Deleted.' })),
  };
  const get = vi.fn((url: string) => {
    if (url.endsWith('/appUser.json/me')) return of({ status: 'SUCCESS', data: { tenantId: 2924, tenantName: 'Acme Health' } });
    if (url.endsWith('/aiConnection.json/list')) return of({ status: 'SUCCESS', data: [
      { connectionId: 1047, name: 'Local Ollama', isDefault: true, status: 'Active' },
      { connectionId: 1049, name: 'qwen3 (tool loop)', isDefault: false, status: 'Active' },
      { connectionId: 1050, name: 'Old', isDefault: false, status: 'Inactive' }] });
    if (url.endsWith('/pipeline.json/list')) return of({ status: 'SUCCESS', data: { rows: [{ pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928' }] } });
    return of({ status: 'SUCCESS', data: [] });
  });
  const post = vi.fn((url: string) => url.endsWith('/sourceTask.json/listSourceTask')
    ? of({ status: 'SUCCESS', data: [{ taskDetailId: 5001, pipelineId: 'OTHER' }, { taskDetailId: 5002, pipelineId: 'UI_CHECK_STEPS_0928' }] })
    : of({ status: 'SUCCESS' }));
  const navigate = vi.fn(() => Promise.resolve(true));
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const admin = setup.admin ?? true;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AssistantApi, useValue: api },
      { provide: HttpClient, useValue: { get, post } },
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => setup.query?.[k] ?? null } } } },
      { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(true) })) } },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { canManageAgents: () => admin, isTenantAdmin: () => admin, displayName: () => 'Test Admin',
        role: () => (admin ? 'TENANT_ADMIN' : 'TENANT_USER'), user: signal({ appUserId: 4537, tenantId: 2924 }) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Assistant());
  screen.ngOnInit();
  return { screen, api, get, post, navigate, toast };
}

describe('AI Assistant -- a conversation', () => {
  it('opens the conversation the address names, with its card waiting', () => {
    const { screen, api } = screenWith({ query: { c: '1000' } });
    expect(api.conversation).toHaveBeenCalledWith(1000);
    expect(screen.conversation()?.conversationId).toBe(1000);
    expect(screen.messages().map(x => x.messageId)).toEqual([1000, 1002]);
    expect(screen.conversations().length).toBe(1);
  });

  it('sends a question into the open conversation, with the workspace default model', () => {
    const { screen, api } = screenWith({ query: { c: '1000' } });
    screen.draft.set('  Which jobs?  ');
    screen.send();
    expect(api.send).toHaveBeenCalledWith('Which jobs?', 1000, null);
    expect(screen.draft()).toBe('');
    expect(screen.messages().map(x => x.messageId)).toEqual([1000, 1002, 2000, 2001]);
    expect(screen.working()).toBeNull();
  });

  it('sends the connection an administrator picked', () => {
    const { screen, api } = screenWith();
    expect(screen.connectionOptions().map(c => c.connectionId)).toEqual([1047, 1049]);
    screen.connectionId.set(1049);
    screen.draft.set('Hi');
    screen.send();
    expect(api.send).toHaveBeenCalledWith('Hi', null, 1049);
    expect(screen.conversation()?.conversationId).toBe(1000);
  });

  it('opens the new run\'s tool calls as the answer arrives', () => {
    const { screen, api } = screenWith();
    screen.draft.set('Which jobs?');
    screen.send();
    expect(api.trace).toHaveBeenCalledWith(1010);
    expect(screen.openTraces().has(1010)).toBe(true);
  });

  it('shows a refusal the server recorded, from the envelope\'s data', () => {
    const { screen } = screenWith({ send: () => of({ status: 'ERROR', message: 'That model is not allowed.', data: { conversation: CONV,
      messages: [m({ messageId: 3000, seq: 1, role: 'user', content: 'Hi' }), m({ messageId: 3001, seq: 2, runStatus: 'refused', content: 'That model is not allowed.' })] } }) });
    screen.draft.set('Hi');
    screen.send();
    expect(screen.messages().at(-1)?.runStatus).toBe('refused');
    expect(screen.error()).toBe('');
  });

  it('keeps the question when the request itself fails', () => {
    const { screen } = screenWith({ send: () => throwError(() => ({ error: { message: 'Gateway timeout' } })) });
    screen.draft.set('Hi there');
    screen.send();
    expect(screen.error()).toBe('Gateway timeout');
    expect(screen.draft()).toBe('Hi there');
    expect(screen.working()).toBeNull();
  });

  it('stops waiting without cancelling anything on the server', () => {
    const pending = new Subject<any>();
    const { screen } = screenWith({ send: () => pending });
    screen.draft.set('Slow one');
    screen.send();
    expect(screen.working()).toBe('send');
    expect(screen.waitingFor()).toBe('Slow one');
    screen.stopWaiting();
    expect(screen.working()).toBeNull();
    expect(pending.observed).toBe(false);
    expect(screen.stopped()).toBe(true);
  });

  it('does not send while it is waiting, or an empty message', () => {
    const { screen, api } = screenWith({ send: () => NEVER });
    screen.draft.set('   ');
    screen.send();
    expect(api.send).not.toHaveBeenCalled();
    screen.draft.set('One');
    screen.send();
    screen.draft.set('Two');
    screen.send();
    expect(api.send).toHaveBeenCalledTimes(1);
  });
});

describe('AI Assistant -- confirm, then run', () => {
  it('runs on confirm: the card is marked, the result and its execution arrive', () => {
    const { screen, api } = screenWith({ query: { c: '1000' } });
    const asking = screen.messages().find(x => x.card)!;
    screen.decide(asking, true);
    expect(api.decide).toHaveBeenCalledWith('act-1', true);
    expect(screen.messages().find(x => x.messageId === 1002)?.card?.state).toBe('confirmed');
    const result = screen.messages().at(-1)!;
    expect(result.links[0]).toMatchObject({ kind: 'execution', jobQueueId: 7404 });
  });

  it('declines without running anything', () => {
    const { screen, api } = screenWith({ query: { c: '1000' }, decide: () => of({ status: 'SUCCESS', data: { conversation: CONV,
      messages: [m({ messageId: 1003, seq: 4, role: 'tool-summary', content: 'You declined.' })] } }) });
    screen.decide(screen.messages().find(x => x.card)!, false);
    expect(api.decide).toHaveBeenCalledWith('act-1', false);
    expect(screen.messages().find(x => x.messageId === 1002)?.card?.state).toBe('declined');
  });

  it('reads the conversation again when a decision is refused (an expired card, say)', () => {
    const { screen, api, toast } = screenWith({ query: { c: '1000' }, decide: () => of({ status: 'ERROR', message: 'That confirmation expired.' }) });
    api.conversation.mockClear();
    screen.decide(screen.messages().find(x => x.card)!, true);
    expect(toast.error).toHaveBeenCalledWith('That confirmation expired.');
    expect(api.conversation).toHaveBeenCalledWith(1000);
  });
});

describe('AI Assistant -- the context panel', () => {
  it('names the workspace, the person, and the tools the assistant may use', () => {
    const { screen } = screenWith();
    expect(screen.workspace()).toBe('Acme Health');
    expect(screen.actingAs()).toBe('Test Admin');
    expect(screen.allowed().length).toBe(2);
    expect(screen.tools().length).toBe(3);
    expect(screen.askFirst()).toEqual(['run_pipeline']);
    expect(screen.blocked().map(t => t.name)).toEqual(['transform_data']);
  });

  it('asks a tenant user\'s model of nobody: no connection list', () => {
    const { screen, get } = screenWith({ admin: false });
    expect(get.mock.calls.some(c => String(c[0]).endsWith('/aiConnection.json/list'))).toBe(false);
    expect(screen.modelLabel()).toBe('Workspace default model');
  });
});

describe('AI Assistant -- a drafted pipeline', () => {
  it('opens the draft in its pipeline\'s step builder, on the YAML tab, unsaved', async () => {
    const { screen, navigate } = screenWith();
    const handoff = TestBed.inject(PipelineDraftHandoff);
    await screen.openDraft({ kind: 'pipeline-draft', format: 'yaml', text: 'steps: []', pipelineKey: 100175 });
    expect(navigate).toHaveBeenCalledWith(['/pipelines', 5002, 'edit'], { queryParams: { tab: 'yaml' } });
    expect(handoff.take(100175)).toEqual({ format: 'yaml', text: 'steps: []' });
    expect(handoff.take(100175)).toBeNull();
  });

  it('says so when no pipeline task can open the builder', async () => {
    const { screen, navigate, toast } = screenWith();
    await screen.openDraft({ kind: 'pipeline-draft', format: 'yaml', text: 'steps: []', pipelineKey: 999 });
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
  });
});
