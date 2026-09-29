import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, overlay, pin, restoreClock, surfaceOf, visit } from './harness';
import { PINNED } from './pinned/storage-and-notifications';

/**
 * MIG-266 (Wave 5) characterisation baseline: Storage connections, the bell and the notifications page.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/storage-and-notifications.ts.
 */
const FILE = 'storage-and-notifications';

describe("MIG-266 (Wave 5): Storage connections, the bell and the notifications page", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("storage connections, as a workspace administrator", async () => {
    const v = await visit('/configuration/storage-connections', 'TENANT_ADMIN', null);
    pin(FILE, "storage connections, as a workspace administrator", v.surface, PINNED);
  });

  it("storage connections, as a platform administrator", async () => {
    const v = await visit('/configuration/storage-connections', 'PLATFORM_ADMIN', null);
    pin(FILE, "storage connections, as a platform administrator", v.surface, PINNED);
  });

  it("storage connections, as a tenant user (admin-only)", async () => {
    const v = await visit('/configuration/storage-connections', 'TENANT_USER', ALL_PAGES);
    pin(FILE, "storage connections, as a tenant user (admin-only)", v.surface, PINNED);
  });

  it("the notifications page", async () => {
    const v = await visit('/notifications', 'TENANT_ADMIN', null);
    pin(FILE, "the notifications page", v.surface, PINNED);
  });

  it("the notifications page, as a tenant user", async () => {
    const v = await visit('/notifications', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the notifications page, as a tenant user", v.surface, PINNED);
  });

  it("a storage connection's row menu", async () => {
    const v = await visit('/configuration/storage-connections', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "a storage connection's row menu", overlay(), PINNED);
  });

  it("the new storage connection form", async () => {
    const v = await visit('/configuration/storage-connections', 'TENANT_ADMIN', null);
    const requests = await click(v, 'New connection');
    pin(FILE, "the new storage connection form", { requests, ...overlay() }, PINNED);
  });

  it("the bell, opened", async () => {
    const v = await visit('/operations/jobs', 'TENANT_ADMIN', null);
    const bell = v.root.querySelector('app-notification-bell') as HTMLElement;
    const requests = await click(v, /unread notifications$|^Notifications$/);
    pin(FILE, "the bell, opened", { requests, ...surfaceOf(bell) }, PINNED);
  });
});
