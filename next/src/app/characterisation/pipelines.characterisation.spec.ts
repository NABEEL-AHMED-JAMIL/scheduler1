import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { LIVE, LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/pipelines';

/**
 * MIG-222 (Wave 4) and MIG-266 (Wave 5: Core's form builder) characterisation baseline: Configuration > Pipelines: the list, its page
 * (New / Edit registry task, a dialog until owner #18) and the AI step panel.
 * Since MIG-250 the list is the Task Registry's Legacy rows (/settings/task-registry, where the old address lands):
 * the same row menu, the same form (now a page) and AI step panel. The registry's own surfaces are pinned in task-registry.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/pipelines.ts.
 */
const FILE = 'pipelines';

/** pipeline.json/get for the list's one row: the row, with its fields, as Core answers it (owner #18). */
const LIST: any = LIVE['GET /pipeline.json/list'];
const FIELDS: any = LIVE['GET /pipeline.json/fields'];
const PIPELINE_100167 = { status: 'SUCCESS', message: 'Pipeline found.', data: { ...LIST.data.rows[0], fields: FIELDS.data } };

describe("MIG-222 (Wave 4) and MIG-266 (Wave 5: Core's form builder): Configuration > Pipelines", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("the list, as a workspace administrator", async () => {
    const v = await visit('/settings/task-registry', 'TENANT_ADMIN', null);
    pin(FILE, "the list, as a workspace administrator", v.surface, PINNED);
  });

  it("the list, as a platform administrator", async () => {
    const v = await visit('/settings/task-registry', 'PLATFORM_ADMIN', null);
    pin(FILE, "the list, as a platform administrator", v.surface, PINNED);
  });

  it("the list, as a tenant user (admin-only)", async () => {
    const v = await visit('/settings/task-registry', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the list, as a tenant user (admin-only)", v.surface, PINNED);
  });

  it("the old Configuration › Pipelines address", async () => {
    const v = await visit('/configuration/pipelines', 'TENANT_ADMIN', null);
    pin(FILE, "the old Configuration › Pipelines address", { url: v.surface.url }, PINNED);
  });

  it("the old forms address", async () => {
    const v = await visit('/settings/forms', 'TENANT_ADMIN', null);
    pin(FILE, "the old forms address", v.surface, PINNED);
  });

  it("the row menu", async () => {
    const v = await visit('/settings/task-registry', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "the row menu", overlay(), PINNED);
  });

  // Owner #18 (2026-10-19): New / Edit registry task is a page of its own (/settings/task-registry/new, /<key>), not a dialog.
  it("the New registry task page", async () => {
    const v = await visit('/settings/task-registry', 'TENANT_ADMIN', null);
    const requests = await click(v, 'New registry task');
    const page = await visit('/settings/task-registry/new', 'TENANT_ADMIN', null);
    pin(FILE, "the New registry task page", { fromTheList: requests, ...page.surface }, PINNED);
  });

  it("the Edit registry task page", async () => {
    const v = await visit('/settings/task-registry/100167', 'TENANT_ADMIN', null, { 'GET /pipeline.json/get': PIPELINE_100167 });
    pin(FILE, "the Edit registry task page", v.surface, PINNED);
  });

  it("the AI step panel, for a pipeline with an AI step", async () => {
    const v = await visit('/settings/task-registry/100167', 'TENANT_ADMIN', null, { 'GET /pipeline.json/get': { ...PIPELINE_100167, data: {
      ...PIPELINE_100167.data, fields: [
        { pipelineFieldId: 1, tagKey: 'inputKey', label: 'Input CSV', fieldType: 'text', required: true, position: 0 },
        { pipelineFieldId: 2, tagKey: 'summary', label: 'Summary', fieldType: 'ai', required: false, position: 1,
          promptId: LIVE_IDS.promptId, variableMap: '{"text":"file:inputKey"}', onError: 'fail', runIn: 'worker' },
      ] } } });
    const requests = await click(v, 'Change');
    pin(FILE, "the AI step panel, for a pipeline with an AI step", { pageFields: v.surface.fields, requests, ...overlay() }, PINNED);
  });
});
