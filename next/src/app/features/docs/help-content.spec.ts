import { describe, it, expect } from 'vitest';
import { HelpData } from './help-content';
import { linesOf, parseHelp, parseSpans, refsOf } from './help-markdown';
import { gateOf } from './docs';

/**
 * The real help (help/*.md -> public/help/content.json, scripts/build-help.mjs). These fail when the JSON is older than
 * the Markdown (run node scripts/build-help.mjs), when an article sends a reader to a console page the menu does not
 * have, names a figure that was never taken (unless its shot is marked to be retaken), or uses words a customer should
 * never read (internal ticket and decision numbers, service names, claims of compliance).
 */
interface Fs { existsSync(p: string): boolean; readFileSync(p: string, e: 'utf8'): string; readdirSync(p: string): string[]; statSync(p: string): { isDirectory(): boolean } }
interface Crypto { createHash(a: string): { update(t: string): { digest(e: 'hex'): string } } }
const nodeModule = async <T>(name: string) => (await import(/* @vite-ignore */ ['node', name].join(':'))) as T;
const cwd = () => (globalThis as unknown as { process: { cwd(): string } }).process.cwd();

async function load(): Promise<{ data: HelpData & { sources: Record<string, string> }; fs: Fs; crypto: Crypto }> {
  const fs = await nodeModule<Fs>('fs');
  const crypto = await nodeModule<Crypto>('crypto');
  return { data: JSON.parse(fs.readFileSync(`${cwd()}/public/help/content.json`, 'utf8')), fs, crypto };
}

/** Console pages outside the menu that articles may still name. */
const OFF_MENU = ['/profile', '/account/security', '/notifications', '/request-workspace', '/login', '/docs', '/reports/new',
  '/reports/from-pipelines', '/pipelines/new', '/review/requests', '/dashboard'];

describe('The help\'s content', () => {
  it('is gathered from the Markdown as it is now (else: node scripts/build-help.mjs)', async () => {
    const { data, fs, crypto } = await load();
    const root = cwd();
    const files: string[] = [];
    for (const d of fs.readdirSync(`${root}/help`)) {
      if (!fs.statSync(`${root}/help/${d}`).isDirectory()) continue;
      for (const f of fs.readdirSync(`${root}/help/${d}`)) if (f.endsWith('.md')) files.push(`help/${d}/${f}`);
    }
    if (fs.existsSync(`${root}/help/whats-new.md`)) files.push('help/whats-new.md');
    const now = Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(`${root}/${f}`, 'utf8')).digest('hex')]));
    const stale = [...new Set([...Object.keys(now), ...Object.keys(data.sources)])].filter(f => now[f] !== data.sources[f]);
    expect(stale, `help/ changed (${stale.slice(0, 5).join(', ')}): run node scripts/build-help.mjs`).toEqual([]);
  });

  it('has every topic of the book, each with articles, a summary and its Start here', async () => {
    const { data } = await load();
    expect(data.topics.map(t => t.chapter)).toEqual([...data.topics.map(t => t.chapter)].sort((a, b) => a - b));
    expect(data.topics.length).toBeGreaterThanOrEqual(20);
    expect(data.articles.length).toBeGreaterThanOrEqual(120);
    for (const t of data.topics) {
      expect(t.articles.length, t.id).toBeGreaterThan(0);
      expect(t.summary, t.id).not.toMatch(new RegExp(['TO', 'DO'].join('')));
      expect(t.start.length, `${t.id}: Start here`).toBeGreaterThanOrEqual(3);
    }
    expect(data.topics.find(t => t.id === 'report-studio')!.articles.length).toBeGreaterThanOrEqual(10);
  });

  it('sends readers only to console pages the menu has (or pages beneath them)', async () => {
    const { data } = await load();
    const bad: string[] = [];
    const check = (path: string, where: string) => {
      const p = path.split(/[?#]/)[0];
      if (!gateOf(p) && !OFF_MENU.some(o => p === o || p.startsWith(o + '/'))) bad.push(`${where}: ${path}`);
    };
    for (const a of data.articles) {
      for (const w of a.where ?? []) check(w.path, a.id);
      for (const l of linesOfRoutes(a.md)) check(l, a.id);
    }
    expect(bad).toEqual([]);
  });

  it('names only figures that were taken, or whose shot waits to be retaken', async () => {
    const { data, fs } = await load();
    const root = cwd();
    const retake = new Set<string>();
    for (const d of fs.readdirSync(`${root}/help`)) {
      const f = `${root}/help/${d}/shots.json`;
      if (fs.existsSync(f)) for (const s of JSON.parse(fs.readFileSync(f, 'utf8')) as { name: string; retake?: string }[]) if (s.retake) retake.add(s.name);
    }
    const missing = data.articles.flatMap(a => refsOf(parseHelp(a.md)).figures.filter(f => !data.figures[f] && !retake.has(f)).map(f => `${a.id}: ${f}`));
    expect(missing).toEqual([]);
    for (const name of Object.keys(data.figures)) expect(fs.existsSync(`${root}/public/help/img/${name}.webp`), name).toBe(true);
    // Start here draws the small copy.
    for (const t of data.topics) for (const st of t.start) if (st.figure && data.figures[st.figure]) {
      expect(fs.existsSync(`${root}/public/help/img/${st.figure}.sm.webp`), `${st.figure}.sm`).toBe(true);
    }
  });

  it('speaks to customers: no ticket or decision numbers, no service names, no claim of compliance', async () => {
    const { data } = await load();
    const words = /\b(MIG|ZT|ADR)-\d|\b(ai|media|storage|integration|identity|billing|analytics|workflow|transcriber)-service\b|process_app|\bjobQueueId\b|HIPAA[- ]compliant|guarantees? compliance|\b(is|are) (fully )?compliant\b/i;
    const found = data.articles.flatMap(a => linesOf(parseHelp(a.md)).filter(l => words.test(l.text)).map(l => `${a.id}: ${l.text.slice(0, 80)}`));
    expect(found).toEqual([]);
  });
});

/** Every console route an article's text links to. */
function linesOfRoutes(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split('\n')) for (const s of parseSpans(line)) if (s.route) out.push(s.route);
  return out;
}
