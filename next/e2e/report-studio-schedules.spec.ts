import { APIRequestContext, expect, test } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
import { approve, stamp } from './support/report-studio';

/**
 * Report schedules, live (reports redesign, features 3 and 4): one schedule through its life, in Riverside.
 *   - Made on the schedule page as Riverside's administrator: a template, a saved data file (synthetic wound visits of three
 *     fictional patients), one report per patient named from the data, the reviewer emailed a sign-in link, the PDF into
 *     Riverside's bucket folder, the webhook event. "Make the first 3 now (test)" draws three DRAFT reports and stores none;
 *     the checks say the bucket folder is writable; "Save and turn on" opens the schedule.
 *   - Run now makes three reports (job source SCHEDULE), each waiting for approval and DRAFT until then.
 *   - Riverside's reviewer approves one: it is delivered to the library, by email, into the bucket and to the webhooks;
 *     the mail (read back from the local mail catcher when it is there) carries the link and no patient data.
 * The schedule is paused at the end so it never runs by itself. Everything is "E2E schedule <stamp>", synthetic, and stays.
 */
const STAMP = stamp();
const NAME = `E2E schedule ${STAMP}`;
const TEMPLATE = `E2E visit summary ${STAMP}`;
const BUCKET = 'riverside-health-s3';
const ROWS = ['P-9101', 'P-9102', 'P-9101', 'P-9103'].map((p, i) => ({ patient_id: p, visit_date: '2026-10-2' + (i + 1), site: ['Left heel', 'Sacrum',
  'Left heel', 'Right shin'][i], area_cm2: [4.1, 9.6, 3.8, 6.3][i] }));

let admin: Session;
let reviewer: Session;
let templateId = '';
let scheduleId = '';
let reportId = '';

async function data<T = any>(what: string, r: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  const body: any = await r.json().catch(() => ({}));
  expect(body.status, `${what}: ${body.message ?? r.status()}`).toBe('SUCCESS');
  return body.data as T;
}

/** A per-visit summary template reading the rows of one patient (a list at the data's root). */
function visitTemplate(name: string): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    template: {
      name, category: 'Clinical quality', page: { size: 'A4', orientation: 'portrait' },
      datasets: [{ id: 'primary', rootPath: '$' }],
      components: [
        { id: 'title', type: 'heading', level: 1, content: name },
        { id: 'sub', type: 'text', content: 'Fictional patients, synthetic data. For a clinician to review.' },
        { id: 'visits', type: 'table', title: 'Visits', dataset: 'primary', emptyState: 'No visits.', columns: [
          { id: 'p', field: 'patient_id', label: 'Patient' }, { id: 'd', field: 'visit_date', label: 'Visit' },
          { id: 's', field: 'site', label: 'Site' }, { id: 'a', field: 'area_cm2', label: 'Area cm²' }] },
      ],
    },
  };
}

test.describe('Report schedules: make, test, run, approve and deliver (live)', () => {
  test.skip(!canSignIn('admin') || !canSignIn('user'), `${NEEDS.admin}; ${NEEDS.user}`);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  test.beforeAll(async ({ request }) => {
    admin = await sessionFor(request, 'admin');
    reviewer = await sessionFor(request, 'user');
    const made = await data(`import ${TEMPLATE}`, await request.post(`${api}/reportTemplate.json/create`,
      { headers: authOf(admin), data: { from: 'IMPORT', name: TEMPLATE, definition: visitTemplate(TEMPLATE) } }));
    templateId = made.templateId;
    await data(`publish ${TEMPLATE}`, await request.post(`${api}/reportPublish.json/publish?templateId=${templateId}`,
      { headers: authOf(admin), data: { revision: made.draft.revision, changeSummary: 'E2E' } }));
    await data('upload the visits', await request.post(`${api}/reportData.json/upload`, { headers: authOf(admin),
      multipart: { name: `E2E wound visits ${STAMP}`, file: { name: 'visits.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ROWS)) } } }));
  });

  test('the page: pick, test the first 3 (DRAFT, nothing kept), check the folder, save and turn on', async ({ browser, request }) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1200 } });
    await page.goto('/reports/schedules/new');
    await expect(page.getByRole('heading', { level: 1, name: /New schedule/ })).toBeVisible();
    await page.locator('[data-test="sched-name"]').fill(NAME);
    // The lists are long (and drawn as they scroll): each is searched first.
    await page.locator('#sp-template').click();
    await page.getByPlaceholder('Search templates').fill(TEMPLATE);
    await page.getByRole('option', { name: new RegExp(TEMPLATE) }).click();
    await page.locator('#sp-source').click();
    await page.getByPlaceholder('Search pipelines and sources').fill(`E2E wound visits ${STAMP}`);
    await page.getByRole('option', { name: new RegExp(`E2E wound visits ${STAMP}`) }).click();
    await expect(page.locator('[data-test="sched-data-note"]')).toContainText('4 rows read');
    await page.locator('#sp-group').click();
    await page.getByRole('option', { name: 'patient_id', exact: true }).click();
    await page.locator('[data-test="sched-pattern"]').fill('Visit summary · {patient_id} · {date}');
    await expect(page.locator('[data-test="sched-example"]')).toContainText('Visit summary · P-9101 ·');
    await page.locator('[data-test="sched-email"]').check();
    await page.getByRole('button', { name: /Add a person/ }).click();
    await page.getByPlaceholder('Search people').fill((reviewer.fullName ?? 'Alex Morgan').split(',')[0]);
    await page.getByRole('option', { name: new RegExp((reviewer.fullName ?? 'Alex Morgan').split(',')[0], 'i') }).first().click();
    await page.locator('[data-test="sched-bucket"]').check();
    await page.locator('[data-test="sched-path"]').fill(`e2e/schedules/${STAMP}/{date}/`);
    await page.locator('[data-test="sched-webhook"]').check();

    const before = await data('reports before', await request.get(`${api}/reportLibrary.json/reports?q=${encodeURIComponent('Visit summary · P-91')}`,
      { headers: authOf(admin) }));
    await page.locator('[data-test="sched-test"]').click();
    await expect(page.locator('[data-test="sched-tests"]').locator('figure')).toHaveCount(3, { timeout: 60_000 });
    await expect(page.locator('[data-test="sched-checks"]')).toContainText('3 test reports made without problems');
    const after = await data('reports after', await request.get(`${api}/reportLibrary.json/reports?q=${encodeURIComponent('Visit summary · P-91')}`,
      { headers: authOf(admin) }));
    expect(after.total, 'a test keeps nothing').toBe(before.total);

    await page.locator('[data-test="sched-check-folder"]').click();
    await expect(page.locator('[data-test="sched-checks"]')).toContainText('The bucket folder is writable.', { timeout: 30_000 });
    await page.locator('[data-test="sched-save"]').click();
    await page.waitForURL(/\/reports\/schedules\/[0-9A-Z]{26}$/);
    scheduleId = page.url().split('/').pop()!;
    await expect(page.locator('[data-test="sched-state"]')).toHaveText('On');
  });

  test('Run now makes one report per patient, DRAFT and waiting for approval', async ({ request }) => {
    await data('run now', await request.post(`${api}/reportGenerate.json/runSchedule?scheduleId=${scheduleId}`, { headers: authOf(admin) }));
    let run: any;
    await expect.poll(async () => {
      const s = await data('schedule', await request.get(`${api}/reportGenerate.json/schedule?scheduleId=${scheduleId}`, { headers: authOf(admin) }));
      run = s.runs[0];
      return run?.status;
    }, { timeout: 120_000, intervals: [2_000] }).toBe('DONE');
    expect(run.reportsMade).toBe(3);
    const detail = await data('run', await request.get(`${api}/reportGenerate.json/scheduleRun?runId=${run.runId}`, { headers: authOf(admin) }));
    expect(detail.reports.map((r: any) => r.name.replace(/ · \d{4}-\d{2}-\d{2}$/, ''))).toEqual(['Visit summary · P-9101', 'Visit summary · P-9102',
      'Visit summary · P-9103']);
    expect(detail.reports[0].rows).toBe(2);
    reportId = detail.reports[0].reportId;
    const link = await data('link', await request.post(`${api}/reportLibrary.json/downloadLink`, { headers: authOf(admin),
      data: { reportId, version: 1, format: 'PDF' } }));
    const file = await request.get(`${api}/reportLibrary.json/download?token=${encodeURIComponent(link.token)}`, { headers: authOf(admin) });
    expect(file.headers()['content-disposition']).toContain('DRAFT-');
  });

  test('approved by the reviewer, it goes to the library, the email, the bucket and the webhooks', async ({ request, browser }) => {
    await approve(request, reviewer, reportId, 1);
    await expect.poll(async () => {
      const d = await data('deliveries', await request.get(`${api}/reportLibrary.json/deliveries?reportId=${reportId}`, { headers: authOf(admin) }));
      return d.deliveries.map((x: any) => `${x.channel}:${x.status}`).sort().join(' ');
    }, { timeout: 90_000, intervals: [3_000] }).toBe('BUCKET:SENT EMAIL:SENT LIBRARY:SENT WEBHOOK:SENT');

    // The folder is the run's date; in it, the approved PDF named by its number.
    const list = async (prefix: string) => data<any>('bucket', await request.get(`${api}/storage.json/listObjects?bucket=${BUCKET}`
      + `&prefix=${encodeURIComponent(prefix)}&maxKeys=50`, { headers: authOf(admin) }));
    const day = (await list(`e2e/schedules/${STAMP}/`)).objects.find((o: any) => o.folder);
    expect(day?.key).toMatch(new RegExp(`^e2e/schedules/${STAMP}/\\d{4}-\\d{2}-\\d{2}/$`));
    expect(JSON.stringify(await list(day.key))).toMatch(/RPT-\d{4}-v1\.pdf/);

    // The mail, when the local mail catcher answers: the link, the number, no patient and not the report's name.
    const caught = await request.get('http://127.0.0.1:4566/_aws/ses').catch(() => null);
    if (caught?.ok()) {
      const mails = ((await caught.json()).messages ?? []).filter((m: any) => (m.RawData ?? '').includes(`/reports/library/${reportId}`));
      expect(mails.length).toBeGreaterThan(0);
      const raw: string = mails[mails.length - 1].RawData;
      expect(raw).toContain('Open the report');
      expect(raw).not.toContain('P-9101');
      expect(raw).not.toContain('Visit summary ·');
    }

    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1200 } });
    await page.goto(`/reports/schedules/${scheduleId}`);
    await expect(page.locator('[data-test="sched-deliveries"]')).toContainText('Bucket folder');
    await page.locator('[data-test="sched-pause"]').click();
    await expect(page.locator('[data-test="sched-state"]')).toHaveText('Paused');
  });
});
