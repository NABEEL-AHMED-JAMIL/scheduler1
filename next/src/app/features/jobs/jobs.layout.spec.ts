import { describe, it, expect } from 'vitest';

/**
 * Layout the test DOM cannot measure, so these read the templates. Each case is a width where a
 * column or label ran off the card: the Jobs and Run history tables put Status and the row's own
 * actions past the right edge at 1024 and below, and the history's status tiles broke their labels
 * mid-word ("COMPLET ED") in a column about 300px wide.
 */
async function read(file: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/jobs/${file}`, 'utf8');
}

/** The classes of the nearest `<tag` at or before `marker` -- the cell a piece of content sits in. */
const classesOf = (source: string, marker: string, tag = 'td'): string[] => {
  const at = source.indexOf(marker);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('<' + tag, at);
  const head = source.slice(open, source.indexOf('>', open) + 1);
  const cls = /\sclass="([^"]*)"/.exec(head);
  return cls ? cls[1].split(/\s+/) : [];
};

describe('Run history layout', () => {
  it('keeps the status tiles two to a row at every width', async () => {
    const html = await read('history/job-history.html');
    const strip = html.slice(html.indexOf('<app-stat-strip [items]="runTiles()"'));
    const tag = strip.slice(0, strip.indexOf('/>'));
    expect(tag).toContain('[cols]="2"');
    expect(tag).not.toContain('smCols');
    expect(tag).not.toContain('lgCols');
  });

  it('pins the Status and Logs cell to the right edge', async () => {
    const html = await read('history/job-history.html');
    expect(classesOf(html, '>Status</th>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '<app-status [label]="run.jobStatus"')).toContain('col-pin-right');
    // The Logs link shares the pinned cell, so the row's one action cannot scroll away either.
    const cell = html.slice(html.indexOf('<app-status [label]="run.jobStatus"'));
    expect(cell.slice(0, cell.indexOf('</td>'))).toContain("'runs', run.jobQueueId, 'logs'");
  });

  it('waits for a wide screen before showing Queued', async () => {
    const html = await read('history/job-history.html');
    expect(classesOf(html, '>Queued</th>', 'th')).toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
    expect(classesOf(html, '{{ run.dateCreated ?')).toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
  });
});

describe('Jobs table layout', () => {
  it('waits for a wide screen before showing Task, Execution and Created', async () => {
    const html = await read('jobs.html');
    const cells: Array<[string, string]> = [
      ['>Task</th>', '@if (job.taskDetail?.taskName)'],
      ['>Execution</th>', "@if (job.execution === 'Auto')"],
      ['>Created</th>', '{{ job.dateCreated ?'],
    ];
    for (const [head, cell] of cells) {
      expect(classesOf(html, head, 'th'), head).toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
      expect(classesOf(html, cell), cell).toEqual(expect.arrayContaining(['hidden', 'xl:table-cell']));
    }
  });

  it('keeps the actions pinned to the right edge', async () => {
    const html = await read('jobs.html');
    expect(classesOf(html, '<span class="sr-only">Actions</span>', 'th')).toContain('col-pin-right');
    expect(classesOf(html, '[cdkMenuTriggerFor]="menu"')).toContain('col-pin-right');
  });
});

describe('Job assistant layout', () => {
  it('spaces the answer cards on the full page as well as in the dock', async () => {
    const html = await read('assistant/job-assistant.html');
    const at = html.indexOf('@for (turn of turns(); track turn.id)');
    const wrapper = html.slice(html.lastIndexOf('<div', at), at);
    // Static, not behind compact(): on the full page the cards sat flush against each other.
    expect(/\sclass="([^"]*)"/.exec(wrapper)?.[1].split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'gap-3']));
    expect(wrapper).not.toContain('[class.gap-3]');
  });

  it('gives a fact its full width in the dock rather than half of it', async () => {
    const html = await read('assistant/job-assistant.html');
    const facts = html.slice(html.indexOf("@case ('facts')"));
    const dl = facts.slice(facts.indexOf('<dl'), facts.indexOf('>', facts.indexOf('<dl')) + 1);
    expect(dl).toContain('[class.sm:grid-cols-2]="!compact()"');
  });
});

describe('Job editor weekday toggles', () => {
  /**
   * Several days can be on at once, so "on" has to stand out from the track by itself. The single-
   * select .seg-on (a white chip on a grey track) measured 1.06:1 in light and 1.13:1 in dark.
   */
  it('fills a selected day with the primary button colours and marks it with a check', async () => {
    const html = await read('edit/job-edit.html');
    const group = html.slice(html.indexOf('aria-labelledby="days-of-week"') - 80);
    const block = group.slice(0, group.indexOf('</div>'));
    expect(block).toContain('seg-multi');
    expect(block).not.toContain('seg-on');
    expect(block).toContain('name="check"');
    const ts = await read('edit/job-edit.ts');
    expect(ts).toMatch(/\.seg-multi \.seg-btn\[aria-pressed="true"\]\s*\{[^}]*var\(--btn-primary-bg\)/);
  });
});
