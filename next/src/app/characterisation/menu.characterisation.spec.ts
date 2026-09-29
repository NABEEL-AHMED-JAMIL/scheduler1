import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, menuOf, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/menu';

/**
 * MIG-222 (Wave 4) and MIG-266 (Wave 5) characterisation baseline: the top menu, per role.
 *
 * Wave 4 renames and regroups the menu (page 21.4: Operations becomes Pipelines, Assistants
 * becomes AI, Integration is new); Wave 5 adds modules. Every entry each role sees today, in
 * order, with where it goes, is pinned here so the renames are deliberate and every old entry
 * can be accounted for. A tenant user's menu also follows their access profile's pages.
 */
const FILE = 'menu';

describe('MIG-222 / MIG-266: the menu each role sees', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  const cases: [string, 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER', string[] | null][] = [
    ['a platform administrator', 'PLATFORM_ADMIN', null],
    ['a workspace administrator', 'TENANT_ADMIN', null],
    ['a tenant user with every page', 'TENANT_USER', ALL_PAGES],
    ['a tenant user with five pages (api-check TU)', 'TENANT_USER', TU_PAGES],
    ['a tenant user with no page', 'TENANT_USER', []],
  ];
  for (const [who, role, pages] of cases) {
    it(`the menu for ${who}`, async () => {
      const v = await visit('/dashboard', role, pages);
      pin(FILE, `the menu for ${who}`, await menuOf(v), PINNED);
    });
  }
});
