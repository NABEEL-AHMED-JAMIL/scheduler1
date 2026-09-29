import { test, expect, APIRequestContext, Browser, Page, Route, TestInfo } from '@playwright/test';
import { join } from 'path';

/**
 * MIG-252: AI › AI Assistant and AI › Tool Registry, as workspace 2924's administrator (4537).
 *
 * The models behind the assistant are real Ollama models, so a question cannot be answered the same way twice. The
 * confirm-then-run flow is driven with the assistant's own send and decide answered by page.route -- ai-service's
 * shapes (3e9f6ee), with a fake conversation, card and runs -- so nothing is sent to a model and nothing runs. The
 * execution the fake result links is the live run 7404 (conversation 1000's), only opened. The live smoke opens the
 * pages against the real service and fails if the page ever asks to send, decide or switch a tool.
 *
 * Needs ai-service and Core behind :9098 and a console at E2E_BASE_URL with MIG-252 (`ng serve --port 4420`). Sign-in:
 *   E2E_TENANT_ADMIN_TOKEN   a TENANT_ADMIN access token (etl-platform/scripts/mint-test-token.sh 4537 900)
 *   E2E_SHOTS                optional: a folder the screenshots are also written to
 */
const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
const token = process.env['E2E_TENANT_ADMIN_TOKEN'];

interface Session { data: Record<string, unknown>; token: string; }

async function session(request: APIRequestContext): Promise<Session> {
  const claims = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString('utf8'));
  const pages = await (await request.get(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { token: token!, data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: pages?.data?.pageKeys } };
}

async function pageAs(browser: Browser, s: Session, width = 1440): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

/** Fails the test if the page asks the real service to send, decide or switch anything. */
function forbidWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', req => {
    if (req.method() !== 'GET' && /aiPrompt\.json\/(assistant\/(send|decide|rename|delete)|tools\/setEnabled)/.test(req.url())) writes.push(`${req.method()} ${req.url()}`);
  });
  return writes;
}

// ------------------------------------------------------------------------------------------ fakes

const FAKE_CONVERSATION = { conversationId: 990001, tenantId: 2924, title: 'Run the job named "UI-CHECK step engine job 0928" now.',
  status: 'active', messageCount: 3, createdBy: 4537, dateCreated: '2026-09-29T15:00:00.000+00:00', dateUpdated: '2026-09-29T15:00:05.000+00:00' };
const M = { conversationId: 990001, toolRunId: null, runStatus: null, card: null, links: [], artifact: null, dateCreated: '2026-09-29T15:00:05.000+00:00' };
const ACTION = 'e2e-fake-action-0001';

const SENT = { status: 'SUCCESS', message: 'Waiting for your confirmation.', data: { conversation: FAKE_CONVERSATION, run: { toolRunId: 990101, status: 'awaiting_confirmation' }, messages: [
  { ...M, messageId: 990001, seq: 1, role: 'user', content: 'Run the job named "UI-CHECK step engine job 0928" now.' },
  { ...M, messageId: 990002, seq: 2, role: 'tool-summary', content: 'Tools: get_jobs (allowed), join_data (blocked), run_pipeline (waiting for you).' },
  { ...M, messageId: 990003, seq: 3, role: 'assistant', content: 'Please confirm: Run a pipeline job (jobId=2848).', toolRunId: 990101, runStatus: 'awaiting_confirmation',
    card: { actionId: ACTION, tool: 'run_pipeline', arguments: { jobId: 2848 }, summary: 'Run a pipeline job (jobId=2848).', expiresAt: null, state: 'pending' } },
] } };

const DECIDED = (approve: boolean) => ({ status: 'SUCCESS', message: approve ? 'Done.' : 'Declined.', data: { conversation: FAKE_CONVERSATION,
  run: { toolRunId: 990101, status: 'answered' }, messages: approve ? [
    { ...M, messageId: 990004, seq: 4, role: 'tool-summary', content: 'You confirmed: Run a pipeline job (jobId=2848).' },
    { ...M, messageId: 990005, seq: 5, role: 'assistant', toolRunId: 990101, runStatus: 'answered',
      content: 'The job UI-CHECK step engine job 0928 is queued as run 7404.\n```yaml\njobId: 2848\n```',
      links: [
        { kind: 'execution', jobId: 2848, jobName: 'UI-CHECK step engine job 0928', jobQueueId: 7404, status: 'Completed', startTime: '2026-09-29T06:58:13.699442' },
        { kind: 'output', jobId: 2848, bucket: 'etl-ui-check', folder: 'runs/7404/', note: 'The run writes its report here.' },
      ] },
  ] : [
    { ...M, messageId: 990004, seq: 4, role: 'tool-summary', content: 'You declined: Run a pipeline job (jobId=2848).' },
    { ...M, messageId: 990005, seq: 5, role: 'assistant', toolRunId: 990101, runStatus: 'answered', content: 'Understood, nothing was run.' },
  ] } });

const TRACE = (confirmed: boolean) => ({ status: 'SUCCESS', message: '3 call(s).', data: { pending: null, message: null,
  run: { toolRunId: 990101, model: 'qwen3:8b', status: confirmed ? 'answered' : 'awaiting_confirmation', error: null }, calls: [
    { callId: 990201, toolRunId: 990101, seq: 1, toolName: 'get_jobs', toolKind: 'read', arguments: '{"search":"UI-CHECK step engine job 0928","limit":1}',
      outcome: 'allowed', httpStatus: 200, durationMs: 436, resultBytes: 229, resultRows: 1, dateCreated: '2026-09-29T15:00:02.000+00:00' },
    { callId: 990202, toolRunId: 990101, seq: 2, toolName: 'join_data', toolKind: 'read', arguments: '{"datasetRef":"ds_1"}', outcome: 'blocked',
      reason: 'join_data is not available: no user-facing endpoint runs a pipeline step outside a run.', dateCreated: '2026-09-29T15:00:03.000+00:00' },
    { callId: 990203, toolRunId: 990101, seq: 3, toolName: 'run_pipeline', toolKind: 'write', arguments: '{"jobId":2848}',
      outcome: confirmed ? 'confirmed' : 'pending', httpStatus: confirmed ? 200 : null, dateCreated: '2026-09-29T15:00:04.000+00:00' },
  ] } });

/** The assistant's send, decide and the fake run's trace, answered here; `hold` keeps send waiting until released. */
async function fakeAssistant(page: Page, opts: { hold?: boolean } = {}) {
  const decisions: unknown[] = [];
  const sends: unknown[] = [];
  let confirmed = false;
  let release: (() => void) | null = null;
  await page.route('**/aiPrompt.json/assistant/send', async (route: Route) => {
    sends.push(route.request().postDataJSON());
    if (opts.hold) await new Promise<void>(done => { release = done; });
    else await new Promise(done => setTimeout(done, 1500));
    await route.fulfill({ json: SENT, headers: cors(route) }).catch(() => undefined);
  });
  await page.route('**/aiPrompt.json/assistant/decide', async (route: Route) => {
    const body = route.request().postDataJSON();
    decisions.push(body);
    confirmed = !!body?.approve;
    await new Promise(done => setTimeout(done, 800));
    await route.fulfill({ json: DECIDED(!!body?.approve), headers: cors(route) });
  });
  await page.route(/aiPrompt\.json\/tools\/trace\?toolRunId=990101/, route => route.fulfill({ json: TRACE(confirmed), headers: cors(route) }));
  return { decisions, sends, release: () => release?.() };
}

/** The console calls :9098 from another origin; a fulfilled answer must allow it as the service would. */
function cors(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'] ?? '*';
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
}

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message the assistant' });

async function ask(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

// ------------------------------------------------------------------------------------------ tests

test.describe('AI Assistant: confirm, then run (send and decide faked)', () => {
  test.skip(!token, 'Set E2E_TENANT_ADMIN_TOKEN to run this.');

  let s: Session;
  test.beforeAll(async ({ request }) => { s = await session(request); });

  test('asks first, runs on confirm, and links the execution', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const fake = await fakeAssistant(page);
    await page.goto('/ai/assistant');
    await expect(page.getByRole('heading', { name: 'AI Assistant', exact: true })).toBeVisible();
    await ask(page, 'Run the job named "UI-CHECK step engine job 0928" now.');

    // Waiting: the question shows, and the working line with a way to stop waiting.
    await expect(page.locator('[data-working]')).toContainText('Working with approved tools');
    await expect(page.getByRole('button', { name: 'Stop waiting' })).toBeVisible();
    expect(fake.sends[0]).toEqual({ message: 'Run the job named "UI-CHECK step engine job 0928" now.' });

    // The card: nothing ran yet.
    const card = page.locator('[data-card]');
    await expect(card).toHaveAttribute('data-state', 'pending');
    await expect(card).toContainText('Confirm before it runs');
    await expect(card).toContainText('Run a pipeline job (jobId=2848).');
    await expect(card.getByRole('button', { name: 'Run pipeline' })).toBeEnabled();
    await expect(card.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(fake.decisions).toEqual([]);

    // The run's calls opened with the answer: the blocked one is shown as blocked, with why.
    const blocked = page.locator('[data-call="join_data"]');
    await expect(blocked).toHaveAttribute('data-outcome', 'blocked');
    await expect(blocked).toContainText('Blocked');
    await expect(blocked).toContainText('join_data is not available');
    await expect(page.locator('[data-call="run_pipeline"]')).toContainText('Waiting for you');
    await expect(page).toHaveURL(/\/ai\/assistant\?c=990001/);
    await shot(page, info, 'assistant-card-1440');

    await card.getByRole('button', { name: 'Run pipeline' }).click();
    await expect(page.locator('[data-working]')).toContainText('Carrying out your decision');
    await expect(page.locator('[data-card]')).toHaveAttribute('data-state', 'confirmed');
    expect(fake.decisions).toEqual([{ actionId: ACTION, approve: true }]);
    await expect(page.locator('[data-card]').getByRole('button')).toHaveCount(0);

    // The result: the execution (the MIG-251 run page) and where the report lands.
    const execution = page.locator('[data-link="execution"]');
    await expect(execution).toContainText('UI-CHECK step engine job 0928');
    await expect(execution).toContainText('run #7404');
    await expect(execution.getByRole('link', { name: 'Open execution' })).toHaveAttribute('href', '/pipelines/schedules/2848/runs/7404/logs');
    await expect(page.locator('[data-link="output"]').getByRole('link', { name: 'Open report files' }))
      .toHaveAttribute('href', /\/documents\/files\?bucket=etl-ui-check&prefix=runs%2F7404%2F/);
    await expect(page.locator('[data-role="assistant"] pre').last()).toHaveText('jobId: 2848');
    await shot(page, info, 'assistant-result-1440');

    await execution.getByRole('link', { name: 'Open execution' }).click();
    await expect(page).toHaveURL(/\/pipelines\/schedules\/2848\/runs\/7404\/logs/);
    await page.context().close();
  });

  test('Cancel declines: nothing runs', async ({ browser }) => {
    const page = await pageAs(browser, s);
    const fake = await fakeAssistant(page);
    await page.goto('/ai/assistant');
    await ask(page, 'Run the job named "UI-CHECK step engine job 0928" now.');
    const card = page.locator('[data-card]');
    await expect(card).toHaveAttribute('data-state', 'pending');
    await card.getByRole('button', { name: 'Cancel' }).click();
    await expect(card).toHaveAttribute('data-state', 'declined');
    expect(fake.decisions).toEqual([{ actionId: ACTION, approve: false }]);
    await expect(page.locator('[data-link]')).toHaveCount(0);
    await expect(page.getByText('Understood, nothing was run.')).toBeVisible();
    await page.context().close();
  });

  test('Stop waiting stops waiting, and the composer is free again', async ({ browser }) => {
    const page = await pageAs(browser, s);
    const fake = await fakeAssistant(page, { hold: true });
    await page.goto('/ai/assistant');
    await ask(page, 'Which pipeline jobs do I have?');
    await expect(page.locator('[data-waiting]')).toContainText('Which pipeline jobs do I have?');
    await page.getByRole('button', { name: 'Stop waiting' }).click();
    await expect(page.locator('[data-stopped]')).toContainText('Stopped waiting');
    await expect(page.locator('[data-working]')).toHaveCount(0);
    await composer(page).fill('Another question');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    fake.release();
    await page.context().close();
  });

  test('a phone lays the chat over the context', async ({ browser }, info) => {
    const page = await pageAs(browser, s, 390);
    await fakeAssistant(page);
    await page.goto('/ai/assistant');
    await ask(page, 'Run the job named "UI-CHECK step engine job 0928" now.');
    await expect(page.locator('[data-card]')).toHaveAttribute('data-state', 'pending');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, info, 'assistant-card-390');
    await page.context().close();
  });
});

test.describe('AI Assistant and Tool Registry: live smoke (read only)', () => {
  test.skip(!token, 'Set E2E_TENANT_ADMIN_TOKEN to run this.');

  let s: Session;
  test.beforeAll(async ({ request }) => { s = await session(request); });

  test('conversation 1000: confirmed, run, and its execution', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const writes = forbidWrites(page);
    await page.goto('/ai/assistant?c=1000');
    await expect(page.locator('[data-card]')).toHaveAttribute('data-state', 'confirmed');
    await expect(page.locator('[data-link="execution"]').getByRole('link', { name: 'Open execution' }))
      .toHaveAttribute('href', '/pipelines/schedules/2848/runs/7404/logs');
    await page.getByRole('button', { name: 'Show tool calls' }).click();
    await expect(page.locator('[data-call="get_jobs"]')).toHaveAttribute('data-outcome', 'allowed');
    await expect(page.locator('[data-call="run_pipeline"]')).toHaveAttribute('data-outcome', 'confirmed');
    await expect(page.locator('[data-context]')).toContainText('Tools allowed');
    await expect(page.locator('[data-blocked]')).toContainText('transform_data');
    await shot(page, info, 'assistant-live-1440');
    expect(writes).toEqual([]);
    await page.context().close();
  });

  test('the tool registry: every tool, the blocked ones blocked', async ({ browser }, info) => {
    const page = await pageAs(browser, s);
    const writes = forbidWrites(page);
    await page.goto('/ai/tools');
    await expect(page.getByRole('heading', { name: 'Tool Registry', exact: true })).toBeVisible();
    await expect(page.locator('tr[data-row="run_pipeline"]')).toContainText('Asks first');
    for (const name of ['transform_data', 'enrich_data', 'join_data']) {
      await expect(page.locator(`tr[data-row="${name}"]`)).toHaveAttribute('data-state', 'Blocked');
      await expect(page.locator(`tr[data-row="${name}"] input[role="switch"]`)).toBeDisabled();
    }
    await expect(page.locator('tr[data-row="get_jobs"] td').last()).not.toHaveText('Never');
    await shot(page, info, 'tools-live-1440');
    expect(writes).toEqual([]);
    await page.context().close();
  });
});
