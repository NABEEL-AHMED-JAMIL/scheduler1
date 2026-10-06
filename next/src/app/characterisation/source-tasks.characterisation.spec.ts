import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, detailsOf, overlay, pin, restoreClock, surfaceOf, valuesOf, visit } from './harness';
import { LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/source-tasks';

/**
 * MIG-222 (Wave 4) characterisation baseline: Source Tasks: list, edit, XML payload.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/source-tasks.ts.
 */
const FILE = 'source-tasks';

describe("MIG-222 (Wave 4): Source Tasks", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("the list, as a workspace administrator", async () => {
    const v = await visit('/operations/tasks', 'TENANT_ADMIN', null);
    pin(FILE, "the list, as a workspace administrator", v.surface, PINNED);
  });

  it("the list, as a tenant user with five pages", async () => {
    const v = await visit('/operations/tasks', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the list, as a tenant user with five pages", v.surface, PINNED);
  });

  it("a new task", async () => {
    const v = await visit('/operations/tasks/new', 'TENANT_ADMIN', null);
    pin(FILE, "a new task", v.surface, PINNED);
  });

  it("editing a task", async () => {
    const v = await visit(`/operations/tasks/${LIVE_IDS.taskId}/edit`, 'TENANT_ADMIN', null);
    pin(FILE, "editing a task", v.surface, PINNED);
  });

  it("editing a task, as a tenant user (the editor is admin-only)", async () => {
    const v = await visit(`/operations/tasks/${LIVE_IDS.taskId}/edit`, 'TENANT_USER', TU_PAGES);
    pin(FILE, "editing a task, as a tenant user (the editor is admin-only)", v.surface, PINNED);
  });

  it("bulk tasks", async () => {
    const v = await visit('/operations/tasks/bulk', 'TENANT_ADMIN', null);
    pin(FILE, "bulk tasks", v.surface, PINNED);
  });

  it("the row menu, as a workspace administrator", async () => {
    const v = await visit('/operations/tasks', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "the row menu, as a workspace administrator", overlay(), PINNED);
  });

  it("a task's XML payload, opened in the list", async () => {
    const v = await visit('/operations/tasks', 'TENANT_ADMIN', null);
    const requests = await click(v, 'Show payload');
    pin(FILE, "a task's XML payload, opened in the list", { requests, ...surfaceOf(v.main), details: detailsOf(v.main) }, PINNED);
  });

  it("the editor: the payload as the pipeline's fields", async () => {
    const v = await visit(`/operations/tasks/${LIVE_IDS.taskId}/edit`, 'TENANT_ADMIN', null);
    pin(FILE, "the editor: the payload as the pipeline's fields", valuesOf(v.main), PINNED);
  });

  it("the editor: the raw XML payload, for a pipeline without a definition", async () => {
    const v = await visit(`/operations/tasks/${LIVE_IDS.taskId}/edit`, 'TENANT_ADMIN', null, {
      'GET /pipeline.json/definition': { status: 'ERROR', message: 'Pipeline not found.' },
    });
    pin(FILE, "the editor: the raw XML payload, for a pipeline without a definition",
      { ...surfaceOf(v.main), values: valuesOf(v.main) }, PINNED);
  });
});
