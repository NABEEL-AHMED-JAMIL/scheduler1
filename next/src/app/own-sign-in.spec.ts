import { describe, it, expect, afterEach } from 'vitest';
import { useMemoryStorage } from './shared/testing/memory-storage';
import { routes } from './app.routes';
import { restoreClock, visit } from './characterisation/harness';

/**
 * ZT-A12 follow-up (owner 2026-10-21, "Managed session only"): a platform administrator's OWN sign-in (no workspace, not a
 * managed session) never reads or decides a workspace's data. The services answer it 403 on these families; the console
 * does not ask. Every page the own sign-in can reach is visited through the real routes, and none of its requests may be
 * one of them. A workspace's page shows the needs-workspace card at its own address; the platform's pages keep their calls.
 */
const REFUSED: RegExp[] = [
  // storage-service and media-service (GET /storage.json/buckets is still answered: the platform's own buckets).
  /^\/storage\.json\/(?!buckets\b)/, /^\/fileShare\.json\//, /^\/audioTranscript\.json\/extractFromBucket/,
  /^\/documentConverter\.json\/(render\b|fetchAllTemplates|fetchTemplateById|saveTemplate|deleteTemplate)/,
  /^\/report(Template|Library|Asset|Data|Preview|Approve|Publish|Generate)\.json\//,
  /^\/reportStudio\.json\/(?!schema|components|pageLimit|ceiling)/,
  // ai-service (the Tool Registry's tools/list|history|platformState and aiConnection.json/list stay).
  /^\/aiPrompt\.json\/(?!tools\/(list|history|platformState)\b)/, /^\/askData\.json\//, /^\/reportDesigner\.json\//,
  /^\/aiAgent\.json\/(?!processAdHoc)/, /^\/aiConnection\.json\/(?!list\b)/,
  // Core (the names list, the counts and the task registry's own lines stay).
  /^\/sourceJob\.json\//, /^\/sourceTask\.json\/(?!names\b)/,
  /^\/pipeline\.json\/(?!count\b|steps\/reads\b|steps\/tasks(\?|$|\/usage|\/history|\/platformState))/,
  /^\/message\.json\//, /^\/report\.json\//, /^\/fileChat\.json\//, /^\/form\.json\//, /^\/formSubmission\.json\//,
  /^\/dashboard\.json\/(userStatistics|weeklyHrRunningStatisticsDimension)/,
  // workflow-service.
  /^\/taskInbox\.json\//, /^\/workflow\.json\//,
];

function refused(described: string): boolean {
  const path = described.split(' ')[1] ?? '';
  return REFUSED.some(re => re.test(path));
}

/** Every address under the shell that opens a page (redirects are followed by the pages they land on). */
function pages(rs: readonly any[], prefix = ''): string[] {
  const out: string[] = [];
  for (const r of rs) {
    const path = `${prefix}/${r.path ?? ''}`.replace(/\/+/g, '/');
    if (r.redirectTo !== undefined || r.path === '**') continue;
    if (r.loadComponent || r.component || r.loadChildren) out.push(path);
    if (r.children?.length) out.push(...pages(r.children, path));
  }
  return out;
}
const sample = (p: string) => p.replace(/:([A-Za-z]+)/g, (_m, name: string) =>
  name === 'number' ? 'INV-2026-0001' : name === 'pipelineKey' ? 'REF_CSV_CHECK_V1' : name === 'jobQueueId' ? '7331' : '2833');

/** Answers the default empty list would not satisfy (the sign-in history reads a page, not a list). */
const NO_SIGN_INS = { status: 'SUCCESS', message: '', data: { items: [], total: 0, limit: 50, offset: 0 } };
const QUIET = { 'GET /appUser.json/security/history': NO_SIGN_INS, 'GET /tenant.json/security/history': NO_SIGN_INS };

const shell = routes.find(r => r.path === '' && !!r.children)!;
const ADDRESSES = [...new Set(pages(shell.children!))].filter(p => p !== '/').sort();

describe('ZT-A12 follow-up: the platform administrator\'s own sign-in reads no workspace\'s data', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  for (const address of ADDRESSES) {
    it(`${address}: no request a workspace's data answers`, async () => {
      const v = await visit(sample(address), 'PLATFORM_ADMIN', null, QUIET);
      expect(v.surface.requests.filter(refused), `${address} asked for a workspace's data`).toEqual([]);
    });
  }

  const CARDS: [string, string][] = [
    ['/data/files', "Files are a workspace's"],
    ['/runs/latest', "Runs are a workspace's"],
    ['/pipelines/schedules', "Schedules are a workspace's"],
    ['/pipelines/schedules/2833/runs/7331/logs', "A run is a workspace's"],
    ['/reports/library', "The report library is a workspace's"],
    ['/reports/from-pipelines', "Reports from pipelines are a workspace's"],
    ['/forms/builder', "Forms are a workspace's"],
    ['/ai/assistant', "The AI Assistant is a workspace's"],
    ['/pipelines/prompts/1049/edit', "A prompt is a workspace's"],
    ['/settings/model-connections', "Model connections are a workspace's"],
    ['/connections/storage', "Storage connections are a workspace's"],
    ['/administration/data-policies', "A data policy is a workspace's"],
  ];
  for (const [address, words] of CARDS) {
    it(`${address}: the needs-workspace card, at the same address`, async () => {
      const v = await visit(address, 'PLATFORM_ADMIN', null);
      expect(v.surface.url).toBe(address);
      const card = v.main.querySelector('[data-test="needs-workspace"]');
      expect(card?.textContent).toContain(words);
      expect(card?.querySelector('a')?.getAttribute('href')).toBe('/platform/workspaces');
      expect(v.surface.requests.filter(refused)).toEqual([]);
    });
  }

  it('a managed session (the workspace\'s administrator) opens the page itself', async () => {
    const v = await visit('/runs/latest', 'TENANT_ADMIN', null, {}, { msvc: true });
    expect(v.main.querySelector('[data-test="needs-workspace"]')).toBeNull();
    expect(v.surface.requests.some(r => r.includes('/message.json/fetchLogs'))).toBe(true);
  });

  it('Home keeps its three counts and drills into no hour, from a link or a click', async () => {
    const v = await visit('/dashboard?from=2026-09-22&to=2026-09-28&date=2026-09-24&hr=10', 'PLATFORM_ADMIN', null);
    expect(v.surface.requests.some(r => r.includes('/dashboard.json/jobStatusStatistics'))).toBe(true);
    expect(v.surface.requests.some(r => r.includes('/dashboard.json/jobRunningStatistics'))).toBe(true);
    expect(v.surface.requests.some(r => r.includes('/dashboard.json/weeklyHrsRunningJobStatistics'))).toBe(true);
    const cells = Array.from(v.main.querySelectorAll<HTMLButtonElement>('app-heatmap button:not([disabled])'));
    for (const cell of cells.slice(0, 3)) cell.click();
    const later = await v.settle();
    expect([...v.surface.requests, ...later].filter(r => r.includes('weeklyHrRunningStatisticsDimension'))).toEqual([]);
    expect(v.main.querySelector('#dash-drill')).toBeNull();
    expect(v.main.querySelector('[data-test="heat-hint"]')?.textContent).toContain('Work in this workspace');
  });

  it('Task Registry: the registry, its switches and counts; no Legacy pipelines list, and a count opens no list', async () => {
    const v = await visit('/settings/task-registry', 'PLATFORM_ADMIN', null);
    expect(v.surface.requests).toContain('GET /pipeline.json/steps/tasks');
    expect(v.surface.requests).toContain('GET /pipeline.json/steps/tasks/usage');
    expect(v.surface.requests.filter(r => r.includes('/pipeline.json/list'))).toEqual([]);
    expect(v.main.querySelector('[data-test="legacy-in-workspace"]')?.textContent).toContain('Work in this workspace');
    const count = Array.from(v.main.querySelectorAll<HTMLButtonElement>('button.link-inline'))
      .find(b => /pipeline|run/i.test(b.getAttribute('title') ?? '') || /^\d+$/.test((b.textContent ?? '').trim()));
    if (count) {
      count.click();
      const later = await v.settle();
      expect(later.filter(r => /steps\/tasks\/(pipelines|runs)/.test(r))).toEqual([]);
    }
  });

  for (const address of ['/tools/converter', '/tools/transcript']) {
    it(`${address}: an upload only; a workspace's bucket, dataset or run is not offered`, async () => {
      const v = await visit(address, 'PLATFORM_ADMIN', null);
      expect(v.surface.buttons.filter(b => /From a bucket|PDF from a (dataset|run)/.test(b))).toEqual([]);
      expect(v.main.textContent).toContain('Work in this workspace');
    });
  }

  it('Profile: no activity card and no myActivity', async () => {
    const v = await visit('/profile', 'PLATFORM_ADMIN', null);
    expect(v.surface.requests.filter(r => r.includes('myActivity'))).toEqual([]);
    expect(v.main.querySelector('[data-test="your-activity"]')).toBeNull();
  });
});
