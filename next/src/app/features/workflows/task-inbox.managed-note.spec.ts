import { describe, it, expect } from 'vitest';

/**
 * ZT-W2 (owner 2026-10-21, "Platform admin decides"): in a managed session the platform administrator's inbox holds the
 * approvals nobody but their requester could decide; the task says so (workflow-service's managedNote) and wears a pill. The
 * requester alone in their workspace is told the platform administrator will decide it, not that it waits for someone to join;
 * a Report Studio card says the same to its maker and to the managed session.
 */
async function here(f: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/workflows/${f}`, 'utf8');
}

describe('ZT-W2: the managed session\'s note', () => {
  it('the task shows why the platform administrator may decide it', async () => {
    const html = await here('task-inbox.html');
    expect(html).toMatch(/@if \(d\.managedNote\) \{[\s\S]*data-test="managed-note"[\s\S]*\{\{ d\.managedNote \}\}/);
    expect(html).toContain('@if (d.onlyTheRequesterCould)');
    expect(html).toContain('No one else in this workspace can approve it; the\n                  platform administrator will decide it.');
    expect(html).not.toContain('so it waits\n                  until someone else joins');
  });

  it('the Report Studio card shows the maker\'s and the managed session\'s lines', async () => {
    const card = await here('report-review-card.ts');
    expect(card).toContain('{{ c.waitingNote }}');
    expect(card).toContain('{{ c.managedNote }}');
  });
});
