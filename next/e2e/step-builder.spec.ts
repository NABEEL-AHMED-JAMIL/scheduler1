import { test, expect, APIRequestContext, Page, Response } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { pipelineById, tasks } from './support/workspace';

/**
 * MIG-249: the step builder end to end, as a workspace administrator, on the UI-CHECK pipeline UI_CHECK_STEPS_0928,
 * its task and the manual job that runs it (FOUND by that pipeline id at start -- MIG-330; they were pinned as 100175,
 * 1864 and 2848): add a step from the Task Registry and
 * fill it in the side panel, reorder by button and by drag, delete, see a validation error land on its step, edit the
 * YAML and save it, save a builder edit, prove the YAML and the builder store the same definition, then Run now and
 * watch every step complete. A Filter step is built with the registry's widgets (a repeatable group, a column picked
 * from the rows before it).
 *
 * Every save writes a new version of UI_CHECK_STEPS_0928 -- a UI-CHECK pipeline, left in place for the owner to clear. The shared
 * legacy pipeline 100167 (REF_CSV_CHECK_V1, used by 15 jobs) is never saved to: this spec refuses to run if the task found
 * has been moved onto another pipeline.
 *
 * Needs Core (MIG-230) behind :9098 and a console at E2E_BASE_URL that has MIG-249 (e.g. `ng serve --port 4415`).
 * Sign-in through support/session.ts: E2E_TENANT_ADMIN_TOKEN (4537 of 2924), or E2E_TENANT_ADMIN(_PASSWORD).
 */
const PIPELINE_ID = process.env['E2E_STEPS_PIPELINE_ID'] ?? 'UI_CHECK_STEPS_0928';
/** Found at start by PIPELINE_ID unless pinned: the pipeline's key, and the task on it. */
let TASK = Number(process.env['E2E_STEPS_TASK'] ?? 0);
let PIPELINE_KEY = Number(process.env['E2E_STEPS_PIPELINE_KEY'] ?? 0);
const STAMP = Date.now().toString(36);

/** The two steps the pipeline is put back to before the run: a sample, then a select that renames name. */
const BASELINE = {
  version: 1,
  steps: [
    { key: 'read', task: 'sample', config: { rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } },
    { key: 'keep', task: 'select', config: { columns: { name: 'patient' } } },
  ],
};


/** The save's own answer, not its CORS preflight (which has no body). */
const saveAnswer = (r: Response) => r.url().includes('/pipeline.json/steps/save') && r.request().method() === 'POST';

/**
 * Presses Save and reads what the builder then says, with the format the request sent. The answer's body is not read
 * off the wire: Chromium does not always keep a cross-origin POST's body for the test to fetch.
 */
async function save(page: Page): Promise<{ format: string; message: string }> {
  const answer = page.waitForResponse(saveAnswer);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await answer;
  expect(response.status()).toBe(200);
  const notice = page.locator('.step-notice-ok');
  await expect(notice).toContainText(/Saved as version \d+\.|Unchanged: /);
  return { format: JSON.parse(response.request().postData() ?? '{}').format, message: (await notice.innerText()).trim() };
}

const cards = (page: Page) => page.locator('.step-card').evaluateAll(els => els.map(e => e.getAttribute('data-step')));

async function stored(request: APIRequestContext, s: Session): Promise<{ definition: unknown; version: number }> {
  const body = await (await request.get(`${api}/pipeline.json/steps/definition?pipelineKey=${PIPELINE_KEY}`,
    { headers: authOf(s) })).json();
  expect(body.status).toBe('SUCCESS');
  return { definition: body.data.definition, version: body.data.version };
}

test.describe('Step builder', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);

  let s: Session;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    const headers = authOf(s);
    PIPELINE_KEY ||= (await pipelineById(request, s, PIPELINE_ID)).pipelineKey;
    if (!TASK) {
      const task = (await tasks(request, s)).find(t => t.pipelineId === PIPELINE_ID);
      expect(task, `a task on ${PIPELINE_ID}`).toBeTruthy();
      TASK = task!.taskDetailId;
    }
    // Never the shared legacy pipeline: the task must still be on the UI-CHECK one.
    const task = await (await request.get(`${api}/sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=${TASK}`, { headers })).json();
    expect(task.data?.pipelineId, `task ${TASK} is on ${PIPELINE_ID}`).toBe(PIPELINE_ID);
    // A known start: the two baseline steps (no new version when they are already the latest).
    const reset = await (await request.post(`${api}/pipeline.json/steps/save`, { headers,
      data: { pipelineKey: PIPELINE_KEY, format: 'json', text: JSON.stringify(BASELINE) } })).json();
    expect(reset.status, reset.message).toBe('SUCCESS');
  });

  test('build, validate, edit YAML, save, run', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/${TASK}/edit`);

    // A pipeline with steps opens on them, Details beside.
    await expect(page.getByRole('tab', { name: 'Steps' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
    await expect.poll(() => cards(page)).toEqual(['read', 'keep']);

    // Add step from the Task Registry: it opens in the side panel.
    await page.locator('#addStep').click();
    await page.locator('#addStep').fill('select');
    await expect(page.getByRole('listbox').getByText('Process', { exact: true })).toBeVisible();
    await page.getByRole('option', { name: /^Select columns/ }).click();
    const panel = page.getByRole('dialog', { name: /^Step 3/ });
    await expect(panel).toBeVisible();
    await panel.locator('#stepKey').fill('extra');
    // The registry's configSchema draws the settings; select's columns (a list or a rename map) is a JSON box in it.
    await expect(panel.getByText('Fail on a missing column')).toBeVisible();
    await panel.locator('#cfg-columns').fill('["patient"]');
    await panel.getByRole('button', { name: 'Apply' }).click();
    await expect.poll(() => cards(page)).toEqual(['read', 'keep', 'extra']);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

    // Reorder: a button, then a drag by the handle, then a button back.
    await page.getByRole('button', { name: 'Move extra up' }).click();
    await expect.poll(() => cards(page)).toEqual(['read', 'extra', 'keep']);
    // A drag the way a hand makes one: press on the handle, move over the first card, let go.
    const handle = await page.getByRole('button', { name: /^Reorder extra/ }).boundingBox();
    const target = await page.locator('[data-step="read"]').boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target!.x + 40, target!.y + target!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => cards(page)).toEqual(['extra', 'read', 'keep']);
    // Chromium ends a drag session a beat after the drop; a click inside that beat is part of the drag.
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Move extra down' }).click();
    await expect.poll(() => cards(page)).toEqual(['read', 'extra', 'keep']);
    await page.getByRole('button', { name: 'Move extra down' }).click();
    await expect.poll(() => cards(page)).toEqual(['read', 'keep', 'extra']);

    // Delete: back to what is saved.
    await page.getByRole('button', { name: 'Delete step extra' }).click();
    await expect.poll(() => cards(page)).toEqual(['read', 'keep']);
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);

    // A validation error points at its step.
    await page.getByRole('tab', { name: 'JSON' }).click();
    const json = page.locator('#definitionJson');
    const broken = JSON.parse(await json.inputValue());
    broken.steps[1].retry = { maxAttempts: 99 };
    await json.fill(JSON.stringify(broken, null, 2));
    await page.getByRole('button', { name: 'Validate' }).click();
    await page.getByRole('tab', { name: 'Steps' }).click();
    const keep = page.locator('[data-step="keep"]');
    await expect(keep).toHaveClass(/has-problems/);
    await expect(keep).toContainText('retry.maxAttempts');
    await expect(page.locator('[data-step="read"]')).not.toHaveClass(/has-problems/);
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(keep).not.toHaveClass(/has-problems/);

    // Edit the YAML and save it as typed.
    await page.getByRole('tab', { name: 'YAML' }).click();
    const yaml = page.locator('#definitionYaml');
    const person = `person_${STAMP}`;
    const typed = (await yaml.inputValue()).replace(/name: patient\b/, `name: ${person}`);
    expect(typed).toContain(person);
    await yaml.fill(typed);
    const yamlSaved = await save(page);
    expect(yamlSaved.format).toBe('yaml');
    expect(yamlSaved.message).toMatch(/^Saved as version \d+\.$/);
    const afterYaml = await stored(request, s);
    expect(JSON.stringify(afterYaml.definition)).toContain(person);
    // Builder <-> YAML <-> JSON: the builder and the JSON tab now show exactly what the server stored.
    await page.getByRole('tab', { name: 'JSON' }).click();
    expect(JSON.parse(await json.inputValue())).toEqual(afterYaml.definition);
    await page.getByRole('tab', { name: 'Steps' }).click();
    await expect(page.locator('[data-step="keep"]')).toContainText('select');

    // A builder edit back to the baseline, saved from the builder.
    await page.getByRole('button', { name: 'Edit step keep' }).click();
    const keepPanel = page.getByRole('dialog', { name: /^Step 2/ });
    await keepPanel.locator('#cfg-columns').fill('{"name": "patient"}');
    await keepPanel.getByRole('button', { name: 'Apply' }).click();
    const builderSaved = await save(page);
    expect(builderSaved.format).toBe('json');
    const afterBuilder = await stored(request, s);
    expect(afterBuilder.definition).toEqual(BASELINE);

    // The same definition typed as YAML in another layout is the same stored JSON: no new version.
    await page.getByRole('tab', { name: 'YAML' }).click();
    await yaml.fill([
      'version: 1',
      'steps:',
      '  - {key: read, task: sample, config: {rows: [{id: 1, name: Ada}, {id: 2, name: Bo}]}}',
      '  - key: keep',
      '    task: select',
      '    config: {columns: {name: patient}}',
      '',
    ].join('\n'));
    const same = await save(page);
    expect(same.format).toBe('yaml');
    expect(same.message).toBe(`Unchanged: version ${afterBuilder.version} is this definition.`);
    expect((await stored(request, s)).version).toBe(afterBuilder.version);

    // A Filter step built with the registry's widgets: a repeatable group, a column picked from the rows before it.
    await page.getByRole('tab', { name: 'Steps' }).click();
    await page.locator('#addStep').click();
    await page.locator('#addStep').fill('filter');
    await page.getByRole('option', { name: /^Filter/ }).click();
    const filterPanel = page.getByRole('dialog', { name: /^Step 3/ });
    await filterPanel.locator('#stepKey').fill('kept');
    await filterPanel.getByRole('button', { name: 'Add a row to Conditions' }).click();
    const column = filterPanel.locator('#cfg-conditions-0-column');
    expect(await filterPanel.locator(`#${await column.getAttribute('list')} option`).evaluateAll(os => os.map(o => o.getAttribute('value'))))
      .toEqual(['patient']);
    await column.fill('patient');
    await filterPanel.locator('#cfg-conditions-0-operator').selectOption({ label: 'not_null' });
    await filterPanel.getByRole('button', { name: 'Apply' }).click();
    await expect.poll(() => cards(page)).toEqual(['read', 'keep', 'kept']);
    expect((await save(page)).format).toBe('json');
    expect((await stored(request, s)).definition).toEqual({ ...BASELINE, steps: [...BASELINE.steps,
      { key: 'kept', task: 'filter', config: { match: 'all', conditions: [{ ignoreCase: false, column: 'patient', operator: 'not_null' }] } }] });

    // Run now: the run's steps, followed until all complete.
    await page.getByRole('button', { name: 'Run now' }).click();
    const drawer = page.getByRole('dialog', { name: /^Run #/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-run-step="read"]')).toContainText('Completed', { timeout: 60_000 });
    await expect(drawer.locator('[data-run-step="keep"]')).toContainText('Completed', { timeout: 60_000 });
    await expect(drawer.locator('[data-run-step="keep"]')).toContainText('2 in → 2 out');
    await expect(drawer.locator('[data-run-step="kept"]')).toContainText('Completed', { timeout: 60_000 });
    await expect(drawer.locator('[data-run-step="kept"]')).toContainText('2 in → 2 out');
    await drawer.locator('[data-run-step="read"]').getByRole('button', { name: 'Show log' }).click();
    await expect(drawer.locator('.run-log')).toContainText('2 sample row(s).');
  });

  test('a workspace administrator switches a task off and back to its default', async ({ browser, request }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/${TASK}/edit?tab=settings`);
    const row = page.locator('[data-task="aggregate"]');
    await expect(row).toContainText('On');
    // An unavailable task cannot be switched on: write_database waits for an owner decision (integration connections are read-only).
    await expect(page.locator('[data-task="write_database"] input[role="switch"]')).toBeDisabled();
    await row.getByRole('switch').uncheck();
    await expect(row).toContainText('Switched off in this workspace.');
    await page.getByRole('tab', { name: 'Steps' }).click();
    await page.locator('#addStep').click();
    await page.locator('#addStep').fill('aggregate');
    await expect(page.getByRole('option', { name: /^Aggregate \(disabled\)/ })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Settings' }).click();
    await row.getByRole('button', { name: 'Put Aggregate back to its default' }).click();
    await expect(row).not.toContainText('Switched here');
    const line = (await (await request.get(`${api}/pipeline.json/steps/tasks`, { headers: authOf(s) })).json())
      .data.find((t: { code: string }) => t.code === 'aggregate');
    expect(line).toMatchObject({ enabled: true, overridden: false });
  });

  test('a legacy task keeps its form', async ({ browser }) => {
    const page = await pageAs(browser, s);
    // 1854 is on the shared legacy pipeline: only read here.
    await page.goto('/pipelines/1854/edit');
    await expect(page.locator('#payload, #taskName').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Steps' })).toHaveCount(0);
    await expect(page.locator('app-step-builder')).toHaveCount(0);
  });
});
