import { test, expect, Browser, Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { api, authOf, canMintPeople, pageAs, Session, sessionAsPerson } from './support/session';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { LOCAL_BUILD_USE, useLocalBuild } from './support/local-build';

/**
 * The tools redesign (owner-approved 2026-11-02), end to end against the live media-service, LibreOffice and the
 * transcriber, as Riverside Health's synthetic administrator: the Document Converter's queue, preview, checks and Recent
 * conversions, and Audio Transcript's new transcript, progress, player, search and exports.
 *
 * Everything is synthetic: the documents and the ward-round recording under e2e/fixtures/tools/ (invented, no patient).
 * What it leaves, as the platform's rule is for test data: the conversions it made (listed 30 days, then removed), one
 * result kept in <bucket>/e2e/tools/converted/, and the recordings it transcribed (each bills about a fifth of an audio
 * minute to Riverside). E2E_SHOTS: a folder the screenshots are also written to.
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

  test('several files in the queue, a recording refused, the result beside its original, and Recent conversions', async ({ browser }, info) => {
    test.setTimeout(240_000);
    const page = await signedIn(browser);
    await page.goto('/tools/converter');
    await expect(page.getByTestId('converter-drop')).toContainText('Up to 20 files at once');
    await page.getByTestId('converter-files').setInputFiles([join(FIX, 'discharge-note.txt'), join(FIX, 'discharge-summary.html'),
      join(FIX, 'ward-round-note.mp3')]);
    const queue = page.getByTestId('converter-queue');
    await expect(queue.locator('li')).toHaveCount(3);
    await expect(queue.locator('li[data-file="ward-round-note.mp3"]')).toContainText('A recording, not a document.');
    await page.getByTestId('convert').click();
    await expect(queue.locator('li[data-state="done"]')).toHaveCount(2, { timeout: 180_000 });
    await expect(queue.locator('li[data-file="discharge-note.txt"]')).toContainText(/Done in [\d.]+ s · PDF/);

    const preview = page.getByTestId('conversion-preview');
    await expect(preview.getByTestId('preview-title')).toContainText('→ PDF');
    await expect(preview.getByTestId('preview-page')).toContainText(/Page 1 of \d+/);
    await expect(preview.getByTestId('preview-result').locator('img')).toBeVisible({ timeout: 60_000 });
    await expect(preview.getByTestId('preview-checks')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), preview.getByTestId('preview-download').click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const recent = page.getByTestId('recent-conversions');
    await expect(recent.locator('tbody tr').first()).toBeVisible();
    await expect(recent).toContainText(/Not kept · until/);
    await shot(page, info, 'converter-1920');
    await page.setViewportSize({ width: 1024, height: 1080 });
    await shot(page, info, 'converter-1024');

    // Keep the result in a bucket: the row then links to its folder.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await preview.getByTestId('preview-keep').click();
    await page.locator('input#keep-bucket').fill(BUCKET);
    await page.getByRole('option').filter({ hasText: BUCKET }).first().click();
    await page.locator('#keep-folder').fill('e2e/tools/converted/');
    await page.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(recent.locator('a', { hasText: 'e2e/tools/converted/' }).first()).toBeVisible({ timeout: 30_000 });
    await page.context().close();
  });

  test('a busy converter keeps the file waiting and sends it again by itself', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await signedIn(browser);
    let busy = true;
    await page.route('**/documentConverter.json/conversions', async route => {
      if (route.request().method() !== 'POST' || !busy) return route.continue();
      busy = false;
      await route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { status: 'ERROR', message: 'The converter is busy.' } });
    });
    await page.goto('/tools/converter');
    await page.getByTestId('converter-files').setInputFiles(join(FIX, 'discharge-note.txt'));
    await page.getByTestId('convert').click();
    const row = page.getByTestId('converter-queue').locator('li').first();
    await expect(row).toContainText('trying again by itself');
    await expect(page.getByTestId('converter-now')).toContainText('busy');
    await expect(row).toHaveAttribute('data-state', 'done', { timeout: 90_000 });
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
    await expect(page.getByRole('group', { name: 'Where the rows come from' })).toBeVisible();
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

  // ---------------------------------------------------------------------------------------------- the transcript screen

  test('a new transcript runs on the server, then plays back with search, views and exports', async ({ browser }, info) => {
    test.setTimeout(420_000);
    const page = await signedIn(browser);
    await page.goto('/tools/transcript?new=1');
    const fresh = page.getByTestId('new-transcript');
    await expect(fresh).toContainText('Drop recordings here');
    await fresh.getByTestId('transcript-files').setInputFiles([join(FIX, 'ward-round-note.m4a'), join(FIX, 'care-plan.md')]);
    await expect(fresh.locator('[data-file="ward-round-note.m4a"]')).toContainText('read from the file, before upload');
    await expect(page.getByTestId('could-not')).toContainText('care-plan.md is not a recording');
    await expect(fresh.getByTestId('transcript-cost')).toContainText(/to transcribe · billed as 1 audio minute/);
    await expect(fresh.getByTestId('speakers-note')).toBeVisible();
    await shot(page, info, 'transcript-new-1920');
    await page.setViewportSize({ width: 1024, height: 1080 });
    await shot(page, info, 'transcript-new-1024');
    await page.setViewportSize({ width: 1920, height: 1080 });

    await fresh.getByTestId('transcribe').click();
    await expect(page).toHaveURL(/[?&]id=\d+/, { timeout: 60_000 });
    const player = page.getByTestId('player');
    await expect(player).toBeVisible({ timeout: 300_000 });
    await expect(page.getByTestId('segments')).toContainText(HEARD);
    await expect(page.getByTestId('play')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('speakers-card')).toBeVisible();

    // Search: n of N, then the plain text and a download.
    await page.getByTestId('transcript-search').fill('pressure');
    await expect(page.getByTestId('hit-count')).toContainText(/1 of \d+|Not said/);
    await shot(page, info, 'transcript-1920');
    await page.setViewportSize({ width: 1024, height: 1080 });
    await shot(page, info, 'transcript-1024');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('group', { name: 'How to show the transcript' }).getByRole('button', { name: 'Plain text' }).click();
    await expect(page.getByTestId('plain-text')).toContainText(/\[00:00\]/);
    const [txt] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-txt').click()]);
    expect(txt.suggestedFilename()).toMatch(/\.txt$/);

    // The recording is in the rail, Done.
    const id = new URL(page.url()).searchParams.get('id');
    await expect(page.getByTestId('recordings-rail').locator(`[data-recording="${id}"]`)).toContainText('Done');
    await page.context().close();
  });
});
