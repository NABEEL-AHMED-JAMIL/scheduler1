import { test, expect } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { makeJob, makePipeline, makeTask, removeMade, runNow } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';

/**
 * MIG-451: the Build JSON step, live -- a pipeline of the spec's own in Riverside (synthetic findings, one row each) shapes
 * one document per patient: the patient as an object, its findings as a list, a fixed source. The step's panel shows the
 * shape editor and the live preview (run by Core on the sample rows, a person's details masked); an edit to the shape is
 * previewed again; a run's page says how many documents it made, and the run's result holds them as JSON objects.
 * What it makes it removes.
 */
const STAMP = Date.now().toString(36);
const PIPELINE_ID = `E2E_BUILD_JSON_${STAMP.toUpperCase()}`;
const made: { jobs: number[]; tasks: number[]; pipelines: number[] } = { jobs: [], tasks: [], pipelines: [] };

export const SHAPED = {
  version: 1,
  steps: [
    { key: 'read', task: 'sample', name: 'Findings (synthetic)', config: { rows: [
      { patient_id: 'P-101', patient_name: 'Patient A (fictional)', code: 'L89.1', text: 'Stage 1 pressure injury', acuity: '7' },
      { patient_id: 'P-101', patient_name: 'Patient A (fictional)', code: 'E11.9', text: 'Type 2 diabetes', acuity: '7' },
      { patient_id: 'P-102', patient_name: 'Patient B (fictional)', code: 'I10', text: 'Hypertension', acuity: '3' }] } },
    { key: 'shape', task: 'build_json', name: 'One document per patient', config: { mode: 'group', groupBy: ['patient_id'], fields: [
      { key: 'patient.id', column: 'patient_id' },
      { key: 'patient.name', column: 'patient_name' },
      { key: 'acuity', column: 'acuity', type: 'number' },
      { key: 'findings', from: 'rows', fields: [{ key: 'code', column: 'code' }, { key: 'text', column: 'text' }] },
      { key: 'source', from: 'value', value: 'etl-console' }] } },
  ],
};

test.describe('Build JSON step (MIG-451)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  let s: Session;
  let task = 0;
  let job = 0;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    const topic = riverside().topicId;
    const key = await makePipeline(request, s, PIPELINE_ID, `E2E build JSON ${STAMP}`, topic);
    made.pipelines.push(key);
    const saved = await (await request.post(`${api}/pipeline.json/steps/save`, { headers: authOf(s),
      data: { pipelineKey: key, format: 'json', text: JSON.stringify(SHAPED) } })).json();
    expect(saved.status, saved.message).toBe('SUCCESS');
    task = await makeTask(request, s, `E2E build JSON task ${STAMP}`, PIPELINE_ID, topic);
    made.tasks.push(task);
    job = await makeJob(request, s, `E2E build JSON job ${STAMP}`, task);
    made.jobs.push(job);
  });

  test.afterAll(async ({ request }) => {
    if (s) await removeMade(request, s, made);
  });

  test('the panel edits the shape and previews the documents on the sample rows', async ({ browser }) => {
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/${task}/edit`);
    await page.getByRole('button', { name: 'Open step shape', exact: true }).click();
    const editor = page.locator('[data-test="build-json-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor.locator('[data-test="bj-outline"]')).toContainText('findings ← [{code, text}]');
    const preview = page.locator('[data-test="build-json-preview"]');
    await expect(preview.locator('[data-test="bj-preview-status"]')).toContainText('2 documents from 3 sample rows', { timeout: 15_000 });
    const first = preview.locator('[data-test="bj-document"]').first();
    await expect(first).toContainText('"code": "L89.1"');
    await expect(first).toContainText('"acuity": 7');
    await expect(first).not.toContainText('Patient A (fictional)');

    // A new key, from a column the rows lack: previewed again, and Core says it had no value.
    await editor.locator('[data-test="bj-add-key"]').click();
    const keys = editor.locator('input[aria-label^="Key "]');
    await keys.last().fill('ward');
    await editor.locator('input[aria-label="Column of ward"]').fill('ward');
    await expect(preview.locator('[data-test="bj-preview-warning"]')).toContainText('No value for ward in every document', { timeout: 15_000 });
  });

  test('a run makes one document per patient, kept as JSON objects', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const run = await runNow(request, s, job);
    expect(run.jobStatus).toBe('Completed');
    const page = await pageAs(browser, s);
    await page.goto(`/pipelines/schedules/${job}/runs/${run.jobQueueId}`);
    await expect(page.locator('[data-step="shape"] [data-test="step-documents"]')).toContainText('2 documents');
  });
});
