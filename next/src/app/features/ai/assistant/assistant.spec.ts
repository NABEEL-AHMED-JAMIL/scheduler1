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
import { JobEvent, JobEventsService } from '../../../core/socket/job-events.service';
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
  send?: (text: string) => Observable<any>;
  decide?: () => Observable<any>;
  progress?: () => Observable<any>;
}

function screenWith(setup: Setup = {}) {
  // The thread as the server has it: an async send appends the question at once and the answer when its run is done.
  const thread: AssistantMessage[] = [
    m({ messageId: 1000, seq: 1, role: 'user', content: 'Run the job' }),
    m({ messageId: 1002, seq: 3, toolRunId: 1004, runStatus: 'awaiting_confirmation', card: { ...CARD } }),
  ];
  const api = {
    conversations: vi.fn(() => of({ status: 'SUCCESS', data: [CONV] })),
    conversation: vi.fn(() => of({ status: 'SUCCESS', data: { conversation: CONV, messages: [...thread] } })),
    sendAsync: vi.fn(setup.send ?? ((text: string) => {
      const asked = m({ messageId: 2000, seq: 6, role: 'user', content: text });
      thread.push(asked, m({ messageId: 2001, seq: 7, content: 'Two jobs.', toolRunId: 1010, runStatus: 'answered' }));
      return of({ status: 'SUCCESS', data: { conversation: CONV, messages: [asked], run: { toolRunId: 1010, status: 'running' }, afterSeq: 6 } });
    })),
    progress: vi.fn(setup.progress ?? (() => of({ status: 'SUCCESS', data: { run: { toolRunId: 1010, status: 'answered', model: 'qwen3:8b',
      toolMode: 'native', rounds: 2, toolCallCount: 1, maxToolCalls: 8, tokensIn: 5000, tokensOut: 100, tokenBudget: 32000, timeBudgetMs: 180000,
      elapsedMs: 4200 }, calls: [{ callId: 1, toolRunId: 1010, seq: 1, toolName: 'get_jobs', toolKind: 'read', arguments: '{}', outcome: 'allowed' }],
      done: true } }))),
    cancel: vi.fn(() => of({ status: 'SUCCESS', message: 'Stopping.' })),
    decideAsync: vi.fn(setup.decide ?? (() => {
      thread.push(m({ messageId: 1003, seq: 4, role: 'tool-summary', content: 'You confirmed: Run a pipeline job (jobId=2848).' }),
        m({ messageId: 1004, seq: 5, toolRunId: 1004, runStatus: 'answered', content: 'Queued.',
          links: [{ kind: 'execution', jobId: 2848, jobName: 'UI-CHECK', jobQueueId: 7404, status: 'Completed' }] }));
      return of({ status: 'SUCCESS', data: { conversation: CONV, messages: [], run: { toolRunId: 1004, status: 'running' }, afterSeq: 3 } });
    })),
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
      { provide: JobEventsService, useValue: { events: new Subject<JobEvent>().asObservable(), connected: signal(true) } },
      { provide: AuthService, useValue: { isManagedSession: () => false, canManageAgents: () => admin, isTenantAdmin: () => admin, canBuild: () => admin, builderLocked: () => false, displayName: () => 'Test Admin',
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

  it('sends a question, follows its run, and takes the answer from the conversation when the run is done', () => {
    const { screen, api } = screenWith({ query: { c: '1000' } });
    screen.draft.set('  Which jobs?  ');
    screen.send();
    expect(api.sendAsync).toHaveBeenCalledWith('Which jobs?', 1000, null);
    expect(api.progress).toHaveBeenCalledWith(1010, 1000, 6);
    expect(screen.draft()).toBe('');
    expect(screen.messages().map(x => x.messageId)).toEqual([1000, 1002, 2000, 2001]);
    expect(screen.working()).toBeNull();
    expect(screen.modelStatus().model).toBe('qwen3:8b');
    expect(screen.modelStatus().facts).toContain('native tool calling');
    expect(api.trace).toHaveBeenCalledWith(1010);
  });

  it('shows the run\'s phase and calls while it works, then stops on Stop', () => {
    vi.useFakeTimers();
    const working = { status: 'SUCCESS', data: { run: { toolRunId: 1010, status: 'running', phase: 'Running get_jobs', rounds: 1, toolCallCount: 1,
      maxToolCalls: 8, tokensIn: 10, tokensOut: 1, tokenBudget: 32000, timeBudgetMs: 180000 },
      calls: [{ callId: 1, toolRunId: 1010, seq: 1, toolName: 'get_jobs', toolKind: 'read', arguments: '{}', outcome: 'allowed' }], done: false } };
    const progress = vi.fn(() => of(working));
    const { screen, api } = screenWith({ progress });
    screen.draft.set('Which jobs?');
    screen.send();
    expect(screen.working()).toBe('send');
    expect(screen.live()?.run.phase).toBe('Running get_jobs');
    expect(screen.liveCalls().map(c => c.toolName)).toEqual(['get_jobs']);
    expect(screen.traceView().live).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(progress).toHaveBeenCalledTimes(2);
    screen.stop();
    expect(api.cancel).toHaveBeenCalledWith(1010);
    expect(screen.stopping()).toBe(true);
    vi.useRealTimers();
  });

  it('sends the connection an administrator picked', () => {
    const { screen, api } = screenWith();
    expect(screen.connectionOptions().map(c => c.connectionId)).toEqual([1047, 1049]);
    screen.connectionId.set(1049);
    screen.draft.set('Hi');
    screen.send();
    expect(api.sendAsync).toHaveBeenCalledWith('Hi', null, 1049);
    expect(screen.conversation()?.conversationId).toBe(1000);
  });

  it('shows a refusal the server recorded, from the envelope\'s data, and offers Retry', () => {
    const { screen } = screenWith({ send: () => of({ status: 'ERROR', message: 'That model is not allowed.', data: { conversation: CONV,
      messages: [m({ messageId: 3000, seq: 1, role: 'user', content: 'Hi' }), m({ messageId: 3001, seq: 2, runStatus: 'refused', content: 'That model is not allowed.' })] } }) });
    screen.draft.set('Hi');
    screen.send();
    expect(screen.messages().at(-1)?.runStatus).toBe('refused');
    expect(screen.error()).toBe('');
    expect(screen.retryable()).toBe('Hi');
  });

  it('keeps the question when the request itself fails', () => {
    const { screen } = screenWith({ send: () => throwError(() => ({ error: { message: 'Gateway timeout' } })) });
    screen.draft.set('Hi there');
    screen.send();
    expect(screen.error()).toBe('Gateway timeout');
    expect(screen.draft()).toBe('Hi there');
    expect(screen.working()).toBeNull();
  });

  it('stops waiting when the answer has not named its run yet', () => {
    const pending = new Subject<any>();
    const { screen, api } = screenWith({ send: () => pending });
    screen.draft.set('Slow one');
    screen.send();
    expect(screen.working()).toBe('send');
    expect(screen.waitingFor()).toBe('Slow one');
    screen.stop();
    expect(screen.working()).toBeNull();
    expect(pending.observed).toBe(false);
    expect(screen.stopped()).toBe(true);
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('does not send while it is waiting, or an empty message', () => {
    const { screen, api } = screenWith({ send: () => NEVER });
    screen.draft.set('   ');
    screen.send();
    expect(api.sendAsync).not.toHaveBeenCalled();
    screen.draft.set('One');
    screen.send();
    screen.draft.set('Two');
    screen.send();
    expect(api.sendAsync).toHaveBeenCalledTimes(1);
  });
});

describe('AI Assistant -- confirm, then run', () => {
  it('runs on confirm: the card is marked, the result and its execution arrive', () => {
    const { screen, api } = screenWith({ query: { c: '1000' } });
    const asking = screen.messages().find(x => x.card)!;
    screen.decide(asking, true);
    expect(api.decideAsync).toHaveBeenCalledWith('act-1', true);
    const result = screen.messages().at(-1)!;
    expect(result.links[0]).toMatchObject({ kind: 'execution', jobQueueId: 7404 });
    // The run moved on: its calls are read afresh, not the ones read while it waited.
    expect(api.progress).toHaveBeenCalledWith(1004, 1000, 3);
    expect(api.trace).toHaveBeenCalledWith(1004);
  });

  it('declines without running anything', () => {
    const { screen, api } = screenWith({ query: { c: '1000' }, decide: () => of({ status: 'SUCCESS', data: { conversation: CONV,
      messages: [m({ messageId: 1003, seq: 4, role: 'tool-summary', content: 'You declined.' })] } }) });
    screen.decide(screen.messages().find(x => x.card)!, false);
    expect(api.decideAsync).toHaveBeenCalledWith('act-1', false);
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

describe('AI Assistant -- a designed flow', () => {
  const flow = (name: string, steps: string[]) => ({ kind: 'pipeline-flow', name, trigger: { type: 'manual' }, valid: true, saved: false, problems: [],
    flow: { nodes: [{ id: 'trigger-node', kind: 'trigger', label: 'Run on demand' }, ...steps.map(s => ({ id: s, kind: 'process', label: s, task: 'select' }))],
      edges: [] }, definition: { version: 1, steps: steps.map(s => ({ key: s, task: 'select' })) } });

  it('draws the conversation\'s newest flow, and a picked one on asking', () => {
    const { screen } = screenWith();
    screen.messages.set([
      m({ messageId: 10, seq: 2, content: 'Drawn.', artifact: flow('First', ['a']) as never }),
      m({ messageId: 11, seq: 4, content: 'Changed.', artifact: flow('Second', ['a', 'b']) as never }),
    ]);
    expect(screen.flow()?.name).toBe('Second');
    expect(screen.flowMessageId()).toBe(11);
    screen.tab.set('trace');
    screen.showFlow(10);
    expect(screen.flow()?.name).toBe('First');
    expect(screen.tab()).toBe('flow');
  });

  it('offers healthcare designs and generic asks as suggestions', () => {
    const { screen } = screenWith();
    const all = screen.suggestions.flatMap(g => g.prompts);
    expect(all.some(p => p.includes('lab results'))).toBe(true);
    expect(all.some(p => p.includes('orders.csv'))).toBe(true);
    screen.useSuggestion(all[0]);
    expect(screen.draft()).toBe(all[0]);
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

  it('opens the task ai-service names on the draft, with no lookup (MIG-317)', async () => {
    const { screen, navigate, get, post } = screenWith();
    get.mockClear();
    post.mockClear();
    await screen.openDraft({ kind: 'pipeline-draft', format: 'json', text: '{}', pipelineKey: 100175, taskDetailId: 5009 });
    expect(navigate).toHaveBeenCalledWith(['/pipelines', 5009, 'edit'], { queryParams: { tab: 'json' } });
    expect(get.mock.calls.some(c => String(c[0]).endsWith('/pipeline.json/list'))).toBe(false);
    expect(post.mock.calls.some(c => String(c[0]).endsWith('/sourceTask.json/listSourceTask'))).toBe(false);
  });

  it('says so when no pipeline task can open the builder', async () => {
    const { screen, navigate, toast } = screenWith();
    await screen.openDraft({ kind: 'pipeline-draft', format: 'yaml', text: 'steps: []', pipelineKey: 999 });
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
  });
});

describe('AI Assistant -- the thread\'s title', () => {
  it('reads the short title, with the first question in full as its tooltip; a title the person gave wins', () => {
    const { screen } = screenWith({ query: { c: '1000' } });
    expect(screen.threadTitle()).toBe('Run the job');
    screen.conversations.set([{ ...CONV, shortTitle: 'Run UI-CHECK', firstQuestion: 'Please run the UI-CHECK job now and tell me when it is done',
      title: 'Please run the UI-CHECK job now and tell me when it is done' } as never]);
    expect(screen.threadTitle()).toBe('Run UI-CHECK');
    expect(screen.threadTip()).toBe('Please run the UI-CHECK job now and tell me when it is done');
    screen.conversations.set([{ ...CONV, title: 'My nightly check', shortTitle: 'My nightly check', renamed: true } as never]);
    expect(screen.threadTitle()).toBe('My nightly check');
    screen.conversation.set(null);
    expect(screen.threadTitle()).toBe('New conversation');
  });
});

describe('AI Assistant -- a design handed over from New pipeline (UX review 2026-10-12, P3)', () => {
  it('puts the description in the composer, unsent, and drops it from the address', () => {
    const { screen, api, navigate } = screenWith({ query: { prompt: 'Read the daily admissions file, flag readmissions within 30 days' } });
    expect(screen.draft()).toBe('Read the daily admissions file, flag readmissions within 30 days');
    expect(api.sendAsync).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { prompt: null }, replaceUrl: true }));
  });
});

// UX final MG1: Create pipeline goes where a person may build -- canBuild, not only the administrator role.
describe('Create pipeline in a MANAGED workspace (UX final MG1)', () => {
  it('is offered from canBuild, which a MANAGED workspace\'s own administrator does not have', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const ts = fs.readFileSync(`${root}/src/app/features/ai/assistant/assistant.ts`, 'utf8');
    const html = fs.readFileSync(`${root}/src/app/features/ai/assistant/assistant.html`, 'utf8');
    expect(ts).toContain('readonly canCreatePipelines = computed(() => this.auth.canBuild());');
    expect(html).toContain('[canCreate]="canCreatePipelines()"');
    expect(html).toContain('<app-managed-banner what="pipelines"');
  });
});
