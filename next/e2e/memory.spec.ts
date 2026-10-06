import { test, expect, Browser, CDPSession, Page } from '@playwright/test';
import { hasToken, NEEDS, Session, sessionFor } from './support/session';

/**
 * MIG-214, the console's half: cycle the main screens as workspace 2924's administrator (4537) and check that what a
 * screen leaves behind after it is gone does not pile up. After each cycle the browser collects garbage (DevTools
 * HeapProfiler.collectGarbage) and reads its own counters (Performance.getMetrics): the JS heap, the live DOM nodes and
 * the event listeners. The first cycle warms the caches; the last is compared with it.
 *
 * Opt-in (it takes a few minutes and reads every screen): E2E_MEMORY=1 plus E2E_TENANT_ADMIN_TOKEN
 * (etl-platform/scripts/mint-test-token.sh 4537 900). Read-only: it opens screens and saves nothing.
 */
const CYCLES = Number(process.env['E2E_MEMORY_CYCLES'] ?? 5);

// The screens a workspace administrator opens most; each one loads its data and draws its tables or charts.
const SCREENS = [
  '/dashboard', '/pipelines', '/pipelines/schedules', '/pipelines/executions', '/pipelines/queue', '/pipelines/run-analytics',
  '/documents/files', '/documents/reports', '/documents/inbox', '/documents/intelligence', '/data/analytics', '/data/ask',
  '/forms/builder', '/forms/submissions', '/integration/api-collections', '/integration/sources', '/ai/prompts',
  '/ai/connections', '/billing/usage', '/billing/invoices', '/configuration/task-registry', '/administration/users',
  '/administration/access-profiles', '/notifications',
];

interface Counters { heapMb: number; nodes: number; listeners: number; documents: number; }

async function pageAs(browser: Browser, s: Session): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

async function counters(cdp: CDPSession): Promise<Counters> {
  // Twice: a first collection can free objects whose finalisers keep others alive until the second.
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = (name: string) => metrics.find(x => x.name === name)?.value ?? 0;
  return { heapMb: m('JSHeapUsedSize') / 1_048_576, nodes: m('Nodes'), listeners: m('JSEventListeners'), documents: m('Documents') };
}

test.describe('Console memory while cycling screens (MIG-214, opt-in)', () => {
  test.skip(process.env['E2E_MEMORY'] !== '1', 'Opt-in: set E2E_MEMORY=1 to run this (it takes a few minutes).');
  test.skip(!hasToken('admin'), NEEDS.admin);
  test.setTimeout(20 * 60_000);

  test('what the screens leave behind does not pile up across cycles', async ({ browser, request }, info) => {
    const page = await pageAs(browser, await sessionFor(request, 'admin'));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    // One page load, then the router moves between screens the way a click does (a full reload would throw every
    // component away and hide exactly the leaks this looks for): pushState plus popstate, which Angular's router follows.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    const visit = async (screen: string) => {
      await page.evaluate(path => {
        history.pushState(null, '', path);
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      }, screen);
      await page.waitForURL(url => url.pathname === screen, { timeout: 30_000 });
      // Rendered and loaded: the outlet holds the new screen and no spinner or busy region is left.
      await page.waitForTimeout(400);
      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return !!main && main.children.length > 0 && !document.querySelector('.spin, [aria-busy="true"]');
      }, undefined, { timeout: 20_000 }).catch(() => undefined);
    };
    const seen: Counters[] = [];
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      for (const screen of SCREENS) {
        await visit(screen);
      }
      await visit('/dashboard');
      seen.push(await counters(cdp));
    }
    const loads = await page.evaluate(() => performance.getEntriesByType('navigation').length);
    expect(loads, 'one page load: every screen after it came from the router').toBe(1);
    const lines = seen.map((c, i) => `cycle ${i + 1}: heap ${c.heapMb.toFixed(1)} MB, nodes ${c.nodes}, listeners ${c.listeners}, documents ${c.documents}`);
    await info.attach('memory.txt', { body: lines.join('\n'), contentType: 'text/plain' });
    console.log(lines.join('\n'));

    const first = seen[0];
    const last = seen[seen.length - 1];
    // A leak grows every cycle; allow some settle room over the warmed first cycle.
    expect(last.heapMb, 'JS heap after GC').toBeLessThan(first.heapMb * 1.25 + 5);
    expect(last.nodes, 'live DOM nodes after GC').toBeLessThan(first.nodes * 1.25 + 500);
    expect(last.listeners, 'event listeners after GC').toBeLessThan(first.listeners * 1.25 + 200);
    expect(last.documents, 'documents (iframes) after GC').toBeLessThanOrEqual(first.documents + 2);
  });
});
