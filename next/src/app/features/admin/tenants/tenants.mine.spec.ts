import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * UX review U2 (2026-10-13): Platform › Workspaces' "Only mine" keeps the workspaces the platform administrator created
 * and the ones they manage (an open managed-service grant, Identity's myWorkspaces) -- like every other list's.
 */
const ROWS = [
  { tenantId: 2960, tenantName: 'Riverside Health', tenantCode: 'riverside', status: 'Active', createdBy: 4639 },
  { tenantId: 2962, tenantName: 'Open Data Lab', tenantCode: 'odl', status: 'Active', createdBy: 4700 },
  { tenantId: 2970, tenantName: 'Meridian (sandbox)', tenantCode: 'meridian-sandbox', status: 'Active', createdBy: 4700 },
  { tenantId: 2900, tenantName: 'Default', tenantCode: 'default', status: 'Active', createdBy: null },
];

function screen(grants: unknown, platformAdmin = true) {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: (url: string) => {
        asked.push(url);
        if (url.endsWith('/tenant.json/listTenants')) return of({ status: 'SUCCESS', data: ROWS });
        if (url.endsWith('/managedService.json/myWorkspaces')) return grants instanceof Error ? throwError(() => grants) : of(grants);
        return of({ status: 'SUCCESS', data: [] });
      } } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal({ appUserId: 4639 }), isPlatformAdmin: () => platformAdmin } },
    ],
  });
  const tenants = TestBed.runInInjectionContext(() => new Tenants());
  tenants.ngOnInit();
  return { tenants, asked };
}

describe('Workspaces: Only mine', () => {
  it('keeps the workspaces I created and the ones I manage, and leaves out a revoked grant', () => {
    const { tenants } = screen({ status: 'SUCCESS', data: [
      { grantId: 4, tenantId: 2962, appUserId: 4639, revokedAt: null },
      { grantId: 3, tenantId: 2970, appUserId: 4639, revokedAt: '2026-10-08T00:00:00Z' },
    ] });
    expect(tenants.filtered()).toHaveLength(4);
    tenants.onlyMine.set(true);
    expect(tenants.filtered().map(t => t.tenantId).sort()).toEqual([2960, 2962]);
    expect(tenants.hasFilters()).toBe(true);
    tenants.clearFilters();
    expect(tenants.filtered()).toHaveLength(4);
  });

  it('falls back to what I created when the grants cannot be read, and asks for none for anyone but a platform administrator', () => {
    const { tenants } = screen(new Error('503'));
    tenants.onlyMine.set(true);
    expect(tenants.filtered().map(t => t.tenantId)).toEqual([2960]);
    const member = screen({ status: 'SUCCESS', data: [] }, false);
    expect(member.asked.some(url => url.endsWith('/managedService.json/myWorkspaces'))).toBe(false);
  });
});
