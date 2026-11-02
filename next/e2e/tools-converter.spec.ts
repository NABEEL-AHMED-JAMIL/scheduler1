import { test, expect, APIRequestContext } from '@playwright/test';
import { api, authOf, canSignIn, NEEDS, Session, sessionFor } from './support/session';
import { getJson } from './support/workspace';
import { hasFixtures, NEEDS_FIXTURES } from './support/fixtures';
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
 * - the screens (queue, preview, Recent conversions) are tools-converter-transcript.spec.ts's since the tools redesign
 *   (2026-11-02); this file keeps the server's own contract: every pair, the size limit, and a burst answered 429.
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

interface Family { key: string; label: string; inputFormats: string[]; outputFormats: string[] }
interface Answer { code: number; status?: string; message?: string; base64?: string; retryAfter?: string }

let s: Session;
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

test.describe('Document Converter (live, owner #26)', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.skip(!hasFixtures(), NEEDS_FIXTURES);

  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
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

  test('TC-C06: a file over its limit is refused in words by the server', async ({ request }) => {
    // 51 MB of text to PDF, over the 50 MB a LibreOffice conversion takes (a CSV to PDF may be 500 MB).
    const big = Buffer.alloc(51 * 1024 * 1024, 'a');
    const refused = await convert(request, 'too-big-note.txt', big, 'pdf');
    expect(refused.status).toBe('ERROR');
    expect(refused.message).toContain('over the 50 MB limit');
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

});
