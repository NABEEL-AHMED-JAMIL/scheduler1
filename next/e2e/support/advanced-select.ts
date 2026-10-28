import { expect, Locator } from '@playwright/test';

/**
 * What to pick in the console's advanced select (shared/ui/advanced-select.ts): an option's value or its name (as
 * `selectOption('x')` takes either), `{ label }` for the name only, or `{ index }` for the nth option shown.
 */
export type AdvancedPick = string | { label: string } | { index: number };

/** The select's button, given the button itself (`#id`, `getByLabel`) or the `app-advanced-select` element around it. */
async function triggerOf(select: Locator): Promise<Locator> {
  const tag = await select.evaluate(e => e.tagName.toLowerCase());
  return tag === 'button' ? select : select.locator('button.adv-trigger');
}

/**
 * Picks an option of an advanced select, where a native select took `selectOption`: opens the panel (drawn in the page's
 * overlay, not inside the select), searches for the option so a long, virtualised list draws it, and clicks it. Waits
 * for the panel to close, so the next step sees the pick.
 */
export async function pickOption(select: Locator, what: AdvancedPick): Promise<void> {
  const trigger = await triggerOf(select);
  const page = trigger.page();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const listId = await trigger.getAttribute('aria-controls');
  const list = page.locator(`[id="${listId}"]`);
  const search = page.locator(`input[role="combobox"][aria-controls="${listId}"]`);
  let option: Locator;
  if (typeof what === 'object' && 'index' in what) {
    option = list.locator('[role="option"][data-value]').nth(what.index);
  } else {
    const text = typeof what === 'string' ? what : what.label;
    await search.fill(text);
    const byName = list.locator('[role="option"][data-value]').filter({ has: page.locator('.adv-name').getByText(text, { exact: true }) });
    option = typeof what === 'string' ? list.locator(`[role="option"][data-value="${text.replace(/"/g, '\\"')}"]`).or(byName) : byName;
  }
  await option.first().click();
  // The button's name now carries the choice ("Image: Riverside logo"), so a locator found by its old name no longer
  // matches it: the pick is done when its list has closed.
  await expect(list).toBeHidden();
}

/** Picks the "none" row (the select's `clearLabel`). */
export async function clearOption(select: Locator): Promise<void> {
  const trigger = await triggerOf(select);
  await trigger.click();
  const listId = await trigger.getAttribute('aria-controls');
  await trigger.page().locator(`[id="${listId}-clear"]`).click();
  await expect(trigger.page().locator(`[id="${listId}"]`)).toBeHidden();
}

/** The name an advanced select shows for its choice (a native select's `inputValue` read the value; this reads the name). */
export async function chosenLabel(select: Locator): Promise<string> {
  const trigger = await triggerOf(select);
  return ((await trigger.locator('.adv-name').first().textContent({ timeout: 2_000 }).catch(() => '')) ?? '').trim();
}
