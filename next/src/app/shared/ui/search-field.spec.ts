import { describe, it, expect } from 'vitest';

/**
 * Toolbar search boxes cut their placeholders off ("Search id, name, topic or pip"). Each page
 * caps the box with max-w-*, but an inline-flex wrapper shrinks to the input's intrinsic 191px,
 * so no cap ever took effect. Layout, which the test DOM cannot measure, so this reads the rule.
 */
describe('search field width', () => {
  it('fills up to the cap its page sets', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const css = fs.readFileSync(`${root}/src/styles.css`, 'utf8');
    const rule = css.match(/\.search-field \{ @apply ([^;]+);/)?.[1].split(/\s+/) ?? [];
    expect(rule).toEqual(expect.arrayContaining(['relative', 'inline-flex', 'w-full']));
  });
});
