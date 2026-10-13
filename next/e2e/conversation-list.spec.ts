import { test, expect, Page, TestInfo } from '@playwright/test';
import { join } from 'path';
import { api, authOf, canMintPeople, pageAs, Session, sessionAsPerson } from './support/session';
import { hasFixtures, NEEDS_FIXTURES, riverside } from './support/fixtures';

/**
 * The AI Assistant's conversation list (owner 2026-10-12), live as Riverside's administrator, who has many conversations:
 * the list in day groups with short titles, kinds and outcome badges; the search reaching a word only in an answer; the
 * chips; pin (and unpin, leaving it as it was); the rail, remembered across a reload; and All conversations with its
 * facets, table and detail panel. Reads only, apart from a pin it takes back.
 *
 * Needs ai-service and the console behind :9098/:4400 with the conversation list. E2E_SHOTS: a folder the screenshots are
 * also written to, at 1920 and 1187 wide, light and dark.
 */

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
  const extra = process.env['E2E_SHOTS'];
  if (extra) await page.screenshot({ path: join(extra, `${name}.png`), fullPage: false });
}

async function shots(page: Page, info: TestInfo, name: string): Promise<void> {
  for (const width of [1920, 1187]) {
    await page.setViewportSize({ width, height: 1080 });
    for (const theme of ['light', 'dark'] as const) {
      const now = await page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
      // The top bar's theme menu (2026-10-13): open it, pick the theme.
      if (now !== theme) {
        await page.locator('button[title^="Theme:"]').first().dispatchEvent('click');
        await page.locator(`[data-theme-choice="${theme}"]`).first().dispatchEvent('click');
      }
      await page.waitForTimeout(500);
      await shot(page, info, `${name}-${width}-${theme}`);
    }
  }
}

test.describe('AI Assistant: the conversation list', () => {
  test.skip(!hasFixtures(), NEEDS_FIXTURES);
  test.skip(!canMintPeople(), 'needs the mint script for Riverside\'s administrator');
  test.setTimeout(180_000);

  let admin: Session;

  test.beforeAll(async ({ request }) => {
    admin = await sessionAsPerson(request, riverside().admin);
  });

  test('day groups, short titles, badges, search, chips, pin and the rail', async ({ browser, request }, info) => {
    const listed = await (await request.get(`${api}/aiPrompt.json/assistant/conversationList`, { headers: authOf(admin), params: { limit: 200 } })).json();
    expect(listed.status, listed.message).toBe('SUCCESS');
    const rows = listed.data.rows as { conversationId: number; shortTitle: string; kind: string; outcome: string; pinned: boolean }[];
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every(r => !!r.shortTitle && !!r.kind)).toBe(true);

    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => localStorage.removeItem('ai.conversations.rail'));
    await page.goto('/ai/assistant');
    const list = page.locator('app-conversation-list');
    await expect(list.locator('[data-conversation]').first()).toBeVisible({ timeout: 30_000 });
    await expect(list.locator('[data-group]').first()).toBeVisible();
    const groups = await list.locator('[data-group]').evaluateAll(gs => gs.map(g => g.getAttribute('data-group')));
    const order = ['pinned', 'today', 'yesterday', 'week', 'older'];
    expect(groups.map(g => order.indexOf(g!))).toEqual([...groups.map(g => order.indexOf(g!))].sort((a, b) => a - b));
    await expect(list.locator('[data-badge]').first()).toBeVisible();
    await shots(page, info, 'list');

    // A conversation opened: the list marks it, the thread shows it.
    await page.setViewportSize({ width: 1920, height: 1080 });
    const pipelineRow = list.locator('[data-kind="pipeline"]').first();
    if (await pipelineRow.count()) {
      await pipelineRow.locator('.cl-open').click();
      await expect(pipelineRow.locator('.cl-open')).toHaveAttribute('aria-current', 'true');
      await shots(page, info, 'list-open');
      await page.setViewportSize({ width: 1920, height: 1080 });
    }

    // The chips ask the server for one kind.
    await list.getByRole('button', { name: 'Pipelines', exact: true }).click();
    await expect(list.locator('li[data-kind="question"], li[data-kind="run"]')).toHaveCount(0);
    await expect(list.locator('li[data-kind="pipeline"]').first()).toBeVisible();
    await shot(page, info, 'chips-pipelines-1920-light');
    await list.getByRole('button', { name: 'All', exact: true }).click();

    // The search reaches messages, server side.
    await list.locator('input[type="search"]').fill('readmission');
    await expect(list.locator('[data-conversation]').first()).toBeVisible();
    await shot(page, info, 'search-readmission-1920-light');
    await list.locator('input[type="search"]').fill('zzqx-nothing-like-this');
    await expect(list.locator('[data-empty]')).toContainText('Nothing matches');
    await list.locator('input[type="search"]').fill('');
    await list.locator('input[type="search"]').press('Escape');
    await expect(list.locator('[data-conversation]').first()).toBeVisible();

    // Pin from the row's actions (they appear on hover), then unpin: as it was.
    const target = rows.find(r => !r.pinned)!;
    const row = list.locator(`li[data-conversation="${target.conversationId}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await row.getByRole('button', { name: /^Pin / }).click();
    await expect(list.locator(`[data-group="pinned"] [data-conversation="${target.conversationId}"]`)).toBeVisible();
    await shot(page, info, 'pinned-1920-light');
    const pinnedRow = list.locator(`[data-group="pinned"] li[data-conversation="${target.conversationId}"]`);
    // The keyboard reaches the row's menu: focus its actions, open, Unpin.
    await pinnedRow.getByRole('button', { name: /^Actions for / }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Unpin' }).click();
    await expect(list.locator('[data-group="pinned"]')).toHaveCount(rows.some(r => r.pinned) ? 1 : 0);

    // The rail, remembered across a reload.
    await list.getByRole('button', { name: 'Fold the conversations to icons' }).click();
    await expect(list).toHaveClass(/cl-rail/);
    await page.reload();
    await expect(page.locator('app-conversation-list')).toHaveClass(/cl-rail/);
    await shots(page, info, 'rail');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('app-conversation-list').getByRole('button', { name: 'Show the conversations' }).click();
    await expect(page.locator('app-conversation-list')).not.toHaveClass(/cl-rail/);
    await page.context().close();
  });

  test('All conversations: facets, the table and a detail panel', async ({ browser }, info) => {
    const page = await pageAs(browser, admin, { viewport: { width: 1920, height: 1080 } });
    await page.goto('/ai/assistant');
    await page.locator('[data-see-all]').click();
    await expect(page).toHaveURL(/\/ai\/assistant\/conversations$/);
    await expect(page.locator('[data-table] [data-conversation]').first()).toBeVisible({ timeout: 30_000 });
    const pipelineCount = Number((await page.locator('[data-facet-kind="pipeline"]').locator('xpath=..').locator('.cp-count').textContent())?.trim());
    await page.locator('[data-facet-kind="pipeline"]').check();
    await expect(page.locator('[data-total]')).toContainText(`${pipelineCount} conversation`);
    await page.locator('[data-table] [data-conversation]').first().click();
    await expect(page.locator('[data-detail]')).toBeVisible();
    await expect(page.locator('[data-detail]')).toContainText('First question');
    await shots(page, info, 'all-conversations');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('[data-detail] [data-open]').click();
    await expect(page).toHaveURL(/\/ai\/assistant\?c=\d+/);
    await page.context().close();
  });
});
