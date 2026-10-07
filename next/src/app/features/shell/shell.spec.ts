import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Shell } from './shell';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

/**
 * The menu, and the one thing about it that is invisible until a route nests.
 *
 * routerLinkActive prefix-matches by default, so the moment /analytics/dashboards was given a
 * menu entry, standing on it lit BOTH it and /analytics. The fix derives `exact` from the menu
 * rather than naming /analytics, and these tests are written against that derivation so a future
 * nested route is covered without anyone remembering this file exists.
 *
 * @author Nabeel Ahmed
 */
describe('shell navigation', () => {
  // AuthService reads a stored session in its field initialiser, so the shell cannot be built
  // without a real Storage.
  useMemoryStorage();

  let shell: Shell;

  beforeEach(() => {
    // ThemeService asks the OS for its colour preference. The test environment has no
    // matchMedia, and the shell cannot be constructed without it.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    shell = TestBed.createComponent(Shell).componentInstance;
  });

  const children = () =>
    shell.nav().flatMap(item => item.children ?? []);

  it('tags every page an access profile can withhold, and nothing a profile cannot', () => {
    const tagged = children().filter(child => child.pageKey).map(child => child.path).sort();
    expect(tagged).toEqual([
      '/ai/assistant', '/ai/prompts', '/ai/tools', '/data/analytics', '/data/analytics/dashboards', '/data/ask', '/data/catalog',
      '/documents/converter', '/documents/files', '/documents/inbox', '/documents/intelligence', '/documents/reports', '/documents/review',
      '/documents/transcript', '/forms/builder', '/forms/submissions', '/integration/api-collections',
      '/integration/connectors', '/integration/sources', '/pipelines', '/pipelines/executions', '/pipelines/queue', '/pipelines/run-analytics',
      '/pipelines/schedules', '/workflows/designer', '/workflows/inbox',
    ]);
    expect(children().find(child => child.path === '/dashboard')?.pageKey).toBeUndefined();
  });

  it('drops the pages a tenant user cannot open, and a whole section when none of it is left', () => {
    // A tenant user on an "Operator" profile: pipelines only. Stored before the shell is built,
    // because AuthService reads the session in its field initialiser.
    const claims = btoa(JSON.stringify({ sub: 'olivia@example.com', appUserId: 44, userRole: 'TENANT_USER' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem('etl_auth_user', JSON.stringify({
      username: 'olivia@example.com', userRole: 'TENANT_USER', appUserId: 44,
      accessToken: `header.${claims}.unsigned`, refreshToken: 'r', pageKeys: ['jobs', 'queue'],
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const restricted = TestBed.createComponent(Shell).componentInstance;
    const paths = restricted.nav().flatMap(item => item.children ?? []).map(child => child.path);

    expect(paths).toContain('/pipelines/schedules');
    expect(paths).toContain('/pipelines/queue');
    expect(paths).not.toContain('/pipelines/run-analytics');
    expect(paths).not.toContain('/documents/converter');
    expect(restricted.nav().map(item => item.label)).not.toContain('Documents');
    expect(restricted.nav().map(item => item.label)).not.toContain('AI');
    // Dashboard is not a page a profile can take away.
    expect(restricted.nav().find(item => item.path === '/dashboard')).toBeDefined();
    localStorage.removeItem('etl_auth_user');
  });

  it('offers the saved-analysis library, which had a route and no way to reach it', () => {
    const saved = children().find(child => child.path === '/data/analytics/dashboards');
    expect(saved).toBeDefined();
    expect(saved?.label).toBe('Saved Analyses');
  });

  it('names an icon the icon set actually has', () => {
    // An unknown name renders nothing, which reads as a layout bug rather than a missing glyph.
    const saved = children().find(child => child.path === '/data/analytics/dashboards');
    expect(saved?.icon).toBe('save');
  });

  it('marks a parent route exact, so standing on the child does not light both', () => {
    const parent = children().find(child => child.path === '/data/analytics');
    expect(parent?.exact).toBe(true);
  });

  it('leaves a leaf route on prefix matching, so its own sub-pages keep it lit', () => {
    const saved = children().find(child => child.path === '/data/analytics/dashboards');
    expect(saved?.exact).toBe(false);
    // Not a special case for analytics: every entry with nothing beneath it stays prefix-matched.
    expect(children().find(child => child.path === '/documents/files')?.exact).toBe(false);
  });

  /**
   * MIG-167: Lookups became typed screens. A tenant administrator gets the workspace's own;
   * Engine settings is the platform's and only a platform administrator is shown it.
   */
  it('lists the typed configuration screens, and Engine settings for a platform administrator only', () => {
    const configurationFor = (role: string) => {
      const claims = btoa(JSON.stringify({ sub: 'a@example.com', appUserId: 5, userRole: role }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('etl_auth_user', JSON.stringify({
        username: 'a@example.com', userRole: role, appUserId: 5,
        accessToken: `header.${claims}.unsigned`, refreshToken: 'r',
      }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
      const built = TestBed.createComponent(Shell).componentInstance;
      localStorage.removeItem('etl_auth_user');
      return (built.nav().find(item => item.label === 'Configuration')?.children ?? []).map(child => child.path);
    };

    const tenant = configurationFor('TENANT_ADMIN');
    expect(tenant).toEqual(expect.arrayContaining(['/configuration/values', '/configuration/home-pages', '/configuration/task-groups']));
    expect(tenant).not.toContain('/configuration/engine');
    expect(tenant).not.toContain('/configuration/lookup');

    expect(configurationFor('PLATFORM_ADMIN')).toContain('/configuration/engine');
  });

  /** Build the shell as a rendered component so keyboard focus can be checked. */
  async function rendered(role?: string) {
    if (role) {
      const claims = btoa(JSON.stringify({ sub: 'a@example.com', appUserId: 5, userRole: role }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('etl_auth_user', JSON.stringify({
        username: 'a@example.com', userRole: role, appUserId: 5,
        accessToken: `header.${claims}.unsigned`, refreshToken: 'r',
      }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
    }
    const fixture = TestBed.createComponent(Shell);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, shell: fixture.componentInstance, el };
  }

  const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  describe('header menus and the keyboard', () => {
    it('puts focus back on the trigger when Escape closes a menu', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('Pipelines');
      await fixture.whenStable();
      const menu = el.querySelector<HTMLElement>('[data-nav-menu="Pipelines"]')!;
      const link = menu.querySelector<HTMLElement>('a')!;
      link.focus();
      expect(document.activeElement).toBe(link);

      escape();
      await fixture.whenStable();

      expect(s.openMenu()).toBeNull();
      expect(document.activeElement).toBe(menu.querySelector(':scope > button'));
    });

    it('does not move focus on Escape when no menu is open', async () => {
      const { fixture, el } = await rendered();
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      outside.focus();
      escape();
      await fixture.whenStable();
      expect(document.activeElement).toBe(outside);
      outside.remove();
      expect(el).toBeTruthy();
    });

    it('closes a menu when focus tabs out of it, and keeps it open while focus moves inside', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('Pipelines');
      await fixture.whenStable();
      const menu = el.querySelector<HTMLElement>('[data-nav-menu="Pipelines"]')!;
      const [first, second] = Array.from(menu.querySelectorAll<HTMLElement>('a'));

      first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: second }));
      expect(s.openMenu()).toBe('Pipelines');

      const outside = el.querySelector<HTMLElement>('main')!;
      second.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
      expect(s.openMenu()).toBeNull();
    });

    it('describes the panels as disclosures: expanded and controls, not a menu popup', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('Documents');
      await fixture.whenStable();
      expect(el.querySelector('[aria-haspopup]')).toBeNull();
      const trigger = el.querySelector<HTMLElement>('[data-nav-menu="Documents"] > button')!;
      const panel = el.querySelector<HTMLElement>('#' + trigger.getAttribute('aria-controls'));
      expect(panel).not.toBeNull();
      expect(panel!.querySelector('a[href="/documents/files"]')).not.toBeNull();
    });

    it('marks an entry whose page is not built yet as coming, and only those', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('Data');
      await fixture.whenStable();
      // Every Data entry is marked exactly when its page is not built; Ask your data is built (Wave 5).
      const data = s.nav().find(item => item.label === 'Data')!.children ?? [];
      expect(data.find(c => c.path === '/data/ask')?.soon).toBeFalsy();
      for (const entry of data) {
        const link = el.querySelector<HTMLElement>(`[data-nav-menu="Data"] a[href="${entry.path}"]`)!;
        if (entry.soon) expect(link.querySelector('.pill')?.textContent?.trim(), entry.path).toBe('Soon');
        else expect(link.querySelector('.pill'), entry.path).toBeNull();
      }
    });

    it('offers a skip link to the main content', async () => {
      const { el } = await rendered();
      const skip = el.querySelector<HTMLAnchorElement>('a[href="#main"]');
      expect(skip?.textContent).toContain('Skip to content');
      expect(el.querySelector('main')?.id).toBe('main');
      expect(el.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
    });

    it('closes an open header menu when the bell is clicked, instead of stacking the two', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('__user');
      await fixture.whenStable();
      const bell = el.querySelector<HTMLElement>('[data-nav-menu="__bell"] button')!;
      bell.click();
      await fixture.whenStable();
      expect(s.openMenu()).toBeNull();
    });

    it('keeps the menu open when a click lands inside it', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('__user');
      await fixture.whenStable();
      el.querySelector<HTMLElement>('[data-nav-menu="__user"] .border-b')!.click();
      expect(s.openMenu()).toBe('__user');
    });
  });

  describe('account menu', () => {
    it('names the role as the rest of the app does', async () => {
      const { fixture, shell: s, el } = await rendered('TENANT_ADMIN');
      s.toggleMenu('__user');
      await fixture.whenStable();
      expect(el.querySelector('[data-nav-menu="__user"]')!.textContent).toContain('Tenant administrator');
      localStorage.removeItem('etl_auth_user');
    });

    it('links to the setup guide', async () => {
      const { fixture, shell: s, el } = await rendered();
      s.toggleMenu('__user');
      await fixture.whenStable();
      expect(el.querySelector('[data-nav-menu="__user"] a[href="/docs"]')).not.toBeNull();
    });

    // MIG-246: eleven menus fit beside the wordmark from 2xl; below it the header keeps the "E" mark alone and the
    // menus sit tighter, so the page never scrolls sideways. Review 2026-10-07: the menu shows from 1180px rather than
    // xl, so the owner's 1187px window has it on the bar instead of behind the menu button.
    it('keeps the header on one line from 1180px to 2xl: the mark without its wordmark, tighter menus', async () => {
      const { el } = await rendered();
      const wordmark = el.querySelector<HTMLElement>('header app-brand-mark span')!;
      expect(wordmark.className).toContain('min-[1180px]:hidden');
      expect(wordmark.className).toContain('2xl:block');
      expect(el.querySelector<HTMLElement>('header nav')!.className).toContain('min-[1180px]:flex');
      expect(el.querySelector<HTMLElement>('header button[aria-label="Menu"]')!.className).toContain('min-[1180px]:hidden');
      const trigger = el.querySelector<HTMLElement>('header nav [data-nav-menu="Pipelines"] > button')!;
      expect(trigger.className).toContain('px-1');
      expect(trigger.className).toContain('xl:px-2');
      expect(trigger.className).toContain('2xl:px-2.5');
    });

    it('caps the name beside the avatar so a long one cannot widen the page, and keeps it in a tooltip', async () => {
      const { el } = await rendered();
      const name = el.querySelector<HTMLElement>('[data-nav-menu="__user"] > button span.truncate');
      expect(name).not.toBeNull();
      expect(name!.className).toContain('max-w-36');
      expect(name!.className).toContain('min-[1180px]:hidden');
      expect(name!.className).toContain('2xl:block');
      expect(name!.hasAttribute('title')).toBe(true);
    });
  });
});
