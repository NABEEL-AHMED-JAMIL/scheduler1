// MIG-320: walks every console route as one person and records what goes wrong -- console errors, failed requests,
// sideways scroll -- and whether a MANAGED workspace's build screens say they are managed. Headless; one JSON line per
// route, a screenshot per route.
//
//   ROLE_SWEEP_TOKEN=<token> node scripts/role-sweep.mjs <routes.json> <out-dir> [base]
//   ROLE_SWEEP_SESSION_FILE=<file> node scripts/role-sweep.mjs ...   # a whole sign-in answer, e.g. a managed-service
//                                                                      # session (managedService.json/openSession)
//
// The token is a test token (etl-platform/scripts/mint-test-token.sh); it is read from the environment, never printed.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [routesFile, out, base = 'http://localhost:4400'] = process.argv.slice(2);
const api = 'http://localhost:9098/api/v1';
const given = process.env.ROLE_SWEEP_SESSION_FILE ? JSON.parse(readFileSync(process.env.ROLE_SWEEP_SESSION_FILE, 'utf8')) : null;
const token = given?.accessToken ?? process.env.ROLE_SWEEP_TOKEN;
if (!token || !routesFile || !out) {
  console.error('usage: ROLE_SWEEP_TOKEN=... node scripts/role-sweep.mjs <routes.json> <out-dir> [base]');
  process.exit(2);
}
const routes = JSON.parse(readFileSync(routesFile, 'utf8'));
mkdirSync(out, { recursive: true });

const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
if (String(claims.appUserId) === '1000') { console.error('refusing: never sweep as user 1000'); process.exit(2); }
const mine = await (await fetch(`${api}/pageAccess.json/mine`, { headers: { Authorization: `Bearer ${token}` } })).json();
const session = given ?? { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
  tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: mine?.data?.pageKeys ?? null,
  pageAccessProfileName: mine?.data?.pageAccessProfileName ?? null };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(s => localStorage.setItem('etl_auth_user', s), JSON.stringify(session));
const lines = [];
for (const route of routes) {
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 500 || (r.status() >= 400 && r.status() !== 404 && r.url().includes('/api/'))) failed.push(`${r.status()} ${r.url().replace(api, '')}`.slice(0, 160)); });
  const started = Date.now();
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => errors.push(String(e).slice(0, 160)));
  await page.waitForTimeout(500);
  const facts = await page.evaluate(() => ({
    url: location.pathname,
    title: document.title,
    managedBanner: !!document.querySelector('app-managed-banner *'),
    refused: /isn't part of your access|not part of your access/.test(document.body.innerText),
    sideways: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
  await page.screenshot({ path: `${out}/${name}.png` });
  lines.push(JSON.stringify({ route, ms: Date.now() - started, ...facts, errors, failed }));
  await page.close();
}
writeFileSync(`${out}/results.jsonl`, lines.join('\n') + '\n');
await browser.close();
const parsed = lines.map(l => JSON.parse(l));
const bad = parsed.filter(r => r.errors.length || r.failed.length || r.sideways);
console.log(`${parsed.length} routes; ${bad.length} with errors, failed requests or sideways scroll; ` +
  `${parsed.filter(r => r.managedBanner).length} show the managed banner; ${parsed.filter(r => r.refused).length} refused by access`);
for (const r of bad) console.log(`  ${r.route}: ${[...r.errors, ...r.failed, r.sideways ? 'sideways scroll' : ''].filter(Boolean).join(' | ')}`);
