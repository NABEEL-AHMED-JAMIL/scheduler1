import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/pipelines';

/**
 * MIG-222 (Wave 4) and MIG-266 (Wave 5: Core's form builder) characterisation baseline: Configuration > Pipelines: the list, its dialog and the AI step panel.
 * Since MIG-250 the list is the Task Registry's Legacy rows (/configuration/task-registry, where the old address lands):
 * the same row menu, the same dialog and AI step panel. The registry's own surfaces are pinned in task-registry.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/pipelines.ts.
 */
const FILE = 'pipelines';

describe("MIG-222 (Wave 4) and MIG-266 (Wave 5: Core's form builder): Configuration > Pipelines", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("the list, as a workspace administrator", async () => {
    const v = await visit('/configuration/task-registry', 'TENANT_ADMIN', null);
    pin(FILE, "the list, as a workspace administrator", v.surface, PINNED);
  });

  it("the list, as a platform administrator", async () => {
    const v = await visit('/configuration/task-registry', 'PLATFORM_ADMIN', null);
    pin(FILE, "the list, as a platform administrator", v.surface, PINNED);
  });

  it("the list, as a tenant user (admin-only)", async () => {
    const v = await visit('/configuration/task-registry', 'TENANT_USER', TU_PAGES);
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
    const v = await visit('/configuration/task-registry', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "the row menu", overlay(), PINNED);
  });

  it("the dialog, for a new pipeline", async () => {
    const v = await visit('/configuration/task-registry', 'TENANT_ADMIN', null);
    const requests = await click(v, 'New registry task');
    pin(FILE, "the dialog, for a new pipeline", { requests, ...overlay() }, PINNED);
  });

  it("the dialog, editing a pipeline", async () => {
    const v = await visit('/configuration/task-registry', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    const requests = await click(v, 'Edit');
    pin(FILE, "the dialog, editing a pipeline", { requests, ...overlay() }, PINNED);
  });

  it("the AI step panel, for a pipeline with an AI step", async () => {
    const v = await visit('/configuration/task-registry', 'TENANT_ADMIN', null, {
      'GET /pipeline.json/fields': { status: 'SUCCESS', message: '2 field(s).', data: [
        { pipelineFieldId: 1, tagKey: 'inputKey', label: 'Input CSV', fieldType: 'text', required: true, position: 0 },
        { pipelineFieldId: 2, tagKey: 'summary', label: 'Summary', fieldType: 'ai', required: false, position: 1,
          promptId: LIVE_IDS.promptId, variableMap: '{"text":"file:inputKey"}', onError: 'fail', runIn: 'worker' },
      ] },
    });
    await click(v, /^Actions for /);
    await click(v, 'Edit');
    const dialog = overlay();
    const requests = await click(v, 'Change');
    pin(FILE, "the AI step panel, for a pipeline with an AI step", { dialogFields: dialog.fields, requests, ...overlay() }, PINNED);
  });
});
