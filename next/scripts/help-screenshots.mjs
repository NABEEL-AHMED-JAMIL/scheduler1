#!/usr/bin/env node
// The help centre's and the client book's screenshots, from the live console (2026-10-26).
//
//   node scripts/help-screenshots.mjs                       # every shot in help/*/shots.json
//   node scripts/help-screenshots.mjs --topic report-studio # one topic's shots
//   node scripts/help-screenshots.mjs --only rs-designer,rs-library
//   node scripts/help-screenshots.mjs --adhoc /reports/overview /reports/library --scale 1 --out /tmp/look
//
// Each topic folder of help/ may hold a shots.json: a list of
//   { "name": "rs-designer",            the file: public/help/img/<name>.webp (help Markdown says ![...](rs-designer))
//     "route": "/reports/templates",    where the console opens
//     "as": "riverside.admin",          who: <workspace>.<admin|reviewer|viewer> or summit.<person> (.state/demo/rebuild.json)
//     "steps": [ {"click": "text=New template"}, {"selectIndex": ["select", 1]}, {"waitFor": "app-designer"}, {"wait": 800}, {"fill": ["input[name=q]", "wound"]},
//                {"hover": "css"}, {"press": "Escape"}, {"scroll": "css"} ],
//     "clip": "css selector",           optional: only that element (with "pad" pixels around it)
//     "viewport": [1920, 1080],         optional; default 1920 x 1080
//     "theme": "light",                 optional; default light
//     "thumb": true,                    optional: also <name>.sm.webp, 960 wide (a Start here picture)
//     "keepFocus": true,                optional: leave focus where the steps put it (an open menu stays open)
//     "retake": "why",                  optional: a note that the shot should be taken again (Summit Valley not ready)
//     "caption": "..." }                optional: the book's caption when it differs from the Markdown's
//
// Shots are taken at device scale 2 (the book prints them at the text width) and written as WebP (quality 90) with
// cwebp, so the console serves them small and the book uses the same files. public/help/img/figures.json records each
// figure's size, where it was taken and who as, for the help centre's <img width/height> and the book's figure list.
//
// Who: a token per person from etl-platform's scripts/mint-test-token.sh (ETL_PLATFORM, default ../../etl-platform),
// never the owner's account. Tokens stay in this process; nothing prints them. Reads only: the steps open panels and
// menus, they never save, approve or delete.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = resolve(root, process.env.ETL_PLATFORM || '../../etl-platform');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const base = opt('base', 'http://localhost:4400');
const api = opt('api', 'http://localhost:9098/api/v1');
const out = resolve(opt('out', join(root, 'public/help/img')));
const scale = Number(opt('scale', '2'));
const adhoc = argv.includes('--adhoc');
mkdirSync(out, { recursive: true });

const state = JSON.parse(readFileSync(join(platform, '.state/demo/rebuild.json'), 'utf8'));
const OWNER = (() => {
  try { return Number(/OWNER_USER_ID=(\d+)/.exec(readFileSync(join(platform, '.state/owner.env'), 'utf8'))?.[1]); } catch { return NaN; }
})();

/** The person a shot is taken as: riverside.admin, meridian.viewer, summit.dr.patel ... */
function personId(who) {
  const [ws, ...rest] = who.split('.');
  const role = rest.join('.');
  const id = ws === 'summit' ? state.showcase?.people?.[role]?.appUserId : state.workspaces?.[ws]?.[role];
  if (!Number.isInteger(id)) throw new Error(`no person ${who} in rebuild.json`);
  if (id === 1000 || id === OWNER) throw new Error(`refusing ${who}: the owner's account`);
  return id;
}

const tokens = new Map();
function tokenOf(who) {
  const had = tokens.get(who);
  if (had && had.until > Date.now()) return had.token;
  const token = execFileSync('bash', [join(platform, 'scripts/mint-test-token.sh'), String(personId(who)), '900'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MINT_CALLER: 'help-screenshots.mjs' },
  }).trim();
  tokens.set(who, { token, until: Date.now() + 10 * 60_000 });
  return token;
}

async function sessionData(who) {
  const token = tokenOf(who);
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const get = async p => (await fetch(`${api}/${p}`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => ({}));
  const mine = await get('pageAccess.json/mine');
  return { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
    tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: mine?.data?.pageKeys ?? null,
    pageAccessProfileName: mine?.data?.pageAccessProfileName ?? null };
}

function shotsToTake() {
  if (adhoc) {
    const routes = argv.filter((a, i) => a.startsWith('/') && argv[i - 1] !== '--out');
    return routes.map((route, i) => ({ name: `look-${i + 1}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`, route,
      as: opt('as', 'riverside.admin'), viewport: [Number(opt('w', '1920')), Number(opt('h', '1080'))], theme: opt('theme', 'light'),
      fullPage: argv.includes('--full') }));
  }
  const topic = opt('topic');
  const only = opt('only')?.split(',');
  const all = [];
  for (const dir of readdirSync(join(root, 'help')).sort()) {
    const file = join(root, 'help', dir, 'shots.json');
    if (!existsSync(file) || (topic && topic !== dir)) continue;
    for (const s of JSON.parse(readFileSync(file, 'utf8'))) all.push({ ...s, topic: dir });
  }
  return only ? all.filter(s => only.includes(s.name)) : all;
}

async function act(page, step) {
  const loc = sel => page.locator(sel).first();
  if (step.click) await loc(step.click).click({ timeout: 15_000 });
  if (step.dblclick) await loc(step.dblclick).dblclick({ timeout: 15_000 });
  if (step.hover) await loc(step.hover).hover({ timeout: 15_000 });
  if (step.fill) await loc(step.fill[0]).fill(step.fill[1], { timeout: 15_000 });
  if (step.select) await loc(step.select[0]).selectOption(step.select[1], { timeout: 15_000 });
  if (step.selectIndex) await loc(step.selectIndex[0]).selectOption({ index: step.selectIndex[1] }, { timeout: 15_000 });
  if (step.press) await page.keyboard.press(step.press);
  if (step.waitFor) await loc(step.waitFor).waitFor({ state: 'visible', timeout: 30_000 });
  if (step.scroll) await loc(step.scroll).scrollIntoViewIfNeeded({ timeout: 15_000 });
  if (step.scrollTop) await page.evaluate(() => window.scrollTo(0, 0));
  if (step.goto) await page.goto(base + step.goto, { waitUntil: 'load' });
  if (step.wait) await page.waitForTimeout(step.wait);
}

const figuresFile = join(out, 'figures.json');
const figures = !adhoc && existsSync(figuresFile) ? JSON.parse(readFileSync(figuresFile, 'utf8')) : {};
const browser = await chromium.launch();
const contexts = new Map();
const failed = [];
try {
  for (const s of shotsToTake()) {
    const [w, h] = s.viewport ?? [1920, 1080];
    const theme = s.theme ?? 'light';
    const key = `${s.as ?? 'riverside.admin'}|${w}x${h}|${theme}`;
    let ctx = contexts.get(key);
    if (!ctx) {
      const data = s.as === 'none' ? null : await sessionData(s.as ?? 'riverside.admin');
      ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: theme,
        reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago',
        storageState: { cookies: [], origins: data ? [{ origin: new URL(base).origin, localStorage: [
          { name: 'etl_auth_user', value: JSON.stringify(data) }, { name: 'etl_theme', value: theme }] }] : [] } });
      contexts.set(key, ctx);
    }
    const page = await ctx.newPage();
    try {
      await page.goto(base + s.route, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(s.settle ?? 900);
      for (const step of s.steps ?? []) await act(page, step);
      await page.waitForTimeout(400);
      if (s.fullPage) {
        // Lazy pictures load only when they come into view: scroll the page through once.
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      // No caret blinking, no toasts half-faded, no focus ring from the last click.
      await page.addStyleTag({ content: '*{caret-color:transparent!important} .toast-host,.toasts{display:none!important}' });
      if (!s.keepFocus) await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
      const png = join(out, `${s.name}.png`);
      if (s.clip) {
        const box = await page.locator(s.clip).first().boundingBox();
        if (!box) throw new Error(`clip ${s.clip} not found`);
        const pad = s.pad ?? 12;
        // boundingBox is relative to the viewport; a full-page clip is relative to the page.
        const at = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
        box.x += at.x; box.y += at.y;
        await page.screenshot({ path: png, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
          width: Math.min(w, box.width + 2 * pad), height: box.height + 2 * pad }, fullPage: true });
      } else {
        await page.screenshot({ path: png, fullPage: !!s.fullPage });
      }
      if (adhoc && !argv.includes('--webp')) { console.log(png); continue; }
      const webp = join(out, `${s.name}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', png, '-o', webp]);
      // A small copy (960 pixels wide) for a topic page's Start here picture.
      if (s.thumb) execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', '960', '0', png, '-o', join(out, `${s.name}.sm.webp`)]);
      rmSync(png);
      const head = readFileSync(webp);
      const size = webpSize(head);
      figures[s.name] = { width: size.w, height: size.h, route: s.route, as: s.as ?? 'riverside.admin', theme, scale,
        topic: s.topic ?? null, taken: new Date().toISOString().slice(0, 10), ...(s.retake ? { retake: s.retake } : {}) };
      console.log(`${s.name}: ${size.w}x${size.h} ${(head.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      failed.push(s.name);
      console.error(`${s.name}: FAILED ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: join(out, `${s.name}.failed.png`) }).catch(() => {});
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (!adhoc) writeFileSync(figuresFile, JSON.stringify(Object.fromEntries(Object.entries(figures).sort()), null, 1) + '\n');
if (failed.length) { console.error(`${failed.length} failed: ${failed.join(',')}`); process.exitCode = 1; }

/** A WebP's pixel size from its header (VP8, VP8L or VP8X). */
function webpSize(b) {
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}
