import { PageKey } from '../../core/auth/page-keys';

/**
 * The backend stores routes from the Angular 8 app, so a stored link points at a page that
 * does not exist here. Rewriting them on the way out keeps old rows useful without touching
 * the data or breaking the old app, which is still running against the same database.
 *
 * The bell in the header and the notifications page each held their own copy of this table,
 * identical line for line. A page renamed in this app had to be remembered in both, and the
 * one that was missed would have sent people to a route that no longer resolves.
 */
const ROUTE_MAP: Record<string, string> = {
  '/jobList': '/pipelines/schedules',
  '/taskList': '/pipelines/list',
  '/objectBrowser': '/data/files',
  '/users': '/administration/users',
  '/tenants': '/platform/workspaces',
};

/**
 * Where a notification goes when it is opened, or null when it carries nothing to open.
 *
 * Only the path is looked up and only the path is navigated to: the stored links carry a query
 * string the old app understood and this one has no route for, so following it would land on a
 * page that then ignores it.
 */
export function notificationTarget(linkUrl: string | null | undefined): string | null {
  const raw = (linkUrl ?? '').trim();
  if (!raw) return null;
  const [path, query] = raw.split('?');
  // MIG-355: an alert's link names what it is about (the pipeline on Runs › Failed, the service on Service health); those
  // pages read their query, so it is kept for them alone.
  // Owner #21: an alert opened before Reliability became Service health still names the old page; it goes to the new one.
  const today = path === '/platform/reliability' ? '/platform/service-health' : path;
  if (query && QUERY_KEPT.includes(today) && /^[A-Za-z0-9=&_.:-]{1,200}$/.test(query)) return `${today}?${query}`;
  if (today !== path) return today;
  return ROUTE_MAP[path] ?? (path.startsWith('/') ? path : null);
}

/** The pages of today's console whose links carry a query they read (MIG-355's alerts). */
const QUERY_KEPT = ['/runs/failed', '/platform/service-health', '/settings/alerts'];

/**
 * The page an access profile governs at each path, most specific first so the saved-analysis
 * library is not read as Analytics Studio, and a schedule is not read as the Pipelines list. The same
 * paths the header menu tags -- and the addresses they had before MIG-246, because the links the
 * server has already stored (a job's run log, its history) still carry those and only the router's
 * redirect turns them into today's.
 */
const PAGE_PATHS: [string, PageKey][] = [
  // Tab hubs (2026-10-12): each page at its hub's address.
  ['/runs/latest', 'jobs'],
  ['/runs/by-date', 'queue'],
  ['/runs/analytics', 'reports'],
  ['/runs/failed', 'queue'],
  ['/pipelines/prompts', 'ai-prompts'],
  ['/data/files', 'objects'],
  ['/data/reports', 'tools-converter'],
  ['/documents/in', 'document-intelligence'],
  ['/documents/types', 'document-intelligence'],
  ['/documents/approved-data', 'document-intelligence'],
  ['/documents/intake/upload', 'document-intelligence'],
  ['/documents/intake/email-in', 'document-intelligence'],
  ['/documents/intake/file-drop', 'objects'],
  // Before the Intake tab (owner 2026-10-20): the addresses links already carry.
  ['/documents/datasets', 'document-intelligence'],
  ['/documents/email-in', 'document-intelligence'],
  ['/documents/file-drop', 'objects'],
  ['/tools/converter', 'tools-converter'],
  ['/tools/transcript', 'tools-transcript'],
  ['/connections/connectors', 'connector-hub'],
  ['/connections/api-collections', 'api-collections'],
  ['/connections/sources', 'sources'],
  ['/connections/databases', 'sources'],
  ['/connections/contracts', 'sources'],
  ['/settings/tools', 'ai-prompts'],
  ['/developers/portal', 'developer-portal'],
  // Before the tab hubs: the addresses the server has already stored.
  ['/pipelines/schedules', 'jobs'],
  ['/pipelines/executions', 'jobs'],
  ['/pipelines/queue', 'queue'],
  ['/pipelines/run-analytics', 'reports'],
  ['/pipelines', 'tasks'],
  ['/documents/files', 'objects'],
  ['/documents/intelligence', 'document-intelligence'],
  ['/documents/review', 'document-review'],
  ['/documents/converter', 'tools-converter'],
  ['/documents/transcript', 'tools-transcript'],
  ['/data/analytics/dashboards', 'analytics-dashboards'],
  ['/data/analytics', 'analytics'],
  ['/ai/prompts', 'ai-prompts'],
  ['/integration/api-collections', 'api-collections'],
  ['/integration/sources', 'sources'],
  // Before MIG-246.
  ['/operations/jobs', 'jobs'],
  ['/operations/tasks', 'tasks'],
  ['/operations/queue', 'queue'],
  ['/operations/reports', 'reports'],
  ['/objects/files', 'objects'],
  ['/objects/analytics/dashboards', 'analytics-dashboards'],
  ['/objects/analytics', 'analytics'],
  ['/assistants/prompts', 'ai-prompts'],
];

/** The access-profile page a path opens, or null for a page no profile can take away. */
export function pageKeyForPath(path: string): PageKey | null {
  const hit = PAGE_PATHS.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  return hit ? hit[1] : null;
}

/**
 * notificationTarget, less any page this person's access profile withholds. A tenant user
 * without Schedules was offered "Open" on a job's notification and landed on the
 * unauthorized page; the notification is still shown, it just no longer links anywhere.
 */
export function openableTarget(linkUrl: string | null | undefined, canOpen: (page: PageKey) => boolean): string | null {
  const target = notificationTarget(linkUrl);
  if (!target) return null;
  const key = pageKeyForPath(target.split('?')[0]);
  return key && !canOpen(key) ? null : target;
}
