import { describe, it, expect } from 'vitest';
import { HUBS } from '../../core/nav/nav-tree';

/**
 * UX review B6 (W1) put the runs waiting for a review above the Review inbox's tasks for an administrator. DR2
 * (2026-10-13) made the Review inbox the Review hub's Approvals tab: those runs are now the hub's own Runs tab and part of
 * All waiting, so Approvals no longer draws a second list of them above its tabs. Layout the test DOM cannot judge, so
 * this reads the template.
 */
describe('Review › Approvals: runs waiting for review live in their own tab', () => {
  it('draws no runs list above the tasks any more', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/workflows/task-inbox.html`, 'utf8');
    expect(html).not.toContain('<app-review-waiting');
  });

  it('lists them in Review › Runs and All waiting instead', () => {
    const review = HUBS.find(hub => hub.path === '/review')!;
    expect(review.tabs.map(t => t.path)).toEqual(['/review/all', '/review/approvals', '/review/runs', '/review/documents']);
  });
});
