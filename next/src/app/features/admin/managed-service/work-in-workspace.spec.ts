import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { WorkInWorkspace } from './work-in-workspace';
import { ManagedServiceApi } from './managed-service.api';
import { AuthService } from '../../../core/auth/auth.service';

const MINE = [
  { grantId: 11, tenantId: 2924, tenantName: 'Claude Demo', managementMode: 'MANAGED', appUserId: 5001, grantedAt: '2026-09-28 10:00:00' },
  { grantId: 12, tenantId: 3001, tenantName: 'Beta', managementMode: 'SELF', appUserId: 5001, grantedAt: '2026-09-27 10:00:00' },
];
const SESSION = { accessToken: 'managed', refreshToken: 'r', userRole: 'TENANT_ADMIN', tenantId: 2924, tenantName: 'Claude Demo',
  managedService: true, managementMode: 'MANAGED', appUserId: 5001, username: 'sam@platform.local' };

function setup(open = vi.fn(() => of({ status: 'SUCCESS', message: 'Managed-service session opened.', data: SESSION })), mine: unknown[] = MINE) {
  const entered: unknown[] = [];
  const api = { myWorkspaces: vi.fn(() => of({ status: 'SUCCESS', message: '', data: mine })), openSession: open };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: ManagedServiceApi, useValue: api },
    { provide: AuthService, useValue: { enterManagedSession: (s: unknown) => entered.push(s) } }] });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(WorkInWorkspace);
  fixture.detectChanges();
  const text = () => { fixture.detectChanges(); return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? ''; };
  return { page: fixture.componentInstance, api, entered, navigate, text };
}

describe('MIG-254: Work in a workspace', () => {
  it('lists the workspaces this staff member holds a live grant for', () => {
    const { text } = setup();
    expect(text()).toContain('Claude Demo');
    expect(text()).toContain('Beta');
    expect(text()).toContain('every change is audited');
  });

  it('opens a managed session there, holds it alongside the platform session, and goes to the dashboard', () => {
    const { page, api, entered, navigate } = setup();
    page.open(MINE[0] as any);
    expect(api.openSession).toHaveBeenCalledWith(2924);
    expect(entered).toEqual([SESSION]);
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('stays here with the server\'s reason when the session is refused', () => {
    const { page, entered, navigate, text } = setup(vi.fn(() => of({ status: 'ERROR', message: 'That workspace is not active.' })) as any);
    page.open(MINE[0] as any);
    expect(entered).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
    expect(text()).toContain('That workspace is not active.');
  });

  it('says how to get a workspace when there is none', () => {
    const { text } = setup(undefined, []);
    expect(text()).toContain('You have no managed workspaces.');
  });
});
