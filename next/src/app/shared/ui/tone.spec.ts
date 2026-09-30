import { toneClass } from './tone';

describe('toneClass', () => {
  it('names the class that sets each token a colour helper returns', () => {
    expect(toneClass('var(--color-ok-500)')).toBe('tone-ok');
    expect(toneClass('var(--color-warn-500)')).toBe('tone-warn');
    expect(toneClass('var(--color-crit-500)')).toBe('tone-crit');
    expect(toneClass('var(--accent-mark)')).toBe('tone-brand');
    expect(toneClass('var(--series-warn)')).toBe('tone-pending');
    expect(toneClass('var(--border-strong)')).toBe('tone-strong');
  });

  it('falls back to the quiet tone rather than leaving a row unstyled', () => {
    expect(toneClass('var(--no-such-token)')).toBe('tone-quiet');
    expect(toneClass(undefined)).toBe('tone-quiet');
  });

  /** Every class it can return is defined in styles.css, or the row would paint nothing. */
  it('only returns classes the stylesheet defines', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const css = fs.readFileSync(`${root}/src/styles.css`, 'utf8');
    for (const cls of ['tone-ok', 'tone-warn', 'tone-crit', 'tone-brand', 'tone-pending', 'tone-log', 'tone-muted', 'tone-strong', 'tone-quiet',
                       'tone-fill', 'tone-text', 'tone-ring', 'tone-edge']) {
      expect(css, cls).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*--tone|\\.${cls}\\s*\\{[^}]*var\\(--tone\\)`));
    }
  });
});
