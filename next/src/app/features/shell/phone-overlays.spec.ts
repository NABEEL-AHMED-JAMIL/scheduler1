import { describe, it, expect } from 'vitest';

/**
 * Two overlays that ran off a phone. The bell's panel was a 20rem box pinned to the bell's right
 * edge, so at 390px it started left of the screen; the open menu sat inside the sticky header and
 * grew past the viewport, so its lower links could never be scrolled to. Both are layout, which
 * the test DOM cannot measure, so these read the templates.
 */
async function read(file: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/shell/${file}`, 'utf8');
}

const classesOf = (source: string, marker: string): string[] => {
  const at = source.indexOf(marker);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('class="', at);
  return source.slice(open + 7, source.indexOf('"', open + 7)).split(/\s+/);
};

describe('overlays on a phone', () => {
  it('pins the notifications panel inside the screen below sm, and under the bell from sm up', async () => {
    const classes = classesOf(await read('notification-bell.ts'), 'bell-panel');
    expect(classes).toEqual(expect.arrayContaining(['fixed', 'inset-x-2', 'top-14',
      'sm:absolute', 'sm:inset-x-auto', 'sm:right-0', 'sm:top-full', 'sm:w-80']));
    expect(classes).not.toContain('w-80');
  });

  it('lets the open menu scroll inside itself instead of growing the sticky header past the screen', async () => {
    const classes = classesOf(await read('shell.html'), 'mobile-nav');
    expect(classes).toEqual(expect.arrayContaining(['overflow-y-auto', 'overscroll-contain', 'max-h-[calc(100dvh-3.5rem-1px)]']));
  });
});
