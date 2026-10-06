import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, detailsOf, overlay, pin, restoreClock, surfaceOf, visit } from './harness';
import { LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/source-jobs';

/**
 * MIG-222 (Wave 4) characterisation baseline: Source Jobs: list, row menu, edit and its schedule section, history, logs, assistant.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/source-jobs.ts.
 */
const FILE = 'source-jobs';

describe("MIG-222 (Wave 4): Source Jobs", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("the list, as a workspace administrator", async () => {
    const v = await visit('/operations/jobs', 'TENANT_ADMIN', null);
    pin(FILE, "the list, as a workspace administrator", v.surface, PINNED);
  });

  it("the list, as a tenant user with five pages", async () => {
    const v = await visit('/operations/jobs', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the list, as a tenant user with five pages", v.surface, PINNED);
  });

  it("a new job", async () => {
    const v = await visit('/operations/jobs/new', 'TENANT_ADMIN', null);
    pin(FILE, "a new job", v.surface, PINNED);
  });

  it("editing a job", async () => {
    const v = await visit(`/operations/jobs/${LIVE_IDS.jobId}/edit`, 'TENANT_ADMIN', null);
    pin(FILE, "editing a job", v.surface, PINNED);
  });

  it("a job's run history", async () => {
    const v = await visit(`/operations/jobs/${LIVE_IDS.jobId}/history`, 'TENANT_ADMIN', null);
    pin(FILE, "a job's run history", v.surface, PINNED);
  });

  it("every job's run history", async () => {
    const v = await visit('/operations/jobs/history', 'TENANT_ADMIN', null);
    pin(FILE, "every job's run history", v.surface, PINNED);
  });

  it("a run's logs", async () => {
    const v = await visit(`/operations/jobs/${LIVE_IDS.jobId}/runs/${LIVE_IDS.jobQueueId}/logs`, 'TENANT_ADMIN', null);
    pin(FILE, "a run's logs", v.surface, PINNED);
  });

  it("the job assistant", async () => {
    const v = await visit(`/operations/jobs/${LIVE_IDS.jobId}/assistant`, 'TENANT_ADMIN', null);
    pin(FILE, "the job assistant", v.surface, PINNED);
  });

  it("bulk jobs", async () => {
    const v = await visit('/operations/jobs/bulk', 'TENANT_ADMIN', null);
    pin(FILE, "bulk jobs", v.surface, PINNED);
  });

  it("the row menu, as a workspace administrator", async () => {
    const v = await visit('/operations/jobs', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "the row menu, as a workspace administrator", overlay(), PINNED);
  });

  it("the row menu, as a tenant user with five pages", async () => {
    const v = await visit('/operations/jobs', 'TENANT_USER', TU_PAGES);
    await click(v, /^Actions for /);
    pin(FILE, "the row menu, as a tenant user with five pages", overlay(), PINNED);
  });

  it("a job's details, with its schedule", async () => {
    const v = await visit('/operations/jobs', 'TENANT_ADMIN', null);
    const requests = await click(v, /^Show details for /);
    pin(FILE, "a job's details, with its schedule", { requests, ...surfaceOf(v.main), details: detailsOf(v.main) }, PINNED);
  });
});
