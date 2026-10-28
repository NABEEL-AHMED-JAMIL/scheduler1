import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkspaceAppearance } from './workspace-appearance';

/**
 * Owner #4 (2026-10-19): Administration › Appearance on the shared parts -- the page header (with the one workspace selector
 * for a platform administrator), one section with its title and state, the themes on the chooser's grid, and the actions in
 * the section's footer with the primary rightmost.
 */
function render(platform: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkspaceAppearance],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { isPlatformAdmin: () => platform, isManagedSession: () => false, user: () => ({ tenantId: 2960 }),
        patchUser: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }],
  });
  const fixture = TestBed.createComponent(WorkspaceAppearance);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), page: fixture.componentInstance };
}

describe('Administration › Appearance (owner #4)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('a workspace administrator reads their own default and saves from the footer, the primary rightmost', () => {
    const { el, http, fixture, page } = render(false);
    http.expectOne(r => r.url.endsWith('/tenant.json/appearance')).flush({ status: API_SUCCESS, data: { tenantId: 2960, defaultTheme: 'contrast' } });
    fixture.detectChanges();
    const section = el.querySelector('[data-test="workspace-theme-card"]')!;
    expect(section.querySelector('.section-title')!.textContent!.trim()).toBe('Default theme');
    expect(section.querySelector('.section-sub')!.textContent).toContain('Now: High contrast.');
    const actions = el.querySelector('[data-test="appearance-actions"]')!;
    expect(actions.classList).toContain('form-actions');
    page.draft.set('dark');
    fixture.detectChanges();
    const buttons = [...actions.querySelectorAll('button')];
    expect(buttons.map(b => b.textContent!.trim())).toEqual(['Undo', 'Save default']);
    expect(buttons.at(-1)!.classList).toContain('btn-primary');
    expect(el.querySelector('[data-test="workspace-select"]')).toBeNull();
  });

  it('a platform administrator reads nothing until a workspace is picked in the header, then that one', () => {
    const { el, http, fixture, page } = render(true);
    http.expectNone(r => r.url.endsWith('/tenant.json/appearance'));
    expect(el.querySelector('[data-test="pick-workspace"]')).not.toBeNull();
    expect(el.querySelector('app-page-header app-workspace-select')).not.toBeNull();
    page.pickWorkspace(2961);
    http.expectOne(r => r.url.endsWith('/tenant.json/appearance?tenantId=2961')).flush({ status: API_SUCCESS, data: { tenantId: 2961, defaultTheme: null } });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="workspace-theme-card"]')).not.toBeNull();
  });

  it('is loading, not "Now: no default", until the value answers; a failed read says so with Try again (owner 2026-10-27)', () => {
    const { el, http, fixture, page } = render(false);
    expect(page.loading()).toBe(true);
    expect(page.loaded()).toBe(false);
    expect(el.querySelector('[data-test="workspace-theme-card"]')).toBeNull();
    http.expectOne(r => r.url.endsWith('/tenant.json/appearance')).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(page.loading()).toBe(false);
    expect(page.error()).toBe('Could not read the workspace’s appearance.');
    expect(el.textContent).toContain('Try again');
    page.load();
    http.expectOne(r => r.url.endsWith('/tenant.json/appearance')).flush({ status: API_SUCCESS, data: { tenantId: 2960, defaultTheme: null } });
    fixture.detectChanges();
    expect(page.error()).toBe('');
    expect(el.querySelector('[data-test="workspace-theme-card"]')).not.toBeNull();
  });
});
