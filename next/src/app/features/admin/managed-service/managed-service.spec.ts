import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ManagedService } from './managed-service';
import { GrantDialog } from './grant-dialog';
import { ManagedServiceApi, staffOf } from './managed-service.api';
import { ToastService } from '../../../shared/ui/toast.service';

const GRANTS = [
  { grantId: 11, tenantId: 2924, tenantName: 'Claude Demo', managementMode: 'MANAGED', appUserId: 5001, fullName: 'Sam Staff',
    username: 'sam@platform.local', grantedAt: '2026-09-28 10:00:00', revokedAt: null },
  { grantId: 10, tenantId: 3001, tenantName: 'Beta', managementMode: 'SELF', appUserId: 5001, fullName: 'Sam Staff',
    username: 'sam@platform.local', grantedAt: '2026-09-20 10:00:00', revokedAt: '2026-09-21 09:00:00' },
];
const USERS = [
  { appUserId: 5001, username: 'sam@platform.local', fullName: 'Sam Staff', userRole: 'PLATFORM_ADMIN', status: 'Active', tenantId: null },
  { appUserId: 5002, username: 'old@platform.local', fullName: 'Old Staff', userRole: 'PLATFORM_ADMIN', status: 'Inactive', tenantId: null },
  { appUserId: 4537, username: 'admin@demo', fullName: 'Ada Admin', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 2924 },
];
const TENANTS = [
  { tenantId: 2924, tenantName: 'Claude Demo', status: 'Active', managementMode: 'MANAGED' },
  { tenantId: 3001, tenantName: 'Beta', status: 'Active', managementMode: 'SELF' },
  { tenantId: 3002, tenantName: 'Gone', status: 'Delete' },
];

function setup(confirm = true) {
  const api = {
    listGrants: vi.fn(() => of({ status: 'SUCCESS', message: '', data: GRANTS })),
    users: vi.fn(() => of({ status: 'SUCCESS', message: '', data: USERS })),
    revoke: vi.fn(() => of({ status: 'SUCCESS', message: 'Revoked. The staff member signs in again.' })),
    grant: vi.fn(() => of({ status: 'SUCCESS', message: 'Granted.' })),
  };
  const asked: any[] = [];
  const opened: any[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    provideRouter([]),
    { provide: ManagedServiceApi, useValue: api },
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: TENANTS }) } },
    { provide: Dialog, useValue: { open: (component: unknown, config: { data: any }) => {
      if (component === GrantDialog) { opened.push(config.data); return { closed: of(true) }; }
      asked.push(config.data); return { closed: of(confirm) };
    } } },
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m) } },
  ] });
  const fixture = TestBed.createComponent(ManagedService);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api, asked, opened, toasts };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('MIG-254: Administration › Managed service', () => {
  it('staff are the active platform administrators of no workspace', () => {
    expect(staffOf(USERS as any).map(u => u.appUserId)).toEqual([5001]);
  });

  it('lists the live grants, and the workspaces and staff to filter by', () => {
    const { fixture, page, api } = setup();
    expect(api.listGrants).toHaveBeenCalledWith({ tenantId: null, appUserId: null, includeRevoked: false });
    expect(page.staff().map(s => s.appUserId)).toEqual([5001]);
    expect(page.tenants().map(t => t.tenantId)).toEqual([3001, 2924]); // by name
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Sam Staff');
    expect(text).toContain('Claude Demo');
  });

  it('asks the server again when a filter changes', () => {
    const { page, api } = setup();
    page.setTenant('2924');
    page.setStaff('5001');
    page.setIncludeRevoked(true);
    expect(api.listGrants).toHaveBeenLastCalledWith({ tenantId: 2924, appUserId: 5001, includeRevoked: true });
  });

  it('revokes after warning that the staff member is signed out everywhere', async () => {
    const { page, api, asked, toasts } = setup();
    await page.revoke(GRANTS[0] as any);
    await settle();
    expect(asked[0].title).toBe('Revoke Sam Staff in Claude Demo?');
    expect(asked[0].body).toContain('signed out everywhere');
    expect(api.revoke).toHaveBeenCalledWith(2924, 5001);
    expect(toasts).toEqual(['Revoked. The staff member signs in again.']);
  });

  it('does nothing when the revoke is dismissed', async () => {
    const { page, api } = setup(false);
    await page.revoke(GRANTS[0] as any);
    await settle();
    expect(api.revoke).not.toHaveBeenCalled();
  });

  it('offers only a live grant for revoking', () => {
    const { page } = setup();
    expect(page.isLive(GRANTS[0] as any)).toBe(true);
    expect(page.isLive(GRANTS[1] as any)).toBe(false);
  });

  it('opens the grant dialog with the staff and the workspaces, and reloads after it', () => {
    const { page, api, opened } = setup();
    page.setTenant('3001');
    const before = api.listGrants.mock.calls.length;
    page.openGrant();
    expect(opened[0].staff.map((s: any) => s.appUserId)).toEqual([5001]);
    expect(opened[0].tenants.map((t: any) => t.tenantId)).toEqual([3001, 2924]);
    expect(opened[0].tenantId).toBe(3001);
    expect(api.listGrants.mock.calls.length).toBe(before + 1);
  });
});

describe('MIG-254: the grant dialog', () => {
  function dialog(grant = vi.fn(() => of({ status: 'SUCCESS', message: 'Granted.' }))) {
    const closed: unknown[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: ManagedServiceApi, useValue: { grant } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: DialogRef, useValue: { close: (v: unknown) => closed.push(v) } },
      { provide: DIALOG_DATA,
        useValue: { staff: staffOf(USERS as any), tenants: TENANTS.slice(0, 2), tenantId: null, appUserId: null } },
    ] });
    const fixture = TestBed.createComponent(GrantDialog);
    fixture.detectChanges();
    return { d: fixture.componentInstance, grant, closed };
  }

  it('needs both a staff member and a workspace', () => {
    const { d, grant } = dialog();
    d.save();
    expect(grant).not.toHaveBeenCalled();
    expect(d.ready()).toBe(false);
  });

  it('grants the pair picked, and closes', () => {
    const { d, grant, closed } = dialog();
    d.appUserId.set(5001);
    d.tenantId.set(3001);
    d.save();
    expect(grant).toHaveBeenCalledWith(3001, 5001);
    expect(closed).toEqual([true]);
  });

  it('keeps the dialog open with the server\'s reason when it refuses', () => {
    const { d, closed } = dialog(vi.fn(() => of({ status: 'ERROR', message: 'Only an active platform user can be granted a workspace.' })));
    d.appUserId.set(5001);
    d.tenantId.set(3001);
    d.save();
    expect(closed).toEqual([]);
    expect(d.error()).toBe('Only an active platform user can be granted a workspace.');
  });
});
