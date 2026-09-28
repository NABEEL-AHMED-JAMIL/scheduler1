import { describe, it, expect } from 'vitest';

/**
 * On a phone, and on a tablet for Reports, the status and outcome columns of the Queue and Reports
 * tables sat past the right edge. Layout the test DOM cannot measure, so these read the templates.
 */
async function read(file: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/${file}`, 'utf8');
}

/** The classes of the nearest `<tag` at or before `marker`. */
const classesOf = (source: string, marker: string, tag = 'td'): string[] => {
  const at = source.indexOf(marker);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('<' + tag, at);
  const head = source.slice(open, source.indexOf('>', open) + 1);
  return (/\sclass="([^"]*)"/.exec(head)?.[1] ?? '').split(/\s+/);
};

describe('status columns stay on screen', () => {
  it('pins the Queue status cell, which carries the in-flight menu', async () => {
    const html = await read('queue/queue.html');
    expect(classesOf(html, '>Status</th>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '<app-status [label]="row.jobStatus"')).toContain('col-pin-right');
  });

  it('pins the Failed runs outcome cell, which carries the Logs link', async () => {
    const html = await read('reports/reports.html');
    expect(classesOf(html, '>Outcome</th>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '<app-status [label]="failure.status"')).toContain('col-pin-right');
  });

  it('pins the Task health state cell', async () => {
    const html = await read('reports/reports.html');
    expect(classesOf(html, '>State</th>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '[class.pill-ok]="task.tone === \'ok\'"')).toContain('col-pin-right');
  });
});
