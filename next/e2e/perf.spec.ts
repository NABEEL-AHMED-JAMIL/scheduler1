import { test, expect, Browser, Page, APIRequestContext } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api, authOf, canSignIn, NEEDS, pageAs, Session, sessionFor } from './support/session';

/**
 * MIG-416: the console's browser performance, page by page, against a budget file (e2e/perf-budgets.json).
 *
 * Each main page is opened as a workspace administrator at 1920 and at 1024 (a full load, the HTTP cache warm after the
 * first) and measured in the page itself:
 *
 *   ttcMs       time to content: the later of "the page shows its heading and nothing in <main> is aria-busy" and the
 *               end of the last /api/ answer it asked for before the network went quiet
 *   lcpMs       largest contentful paint
 *   cls         cumulative layout shift (shifts without recent input)
 *   longTaskMs  main-thread time past 50 ms in long tasks (total blocking time, while the page loads)
 *   requests    requests the page made until the network went quiet
 *
 * Then the JS heap: the pages are walked in the app (router navigation, no reload) three times; the heap after a
 * garbage collection is read after the first walk and after the third. `heap.usedMbMax` holds the size, `growthMbMax`
 * what three walks may add (a leak grows it every walk).
 *
 * The pages are the card's: Home, Runs, a run's page, Dashboards (a board when the workspace has one), Analysis, Report
 * Studio's library, a template's designer and a report, Billing and Forms. The ids come from the workspace's own data
 * through the API; a page whose data the workspace lacks (no board, no report) is measured as its list and says so.
 *
 * Who: session.ts's admin (E2E_TENANT_ADMIN_TOKEN, or E2E_MINT=1 with E2E_TENANT_ADMIN_ID). Reads only.
 * Results: test-results/perf/<width>.json and test-results/perf/summary.md. The e2e phase of final-regression skips this
 * spec (@perf); its perf phase runs it.
 */

interface PageBudget { ttcMs: number; lcpMs: number; cls: number; longTaskMs: number; requests: number }
interface Budgets {
  widths: number[];
  pages: Record<string, PageBudget>;
  heap: { usedMbMax: number; growthMbMax: number };
}
interface Measured { page: string; url: string; ttcMs: number; lcpMs: number; cls: number; longTaskMs: number; requests: number;
  note?: string }

export const BUDGETS_FILE = resolve(__dirname, 'perf-budgets.json');
const budgets = JSON.parse(readFileSync(BUDGETS_FILE, 'utf8')) as Budgets;

/** The pages measured, in order: a name (the budget file's key) and how to find its address in the workspace. */
export const PERF_PAGES = ['home', 'runs', 'run', 'dashboards', 'analysis', 'report-library', 'report-designer', 'report',
  'billing', 'forms'] as const;
type PageName = typeof PERF_PAGES[number];

const OUT = resolve(__dirname, '..', 'test-results', 'perf');

/** Installed before the app loads: LCP, layout shift and long tasks as the page sees them. */
const OBSERVERS = `
  window.__perf = { lcp: 0, cls: 0, longTaskMs: 0, longTasks: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__perf.longTasks++;
    window.__perf.longTaskMs += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
`;

async function json(request: APIRequestContext, s: Session, path: string): Promise<any> {
  const answer = await request.get(`${api}${path}`, { headers: authOf(s) });
  return answer.ok() ? (await answer.json()).data : null;
}

/** Each page's address in this workspace, and a note where the workspace has no data for it. */
async function addresses(request: APIRequestContext, s: Session): Promise<Record<PageName, { url: string; note?: string }>> {
  const jobs: any[] = (await json(request, s, '/sourceJob.json/listSourceJob?page=1&limit=50')) ?? [];
  let run: { url: string; note?: string } = { url: '/runs/latest', note: 'no run in the workspace: the run list instead' };
  for (const job of jobs.filter(j => j.lastJobRun)) {
    const runs: any[] = (await json(request, s, `/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${job.jobId}`))?.jobQueues ?? [];
    const one = runs.find(r => r.jobQueueId && r.jobStatus === 'Completed');
    if (one) { run = { url: `/pipelines/schedules/${job.jobId}/runs/${one.jobQueueId}` }; break; }
  }
  const boards: any[] = (await json(request, s, '/analyticsWorkspace.json/fetchAllDashboards')) ?? [];
  const templates: any[] = (await json(request, s, '/reportTemplate.json/fetchAll'))?.templates ?? [];
  const reports: any[] = (await json(request, s, '/reportLibrary.json/reports?limit=1'))?.reports ?? [];
  const board = boards[0]?.analyticsDashboardId;
  return {
    home: { url: '/dashboard' },
    runs: { url: '/runs/latest' },
    run,
    dashboards: board ? { url: `/data/analytics/dashboards?board=${board}` }
      : { url: '/data/analytics/dashboards', note: 'no board in the workspace: the board list' },
    analysis: { url: '/data/analytics' },
    'report-library': { url: '/reports/library' },
    'report-designer': templates[0] ? { url: `/reports/templates/${templates[0].templateId}/design` }
      : { url: '/reports/templates', note: 'no template: the template list' },
    report: reports[0] ? { url: `/reports/library/${reports[0].reportId}` }
      : { url: '/reports/library', note: 'no report: the library' },
    billing: { url: '/billing/usage' },
    forms: { url: '/forms/builder' },
  };
}

/** Content is shown: a heading, and nothing in <main> says it is still loading. Answers performance.now() at that moment. */
async function contentShown(page: Page): Promise<number> {
  const handle = await page.waitForFunction(() => {
    const main = document.querySelector('main') ?? document.body;
    const heading = main.querySelector('h1');
    const busy = main.querySelector('[aria-busy="true"]');
    return heading && (heading as HTMLElement).offsetParent !== null && !busy ? performance.now() : null;
  }, undefined, { polling: 50, timeout: 45_000 });
  return Number(await handle.jsonValue());
}

async function measure(page: Page, name: string, url: string, note?: string): Promise<Measured> {
  let requests = 0;
  const count = () => { requests++; };
  page.on('request', count);
  await page.goto(url, { waitUntil: 'commit' });
  const shown = await contentShown(page);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  page.off('request', count);
  const inPage = await page.evaluate(() => {
    const p = (window as any).__perf ?? {};
    const apiEnds = performance.getEntriesByType('resource')
      .filter(e => e.name.includes('/api/')).map(e => (e as PerformanceResourceTiming).responseEnd);
    return { lcp: p.lcp ?? 0, cls: p.cls ?? 0, longTaskMs: p.longTaskMs ?? 0, lastApi: apiEnds.length ? Math.max(...apiEnds) : 0 };
  });
  return { page: name, url, ttcMs: Math.round(Math.max(shown, inPage.lastApi)), lcpMs: Math.round(inPage.lcp),
    cls: Math.round(inPage.cls * 1000) / 1000, longTaskMs: Math.round(inPage.longTaskMs), requests, ...(note ? { note } : {}) };
}

/** Router navigation inside the app (no reload): what a person clicking through the menu does to the heap. */
async function navigateInApp(page: Page, url: string): Promise<void> {
  await page.evaluate(to => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate', { state: {} })); }, url);
  await contentShown(page).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

async function heapMb(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage') as { usedSize: number };
  await cdp.detach();
  return Math.round(usage.usedSize / 1048576 * 10) / 10;
}

function over(m: Measured, b: PageBudget): string[] {
  const out: string[] = [];
  if (m.ttcMs > b.ttcMs) out.push(`time to content ${m.ttcMs} ms > ${b.ttcMs}`);
  if (m.lcpMs > b.lcpMs) out.push(`LCP ${m.lcpMs} ms > ${b.lcpMs}`);
  if (m.cls > b.cls) out.push(`CLS ${m.cls} > ${b.cls}`);
  if (m.longTaskMs > b.longTaskMs) out.push(`long tasks ${m.longTaskMs} ms > ${b.longTaskMs}`);
  if (m.requests > b.requests) out.push(`${m.requests} requests > ${b.requests}`);
  return out;
}

test.describe('the budget file', () => {
  test('names exactly the pages measured, each with every budget', () => {
    expect(Object.keys(budgets.pages).sort()).toEqual([...PERF_PAGES].sort());
    for (const [name, b] of Object.entries(budgets.pages)) {
      for (const key of ['ttcMs', 'lcpMs', 'cls', 'longTaskMs', 'requests'] as const) {
        expect(typeof b[key], `${name}.${key}`).toBe('number');
        expect(b[key], `${name}.${key}`).toBeGreaterThan(0);
      }
    }
    expect(budgets.widths).toEqual([1920, 1024]);
    expect(budgets.heap.usedMbMax).toBeGreaterThan(0);
    expect(budgets.heap.growthMbMax).toBeGreaterThan(0);
  });

  test('flags a page over any of its budgets and passes one within them', () => {
    const b = budgets.pages['home'];
    const within: Measured = { page: 'home', url: '/', ttcMs: 1, lcpMs: 1, cls: 0, longTaskMs: 0, requests: 1 };
    expect(over(within, b)).toEqual([]);
    const slow = { ...within, ttcMs: b.ttcMs + 1, cls: b.cls + 0.01, requests: b.requests + 1 };
    expect(over(slow, b).map(x => x.split(' ')[0])).toEqual(['time', 'CLS', String(slow.requests)]);
  });
});

test.describe('browser performance (MIG-416) @perf', () => {
  test.skip(!canSignIn('admin'), NEEDS.admin);
  test.describe.configure({ timeout: 600_000 });
  let s: Session;
  let pages: Record<PageName, { url: string; note?: string }>;
  test.beforeAll(async ({ request }) => {
    s = await sessionFor(request, 'admin');
    pages = await addresses(request, s);
  });

  for (const width of budgets.widths) {
    test(`each main page within its budget at ${width}`, async ({ browser }) => {
      const page = await open(browser, s, width);
      const measured: Measured[] = [];
      const problems: string[] = [];
      for (const name of PERF_PAGES) {
        const m = await measure(page, name, pages[name].url, pages[name].note);
        measured.push(m);
        problems.push(...over(m, budgets.pages[name]).map(p => `${name} (${width}): ${p}`));
      }
      // The heap: three walks through the pages in the app, read after a garbage collection.
      await page.goto('/dashboard');
      await contentShown(page);
      const walk = async () => { for (const name of PERF_PAGES) await navigateInApp(page, pages[name].url); };
      await walk();
      const first = await heapMb(page);
      await walk();
      await walk();
      const third = await heapMb(page);
      const heap = { afterFirstWalkMb: first, afterThirdWalkMb: third, growthMb: Math.round((third - first) * 10) / 10 };
      if (third > budgets.heap.usedMbMax) problems.push(`heap (${width}): ${third} MB > ${budgets.heap.usedMbMax}`);
      if (heap.growthMb > budgets.heap.growthMbMax) problems.push(`heap (${width}): grew ${heap.growthMb} MB over two walks > ${budgets.heap.growthMbMax}`);
      record(width, measured, heap, problems);
      await page.context().close();
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});

async function open(browser: Browser, s: Session, width: number): Promise<Page> {
  const page = await pageAs(browser, s, { viewport: { width, height: 1000 } });
  await page.context().addInitScript(OBSERVERS);
  return page;
}

function record(width: number, measured: Measured[], heap: Record<string, number>, problems: string[]): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${width}.json`), JSON.stringify({ width, at: new Date().toISOString(), measured, heap, problems }, null, 1));
  const lines = [`## ${width} px`, '', '| page | time to content ms | LCP ms | CLS | long tasks ms | requests | note |', '|---|---|---|---|---|---|---|',
    ...measured.map(m => `| ${m.page} | ${m.ttcMs} | ${m.lcpMs} | ${m.cls} | ${m.longTaskMs} | ${m.requests} | ${m.note ?? ''} |`), '',
    `Heap after a GC: ${heap['afterFirstWalkMb']} MB after the first walk, ${heap['afterThirdWalkMb']} MB after the third (${heap['growthMb']} MB).`, '',
    problems.length ? problems.map(p => `- FAIL ${p}`).join('\n') : 'Every page within its budget.', ''];
  writeFileSync(resolve(OUT, `summary-${width}.md`), lines.join('\n'));
}
