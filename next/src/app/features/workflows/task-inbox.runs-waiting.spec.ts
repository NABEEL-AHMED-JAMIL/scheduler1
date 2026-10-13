import { describe, it, expect } from 'vitest';

/**
 * UX review B6 (W1): the runs waiting for a review -- the AI Assistant's among them -- are in the Review inbox for an
 * administrator, above the tasks, each leading to its run page's Next steps. Layout the test DOM cannot judge, so this
 * reads the template.
 */
describe('Review inbox: runs waiting for review', () => {
  it('lists them for whoever decides runs, above the tabs, but not on My requests', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/workflows/task-inbox.html`, 'utf8');
    const at = html.indexOf('<app-review-waiting');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf('<div class="tabs inbox-tabs"'));
    expect(html.slice(html.lastIndexOf('@if', at), at)).toContain("canDecideRuns() && tab() !== 'requests'");
  });
});
