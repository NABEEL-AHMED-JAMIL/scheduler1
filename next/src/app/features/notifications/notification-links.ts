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
  '/jobList': '/jobs',
  '/taskList': '/tasks',
  '/objectBrowser': '/objects',
  '/users': '/admin/users',
  '/tenants': '/admin/tenants',
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
