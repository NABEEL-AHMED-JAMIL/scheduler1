import { describe, it, expect } from 'vitest';

/**
 * The hour drill-down's hidden columns were kept under its heading, which names the hour: pick
 * another hour and every hidden column came back. A fixed key keeps the choice across hours.
 */
describe('the hour drill-down\'s column choice', () => {
  it('is kept under a fixed key, not the hour\'s heading', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/dashboard/dashboard.html`, 'utf8');
    expect(html).toMatch(/<app-table-shell columnsKey="dashboard-hour" \[heading\]="drillHeading\(\)"/);
  });
});

/**
 * The Unread tile sat inside a link, so it only matched its neighbours' height when told to fill it. UX review
 * 2026-10-12 (A7): the tile is the link itself, a cell of the row like the others.
 */
describe('the Unread tile', () => {
  it('is a linked tile of the row, not a tile inside a link', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/dashboard/dashboard.html`, 'utf8');
    expect(html).not.toMatch(/<a routerLink="\/notifications" class="block h-full/);
    expect(html).toMatch(/<app-stat-tile label="Unread"[^>]*link="\/notifications"/);
  });
});
