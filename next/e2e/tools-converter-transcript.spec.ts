import { test, expect, Browser, Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { api, authOf, canMintPeople, pageAs, Session, sessionAsPerson } from './support/session';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { LOCAL_BUILD_USE, useLocalBuild } from './support/local-build';

/**
 * The tools redesign (owner-approved 2026-11-02; Option A since the evening), end to end against the live media-service,
 * LibreOffice and the transcriber, as Riverside Health's synthetic administrator: the Document Converter's history as the
 * page (facets, the drop strip, files converting at the top, the side panel with the result beside its original), and
 * Audio Transcript's list (facets, the side panel), the new transcript over it, and a transcript's own page (?id=: search,
 * a click on a time to play, one "All speakers" filter, speakers, details, exports).
 *
 * Everything is synthetic: the documents and recordings under e2e/fixtures/tools/ (invented, no patient; two-voices-visit.m4a
 * was spoken by macOS `say` in two voices). What it leaves, as the platform's rule is for test data: the conversions it
 * made (listed 30 days, then removed), one result kept in <bucket>/e2e/tools/converted/, and the recordings it transcribed
 * (each bills about one audio minute to Riverside). E2E_SHOTS: a folder the screenshots are also written to.
 */
const FIX = join(__dirname, 'fixtures', 'tools');
const HEARD = /blood|pressure|patient|ward/i;

let s: Session;
let BUCKET = '';

async function signedIn(browser: Browser, width = 1920): Promise<Page> {
  const page = await pageAs(browser, s, { viewport: { width, height: 1080 }, acceptDownloads: true });
  await useLocalBuild(page);
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

test.use({ ...LOCAL_BUILD_USE, testIdAttribute: 'data-test' });

test.describe('Tools redesign: Document Converter and Audio Transcript (live)', () => {
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.skip(!canMintPeople(), 'needs the mint script for Riverside\'s administrator');

  test.beforeAll(async ({ request }) => {
    s = await sessionAsPerson(request, riverside().admin);
    BUCKET = riverside().storageAlias;
  });

  // ------------------------------------------------------------------------------------------------- the converter's API

  test('a conversion is recorded, rendered page by page, and a refusal is recorded too', async ({ request }) => {
    test.setTimeout(180_000);
    const made = await (await request.post(`${api}/documentConverter.json/conversions`, { headers: authOf(s), timeout: 120_000, multipart: {
      file: { name: 'discharge-note.txt', mimeType: 'text/plain', buffer: readFileSync(join(FIX, 'discharge-note.txt')) }, outputFormat: 'pdf' } })).json();
    expect(made.status, made.message).toBe('SUCCESS');
    const row = made.data;
    expect(row).toMatchObject({ outcome: 'DONE', inputFormat: 'txt', outputFormat: 'pdf' });
    expect(row.outputPages).toBeGreaterThan(0);
    expect(row.keptIn ?? null).toBeNull();
    expect(row.expiresAt, 'kept 30 days when not kept in a bucket').toBeTruthy();
    expect((row.checks ?? []).map((c: { key: string }) => c.key)).toContain('text');

    const page = await request.get(`${api}/documentConverter.json/conversions/${row.conversionId}/page`, { headers: authOf(s), params: { side: 'output', page: 1 } });
    expect(page.status()).toBe(200);
    expect(page.headers()['content-type']).toContain('image/png');
    expect(Number(page.headers()['x-page-count'])).toBe(row.outputPages);
    const file = await request.get(`${api}/documentConverter.json/conversions/${row.conversionId}/file`, { headers: authOf(s), params: { side: 'output' } });
    expect((await file.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const listed = await (await request.get(`${api}/documentConverter.json/conversions`, { headers: authOf(s), params: { view: 'mine', days: '7', page: '1', size: '50' } })).json();
    expect(listed.data.rows.some((r: { conversionId: number }) => r.conversionId === row.conversionId)).toBe(true);

    // Over the limit: refused in words, and listed under Failed with what to do.
    const big = await (await request.post(`${api}/documentConverter.json/conversions`, { headers: authOf(s), timeout: 120_000, multipart: {
      file: { name: 'too-big-note.txt', mimeType: 'text/plain', buffer: Buffer.alloc(51 * 1024 * 1024, 'a') }, outputFormat: 'pdf' } })).json();
    expect(big.data).toMatchObject({ outcome: 'FAILED', errorCode: 'TOO_LARGE' });
    const failed = await (await request.get(`${api}/documentConverter.json/conversions`, { headers: authOf(s), params: { view: 'failed', days: '7', page: '1', size: '50' } })).json();
    expect(failed.data.failedCount).toBeGreaterThan(0);
    expect(failed.data.rows.every((r: { outcome: string }) => r.outcome === 'FAILED')).toBe(true);
  });

  // ------------------------------------------------------------------------------------------------ the converter screen

  test('Option A: files convert at once at the top of the history, a recording is refused, a row opens the side panel', async ({ browser }, info) => {
    test.setTimeout(240_000);
    const page = await signedIn(browser);
    await page.goto('/tools/converter');
    await expect(page.getByTestId('converter-drop')).toContainText('Drop files to convert');
    await expect(page.getByTestId('converter-drop')).toContainText('up to 20 at once');
    // The panel is there only once something is chosen.
    await expect(page.locator('app-conversion-panel')).toHaveCount(0);
    await page.getByTestId('converter-files').setInputFiles([join(FIX, 'discharge-note.txt'), join(FIX, 'discharge-summary.html'),
      join(FIX, 'ward-round-note.mp3')]);
    const refused = page.locator('tr[data-file="ward-round-note.mp3"]');
    await expect(refused).toContainText('Not supported');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    // Converted with nothing else pressed: each lands in the history as Done.
    const note = page.locator('tbody tr', { hasText: 'discharge-note' }).first();
    await expect(note).toContainText('Done', { timeout: 180_000 });
    await expect(note).toContainText('TXT → PDF');
    await expect(page.locator('tbody tr', { hasText: 'discharge-summary' }).first()).toContainText('Done', { timeout: 180_000 });
    await refused.click();
    await expect(page.getByTestId('panel-problem')).toContainText('A recording, not a document.');

    await note.click();
    const panel = page.locator('app-conversion-panel');
    await expect(panel.getByTestId('panel-meta')).toContainText(/TXT → PDF · [\d.]+ s/);
    await expect(panel.getByTestId('preview-page')).toContainText(/Page 1 of \d+/);
    await expect(panel.getByTestId('preview-result').locator('img')).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByTestId('preview-checks')).toBeVisible();
    await panel.getByRole('tab', { name: 'Original' }).click();
    await expect(panel.getByTestId('preview-original')).toBeVisible();
    await panel.getByRole('tab', { name: 'Details' }).click();
    await expect(panel.getByTestId('panel-details')).toContainText('discharge-note.txt');
    await expect(panel.getByTestId('panel-kept')).toContainText(/Kept until/);
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('preview-download').click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await shot(page, info, 'converter-1920');
    await page.setViewportSize({ width: 1024, height: 1080 });
    await shot(page, info, 'converter-1024');

    // Keep the result in a bucket from ⋮: the panel then says where.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await panel.getByTestId('panel-more').click();
    await page.getByTestId('preview-keep').click();
    // The workspace's bucket, by its alias or, when it has one, its label (the combobox shows the label).
    await page.locator('input#keep-bucket').click();
    const byAlias = page.getByRole('option').filter({ hasText: BUCKET });
    await (await byAlias.count() ? byAlias.first() : page.getByRole('option').first()).click();
    await page.locator('#keep-folder').fill('e2e/tools/converted/');
    await page.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(panel.getByTestId('panel-kept')).toContainText('e2e/tools/converted/', { timeout: 30_000 });
    await page.context().close();
  });

  test('Option A: the facets narrow the history with their counts, and the days reach back', async ({ browser }) => {
    const page = await signedIn(browser);
    await page.goto('/tools/converter');
    const status = page.locator('[data-facet=status]');
    await expect(status.locator('[data-option=DONE] b')).toHaveText(/^\d+$/);
    await expect(page.locator('[data-facet=from]')).toBeVisible();
    await expect(page.locator('[data-facet=kept]')).toContainText(/In a bucket or Documents|30 days only/);
    const failed = Number(await status.locator('[data-option=FAILED] b').textContent());
    const listed = page.waitForResponse(r => r.url().includes('/documentConverter.json/conversions?') && r.url().includes('status=FAILED'));
    await status.locator('[data-option=FAILED] input').check();
    await listed;
    if (failed > 0) {
      await expect(page.locator('tr[data-conversion]').first()).toBeVisible();
      for (const pill of await page.locator('tr[data-conversion] .pill').allTextContents()) expect(pill).not.toContain('Done');
    } else await expect(page.getByText('No conversion matches the filters.')).toBeVisible();
    await status.locator('[data-option=FAILED] input').uncheck();
    const allTime = page.waitForResponse(r => r.url().includes('/documentConverter.json/conversions?') && r.url().includes('days=0'));
    await page.getByRole('group', { name: 'How far back' }).getByRole('button', { name: 'All time' }).click();
    await allTime;
    await expect(page.getByTestId('conversions-foot')).toContainText('results stay 30 days unless kept');
    await page.context().close();
  });

  test('a busy converter keeps the file waiting and sends it again by itself', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await signedIn(browser);
    let busy = true;
    await page.route('**/documentConverter.json/conversions', async route => {
      if (route.request().method() !== 'POST' || !busy) return route.continue();
      busy = false;
      // The console calls the gateway on another origin: a stand-in answer carries the CORS headers the gateway's would.
      const origin = route.request().headers()['origin'] ?? '*';
      await route.fulfill({ status: 429, headers: { 'Retry-After': '30', 'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true' }, json: { status: 'ERROR', message: 'The converter is busy.' } });
    });
    await page.goto('/tools/converter');
    await page.getByTestId('converter-files').setInputFiles(join(FIX, 'discharge-note.txt'));
    const row = page.locator('tr[data-file="discharge-note.txt"]');
    await expect(row).toContainText('Converter busy');
    await expect(row.locator('.pill')).toHaveAttribute('title', /trying again by itself/);
    // Sent again by itself: it lands in the history, Done.
    await expect(page.locator('tbody tr', { hasText: 'discharge-note' }).first()).toContainText('Done', { timeout: 90_000 });
    await page.context().close();
  });

  test('Supported formats is a side sheet with a search', async ({ browser }) => {
    const page = await signedIn(browser, 1024);
    await page.goto('/tools/converter');
    await page.getByTestId('converter-formats-toggle').click();
    await page.getByTestId('formats-search').fill('.docx');
    await expect(page.locator('[data-family]').first()).toBeVisible();
    await page.getByTestId('formats-search').fill('zzz-nothing');
    await expect(page.getByText('No family reads or writes')).toBeVisible();
    await page.context().close();
  });

  test('an old ?mode=dataset link lands on Reports from pipelines with the PDF panel open', async ({ browser }) => {
    const page = await signedIn(browser);
    await page.goto('/tools/converter?mode=dataset');
    await expect(page).toHaveURL(/\/reports\/from-pipelines/);
    await expect(page.getByRole('group', { name: 'Where the rows come from' }).first()).toBeVisible();
    await page.context().close();
  });

  // ------------------------------------------------------------------------------------------------- the transcript's API

  test('the transcriber states what it takes: .wav and .ogg too, and whether speakers can be told', async ({ request }) => {
    const limits = await (await request.get(`${api}/audioTranscript.json/limits`, { headers: authOf(s) })).json();
    expect(limits.data.formats).toEqual(expect.arrayContaining(['mp3', 'm4a', 'wav', 'ogg']));
    expect(limits.data.maxMinutes).toBe(30);
    expect(typeof limits.data.speakers?.available).toBe('boolean');
    if (!limits.data.speakers.available) expect(limits.data.speakers.reason).toContain("Speaker labels aren't installed");
    const notAudio = await request.post(`${api}/audioTranscript.json/recordings`, { headers: authOf(s), multipart: {
      file: { name: 'care-plan.md', mimeType: 'text/markdown', buffer: readFileSync(join(FIX, 'care-plan.md')) } } });
    expect((await notAudio.json()).status).toBe('ERROR');
  });

  test('the list answers facets with counts: status, by, speakers and language codes', async ({ request }) => {
    const listed = await (await request.get(`${api}/audioTranscript.json/recordings`, { headers: authOf(s), params: { days: '0', page: '1', size: '5' } })).json();
    expect(listed.status, listed.message).toBe('SUCCESS');
    expect(Object.keys(listed.data.facets)).toEqual(expect.arrayContaining(['status', 'by', 'speakers', 'language']));
    expect(listed.data.all).toBeGreaterThanOrEqual(listed.data.total);
    const done = await (await request.get(`${api}/audioTranscript.json/recordings`, { headers: authOf(s), params: { days: '0', status: 'done', page: '1', size: '50' } })).json();
    expect(done.data.rows.every((r: { status: string }) => r.status === 'DONE')).toBe(true);
    const refused = await request.get(`${api}/audioTranscript.json/recordings`, { headers: authOf(s), params: { days: '0', speakers: 'seven' } });
    expect((await refused.json()).status).toBe('ERROR');
  });

  // ---------------------------------------------------------------------------------------------- the transcript screen

  test('Option A: a new transcript from the list, its side panel, then its own page with search, playback and speakers', async ({ browser, request }, info) => {
    test.setTimeout(480_000);
    const page = await signedIn(browser);
    await page.goto('/tools/transcript?new=1');
    const fresh = page.getByTestId('new-transcript');
    await expect(fresh).toContainText('Drop recordings here');
    await fresh.getByTestId('transcript-files').setInputFiles([join(FIX, 'two-voices-visit.m4a'), join(FIX, 'care-plan.md')]);
    await expect(fresh.locator('[data-file="two-voices-visit.m4a"]')).toContainText('read from the file, before upload');
    await expect(page.getByTestId('could-not')).toContainText('care-plan.md is not a recording');
    await expect(fresh.getByTestId('transcript-cost')).toContainText(/to transcribe · billed as 1 audio minute/);
    await expect(fresh.getByTestId('speakers-note')).toBeVisible();
    const speakers = fresh.locator('#nt-spk');
    // Where the transcriber can tell speakers apart: two, exactly (the recording is two voices).
    const told = !!(await (await request.get(`${api}/audioTranscript.json/limits`, { headers: authOf(s) })).json()).data?.speakers?.available;
    if (told) {
      await expect(speakers).toBeEnabled();
      await speakers.selectOption('2');
    }
    await shot(page, info, 'transcript-new-1920');
    await fresh.getByTestId('transcribe').click();

    // Back on the list, the new recording chosen in the side panel with its progress, then Done.
    await expect(page).not.toHaveURL(/new=1/, { timeout: 60_000 });
    const panel = page.locator('app-recording-panel');
    await expect(panel.getByTestId('panel-status')).toContainText('Done', { timeout: 360_000 });
    await expect(panel.getByTestId('panel-transcript')).toContainText(/dressing|clinic|measure/i);
    await expect(panel.getByTestId('panel-player')).toBeVisible();
    await shot(page, info, 'transcript-1920');

    // Open transcript: the recording's own page, at ?id=.
    await panel.getByTestId('open-transcript').click();
    await expect(page).toHaveURL(/\/tools\/transcript\?id=\d+/);
    const id = new URL(page.url()).searchParams.get('id');
    await expect(page.locator('h1')).toContainText('two-voices-visit');
    await expect(page.getByTestId('page-meta')).toContainText(/00:\d\d · English/);
    await expect(page.getByTestId('segments')).toContainText(/dressing/i);
    await expect(page.getByTestId('play')).toBeEnabled({ timeout: 60_000 });

    // Click a time: it plays from there.
    const last = page.locator('tr[data-seg]').last();
    const at = (await last.locator('.tlink').textContent())!.trim();
    expect(at).toMatch(/^\d\d:\d\d$/);
    await last.locator('.tlink').click();
    await expect(page.getByTestId('time')).not.toHaveText(/^00:00 /);
    await expect(last).toHaveClass(/tp-now/);
    await page.getByTestId('play').click();

    // Search: n of N, the hits marked, the current one stronger.
    await page.getByTestId('transcript-search').fill('dressing');
    await expect(page.getByTestId('hit-count')).toContainText(/1 of \d+/);
    expect(await page.locator('mark').count()).toBeGreaterThan(1);
    await expect(page.locator('mark.cur')).toHaveCount(1);
    await page.getByRole('button', { name: 'Next match' }).click();
    await expect(page.getByTestId('hit-count')).toContainText(/2 of \d+/);
    await shot(page, info, 'transcript-detail-1920');
    await page.setViewportSize({ width: 1024, height: 1080 });
    await shot(page, info, 'transcript-detail-1024');
    await page.setViewportSize({ width: 1920, height: 1080 });

    // One "All speakers" filter for two or more speakers.
    const filter = page.getByTestId('speaker-filter');
    if (told && await filter.count()) {
      const all = await page.locator('tr[data-seg]').count();
      const options = await filter.locator('option').allTextContents();
      expect(options[0]).toBe('All speakers');
      // Each speaker's own words: fewer rows than everyone's.
      for (let i = 1; i < options.length; i++) {
        await filter.selectOption({ index: i });
        expect(await page.locator('tr[data-seg]').count()).toBeLessThan(all);
      }
      await filter.selectOption('all');
      await expect(page.locator('tr[data-seg]')).toHaveCount(all);
      // Speakers: talk time, and a name given once.
      await page.getByRole('tab', { name: /Speakers/ }).click();
      await expect(page.getByTestId('speakers-card')).toContainText('%');
      await page.getByTestId('speakers-card').getByRole('button', { name: /^Name / }).first().click();
      await page.getByTestId('speakers-card').locator('input').fill('Jordan Lee, RN (synthetic)');
      await page.getByTestId('speakers-card').locator('input').press('Enter');
      await expect(page.getByTestId('speakers-card')).toContainText('Jordan Lee, RN (synthetic)');
    }

    // Details, and a download from the menu.
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page.getByTestId('details-card')).toContainText(/on this platform/);
    await page.getByTestId('download').click();
    const [txt] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-txt').click()]);
    expect(txt.suggestedFilename()).toMatch(/\.txt$/);

    // A link to ?id= opens the page directly; the breadcrumb leads back to the list.
    await page.goto(`/tools/transcript?id=${id}`);
    await expect(page.locator('h1')).toContainText('two-voices-visit');
    await page.locator('.breadcrumbs').getByRole('link', { name: 'Audio Transcript' }).click();
    await expect(page).toHaveURL(/\/tools\/transcript$/);
    await expect(page.locator(`tr[data-recording="${id}"]`)).toContainText('Done');
    await page.context().close();
  });
});
