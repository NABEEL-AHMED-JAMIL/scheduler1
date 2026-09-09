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

/**
 * The pipeline count sits under the task count rather than in a column of its own, and it is
 * only drawn when it says something the task count did not.
 *
 * The distinction it exists to make: the demo workspace has 19 tasks across 15 pipelines, so
 * four pipelines carry two tasks each. Nothing else on the screen separates "nineteen tasks all
 * doing one thing" from "nineteen tasks doing fifteen different things" -- source_task_type is
 * a single service row and reads 1 either way.
 */
describe('Tenants pipeline count', () => {
  const tasksResource = () => {
    const found = tenantsFor(vi.fn()).resources.find(r => r.key === 'sourceTaskCount');
    if (!found) throw new Error('the Tasks resource is gone');
    return found;
  };
  const sub = (sourceTaskCount: number, pipelineCount: number) =>
    tasksResource().sub?.({ sourceTaskCount, pipelineCount } as any) ?? '';

  it('names the pipelines when they differ from the task count', () => {
    expect(sub(19, 15)).toBe('15 pipelines');
  });

  it('says nothing when every task is its own pipeline, which the task count already said', () => {
    expect(sub(15, 15)).toBe('');
  });

  it('says nothing for a workspace with no tasks, rather than printing "0 pipelines"', () => {
    expect(sub(0, 0)).toBe('');
  });

  it('reads as singular for one pipeline', () => {
    expect(sub(4, 1)).toBe('1 pipeline');
  });

  it('hangs off Tasks, not a column of its own', () => {
    const withSub = tenantsFor(vi.fn()).resources.filter(r => r.sub);
    expect(withSub.map(r => r.key)).toEqual(['sourceTaskCount']);
  });
});
