import { describe, it, expect, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { Visit, click, overlay, restoreClock, visit } from '../characterisation/harness';
import { LIVE_IDS } from '../characterisation/fixtures.live';

/**
 * MIG-254: a MANAGED workspace's own people see the build screens read-only, under a "Managed by our team"
 * banner. The SELF side of every screen here is pinned by the characterisation areas and must not move;
 * this spec covers the MANAGED side, and that our staff's managed-service session (msvc) builds as before.
 */
const MANAGED = { mgmt: 'MANAGED' };
const STAFF = { mgmt: 'MANAGED', msvc: true };

const hasBanner = (v: Visit) => !!v.main.querySelector('[data-managed-banner]');

/** The screens that build, with the controls that write there and must be gone when MANAGED. */
const SCREENS: { url: string; writes: string[] }[] = [
  { url: '/pipelines', writes: ['New pipeline', 'Bulk import'] },
  { url: '/pipelines/schedules', writes: ['New schedule', 'Bulk import'] },
  { url: '/integration/api-collections', writes: ['New collection'] },
  { url: '/integration/sources', writes: ['New source'] },
  { url: '/ai/prompts', writes: ['New prompt'] },
  { url: '/ai/connections', writes: ['New connection'] },
  { url: '/integration/storage-connections', writes: ['New connection'] },
];

/** A button or link in the page (not the menu) that says this. */
const offered = (v: Visit, name: string) => Array.from(v.main.querySelectorAll('a, button'))
  .some(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim().includes(name));

describe('MIG-254: build screens in a MANAGED workspace', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  for (const { url, writes } of SCREENS) {
    it(`${url}: the banner, and no ${writes.join(' / ')}`, async () => {
      const v = await visit(url, 'TENANT_ADMIN', null, {}, MANAGED);
      expect(hasBanner(v)).toBe(true);
      for (const name of writes) expect(offered(v, name), name).toBe(false);
    });

    it(`${url}: a SELF workspace keeps ${writes.join(' / ')}, with no banner`, async () => {
      const v = await visit(url, 'TENANT_ADMIN', null);
      expect(hasBanner(v)).toBe(false);
      for (const name of writes) expect(offered(v, name), name).toBe(true);
    });

    it(`${url}: our staff's managed session builds there`, async () => {
      const v = await visit(url, 'TENANT_ADMIN', null, {}, STAFF);
      expect(hasBanner(v)).toBe(false);
      for (const name of writes) expect(offered(v, name), name).toBe(true);
    });
  }

  it('a schedule\'s menu keeps what reads and loses what writes', async () => {
    const v = await visit('/pipelines/schedules', 'TENANT_ADMIN', null, {}, MANAGED);
    await click(v, /^Actions for /);
    const items = overlay().items.join(' | ');
    for (const kept of ['Edit', 'Executions', 'Ask about this job']) expect(items).toContain(kept);
    for (const gone of ['Run now', 'Run with', 'Skip next run', 'Duplicate', 'Email notifications', 'Deactivate', 'Delete']) {
      expect(items, gone).not.toContain(gone);
    }
  });

  const editors: [string, string][] = [
    [`/pipelines/${LIVE_IDS.taskId}/edit`, 'Save'],
    [`/pipelines/schedules/${LIVE_IDS.jobId}/edit`, 'Save'],
    [`/ai/prompts/${LIVE_IDS.promptId}/edit`, 'Save'],
  ];
  for (const [url, save] of editors) {
    it(`${url}: the banner, and saving is off`, async () => {
      const v = await visit(url, 'TENANT_ADMIN', null, {}, MANAGED);
      expect(hasBanner(v)).toBe(true);
      const saves = Array.from(v.main.querySelectorAll('button')).filter(b => b.textContent?.trim().startsWith(save));
      expect(saves.length).toBeGreaterThan(0);
      for (const b of saves) expect((b as HTMLButtonElement).disabled, b.textContent ?? '').toBe(true);
    });
  }

  it('the inbox keeps its uploads and loses its settings', async () => {
    const v = await visit('/documents/inbox', 'TENANT_ADMIN', null, {}, MANAGED);
    expect(hasBanner(v)).toBe(true);
    expect(offered(v, 'Set up the inbox')).toBe(false);
    expect(offered(v, 'Inbox settings')).toBe(false);
  });
});
