import AxeBuilder from '@axe-core/playwright';
import { NO_SESSION, signedIn, test, expect } from './support/session';

/**
 * Every button on the menu's screens has a name a screen reader can say: axe's button-name rule, run on the rendered
 * page as the tenant administrator sees it.
 *
 * src/app/button-names.spec.ts holds the templates to the same rule at `ng test` time; this is the half a scan of the
 * sources cannot see -- a component that renders nothing inside a button, a name bound to a value that is empty, a
 * library's own buttons (the flow canvas, the charts). It reads the first screen of each page only: a dialog, a menu or
 * a second tab is not opened here.
 *
 * Read only: nothing is clicked, made or changed.
 */
const PAGES = [
  '/dashboard',
  '/connections/connectors', '/connections/storage', '/connections/databases', '/connections/api-collections',
  '/connections/sources', '/connections/contracts',
  '/documents/in', '/documents/types', '/documents/datasets', '/documents/email-in', '/documents/file-drop',
  '/forms/builder', '/forms/submissions',
  '/pipelines/list', '/pipelines/schedules', '/pipelines/prompts',
  '/ai/assistant', '/workflows/designer',
  '/runs/latest', '/runs/by-date', '/runs/analytics', '/runs/failed', '/runs/backfills',
  '/review/all', '/review/approvals', '/review/runs', '/review/documents',
  '/data/analytics/dashboards', '/data/ask', '/data/analytics', '/data/catalog', '/data/reports', '/data/files',
  '/tools/converter', '/tools/transcript',
  '/administration/users', '/administration/access-profiles', '/administration/security',
  '/administration/data-policies', '/administration/appearance',
  '/billing/usage', '/billing/invoices', '/billing/documents',
  '/settings/model-connections', '/settings/tools', '/settings/task-registry', '/settings/kafka', '/settings/values',
  '/settings/home-pages', '/settings/task-groups', '/settings/alerts',
  '/developers/api-clients', '/developers/portal',
];

test.skip(!signedIn(), NO_SESSION);
test.describe.configure({ timeout: 300_000 });

test('every button on the menu\'s screens has an accessible name', async ({ page }) => {
  const nameless: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('main h1').first(), `${path} shows its title`).toBeVisible();
    // What the page reads arrives after its title; give the first answers a moment to render their rows.
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page }).withRules(['button-name']).analyze();
    for (const violation of results.violations) {
      for (const node of violation.nodes) nameless.push(`${path}: ${node.target.join(' ')}  ${node.html.slice(0, 160)}`);
    }
  }
  expect(nameless, 'give these buttons aria-label or visible text').toEqual([]);
});
