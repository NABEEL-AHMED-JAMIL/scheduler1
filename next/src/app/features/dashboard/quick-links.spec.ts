import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PageKey } from '../../core/auth/page-keys';
import { QUICK_PATHS, QuickLinks, quickEntries } from './quick-links';

function mount(opts: { admin?: boolean; platform?: boolean; pages?: PageKey[] | 'all' } = {}) {
  const pages = opts.pages ?? 'all';
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [QuickLinks],
    providers: [provideRouter([]), { provide: AuthService, useValue: {
      pageKeys: signal(pages === 'all' ? [] : pages),
      canOpen: (key: PageKey) => pages === 'all' || pages.includes(key),
      isTenantAdmin: () => !!opts.admin || !!opts.platform,
      isPlatformAdmin: () => !!opts.platform,
    } }],
  });
  const fixture = TestBed.createComponent(QuickLinks);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-quick]')).map(a => ({
    href: a.getAttribute('href'), label: a.querySelector('.font-medium')!.textContent!.trim(),
  }));
}

describe('Home: Go to (owner 2026-10-20)', () => {
  it('names each main part as the menu does, from the menu\'s own tree', () => {
    expect(quickEntries().map(e => e.path)).toEqual(QUICK_PATHS);
    expect(quickEntries().map(e => e.label)).toEqual(['Pipelines', 'Runs', 'Review', 'Documents', 'Forms', 'Reports', 'Dashboards', 'Developers']);
  });

  it('offers a workspace administrator every part, each opening its hub', () => {
    const links = mount({ admin: true });
    expect(links.map(l => l.label)).toEqual(['Pipelines', 'Runs', 'Review', 'Documents', 'Forms', 'Reports', 'Dashboards', 'Developers']);
    expect(links.find(l => l.label === 'Reports')!.href).toBe('/reports');
    expect(links.find(l => l.label === 'Forms')!.href).toBe('/forms');
  });

  it('offers a member only what their page access opens, as the menu does', () => {
    const links = mount({ pages: ['task-inbox', 'forms', 'report-library'] });
    expect(links.map(l => l.label)).toEqual(['Review', 'Forms', 'Reports']);
  });

  it('shows nothing to someone whose profile opens none of them', () => {
    expect(mount({ pages: [] })).toEqual([]);
  });
});
