import { describe, it, expect } from 'vitest';

/**
 * Every row's menu was announced as "Actions", so a screen-reader list of buttons read "Actions,
 * Actions, Actions" with nothing to tell the rows apart; and an inline link looked like the text
 * beside it until hovered, since --accent-text is the body colour (UI audit, Low). Both are
 * markup and style, which the test DOM does not render, so this reads the sources.
 */
async function fs() {
  return (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as {
    readFileSync(p: string, e: 'utf8'): string;
    readdirSync(p: string, o: { recursive: true }): string[];
  };
}
const root = () => (globalThis as unknown as { process: { cwd(): string } }).process.cwd();

describe('row controls', () => {
  it('names each row menu after its row', async () => {
    const { readFileSync, readdirSync } = await fs();
    const base = `${root()}/src/app/features`;
    const offenders = readdirSync(base, { recursive: true })
      .filter(f => /\.(html|ts)$/.test(f) && !f.endsWith('.spec.ts'))
      .filter(f => readFileSync(`${base}/${f}`, 'utf8').includes('aria-label="Actions"'));
    expect(offenders).toEqual([]);
  });

  it('marks an inline link at rest, not only on hover', async () => {
    const css = (await fs()).readFileSync(`${root()}/src/styles.css`, 'utf8');
    expect(css).toMatch(/\.link-inline \{\s*text-decoration-line: underline;/);
    expect(css).toContain('button.link-inline { cursor: pointer; }');
  });
});
