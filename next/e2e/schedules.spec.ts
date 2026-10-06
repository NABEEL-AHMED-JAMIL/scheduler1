import { test, expect, APIRequestContext } from '@playwright/test';
import { canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { getJson, jobs, postJson, tasks } from './support/workspace';

/**
 * Wave 4: the Cron frequency in the schedule editor, end to end, as workspace 2924's administrator.
 *
 *  - The spec's own job, "E2E cron daily 0300" (Inactive, Cron `0 3 * * *`), opens with Cron chosen and its
 *    expression in the field, and without Repeat every. It is found by that name, or created once through the API on
 *    the registry chain task (MIG-330: it used to be job 2852, pinned) and left for the owner; it is never activated.
 *  - An expression Core refuses (`* * * * * *`: seconds are not 0) is refused on Save, and Core's sentence shows under
 *    the field. The refusal writes nothing; the editor is then left with Cancel. Nothing else is saved.
 *
 * Sign-in through support/session.ts: E2E_TENANT_ADMIN_TOKEN (4537 of 2924), or E2E_TENANT_ADMIN(_PASSWORD).
 */
const CRON_JOB_NAME = 'E2E cron daily 0300';
const TASK_NAME = 'UI-CHECK registry chain task 0929';
let CRON_JOB = Number(process.env['E2E_CRON_JOB'] ?? 0);

/** The spec's Inactive Cron job, by name, made once when the workspace has none. */
async function cronJob(request: APIRequestContext, s: Session): Promise<number> {
  const found = (await jobs(request, s)).find(j => j.jobName === CRON_JOB_NAME);
  if (found) return found.jobId;
  const all = await tasks(request, s);
  const task = all.find(t => t.taskName === TASK_NAME) ?? all.find(t => t.taskStatus === 'Active');
  expect(task, 'a task to hang the Cron job on').toBeTruthy();
  const made = await postJson(request, s, '/sourceJob.json/addSourceJob', {
    jobName: CRON_JOB_NAME, taskDetail: { taskDetailId: task!.taskDetailId }, execution: 'Auto', priority: 1, maxAttempts: 1,
    retryBackoffSeconds: 30, jobStatus: 'Inactive', completeJob: false, failJob: false, skipJob: false,
    schedulers: [{ startDate: null, startTime: '00:00', frequency: 'Cron', intervalValue: '1', cronExpression: '0 3 * * *',
      daysOfWeek: null, dayOfMonth: null }],
  });
  expect(made.status, `create ${CRON_JOB_NAME}: ${made.message}`).toBe('SUCCESS');
  return (await jobs(request, s)).find(j => j.jobName === CRON_JOB_NAME)!.jobId;
}

test.describe('Schedules: Cron', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  let s: Session;
  let before: Record<string, unknown>;
  const detail = async (request: APIRequestContext) =>
    (await getJson(request, s, `/sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=${CRON_JOB}`)).data;

  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    CRON_JOB ||= await cronJob(request, s);
    before = await detail(request);
    // The fixture must be what the spec says it is, and it is never activated here.
    expect(before?.['jobStatus'], `job ${CRON_JOB} is Inactive`).toBe('Inactive');
    expect((before?.['scheduler'] as Record<string, unknown>)?.['frequency']).toBe('Cron');
  });

  test('a Cron job opens on its expression; one Core refuses shows its reason under the field', async ({ browser, request }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${CRON_JOB}/edit`);
    await expect(page.locator('#frequency')).toHaveValue('Cron');
    const field = page.locator('#cronExpression');
    await expect(field).toHaveValue('0 3 * * *');
    await expect(page.locator('#interval')).toHaveCount(0);
    await expect(page.getByText('03:00 every day')).toBeVisible();

    await field.fill('* * * * * *');
    const saved = page.waitForResponse(r => r.url().includes('/sourceJob.json/updateSourceJob'));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await saved;
    const note = page.locator('#cronExpression').locator('xpath=ancestor::app-field[1]');
    await expect(note).toContainText('at most once a minute');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(new RegExp(`/pipelines/schedules/${CRON_JOB}/edit$`));

    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/pipelines\/schedules$/);
    await page.context().close();

    // The refusal wrote nothing.
    const after = await detail(request);
    expect(after['jobStatus']).toBe('Inactive');
    expect((after['scheduler'] as Record<string, unknown>)['cronExpression']).toBe('0 3 * * *');
  });
});
