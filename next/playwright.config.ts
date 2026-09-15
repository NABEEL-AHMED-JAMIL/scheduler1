import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests for Analytics Studio, against a running stack.
 *
 * These are deliberately NOT part of `ng test`. The unit suite runs in seconds against stubs;
 * these drive a real browser against a real backend reading real objects out of MinIO, and they
 * are worth having for exactly the things the unit suite structurally cannot see. Two defects
 * found by hand on 2026-09-09 make the case: a note that had gone stale and told readers the
 * product could not filter the Data tab, and a breadcrumb that removed a filter without restoring
 * the grouping it replaced. Neither was visible to any of those tests, because both were about
 * what the assembled screen SAYS rather than about what a component returns.
 *
 * <b>:4400 and :9098 are CONTAINERS, and neither reloads from source.</b> Run these against a
 * stack you have just rebuilt -- `docker compose build next-app && docker compose up -d next-app`
 * here, and the same for process_app in Old-School/process -- or the suite is testing whatever
 * was built last. That is not hypothetical: on 2026-09-10 a passing feature failed two specs
 * against an eleven-hour-old bundle, and one of the two looked like an accessibility regression.
 *
 * They skip rather than fail when the stack is absent -- see global-setup.ts. A suite that goes
 * red on a laptop with no Docker running is a suite people delete.
 *
 * @author Nabeel Ahmed
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One worker. These share one backend with a governor ceiling of four concurrent analytics
  // queries, and a suite that saturates it would be testing the refusal path by accident.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4400',
    storageState: 'e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
