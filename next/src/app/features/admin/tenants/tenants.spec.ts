import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';

function tenantsFor(put: ReturnType<typeof vi.fn>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { put, get: () => of({ status: 'SUCCESS', data: [] }) } },
      // confirmWith resolves true as soon as the dialog "closes" -- toggleSuspend/deleteTenant
      // both await it before calling changeStatus.
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: {} },
    ],
  });
  return TestBed.runInInjectionContext(() => new Tenants());
}

const tenant = { tenantId: 1, tenantName: 'Acme', status: 'Active' } as any;

/**
 * Regression test: changeStatus() (backing both toggleSuspend and deleteTenant) never set the
 * `busy` signal its own kebab-menu trigger and card buttons are now gated on, so a fast
 * double-click could fire two concurrent PUT changeTenantStatus requests for the same tenant.
 */
describe('Tenants status-change guard', () => {
  it('sets busy to the tenant id while the status change is in flight, then clears it', async () => {
    const responses = new Subject<any>();
    const put = vi.fn(() => responses.asObservable());
    const tenants = tenantsFor(put);

    const pending = tenants.toggleSuspend(tenant);
    // Let the confirm-dialog microtask resolve before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(tenants.busy()).toBe(1);

    responses.next({ status: 'SUCCESS', message: 'ok' });
    await pending;
    expect(tenants.busy()).toBe(null);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('clears busy when the request errors, not just on success', async () => {
    const responses = new Subject<any>();
    const put = vi.fn(() => responses.asObservable());
    const tenants = tenantsFor(put);

    const pending = tenants.deleteTenant(tenant);
    await Promise.resolve();
    await Promise.resolve();
    expect(tenants.busy()).toBe(1);

    responses.error({ error: { message: 'boom' } });
    await pending;
    expect(tenants.busy()).toBe(null);
  });
});
