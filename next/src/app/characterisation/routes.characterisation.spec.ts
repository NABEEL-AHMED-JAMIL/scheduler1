import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { routes } from '../app.routes';
import { pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/routes';

/**
 * MIG-222 (Wave 4) and MIG-266 (Wave 5) characterisation baseline: every route the console has.
 *
 * The route inventory the Wave 4 redirect task needs (page 21: "old routes redirect"): each
 * address, its title, the page an access profile grants for it, the least role it asks for and
 * the guards on it -- and, for every old address that already redirects, where a person
 * following it lands today. A renamed screen must keep its old address working; this is the
 * list of addresses there are.
 */
const FILE = 'routes';

interface Row { path: string; title?: string; pageKey?: string; minRole?: string; kind?: string; redirectTo?: string;
  guards: string[]; lazy: boolean }

function inventory(rs: any[], prefix = ''): Row[] {
  const out: Row[] = [];
  for (const r of rs) {
    const path = `${prefix}/${r.path ?? ''}`.replace(/\/+/g, '/');
    out.push({
      path,
      ...(typeof r.title === 'string' ? { title: r.title } : {}),
      ...(r.data?.pageKey ? { pageKey: r.data.pageKey } : {}),
      ...(r.data?.minRole ? { minRole: r.data.minRole } : {}),
      ...(r.data?.kind ? { kind: r.data.kind } : {}),
      ...(typeof r.redirectTo === 'string' ? { redirectTo: r.redirectTo } : {}),
      guards: [...(r.canMatch ?? []), ...(r.canActivate ?? []), ...(r.canActivateChild ?? [])].map((g: any) => g.name || '?'),
      lazy: !!r.loadComponent || !!r.component,
    });
    if (r.children) out.push(...inventory(r.children, path));
  }
  return out;
}

/** An address with its parameters filled in, as a bookmark would carry them. */
const sample = (path: string) => path.replace(':jobId', '2833').replace(':jobQueueId', '7331').replace(':taskDetailId', '1854')
  .replace(':promptId', '1049').replace(':number', 'INV-2026-0001');

describe('MIG-222 / MIG-266: the route inventory', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('every route: address, title, page, role and guards', () => {
    pin(FILE, 'every route', inventory(routes), PINNED);
  });

  // Where each old address lands today, followed through the real router as a platform administrator
  // (every role guard passes; pages are not withheld).
  const redirects = inventory(routes).filter(r => r.redirectTo !== undefined && r.path !== '/**' && r.path !== '/'
    && r.path !== '/login');
  for (const r of redirects) {
    it(`the old address ${r.path}`, async () => {
      const v = await visit(sample(r.path), 'PLATFORM_ADMIN', null);
      pin(FILE, `old address ${r.path}`, { lands: v.surface.url, heading: v.surface.headings[0] ?? null }, PINNED);
    });
  }
});
