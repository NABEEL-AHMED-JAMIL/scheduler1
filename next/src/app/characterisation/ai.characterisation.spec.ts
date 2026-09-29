import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/ai';

/**
 * MIG-222 (Wave 4) characterisation baseline: Prompts and Model connections.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/ai.ts.
 */
const FILE = 'ai';

describe("MIG-222 (Wave 4): Prompts and Model connections", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("prompts, as a workspace administrator", async () => {
    const v = await visit('/assistants/prompts', 'TENANT_ADMIN', null);
    pin(FILE, "prompts, as a workspace administrator", v.surface, PINNED);
  });

  it("prompts, as a tenant user without the page", async () => {
    const v = await visit('/assistants/prompts', 'TENANT_USER', TU_PAGES);
    pin(FILE, "prompts, as a tenant user without the page", v.surface, PINNED);
  });

  it("prompts, as a tenant user with every page", async () => {
    const v = await visit('/assistants/prompts', 'TENANT_USER', ALL_PAGES);
    pin(FILE, "prompts, as a tenant user with every page", v.surface, PINNED);
  });

  it("a new prompt", async () => {
    const v = await visit('/assistants/prompts/new', 'TENANT_ADMIN', null);
    pin(FILE, "a new prompt", v.surface, PINNED);
  });

  it("editing a prompt", async () => {
    const v = await visit(`/assistants/prompts/${LIVE_IDS.promptId}/edit`, 'TENANT_ADMIN', null);
    pin(FILE, "editing a prompt", v.surface, PINNED);
  });

  it("model connections, as a workspace administrator", async () => {
    const v = await visit('/assistants/connections', 'TENANT_ADMIN', null);
    pin(FILE, "model connections, as a workspace administrator", v.surface, PINNED);
  });

  it("model connections, as a platform administrator", async () => {
    const v = await visit('/assistants/connections', 'PLATFORM_ADMIN', null);
    pin(FILE, "model connections, as a platform administrator", v.surface, PINNED);
  });

  it("model connections, as a tenant user", async () => {
    const v = await visit('/assistants/connections', 'TENANT_USER', ALL_PAGES);
    pin(FILE, "model connections, as a tenant user", v.surface, PINNED);
  });

  it("a prompt's row menu", async () => {
    const v = await visit('/assistants/prompts', 'TENANT_ADMIN', null);
    await click(v, /^Actions for /);
    pin(FILE, "a prompt's row menu", overlay(), PINNED);
  });
});
