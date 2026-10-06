import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ApiClients } from './api-clients';
import { ApiClientsApi } from './api-clients.api';
import { ClientDialog, dayOf } from './client-dialog';
import { SecretDialog } from './secret-dialog';
import { RouteDialog } from './route-dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';

const CLIENTS = [
  { clientId: 'cl_portal000000000000000000', name: 'Order portal', scopes: ['pipelines:read', 'runs:write'], ipAllowlist: ['203.0.113.0/24'],
    expiresAt: '2026-12-31T23:59:59', status: 'Active', createdBy: 4602, createdAt: '2026-10-06T09:00:00', updatedAt: null,
    secretRotatedAt: null, revokedAt: null, lastUsedAt: '2026-10-06T09:20:00', lastUsedIp: '203.0.113.5' },
  { clientId: 'cl_old0000000000000000000000', name: 'Old sync', scopes: ['events:write'], ipAllowlist: [], expiresAt: null,
    status: 'Revoked', createdBy: 4602, createdAt: '2026-10-01T09:00:00', updatedAt: null, secretRotatedAt: null,
    revokedAt: '2026-10-02T09:00:00', lastUsedAt: null, lastUsedIp: null },
];
const SCOPES = [{ scope: 'pipelines:read', description: 'Read pipelines.' }, { scope: 'runs:write', description: 'Start and retry runs.' }];
const ROUTES = [{ routeId: 1000, eventType: 'order.received', targetKind: 'PIPELINE', jobId: 42, pipelineName: 'Orders', workflowKey: null,
  contractId: null, contractName: 'orders', contractVersion: null, active: true, dateCreated: '2026-10-06T09:00:00', dateUpdated: null }];
const MADE = { ...CLIENTS[0], clientId: 'cl_new0000000000000000000000', clientSecret: 'cs_the-secret-shown-once' };

function setup(options: { confirm?: boolean; locked?: boolean } = {}) {
  const api = {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: CLIENTS })),
    scopes: vi.fn(() => of({ status: 'SUCCESS', message: '', data: SCOPES })),
    routesList: vi.fn(() => of({ status: 'SUCCESS', message: '', data: ROUTES })),
    routeTargets: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { pipelines: [{ jobId: 42, name: 'Orders' }] } })),
    revoke: vi.fn(() => of({ status: 'SUCCESS', message: 'API client revoked. Its tokens no longer work.' })),
    rotateSecret: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MADE })),
    deleteRoute: vi.fn(() => of({ status: 'SUCCESS', message: 'Event route removed.' })),
  };
  const opened: { component: unknown; data: any }[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    provideRouter([]),
    { provide: ApiClientsApi, useValue: api },
    { provide: AuthService, useValue: { canBuild: signal(!options.locked), builderLocked: signal(!!options.locked) } },
    { provide: Dialog, useValue: { open: (component: unknown, config: { data: any }) => {
      opened.push({ component, data: config.data });
      if (component === ClientDialog) return { closed: of({ made: MADE }) };
      if (component === SecretDialog || component === RouteDialog) return { closed: of(undefined) };
      return { closed: of(options.confirm ?? true) };
    } } },
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m) } },
  ] });
  const fixture = TestBed.createComponent(ApiClients);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api, opened, toasts };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('MIG-332: Integration › API Clients', () => {
  it('lists the live clients with their scopes and allowlist, revoked ones on request, and the event routes', () => {
    const { fixture, page } = setup();
    const el = fixture.nativeElement as HTMLElement;
    const table = el.querySelector('[data-api-clients]')!.textContent ?? '';
    expect(table).toContain('Order portal');
    expect(table).toContain('runs:write');
    expect(table).toContain('203.0.113.0/24');
    expect(table).not.toContain('Old sync');
    page.showRevoked.set(true);
    fixture.detectChanges();
    expect(el.querySelector('[data-api-clients]')!.textContent).toContain('Old sync');
    const routes = el.querySelector('[data-event-routes]')!.textContent ?? '';
    expect(routes).toContain('order.received');
    expect(routes).toContain('Orders');
    expect(el.textContent).not.toContain('cs_');
  });

  it('a new client\'s secret is shown once, in its own dialog', () => {
    const { page, opened } = setup();
    page.openNew();
    expect(opened[0].component).toBe(ClientDialog);
    expect(opened[0].data.scopes).toEqual(SCOPES);
    expect(opened[1].component).toBe(SecretDialog);
    expect(opened[1].data).toEqual({ name: 'Order portal', clientId: MADE.clientId, clientSecret: 'cs_the-secret-shown-once', rotated: false });
  });

  it('a new secret is asked for first, then shown once; a revoke is asked for first', async () => {
    const { page, api, opened, toasts } = setup();
    await page.rotate(CLIENTS[0] as any);
    await settle();
    expect(api.rotateSecret).toHaveBeenCalledWith(CLIENTS[0].clientId);
    expect(opened.find(o => o.component === SecretDialog)!.data.rotated).toBe(true);
    await page.revoke(CLIENTS[0] as any);
    await settle();
    expect(api.revoke).toHaveBeenCalledWith(CLIENTS[0].clientId);
    expect(toasts).toContain('API client revoked. Its tokens no longer work.');
  });

  it('nothing happens when the confirmation is declined', async () => {
    const { page, api } = setup({ confirm: false });
    await page.revoke(CLIENTS[0] as any);
    await page.rotate(CLIENTS[0] as any);
    await page.removeRoute(ROUTES[0] as any);
    expect(api.revoke).not.toHaveBeenCalled();
    expect(api.rotateSecret).not.toHaveBeenCalled();
    expect(api.deleteRoute).not.toHaveBeenCalled();
  });

  it('in a MANAGED workspace the event routes are read-only and say who sets them', () => {
    const { fixture } = setup({ locked: true });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('New event route');
    expect(el.querySelector('[data-event-routes]')!.textContent).not.toContain('Remove');
    expect(el.textContent).toContain('New API client');
  });

  it('a last day is the server\'s own wall-clock day', () => {
    expect(dayOf('2026-12-31T23:59:59')).toBe('2026-12-31');
    expect(dayOf(null)).toBe('');
  });
});

describe('MIG-332: the secret dialog', () => {
  it('says the secret is not shown again, and copies it', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { name: 'Order portal', clientId: 'cl_x', clientSecret: 'cs_y', rotated: false } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(SecretDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-secret-shown]')!.textContent).toContain('it is not shown again');
    expect((el.querySelector('input[aria-label="Client secret"]') as HTMLInputElement).value).toBe('cs_y');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
    await fixture.componentInstance.copy('cs_y', 'secret');
    expect(fixture.componentInstance.copied()).toBe('secret');
  });
});
