import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Route, Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { anonymousOnly, pageGuard, roleGuard } from './core/auth/auth.guard';
import { PAGE_LABELS } from './core/auth/page-keys';
import { Shell } from './features/shell/shell';
import { useMemoryStorage } from './shared/testing/memory-storage';

/**
 * MIG-246 (Wave 4) and MIG-267 (Wave 5): the console's top navigation after the MIG-218 renames.
 *
 * Menu groups: Dashboard, Integration, Pipelines, Documents, Data, Forms, Workflows, AI,
 * Configuration, Billing, Administration. The renames are UI labels only -- database and API names
 * and the access-profile page keys keep their meaning -- and every address the console ever had
 * still lands on its page: a bookmark, a document link or a stored notification link never ends on
 * "Page not found".
 */

function flatten(list: Route[], prefix = ''): { path: string; route: Route }[] {
  return list.flatMap(r => {
    const path = `${prefix}/${r.path ?? ''}`.replace(/\/+/g, '/');
    return [{ path, route: r }, ...flatten(r.children ?? [], path)];
  });
}

const byPath = (path: string) => flatten(routes).find(e => e.path === path && !e.route.redirectTo)?.route;

@Component({ template: '' })
class PageStub {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class ShellStub {}

/**
 * The real route table with every page swapped for a stub and the guards taken off, so only the
 * addresses and the redirects are under test. The signed-out routes (landing, sign-in) are dropped:
 * these are a signed-in person's addresses.
 */
function addressesOnly(list: Route[]): Route[] {
  return list
    .filter(r => !(r.canMatch ?? []).includes(anonymousOnly))
    .filter(r => r.path !== 'login')
    .map(r => {
      const copy: Route = { ...r };
      delete copy.canActivate; delete copy.canActivateChild; delete copy.canMatch;
      if (r.loadComponent) { delete copy.loadComponent; copy.component = PageStub; }
      if (r.component) copy.component = r.children ? ShellStub : PageStub;
      if (r.children) copy.children = addressesOnly(r.children);
      return copy;
    });
}

async function land(url: string): Promise<{ url: string; title: string | undefined }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter(addressesOnly(routes))],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const router = TestBed.inject(Router);
  let leaf = router.routerState.snapshot.root;
  while (leaf.firstChild) leaf = leaf.firstChild;
  return { url: router.url, title: leaf.routeConfig?.title as string | undefined };
}

/**
 * Every old address -> where it lands now. The first block is the 43 the MIG-222 baseline pinned
 * (characterisation/pinned/routes.ts before this change); the second is every address that was a
 * page until this change and is now an old one.
 */
const OLD_ADDRESSES: [string, string][] = [
  ['/admin/access-profiles', '/administration/access-profiles'],
  ['/admin/storage', '/integration/storage-connections'],
  ['/admin/tenant-requests', '/administration/tenant-requests'],
  ['/admin/tenants', '/administration/tenants'],
  ['/admin/users', '/administration/users'],
  ['/administration/billing', '/billing/usage'],
  ['/administration/billing/analytics', '/billing/analytics'],
  ['/administration/billing/documents', '/billing/documents'],
  ['/administration/billing/invoices', '/billing/invoices'],
  ['/administration/billing/invoices/INV-2026-0001', '/billing/invoices/INV-2026-0001'],
  ['/administration/billing/rates', '/billing/rates'],
  ['/ai/agents', '/ai/prompts'],
  ['/ai/assistant', '/ai/assistant'],
  ['/ai/connections', '/ai/connections'],
  ['/ai/models', '/ai/connections'],
  ['/ai/prompts', '/ai/prompts'],
  ['/ai/prompts/1049/edit', '/ai/prompts/1049/edit'],
  ['/ai/prompts/new', '/ai/prompts/new'],
  ['/ai/tools', '/ai/tools'],
  ['/analytics', '/data/analytics'],
  ['/analytics/dashboards', '/data/analytics/dashboards'],
  ['/billing', '/billing/usage'],
  ['/configuration/lookup', '/configuration/values'],
  ['/jobs', '/pipelines/schedules'],
  ['/jobs/2833/assistant', '/pipelines/schedules/2833/assistant'],
  ['/jobs/2833/edit', '/pipelines/schedules/2833/edit'],
  ['/jobs/2833/history', '/pipelines/schedules/2833/executions'],
  ['/jobs/2833/runs/7331/logs', '/pipelines/schedules/2833/runs/7331/logs'],
  ['/jobs/bulk', '/pipelines/schedules/bulk'],
  ['/jobs/history', '/pipelines/executions'],
  ['/jobs/new', '/pipelines/schedules/new'],
  ['/objects', '/documents/files'],
  ['/queue', '/pipelines/queue'],
  ['/reports', '/pipelines/run-analytics'],
  ['/settings/forms', '/configuration/task-registry'],
  ['/settings/kafka', '/configuration/kafka'],
  ['/settings/lookup', '/configuration/values'],
  ['/settings/pipeline-forms', '/configuration/task-registry'],
  ['/settings/pipelines', '/configuration/task-registry'],
  ['/settings/storage-connections', '/integration/storage-connections'],
  ['/settings/task-types', '/configuration/kafka'],
  ['/tasks', '/pipelines'],
  ['/tasks/1854/edit', '/pipelines/1854/edit'],
  ['/tasks/bulk', '/pipelines/bulk'],
  ['/tasks/new', '/pipelines/new'],
  // Pages until MIG-246.
  ['/operations/jobs', '/pipelines/schedules'],
  ['/operations/jobs/new', '/pipelines/schedules/new'],
  ['/operations/jobs/bulk', '/pipelines/schedules/bulk'],
  ['/operations/jobs/2833/edit', '/pipelines/schedules/2833/edit'],
  ['/operations/jobs/2833/assistant', '/pipelines/schedules/2833/assistant'],
  ['/operations/jobs/2833/history', '/pipelines/schedules/2833/executions'],
  ['/operations/jobs/2833/runs/7331/logs', '/pipelines/schedules/2833/runs/7331/logs'],
  ['/operations/jobs/history', '/pipelines/executions'],
  ['/operations/queue', '/pipelines/queue'],
  ['/operations/tasks', '/pipelines'],
  ['/operations/tasks/new', '/pipelines/new'],
  ['/operations/tasks/bulk', '/pipelines/bulk'],
  ['/operations/tasks/1854/edit', '/pipelines/1854/edit'],
  ['/operations/reports', '/pipelines/run-analytics'],
  ['/configuration/pipelines', '/configuration/task-registry'],
  ['/configuration/storage-connections', '/integration/storage-connections'],
  ['/objects/files', '/documents/files'],
  ['/objects/analytics', '/data/analytics'],
  ['/objects/analytics/dashboards', '/data/analytics/dashboards'],
  ['/tools/converter', '/documents/converter'],
  ['/tools/transcript', '/documents/transcript'],
  ['/assistants/prompts', '/ai/prompts'],
  ['/assistants/prompts/new', '/ai/prompts/new'],
  ['/assistants/prompts/1049/edit', '/ai/prompts/1049/edit'],
  ['/assistants/connections', '/ai/connections'],
];

describe('MIG-246: every old address lands on its page', () => {
  for (const [from, to] of OLD_ADDRESSES) {
    it(`${from} -> ${to}`, async () => {
      const landed = await land(from);
      expect(landed.url).toBe(to);
      expect(landed.title).toBeTruthy();
      expect(landed.title).not.toBe('Page not found');
    });
  }

  it('carries the query string through a redirect (the dashboard drill-down, a notification link)', async () => {
    const landed = await land('/operations/jobs/history?targetDate=2026-09-28&targetHr=9&jobStatus=Failed');
    expect(landed.url).toBe('/pipelines/executions?targetDate=2026-09-28&targetHr=9&jobStatus=Failed');
  });

  it('marks every old address a full match, so a short one cannot swallow a longer one', () => {
    const shell = routes.find(r => r.component === Shell)!;
    const loose = (shell.children ?? []).filter(r => typeof r.redirectTo === 'string' && r.path !== ''
      && r.pathMatch !== 'full').map(r => r.path);
    expect(loose).toEqual([]);
  });

  it('keeps an unknown address on Page not found', async () => {
    expect((await land('/operations/nothing-here')).title).toBe('Page not found');
  });
});

describe('MIG-246: the renamed pages keep their gates', () => {
  const guards = (r?: Route) => [...(r?.canActivate ?? [])];
  // [new address, title, page key, least role]: the same key and role the old address carried.
  const PAGES: [string, string, string | undefined, string | undefined][] = [
    ['/pipelines', 'Pipelines', 'tasks', undefined],
    ['/pipelines/new', 'New pipeline', 'tasks', 'TENANT_ADMIN'],
    ['/pipelines/bulk', 'Bulk pipelines', 'tasks', 'TENANT_ADMIN'],
    ['/pipelines/:taskDetailId/edit', 'Edit pipeline', 'tasks', 'TENANT_ADMIN'],
    ['/pipelines/schedules', 'Schedules', 'jobs', undefined],
    ['/pipelines/schedules/new', 'New schedule', 'jobs', undefined],
    ['/pipelines/schedules/bulk', 'Bulk schedules', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/edit', 'Edit schedule', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/assistant', 'Schedule assistant', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/executions', 'Executions', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/runs/:jobQueueId/logs', 'Run logs', 'jobs', undefined],
    ['/pipelines/executions', 'Executions', 'jobs', undefined],
    ['/pipelines/queue', 'Queue', 'queue', undefined],
    ['/pipelines/run-analytics', 'Run analytics', 'reports', undefined],
    ['/integration/storage-connections', 'Storage Connections', undefined, 'TENANT_ADMIN'],
    // MIG-247: built. Read by every member holding the page; the screens hide the administrator's writes.
    ['/integration/api-collections', 'API Collections', 'api-collections', undefined],
    ['/integration/api-collections/:collectionId', 'API collection', 'api-collections', undefined],
    // MIG-248: built. Sources, database connections and data contracts, on the one page key Identity serves.
    ['/integration/sources', 'Sources', 'sources', undefined],
    // MIG-272: built. Every member holding the page reads, extracts and reviews; a type's editor hides its save.
    ['/documents/intelligence', 'Document Intelligence', 'document-intelligence', undefined],
    ['/documents/review', 'Review queue', 'document-review', undefined],
    ['/documents/review/:extractionId', 'Review a document', 'document-review', undefined],
    ['/documents/files', 'Browse files', 'objects', 'TENANT_USER'],
    // MIG-239: built. Browse files' key and floor: every member reads and uploads; configuring is an administrator's.
    ['/documents/inbox', 'Inbox', 'objects', 'TENANT_USER'],
    ['/documents/converter', 'Document Converter', 'tools-converter', undefined],
    // MIG-253: generated outputs, behind the converter's key (no key of its own yet).
    ['/documents/reports', 'Reports', 'tools-converter', undefined],
    ['/documents/transcript', 'Audio Transcript', 'tools-transcript', undefined],
    ['/data/analytics', 'Analytics Studio', 'analytics', undefined],
    ['/data/analytics/dashboards', 'Saved Analyses', 'analytics-dashboards', undefined],
    // MIG-252: built. The assistant and its tools ride the Prompts key.
    ['/ai/assistant', 'AI Assistant', 'ai-prompts', undefined],
    ['/ai/tools', 'Tool Registry', 'ai-prompts', undefined],
    ['/ai/prompts', 'Prompts', 'ai-prompts', undefined],
    ['/ai/prompts/new', 'New prompt', 'ai-prompts', 'TENANT_ADMIN'],
    ['/ai/prompts/:promptId/edit', 'Edit prompt', 'ai-prompts', 'TENANT_ADMIN'],
    ['/ai/connections', 'Model connections', undefined, 'TENANT_ADMIN'],
    ['/configuration/task-registry', 'Task Registry', undefined, 'TENANT_ADMIN'],
  ];
  for (const [path, title, pageKey, minRole] of PAGES) {
    it(path, () => {
      const route = byPath(path);
      expect(route, path).toBeDefined();
      expect(route!.title).toBe(title);
      expect(route!.data?.['pageKey']).toBe(pageKey);
      expect(route!.data?.['minRole']).toBe(minRole);
      if (pageKey) expect(guards(route)).toContain(pageGuard);
      if (minRole) expect(guards(route)).toContain(roleGuard);
    });
  }

  it('tells the two bulk screens and the two references screens apart as before', () => {
    expect(byPath('/pipelines/schedules/bulk')!.data?.['kind']).toBe('job');
    expect(byPath('/pipelines/bulk')!.data?.['kind']).toBe('task');
  });
});

describe('MIG-246 / MIG-267: pages still to be built get a gated entry point', () => {
  const SOON: [string, string, string][] = [
    ['/integration/connectors', 'Connector Hub', 'connector-hub'],
    ['/data/ask', 'Ask your data', 'ask-data'],
    ['/data/catalog', 'Data Catalog', 'data-catalog'],
    ['/workflows/inbox', 'Task inbox', 'task-inbox'],
    ['/workflows/designer', 'Workflow designer', 'workflow-designer'],
  ];
  for (const [path, title, key] of SOON) {
    it(`${path} is titled, gated by '${key}', and says it is coming`, () => {
      const route = byPath(path);
      expect(route, path).toBeDefined();
      expect(route!.title).toBe(title);
      expect(route!.data?.['pageKey']).toBe(key);
      expect(route!.data?.['comingSoon']).toBeTruthy();
      expect(route!.canActivate).toContain(pageGuard);
      expect((PAGE_LABELS as Record<string, string>)[key]).toBe(title);
    });
  }

  it('names the renamed pages as the menu does when a page is refused', () => {
    expect(PAGE_LABELS['jobs']).toBe('Schedules');
    expect(PAGE_LABELS['tasks']).toBe('Pipelines');
    expect(PAGE_LABELS['reports']).toBe('Run analytics');
  });
});

/* ------------------------------------------------------------------------------------------------ */

describe('MIG-246 / MIG-267: the menu each role sees', () => {
  useMemoryStorage();

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }));
  });
  afterEach(() => localStorage.removeItem('etl_auth_user'));

  function menuFor(role: string, pageKeys: string[] | null): string[] {
    const claims = btoa(JSON.stringify({ sub: 'm@example.com', appUserId: 7, userRole: role }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem('etl_auth_user', JSON.stringify({
      username: 'm@example.com', userRole: role, appUserId: 7,
      accessToken: `header.${claims}.unsigned`, refreshToken: 'r', pageKeys,
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const shell = TestBed.createComponent(Shell).componentInstance;
    return shell.nav().flatMap(item => item.path
      ? [`${item.label} -> ${item.path}`]
      : (item.children ?? []).map(c => `${item.label} › ${c.label}${c.soon ? ' (soon)' : ''} -> ${c.path}`));
  }

  const DASHBOARD = ['Dashboard -> /dashboard'];
  const INTEGRATION_SOON = [
    'Integration › Connector Hub (soon) -> /integration/connectors',
    'Integration › API Collections -> /integration/api-collections',
    'Integration › Sources -> /integration/sources',
  ];
  const PIPELINES = [
    'Pipelines › Pipelines -> /pipelines',
    'Pipelines › Schedules -> /pipelines/schedules',
    'Pipelines › Queue -> /pipelines/queue',
    'Pipelines › Run analytics -> /pipelines/run-analytics',
  ];
  const DOCUMENT_INTELLIGENCE = [
    'Documents › Document Intelligence -> /documents/intelligence',
    'Documents › Review queue -> /documents/review',
  ];
  const DOCUMENTS = [
    'Documents › Document Converter -> /documents/converter',
    'Documents › Reports -> /documents/reports',
    'Documents › Browse files -> /documents/files',
    'Documents › Inbox -> /documents/inbox',
    'Documents › Audio Transcript -> /documents/transcript',
  ];
  const DATA_SOON = [
    'Data › Ask your data (soon) -> /data/ask',
    'Data › Data Catalog (soon) -> /data/catalog',
  ];
  const DATA = [
    'Data › Analytics Studio -> /data/analytics',
    'Data › Saved Analyses -> /data/analytics/dashboards',
  ];
  const FORMS_AND_WORKFLOWS = [
    'Forms › Form builder -> /forms/builder',
    'Forms › Submissions -> /forms/submissions',
    'Workflows › Task inbox (soon) -> /workflows/inbox',
    'Workflows › Workflow designer (soon) -> /workflows/designer',
  ];
  const CONFIGURATION = [
    'Configuration › Task Registry -> /configuration/task-registry',
    'Configuration › Kafka & Topics -> /configuration/kafka',
    'Configuration › Configuration values -> /configuration/values',
    'Configuration › Home pages -> /configuration/home-pages',
    'Configuration › Task groups -> /configuration/task-groups',
  ];
  const BILLING = [
    'Billing › Cost & usage -> /billing/usage',
    'Billing › Invoices -> /billing/invoices',
    'Billing › Billing documents -> /billing/documents',
  ];
  const ADMINISTRATION = [
    'Administration › Users -> /administration/users',
    'Administration › Access profiles -> /administration/access-profiles',
    'Administration › Data policies -> /administration/data-policies',
  ];

  it('a platform administrator: every menu, platform screens included', () => {
    expect(menuFor('PLATFORM_ADMIN', null)).toEqual([
      ...DASHBOARD,
      ...INTEGRATION_SOON, 'Integration › Storage Connections -> /integration/storage-connections',
      ...PIPELINES,
      ...DOCUMENT_INTELLIGENCE, ...DOCUMENTS,
      ...DATA_SOON, ...DATA,
      ...FORMS_AND_WORKFLOWS,
      'AI › AI Assistant -> /ai/assistant', 'AI › Tool Registry -> /ai/tools', 'AI › Prompts -> /ai/prompts', 'AI › Model connections -> /ai/connections',
      ...CONFIGURATION, 'Configuration › Engine settings -> /configuration/engine',
      ...BILLING, 'Billing › Billing analytics -> /billing/analytics', 'Billing › Rate cards -> /billing/rates',
      ...ADMINISTRATION, 'Administration › Tenants -> /administration/tenants',
      'Administration › Workspace Requests -> /administration/tenant-requests',
      // MIG-254: the managed service.
      'Administration › Managed service -> /administration/managed-service',
      'Administration › Staff activity -> /administration/staff-activity',
      'Administration › Work in a workspace -> /administration/work-in-workspace',
      // MIG-196: the reliability objectives.
      'Administration › Reliability -> /administration/reliability',
    ]);
  });

  it('a workspace administrator: the same, without the platform screens', () => {
    expect(menuFor('TENANT_ADMIN', null)).toEqual([
      ...DASHBOARD,
      ...INTEGRATION_SOON, 'Integration › Storage Connections -> /integration/storage-connections',
      ...PIPELINES,
      ...DOCUMENT_INTELLIGENCE, ...DOCUMENTS,
      ...DATA_SOON, ...DATA,
      ...FORMS_AND_WORKFLOWS,
      'AI › AI Assistant -> /ai/assistant', 'AI › Tool Registry -> /ai/tools', 'AI › Prompts -> /ai/prompts', 'AI › Model connections -> /ai/connections',
      ...CONFIGURATION,
      ...BILLING,
      ...ADMINISTRATION,
    ]);
  });

  it('a tenant user with every page their profile can hold today', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'tasks', 'queue', 'reports', 'objects', 'analytics',
      'analytics-dashboards', 'tools-converter', 'tools-transcript', 'ai-prompts', 'api-collections', 'sources'])).toEqual([
      ...DASHBOARD,
      'Integration › API Collections -> /integration/api-collections',
      'Integration › Sources -> /integration/sources',
      ...PIPELINES,
      ...DOCUMENTS,
      ...DATA,
      'AI › AI Assistant -> /ai/assistant', 'AI › Tool Registry -> /ai/tools', 'AI › Prompts -> /ai/prompts',
    ]);
  });

  it('a tenant user with five pages (api-check TU)', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'tasks', 'queue', 'reports', 'objects'])).toEqual([
      ...DASHBOARD, ...PIPELINES, 'Documents › Browse files -> /documents/files', 'Documents › Inbox -> /documents/inbox',
    ]);
  });

  it('a tenant user with two pages keeps only those, and drops every empty menu', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'queue'])).toEqual([
      ...DASHBOARD, 'Pipelines › Schedules -> /pipelines/schedules', 'Pipelines › Queue -> /pipelines/queue',
    ]);
  });

  it('a tenant user with no page', () => {
    expect(menuFor('TENANT_USER', [])).toEqual(DASHBOARD);
  });

  it('a tenant user with no profile at all holds every page, but still no administrator screen', () => {
    expect(menuFor('TENANT_USER', null)).toEqual([
      ...DASHBOARD,
      ...INTEGRATION_SOON,
      ...PIPELINES,
      ...DOCUMENT_INTELLIGENCE, ...DOCUMENTS,
      ...DATA_SOON, ...DATA,
      ...FORMS_AND_WORKFLOWS,
      'AI › AI Assistant -> /ai/assistant', 'AI › Tool Registry -> /ai/tools', 'AI › Prompts -> /ai/prompts',
    ]);
  });

  it('points every menu entry at a page that exists, never at a redirect', () => {
    const pages = new Set(flatten(routes).filter(e => !e.route.redirectTo).map(e => e.path));
    const entries = menuFor('PLATFORM_ADMIN', null).map(line => line.split(' -> ')[1]);
    expect(entries.filter(path => !pages.has(path))).toEqual([]);
  });
});
