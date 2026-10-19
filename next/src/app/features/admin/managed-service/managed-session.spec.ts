import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ManagedServiceApi } from './managed-service.api';
import { ManagedSession } from './managed-session';

/**
 * Owner #20 (2026-10-19): "Work in this workspace" (Workspaces' row menu, beside the workspace selector) opens a managed
 * session there -- at once with a grant, and after asking (a grant to oneself, recorded in Managed service) without one.
 */
function setup(grants: { tenantId: number; revokedAt?: string | null }[], answers: boolean[] = [], platform = true) {
  const api = {
    myWorkspaces: vi.fn(() => of({ status: 'SUCCESS', message: '', data: grants })),
    grant: vi.fn(() => of({ status: 'SUCCESS', message: 'Granted.' })),
    openSession: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { accessToken: 'a', refreshToken: 'r', tenantId: 2960 } })),
  };
  const auth = { isPlatformAdmin: () => platform, isManagedSession: () => false, user: () => ({ appUserId: 4639 }), enterManagedSession: vi.fn() };
  const router = { navigate: vi.fn(async () => true) };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const asked: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: ManagedServiceApi, useValue: api }, { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
    { provide: ToastService, useValue: toast },
    { provide: Dialog, useValue: { open: (_c: unknown, config: unknown) => { asked.push(config); return { closed: of(answers.shift()) }; } } },
  ] });
  return { session: TestBed.inject(ManagedSession), api, auth, router, toast, asked };
}

describe('ManagedSession (owner #20)', () => {
  it('opens a session at once in a workspace the staff member holds a grant for', async () => {
    const { session, api, auth, router, asked } = setup([{ tenantId: 2960 }]);
    expect(await session.workIn(2960, 'Riverside Health')).toBe(true);
    expect(asked).toEqual([]);
    expect(api.grant).not.toHaveBeenCalled();
    expect(api.openSession).toHaveBeenCalledWith(2960);
    expect(auth.enterManagedSession).toHaveBeenCalledWith(expect.objectContaining({ tenantName: 'Riverside Health', accessToken: 'a' }));
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('asks before granting oneself a workspace, and opens nothing when declined', async () => {
    const declined = setup([{ tenantId: 2960, revokedAt: '2026-10-01' }], [false]);
    expect(await declined.session.workIn(2960, 'Riverside Health')).toBe(false);
    expect(declined.asked.length).toBe(1);
    expect(declined.api.grant).not.toHaveBeenCalled();
    expect(declined.api.openSession).not.toHaveBeenCalled();

    const granted = setup([], [true]);
    expect(await granted.session.workIn(2961, 'Meridian')).toBe(true);
    expect(granted.api.grant).toHaveBeenCalledWith(2961, 4639);
    expect(granted.api.openSession).toHaveBeenCalledWith(2961);
  });

  it('does nothing for anyone but a platform administrator in their own session', async () => {
    const { session, api } = setup([{ tenantId: 2960 }], [], false);
    expect(await session.workIn(2960, 'Riverside Health')).toBe(false);
    expect(api.myWorkspaces).not.toHaveBeenCalled();
  });
});
