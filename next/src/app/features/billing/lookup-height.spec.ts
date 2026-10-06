import { describe, it, expect } from 'vitest';

/**
 * Rate cards (and the other list-and-detail screens): the list beside the detail sets the card's
 * height, and the entries table sat in a fixed 26rem box that scrolled with blank space below it.
 * The box now fills what the detail pane has left, and is never shorter than it was.
 */
describe('a lookup detail\'s entries', () => {
  it('fill the pane rather than a fixed-height strip', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const css = fs.readFileSync(`${root}/src/styles.css`, 'utf8');
    const scroll = /\.lookup-entries-scroll\s*\{([^}]*)\}/.exec(css)![1];
    expect(scroll).toMatch(/flex:\s*1 1 0/);
    expect(scroll).toMatch(/min-height:\s*26rem/);
    expect(scroll).not.toMatch(/max-height/);
    expect(/\.lookup-entries\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/flex:\s*1 1 auto/);
  });
});
