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
  //
  // <b>But only while it still works.</b> This originally reused any session with an origin in
  // it, which meant an EXPIRED token was handed to every spec: the app loaded, the requests came
  // back 401, and eighteen tests failed on assertions about missing content. Two hours after a
  // green run the suite reported eighteen product defects and had found none. An expired session
  // is now treated exactly like no session -- sign in again if there is a password, and otherwise
  // skip with a reason, which is the outcome this file exists to produce.
  if (existsSync(statePath)) {
    try {
      const existing = JSON.parse(readFileSync(statePath, 'utf8'));
      if ((existing.origins ?? []).length > 0) {
        const expiry = tokenExpiry(existing);
        if (expiry !== null && expiry <= Date.now()) {
          const ago = Math.round((Date.now() - expiry) / 60000);
          console.log(`\n[e2e] The stored session expired ${ago} minutes ago — signing in again.\n`);
        } else {
          console.log('\n[e2e] Reusing the session already in e2e/.auth/state.json.\n');
          return;
        }
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

/**
 * When the stored access token stops being accepted, in epoch milliseconds.
 *
 * Null when there is nothing to judge -- no token, or one this cannot read. Null means "carry on
 * and use it": a session whose shape changed is not evidence that it expired, and refusing to
 * reuse one on that basis would send somebody looking for a password they should not need.
 *
 * The payload is read without verifying the signature, which is right here and would be wrong
 * anywhere else: this is not an authorisation decision. It decides whether to spend a sign-in,
 * and the server remains the only thing that decides whether the token is good.
 */
function tokenExpiry(state: { origins?: { localStorage?: { name: string; value: string }[] }[] }):
  number | null {

  try {
    for (const origin of state.origins ?? []) {
      for (const item of origin.localStorage ?? []) {
        if (item.name !== 'etl_auth_user') continue;
        const token = JSON.parse(item.value)?.accessToken;
        if (typeof token !== 'string') return null;
        const payload = token.split('.')[1];
        if (!payload) return null;
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        // Seconds on the wire, milliseconds everywhere in this file.
        return typeof decoded?.exp === 'number' ? decoded.exp * 1000 : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export default globalSetup;
