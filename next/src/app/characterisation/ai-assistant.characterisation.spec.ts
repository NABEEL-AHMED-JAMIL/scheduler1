import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, Visit, click, closeOverlays, detailsOf, pin, restoreClock, surfaceOf, visit } from './harness';
import { PINNED } from './pinned/ai-assistant';

/**
 * MIG-252 characterisation baseline: AI › AI Assistant and AI › Tool Registry, per role. The answers are ai-service's
 * (3e9f6ee, MIG-241) as workspace 2924 answered them on 2026-09-29 -- conversation 1000 (a confirmed run_pipeline and
 * its execution, run 7404) and tool run 1004's trace -- cut to what the screens read, parameter schemas shortened.
 */
const FILE = 'ai-assistant';

const P = (props: string[], required: string[] = []) => ({ type: 'object', required, properties: Object.fromEntries(props.map(p => [p, { type: 'string' }])) });
const TOOL = { description: '', coreTask: null, returnsDatasetReference: false, available: true, unavailableReason: null,
  enabledInWorkspace: true, switchedInWorkspace: false, youMayUse: true, requiresConfirmation: false, requiredRole: 'TENANT_USER', kind: 'read' };
const TOOLS = { status: 'SUCCESS', message: '6 tool(s).', data: [
  { ...TOOL, name: 'get_sources', title: 'Data sources', page: 'sources', parameters: P(['search', 'page', 'limit']) },
  { ...TOOL, name: 'call_api', title: 'Call a saved API request', page: 'api-collections', coreTask: 'read_api', returnsDatasetReference: true,
    requiredRole: 'TENANT_ADMIN', parameters: P(['requestId', 'environmentId', 'variables'], ['requestId']) },
  { ...TOOL, name: 'get_jobs', title: 'Pipeline jobs', page: 'jobs', parameters: P(['search', 'limit']) },
  { ...TOOL, name: 'run_pipeline', title: 'Run a pipeline job', page: 'jobs', kind: 'write', requiresConfirmation: true, parameters: P(['jobId'], ['jobId']) },
  { ...TOOL, name: 'delete_file', title: 'Delete a file', page: 'objects', kind: 'write', requiresConfirmation: true, parameters: P(['bucket', 'key'], ['bucket', 'key']) },
  { ...TOOL, name: 'join_data', title: 'Join datasets', page: null, coreTask: 'join_datasets', available: false, youMayUse: false,
    unavailableReason: 'No user-facing endpoint runs a pipeline step on rows outside a pipeline run.', parameters: P(['datasetRef', 'config'], ['datasetRef']) },
] };

const CONVERSATION = { conversationId: 1000, tenantId: 2924, title: 'Run the job named "UI-CHECK step engine job 0928" now.', status: 'active',
  messageCount: 5, createdBy: 4537, dateCreated: '2026-09-29T11:56:49.430+00:00', dateUpdated: '2026-09-29T11:58:34.393+00:00' };
const MSG = { conversationId: 1000, toolRunId: null, runStatus: null, card: null, links: [], artifact: null };
const MESSAGES = [
  { ...MSG, messageId: 1000, seq: 1, role: 'user', content: 'Run the job named "UI-CHECK step engine job 0928" now.', dateCreated: '2026-09-29T11:56:49.435+00:00' },
  { ...MSG, messageId: 1001, seq: 2, role: 'tool-summary', content: 'Tools: get_jobs (allowed), run_pipeline (waiting for you).', dateCreated: '2026-09-29T11:58:05.993+00:00' },
  { ...MSG, messageId: 1002, seq: 3, role: 'assistant', content: 'Please confirm: Run a pipeline job (jobId=2848).', toolRunId: 1004, runStatus: 'awaiting_confirmation',
    card: { actionId: '0ce35154-50ec-4321-853c-6fee9daddce7', tool: 'run_pipeline', arguments: { jobId: 2848 }, summary: 'Run a pipeline job (jobId=2848).',
      expiresAt: '2026-09-29T07:13:05.974086', state: 'confirmed' }, dateCreated: '2026-09-29T11:58:05.995+00:00' },
  { ...MSG, messageId: 1003, seq: 4, role: 'tool-summary', content: 'You confirmed: Run a pipeline job (jobId=2848).', dateCreated: '2026-09-29T11:58:34.206+00:00' },
  { ...MSG, messageId: 1004, seq: 5, role: 'assistant', toolRunId: 1004, runStatus: 'answered', dateCreated: '2026-09-29T11:58:34.394+00:00',
    content: "The job 'UI-CHECK step engine job 0928' (jobId: 2848) has been successfully added to the queue. Confirm if you need further actions.",
    links: [{ kind: 'execution', jobId: 2848, jobName: 'UI-CHECK step engine job 0928', jobQueueId: 7404, status: 'Completed', startTime: '2026-09-29T06:58:13.699442' }] },
];
const RUN = { toolRunId: 1004, tenantId: 2924, connectionId: 1049, model: 'qwen3:8b', question: 'Run the job named "UI-CHECK step engine job 0928" now.',
  status: 'answered', error: null, toolCallCount: 2, dateCreated: '2026-09-29T11:56:49.456+00:00' };
const TRACE = { status: 'SUCCESS', message: '2 call(s).', data: { run: RUN, pending: null, message: null, calls: [
  { callId: 1005, toolRunId: 1004, seq: 1, toolName: 'get_jobs', toolKind: 'read', arguments: '{"search":"UI-CHECK step engine job 0928","limit":1}',
    outcome: 'allowed', reason: null, httpStatus: 200, durationMs: 436, resultBytes: 229, resultRows: 1, dateCreated: '2026-09-29T11:57:55.926+00:00' },
  { callId: 1006, toolRunId: 1004, seq: 2, toolName: 'run_pipeline', toolKind: 'write', arguments: '{"jobId":2848}', outcome: 'confirmed', reason: null,
    httpStatus: 200, durationMs: 612, resultBytes: 134, resultRows: null, summary: 'Run a pipeline job (jobId=2848).', dateCreated: '2026-09-29T11:58:05.974+00:00' },
] } };

const ANSWERS: Record<string, unknown> = {
  'GET /aiPrompt.json/tools/list': TOOLS,
  'GET /aiPrompt.json/assistant/conversations': { status: 'SUCCESS', message: '1 conversation(s).', data: [CONVERSATION] },
  'GET /aiPrompt.json/assistant/conversation': { status: 'SUCCESS', message: '5 message(s).', data: { conversation: CONVERSATION, messages: MESSAGES } },
  'GET /aiPrompt.json/tools/runs': { status: 'SUCCESS', message: '1 run(s).', data: [RUN] },
  'GET /aiPrompt.json/tools/trace': TRACE,
  // MIG-254: workspace 2924's data policy as ai-service (MIG-243) answered it on 2026-09-29 -- nothing saved, every level its default.
  'GET /aiPrompt.json/dataPolicy': { status: 'SUCCESS', message: 'The workspace\'s data policy.', data: { tenantId: 2924, levels: [
    { sensitivity: 'public', modelRule: 'any', allowedModels: [], retentionDays: null, deliveryOptions: {}, aiWriteTools: true, minFieldsWarning: true, saved: false },
    { sensitivity: 'internal', modelRule: 'any', allowedModels: [], retentionDays: null, deliveryOptions: {}, aiWriteTools: true, minFieldsWarning: true, saved: false },
    { sensitivity: 'sensitive', modelRule: 'local', allowedModels: [], retentionDays: null, deliveryOptions: {}, aiWriteTools: false, minFieldsWarning: true, saved: false },
  ] } },
  'GET /appUser.json/me': { status: 'SUCCESS', message: 'OK', data: { appUserId: 4537, tenantId: 2924, tenantName: 'UI-CHECK workspace' } },
};

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** The thread as a person reads it: each message's role and text, the card's state, the result's links, the calls. */
function threadOf(v: Visit): Record<string, unknown> {
  const q = (s: string) => Array.from(v.main.querySelectorAll(s));
  return {
    messages: q('[data-message]').map(m => `${m.getAttribute('data-role')}: ${clean(m.textContent).slice(0, 160)}`),
    cards: q('[data-card]').map(c => c.getAttribute('data-state')),
    links: q('[data-link]').map(l => `${l.getAttribute('data-link')}: ${clean(l.textContent)}`),
    calls: q('[data-call]').map(c => `${c.getAttribute('data-call')} ${c.getAttribute('data-outcome')}: ${clean(c.textContent)}`),
    context: detailsOf(v.main.querySelector('[data-context]') as HTMLElement ?? v.main).terms,
    policy: q('[data-policy] li').map(li => Array.from(li.children).map(c => clean(c.textContent)).join(': ')),
  };
}

function rowsOf(v: Visit): string[] {
  return Array.from(v.main.querySelectorAll('tr[data-row]')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => clean(td.textContent)).filter(Boolean).join(' | '));
}

describe('MIG-252: AI › AI Assistant and Tool Registry', () => {
  useMemoryStorage();
  afterEach(() => { restoreClock(); closeOverlays(); });

  it('a new chat, as a workspace administrator', async () => {
    const v = await visit('/ai/assistant', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'a new chat, as a workspace administrator', { ...v.surface, thread: threadOf(v) }, PINNED);
  });

  it('conversation 1000, confirmed and run, with its tool calls', async () => {
    const v = await visit('/ai/assistant?c=1000', 'TENANT_ADMIN', null, ANSWERS);
    const opened = await click(v, 'Show tool calls');
    pin(FILE, 'conversation 1000, confirmed and run, with its tool calls',
      { ...v.surface, ...surfaceOf(v.main), opened, thread: threadOf(v) }, PINNED);
  });

  it('the assistant, as a tenant user with every page', async () => {
    const v = await visit('/ai/assistant', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'the assistant, as a tenant user with every page', { ...v.surface, thread: threadOf(v) }, PINNED);
  });

  it('the assistant, as a tenant user without the page', async () => {
    const v = await visit('/ai/assistant', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'the assistant, as a tenant user without the page', v.surface, PINNED);
  });

  it('the tool registry, as a workspace administrator', async () => {
    const v = await visit('/ai/tools', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the tool registry, as a workspace administrator', { ...v.surface, rows: rowsOf(v) }, PINNED);
  });

  it('the tool registry, as a tenant user with every page', async () => {
    const v = await visit('/ai/tools', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'the tool registry, as a tenant user with every page', { ...v.surface, rows: rowsOf(v) }, PINNED);
  });

  it('the tool registry, as a platform administrator', async () => {
    const v = await visit('/ai/tools', 'PLATFORM_ADMIN', null, ANSWERS);
    pin(FILE, 'the tool registry, as a platform administrator', { ...v.surface, rows: rowsOf(v) }, PINNED);
  });
});
