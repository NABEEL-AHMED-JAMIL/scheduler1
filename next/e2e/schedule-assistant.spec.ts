import { test, expect, Browser, Page, Route, TestInfo } from '@playwright/test';
import { canSignIn, NEEDS, pageAs as signedIn, Session, sessionFor } from './support/session';
import { jobById, postJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, pipeline, riverside } from './support/fixtures';
import { join } from 'path';

/**
 * Owner 2026-11-02 ("Use the AI Assistant (Recommended)"): a schedule's assistant (/pipelines/schedules/:jobId/assistant), as
 * Riverside Health's synthetic administrator, on the rebuilt appointments schedule.
 *
 * The quick buttons still answer from the schedule's own record; a typed question goes to the AI Assistant, limited to that one
 * schedule, and its conversation shows inline with the AI Assistant's own message UI and an "Open in AI Assistant" link. There is
 * no prompt picker. The AI Assistant's send is answered by page.route (ai-service's shapes) so no model is asked and nothing runs;
 * the page must ask with this schedule's id and never read the saved prompts. The live check asks the real service about a
 * schedule the person cannot read: it is refused before any conversation or model call.
 *
 * Needs ai-service and Core behind :9098 and a console at E2E_BASE_URL with the change. Sign-in: support/session.ts (role admin);
 * E2E_SHOTS optional: a folder the screenshots (1920 and 1024 wide) are also written to.
 */

const F = { tenantId: 0, adminId: 0, jobId: 0, jobName: '' };
if (hasFixtures()) {
  Object.assign(F, { tenantId: riverside().tenantId, adminId: riverside().admin, jobId: pipeline('appointments').jobId });
}

const QUESTION = 'Why did the last run fail, and how do I fix it?';
const ANSWER = 'Its last run completed; the one before failed on the read step because the file was not there yet. Run it again '
  + 'once the file has landed, or move the schedule to 07:00.';

const CONVERSATION = () => ({ conversationId: 990301, tenantId: F.tenantId, title: QUESTION, status: 'active', messageCount: 2,
  createdBy: F.adminId, scopeJobId: F.jobId, dateCreated: '2026-11-02T15:00:00.000+00:00', dateUpdated: '2026-11-02T15:00:05.000+00:00' });
const M = { conversationId: 990301, toolRunId: null, runStatus: null, card: null, links: [], artifact: null, dateCreated: '2026-11-02T15:00:05.000+00:00' };
const SENT = () => ({ status: 'SUCCESS', message: 'Answered.', data: { conversation: CONVERSATION(), run: { toolRunId: 990401, status: 'answered' },
  messages: [
    { ...M, messageId: 990311, seq: 1, role: 'user', content: QUESTION },
    { ...M, messageId: 990312, seq: 2, role: 'tool-summary', content: 'Tools: get_execution_status (allowed), get_failed_runs (allowed).' },
    { ...M, messageId: 990313, seq: 3, role: 'assistant', toolRunId: 990401, runStatus: 'answered', content: ANSWER },
  ] } });

/** The console calls :9098 from another origin; a fulfilled answer must allow it as the service would. */
function cors(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'] ?? '*';
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

/** The page with the AI Assistant's send faked and no earlier conversation about the schedule; what it sent and asked for. */
async function scheduleAssistant(browser: Browser, s: Session, width: number) {
  const page = await signedIn(browser, s, { viewport: { width, height: 1000 } });
  const sends: unknown[] = [];
  const asked: string[] = [];
  page.on('request', req => asked.push(`${req.method()} ${req.url()}`));
  await page.route('**/aiPrompt.json/assistant/send', async route => {
    sends.push(route.request().postDataJSON());
    await new Promise(done => setTimeout(done, 600));
    await route.fulfill({ json: SENT(), headers: cors(route) });
  });
  await page.route(/aiPrompt\.json\/assistant\/conversations\?.*scopeJobId=/, route =>
    route.fulfill({ json: { status: 'SUCCESS', message: '0 conversation(s).', data: [] }, headers: cors(route) }));
  await page.route(/aiPrompt\.json\/tools\/trace\?toolRunId=990401/, route => route.fulfill({ json: { status: 'SUCCESS', message: '0 call(s).',
    data: { pending: null, message: null, run: { toolRunId: 990401, status: 'answered' }, calls: [] } }, headers: cors(route) }));
  await page.goto(`/pipelines/schedules/${F.jobId}/assistant`);
  return { page, sends, asked };
}

test.describe("A schedule's assistant: quick answers from its record, typed questions to the AI Assistant about it only", () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    F.jobName = (await jobById(request, s, F.jobId)).jobName;
  });

  for (const width of [1920, 1024]) {
    test(`asks the AI Assistant with this schedule's id, inline, with no prompt picker (${width} wide)`, async ({ browser }, info) => {
      const { page, sends, asked } = await scheduleAssistant(browser, s, width);
      await expect(page.getByRole('heading', { name: /Schedule assistant/ })).toContainText(F.jobName);
      await expect(page.getByText('Other questions are answered by')).toHaveCount(0);
      await expect(page.locator('[data-test="ask-help"]')).toContainText('A question you type goes to the AI Assistant');
      const thread = page.locator('[data-test="schedule-conversation"] [data-embedded="schedule"]');
      await expect(thread).toContainText('AI Assistant · this schedule');

      // A quick button still answers from the schedule's own record, with no model.
      await page.getByRole('button', { name: 'Summary', exact: true }).click();
      await expect(page.locator('.card').filter({ hasText: 'Summary' }).first()).toBeVisible();

      // A typed question: the AI Assistant, about this schedule only.
      await page.getByRole('textbox', { name: 'Ask about this schedule' }).fill(QUESTION);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      await expect(thread).toContainText(ANSWER);
      expect(sends).toEqual([{ message: QUESTION, async: true, scopeJobId: F.jobId }]);
      await expect(thread.getByRole('link', { name: 'Open in AI Assistant' })).toHaveAttribute('href', '/ai/assistant?c=990301');
      expect(asked.filter(r => /fetchAllAgents|askAssistant/.test(r)), 'the saved prompts are never read or asked').toEqual([]);
      expect(asked.some(r => r.includes(`assistant/conversations?limit=1&scopeJobId=${F.jobId}`)), 'its newest conversation about this schedule').toBe(true);
      await shot(page, info, `schedule-assistant-${width}`);
      await page.context().close();
    });
  }

  test('a schedule the person cannot read starts nothing: refused before any conversation or model call (live)', async ({ request }) => {
    const said = await postJson(request, s, '/aiPrompt.json/assistant/send', { message: 'Why did it fail?', async: true, scopeJobId: 999999999 });
    expect(said.status).toBe('ERROR');
    expect(said.message).toBe('Schedule not found with 999999999 in this workspace.');
  });
});
