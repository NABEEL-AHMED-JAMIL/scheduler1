import { test as base, expect, APIRequestContext, Browser, BrowserContextOptions, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forbiddenIds, NEEDS_FIXTURES, platformAdminId, rebuild, riverside } from './fixtures';

/**
 * Who a spec signs in as, in one place (MIG-330).
 *
 * Every spec used to carry its own copy of "decode the token, ask for its pages, seed localStorage", and half of them
 * signed in only with a password -- so on a machine with minted test tokens and no password, fifty-two tests skipped.
 * This is the one copy. A spec asks for a role and gets a session. The people are the rebuilt platform's (2026-10-06),
 * read from etl-platform/.state/demo/rebuild.json through support/fixtures.ts -- never written here as ids:
 *
 *   admin     E2E_TENANT_ADMIN_TOKEN    (mint-test-token.sh <riverside.admin> 600: TENANT_ADMIN of Riverside Health)
 *             or E2E_TENANT_ADMIN / E2E_TENANT_ADMIN_PASSWORD, or E2E_TENANT_ADMIN_ID to mint for someone else
 *   user      E2E_TENANT_USER_TOKEN     (mint-test-token.sh <riverside.reviewer> 600: Riverside's reviewer, a TENANT_USER)
 *             or E2E_TENANT_USER / E2E_TENANT_USER_PASSWORD, or E2E_TENANT_USER_ID
 *   viewer    E2E_TENANT_VIEWER_TOKEN   (mint-test-token.sh <riverside.viewer> 600: Riverside's viewer, a TENANT_USER)
 *             or E2E_TENANT_VIEWER / E2E_TENANT_VIEWER_PASSWORD, or E2E_TENANT_VIEWER_ID
 *   platform  E2E_PLATFORM_ADMIN_TOKEN  (mint-test-token.sh <platformAdmin.appUserId> 600: the TEST platform administrator)
 *             or E2E_PLATFORM_ADMIN / E2E_PLATFORM_ADMIN_PASSWORD, or E2E_PLATFORM_ADMIN_ID
 *
 * With E2E_MINT=1 every role is minted from those defaults, so a full run needs nothing else:
 *   E2E_MINT=1 npx playwright test
 *
 * <b>Tokens expire after ten minutes</b> (they are minted for 600 seconds) and a full run is longer than that. A token
 * handed in through the environment is used while it has more than a few minutes left; after that, when the mint script
 * is on this machine (etl-platform/scripts/mint-test-token.sh, or E2E_MINT_SCRIPT), a fresh one is minted for the same
 * person. Tokens are never printed, and nothing here ever mints for, or accepts a token of, the owner (1000 before the
 * wipe, rebuild.json's owner after it) or api-check's tenant user -- see fixtures.forbiddenIds().
 */
export const api = process.env['E2E_API_URL'] ?? 'http://localhost:9098/api/v1';

export type Role = 'admin' | 'user' | 'viewer' | 'platform';

/** A minted token lives this long (Identity caps it at 900 seconds). */
const TOKEN_TTL_SECONDS = 600;

const TOKEN_VAR: Record<Role, string> = {
  admin: 'E2E_TENANT_ADMIN_TOKEN', user: 'E2E_TENANT_USER_TOKEN', viewer: 'E2E_TENANT_VIEWER_TOKEN',
  platform: 'E2E_PLATFORM_ADMIN_TOKEN',
};
const PASSWORD_VARS: Record<Role, [string, string]> = {
  admin: ['E2E_TENANT_ADMIN', 'E2E_TENANT_ADMIN_PASSWORD'],
  user: ['E2E_TENANT_USER', 'E2E_TENANT_USER_PASSWORD'],
  viewer: ['E2E_TENANT_VIEWER', 'E2E_TENANT_VIEWER_PASSWORD'],
  platform: ['E2E_PLATFORM_ADMIN', 'E2E_PLATFORM_ADMIN_PASSWORD'],
};
const ID_VAR: Record<Role, string> = {
  admin: 'E2E_TENANT_ADMIN_ID', user: 'E2E_TENANT_USER_ID', viewer: 'E2E_TENANT_VIEWER_ID', platform: 'E2E_PLATFORM_ADMIN_ID',
};

/** The rebuilt person a role mints for by default (rebuild.json), or null when the state file is not here. */
function defaultPerson(role: Role): number | null {
  if (!rebuild()) return null;
  return role === 'admin' ? riverside().admin : role === 'user' ? riverside().reviewer
    : role === 'viewer' ? riverside().viewer : platformAdminId();
}

/** Why a spec skipped, in the words a reader can act on. */
export const NEEDS: Record<Role, string> = {
  admin: 'needs E2E_MINT=1 (mints for Riverside\'s admin, rebuild.json workspaces.riverside.admin), E2E_TENANT_ADMIN_TOKEN'
    + ' or E2E_TENANT_ADMIN(_PASSWORD)',
  user: 'needs E2E_MINT=1 (mints for Riverside\'s reviewer, workspaces.riverside.reviewer), E2E_TENANT_USER_TOKEN'
    + ' or E2E_TENANT_USER(_PASSWORD)',
  viewer: 'needs E2E_MINT=1 (mints for Riverside\'s viewer, workspaces.riverside.viewer), E2E_TENANT_VIEWER_TOKEN'
    + ' or E2E_TENANT_VIEWER(_PASSWORD)',
  platform: 'needs E2E_MINT=1 (mints for the test platform administrator, rebuild.json platformAdmin.appUserId),'
    + ' E2E_PLATFORM_ADMIN_TOKEN or E2E_PLATFORM_ADMIN(_PASSWORD)',
};

/**
 * A token with less than this left is replaced when it is asked for. Specs ask in beforeAll and keep the session for
 * their describe, so this is the longest a describe may take on one session (Ask your data alone can take five).
 */
const FRESH_FOR_MS = 5 * 60_000 + 30_000;

interface Claims { sub?: string; appUserId?: number; tenantId?: number | null; userRole?: string; exp?: number; }

export function claimsOf(token: string): Claims {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
}

function refuseOwner(token: string, where: string): string {
  const id = Number(claimsOf(token).appUserId);
  if (forbiddenIds().includes(id)) {
    throw new Error(`${where} is a token of appUserId ${id}, the owner's or api-check's: the e2e suite never acts as it.`);
  }
  return token;
}

function mintScript(): string | null {
  const path = process.env['E2E_MINT_SCRIPT'] ?? resolve(__dirname, '../../../../etl-platform/scripts/mint-test-token.sh');
  return existsSync(path) ? path : null;
}

/** The person a role's token is for: the env token's own claim when there is one, else the documented default. */
function personOf(role: Role, given: string | undefined): number | null {
  if (given) return Number(claimsOf(given).appUserId) || null;
  const named = process.env[ID_VAR[role]];
  if (named) return Number(named);
  return defaultPerson(role);
}

const minted = new Map<Role, string>();

function mint(role: Role, appUserId: number): string {
  if (forbiddenIds().includes(appUserId)) throw new Error(`refusing to mint a token for ${appUserId}: the owner's or api-check's`);
  const script = mintScript()!;
  const token = execFileSync('bash', [script, String(appUserId), String(TOKEN_TTL_SECONDS)], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
    env: { ...process.env, MINT_CALLER: `playwright e2e (${role})` },
  }).trim();
  if (token.split('.').length !== 3) throw new Error(`mint-test-token.sh ${appUserId} answered no token`);
  return refuseOwner(token, `the token minted for ${appUserId}`);
}

function freshEnough(token: string | undefined): token is string {
  const exp = token ? Number(claimsOf(token).exp) * 1000 : 0;
  return !!token && (!exp || exp - Date.now() > FRESH_FOR_MS);
}

/**
 * A role's access token, fresh enough for one test, or undefined when the role has none (then it may still sign in
 * with a password: see canSignIn). Minting happens only for a role whose token was handed in (it is being refreshed),
 * or for every role when E2E_MINT=1; E2E_MINT=0 never mints.
 */
export function tokenFor(role: Role, options: { newSignIn?: boolean } = {}): string | undefined {
  const given = process.env[TOKEN_VAR[role]] || undefined;
  if (given) refuseOwner(given, TOKEN_VAR[role]);
  const cached = minted.get(role);
  // newSignIn: a token of its own, as a fresh sign-in would get -- for a spec that changes what a person may open and
  // then signs them in again to see it (the server may remember what an existing token was allowed).
  if (!options.newSignIn && freshEnough(cached)) return cached;
  if (!options.newSignIn && freshEnough(given)) return given;
  const mode = process.env['E2E_MINT'];
  const person = personOf(role, given);
  if (mode !== '0' && person && mintScript() && (given || mode === '1')) {
    const token = mint(role, person);
    minted.set(role, token);
    return token;
  }
  return given;   // an expiring token is still better than none: the server, not this file, decides
}

function passwordOf(role: Role): { username: string; password: string } | null {
  const [userVar, passVar] = PASSWORD_VARS[role];
  const username = process.env[userVar];
  const password = process.env[passVar];
  return username && password ? { username, password } : null;
}

/** Whether E2E_MINT=1 can mint for this role: the script is here and the role has a person (rebuild.json or *_ID). */
const canMint = (role: Role): boolean =>
  process.env['E2E_MINT'] === '1' && !!mintScript() && personOf(role, undefined) !== null;

/** Whether a spec can sign in as this role at all. Use it in test.skip(!canSignIn(role), NEEDS[role]). */
export function canSignIn(role: Role): boolean {
  return !!process.env[TOKEN_VAR[role]] || !!passwordOf(role) || canMint(role);
}

/** Whether a role has a token (handed in, or minted with E2E_MINT=1): for the specs that sign in with nothing else. */
export function hasToken(role: Role): boolean {
  return !!process.env[TOKEN_VAR[role]] || canMint(role);
}

export interface Session {
  /** What the console keeps in localStorage etl_auth_user. */
  data: Record<string, unknown>;
  token: string;
  appUserId: number;
  tenantId: number | null;
  username: string;
  /** The person's name as the screens print it (appUser.json/me); the session data keeps the token's sub. */
  fullName?: string;
}

export const authOf = (s: Session | string): Record<string, string> =>
  ({ Authorization: `Bearer ${typeof s === 'string' ? s : s.token}` });

/** The console session a token stands for: its claims, plus the pages the server says it holds now. */
export async function sessionOf(request: APIRequestContext, token: string): Promise<Session> {
  const claims = claimsOf(refuseOwner(token, 'the token'));
  const mine = await (await request.get(`${api}/pageAccess.json/mine`, { headers: authOf(token) })).json().catch(() => ({}));
  const me = await (await request.get(`${api}/appUser.json/me`, { headers: authOf(token) })).json().catch(() => ({}));
  return {
    token, appUserId: Number(claims.appUserId), tenantId: claims.tenantId ?? null, username: String(claims.sub),
    fullName: me?.data?.fullName ?? undefined,
    data: { username: claims.sub, fullName: claims.sub, userRole: claims.userRole, appUserId: claims.appUserId,
      tenantId: claims.tenantId, accessToken: token, refreshToken: '', pageKeys: mine?.data?.pageKeys ?? null,
      pageAccessProfileName: mine?.data?.pageAccessProfileName ?? null },
  };
}

/** A password sign-in, through the endpoint the form posts to. */
export async function signInWithPassword(request: APIRequestContext, username: string, password: string): Promise<Session> {
  const answer = await request.post(`${api}/auth.json/login`, { data: { username, password }, failOnStatusCode: false });
  const body = await answer.json();
  expect(body.status, `sign-in for ${username}`).toBe('SUCCESS');
  return { data: body.data, token: body.data.accessToken, appUserId: Number(body.data.appUserId),
    tenantId: body.data.tenantId ?? null, username, fullName: body.data.fullName };
}

/**
 * A session for one rebuilt person who is none of the roles (another workspace's administrator, say), minted for this
 * call: for a read-only spec whose premise lives in another workspace. Needs the mint script; never the owner.
 */
export async function sessionAsPerson(request: APIRequestContext, appUserId: number): Promise<Session> {
  if (!mintScript() || process.env['E2E_MINT'] === '0') throw new Error(`minting a token for ${appUserId} needs the mint script`);
  return sessionOf(request, mint('admin', appUserId));
}

export const canMintPeople = (): boolean => !!mintScript() && process.env['E2E_MINT'] !== '0';

/** A session for a role: a (fresh) token when there is one, else the role's password. */
export async function sessionFor(request: APIRequestContext, role: Role): Promise<Session> {
  const token = tokenFor(role);
  if (token) return sessionOf(request, token);
  const credentials = passwordOf(role);
  if (!credentials) throw new Error(NEEDS[role]);
  return signInWithPassword(request, credentials.username, credentials.password);
}

/** A browser context signed in as the session: localStorage seeded on the app's own origin, where the app reads it. */
export async function pageAs(browser: Browser, s: Session, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(user => window.localStorage.setItem('etl_auth_user', JSON.stringify(user)), s.data);
  return page;
}

/** e2e/.auth/state.json holds a session (global-setup signed in with a password, or wrote one from a token). */
function storedSession(): boolean {
  try {
    return (JSON.parse(readFileSync('e2e/.auth/state.json', 'utf8')).origins ?? []).length > 0;
  } catch {
    return false;
  }
}

/** The specs that use the default `page`: signed in when there is an admin token, or a stored session. */
export function signedIn(): boolean {
  return !!process.env[TOKEN_VAR.admin] || process.env['E2E_MINT'] === '1' || storedSession();
}

/**
 * The session the default `page` carries: the admin token's when there is one, else global setup's stored sign-in --
 * for a spec that also calls the API as whoever its pages are signed in as (to find or make its fixtures).
 */
export async function defaultSession(request: APIRequestContext): Promise<Session> {
  const token = process.env[TOKEN_VAR.admin] || process.env['E2E_MINT'] === '1' ? tokenFor('admin') : undefined;
  if (token) return sessionOf(request, token);
  const state = JSON.parse(readFileSync('e2e/.auth/state.json', 'utf8'));
  for (const origin of state.origins ?? []) {
    const item = (origin.localStorage ?? []).find((i: { name: string }) => i.name === 'etl_auth_user');
    if (!item) continue;
    const data = JSON.parse(item.value);
    return { data, token: data.accessToken, appUserId: Number(data.appUserId), tenantId: data.tenantId ?? null, username: data.username };
  }
  throw new Error(NO_SESSION);
}

export const NO_SESSION = `No session: ${NEEDS.admin}, or E2E_PASSWORD for global-setup's sign-in`;

export { NEEDS_FIXTURES };

/**
 * `test` with the default `page` signed in as the tenant administrator from a fresh token, per test. Global setup's
 * state.json is written once at the start; a token in it is dead fifteen minutes later, and a run is longer than that.
 * With no admin token this is the plain storageState from global setup (the password path), unchanged.
 */
export const test = base.extend({
  storageState: async ({ storageState, baseURL, playwright }, use) => {
    const token = process.env[TOKEN_VAR.admin] || process.env['E2E_MINT'] === '1' ? tokenFor('admin') : undefined;
    if (!token) {
      await use(storageState);
      return;
    }
    const request = await playwright.request.newContext();
    const session = await sessionOf(request, token);
    await request.dispose();
    const origin = new URL(baseURL ?? 'http://localhost:4400').origin;
    await use({ cookies: [], origins: [{ origin, localStorage: [{ name: 'etl_auth_user', value: JSON.stringify(session.data) }] }] });
  },
});

export { expect };
