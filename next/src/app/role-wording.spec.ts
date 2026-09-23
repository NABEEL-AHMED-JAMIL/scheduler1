/**
 * A role is named in words a person reads: "platform administrator", "tenant administrator",
 * "tenant user". The clipped "platform admin" slipped into labels, messages and test names once;
 * this keeps it out. Identifiers such as PLATFORM_ADMIN or platform-admin are values, not prose,
 * and are left alone.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

const CLIPPED = /\b(platform|tenant) admins?\b/i;

describe('role wording', () => {
  it('never shortens administrator to admin in anything a person reads', async () => {
    // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
        } else if (/\.(ts|html)$/.test(entry.name) && !path.endsWith('role-wording.spec.ts')) {
          fs.readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
            if (CLIPPED.test(line)) {
              found.push(`${path.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
            }
          });
        }
      }
    };
    walk(`${root}/src`);
    walk(`${root}/e2e`);
    expect(found).toEqual([]);
  });
});
