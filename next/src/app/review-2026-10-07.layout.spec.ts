import { describe, it, expect } from 'vitest';

/**
 * The console review of 2026-10-07 (etl-platform/docs/reviews/console-review-2026-10-07.md): the layout fixes made in
 * templates and the stylesheet, held as scans of the sources like layout-rules.spec.ts, so none of them comes back.
 */
interface Fs { readFileSync(path: string, encoding: 'utf8'): string }

async function read(path: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/${path}`, 'utf8');
}

/** The opening tag of the first element carrying this attribute or text. */
function tagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, marker).toBeGreaterThanOrEqual(0);
  const open = html.lastIndexOf('<', at);
  return html.slice(open, html.indexOf('>', at) + 1);
}

describe('console review 2026-10-07: layout', () => {
  it('scrolls long lists in their own box: a collection\'s versions, the inbox\'s arrivals, the catalog\'s assets', async () => {
    expect(tagWith(await read('src/app/features/integration/api-collections/collection.html'), 'heading="Versions"')).not.toContain('scrollRows');
    expect(tagWith(await read('src/app/features/documents/inbox/inbox.html'), 'heading="Arrivals"')).not.toContain('scrollRows');
    expect(tagWith(await read('src/app/features/catalog/catalog.html'), 'heading="Assets"')).not.toContain('scrollRows');
  });

  it('bounds a run\'s AI steps in a scroll box, so forty answers do not push the steps and the log off the page', async () => {
    const tag = tagWith(await read('src/app/features/jobs/logs/job-logs.html'), 'data-test="ai-steps"');
    expect(tag).toContain('max-h-[32rem]');
    expect(tag).toContain('overflow-y-auto');
  });

  it('keeps the Kafka topics table wide enough to show a topic\'s name on a tablet', async () => {
    expect(await read('src/styles.css')).toMatch(/\.kafka-table \{[^}]*min-width: 52rem/);
  });

  it('keeps the run analytics\' last-run day and a model connection\'s prompt names on one line', async () => {
    expect(tagWith(await read('src/app/features/reports/reports.html'), "task.lastDay ? dayLabel")).toContain('whitespace-nowrap');
    expect(tagWith(await read('src/app/features/ai/connections/connections.html'), "[routerLink]=\"['/ai/prompts', r.promptId, 'edit']\""))
      .toContain('truncate');
  });

  it('sets table cells in the table\'s own type size: no text-sm cell in API clients, forms, rate cards, requests', async () => {
    for (const file of ['src/app/features/integration/api-clients/api-clients.html', 'src/app/features/forms/form-builder.html',
      'src/app/features/forms/form-submissions.html', 'src/app/features/billing/rate-cards.html',
      'src/app/features/tenant-request/tenant-requests.html']) {
      expect(await read(file), file).not.toMatch(/<td[^>]*\btext-sm\b/);
    }
    expect(await read('src/app/features/integration/api-clients/api-clients.html')).toContain('<th>Expires</th>');
  });

  it('gives the reports search room for its whole placeholder', async () => {
    expect(tagWith(await read('src/app/features/documents/generated/generated-reports.html'), 'class="search-field w-72')).toBeTruthy();
  });
});
