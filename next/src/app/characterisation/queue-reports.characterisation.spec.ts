import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, pin, restoreClock, surfaceOf, visit } from './harness';
import { PINNED } from './pinned/queue-reports';

/**
 * MIG-222 (Wave 4) characterisation baseline: Queue and Operations > Reports.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/queue-reports.ts.
 */
const FILE = 'queue-reports';

describe("MIG-222 (Wave 4): Queue and Operations > Reports", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("the queue, as a workspace administrator", async () => {
    const v = await visit('/operations/queue', 'TENANT_ADMIN', null);
    pin(FILE, "the queue, as a workspace administrator", v.surface, PINNED);
  });

  it("the queue, as a tenant user with five pages", async () => {
    const v = await visit('/operations/queue', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the queue, as a tenant user with five pages", v.surface, PINNED);
  });

  it("reports, as a workspace administrator", async () => {
    const v = await visit('/operations/reports', 'TENANT_ADMIN', null);
    pin(FILE, "reports, as a workspace administrator", v.surface, PINNED);
  });

  it("reports, as a tenant user with five pages", async () => {
    const v = await visit('/operations/reports', 'TENANT_USER', TU_PAGES);
    pin(FILE, "reports, as a tenant user with five pages", v.surface, PINNED);
  });

  it("the queue's charts", async () => {
    const v = await visit('/operations/queue', 'TENANT_ADMIN', null);
    const requests = await click(v, 'Charts');
    pin(FILE, "the queue's charts", { requests, ...surfaceOf(v.main) }, PINNED);
  });
});
