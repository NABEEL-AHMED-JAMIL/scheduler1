import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, overlay, pin, restoreClock, surfaceOf, visit } from './harness';
import { PINNED } from './pinned/administration';

/**
 * MIG-222 (Wave 4) characterisation baseline: Access profiles, Tenants and the page-access gate.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/administration.ts.
 */
const FILE = 'administration';

describe("MIG-222 (Wave 4): Access profiles, Tenants and the page-access gate", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("access profiles, as a workspace administrator", async () => {
    const v = await visit('/administration/access-profiles', 'TENANT_ADMIN', null);
    pin(FILE, "access profiles, as a workspace administrator", v.surface, PINNED);
  });

  it("access profiles, as a platform administrator", async () => {
    const v = await visit('/administration/access-profiles', 'PLATFORM_ADMIN', null);
    pin(FILE, "access profiles, as a platform administrator", v.surface, PINNED);
  });

  it("tenants, as a platform administrator", async () => {
    const v = await visit('/administration/tenants', 'PLATFORM_ADMIN', null);
    pin(FILE, "tenants, as a platform administrator", v.surface, PINNED);
  });

  it("tenants, as a workspace administrator", async () => {
    const v = await visit('/administration/tenants', 'TENANT_ADMIN', null);
    pin(FILE, "tenants, as a workspace administrator", v.surface, PINNED);
  });

  it("the gate, as a tenant user asking for Analytics Studio", async () => {
    const v = await visit('/objects/analytics', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the gate, as a tenant user asking for Analytics Studio", v.surface, PINNED);
  });

  it("access profiles: the people x pages grid", async () => {
    const v = await visit('/administration/access-profiles', 'TENANT_ADMIN', null);
    const requests = await click(v, 'People × pages');
    pin(FILE, "access profiles: the people x pages grid", { requests, ...surfaceOf(v.main) }, PINNED);
  });

  it("an access profile's row menu", async () => {
    const v = await visit('/administration/access-profiles', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "an access profile's row menu", overlay(), PINNED);
  });

  it("a tenant's edit form", async () => {
    const v = await visit('/administration/tenants', 'PLATFORM_ADMIN', null);
    const requests = await click(v, 'Edit');
    pin(FILE, "a tenant's edit form", { requests, ...overlay() }, PINNED);
  });
});
