import { describe, it, expect } from 'vitest';
import {
  AssistantMessage, ToolCall, ToolDef, allowedTools, askFirstNames, cardView, confirmLabel, contentBlocks, filesLink,
  ioOf, lastUsedByTool, mergeMessages, outcomeLook, runLink, serviceOf, toolState, traceOwners, withDecision,
} from './assistant.model';

const msg = (m: Partial<AssistantMessage>): AssistantMessage => ({
  messageId: 1, conversationId: 1000, seq: 1, role: 'assistant', content: '', toolRunId: null, runStatus: null,
  card: null, links: [], artifact: null, dateCreated: '2026-09-29T11:56:49.435+00:00', ...m,
});

const tool = (t: Partial<ToolDef>): ToolDef => ({
  name: 'get_jobs', title: 'Pipeline jobs', description: '', kind: 'read', requiresConfirmation: false, requiredRole: 'TENANT_USER',
  page: 'jobs', coreTask: null, returnsDatasetReference: false, parameters: { type: 'object', properties: {} },
  available: true, unavailableReason: null, enabledInWorkspace: true, switchedInWorkspace: false, youMayUse: true, ...t,
});

describe('assistant model -- what a message says', () => {
  it('keeps model text as text, and a fenced block as code', () => {
    expect(contentBlocks('Here:\n```yaml\nsteps: []\n```\nDone <b>now</b>')).toEqual([
      { kind: 'text', text: 'Here:' },
      { kind: 'code', lang: 'yaml', text: 'steps: []' },
      { kind: 'text', text: 'Done <b>now</b>' },
    ]);
  });

  it('keeps an unclosed fence as code to the end', () => {
    expect(contentBlocks('```\nabc')).toEqual([{ kind: 'code', lang: '', text: 'abc' }]);
  });

  it('is nothing for no content', () => {
    expect(contentBlocks(null)).toEqual([]);
    expect(contentBlocks('  ')).toEqual([]);
  });
});

describe('assistant model -- a conversation grows', () => {
  it('adds new messages in seq order and replaces one it already has', () => {
    const a = msg({ messageId: 1, seq: 1, role: 'user', content: 'hi' });
    const b = msg({ messageId: 2, seq: 2, content: 'old' });
    const merged = mergeMessages([b, a], [msg({ messageId: 3, seq: 3 }), msg({ messageId: 2, seq: 2, content: 'new' })]);
    expect(merged.map(m => [m.messageId, m.content])).toEqual([[1, 'hi'], [2, 'new'], [3, '']]);
  });

  it('marks a decided card on the message that asked', () => {
    const card = { actionId: 'a1', tool: 'run_pipeline', arguments: { jobId: 2848 }, summary: 'Run', expiresAt: null, state: 'pending' as const };
    const list = [msg({ messageId: 5, card }), msg({ messageId: 6 })];
    const after = withDecision(list, 'a1', true);
    expect(after[0].card?.state).toBe('confirmed');
    expect(withDecision(list, 'a1', false)[0].card?.state).toBe('declined');
    expect(list[0].card?.state).toBe('pending');
  });

  it('shows a run\'s trace once, on the last message of that run', () => {
    const owners = traceOwners([msg({ messageId: 1, toolRunId: 1004 }), msg({ messageId: 2, role: 'tool-summary' }),
      msg({ messageId: 3, toolRunId: 1004 }), msg({ messageId: 4, toolRunId: 1005, role: 'user' }), msg({ messageId: 5, toolRunId: 1006 })]);
    expect([...owners]).toEqual([3, 5]);
  });
});

describe('assistant model -- the confirmation card', () => {
  const NOW = new Date('2026-09-29T12:00:00Z').getTime();
  const base = { actionId: 'a', tool: 'run_pipeline', arguments: { jobId: 2848, note: 'x' }, summary: 'Run a pipeline job (jobId=2848).' };

  it('asks while pending and not yet expired (naive expiry is Chicago wall-clock)', () => {
    // 07:13 Chicago (CDT) is 12:13 UTC: still open at 12:00 UTC.
    const v = cardView({ ...base, expiresAt: '2026-09-29T07:13:05.974086', state: 'pending' }, NOW);
    expect(v.open).toBe(true);
    expect(v.state).toBe('Waiting for you');
    expect(v.args).toEqual([['jobId', '2848'], ['note', 'x']]);
  });

  it('treats a pending card past its expiry as expired', () => {
    const v = cardView({ ...base, expiresAt: '2026-09-29T06:59:00', state: 'pending' }, NOW);
    expect(v.open).toBe(false);
    expect(v.state).toBe('Expired');
  });

  it('says what was decided', () => {
    expect(cardView({ ...base, expiresAt: null, state: 'confirmed' }, NOW).state).toBe('Confirmed');
    expect(cardView({ ...base, expiresAt: null, state: 'declined' }, NOW).state).toBe('Declined');
    expect(cardView({ ...base, expiresAt: null, state: 'confirmed' }, NOW).open).toBe(false);
  });

  it('names the button after what it does', () => {
    expect(confirmLabel('run_pipeline')).toBe('Run pipeline');
    expect(confirmLabel('save_file')).toBe('Save file');
    expect(confirmLabel('delete_file')).toBe('Delete file');
    expect(confirmLabel('create_pdf')).toBe('Create PDF');
    expect(confirmLabel('something_else')).toBe('Confirm');
  });
});

describe('assistant model -- links', () => {
  it('opens an execution on its run page', () => {
    expect(runLink({ kind: 'execution', jobId: 2848, jobQueueId: 7404 })).toEqual(['/pipelines/schedules', 2848, 'runs', 7404, 'logs']);
    expect(runLink({ kind: 'execution', jobId: 2848 })).toEqual(['/pipelines/schedules', 2848, 'executions']);
  });

  it('opens an output folder or a file\'s folder in Browse files', () => {
    expect(filesLink({ kind: 'output', bucket: 'b', folder: 'runs/7404/' })).toEqual({ bucket: 'b', prefix: 'runs/7404/' });
    expect(filesLink({ kind: 'file', bucket: 'b', key: 'reports/2026/out.pdf' })).toEqual({ bucket: 'b', prefix: 'reports/2026/' });
    expect(filesLink({ kind: 'file', bucket: 'b', key: 'out.pdf' })).toEqual({ bucket: 'b', prefix: '' });
    expect(filesLink({ kind: 'file' })).toBeNull();
  });
});

describe('assistant model -- the trace', () => {
  it('reads each outcome with a tone, blocked and refused as refusals', () => {
    expect(outcomeLook('allowed')).toEqual({ label: 'Allowed', tone: 'ok' });
    expect(outcomeLook('confirmed')).toEqual({ label: 'Confirmed', tone: 'ok' });
    expect(outcomeLook('blocked')).toEqual({ label: 'Blocked', tone: 'crit' });
    expect(outcomeLook('refused')).toEqual({ label: 'Refused', tone: 'crit' });
    expect(outcomeLook('failed')).toEqual({ label: 'Failed', tone: 'crit' });
    expect(outcomeLook('pending')).toEqual({ label: 'Waiting for you', tone: 'warn' });
    expect(outcomeLook('declined')).toEqual({ label: 'Declined', tone: 'neutral' });
    expect(outcomeLook('expired')).toEqual({ label: 'Expired', tone: 'neutral' });
    expect(outcomeLook('odd')).toEqual({ label: 'Odd', tone: 'neutral' });
  });

  it('finds each tool\'s newest call across runs', () => {
    const call = (toolName: string, dateCreated: string): ToolCall => ({ callId: 1, toolRunId: 1, seq: 1, toolName, toolKind: 'read',
      arguments: '{}', outcome: 'allowed', dateCreated } as ToolCall);
    const last = lastUsedByTool([
      [call('get_jobs', '2026-09-29T11:57:55.926+00:00'), call('run_pipeline', '2026-09-29T11:58:05.974+00:00')],
      [call('get_jobs', '2026-09-29T06:05:00.000+00:00')],
    ]);
    expect(last).toEqual({ get_jobs: '2026-09-29T11:57:55.926+00:00', run_pipeline: '2026-09-29T11:58:05.974+00:00' });
  });
});

describe('assistant model -- the registry', () => {
  it('says why a tool cannot be used, the service first', () => {
    expect(toolState(tool({}))).toEqual({ label: 'Enabled', tone: 'ok', reason: '' });
    expect(toolState(tool({ available: false, unavailableReason: 'No endpoint.' }))).toEqual({ label: 'Blocked', tone: 'crit', reason: 'No endpoint.' });
    expect(toolState(tool({ enabledInWorkspace: false }))).toEqual({ label: 'Off', tone: 'neutral', reason: 'Switched off in this workspace.' });
    expect(toolState(tool({ youMayUse: false, requiredRole: 'TENANT_ADMIN' })))
      .toEqual({ label: 'Blocked', tone: 'crit', reason: 'Needs the Tenant administrator role.' });
  });

  it('allows a tool that is available, on, and yours to use', () => {
    const list = [tool({ name: 'a' }), tool({ name: 'b', available: false }), tool({ name: 'c', enabledInWorkspace: false }), tool({ name: 'd', youMayUse: false }),
      tool({ name: 'e', requiresConfirmation: true, kind: 'write' })];
    expect(allowedTools(list).map(t => t.name)).toEqual(['a', 'e']);
    expect(askFirstNames(list)).toEqual(['e']);
  });

  it('names the service behind a tool', () => {
    expect(serviceOf(tool({ page: 'api-collections' }))).toBe('API collections');
    expect(serviceOf(tool({ page: 'objects' }))).toBe('Storage');
    expect(serviceOf(tool({ page: 'tools-converter' }))).toBe('Document converter');
    expect(serviceOf(tool({ page: null, coreTask: 'transform_rows' }))).toBe('Pipeline engine');
    expect(serviceOf(tool({ page: 'mystery' }))).toBe('mystery');
  });

  it('writes input to output from the parameters, required first', () => {
    const t = tool({ parameters: { type: 'object', required: ['jobId'], properties: { note: { type: 'string' }, jobId: { type: 'integer' } } }, kind: 'write' });
    expect(ioOf(t)).toEqual({ input: 'jobId, note?', output: 'result' });
    expect(ioOf(tool({ returnsDatasetReference: true, parameters: { type: 'object', properties: {} } }))).toEqual({ input: 'none', output: 'dataset ref' });
    expect(ioOf(tool({ kind: 'read' })).output).toBe('list');
  });
});
