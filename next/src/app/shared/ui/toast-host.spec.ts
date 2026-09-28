import { describe, it, expect } from 'vitest';

/**
 * Toasts sat bottom-right, exactly where every form and dialog puts Save, so "Check the highlighted
 * fields." covered the button it was about; the floating assistant and file chat sit there too.
 * The stack now sits bottom-left, and its empty gaps let clicks through. Layout, which the test
 * DOM cannot measure, so this reads the template.
 */
describe('toast placement', () => {
  it('stacks bottom-left and does not block clicks between toasts', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const source = fs.readFileSync(`${root}/src/app/shared/ui/toast-host.ts`, 'utf8');
    const stack = source.slice(source.indexOf('class="fixed'), source.indexOf('"', source.indexOf('class="fixed') + 7)).split(/\s+/);
    expect(stack).toEqual(expect.arrayContaining(['bottom-4', 'left-4', 'pointer-events-none']));
    expect(stack).not.toContain('right-4');
    expect(source).toContain('pointer-events-auto');
  });
});
