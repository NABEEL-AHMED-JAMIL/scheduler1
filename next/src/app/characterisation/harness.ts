import { expect, vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { EMPTY } from 'rxjs';
import { routes } from '../app.routes';
import { JobEventsService } from '../core/socket/job-events.service';
import { fixtureFor } from './fixtures';

/**
 * The characterisation harness (MIG-222 Wave 4, MIG-266 Wave 5).
 *
 * A screen is visited the way a person reaches it: the real route table, its guards and the
 * shell, signed in as a role with a set of pages, at a fixed clock. Every request it makes is
 * answered from fixtures.ts -- answers shaped like the ones api-check/characterisation.tsv pins
 * for the live platform -- and what it then shows is reduced to a `Surface`: where it landed, the
 * requests it made, its headings, buttons, table columns, form labels and links. Each area's
 * spec compares that with the surface pinned in `pinned/<area>.ts`.
 *
 * A Wave 4 or 5 change that renames a route, drops a column, moves a button or calls a
 * different endpoint fails here by name. When the change is the intended one, re-record:
 * `node scripts/characterisation/record.mjs [area]` runs these specs with CHAR_RECORD=1 (each
 * surface is then printed as a `@@CHAR@@` line instead of compared) and writes pinned/<area>.ts;
 * commit that diff with the change, where the review reads it. The answers themselves come from
 * `scripts/characterisation/capture-fixtures.mjs` (fixtures.ts says how).
 */

// The platform's clock is Chicago's (naive timestamps are Chicago wall-clock), and every visit runs
// in it, whatever the machine running the tests is set to: "10h ago", a day boundary and an
// hour-of-day chart would otherwise differ between a laptop in Chicago and a CI box in UTC.
// Set for each visit and put back by restoreClock(), so no other spec in the same worker sees it.
const env = (globalThis as any).process?.env as Record<string, string | undefined> | undefined;
let machineZone: string | undefined;
function useChicago(): void {
  if (!env) return;
  machineZone = env['TZ'];
  env['TZ'] = 'America/Chicago';
}
function restoreZone(): void {
  if (!env) return;
  if (machineZone === undefined) delete env['TZ'];
  else env['TZ'] = machineZone;
}

export type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

/**
 * Every page an access profile can grant today (Identity's catalogue). api-collections joined with MIG-223; the Wave 5
 * keys in core/auth/page-keys.ts are not in Identity's catalogue yet, so no profile can hold them.
 */
export const ALL_PAGES = ['jobs', 'tasks', 'queue', 'reports', 'objects', 'analytics', 'analytics-dashboards',
  'tools-converter', 'tools-transcript', 'ai-prompts', 'api-collections'];

/** The pages api-check's tenant user (4597) holds, so the console and the API baselines speak for the same person. */
export const TU_PAGES = ['jobs', 'tasks', 'queue', 'reports', 'objects'];

/** The clock every visit runs at: dates on screen and in request parameters are then stable. */
export const NOW = new Date('2026-09-28T12:00:00-05:00'); // noon in Chicago (CDT)

export interface Surface {
  /** Where the router ended up (a guard may have sent the visit elsewhere). */
  url: string;
  /** Every request the screen made while settling, in order of first appearance, dates as <date>. */
  requests: string[];
  headings: string[];
  /** Each button's accessible name, sorted and unique. */
  buttons: string[];
  /** Each table's header cells, in order. */
  columns: string[][];
  /** Form labels, placeholders and aria-labels of inputs, selects and textareas, sorted and unique. */
  fields: string[];
  /** routerLink targets inside the page, sorted and unique. */
  links: string[];
}

export interface Visit {
  surface: Surface;
  main: HTMLElement;
  root: HTMLElement;
  harness: RouterTestingHarness;
  /** Answers further requests (after a click), and lists them. */
  settle: () => Promise<string[]>;
}

/** A stored session like the one sign-in writes: AuthService reads it in its field initialiser. */
export function signIn(role: Role, pageKeys: string[] | null = null): void {
  const claims = btoa(JSON.stringify({ sub: 'characterisation@example.com', appUserId: 4537, userRole: role,
    tenantId: role === 'PLATFORM_ADMIN' ? null : 2924, exp: 4102444800 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  localStorage.setItem('etl_auth_user', JSON.stringify({
    username: 'characterisation@example.com', userRole: role, appUserId: 4537, fullName: 'Casey Baseline',
    tenantId: role === 'PLATFORM_ADMIN' ? null : 2924, tenantName: 'Claude Demo',
    accessToken: `header.${claims}.unsigned`, refreshToken: 'r', pageKeys,
  }));
}

function stubBrowser(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  if (typeof (globalThis as any).ResizeObserver !== 'function') {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  }
  if (typeof (globalThis as any).IntersectionObserver !== 'function') {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  }
  if (!(Element.prototype as any).scrollIntoView) (Element.prototype as any).scrollIntoView = () => {};
  if (!(window as any).scrollTo || !(window as any).scrollTo.__stub) {
    const scrollTo = () => {};
    (scrollTo as any).__stub = true;
    (window as any).scrollTo = scrollTo;
  }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** "GET /sourceJob.json/listSourceJob?jobId=5", dates as <date>, a JSON body as its sorted keys. */
export function describeRequest(req: TestRequest): string {
  const r = req.request;
  const path = r.url.replace(/^.*\/api\/v1/, '').replace(/^https?:\/\/[^/]+/, '');
  const params = r.params.keys().sort().map(k => `${k}=${r.params.getAll(k)?.join(',')}`);
  let body = '';
  if (r.body instanceof FormData) {
    body = ' form{' + [...new Set([...(r.body as any).keys()])].sort().join(',') + '}';
  } else if (r.body && typeof r.body === 'object') {
    body = ' {' + Object.keys(r.body).sort().join(',') + '}';
  }
  return normalise(`${r.method} ${path}${params.length ? '?' + params.join('&') : ''}${body}`);
}

function normalise(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, '<date>')
    // "10h ago" depends on the machine's time zone as well as the clock: the wording is pinned, not the number.
    .replace(/\b\d+\s?(s|m|h|d|w|mo|y|sec|secs|min|mins|minutes?|hours?|days?|weeks?|months?|years?) ago\b/g, '<n> ago')
    .replace(/\s+/g, ' ')
    .trim();
}

const text = (el: Element | null | undefined) => normalise(el?.textContent ?? '');
const uniqueSorted = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

/** A control's accessible name: its aria-label, else its text, else its title. */
function nameOf(el: Element): string {
  return normalise(el.getAttribute('aria-label') || text(el) || el.getAttribute('title') || '');
}

/** The page reduced to what a person can see and act on. */
export function surfaceOf(main: HTMLElement): Omit<Surface, 'url' | 'requests'> {
  const headings = Array.from(main.querySelectorAll('h1, h2, h3')).map(h => text(h)).filter(Boolean);
  const buttons = uniqueSorted(Array.from(main.querySelectorAll('button, [role="button"], [role="menuitem"], [role="tab"]'))
    .map(nameOf));
  const columns = Array.from(main.querySelectorAll('table')).map(t =>
    Array.from(t.querySelectorAll('thead th, thead [role="columnheader"]')).map(th => text(th)))
    .filter(cols => cols.length > 0);
  const fields = uniqueSorted([
    ...Array.from(main.querySelectorAll('label')).map(l => text(l)),
    ...Array.from(main.querySelectorAll('input, select, textarea')).flatMap(i => [
      i.getAttribute('placeholder') ?? '', i.getAttribute('aria-label') ?? '']),
  ].map(normalise));
  const links = uniqueSorted(Array.from(main.querySelectorAll('a[href]'))
    .map(a => (a.getAttribute('href') ?? '').replace(/\d{4}-\d{2}-\d{2}/g, '<date>'))
    .filter(h => h.startsWith('/')));
  return { headings, buttons, columns, fields, links };
}

/**
 * Visits a URL as a role, answering every request from fixtures (or `answers`), until the screen
 * is quiet; then returns what it shows.
 */
export async function visit(url: string, role: Role, pageKeys: string[] | null,
  answers: Record<string, unknown> = {}): Promise<Visit> {
  stubBrowser();
  useChicago();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  signIn(role, role === 'TENANT_USER' ? pageKeys : pageKeys ?? null);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(),
      provideHttpClientTesting(),
      // No socket in a test: the screens follow job events, none arrive.
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const seen: string[] = [];
  const answer = async (): Promise<string[]> => {
    const made: string[] = [];
    let quiet = 0;
    for (let i = 0; i < 400 && quiet < 6; i++) {
      await tick();
      const pending = http.match(() => true);
      quiet = pending.length ? 0 : quiet + 1;
      for (const req of pending) {
        const described = describeRequest(req);
        if (!seen.includes(described)) seen.push(described);
        made.push(described);
        const reply = fixtureFor(req, answers);
        if (req.cancelled) continue;
        if (reply.error) req.flush(reply.body as any, { status: reply.error, statusText: 'Error' });
        else req.flush(reply.body as any);
      }
    }
    return made;
  };
  const harness = await RouterTestingHarness.create();
  let done = false;
  const navigation = harness.navigateByUrl(url).finally(() => { done = true; });
  for (let i = 0; i < 50 && !done; i++) await answer();
  await navigation;
  await answer();
  harness.fixture.detectChanges();
  await answer();
  const root = harness.fixture.nativeElement as HTMLElement;
  const main = (root.querySelector('main#main') as HTMLElement | null) ?? root;
  const router = TestBed.inject(Router);
  return {
    surface: { url: normalise(router.url), requests: [...seen], ...surfaceOf(main) },
    main,
    root,
    harness,
    settle: async () => {
      const made = await answer();
      harness.fixture.detectChanges();
      return made;
    },
  };
}

/**
 * The text of a page's expanded details and code blocks (a job's schedule, a task's XML payload),
 * as a person reads it: <dt>/<dd> pairs and <pre>/<code> blocks.
 */
export function detailsOf(scope: HTMLElement): { terms: string[]; code: string[] } {
  const terms = Array.from(scope.querySelectorAll('dt')).map(dt => {
    const dd = dt.nextElementSibling;
    return `${text(dt)}: ${dd && dd.tagName === 'DD' ? text(dd) : ''}`;
  });
  const code = Array.from(scope.querySelectorAll('pre, code, textarea')).map(el =>
    normalise((el as HTMLTextAreaElement).value ?? el.textContent ?? '').slice(0, 400)).filter(Boolean);
  return { terms, code: [...new Set(code)] };
}

/** What a form holds: each control's id (or name / aria-label) and its value, in order. */
export function valuesOf(scope: HTMLElement): string[] {
  return Array.from(scope.querySelectorAll('input, select, textarea'))
    .map(el => {
      const input = el as HTMLInputElement;
      const name = input.id || input.name || input.getAttribute('aria-label') || input.getAttribute('formcontrolname') || '?';
      const value = input.type === 'checkbox' || input.type === 'radio' ? String(input.checked) : input.value;
      return normalise(`${name}=${value ?? ''}`);
    })
    .filter(pair => !/^\?=$/.test(pair));
}

/**
 * The menu the shell draws for the signed-in person: each top-level link, and each section
 * opened in turn with its entries (label, the one-line hint, where it goes).
 */
export async function menuOf(v: Visit): Promise<string[]> {
  const nav = v.root.querySelector('header nav');
  if (!nav) return [];
  const out: string[] = [];
  for (const link of Array.from(nav.querySelectorAll(':scope > a[href]'))) {
    out.push(`${text(link)} -> ${link.getAttribute('href')}`);
  }
  const sections = Array.from(nav.querySelectorAll('[data-nav-menu]')).map(s => s.getAttribute('data-nav-menu') ?? '');
  for (const label of sections) {
    const button = nav.querySelector(`[data-nav-menu="${label}"] > button`) as HTMLElement;
    button.click();
    await v.settle();
    const panel = nav.querySelector(`[data-nav-menu="${label}"] [id^="nav-menu-"]`);
    for (const entry of Array.from(panel?.querySelectorAll('a[href]') ?? [])) {
      const parts = Array.from(entry.querySelectorAll('span.block')).map(el => text(el));
      out.push(`${label} › ${parts.join(' — ')} -> ${entry.getAttribute('href')}`);
    }
    button.click();
    await v.settle();
  }
  return out;
}

function buttonNamed(scope: ParentNode, name: string | RegExp): HTMLElement | null {
  const candidates = Array.from(scope.querySelectorAll('button, [role="menuitem"], [role="tab"], a')) as HTMLElement[];
  return candidates.find(el => {
    const n = nameOf(el);
    return typeof name === 'string' ? n === name || n.startsWith(name) : name.test(n);
  }) ?? null;
}

/**
 * Clicks the first button (or menu item, tab, link) whose accessible name is or starts with
 * `name`, in the page or in an open overlay, and answers what that asks for. Fails loudly when
 * there is no such control: a control that went missing is a changed screen.
 */
export async function click(v: Visit, name: string | RegExp): Promise<string[]> {
  const target = buttonNamed(document.querySelector('.cdk-overlay-container') ?? document.body, name)
    ?? buttonNamed(v.root, name);
  expect(target, `no control named ${String(name)}`).not.toBeNull();
  target!.click();
  return v.settle();
}

/** What an open menu or dialog (the CDK overlay) shows, with its menu items in order. */
export function overlay(): Omit<Surface, 'url' | 'requests'> & { items: string[] } {
  const container = (document.querySelector('.cdk-overlay-container') as HTMLElement | null) ?? document.createElement('div');
  return {
    ...surfaceOf(container),
    items: Array.from(container.querySelectorAll('[role="menuitem"]')).map(nameOf),
  };
}

/** Closes whatever overlay is open, so the next visit starts clean. */
export function closeOverlays(): void {
  document.querySelector('.cdk-overlay-container')?.replaceChildren();
}

const RECORD = !!(globalThis as any).process?.env?.['CHAR_RECORD'];

/**
 * Compares a surface with the pinned one. Recording (CHAR_RECORD=1) prints it for
 * scripts/record-characterisation.mjs instead, and passes.
 */
export function pin(file: string, name: string, actual: unknown, pinned: Record<string, unknown>): void {
  if (RECORD) {
    console.log(`@@CHAR@@${file}@@${name}@@${JSON.stringify(actual)}`);
    return;
  }
  expect(pinned[name], `${file}: "${name}" is not pinned yet (record it: see harness.ts)`).toBeDefined();
  expect(actual, `${file}: "${name}" changed`).toEqual(pinned[name]);
}

export function restoreClock(): void {
  closeOverlays();
  restoreZone();
  vi.useRealTimers();
  localStorage.removeItem('etl_auth_user');
}
