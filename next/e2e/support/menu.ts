import { expect, Page } from '@playwright/test';

/**
 * Opens a page from the console's menu, whichever form the menu has at this width (shell.html): the sidebar ("Main
 * menu" complementary, every link listed) or the top bar ("Main menu" navigation, a button per section opening a panel).
 * `link` matches the start of the entry's name: an entry's name carries its hint after the label.
 */
export async function openFromMenu(page: Page, section: string, link: string): Promise<void> {
  const side = page.getByRole('complementary', { name: 'Main menu' });
  const top = page.getByRole('navigation', { name: 'Main menu' });
  await expect(side.or(top).filter({ visible: true }).first()).toBeVisible();
  const name = new RegExp(`^${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  if (await side.isVisible()) {
    await side.getByRole('link', { name }).first().click();
    return;
  }
  await top.getByRole('button', { name: section, exact: true }).click();
  await top.getByRole('link', { name }).first().click();
}
