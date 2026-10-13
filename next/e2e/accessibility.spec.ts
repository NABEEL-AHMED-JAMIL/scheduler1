import { expect as expectNow, Page } from '@playwright/test';
import { defaultSession, NO_SESSION, signedIn, test } from './support/session';
import { analyticsFixtures } from './support/analytics-fixtures';
import AxeBuilder from '@axe-core/playwright';

/**
 * The alias of the storage connection that holds the fixtures: E2E_CONNECTION, else what
 * analyticsFixtures() picks (the rebuilt workspace's own bucket, support/fixtures.ts). An alias
 * nobody has fails every spec at the first select, which looks nothing like what it is.
 */
let CONNECTION = process.env['E2E_CONNECTION'] ?? '';

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

test.skip(!signedIn(), NO_SESSION);
// Opening a dataset reads it from S3 (a 38 MB CSV for orders); a slow read is not a failure, so each test has two minutes.
test.describe.configure({ timeout: 120_000 });
// ...and an analysis or a scan over it may answer after the usual fifteen seconds.
const expect = expectNow.configure({ timeout: 45_000 });

// The fixtures are found, or made once, in the signed-in workspace (support/analytics-fixtures.ts, MIG-330).
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);   // the first run of all uploads 45 MB and saves ten boards; every later one only reads
  const made = await analyticsFixtures(request, await defaultSession(request));
  CONNECTION ||= made.connection;
});

async function openFixture(page: Page) {
  await page.goto('/objects/analytics');
  // The files are a panel now (owner, 2026-09-28): Choose a file opens it on the connection picker.
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await page.locator('#a-conn').selectOption(CONNECTION);
  await page.getByRole('button', { name: /analytics-benchmark/ }).click();
  await page.getByRole('button', { name: /sales-10mb\.csv/ }).click();
  await expect(page.getByText('150K rows')).toBeVisible({ timeout: 45_000 });   // the count reads the whole file from S3
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
  test.setTimeout(150_000);   // every tab is scanned only once it has finished reading the file
  // axe runs the instant each tab is clicked, so without this it can measure an element part-way
  // through a `transition-colors` and report a contrast ratio between two colours that exist in
  // neither state. That produced an intermittent failure here and in appearance.spec.ts naming
  // #7d828a on #989da4 for a pill whose settled values are about 16:1 apart.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page);

  // Nine: Columns was merged into Compact, and Details became the Overview.
  const tabs = ['Overview', 'Data', 'Compact', 'Profile',
                'Quality', 'Canvas', 'SQL', 'Charts', 'Activity'];
  const failures: string[] = [];

  for (const tab of tabs) {
    // By id: Quality's name grows ", N to look at" once its scan finds something (orders.csv has empty ratings).
    await page.locator(`#a-tab-${tab.toLowerCase()}`).click();
    // A tab that is still reading keeps its last answer on screen, blurred and dimmed under a spinner (aria-busy):
    // scanned then, the dimmed headings fail contrast (Profile did, once in three runs). Scan what the reader settles on.
    await expect(page.locator('#a-panel [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
    const violations = await scan(page);
    if (violations.length) failures.push(`${tab}:${describeAll(violations)}`);
  }

  // Reported together rather than failing on the first tab: fixing these one round trip at a
  // time, nine tabs deep, is how an accessibility pass gets abandoned half done.
  expect(failures, `axe found WCAG A/AA violations:\n${failures.join('\n')}`).toEqual([]);
});

test('the browse screen has no WCAG A/AA violations before a dataset is opened', async ({ page }) => {
  // The empty state is a screen in its own right and the one every reader sees first.
  await page.goto('/objects/analytics');
  // The files are a panel now (owner, 2026-09-28): Choose a file opens it on the connection picker.
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await page.locator('#a-conn').selectOption(CONNECTION);
  const violations = await scan(page);
  expect(violations, `axe found WCAG A/AA violations:${describeAll(violations)}`).toEqual([]);
});

test('the saved-analysis library has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/objects/analytics/dashboards');
  await expect(page.getByText(/re-run each time you open them/)).toBeVisible();
  const violations = await scan(page);
  expect(violations, `axe found WCAG A/AA violations:${describeAll(violations)}`).toEqual([]);
});
