import { APIRequestContext, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api, authOf, canMintPeople, canSignIn, NEEDS, pageAs, Session, sessionAsPerson, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
import { generated, pasted, stamp, WOUND_DATA } from './support/report-studio';

/**
 * Reports redesign, phase 5, live in Riverside (synthetic wound clinic, fictional patients):
 *   - 14, the rule builder: a "Show only when" block's condition is rows of field, test and value; a change writes the
 *     conditional's `when` in media's expression language, and "Edit as text" shows it.
 *   - 15, the fax check: the designer shown as a fax lists what a black-and-white fax would lose (or says nothing would
 *     be), and Page settings offer Fax-safe.
 *   - 16, comments while reviewing: a comment pinned to a place on the report's page with a mention, a numbered pin on
 *     the page, a reply and a resolve through the API; a reader without See personal data gets the patient masked
 *     (server side); another workspace reaches none of them.
 * The template and report are "E2E phase 5 <stamp>", synthetic, and stay (the owner removes test data).
 */
const STAMP = stamp();
const NAME = `E2E phase 5 ${STAMP}`;
const ETL = resolve(process.cwd(), process.env['ETL_PLATFORM'] || '../../etl-platform');

let admin: Session;
let templateId = '';
let reportId = '';

/** Riverside's and Meridian's people, from the platform's rebuild state (ids only). */
function people(): { maskedReader: number; meridianAdmin: number } {
  const state = JSON.parse(readFileSync(resolve(ETL, '.state/demo/rebuild.json'), 'utf8'));
  return { maskedReader: state.workspaces.riverside.viewer, meridianAdmin: state.workspaces.meridian.admin };
}

async function data<T = any>(what: string, r: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  const body: any = await r.json().catch(() => ({}));
  expect(body.status, `${what}: ${body.message ?? r.status()}`).toBe('SUCCESS');
  return body.data as T;
}

/** A wound summary: a "Show only when" block over the worsening count, and the patient tagged personal. */
function definition(name: string): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    template: {
      name, category: 'Clinical quality', page: { size: 'A4', orientation: 'portrait' },
      datasets: [{ id: 'primary', rootPath: '$' }],
      dataContract: { fields: [{ path: 'clinic', type: 'string', label: 'Clinic' }, { path: 'visits', type: 'array', label: 'Visits' },
        { path: 'visits[*].patient', type: 'string', label: 'Patient', personal: true }] },
      components: [
        { id: 'title', type: 'heading', level: 1, content: name },
        { id: 'sub', type: 'text', content: '{{primary.clinic}} · fictional patients, synthetic data.' },
        { id: 'worse', type: 'conditional', name: 'Worsening wounds', condition: { left: 'primary.summary.worsening', operator: 'gt', right: 0 },
          children: [{ id: 'worseText', type: 'text', content: 'At least one wound is worsening: see the table.' }] },
        { id: 'visits', type: 'table', name: 'Wounds this visit', dataset: 'primary.visits', columns: [
          { id: 'p', field: 'patient', label: 'Patient' }, { id: 's', field: 'site', label: 'Site' }, { id: 'a', field: 'areaCm2', label: 'Area cm²' }] },
      ],
    },
  };
}

test.describe('Reports redesign phase 5: rule builder, fax check, review comments (live)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    const made = await data(`import ${NAME}`, await request.post(`${api}/reportTemplate.json/create`,
      { headers: authOf(admin), data: { from: 'IMPORT', name: NAME, tags: ['test'], definition: definition(NAME) } }));
    templateId = made.templateId;
    await data(`publish ${NAME}`, await request.post(`${api}/reportPublish.json/publish?templateId=${templateId}`,
      { headers: authOf(admin), data: { revision: made.draft.revision, changeSummary: 'E2E phase 5' } }));
    // A draft to edit in the designer (the published version stays as it is).
    await data('new draft', await request.post(`${api}/reportTemplate.json/newDraft?templateId=${templateId}`, { headers: authOf(admin), data: {} }));
    const job = await generated(request, admin, { templateId, name: `${NAME} · report`, source: pasted(WOUND_DATA) });
    reportId = job.reportId;
  });

  test('14: "Show only when" is a rule builder that writes the expression', async ({ browser, request }) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto(`/reports/templates/${templateId}/design`);
    await page.getByRole('tab', { name: 'Outline' }).click();
    await page.getByRole('list', { name: 'Layers' }).locator('.rsd-layer', { hasText: 'Worsening wounds' }).click();
    const props = page.getByRole('complementary', { name: 'Properties' });
    const builder = props.getByRole('group', { name: 'Show when' });
    await expect(builder).toBeVisible();
    await expect(builder.getByLabel('Rule 1 value')).toHaveValue('0');
    await builder.getByLabel('Rule 1 test').selectOption('gte');
    await builder.getByLabel('Rule 1 value').fill('2');
    await builder.getByLabel('Rule 1 value').press('Tab');
    await builder.getByRole('button', { name: 'Edit as text' }).click();
    await expect(builder.getByLabel('Show when, as an expression')).toHaveValue('primary.summary.worsening >= 2');
    // The draft saves itself: its conditional now has the expression and no structured condition.
    await expect.poll(async () => {
      const t = await data('the template', await request.get(`${api}/reportTemplate.json/fetchById?templateId=${templateId}`, { headers: authOf(admin) }));
      const c = (t.draft?.definition?.template?.components ?? []).find((x: any) => x.id === 'worse');
      return c ? `${c.when ?? ''}|${c.condition ? 'condition' : ''}` : '';
    }, { timeout: 20_000 }).toBe('primary.summary.worsening >= 2|');
    await page.close();
  });

  test('15: shown as a fax, the designer runs the fax check; Page settings offer Fax-safe', async ({ browser }) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto(`/reports/templates/${templateId}/design`);
    await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Fax (black and white)' }).click();
    await expect(page.locator('[data-fax-problems], [data-fax-status]').first()).toContainText(/Fax check/, { timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-fax-safe]')).toContainText('Fax-safe');
    await page.close();
  });

  test('16: a comment pinned to the page with a mention, a pin, a reply and a resolve', async ({ browser, request }) => {
    test.skip(!reportId, 'the report was not made');
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto(`/reports/library/${reportId}`);
    await page.locator('[data-test="viewer-comment"]').click();
    const sheet = page.locator('.rv-sheet');
    await expect(sheet).toHaveClass(/is-commenting/);
    const box = (await page.locator('.rv-sheet canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await expect(page.locator('[data-comment-anchor]')).toContainText('Page 1');
    await page.getByLabel('New comment').fill('Patient B (fictional): the area does not match the photo; re-measure.');
    await page.getByRole('form', { name: 'Add a comment' }).getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(page.locator('.rv-pin')).toHaveCount(1);
    await expect(page.locator('[data-thread]').first()).toContainText('the area does not match the photo');
    const listed = await data('comments', await request.get(`${api}/reportLibrary.json/comments?reportId=${reportId}&version=1`, { headers: authOf(admin) }));
    const thread = listed.threads[0];
    expect(thread.page).toBe(1);
    expect(thread.x).toBeGreaterThan(0.35);
    expect(thread.x).toBeLessThan(0.45);
    await data('reply', await request.post(`${api}/reportLibrary.json/comment`, { headers: authOf(admin),
      data: { reportId, version: 1, text: 'Re-measured: 9.4 cm².', replyTo: thread.commentId } }));
    const resolved = await data('resolve', await request.post(`${api}/reportLibrary.json/commentResolve`, { headers: authOf(admin),
      data: { commentId: thread.commentId } }));
    expect(resolved.threads[0].resolvedAt).toBeTruthy();
    expect(resolved.threads[0].replies).toHaveLength(1);
    await page.close();
  });

  test('16: a reader without See personal data gets the patient masked; another workspace reaches nothing', async ({ request }) => {
    test.skip(!reportId || !canMintPeople(), 'needs the report and the mint script');
    const { maskedReader, meridianAdmin } = people();
    const reader = await sessionAsPerson(request, maskedReader);
    const seen = await request.get(`${api}/reportLibrary.json/comments?reportId=${reportId}&version=1`, { headers: authOf(reader) });
    if (seen.status() === 200) {
      const body = (await seen.json()).data;
      expect(body.masked).toBe(true);
      expect(JSON.stringify(body)).not.toContain('Patient B');
      expect(body.threads[0].text).toContain('•••');
    } else {
      // A reader who may not open the report library is refused the comments as the report.
      expect(seen.status()).toBe(403);
    }
    const meridian = await sessionAsPerson(request, meridianAdmin);
    for (const r of [
      await request.get(`${api}/reportLibrary.json/comments?reportId=${reportId}&version=1`, { headers: authOf(meridian) }),
      await request.post(`${api}/reportLibrary.json/comment`, { headers: authOf(meridian), data: { reportId, version: 1, text: 'From Meridian', componentId: 'visits' } }),
      await request.get(`${api}/reportLibrary.json/templateComments?templateId=${templateId}`, { headers: authOf(meridian) }),
    ]) {
      expect(r.status()).toBe(404);
      expect(await r.text()).not.toContain('Patient B');
    }
  });
});
