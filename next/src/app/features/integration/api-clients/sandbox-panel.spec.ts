import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { SandboxPanel } from './sandbox-panel';
import { ApiClientsApi } from './api-clients.api';
import { ClientDialog } from './client-dialog';
import { SecretDialog } from './secret-dialog';
import { ToastService } from '../../../shared/ui/toast.service';

const SANDBOX = { tenantId: 2950, name: 'Northwind (sandbox)', code: 'NWSBX', status: 'Active', createdAt: '2026-10-06T09:00:00' };
const KEYS = [
  { clientId: 'cl_test_portal0000000000000', name: 'Portal test', scopes: ['runs:read'], ipAllowlist: [], expiresAt: null, status: 'Active',
    createdBy: 4602, createdAt: '2026-10-06T09:00:00', updatedAt: null, secretRotatedAt: null, revokedAt: null, lastUsedAt: null, lastUsedIp: null },
];
const MADE = { ...KEYS[0], clientId: 'cl_test_new000000000000000000', clientSecret: 'cs_test-shown-once' };
const SCOPES = [{ scope: 'runs:read', description: 'Read runs.' }];

function setup(answer: { sandbox?: unknown; fails?: boolean; confirm?: boolean } = {}) {
  const api = {
    sandbox: vi.fn(() => answer.fails
      ? throwError(() => ({ error: { message: 'Identity is not answering.' } }))
      : of({ status: 'SUCCESS', message: '', data: 'sandbox' in answer ? answer.sandbox : SANDBOX })),
    sandboxList: vi.fn(() => of({ status: 'SUCCESS', message: '', data: KEYS })),
    rotateSecret: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MADE })),
    revoke: vi.fn(() => of({ status: 'SUCCESS', message: 'Test key revoked.' })),
  };
  const opened: { component: unknown; data: any }[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    provideRouter([]),
    { provide: ApiClientsApi, useValue: api },
    { provide: Dialog, useValue: { open: (component: unknown, config: { data: any }) => {
      opened.push({ component, data: config.data });
      if (component === ClientDialog) return { closed: of({ made: MADE }) };
      if (component === SecretDialog) return { closed: of(undefined) };
      return { closed: of(answer.confirm ?? true) };
    } } },
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m) } },
  ] });
  const fixture = TestBed.createComponent(SandboxPanel);
  fixture.componentRef.setInput('scopes', SCOPES);
  fixture.detectChanges();
  return { fixture, panel: fixture.componentInstance, api, opened, toasts, el: fixture.nativeElement as HTMLElement };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('MIG-336: API Clients › Sandbox', () => {
  it('without a sandbox, says our team makes one on request and asks for no keys', () => {
    const { el, api } = setup({ sandbox: null });
    expect(el.querySelector('#sandbox')).not.toBeNull();
    expect(el.querySelector('[data-no-sandbox]')!.textContent).toContain('No sandbox yet. Our team makes one for your workspace on request');
    expect(el.textContent).toContain('cl_test_');
    expect(api.sandboxList).not.toHaveBeenCalled();
    expect(el.querySelector('[data-new-test-key]')).toBeNull();
  });

  it('with one, lists its test keys marked Test, and links to the quickstart', () => {
    const { el, api } = setup();
    expect(api.sandboxList).toHaveBeenCalled();
    expect(el.textContent).toContain('Northwind (sandbox)');
    expect(el.textContent).toContain('workspace 2950');
    const table = el.querySelector('[data-sandbox-clients]')!;
    expect(table.textContent).toContain('Portal test');
    expect(table.textContent).toContain('cl_test_portal0000000000000');
    expect(table.textContent).toContain('Test');
    expect(el.querySelector('a[href="/integration/developer/guides/quickstart"]')).not.toBeNull();
  });

  it('makes a test key through the client dialog with sandbox set, and shows its secret once', () => {
    const { panel, opened } = setup();
    panel.openNew();
    expect(opened[0].component).toBe(ClientDialog);
    expect(opened[0].data).toMatchObject({ sandbox: true, scopes: SCOPES });
    expect(opened[1].component).toBe(SecretDialog);
    expect(opened[1].data).toEqual({ name: 'Portal test', clientId: MADE.clientId, clientSecret: 'cs_test-shown-once', rotated: false });
  });

  it('rotates and revokes in the sandbox, each after a confirmation', async () => {
    const { panel, api, opened, toasts } = setup();
    await panel.rotate(KEYS[0] as any);
    await settle();
    expect(api.rotateSecret).toHaveBeenCalledWith(KEYS[0].clientId, true);
    expect(opened.find(o => o.component === SecretDialog)!.data.rotated).toBe(true);
    await panel.revoke(KEYS[0] as any);
    await settle();
    expect(api.revoke).toHaveBeenCalledWith(KEYS[0].clientId, true);
    expect(toasts).toContain('Test key revoked.');
  });

  it('does nothing when a confirmation is declined', async () => {
    const { panel, api } = setup({ confirm: false });
    await panel.rotate(KEYS[0] as any);
    await panel.revoke(KEYS[0] as any);
    expect(api.rotateSecret).not.toHaveBeenCalled();
    expect(api.revoke).not.toHaveBeenCalled();
  });

  it('says so, and offers a retry, when the sandbox cannot be read', () => {
    const { el } = setup({ fails: true });
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Identity is not answering.');
    expect(el.textContent).toContain('Try again');
  });
});
