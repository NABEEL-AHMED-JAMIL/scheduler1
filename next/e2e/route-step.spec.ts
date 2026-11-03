import { test, expect } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { makeJob, makePipeline, makeTask, removeMade, runNow } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';

/**
 * MIG-450: the Route step, live -- a pipeline of the spec's own in Riverside (synthetic referrals) routes its rows into
 * "urgent" and "routine", runs a step in each branch, and merges them again. The builder shows the branches, the flow
 * draws them side by side, and a run's page says the split and draws the branches on its map. What it makes it removes.
 */
const STAMP = Date.now().toString(36);
const PIPELINE_ID = `E2E_ROUTE_${STAMP.toUpperCase()}`;
const made: { jobs: number[]; tasks: number[]; pipelines: number[] } = { jobs: [], tasks: [], pipelines: [] };

export const ROUTED = {
  version: 1,
  steps: [
    { key: 'read', task: 'sample', name: 'Referrals (synthetic)', config: { rows: [
      { id: 1, patient: 'Patient A (fictional)', priority: 'urgent' }, { id: 2, patient: 'Patient B (fictional)', priority: 'routine' },
      { id: 3, patient: 'Patient C (fictional)', priority: 'urgent' }, { id: 4, patient: 'Patient D (fictional)', priority: 'routine' },
      { id: 5, patient: 'Patient E (fictional)', priority: 'routine' }] } },
    { key: 'triage', task: 'route', name: 'Urgent or routine', config: { branches: [
      { name: 'urgent', match: 'all', conditions: [{ column: 'priority', operator: 'eq', value: 'urgent' }] }], otherwise: 'routine' } },
    { key: 'second_opinion', task: 'compute', name: 'Ask for a second opinion', input: 'triage.urgent',
      config: { formulas: [{ target: 'follow_up_days', expression: '2' }] } },
    { key: 'routine_follow_up', task: 'compute', name: 'Routine follow-up', input: 'triage.routine',
      config: { formulas: [{ target: 'follow_up_days', expression: '14' }] } },
    { key: 'together', task: 'merge', name: 'Back together', config: { route: 'triage' } },
  ],
};

test.describe('Route step (MIG-450)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  let s: Session;
  let task = 0;
  let job = 0;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    const topic = riverside().topicId;
    const key = await makePipeline(request, s, PIPELINE_ID, `E2E route ${STAMP}`, topic);
    made.pipelines.push(key);
    const saved = await (await request.post(`${api}/pipeline.json/steps/save`, { headers: authOf(s),
      data: { pipelineKey: key, format: 'json', text: JSON.stringify(ROUTED) } })).json();
    expect(saved.status, saved.message).toBe('SUCCESS');
    task = await makeTask(request, s, `E2E route task ${STAMP}`, PIPELINE_ID, topic);
    made.tasks.push(task);
    job = await makeJob(request, s, `E2E route job ${STAMP}`, task);
    made.jobs.push(job);
  });

  test.afterAll(async ({ request }) => {
    if (s) await removeMade(request, s, made);
  });

  test('the builder says which branch each step is in, and the flow draws the branches into the merge', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/${task}/edit`);
    await expect(page.locator('[data-step="triage"] [data-test="route-branches"]')).toContainText('Branches: urgent, otherwise routine');
    await expect(page.locator('[data-step="second_opinion"]')).toHaveAttribute('data-branch', 'triage.urgent');
    await expect(page.locator('[data-step="second_opinion"] [data-test="step-branch"]')).toContainText('Branch urgent of triage');
    await expect(page.locator('[data-step="routine_follow_up"] [data-test="step-branch"]')).toContainText('Branch routine of triage');
    await expect(page.locator('[data-step="together"]')).not.toHaveAttribute('data-branch', /.+/);

    await page.getByText('Flow', { exact: true }).first().click();
    const flow = page.locator('app-flow-graph').first();
    await expect(flow).toBeVisible();
    // The edges out of the route and into the merge carry their branch's name.
    await expect(flow.getByText('urgent', { exact: true }).first()).toBeVisible();
    await expect(flow.getByText('routine', { exact: true }).first()).toBeVisible();
  });

  test('a run splits the rows, runs each branch on its own rows, and merges them', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const run = await runNow(request, s, job);
    expect(run.jobStatus).toBe('Completed');
    const timeline = await (await request.get(`${api}/sourceJob.json/stepExecutions?jobQueueId=${run.jobQueueId}`, { headers: authOf(s) })).json();
    const steps = (timeline.data?.steps ?? []) as { key: string; recordsIn: number; recordsOut: number; reads?: string[] }[];
    const byKey = new Map(steps.map(x => [x.key, x] as const));
    expect(byKey.get('second_opinion')?.recordsIn).toBe(2);
    expect(byKey.get('routine_follow_up')?.recordsIn).toBe(3);
    expect(byKey.get('together')?.recordsOut).toBe(5);
    expect(byKey.get('together')?.reads).toEqual(['second_opinion', 'routine_follow_up']);

    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${job}/runs/${run.jobQueueId}`);
    await expect(page.locator('[data-step="triage"] [data-test="step-branches"]')).toContainText('urgent 2 · routine 3');
  });
});
