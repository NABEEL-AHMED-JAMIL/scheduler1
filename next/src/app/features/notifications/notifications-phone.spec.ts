import { describe, it, expect } from 'vitest';

/**
 * On a phone the date and the two buttons sat beside the text and left the message a ~90px
 * column, seven or eight lines per notification. Below sm they now drop to their own line under
 * the text. Layout, which the test DOM cannot measure, so this reads the template.
 */
async function template(): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/notifications/notifications.html`, 'utf8');
}

const classesOf = (source: string, marker: string): string[] => {
  const at = source.indexOf(marker) + (marker.startsWith('class="') ? 7 : 0);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('class="', at);
  return source.slice(open + 7, source.indexOf('"', open + 7)).split(/\s+/);
};

describe('notifications on a phone', () => {
  it('wraps the row below sm and keeps it on one line from sm up', async () => {
    const classes = classesOf(await template(), 'class="notification-row');
    expect(classes).toEqual(expect.arrayContaining(['notification-row', 'flex-wrap', 'sm:flex-nowrap']));
  });

  it('puts the date and actions on their own full-width line below sm, indented under the title', async () => {
    const classes = classesOf(await template(), 'notification-actions');
    expect(classes).toEqual(expect.arrayContaining(['w-full', 'sm:w-auto', 'sm:pl-0']));
    expect(classes.some(c => c.startsWith('pl-['))).toBe(true);
  });

  it('labels Mark read in words on a phone, where an 11px tick is too small a target', async () => {
    const source = await template();
    const button = source.slice(source.indexOf('aria-label="Mark as read"'), source.indexOf('</button>', source.indexOf('aria-label="Mark as read"')));
    expect(button).toContain('<span class="sm:hidden">Mark read</span>');
  });
});
