import { test, expect, APIRequestContext, Page, TestInfo } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';
import { Browser, BrowserContextOptions } from '@playwright/test';
import { ensureObject, getJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';
import { LOCAL_BUILD_USE, useLocalBuild } from './support/local-build';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Owner #26 (2026-10-19): the Document Converter, end to end, against the live media-service and its LibreOffice. The
 * written test cases are docs/test-cases/tools.md (TC-C01..); each test names the cases it runs.
 *
 * What it reads and writes, as Riverside Health's administrator (support/fixtures.ts):
 * - the synthetic documents under e2e/fixtures/tools/ (a discharge note, lab results, a care plan, a discharge summary,
 *   a vitals chart, a ward-round deck -- invented, no patient data);
 * - the matrix converts with save=false: nothing is stored, nothing is billed (media meters saved conversions only);
 * - kept in the bucket, overwritten each run: <bucket>/e2e/tools/discharge-summary.html and lab-results.csv (the
 *   picker's inputs), and the one conversion saved under e2e/tools/converted/ -- its list entry is deleted again by the
 *   spec (the delete keeps the files, as the screen says).
 *
 * E2E_CONVERTER_MATRIX=0 skips the matrix (several minutes); E2E_SHOTS: a folder the screenshots are also written to.
 */
const FIX = join(__dirname, 'fixtures', 'tools');
const SEED: Record<string, string> = {
  TEXT: 'discharge-note.txt', SPREADSHEET: 'lab-results.csv', PRESENTATION: 'ward-round.fodp', DRAWING: 'vitals-chart.svg',
  OTHER: 'discharge-summary.html',
};
/**
 * Inputs LibreOffice still reads but nothing here can write (WordPerfect, StarOffice 5, Visio), so there is no honest
 * fixture to convert from: a "Visio" made by the converter was a PDF under that name (the matrix found it, 2026-10-19).
 */
const NO_FIXTURE = ['wpd', 'sxw', 'sxc', 'sxi', 'vsd', 'vsdx'];
const FOLDER = 'e2e/tools/';

interface Family { key: string; label: string; inputFormats: string[]; outputFormats: string[] }
interface Answer { code: number; status?: string; message?: string; base64?: string; retryAfter?: string }

let s: Session;
let BUCKET = '';
let BUCKET_LABEL = '';
let FAMILIES: Family[] = [];

async function convert(request: APIRequestContext, name: string, buffer: Buffer, to: string, tries = 10): Promise<Answer> {
  for (let attempt = 0; ; attempt++) {
    const r = await request.post(`${api}/documentConverter.json/convert`, { headers: authOf(s), timeout: 300_000, multipart: {
      file: { name, mimeType: 'application/octet-stream', buffer }, outputFormat: to, save: 'false' } });
    const body = await r.json().catch(() => ({}));
    if (r.status() === 429 && attempt < tries) {
      await new Promise(done => setTimeout(done, 3_000));
      continue;
    }
    return { code: r.status(), status: body.status, message: body.message, base64: body.data?.outputBase64, retryAfter: r.headers()['retry-after'] };
  }
}

/** The file's first bytes are what its extension promises (a zip for the Office XML and OpenDocument formats). */
function looksLike(to: string, bytes: Buffer): boolean {
  const head = bytes.subarray(0, 8);
  const ascii = head.toString('latin1');
  switch (to) {
    case 'pdf': return ascii.startsWith('%PDF');
    case 'png': return head[0] === 0x89 && ascii.slice(1, 4) === 'PNG';
    case 'jpg': case 'jpeg': return head[0] === 0xff && head[1] === 0xd8;
    case 'gif': return ascii.startsWith('GIF8');
    case 'bmp': return ascii.startsWith('BM');
    case 'tif': case 'tiff': return ascii.startsWith('II*') || ascii.startsWith('MM');
    case 'docx': case 'dotx': case 'xlsx': case 'xltx': case 'pptx': case 'potx': case 'odt': case 'ott': case 'ods': case 'ots':
    case 'odp': case 'otp': case 'odg': case 'otg': case 'vsdx': return ascii.startsWith('PK');
    case 'doc': case 'xls': case 'ppt': case 'vsd': return head[0] === 0xd0 && head[1] === 0xcf;
    case 'rtf': return ascii.startsWith('{\\rtf');
    case 'fodt': case 'fods': case 'fodp': case 'fodg': return bytes.subarray(0, 200).toString('utf8').includes('<?xml');
    case 'svg': return bytes.subarray(0, 2000).toString('utf8').includes('<svg');
    case 'html': case 'xhtml': return /<html|<!doctype/i.test(bytes.subarray(0, 2000).toString('utf8'));
    // Text out: no PDF, zip or image under a text name.
    case 'txt': case 'md': case 'csv': case 'tsv': return bytes.length > 0 && !/^(%PDF|PK|\x89PNG)/.test(ascii);
    default: return bytes.length > 0;
  }
}

async function signedIn(browser: Browser, session: Session, options: BrowserContextOptions): Promise<Page> {
  const page = await pageAs(browser, session, options);
  await useLocalBuild(page);
  return page;
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
}

test.use({ ...LOCAL_BUILD_USE, testIdAttribute: 'data-test' });

test.describe('Document Converter (live, owner #26)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    BUCKET = riverside().storageAlias;
    const buckets: { bucket: string; label?: string }[] = (await getJson(request, s, '/storage.json/buckets')).data ?? [];
    BUCKET_LABEL = buckets.find(b => b.bucket === BUCKET)?.label || BUCKET;
    FAMILIES = (await getJson(request, s, '/documentConverter.json/supportedFormats')).data ?? [];
    expect(FAMILIES.length, 'the supported formats').toBeGreaterThan(0);
  });

  test('TC-C01..C05: every supported input and output pair converts end to end', async ({ request }, info) => {
    test.skip(process.env['E2E_CONVERTER_MATRIX'] === '0', 'E2E_CONVERTER_MATRIX=0');
    test.setTimeout(30 * 60_000);
    // 1. One fixture per input format: the seed itself, a copy under another spelling, or the seed converted to it.
    const fixtures = new Map<string, { name: string; buffer: Buffer }>();
    const made: string[] = [];
    for (const family of FAMILIES) {
      const seedName = SEED[family.key];
      const seed = readFileSync(join(FIX, seedName));
      for (const ext of family.inputFormats) {
        const id = `${family.key}:${ext}`;
        if (NO_FIXTURE.includes(ext)) continue;
        if (seedName.endsWith('.' + ext)) { fixtures.set(id, { name: seedName, buffer: seed }); continue; }
        if (ext === 'md') { fixtures.set(id, { name: 'care-plan.md', buffer: readFileSync(join(FIX, 'care-plan.md')) }); continue; }
        if (ext === 'htm') { fixtures.set(id, { name: 'discharge-summary.htm', buffer: readFileSync(join(FIX, 'discharge-summary.html')) }); continue; }
        const answer = await convert(request, seedName, seed, ext);
        expect(answer.status, `fixture .${ext} from ${seedName}: ${answer.message}`).toBe('SUCCESS');
        fixtures.set(id, { name: `${seedName.replace(/\.[^.]+$/, '')}.${ext}`, buffer: Buffer.from(answer.base64!, 'base64') });
        made.push(ext);
      }
    }

    // 2. Every pair, three at a time (the converter's two slots and its queue; a 429 is waited out and tried again).
    const pairs = FAMILIES.flatMap(f => f.inputFormats.filter(ext => fixtures.has(`${f.key}:${ext}`))
      .flatMap(from => f.outputFormats.map(to => ({ family: f.key, from, to }))));
    const results: { family: string; from: string; to: string; ok: boolean; ms: number; why?: string }[] = [];
    let next = 0;
    await Promise.all([0, 1, 2].map(async () => {
      while (next < pairs.length) {
        const pair = pairs[next++];
        const fixture = fixtures.get(`${pair.family}:${pair.from}`)!;
        const started = Date.now();
        const answer = await convert(request, fixture.name, fixture.buffer, pair.to);
        const bytes = answer.base64 ? Buffer.from(answer.base64, 'base64') : Buffer.alloc(0);
        const ok = answer.status === 'SUCCESS' && bytes.length > 0 && looksLike(pair.to, bytes);
        results.push({ ...pair, ok, ms: Date.now() - started,
          why: ok ? undefined : answer.status === 'SUCCESS' ? `not a .${pair.to} (${bytes.length} bytes)` : `${answer.code} ${answer.message}` });
      }
    }));

    // 3. The report, beside the screenshots: every pair, how long it took, and why one failed.
    const failed = results.filter(r => !r.ok);
    const lines = [`# Converter matrix ${new Date().toISOString()}`, '',
      `${results.length - failed.length} of ${results.length} pairs converted; fixtures made by converting: ${made.join(', ')};`,
      `inputs with no fixture (read, untested): ${NO_FIXTURE.join(', ')}.`, '', '| Family | From | To | Result | ms |', '|---|---|---|---|---|',
      ...results.sort((a, b) => `${a.family}${a.from}${a.to}`.localeCompare(`${b.family}${b.from}${b.to}`))
        .map(r => `| ${r.family} | ${r.from} | ${r.to} | ${r.ok ? 'ok' : 'FAILED: ' + r.why} | ${r.ms} |`)];
    writeFileSync(info.outputPath('converter-matrix.md'), lines.join('\n'));
    const extra = process.env['E2E_SHOTS'];
    if (extra) { mkdirSync(extra, { recursive: true }); writeFileSync(join(extra, 'converter-matrix.md'), lines.join('\n')); }
    info.annotations.push({ type: 'matrix', description: `${results.length - failed.length}/${results.length} pairs` });
    expect(failed.map(f => `${f.from} -> ${f.to}: ${f.why}`)).toEqual([]);
  });

  test('TC-C06: a file over its limit is refused in words, on the screen and by the server', async ({ browser, request }, info) => {
    // The server: 51 MB of text to PDF, over the 50 MB a LibreOffice conversion takes (a CSV to PDF may be 500 MB).
    const big = Buffer.alloc(51 * 1024 * 1024, 'a');
    const refused = await convert(request, 'too-big-note.txt', big, 'pdf');
    expect(refused.status).toBe('ERROR');
    expect(refused.message).toContain('over the 50 MB limit');

    // The screen, before anything is sent: the limits as the server states them, made small so a small file is over.
    const page = await signedIn(browser, s, { viewport: { width: 1440, height: 900 } });
    await page.route('**/documentConverter.json/limits', async route => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, data: { ...body.data, maxFileSizeMb: 1 } } });
    });
    let sent = 0;
    await page.route('**/documentConverter.json/convert', route => { sent++; return route.abort(); });
    await page.goto('/tools/converter');
    await expect(page.getByTestId('converter-limits')).toContainText('up to 1 MB');
    await page.locator('app-file-dropzone input[type="file"]').setInputFiles({ name: 'long-note.txt', mimeType: 'text/plain', buffer: Buffer.alloc(2 * 1024 * 1024, 'b') });
    await expect(page.getByRole('alert').filter({ hasText: 'takes up to 1 MB' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convert', exact: true })).toBeDisabled();
    expect(sent).toBe(0);
    await shot(page, info, 'converter-over-limit');
    await page.context().close();
  });

  test('TC-C07: a full queue (429) is said as busy, and Try again converts', async ({ browser }, info) => {
    const page = await signedIn(browser, s, { viewport: { width: 1440, height: 900 } });
    let busy = true;
    await page.route('**/documentConverter.json/convert', async route => {
      if (!busy) return route.continue();
      busy = false;
      await route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { status: 'ERROR', message: 'Every converter is busy and the queue is full. Try again in 30 seconds.' } });
    });
    await page.goto('/tools/converter');
    await page.locator('app-file-dropzone input[type="file"]').setInputFiles(join(FIX, 'discharge-note.txt'));
    await page.locator('#target').selectOption('pdf');
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'busy' });
    await expect(alert).toContainText('Try again in 30 seconds');
    await shot(page, info, 'converter-busy');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Ready to download')).toBeVisible({ timeout: 60_000 });
    await page.context().close();
  });

  test('TC-C08: a burst past the slots and the queue is answered 429 with Retry-After, never an error', async ({ request }, info) => {
    test.setTimeout(5 * 60_000);
    const limits = (await getJson(request, s, '/documentConverter.json/limits')).data;
    // A deck to PDF goes through LibreOffice (a table would not); twice the slots and the queue at once.
    const deck = readFileSync(join(FIX, 'ward-round.fodp'));
    const answers = await Promise.all(Array.from({ length: (limits.slots + limits.maxWaiting) * 2 }, () =>
      convert(request, 'ward-round.fodp', deck, 'pdf', 0)));
    const busy = answers.filter(a => a.code === 429);
    expect(answers.filter(a => a.code !== 429 && a.status !== 'SUCCESS').map(a => `${a.code} ${a.message}`)).toEqual([]);
    for (const a of busy) {
      expect(a.retryAfter).toBe('30');
      expect(a.message).toMatch(/busy/i);
    }
    expect(answers.length - busy.length, 'at least the slots converted').toBeGreaterThanOrEqual(limits.slots);
    console.log(`[e2e] burst: ${answers.length} at once, ${answers.length - busy.length} converted, ${busy.length} told busy`);
    info.annotations.push({ type: 'burst', description: `${answers.length} at once: ${answers.length - busy.length} converted, ${busy.length} told busy` });
  });

  test('TC-C09: upload a document, convert it and download the result', async ({ browser }, info) => {
    const page = await signedIn(browser, s, { viewport: { width: 1920, height: 1000 }, acceptDownloads: true });
    await page.goto('/tools/converter');
    await page.locator('app-file-dropzone input[type="file"]').setInputFiles(join(FIX, 'discharge-note.txt'));
    await expect(page.getByText('Detected as Text Document')).toBeVisible();
    await page.locator('#target').selectOption('docx');
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByText('Ready to download')).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
    expect(download.suggestedFilename()).toBe('discharge-note.docx');
    await shot(page, info, 'converter-upload-done');
    await page.context().close();
  });

  test('TC-C10..C13: from a bucket -- the picker searches, filters by type and keeps the selection; saved, listed, detail on the right, deleted',
    async ({ browser, request }, info) => {
      test.setTimeout(180_000);
      await ensureObject(request, s, BUCKET, `${FOLDER}discharge-summary.html`, readFileSync(join(FIX, 'discharge-summary.html')), 'text/html');
      await ensureObject(request, s, BUCKET, `${FOLDER}lab-results.csv`, readFileSync(join(FIX, 'lab-results.csv')), 'text/csv');
      await ensureObject(request, s, BUCKET, `${FOLDER}ward-round-note.mp3`, readFileSync(join(FIX, 'ward-round-note.mp3')), 'audio/mpeg');
      const name = `E2E discharge summary ${Date.now().toString(36)}`;
      const page = await signedIn(browser, s, { viewport: { width: 1920, height: 1000 } });
      await page.goto('/tools/converter');
      await page.getByRole('group', { name: 'Choose a source' }).getByRole('button', { name: 'From a bucket' }).click();
      await page.getByRole('button', { name: 'Choose a file…' }).click();

      // The picker: the only bucket opens by itself; Enter searches all of it; each match names its folder.
      const picker = page.getByRole('dialog', { name: 'Pick a document to convert' });
      await expect(picker.getByTestId('picker-table')).toBeVisible();
      await picker.getByTestId('picker-search').fill('discharge-summary');
      await picker.getByTestId('picker-search').press('Enter');
      await expect(picker.getByTestId('picker-search-note')).toContainText('named like "discharge-summary"');
      const row = picker.locator(`tr[data-key="${FOLDER}discharge-summary.html"]`);
      await expect(row).toContainText(FOLDER);
      await expect(row).toContainText('html');
      await expect(row.locator('td').nth(2)).toHaveText(/\d+(\.\d+)? (B|KB)/);
      await expect(row.locator('td').nth(3)).toHaveText(/\d{4}, \d{2}:\d{2}|\d{1,2} \w{3} \d{4}/);

      // Type: the supported types by default -- an mp3 in the same folder is hidden; All files shows it, greyed.
      await picker.getByTestId('picker-search').fill('');
      await picker.locator('nav[aria-label="Folder path"]').getByRole('button', { name: BUCKET }).click();
      await picker.locator(`tr[data-key="e2e/"]`).click();
      await picker.locator(`tr[data-key="${FOLDER}"]`).click();
      await expect(picker.locator(`tr[data-key="${FOLDER}ward-round-note.mp3"]`)).toHaveCount(0);
      await picker.getByRole('group', { name: 'File types' }).getByRole('button', { name: 'All files' }).click();
      await expect(picker.locator(`tr[data-key="${FOLDER}ward-round-note.mp3"]`)).toHaveAttribute('aria-disabled', 'true');
      await picker.getByRole('group', { name: 'File types' }).getByRole('button', { name: 'Supported types' }).click();

      // Select, then the selection is kept while the list changes, and Use this file answers it.
      await row.click();
      await expect(picker.getByTestId('picker-selection')).toContainText('Selected: discharge-summary.html');
      await picker.locator('th').filter({ hasText: 'Size' }).getByRole('button').click();
      await expect(row).toHaveAttribute('aria-selected', 'true');
      await shot(page, info, 'converter-picker');
      await picker.getByTestId('picker-use').click();
      await expect(page.getByTestId('picked-file')).toContainText('discharge-summary.html');
      await expect(page.getByTestId('picked-file')).toContainText(`${BUCKET}/${FOLDER}`);

      // Reopened, the picker is in that folder with the file marked.
      await page.getByRole('button', { name: 'Change…' }).click();
      await expect(picker.locator(`tr[data-key="${FOLDER}discharge-summary.html"]`)).toHaveAttribute('aria-selected', 'true');
      await picker.getByRole('button', { name: 'Cancel' }).click();

      // Convert to .docx and save it to the bucket.
      await expect(page.getByText('Detected as Other (HTML)')).toBeVisible();
      await page.locator('#target').selectOption('docx');
      await page.getByText('Save the result to a bucket').click();
      await page.locator('#savebucket').click();
      await page.getByRole('option', { name: BUCKET_LABEL }).click();
      await page.locator('#savefolder').fill(`${FOLDER}converted`);
      await page.locator('#taskname').fill(name);
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      await expect(page.getByText('Ready to download')).toBeVisible({ timeout: 90_000 });

      // Listed in Recent conversions, found by its search; its detail slides over the right.
      await page.getByRole('textbox', { name: 'Search recent conversions' }).fill(name);
      const listed = page.locator('app-table-shell tbody tr').filter({ hasText: name });
      await expect(listed).toHaveCount(1);
      await listed.locator('td').first().click();
      const panel = page.locator('.side-panel-right');
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('conversion-facts')).toContainText('discharge-summary.docx');
      await expect(panel.getByTestId('conversion-facts')).toContainText(`${FOLDER}converted`);
      await shot(page, info, 'converter-detail-panel');
      await panel.getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await expect(listed).toHaveCount(0);
      await page.context().close();
    });
});
