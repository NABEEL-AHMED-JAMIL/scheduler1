import { describe, it, expect } from 'vitest';
import { routes } from './app.routes';
import { roleGuard } from './core/auth/auth.guard';

/** The console's routes are one flat child list under the shell, plus the public ones. */
function flatten(rs: any[], prefix = ''): { path: string; route: any }[] {
  const out: { path: string; route: any }[] = [];
  for (const route of rs) {
    const path = `${prefix}/${route.path ?? ''}`;
    out.push({ path, route });
    if (route.children) out.push(...flatten(route.children, path));
  }
  return out;
}

const find = (path: string) => flatten(routes).find(entry => entry.route.path === path)?.route;

describe('storage and query routes', () => {
  /*
   * The object browser is the frontend half of the storage guards: which bucket and key a
   * caller may reach is decided per request on the server, so the route can only name the
   * floor StorageBrowserRestApi names. What that buys is the case authGuard cannot see -- a
   * stored session whose token carries no readable role is signed in as far as authGuard is
   * concerned, and would otherwise land on a page that is nothing but refused storage calls.
   */
  it('guards /objects at the floor the storage API asks for', () => {
    const objects = find('objects');
    expect(objects?.data?.minRole).toBe('TENANT_USER');
    expect(objects?.canActivate).toContain(roleGuard);
  });

  /*
   * The other half of the same rule, in the other direction. Reading connections, queries,
   * schedules and runs is TENANT_USER, and so is executing a saved query, so a minimum on this
   * route would take the page away from the people it was built for. Only the definitions are
   * TENANT_ADMIN, and query-engine.html gates those controls on auth.canManageQueries().
   */
  it('leaves /tools/query open, gating its write controls in the template instead', () => {
    const query = find('tools/query');
    expect(query).toBeDefined();
    expect(query?.data?.minRole).toBeUndefined();
  });
});
