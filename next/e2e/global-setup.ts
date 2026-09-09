import { chromium, FullConfig } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

/**
 * Signs in once and leaves the session where every spec can pick it up.
 *
 * Logging in through the form in each spec would test the login screen eleven times and the thing
 * under test once. This posts to the same endpoint the form posts to and seeds the store the app
 * reads, which is the same state a real sign-in leaves behind.
 *
 * <b>The password is never in this file.</b> It comes from E2E_PASSWORD, and when that is absent
 * the setup writes an empty session and the specs skip themselves with a reason. A test suite that
 * fails because a machine has no stack running teaches people to ignore it; one that says why it
 * skipped teaches them how to run it.
 */
async function globalSetup(config: FullConfig) {
  const base = process.env['E2E_BASE_URL'] ?? 'http://localhost:4400';
  const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';
  const username = process.env['E2E_USERNAME'] ?? 'admin@platform.local';
  const password = process.env['E2E_PASSWORD'];

  mkdirSync('e2e/.auth', { recursive: true });
  const blank = { cookies: [], origins: [] };
  const statePath = 'e2e/.auth/state.json';

  // An existing session is honoured rather than overwritten. Someone who already has one -- from
  // a previous run, or lifted out of a browser they are signed into -- should not have to hand
  // over a password to reuse it, and clobbering it would be the setup destroying the thing it
  // exists to provide.
  if (existsSync(statePath)) {
    try {
      const existing = JSON.parse(readFileSync(statePath, 'utf8'));
      if ((existing.origins ?? []).length > 0) {
        console.log('\n[e2e] Reusing the session already in e2e/.auth/state.json.\n');
        return;
      }
    } catch {
      // Unreadable is the same as absent: fall through and sign in.
    }
  }

  if (!password) {
    console.log('\n[e2e] E2E_PASSWORD is not set — every spec will skip.'
      + '\n[e2e] Run with: E2E_PASSWORD=… npx playwright test\n');
    writeFileSync('e2e/.auth/state.json', JSON.stringify(blank));
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const answer = await page.request.post(`${api}/auth.json/login`, {
      data: { username, password },
      failOnStatusCode: false,
    });
    const body = await answer.json().catch(() => ({}));
    if (body?.status !== 'SUCCESS' || !body?.data) {
      console.log(`\n[e2e] Sign-in was refused for ${username} — every spec will skip.\n`);
      writeFileSync('e2e/.auth/state.json', JSON.stringify(blank));
      return;
    }
    // Seeded on the app's own origin, because that is where the app looks for it.
    await page.goto(base);
    await page.evaluate(user => {
      window.localStorage.setItem('etl_auth_user', JSON.stringify(user));
    }, body.data);
    await page.context().storageState({ path: 'e2e/.auth/state.json' });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
