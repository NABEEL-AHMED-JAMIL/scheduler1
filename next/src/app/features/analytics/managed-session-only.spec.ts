import { describe, it, expect, vi } from 'vitest';
import { Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { StorageService } from '../objects/storage.service';
import { Analytics } from './analytics';
import { AnalyticsService } from './analytics.service';
import { Dashboards } from './dashboard';
import { Catalog } from '../catalog/catalog';
import { CatalogApi } from '../catalog/catalog.api';

/**
 * ZT-A12 (owner 2026-10-21, "Managed session only"): Analytics answers a platform administrator's own sign-in (PLATFORM_ADMIN,
 * no workspace) 403 on a workspace's data, so Analytics Studio, Dashboards and the Data Catalog say "… a workspace's, and this
 * sign-in has none" with the way to "Work in this workspace", and call nothing -- no red error, no 403 in the console log.
 * A managed session (a workspace's token) and the workspace's own people read as before.
 */
function auth(tenantId: number | null, role: 'PLATFORM_ADMIN' | 'TENANT_ADMIN') {
  return {
    user: signal({ appUserId: 4639, tenantId }),
    isPlatformAdmin: () => role === 'PLATFORM_ADMIN',
    isTenantAdmin: () => true,
    isManagedSession: () => tenantId !== null && role === 'TENANT_ADMIN',
    canEditDashboards: () => true,
    canOpen: () => true,
    hasAtLeast: () => true,
  };
}

function spies() {
  const answer = () => of({ status: 'SUCCESS', message: '', data: [] });
  return {
    storage: { buckets: vi.fn(answer), listObjects: vi.fn(answer) },
    analytics: new Proxy({} as Record<string, unknown>, { get: (target, name) => (target[name as string] ??= vi.fn(answer)) }),
    catalog: { list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [], paging: { page: 0, size: 50, total: 0 } })),
      summary: vi.fn(() => of({ status: 'SUCCESS', message: '', data: null })) },
  };
}

function render<T>(component: Type<T>, who: ReturnType<typeof auth>) {
  const s = spies();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthService, useValue: who },
      { provide: StorageService, useValue: s.storage }, { provide: AnalyticsService, useValue: s.analytics },
      { provide: CatalogApi, useValue: s.catalog }, { provide: Dialog, useValue: { open: vi.fn() } }],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const calls = () => s.storage.buckets.mock.calls.length + s.catalog.list.mock.calls.length + s.catalog.summary.mock.calls.length
    + Object.values(s.analytics).reduce((n: number, f) => n + (f as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  return { el: fixture.nativeElement as HTMLElement, calls };
}

describe('ZT-A12: a workspace\'s analytics are a managed session\'s only', () => {
  const own = () => auth(null, 'PLATFORM_ADMIN');

  it('Analytics Studio says so to a platform administrator\'s own sign-in and reads nothing', () => {
    const { el, calls } = render(Analytics, own());
    expect(el.querySelector('[data-test="needs-workspace"]')?.textContent).toContain('a workspace\'s, and this sign-in has none.');
    expect(el.textContent).toContain('Work in this workspace');
    expect(calls()).toBe(0);
  });

  it('Dashboards say so and list no board', () => {
    const { el, calls } = render(Dashboards, own());
    expect(el.textContent).toContain('Dashboards are a workspace\'s, and this sign-in has none.');
    expect(calls()).toBe(0);
  });

  it('the Data Catalog says so and reads neither its list nor its counts', () => {
    const { el, calls } = render(Catalog, own());
    expect(el.textContent).toContain('The catalog is a workspace\'s, and this sign-in has none.');
    expect(el.querySelector('app-refresh-button')).toBeNull();
    expect(calls()).toBe(0);
  });

  it('a managed session, a workspace\'s token, reads as before', () => {
    const managed = auth(2962, 'TENANT_ADMIN');
    for (const page of [Analytics, Dashboards, Catalog] as Type<unknown>[]) {
      const { el, calls } = render(page, managed);
      expect(el.querySelector('[data-test="needs-workspace"]')).toBeNull();
      expect(calls()).toBeGreaterThan(0);
    }
  });
});
