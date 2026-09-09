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
