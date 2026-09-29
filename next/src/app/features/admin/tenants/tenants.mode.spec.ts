import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';

function tenantsFor(confirm: boolean, put = vi.fn(() => of({ status: 'SUCCESS', message: 'Tenant "Acme" is now MANAGED.' }))) {
  const asked: any[] = [];
  const toasts: string[] = [];
  const get = vi.fn(() => of({ status: 'SUCCESS', data: [] }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { put, get } },
      { provide: Dialog, useValue: { open: (_: unknown, config: { data: unknown }) => { asked.push(config.data); return { closed: of(confirm) }; } } },
      { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m), info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: {} },
    ],
  });
  return { tenants: TestBed.runInInjectionContext(() => new Tenants()), put, get, asked, toasts };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('MIG-254: a workspace\'s management mode on the Tenants page', () => {
  it('names each mode, and reads a tenant with none as self-managed', () => {
    const { tenants } = tenantsFor(true);
    expect(tenants.modeLabel({ managementMode: 'MANAGED' } as any)).toBe('Managed');
    expect(tenants.modeLabel({ managementMode: 'SELF' } as any)).toBe('Self-managed');
    expect(tenants.modeLabel({} as any)).toBe('Self-managed');
  });

  it('switches to MANAGED after saying the workspace\'s people are signed out', async () => {
    const { tenants, put, get, asked, toasts } = tenantsFor(true);
    await tenants.switchMode({ tenantId: 7, tenantName: 'Acme', status: 'Active', managementMode: 'SELF' } as any);
    await settle();
    expect(asked[0].title).toBe('Make Acme managed by our team?');
    expect(asked[0].body).toContain('Everyone in Acme is signed out');
    expect(asked[0].confirmLabel).toBe('Switch and sign out');
    expect(put).toHaveBeenCalledWith(expect.stringContaining('/tenant.json/changeManagementMode'), { tenantId: 7, managementMode: 'MANAGED' });
    expect(toasts).toEqual(['Tenant "Acme" is now MANAGED.']);
    expect(get).toHaveBeenCalled();
  });

  it('switches back to SELF the same way', async () => {
    const { tenants, put, asked } = tenantsFor(true);
    await tenants.switchMode({ tenantId: 7, tenantName: 'Acme', status: 'Active', managementMode: 'MANAGED' } as any);
    await settle();
    expect(asked[0].title).toBe('Let Acme build its own workspace?');
    expect(put).toHaveBeenCalledWith(expect.anything(), { tenantId: 7, managementMode: 'SELF' });
  });

  it('changes nothing when the confirm is dismissed', async () => {
    const { tenants, put } = tenantsFor(false);
    await tenants.switchMode({ tenantId: 7, tenantName: 'Acme', status: 'Active', managementMode: 'SELF' } as any);
    await settle();
    expect(put).not.toHaveBeenCalled();
  });

  it('says what the server said when it refuses', async () => {
    const put = vi.fn(() => of({ status: 'ERROR', message: 'Tenant not found with 7.' }));
    const { tenants, toasts } = tenantsFor(true, put as any);
    await tenants.switchMode({ tenantId: 7, tenantName: 'Acme', status: 'Active', managementMode: 'SELF' } as any);
    await settle();
    expect(toasts).toEqual(['!Tenant not found with 7.']);
    expect(tenants.busy()).toBe(null);
  });
});
