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
  // Owner 2026-09-29: the Kafka and Task Registry screens are build screens too.
  { url: '/configuration/kafka', writes: ['New connection'] },
  { url: '/configuration/task-registry', writes: ['New registry task'] },
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

  // Owner 2026-09-29: running an existing schedule is not building it -- Run now and Run with stay for the customer.
  it('a schedule\'s menu keeps what reads and runs, and loses what builds', async () => {
    const v = await visit('/pipelines/schedules', 'TENANT_ADMIN', null, {}, MANAGED);
    await click(v, /^Actions for /);
    const items = overlay().items.join(' | ');
    expect(v.main.querySelector('[data-managed-banner]')?.textContent).toContain('You can still run them.');
    for (const kept of ['Run now', 'Run with', 'Edit', 'Executions', 'Ask about this job']) expect(items).toContain(kept);
    for (const gone of ['Skip next run', 'Duplicate', 'Email notifications', 'Deactivate', 'Delete']) {
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
    // The lock is one unstyled block fieldset (.form-lock in styles.css, which also keeps size containers out of it:
    // Chromium sometimes never laid out a container inside it, and the legacy task form rendered zero-size fields).
    it(`${url}: the lock is a form-lock fieldset, not display: contents`, async () => {
      const v = await visit(url, 'TENANT_ADMIN', null);
      const locks = Array.from(v.main.querySelectorAll('fieldset')).filter(f => f.classList.contains('form-lock'));
      expect(locks.length).toBeGreaterThan(0);
      expect(v.main.querySelector('fieldset.contents')).toBeNull();
    });
  }

  // Owner 2026-09-29: forcing a run's status is our team's in a MANAGED workspace; the Queue still shows every run.
  const RUNNING = { 'POST /message.json/fetchLogs': { status: 'SUCCESS', message: 'Logs.', data: [
    { jobQueueId: 9101, jobId: LIVE_IDS.jobId, jobStatus: 'Running', startTime: '2026-09-29T09:00:00', dateCreated: '2026-09-29T09:00:00' },
  ] } };
  it('the queue shows the banner and offers no Mark as failed / interrupted', async () => {
    const v = await visit('/pipelines/queue', 'TENANT_ADMIN', null, RUNNING, MANAGED);
    expect(hasBanner(v)).toBe(true);
    expect(v.main.querySelectorAll('[aria-label^="Actions for run #"]').length).toBe(0);
  });

  it('a SELF workspace\'s queue keeps its run actions, with no banner', async () => {
    const v = await visit('/pipelines/queue', 'TENANT_ADMIN', null, RUNNING);
    expect(hasBanner(v)).toBe(false);
    expect(v.main.querySelectorAll('[aria-label^="Actions for run #"]').length).toBeGreaterThan(0);
  });

  it('the assistant takes a staff session\'s workspace from the session: appUser.json/me refuses it', async () => {
    const own = await visit('/ai/assistant', 'TENANT_ADMIN', null);
    expect(own.surface.requests).toContain('GET /appUser.json/me');
    restoreClock();
    const staff = await visit('/ai/assistant', 'TENANT_ADMIN', null, {}, STAFF);
    expect(staff.surface.requests).not.toContain('GET /appUser.json/me');
  });

  it('the inbox keeps its uploads and loses its settings', async () => {
    const v = await visit('/documents/inbox', 'TENANT_ADMIN', null, {}, MANAGED);
    expect(hasBanner(v)).toBe(true);
    expect(offered(v, 'Set up the inbox')).toBe(false);
    expect(offered(v, 'Inbox settings')).toBe(false);
  });
});
