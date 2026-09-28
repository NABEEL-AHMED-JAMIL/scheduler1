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
  '/jobList': '/operations/jobs',
  '/taskList': '/operations/tasks',
  '/objectBrowser': '/objects/files',
  '/users': '/administration/users',
  '/tenants': '/administration/tenants',
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
  const [path] = raw.split('?');
  return ROUTE_MAP[path] ?? (path.startsWith('/') ? path : null);
}

/**
 * The page an access profile governs at each path, most specific first so the saved-analysis
 * library is not read as Analytics Studio. The same paths the header menu tags.
 */
const PAGE_PATHS: [string, PageKey][] = [
  ['/operations/jobs', 'jobs'],
  ['/operations/tasks', 'tasks'],
  ['/operations/queue', 'queue'],
  ['/operations/reports', 'reports'],
  ['/objects/files', 'objects'],
  ['/objects/analytics/dashboards', 'analytics-dashboards'],
  ['/objects/analytics', 'analytics'],
  ['/tools/converter', 'tools-converter'],
  ['/tools/transcript', 'tools-transcript'],
  ['/assistants/prompts', 'ai-prompts'],
];

/** The access-profile page a path opens, or null for a page no profile can take away. */
export function pageKeyForPath(path: string): PageKey | null {
  const hit = PAGE_PATHS.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  return hit ? hit[1] : null;
}

/**
 * notificationTarget, less any page this person's access profile withholds. A tenant user
 * without Source Jobs was offered "Open" on a job's notification and landed on the
 * unauthorized page; the notification is still shown, it just no longer links anywhere.
 */
export function openableTarget(linkUrl: string | null | undefined, canOpen: (page: PageKey) => boolean): string | null {
  const target = notificationTarget(linkUrl);
  if (!target) return null;
  const key = pageKeyForPath(target);
  return key && !canOpen(key) ? null : target;
}
