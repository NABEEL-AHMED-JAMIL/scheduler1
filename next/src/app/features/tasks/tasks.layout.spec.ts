import { describe, it, expect } from 'vitest';

/**
 * Layout the test DOM cannot measure, so these read the template. At 1024 the table put Status and
 * the row menu behind a horizontal scroll; on a phone a card cut every task name to about twelve
 * characters because the status pill shared the title's line.
 */
async function read(file: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/tasks/${file}`, 'utf8');
}

/** The classes of the nearest `<tag` at or before `marker`. */
const classesOf = (source: string, marker: string, tag = 'td', from = 0): string[] => {
  const at = source.indexOf(marker, from);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('<' + tag, at);
  const head = source.slice(open, source.indexOf('>', open) + 1);
  const cls = /\sclass="([^"]*)"/.exec(head);
  return cls ? cls[1].split(/\s+/) : [];
};

describe('Tasks table layout', () => {
  it('waits for a wide screen before showing Type', async () => {
    const html = await read('tasks.html');
    const table = html.indexOf('<table class="table-modern">');
    expect(classesOf(html, '>Type</th>', 'th', table)).toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
    expect(classesOf(html, "{{ task.sourceTaskType?.serviceName || '—' }}", 'td', table))
      .toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
  });

  it('pins the row menu to the right edge', async () => {
    const html = await read('tasks.html');
    const table = html.indexOf('<table class="table-modern">');
    expect(classesOf(html, '[cdkMenuTriggerFor]="taskMenu"', 'td', table)).toContain('col-pin-right');
    expect(classesOf(html, '<span class="sr-only">Actions</span>', 'th', table)).toContain('col-pin-right');
  });

  it('does not break a bucket name at its hyphens', async () => {
    const html = await read('tasks.html');
    const table = html.indexOf('<table class="table-modern">');
    expect(classesOf(html, '{{ task.bucket }}', 'div', table)).toContain('whitespace-nowrap');
  });
});

describe('Task cards on a phone', () => {
  it('lets the title wrap to two lines instead of cutting it at one', async () => {
    const html = await read('tasks.html');
    const classes = classesOf(html, '[title]="task.taskName">{{ task.taskName', 'h3');
    expect(classes).toEqual(expect.arrayContaining(['line-clamp-2', 'break-words']));
    expect(classes).not.toContain('truncate');
  });

  it('moves the status pill under the title, beside the id', async () => {
    const html = await read('tasks.html');
    const card = html.slice(html.indexOf('<article'), html.indexOf('<dl'));
    const title = card.indexOf('<h3');
    const status = card.indexOf('<app-status [label]="task.taskStatus"');
    expect(status).toBeGreaterThan(title);
    expect(card.slice(title, status)).toContain('#{{ task.taskDetailId }}');
    // Not inside the right-hand group that holds the menu.
    expect(card.slice(card.indexOf('shrink-0 flex items-center gap-1'))).not.toContain('<app-status');
  });
});
