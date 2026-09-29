import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StaffActivity } from './staff-activity';
import { ManagedServiceApi } from './managed-service.api';

const row = (id: number, extra: Record<string, unknown> = {}) => ({ id, tenantId: 2924, tenantName: 'Claude Demo', appUserId: 5001,
  fullName: 'Sam Staff', username: 'sam@platform.local', service: 'process', method: 'POST', path: '/sourceTask.json/updateSourceTask',
  target: 'sourceTaskId=1854', action: 'SourceTaskRestApi.updateSourceTask', builderAction: true, createdAt: '2026-09-28 10:00:00', ...extra });

function setup(scope: 'platform' | 'workspace', pages: { data: unknown[]; next: number | null }[]) {
  let call = 0;
  const api = {
    actions: vi.fn(() => { const p = pages[Math.min(call++, pages.length - 1)]; return of({ status: 'SUCCESS', message: '', data: p.data, paging: { limit: 50, nextBeforeId: p.next } }); }),
    users: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { appUserId: 5001, username: 'sam@platform.local', fullName: 'Sam Staff', userRole: 'PLATFORM_ADMIN', status: 'Active', tenantId: null }] })),
  };
  const get = vi.fn(() => of({ status: 'SUCCESS', data: [{ tenantId: 2924, tenantName: 'Claude Demo', status: 'Active' }] }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: ManagedServiceApi, useValue: api }, { provide: HttpClient, useValue: { get } }] });
  const fixture = TestBed.createComponent(StaffActivity);
  fixture.componentRef.setInput('scope', scope);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api, get, text: () => { fixture.detectChanges(); return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? ''; } };
}

describe('MIG-254: Staff activity (platform administrators)', () => {
  it('reads the newest page of every workspace, with the workspaces and staff to filter by', () => {
    const { page, api, get, text } = setup('platform', [{ data: [row(9), row(8)], next: null }]);
    expect(api.actions).toHaveBeenCalledWith({ tenantId: null, appUserId: null, beforeId: null, limit: 50 });
    expect(get).toHaveBeenCalled();
    expect(page.staff().map(s => s.appUserId)).toEqual([5001]);
    expect(page.rows().map(r => r.id)).toEqual([9, 8]);
    expect(text()).toContain('Staff activity');
    expect(text()).toContain('/sourceTask.json/updateSourceTask');
    expect(page.showWorkspace()).toBe(true);
  });

  it('pages back with the last page\'s nextBeforeId, and stops when there is none', () => {
    const { page, api } = setup('platform', [{ data: [row(9), row(8)], next: 8 }, { data: [row(7)], next: null }]);
    expect(page.hasMore()).toBe(true);
    page.loadOlder();
    expect(api.actions).toHaveBeenLastCalledWith({ tenantId: null, appUserId: null, beforeId: 8, limit: 50 });
    expect(page.rows().map(r => r.id)).toEqual([9, 8, 7]);
    expect(page.hasMore()).toBe(false);
  });

  it('starts over from the newest when a filter changes', () => {
    const { page, api } = setup('platform', [{ data: [row(9)], next: 9 }]);
    page.setTenant('2924');
    expect(api.actions).toHaveBeenLastCalledWith({ tenantId: 2924, appUserId: null, beforeId: null, limit: 50 });
    page.setStaff('5001');
    expect(api.actions).toHaveBeenLastCalledWith({ tenantId: 2924, appUserId: 5001, beforeId: null, limit: 50 });
  });
});

describe('MIG-254: Our team\'s activity (a workspace administrator)', () => {
  it('reads their own workspace only: no workspace filter or column, no platform lists', () => {
    const { page, api, get, text } = setup('workspace', [{ data: [row(9)], next: null }]);
    expect(api.actions).toHaveBeenCalledWith({ tenantId: null, appUserId: null, beforeId: null, limit: 50 });
    expect(api.users).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(page.showWorkspace()).toBe(false);
    expect(text()).toContain("Our team's activity");
    // The staff to filter by are the people seen in the log.
    expect(page.staff().map(s => s.appUserId)).toEqual([5001]);
  });

  it('says plainly when our team has changed nothing', () => {
    const { text } = setup('workspace', [{ data: [], next: null }]);
    expect(text()).toContain('Our team has not changed anything in this workspace yet.');
  });
});
