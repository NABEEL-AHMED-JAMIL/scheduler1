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
      '/ai/agents', '/analytics', '/analytics/dashboards', '/jobs', '/objects', '/queue',
      '/reports', '/tasks', '/tools/converter', '/tools/transcript',
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

    expect(paths).toContain('/jobs');
    expect(paths).toContain('/queue');
    expect(paths).not.toContain('/reports');
    expect(paths).not.toContain('/tools/converter');
    expect(restricted.nav().map(item => item.label)).not.toContain('Tools');
    expect(restricted.nav().map(item => item.label)).not.toContain('Assistants');
    // Dashboard is not a page a profile can take away.
    expect(restricted.nav().find(item => item.path === '/dashboard')).toBeDefined();
    localStorage.removeItem('etl_auth_user');
  });

  it('offers the saved-analysis library, which had a route and no way to reach it', () => {
    const saved = children().find(child => child.path === '/analytics/dashboards');
    expect(saved).toBeDefined();
    expect(saved?.label).toBe('Saved Analyses');
  });

  it('names an icon the icon set actually has', () => {
    // An unknown name renders nothing, which reads as a layout bug rather than a missing glyph.
    const saved = children().find(child => child.path === '/analytics/dashboards');
    expect(saved?.icon).toBe('save');
  });

  it('marks a parent route exact, so standing on the child does not light both', () => {
    const parent = children().find(child => child.path === '/analytics');
    expect(parent?.exact).toBe(true);
  });

  it('leaves a leaf route on prefix matching, so its own sub-pages keep it lit', () => {
    const saved = children().find(child => child.path === '/analytics/dashboards');
    expect(saved?.exact).toBe(false);
    // Not a special case for analytics: every entry with nothing beneath it stays prefix-matched.
    expect(children().find(child => child.path === '/objects')?.exact).toBe(false);
  });
});
