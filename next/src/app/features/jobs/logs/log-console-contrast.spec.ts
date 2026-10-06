import { describe, it, expect } from 'vitest';

/**
 * The Console view is dark in both themes, but the file links in it took the theme's link colour:
 * in the light theme that is a dark brand blue on a near-black ground, so every path vanished and
 * left a gap in its line (owner, 2026-09-28). Inside the console a link is written light.
 */
async function css(): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/styles.css`, 'utf8');
}

describe('links in the log console', () => {
  it('are written in a light colour, whatever the theme', async () => {
    const rule = /\.log-console \.log-path\s*\{([^}]*)\}/.exec(await css());
    expect(rule, 'no .log-console .log-path rule').not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--color-ink-(50|100)\)/);
  });
});
