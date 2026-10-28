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

/**
 * Where a heading cell with this text starts, whatever attributes it carries (owner 2026-10-27: sortable headings
 * carry appSort and [sortBy]); `cls` names a class it must have. -1 when there is none.
 */
const thAt = (html: string, text: string, cls = ''): number => {
  const re = new RegExp(`<th\\b[^>]*${cls ? `class="[^"]*\\b${cls}\\b[^"]*"[^>]*` : ''}>${text}</th>`);
  return html.search(re);
};

describe('status columns stay on screen', () => {
  /** Owner 2026-10-12: on every run list the status sits right before the message; the pinned column holds the actions. */
  it('puts the Queue status before the message and pins the in-flight menu', async () => {
    const html = await read('queue/queue.html');
    expect(thAt(html, 'Status', 'w-32')).toBeGreaterThan(-1);
    expect(thAt(html, 'Status', 'w-32')).toBeLessThan(thAt(html, 'Message'));
    expect(classesOf(html, '>Actions</th>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '[cdkMenuTriggerFor]="menu"', 'td')).toContain('col-pin-right');
  });

  it('gives the Failed runs status its own header before the error and pins the run link', async () => {
    const html = await read('reports/reports.html');
    expect(thAt(html, 'Status', 'w-32')).toBeLessThan(thAt(html, 'Error'));
    expect(classesOf(html, '(click)="openRunLogs(failure)"', 'td')).toContain('col-pin-right');
  });

  it('puts the Runs status before the message, the pinned column keeping only the actions', async () => {
    const html = await read('jobs/history/job-history.html');
    expect(thAt(html, 'Status', 'w-32')).toBeGreaterThan(-1);
    expect(thAt(html, 'Status', 'w-32')).toBeLessThan(thAt(html, 'Message'));
    expect(html).not.toContain('Status · Logs');
    expect(classesOf(html, 'data-test="run-retry"', 'button')).toContain('btn-icon');
  });

  it('pins the Task health state cell', async () => {
    const html = await read('reports/reports.html');
    expect(classesOf(html, '>State</th>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '[class.pill-ok]="task.tone === \'ok\'"')).toContain('col-pin-right');
  });
});
