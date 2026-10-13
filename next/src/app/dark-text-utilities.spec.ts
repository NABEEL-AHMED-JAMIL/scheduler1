import { describe, it, expect } from 'vitest';

/**
 * MIG-320: the -500/-600 semantic text steps are mixed for white surfaces, and styles.css swaps the -500 ones to the
 * lighter step in the dark theme. text-warn-600 was missed: Ask your data's "Documents were not searched" warning
 * measured 2.32:1 on the dark card (WCAG AA wants 4.5:1). Every semantic text utility a template uses now has its
 * dark swap, and this keeps it so for the next one somebody reaches for.
 */
interface Fs { readFileSync(p: string, e: 'utf8'): string; readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[] }

async function fs(): Promise<Fs> { return (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs; }
const root = () => (globalThis as unknown as { process: { cwd(): string } }).process.cwd();

function walk(f: Fs, dir: string, out: string[]): string[] {
  for (const e of f.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(f, p, out);
    else if (/\.(html|ts)$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('semantic text colours in the dark theme (MIG-320)', () => {
  it('gives every text-ok/warn/crit step a template uses its lighter dark-theme step', async () => {
    const f = await fs();
    const used = new Set<string>();
    for (const file of walk(f, `${root()}/src/app`, [])) {
      for (const m of f.readFileSync(file, 'utf8').matchAll(/\btext-(ok|warn|crit)-(500|600|700)\b/g)) used.add(`${m[1]}-${m[2]}`);
    }
    const css = f.readFileSync(`${root()}/src/styles.css`, 'utf8');
    const missing = [...used].filter(u => {
      const [tone] = u.split('-');
      return !new RegExp(`html\\.dark \\.text-${u}\\s*\\{\\s*color:\\s*var\\(--color-${tone}-400\\);`).test(css);
    });
    expect(used.has('warn-600'), 'the case this was written for').toBe(true);
    expect(missing).toEqual([]);
  });
});
