import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { useMemoryStorage } from '../../shared/testing/memory-storage';
import { routes } from '../../app.routes';
import { DEV_ROUTES } from '../../app.config';
import { GALLERY_STATUSES, Gallery } from './gallery';

describe('the component gallery (MIG-257)', () => {
  useMemoryStorage();
  // ThemeService asks the OS for its colour preference; the test environment has no matchMedia. Stubbed here, not
  // inherited from whichever spec ran before (on 2026-09-30 a different run order left it undefined here).
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function render() {
    TestBed.configureTestingModule({ imports: [Gallery], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Gallery);
    fixture.detectChanges();
    return fixture;
  }

  it('shows every section: top bar, menus, buttons, inputs, tabs, pills, KPIs, cards, table, states, dialogs, charts', () => {
    const el = render().nativeElement as HTMLElement;
    const sections = [...el.querySelectorAll('[data-gallery]')].map(s => s.getAttribute('data-gallery'));
    expect(sections).toEqual(['top-bar', 'page-head', 'menus', 'buttons', 'inputs', 'tabs', 'pills', 'kpi', 'cards', 'table',
      'states', 'dialogs', 'charts']);
  });

  it('draws a pill for every job status and Active, Inactive and Pending', () => {
    const el = render().nativeElement as HTMLElement;
    const pills = [...el.querySelectorAll('[data-gallery="pills"] .pill')].map(p => p.textContent!.trim());
    for (const status of GALLERY_STATUSES) expect(pills).toContain(status);
  });

  it('draws every dashboard widget', () => {
    const el = render().nativeElement as HTMLElement;
    for (const widget of ['app-donut', 'app-bar-chart', 'app-line-chart', 'app-heatmap', 'app-ranked-bar', 'app-grouped-bar',
      'app-split-bar', 'app-histogram', 'app-scatter-plot', 'app-kpi-card']) {
      expect(el.querySelector(`[data-gallery="charts"] ${widget}`), widget).not.toBeNull();
    }
  });

  it('switches the theme from the query string', () => {
    const fixture = render();
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fixture.componentRef.setInput('theme', 'light');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('is a development-build route only, outside the pinned production routes and every menu', () => {
    expect(DEV_ROUTES.map(r => r.path)).toEqual(['dev/gallery']);
    const all = JSON.stringify(routes, (_k, v) => (typeof v === 'function' ? String(v) : v));
    expect(all).not.toContain('gallery');
    expect(all).not.toContain('dev/');
  });
});
