import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory, workspaceNames } from '../../core/workspaces/workspace-directory';
import { ManagedSession } from '../../features/admin/managed-service/managed-session';
import { WorkspaceSelect } from './workspace-select';

/**
 * Owner #5 (2026-10-19): one workspace selector for a platform administrator, on every screen that has one -- the same
 * box, "All workspaces" only where the page can show every workspace, the recent ones first, the choice kept for the
 * session so the next screen opens on it, and "Work in this workspace" beside it (owner #20). A workspace's own people
 * never see it, and it reads nothing for them.
 */
const LIST = [
  { tenantId: 2960, tenantName: 'Riverside Health', tenantCode: 'riverside', status: 'Active' },
  { tenantId: 2961, tenantName: 'Meridian Finance & Retail', tenantCode: 'meridian', status: 'Active' },
  { tenantId: 2962, tenantName: 'Open Data Lab', tenantCode: 'open-data', status: 'Suspended' },
];

@Component({
  imports: [WorkspaceSelect],
  template: `<app-workspace-select [(value)]="picked" [allowAll]="allowAll()" />`,
})
class Host {
  picked: number | null = null;
  readonly allowAll = signal(true);
}

function render(platform: boolean, managed = false) {
  const session = { workIn: vi.fn(async () => true) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { isPlatformAdmin: () => platform, isManagedSession: () => managed } },
      { provide: ManagedSession, useValue: session }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, http, session, directory: TestBed.inject(WorkspaceDirectory),
    select: fixture.debugElement.children[0].componentInstance as WorkspaceSelect };
}

describe('WorkspaceSelect (owner #5)', () => {
  // The choice is kept in sessionStorage, which outlives a test file: leave none behind for the next one.
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('shows nothing to a workspace\'s own people, nor to a managed session, and reads no list for them', () => {
    for (const [platform, managed] of [[false, false], [true, true]] as const) {
      const { el, http } = render(platform, managed);
      expect(el.querySelector('[data-test="workspace-select"]')).toBeNull();
      http.expectNone(r => r.url.endsWith('/tenant.json/listTenants'));
    }
  });

  it('lists every workspace once, read once per session, and offers "All workspaces" only where the page allows it', () => {
    const { el, http, select, fixture } = render(true);
    http.expectOne(r => r.url.endsWith('/tenant.json/listTenants')).flush({ status: API_SUCCESS, data: LIST });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="workspace-select"]')).not.toBeNull();
    expect(select.options().map(o => o.label)).toEqual(['Meridian Finance & Retail', 'Open Data Lab', 'Riverside Health']);
    expect(select.options().find(o => o.value === '2962')!.hint).toContain('Suspended');
    expect(el.querySelector('[data-test="workspace-select"] input')!.getAttribute('placeholder')).toBe('All workspaces');

    fixture.componentInstance.allowAll.set(false);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="workspace-select"] input')!.getAttribute('placeholder')).toBe('Pick a workspace');
    select.pick('');
    expect(fixture.componentInstance.picked).toBeNull();

    // A second selector on the next screen asks for nothing again.
    TestBed.inject(WorkspaceDirectory).load().subscribe();
    http.expectNone(r => r.url.endsWith('/tenant.json/listTenants'));
  });

  it('keeps the choice for the session and puts it first among the recent ones', () => {
    const { http, select, fixture, directory } = render(true);
    http.expectOne(r => r.url.endsWith('/tenant.json/listTenants')).flush({ status: API_SUCCESS, data: LIST });
    select.pick('2962');
    fixture.detectChanges();
    expect(fixture.componentInstance.picked).toBe(2962);
    expect(directory.remembered()).toBe(2962);
    expect(JSON.parse(sessionStorage.getItem('etl_workspace_recent')!)).toEqual([2962]);
    expect(select.options()[0]).toEqual(expect.objectContaining({ value: '2962', group: 'Recent' }));
    select.pick('');
    expect(fixture.componentInstance.picked).toBeNull();
    expect(directory.remembered()).toBeNull();
  });

  it('offers "Work in this workspace" once one is picked, and opens it there', async () => {
    const { http, select, fixture, el, session } = render(true);
    http.expectOne(r => r.url.endsWith('/tenant.json/listTenants')).flush({ status: API_SUCCESS, data: LIST });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="work-in-workspace"]')).toBeNull();
    select.pick('2960');
    fixture.detectChanges();
    const button = el.querySelector<HTMLButtonElement>('[data-test="work-in-workspace"]')!;
    expect(button.getAttribute('aria-label')).toBe('Work in Riverside Health');
    await select.workIn();
    expect(session.workIn).toHaveBeenCalledWith(2960, 'Riverside Health');
  });

  it('tells two workspaces with one name apart', () => {
    expect([...workspaceNames([{ tenantId: 1, tenantName: 'A' }, { tenantId: 2, tenantName: 'a ' }, { tenantId: 3, tenantName: '' }]).values()])
      .toEqual(['A (#1)', 'a (#2)', 'Workspace 3']);
  });
});
