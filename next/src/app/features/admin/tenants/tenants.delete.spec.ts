import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';

/**
 * 2026-11-02 (owner: deleting a workspace made the console misbehave and signed the session out): the deleted workspace
 * leaves this list, its tiles and the shared workspace selector at once, the selector forgets it as the session's choice,
 * and the platform administrator stays on Platform › Workspaces with the server's sentence.
 */
const ACME = { tenantId: 7, tenantName: 'Acme', tenantCode: 'acme', status: 'Active', userCount: 0 } as any;
const KEEP = { tenantId: 8, tenantName: 'Keep', tenantCode: 'keep', status: 'Active', userCount: 2 } as any;

function setUp(answer: { status: string; message: string }) {
  const toasts: string[] = [];
  const navigate = vi.fn();
  const put = vi.fn(() => of(answer));
  let listed = [ACME, KEEP];
  const get = vi.fn((url: string) => of(url.includes('listTenants') ? { status: 'SUCCESS', data: listed } : { status: 'SUCCESS', data: [] }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { put, get } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m), info: () => {} } },
      { provide: Router, useValue: { navigate } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => true, isManagedSession: () => false, user: () => ({ appUserId: 1 }) } },
    ],
  });
  const directory = TestBed.inject(WorkspaceDirectory);
  const tenants = TestBed.runInInjectionContext(() => new Tenants());
  tenants.tenants.set([ACME, KEEP]);
  return { tenants, directory, put, get, toasts, navigate, setListed: (rows: any[]) => { listed = rows; } };
}

const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('Deleting a workspace on Platform › Workspaces', () => {
  it('takes it out of the list and the workspace selector, and says so in words', async () => {
    const { tenants, directory, put, toasts, navigate, setListed } = setUp({ status: 'SUCCESS', message: 'Workspace "Acme" deleted.' });
    directory.choose(7);
    setListed([KEEP]);
    await tenants.deleteTenant(ACME);
    await settle();
    expect(put).toHaveBeenCalledWith(expect.stringContaining('/tenant.json/changeTenantStatus'), { tenantId: 7, status: 'Delete' });
    expect(toasts).toEqual(['Workspace "Acme" deleted.']);
    expect(tenants.tenants().map(t => t.tenantId)).toEqual([8]);
    expect(tenants.stats().tenants).toBe(1);
    expect(directory.chosen()).toBe(null);
    expect(directory.recent()).not.toContain(7);
    expect(directory.workspaces().map(w => w.tenantId)).toEqual([8]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the row when the server refuses', async () => {
    const { tenants, directory, toasts } = setUp({ status: 'ERROR', message: 'Tenant not found with 7.' });
    directory.choose(7);
    await tenants.deleteTenant(ACME);
    await settle();
    expect(toasts).toEqual(['!Tenant not found with 7.']);
    expect(tenants.tenants().map(t => t.tenantId)).toEqual([7, 8]);
    expect(directory.chosen()).toBe(7);
  });
});

describe('The workspace selector after a workspace is gone', () => {
  it('drops a picked workspace the list no longer has', async () => {
    const { directory, setListed } = setUp({ status: 'SUCCESS', message: '' });
    directory.choose(7);
    directory.choose(8);
    directory.choose(7);
    setListed([KEEP]);
    directory.refresh().subscribe();
    await settle();
    expect(directory.chosen()).toBe(null);
    expect(directory.recent()).toEqual([8]);
  });
});
