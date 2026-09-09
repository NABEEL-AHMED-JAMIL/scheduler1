import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'fs';

/**
 * WCAG 2.1 A and AA over the Analytics Studio, checked by axe rather than by eye.
 *
 * Document 15's accessibility row said "no audit, no automated check", and an audit done once by
 * hand would have closed it in the weakest possible way -- true on the day, silently false after
 * the next template edit. This runs on every suite run instead.
 *
 * <b>What this cannot tell you.</b> axe finds roughly a third to a half of WCAG issues: it reads
 * the rendered accessibility tree, so it catches contrast, names, roles, labels and structure, and
 * it cannot judge whether a name is MEANINGFUL, whether focus order makes sense, or whether the
 * screen is usable by keyboard alone. Two of those are checked next door in keyboard.spec.ts. The
 * rest is not covered by anything here, and this file is not evidence that it is.
 *
 * Each tab is scanned separately because they are separate screens sharing an address: a
 * violation on Quality is invisible while Details is showing.
 *
 * @author Nabeel Ahmed
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function signedIn(): boolean {
  try {
    const state = JSON.parse(readFileSync('e2e/.auth/state.json', 'utf8'));
    return (state.origins ?? []).length > 0;
  } catch {
    return false;
  }
}

test.beforeEach(async () => {
  test.skip(!signedIn(),
    'No session. Start the stack and run with E2E_PASSWORD=… npx playwright test');
});

async function openFixture(page: Page) {
  await page.goto('/analytics');
  await page.locator('select').first().selectOption('etl-bucket');
  await page.getByRole('button', { name: /analytics-benchmark/ }).click();
  await page.getByRole('button', { name: /sales-10mb\.csv/ }).click();
  await expect(page.getByText(/150K/)).toBeVisible();
}

/** Scans what is on screen and returns the violations, worst first. */
async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations;
}

/** A violation rendered so the failure message names the fix, not just the rule id. */
function describeAll(violations: Awaited<ReturnType<typeof scan>>): string {
  return violations.map(v =>
    `\n  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.length} element(s), first: `
    + `${v.nodes[0]?.target.join(' ')}`).join('');
}

test('the dataset workspace has no WCAG A/AA violations on any tab', async ({ page }) => {
  await openFixture(page);

  const tabs = ['Details', 'Data', 'Compact', 'Columns', 'Profile',
                'Quality', 'Canvas', 'SQL', 'Charts', 'Activity'];
  const failures: string[] = [];

  for (const tab of tabs) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    const violations = await scan(page);
    if (violations.length) failures.push(`${tab}:${describeAll(violations)}`);
  }

  // Reported together rather than failing on the first tab: fixing these one round trip at a
  // time, ten tabs deep, is how an accessibility pass gets abandoned half done.
  expect(failures, `axe found WCAG A/AA violations:\n${failures.join('\n')}`).toEqual([]);
});

test('the browse screen has no WCAG A/AA violations before a dataset is opened', async ({ page }) => {
  // The empty state is a screen in its own right and the one every reader sees first.
  await page.goto('/analytics');
  await page.locator('select').first().selectOption('etl-bucket');
  const violations = await scan(page);
  expect(violations, `axe found WCAG A/AA violations:${describeAll(violations)}`).toEqual([]);
});

test('the saved-analysis library has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/analytics/dashboards');
  await expect(page.getByText(/re-run every time it is opened/)).toBeVisible();
  const violations = await scan(page);
  expect(violations, `axe found WCAG A/AA violations:${describeAll(violations)}`).toEqual([]);
});
