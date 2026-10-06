import { describe, it, expect } from 'vitest';

/**
 * MIG-320: at 1024 px the storage connections table put State and the row menu -- Test connection, the step a new
 * administrator takes right after adding one -- behind a horizontal scroll. Layout the test DOM cannot measure, so
 * this reads the template, as tasks.layout.spec does for the pipelines table.
 */
async function read(): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/admin/storage/storage-connections.html`, 'utf8');
}

const classesOf = (source: string, marker: string, tag: string, from: number): string[] => {
  const at = source.indexOf(marker, from);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('<' + tag, at);
  const head = source.slice(open, source.indexOf('>', open) + 1);
  const cls = /\sclass="([^"]*)"/.exec(head);
  return cls ? cls[1].split(/\s+/) : [];
};

describe('Storage connections table layout (MIG-320)', () => {
  it('pins the row menu to the right edge', async () => {
    const html = await read();
    const table = html.indexOf('<thead>');
    expect(classesOf(html, '<span class="sr-only">Actions</span>', 'th', table)).toContain('col-pin-right');
    expect(classesOf(html, '[cdkMenuTriggerFor]="menu"', 'td', table)).toContain('col-pin-right');
  });

  it('waits for a wide screen before showing who created and last changed a connection', async () => {
    const html = await read();
    const table = html.indexOf('<thead>');
    for (const [marker, tag] of [['>Created by</th>', 'th'], ['>Updated by</th>', 'th'],
                                 ["{{ c.createdByName || '—' }}", 'td'], ["{{ c.updatedByName || '—' }}", 'td']]) {
      expect(classesOf(html, marker, tag, table), marker).toEqual(expect.arrayContaining(['hidden', '2xl:table-cell']));
    }
  });
});
