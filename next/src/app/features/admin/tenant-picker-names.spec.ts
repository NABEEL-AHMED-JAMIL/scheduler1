import { describe, it, expect } from 'vitest';

/**
 * Audit 09-22: every workspace/tenant picker has an accessible name. A toolbar combobox has no
 * <label for>, so before app-combobox took `ariaLabel` it was announced by its placeholder alone
 * -- "All tenants" -- which says what is selected, not what the box is. A scan of the sources, so a
 * new screen is held to it from its first commit.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

async function featureSources(): Promise<{ path: string; text: string }[]> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const files: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
        files.push({ path: path.slice(root.length + 1), text: fs.readFileSync(path, 'utf8') });
      }
    }
  };
  walk(`${root}/src/app/features`);
  return files;
}

describe('tenant and workspace pickers', () => {
  it('each has a name: a <label for> its id, an enclosing app-field, or ariaLabel', async () => {
    const unnamed: string[] = [];
    for (const file of await featureSources()) {
      for (const match of file.text.matchAll(/<app-combobox\b[^>]*>/g)) {
        const tag = match[0];
        const id = /\bid="([^"]+)"/.exec(tag)?.[1] ?? '';
        if (!/tenant|workspace/i.test(id)) continue;
        const labelled = new RegExp(`for="${id}"`).test(file.text);
        const named = /\bariaLabel=|\[ariaLabel\]=/.test(tag);
        if (!labelled && !named) unnamed.push(`${file.path}: #${id}`);
      }
    }
    expect(unnamed).toEqual([]);
  });
});
