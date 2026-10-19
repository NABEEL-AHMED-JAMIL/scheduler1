import { describe, it, expect } from 'vitest';
import { routes } from './app.routes';
import { HUBS, NAV } from './core/nav/nav-tree';

/**
 * Owner decisions #20-#23 (2026-10-19), and the owner's rule: "if a feature is removed, remove its DB fields and tables,
 * service code, API, page keys and UI end to end." The Platform pages that went -- Work in a workspace (its action is on
 * Workspaces' row menu and beside the workspace selector), Reliability (now Service health), Billing analytics and Rate
 * cards (now Billing's Analytics and Settings tabs) -- are nowhere in the console any more: no menu entry or tab, no
 * route that renders one, no component, no link and no call. Their old addresses only redirect, from app.routes.ts.
 * The heap/CPU/request history of the old Reliability page and its Disk box are gone the same way.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
  existsSync(path: string): boolean;
}

interface Source { path: string; text: string }

/** The pages that went: their addresses and their page titles. */
const GONE = ['/platform/work-in-workspace', '/platform/reliability', '/platform/billing-analytics', '/platform/rate-cards'];
const GONE_TITLES = ['Work in a workspace', 'Reliability', 'Rate cards'];

/** Where a removed address may still be written: the redirects, the specs that prove them, and the record of the decision. */
const MAY_NAME = /^src\/app\/(app\.routes\.ts|removed-pages\.spec\.ts|navigation\.spec\.ts|features\/notifications\/notification-links\.ts|features\/settings\/alerts\/alerts\.spec\.ts|characterisation\/pinned\/)/;

async function sources(): Promise<{ files: Source[]; fs: Fs; root: string }> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const files: Source[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(entry.name)) files.push({ path: path.slice(root.length + 1), text: fs.readFileSync(path, 'utf8') });
    }
  };
  walk(`${root}/src/app`);
  return { files, fs, root };
}

/** Code and markup only: a comment may say what was removed and why. */
const code = (text: string) => text.split('\n').filter(line => !/^\s*(\/\/|\/\*|\*|<!--)/.test(line)).join('\n');

const flat = (list: any[], prefix = ''): { path: string; title?: string; redirect?: unknown; render: boolean }[] =>
  list.flatMap(r => [
    { path: `${prefix}/${r.path ?? ''}`.replace(/\/+/g, '/'), title: typeof r.title === 'string' ? r.title : undefined, redirect: r.redirectTo,
      render: !!(r.loadComponent || r.component) },
    ...flat(r.children ?? [], `${prefix}/${r.path ?? ''}`),
  ]);

describe('owner #20-#23: the removed Platform pages are gone end to end', () => {
  it('no menu entry or hub tab names one', () => {
    const paths = [...NAV.flatMap(i => [i.path, ...(i.tabs ?? []).map(t => t.path), ...(i.children ?? []).flatMap(c => [c.path, ...(c.tabs ?? []).map(t => t.path)])]),
      ...HUBS.flatMap(h => h.tabs.map(t => t.path))];
    for (const gone of GONE) expect(paths, gone).not.toContain(gone);
    const labels = NAV.flatMap(i => [...(i.tabs ?? []), ...(i.children ?? []).flatMap(c => [c, ...(c.tabs ?? [])])]).map(e => e.label);
    for (const title of [...GONE_TITLES, 'Billing analytics']) expect(labels, title).not.toContain(title);
  });

  it('no route renders one: each old address only redirects', () => {
    const all = flat(routes as any[]);
    for (const gone of GONE) {
      const found = all.filter(r => r.path === gone);
      expect(found.length, gone).toBeGreaterThan(0);
      for (const r of found) {
        expect(r.render, `${gone} renders a page`).toBe(false);
        expect(r.redirect, `${gone} redirects`).toBeTruthy();
      }
    }
    for (const title of GONE_TITLES) expect(all.filter(r => r.render).map(r => r.title), title).not.toContain(title);
  });

  it('the page\'s component is deleted, and nothing links to or calls a removed page', async () => {
    const { files, fs, root } = await sources();
    expect(fs.existsSync(`${root}/src/app/features/admin/managed-service/work-in-workspace.ts`)).toBe(false);
    const offenders: string[] = [];
    for (const f of files) {
      if (MAY_NAME.test(f.path)) continue;
      const text = code(f.text);
      for (const gone of GONE) if (text.includes(gone)) offenders.push(`${f.path}: ${gone}`);
      if (/\bWorkInWorkspace\b/.test(text)) offenders.push(`${f.path}: WorkInWorkspace`);
    }
    expect(offenders).toEqual([]);
  });

  it('the Service health view draws no heap, CPU or request history and no Disk box (owner #21)', async () => {
    const { fs, root } = await sources();
    const view = code(fs.readFileSync(`${root}/src/app/features/admin/reliability/platform-health.ts`, 'utf8'));
    for (const gone of ['app-echart', 'healthOption', 'heapUsedMb', 'cpuPct', 'meanMs', 's.series', '>Disk<']) {
      expect(view.includes(gone), gone).toBe(false);
    }
    const api = code(fs.readFileSync(`${root}/src/app/features/settings/alerts/alerts.api.ts`, 'utf8'));
    expect(api).not.toMatch(/bucketMinutes|ServiceSeries|cpuPct|meanMs/);
  });
});
