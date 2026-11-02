import { test, expect, Browser, BrowserContextOptions, Page, TestInfo } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { ensureObject } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { LOCAL_BUILD_USE, useLocalBuild } from './support/local-build';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Owner #27 (2026-10-19): Audio Transcript end to end, against the live media-service and transcriber (whisper on the
 * CPU). The written test cases are docs/test-cases/tools.md (TC-T01..); each test names the cases it runs.
 *
 * The recordings are synthetic: a 13-second ward-round note read by the macOS voice (e2e/fixtures/tools/
 * ward-round-note.m4a, and the same as .mp3) -- no patient, no real data. As Riverside Health's administrator; kept in
 * the bucket, overwritten each run: <bucket>/e2e/tools/audio/ward-round-note.mp3 and lab-results.csv (the type filter's
 * other kind). Each transcription bills about a fifth of an audio minute (ai.transcript.minutes) to Riverside.
 */
const FIX = join(__dirname, 'fixtures', 'tools');
const FOLDER = 'e2e/tools/audio/';
/** Words the voice says that the model should hear, whatever it does with the rest. */
const HEARD = /blood|pressure|patient|ward/i;

let s: Session;
let BUCKET = '';

async function signedIn(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const page = await pageAs(browser, s, { viewport: { width: 1920, height: 1000 }, ...options });
  await useLocalBuild(page);
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

test.use({ ...LOCAL_BUILD_USE, testIdAttribute: 'data-test' });

test.describe('Audio Transcript (live, owner #27)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    BUCKET = riverside().storageAlias;
    await ensureObject(request, s, BUCKET, `${FOLDER}ward-round-note.mp3`, readFileSync(join(FIX, 'ward-round-note.mp3')), 'audio/mpeg');
    await ensureObject(request, s, BUCKET, `${FOLDER}lab-results.csv`, readFileSync(join(FIX, 'lab-results.csv')), 'text/csv');
  });

  test('TC-T01: the server states its limits and refuses what it cannot take', async ({ request }) => {
    const limits = await (await request.get(`${api}/audioTranscript.json/limits`, { headers: authOf(s) })).json();
    expect(limits.data).toMatchObject({ formats: ['mp3', 'm4a'], uploadMaxMb: 250, bucketMaxMb: 500, timeoutMinutes: 30 });
    const wav = await (await request.post(`${api}/audioTranscript.json/extractFromUpload`, { headers: authOf(s), multipart: {
      file: { name: 'ward-round.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVE') } } })).json();
    expect(wav.status).toBe('ERROR');
    expect(wav.message).toContain('expected .mp3 or .m4a');
    const missing = await (await request.post(`${api}/audioTranscript.json/extractFromBucket`, { headers: authOf(s),
      data: { bucket: BUCKET, key: `${FOLDER}no-such-recording.mp3` } })).json();
    expect(missing.status).not.toBe('SUCCESS');
  });

  test('TC-T02: upload an .m4a and read its transcript', async ({ browser }, info) => {
    test.setTimeout(300_000);
    const page = await signedIn(browser);
    await page.goto('/tools/transcript');
    await expect(page.getByTestId('transcript-limits')).toContainText('up to 250 MB');
    await page.locator('app-file-dropzone input[type="file"]').setInputFiles(join(FIX, 'ward-round-note.m4a'));
    await page.getByTestId('transcribe').click();
    await expect(page.getByText(/\d+ segments? ·/)).toBeVisible({ timeout: 240_000 });
    await expect(page.locator('.page-tool')).toContainText(HEARD);
    await shot(page, info, 'transcript-upload-done');
    await page.context().close();
  });

  test('TC-T03..T06: from a bucket -- the picker searches, filters by type, shows size and date, keeps the selection; with timestamps',
    async ({ browser }, info) => {
      test.setTimeout(300_000);
      const page = await signedIn(browser);
      await page.goto('/tools/transcript');
      await page.getByRole('group', { name: 'Choose a source' }).getByRole('button', { name: 'From a bucket' }).click();
      await page.getByRole('button', { name: 'Choose an audio file…' }).click();
      const picker = page.getByRole('dialog', { name: 'Pick an audio file' });
      await expect(picker.getByTestId('picker-table')).toBeVisible();

      // Search the whole bucket; the match names its folder, its size and its date.
      await picker.getByTestId('picker-search').fill('ward-round-note');
      await picker.getByTestId('picker-search').press('Enter');
      const row = picker.locator(`tr[data-key="${FOLDER}ward-round-note.mp3"]`);
      await expect(row).toContainText(FOLDER);
      await expect(row.locator('td').nth(2)).toHaveText(/\d+(\.\d+)? KB/);
      await expect(row.locator('td').nth(3)).toHaveText(/\d{1,2} \w{3} \d{4}, \d{2}:\d{2}/);

      // Back in the folder: the type chips -- "mp3, m4a" hides the csv, All files shows it greyed, mp3 alone too.
      await picker.getByRole('button', { name: 'Back to the folder' }).click();
      await picker.locator('nav[aria-label="Folder path"]').getByRole('button', { name: BUCKET }).click();
      for (const folder of ['e2e/', 'e2e/tools/', FOLDER]) await picker.locator(`tr[data-key="${folder}"]`).click();
      const csv = picker.locator(`tr[data-key="${FOLDER}lab-results.csv"]`);
      await expect(csv).toHaveCount(0);
      const types = picker.getByRole('group', { name: 'File types' });
      await types.getByRole('button', { name: 'All files' }).click();
      await expect(csv).toHaveAttribute('aria-disabled', 'true');
      await types.getByRole('button', { name: 'mp3', exact: true }).click();
      await expect(csv).toHaveCount(0);
      await expect(row).toBeVisible();

      // Select; the selection stays through a re-sort and is said in the footer; Use this file answers it.
      await row.click();
      await picker.locator('th').filter({ hasText: 'Modified' }).getByRole('button').click();
      await expect(row).toHaveAttribute('aria-selected', 'true');
      await expect(picker.getByTestId('picker-selection')).toContainText('Selected: ward-round-note.mp3');
      await shot(page, info, 'transcript-picker');
      await picker.getByTestId('picker-use').click();
      await expect(page.getByTestId('picked-file')).toContainText('ward-round-note.mp3');
      await expect(page.getByTestId('picked-file')).toContainText(/KB · modified/);

      // Reopened: the same folder, the file marked.
      await page.getByRole('button', { name: 'Change…' }).click();
      await expect(picker.locator(`tr[data-key="${FOLDER}ward-round-note.mp3"]`)).toHaveAttribute('aria-selected', 'true');
      await picker.getByRole('button', { name: 'Cancel' }).click();

      // With timestamps: segments carry their [HH:MM:SS] mark, in the timeline and the table.
      await page.getByText('Include timestamps before each segment').click();
      await page.getByTestId('transcribe').click();
      await expect(page.getByText(/\d+ segments? ·/)).toBeVisible({ timeout: 240_000 });
      await expect(page.locator('.ts-mark').first()).toHaveText(/^\d{2}:\d{2}:\d{2}/);
      await expect(page.locator('.page-tool')).toContainText(HEARD);
      await page.getByRole('group', { name: 'Choose how to read the transcript' }).getByRole('button', { name: 'Table' }).click();
      await expect(page.locator('table.table-modern th').filter({ hasText: 'Time' })).toBeVisible();
      await shot(page, info, 'transcript-bucket-done');
      await page.context().close();
    });

  test('TC-T07..T08: the wrong kind, a file over the limit, and a busy transcriber are said in words', async ({ browser }, info) => {
    const page = await signedIn(browser, { viewport: { width: 1440, height: 900 } });
    // The limit as the server states it, made small so a small file is over it.
    await page.route('**/audioTranscript.json/limits', async route => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, data: { ...body.data, uploadMaxMb: 1 } } });
    });
    let busy = true;
    await page.route('**/audioTranscript.json/extractFromUpload', async route => {
      if (!busy) return route.continue();
      busy = false;
      await route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { status: 'ERROR', message: 'The transcriber is busy with other recordings. Try again in a minute.' } });
    });
    await page.goto('/tools/transcript');
    await expect(page.getByTestId('transcript-limits')).toContainText('up to 1 MB');
    const input = page.locator('app-file-dropzone input[type="file"]');
    await input.setInputFiles({ name: 'dictation.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(2 * 1024 * 1024, 1) });
    await expect(page.getByTestId('audio-problem')).toContainText('this way takes up to 1 MB');
    await expect(page.getByTestId('transcribe')).toBeDisabled();
    await page.getByRole('button', { name: 'Remove' }).click();
    // The dropzone's accept filter is a hint to the browser's dialog; a dropped .wav is still said to be the wrong kind.
    await input.setInputFiles({ name: 'dictation.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF') });
    await expect(page.getByTestId('audio-problem')).toContainText('not an .mp3 or .m4a file');
    await page.getByRole('button', { name: 'Remove' }).click();

    await input.setInputFiles(join(FIX, 'ward-round-note.m4a'));
    await page.getByTestId('transcribe').click();
    const alert = page.getByTestId('transcript-error');
    await expect(alert).toHaveAttribute('data-busy', 'true');
    await expect(alert).toContainText('busy');
    await shot(page, info, 'transcript-busy');
    await page.context().close();
  });
});
