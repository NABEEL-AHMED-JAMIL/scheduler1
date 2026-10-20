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
import { HUBS } from './core/nav/nav-tree';
import { useMemoryStorage } from './shared/testing/memory-storage';

/**
 * MIG-246 (Wave 4) and MIG-267 (Wave 5): the console's top navigation after the MIG-218 renames.
 *
 * UX review 2026-10-12 (A10): menu groups by job -- Home, Get data in, Build, Run & review, See results,
 * Administration & billing, Platform. The renames are UI labels only -- database and API names
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
  // The deepest title on the way down, as Angular's title strategy names the page: the run page's /logs is a child
  // with no title of its own (run page fix).
  let node: typeof router.routerState.snapshot.root | null = router.routerState.snapshot.root;
  let title: string | undefined;
  while (node) { title = (node.routeConfig?.title as string | undefined) ?? title; node = node.firstChild; }
  return { url: router.url, title };
}

/**
 * Every old address -> where it lands now. The first block is the 43 the MIG-222 baseline pinned
 * (characterisation/pinned/routes.ts before this change); the second is every address that was a
 * page until this change and is now an old one.
 */
const OLD_ADDRESSES: [string, string][] = [
  ['/admin/access-profiles', '/administration/access-profiles'],
  ['/admin/storage', '/connections/storage'],
  ['/admin/tenant-requests', '/platform/requests'],
  ['/admin/tenants', '/platform/workspaces'],
  ['/admin/users', '/administration/users'],
  ['/administration/billing', '/billing/usage'],
  ['/administration/billing/analytics', '/billing/analytics'],
  ['/administration/billing/documents', '/billing/documents'],
  ['/administration/billing/invoices', '/billing/invoices'],
  ['/administration/billing/invoices/INV-2026-0001', '/billing/invoices/INV-2026-0001'],
  ['/administration/billing/rates', '/billing/settings'],
  ['/ai/agents', '/pipelines/prompts'],
  ['/ai/assistant', '/ai/assistant'],
  ['/ai/connections', '/settings/model-connections'],
  ['/ai/models', '/settings/model-connections'],
  ['/ai/prompts', '/pipelines/prompts'],
  ['/ai/prompts/1049/edit', '/pipelines/prompts/1049/edit'],
  ['/ai/prompts/new', '/pipelines/prompts/new'],
  ['/ai/tools', '/settings/tools'],
  ['/analytics', '/data/analytics'],
  ['/analytics/dashboards', '/data/analytics/dashboards'],
  ['/configuration/lookup', '/settings/values'],
  ['/jobs', '/pipelines/schedules'],
  ['/jobs/2833/assistant', '/pipelines/schedules/2833/assistant'],
  ['/jobs/2833/edit', '/pipelines/schedules/2833/edit'],
  ['/jobs/2833/history', '/pipelines/schedules/2833/executions'],
  ['/jobs/2833/runs/7331/logs', '/pipelines/schedules/2833/runs/7331/logs'],
  ['/jobs/bulk', '/pipelines/schedules/bulk'],
  ['/jobs/history', '/runs/latest'],
  ['/jobs/new', '/pipelines/schedules/new'],
  ['/objects', '/data/files'],
  ['/queue', '/runs/by-date'],
  ['/settings/forms', '/settings/task-registry'],
  ['/settings/lookup', '/settings/values'],
  ['/settings/pipeline-forms', '/settings/task-registry'],
  ['/settings/pipelines', '/settings/task-registry'],
  ['/settings/storage-connections', '/connections/storage'],
  // UX review B7: Storage connections is the Storage tab of Connections.
  ['/integration/storage-connections', '/connections/storage'],
  ['/settings/task-types', '/settings/kafka'],
  ['/tasks', '/pipelines/list'],
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
  ['/operations/jobs/history', '/runs/latest'],
  ['/operations/queue', '/runs/by-date'],
  ['/operations/tasks', '/pipelines/list'],
  ['/operations/tasks/new', '/pipelines/new'],
  ['/operations/tasks/bulk', '/pipelines/bulk'],
  ['/operations/tasks/1854/edit', '/pipelines/1854/edit'],
  ['/operations/reports', '/runs/analytics'],
  ['/configuration/pipelines', '/settings/task-registry'],
  ['/configuration/storage-connections', '/connections/storage'],
  ['/objects/files', '/data/files'],
  ['/objects/analytics', '/data/analytics'],
  ['/objects/analytics/dashboards', '/data/analytics/dashboards'],
  ['/assistants/prompts', '/pipelines/prompts'],
  ['/assistants/prompts/new', '/pipelines/prompts/new'],
  ['/assistants/prompts/1049/edit', '/pipelines/prompts/1049/edit'],
  ['/assistants/connections', '/settings/model-connections'],
  // Tab hubs (2026-10-12): every page that moved under its hub's address.
  ['/integration/connectors', '/connections/connectors'],
  ['/integration/connectors/storage', '/connections/storage'],
  ['/integration/api-collections', '/connections/api-collections'],
  ['/integration/api-collections/1000', '/connections/api-collections/1000'],
  ['/integration/sources', '/connections/sources'],
  ['/integration/api-clients', '/developers/api-clients'],
  ['/integration/developer', '/developers/portal'],
  ['/integration/developer/reference', '/developers/portal/reference'],
  ['/integration/developer/changelog', '/developers/portal/changelog'],
  ['/integration/developer/guides/quickstart', '/developers/portal/guides/quickstart'],
  ['/documents/intelligence', '/documents/in'],
  ['/documents/inbox', '/documents/file-drop'],
  ['/documents/reports', '/reports/library'],
  ['/data/reports', '/reports/library'],
  ['/documents/files', '/data/files'],
  ['/documents/converter', '/tools/converter'],
  ['/documents/transcript', '/tools/transcript'],
  ['/pipelines/executions', '/runs/latest'],
  ['/pipelines/queue', '/runs/by-date'],
  ['/pipelines/run-analytics', '/runs/analytics'],
  ['/ai/tools', '/settings/tools'],
  ['/configuration/task-registry', '/settings/task-registry'],
  ['/configuration/kafka', '/settings/kafka'],
  ['/configuration/values', '/settings/values'],
  ['/configuration/home-pages', '/settings/home-pages'],
  ['/configuration/task-groups', '/settings/task-groups'],
  ['/configuration/engine', '/platform/engine'],
  ['/billing/rates', '/billing/settings'],
  ['/administration/tenants', '/platform/workspaces'],
  ['/administration/tenant-requests', '/platform/requests'],
  ['/administration/managed-service', '/platform/managed-service'],
  ['/administration/staff-activity', '/platform/staff-activity'],
  ['/administration/work-in-workspace', '/platform/workspaces'],
  ['/administration/reliability', '/platform/service-health'],
  // Owner decisions #20-#23 (2026-10-19): the Platform pages that went land where their function is now.
  ['/platform/work-in-workspace', '/platform/workspaces'],
  ['/platform/reliability', '/platform/service-health'],
  ['/platform/billing-analytics', '/billing/analytics'],
  ['/platform/rate-cards', '/billing/settings'],
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
    expect(landed.url).toBe('/runs/latest?targetDate=2026-09-28&targetHr=9&jobStatus=Failed');
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
    ['/pipelines/list', 'Pipelines', 'tasks', undefined],
    ['/pipelines/new', 'New pipeline', 'tasks', 'TENANT_ADMIN'],
    ['/pipelines/bulk', 'Bulk pipelines', 'tasks', 'TENANT_ADMIN'],
    ['/pipelines/:taskDetailId/edit', 'Pipeline', 'tasks', 'TENANT_ADMIN'],
    ['/pipelines/schedules', 'Schedules & triggers', 'jobs', undefined],
    ['/pipelines/schedules/new', 'New schedule', 'jobs', undefined],
    ['/pipelines/schedules/bulk', 'Bulk schedules', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/edit', 'Schedule', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/assistant', 'Schedule assistant', 'jobs', undefined],
    ['/pipelines/schedules/:jobId/executions', 'Schedule runs', 'jobs', undefined],
    // Run page fix: /logs is the same page at its Log, a child of the run's address.
    ['/pipelines/schedules/:jobId/runs/:jobQueueId', 'Run', 'jobs', undefined],
    ['/runs/latest', 'Runs', 'jobs', undefined],
    ['/runs/by-date', 'Runs by date', 'queue', undefined],
    ['/runs/analytics', 'Run analytics', 'reports', undefined],
    ['/connections/storage', 'Storage connections', undefined, 'TENANT_ADMIN'],
    // MIG-332: the customer API's clients and event routes, an administrator's.
    ['/developers/api-clients', 'API Clients', undefined, 'TENANT_ADMIN'],
    // MIG-336: the developer portal; its pages are lazy children (features/developer/developer.routes.ts).
    ['/developers/portal', 'Developer portal', 'developer-portal', undefined],
    // MIG-247: built. Read by every member holding the page; the screens hide the administrator's writes.
    ['/connections/api-collections', 'API Collections', 'api-collections', undefined],
    ['/connections/api-collections/:collectionId', 'API collection', 'api-collections', undefined],
    // MIG-248: built. Sources, database connections and data contracts, on the one page key Identity serves.
    ['/connections/sources', 'Sources', 'sources', undefined],
    // Tab hubs (2026-10-12): Sources' database connections and data contracts as tabs of Connections, same key.
    ['/connections/databases', 'Database connections', 'sources', undefined],
    ['/connections/contracts', 'Data contracts', 'sources', undefined],
    // MIG-292: built. Connector Hub, and the page an OAuth provider sends the browser back to.
    ['/connections/connectors', 'Connections', 'connector-hub', undefined],
    ['/integration/connectors/oauth/callback', 'Connecting', 'connector-hub', undefined],
    // MIG-272: built. Every member holding the page reads, extracts and reviews; a type's editor hides its save.
    ['/documents/in', 'Documents in', 'document-intelligence', undefined],
    // Tab hubs (2026-10-12): Document Intelligence's views as tabs of Documents, same key.
    ['/documents/types', 'Document types', 'document-intelligence', undefined],
    ['/documents/datasets', 'Datasets', 'document-intelligence', undefined],
    ['/documents/email-in', 'Email-in', 'document-intelligence', undefined],
    // UX review DR2 (2026-10-13): Document review is the Review hub's Documents tab, same key.
    ['/review/documents', 'Document review', 'document-review', undefined],
    ['/review/documents/:extractionId', 'Review a document', 'document-review', undefined],
    ['/review/approvals', 'Approvals', 'task-inbox', undefined],
    ['/review/requests', 'My requests', 'task-inbox', undefined],
    ['/review/runs', 'Runs to review', 'task-inbox', undefined],
    ['/data/files', 'Browse files', 'objects', 'TENANT_USER'],
    // MIG-239: built. Browse files' key and floor: every member reads and uploads; configuring is an administrator's.
    ['/documents/file-drop', 'File drop', 'objects', 'TENANT_USER'],
    ['/tools/converter', 'Document Converter', 'tools-converter', undefined],
    // MIG-253's generated outputs, beneath Reports since MIG-403, still behind the converter's key.
    ['/reports/from-pipelines', 'Reports from pipelines', 'tools-converter', undefined],
    // MIG-403: Report Studio's tabs and pages (Templates and a template open to report-generate too: pageKeys).
    ['/reports/overview', 'Reports overview', 'report-studio', undefined],
    ['/reports/library', 'Reports', 'report-library', undefined],
    ['/reports/library/:reportId', 'Report', 'report-library', undefined],
    ['/reports/data', 'Report data', 'report-data', undefined],
    ['/tools/transcript', 'Audio Transcript', 'tools-transcript', undefined],
    ['/data/analytics', 'Analytics Studio', 'analytics', undefined],
    ['/data/analytics/dashboards', 'Dashboards', 'analytics-dashboards', undefined],
    // MIG-252: built. The assistant and its tools ride the Prompts key.
    ['/ai/assistant', 'AI Assistant', 'ai-prompts', undefined],
    ['/settings/tools', 'Tool Registry', 'ai-prompts', undefined],
    ['/pipelines/prompts', 'Prompts', 'ai-prompts', undefined],
    ['/pipelines/prompts/new', 'New prompt', 'ai-prompts', 'TENANT_ADMIN'],
    ['/pipelines/prompts/:promptId/edit', 'Prompt', 'ai-prompts', 'TENANT_ADMIN'],
    ['/settings/model-connections', 'Model connections', undefined, 'TENANT_ADMIN'],
    ['/settings/task-registry', 'Task Registry', undefined, 'TENANT_ADMIN'],
    ['/settings/kafka', 'Kafka & Topics', undefined, 'TENANT_ADMIN'],
    ['/settings/values', 'Configuration values', undefined, 'TENANT_ADMIN'],
    ['/settings/home-pages', 'Home pages', undefined, 'TENANT_ADMIN'],
    ['/settings/task-groups', 'Task groups', undefined, 'TENANT_ADMIN'],
    ['/platform/workspaces', 'Workspaces', undefined, 'PLATFORM_ADMIN'],
    ['/platform/requests', 'Workspace requests', undefined, 'PLATFORM_ADMIN'],
    ['/platform/managed-service', 'Managed service', undefined, 'PLATFORM_ADMIN'],
    ['/platform/staff-activity', 'Staff activity', undefined, 'PLATFORM_ADMIN'],
    ['/platform/service-health', 'Service health', undefined, 'PLATFORM_ADMIN'],
    ['/billing/analytics', 'Billing analytics', undefined, 'TENANT_ADMIN'],
    ['/billing/settings', 'Billing settings', undefined, 'PLATFORM_ADMIN'],
    ['/platform/engine', 'Engine settings', undefined, 'PLATFORM_ADMIN'],
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
  // Owner decision 2026-09-30: nothing unfinished on the menu. Ask your data, Forms, Workflows (MIG-276), the Data
  // Catalog (MIG-288) and Connector Hub (MIG-292) are built.
  it('no route is a coming-soon placeholder any more', () => {
    expect(flatten(routes).filter(e => e.route.data?.['comingSoon']).map(e => e.path)).toEqual([]);
  });

  it('/data/ask is the built page now: titled, gated by ask-data, and not coming soon', () => {
    const route = byPath('/data/ask');
    expect(route).toBeDefined();
    expect(route!.title).toBe('Ask your data');
    expect(route!.data?.['pageKey']).toBe('ask-data');
    expect(route!.data?.['comingSoon']).toBeUndefined();
    expect(route!.canActivate).toContain(pageGuard);
    expect(route!.loadComponent).toBeDefined();
  });

  it('/connections/connectors is the built Connector Hub, titled Connections: gated by connector-hub', () => {
    const route = byPath('/connections/connectors');
    expect(route?.title).toBe('Connections');
    expect(route?.data?.['pageKey']).toBe('connector-hub');
    expect(route?.canActivate).toContain(pageGuard);
  });

  it('/data/catalog is the built Data Catalog: titled and gated by data-catalog', () => {
    const route = byPath('/data/catalog');
    expect(route?.title).toBe('Data Catalog');
    expect(route?.data?.['pageKey']).toBe('data-catalog');
    expect(route?.canActivate).toContain(pageGuard);
  });

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

  // UX review 2026-10-12 (A10): grouped by job, one name per thing. Tab hubs (2026-10-12): related pages are one entry
  // whose link is the hub's address; the hub opens the first tab the reader may open, and shows only when there is one.
  const HOME = ['Home -> /dashboard'];
  const CONNECTIONS = 'Get data in › Connections -> /connections';
  const DOCUMENTS = 'Get data in › Documents -> /documents';
  const FORMS = 'Get data in › Forms -> /forms';
  const PIPELINES = 'Build › Pipelines -> /pipelines';
  const AI_ASSISTANT = 'Build › AI Assistant -> /ai/assistant';
  const APPROVALS = 'Build › Approval workflows -> /workflows/designer';
  const RUNS = 'Run & review › Runs -> /runs';
  // UX review DR2 (2026-10-13): one Review entry, its tabs All waiting, Approvals, Runs and Documents.
  const REVIEW = 'Run & review › Review -> /review';
  const DASHBOARDS = 'See results › Dashboards -> /data/analytics/dashboards';
  const ANALYSIS = 'See results › Analysis -> /data';
  // MIG-403: Report Studio's hub, between Analysis and Tools.
  const REPORTS = 'See results › Reports -> /reports';
  const TOOLS = 'See results › Tools -> /tools';
  const ADMINISTRATION = 'Administration & billing › Administration -> /administration';
  const BILLING = 'Administration & billing › Billing -> /billing';
  const SETTINGS = 'Administration & billing › Settings -> /settings';
  const DEVELOPERS = 'Administration & billing › Developers -> /developers';
  const EVERY_MEMBER_PAGE = [
    ...HOME, CONNECTIONS, DOCUMENTS, FORMS, PIPELINES, AI_ASSISTANT, APPROVALS, RUNS, REVIEW,
    DASHBOARDS, ANALYSIS, REPORTS, TOOLS,
  ];
  const ADMIN_MENU = [...EVERY_MEMBER_PAGE, ADMINISTRATION, BILLING, SETTINGS, DEVELOPERS];

  it('a platform administrator: every menu, the Platform hub included', () => {
    expect(menuFor('PLATFORM_ADMIN', null)).toEqual([...ADMIN_MENU, 'Platform -> /platform']);
  });

  it('a workspace administrator: the same, without the platform hub', () => {
    expect(menuFor('TENANT_ADMIN', null)).toEqual(ADMIN_MENU);
  });

  it('a tenant user with every page their profile can hold today', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'tasks', 'queue', 'reports', 'objects', 'analytics',
      'analytics-dashboards', 'tools-converter', 'tools-transcript', 'ai-prompts', 'api-collections', 'sources'])).toEqual([
      ...HOME, CONNECTIONS, DOCUMENTS, PIPELINES, AI_ASSISTANT, RUNS, DASHBOARDS, ANALYSIS, TOOLS,
      // The Tool Registry rides the Prompts key: a member holding Prompts reads it, Settings' one tab for them.
      SETTINGS,
    ]);
  });

  // MIG-336: only a profile that names it gives a tenant user the developer portal; having no profile does not.
  it('a tenant user whose profile names the developer portal', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'developer-portal'])).toEqual([...HOME, PIPELINES, RUNS, DEVELOPERS]);
  });

  it('a tenant user with five pages (api-check TU)', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'tasks', 'queue', 'reports', 'objects'])).toEqual([
      ...HOME, DOCUMENTS, PIPELINES, RUNS, ANALYSIS,
    ]);
  });

  // UX review B3 (E1): one Runs entry for Runs and Runs by date, shown to whoever holds either page.
  it('shows the one Runs entry to a member holding only the Queue page', () => {
    expect(menuFor('TENANT_USER', ['queue'])).toEqual([...HOME, RUNS]);
  });

  it('a tenant user with two pages keeps only those, and drops every empty hub and menu', () => {
    expect(menuFor('TENANT_USER', ['jobs', 'queue'])).toEqual([...HOME, PIPELINES, RUNS]);
  });

  // UX review DR2: Review for whoever decides something -- the Task inbox or Document review -- and never for a viewer.
  it('shows Review to a reviewer and to a member holding only Document review, never to a viewer', () => {
    expect(menuFor('TENANT_USER', ['queue', 'reports', 'analytics-dashboards', 'document-review', 'form-submissions', 'task-inbox',
      'dashboards-edit'])).toEqual([...HOME, FORMS, RUNS, REVIEW, DASHBOARDS]);
    expect(menuFor('TENANT_USER', ['document-review'])).toEqual([...HOME, REVIEW]);
    expect(menuFor('TENANT_USER', ['reports', 'analytics-dashboards'])).not.toContain(REVIEW);
  });

  // MIG-403: a reviewer's profile gets the Reports hub and library (identity V8.11); the hub shows its tabs the key opens.
  it('shows Reports to whoever holds any of its tab keys', () => {
    expect(menuFor('TENANT_USER', ['report-library'])).toEqual([...HOME, REPORTS]);
    // An action key alone (publishing) opens no tab.
    expect(menuFor('TENANT_USER', ['report-publish'])).toEqual(HOME);
  });

  it('a tenant user with no page', () => {
    expect(menuFor('TENANT_USER', [])).toEqual(HOME);
  });

  it('a tenant user with no profile at all holds every page, but still no administrator screen', () => {
    expect(menuFor('TENANT_USER', null)).toEqual([...EVERY_MEMBER_PAGE, SETTINGS]);
  });

  it('points every menu entry at a page that exists, or at a hub whose every tab is one', () => {
    const pages = new Set(flatten(routes).filter(e => !e.route.redirectTo).map(e => e.path));
    const hubs = new Map(HUBS.map(h => [h.path, h]));
    const entries = menuFor('PLATFORM_ADMIN', null).map(line => line.split(' -> ')[1]);
    expect(entries.filter(path => !pages.has(path) && !hubs.has(path))).toEqual([]);
    expect(HUBS.flatMap(h => h.tabs.map(t => t.path)).filter(path => !pages.has(path))).toEqual([]);
  });
});
