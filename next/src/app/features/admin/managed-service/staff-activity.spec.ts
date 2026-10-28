import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { StaffActivity, changeText, readText, targetText } from './staff-activity';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ManagedServiceApi as RealApi } from './managed-service.api';
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
    // Owner 2026-10-27: the workspace list was read and never used (the header's app-workspace-select reads its own).
    expect(get.mock.calls.filter(c => String((c as unknown[])[0]).includes('/tenant.json/listTenants'))).toEqual([]);
    expect(page.staff().map(s => s.appUserId)).toEqual([5001]);
    expect(page.rows().map(r => r.id)).toEqual([9, 8]);
    expect(text()).toContain('Staff activity');
    expect(text()).toContain('Source task › Update source task');
    expect(text()).toContain('Source task 1854');
    expect(text()).not.toContain('/sourceTask.json');
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
    // Nothing but the people's pictures (app-avatar asks for those itself).
    expect(get.mock.calls.filter(c => !String((c as unknown[])[0]).includes('/appUser.json/avatar'))).toEqual([]);
    expect(page.showWorkspace()).toBe(false);
    expect(text()).toContain("Our team's activity");
    // The staff to filter by are the people seen in the log.
    expect(page.staff().map(s => s.appUserId)).toEqual([5001]);
  });

  it('says plainly when our team has changed nothing', () => {
    const { text } = setup('workspace', [{ data: [], next: null }]);
    expect(text()).toContain('Our team has not changed or opened anything in this workspace yet.');
  });
});

describe('UI review U6: a change in words', () => {
  it('names the change from its path and the thing from its query, never the workspace id', () => {
    expect(changeText('/aiPrompt.json/tools/setEnabled')).toBe('AI prompt › Tools › Set enabled');
    expect(changeText('/managedService.json/openSession')).toBe('Managed service › Open session');
    expect(changeText('')).toBe('A change');
    expect(targetText('tenantId=2924')).toBe('');
    expect(targetText('sourceTaskId=1854&version=3')).toBe('Source task 1854 · Version 3');
  });
});

describe('ZT-A12 follow-up: data reads in a managed session (owner 2026-10-21)', () => {
  const readRow = (id: number, readKind: string, readId: string | number | null) => row(id, { method: 'GET',
    path: '/sourceJob.json/runOutputs', target: 'jobQueueId=8913', builderAction: false, readKind, readId });

  it('shows a read as Read, in words built from its kind and id, beside the changes', () => {
    const { text, fixture } = setup('platform', [{ data: [readRow(10, 'run output', '8913:csv'), row(9)], next: null }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(text()).toContain('Activity');
    expect(text()).toContain('Every change and every data read our staff made in a managed session');
    expect(el.querySelectorAll('[data-test="read-pill"]').length).toBe(1);
    expect(el.querySelector('[data-test="read-text"]')!.textContent).toContain('Downloaded run output 8913:csv');
    // The change beside it reads as before.
    expect(text()).toContain('Source task › Update source task');
  });

  it('words every kind in use, and an unknown one generically', () => {
    expect(readText({ readKind: 'board', readId: 41 })).toBe('Opened board 41');
    expect(readText({ readKind: 'report PDF', readId: 77 })).toBe('Downloaded report PDF 77');
    expect(readText({ readKind: 'approved data CSV', readId: 3 })).toBe('Downloaded approved data CSV 3');
    expect(readText({ readKind: 'file preview', readId: 'bucket/a.csv' })).toBe('Previewed file bucket/a.csv');
    expect(readText({ readKind: 'pipelines export', readId: null })).toBe('Downloaded pipelines export');
    expect(readText({ readKind: 'telemetry blob', readId: 5 })).toBe('Read telemetry blob 5');
    expect(readText({ readKind: null, readId: null })).toBe('');
  });

  it('filters: changes and reads by default, then only the data reads (kind=reads) or only the changes', () => {
    const { page, api } = setup('workspace', [{ data: [readRow(10, 'board', 41)], next: null }]);
    expect(api.actions).toHaveBeenLastCalledWith({ tenantId: null, appUserId: null, beforeId: null, limit: 50 });
    page.setKind('reads');
    expect(api.actions).toHaveBeenLastCalledWith({ tenantId: null, appUserId: null, beforeId: null, limit: 50, kind: 'reads' });
    page.setKind('changes');
    expect(api.actions).toHaveBeenLastCalledWith({ tenantId: null, appUserId: null, beforeId: null, limit: 50, kind: 'changes' });
    page.clearFilters();
    expect(page.kindFilter()).toBe('');
  });

  it("the workspace's page says it records what our team opened, exported or downloaded", () => {
    const { text } = setup('workspace', [{ data: [], next: null }]);
    expect(text()).toContain('Every change our team made here and every data they opened, exported or downloaded');
  });

  it('sends ?kind=reads to Identity', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(RealApi);
    api.actions({ limit: 50, kind: 'reads' }).subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/managedService.json/actions'));
    expect(req.request.params.get('kind')).toBe('reads');
    req.flush({ status: 'SUCCESS', data: [] });
    api.actions({ limit: 50 }).subscribe();
    const both = TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/managedService.json/actions'));
    expect(both.request.params.has('kind')).toBe(false);
    both.flush({ status: 'SUCCESS', data: [] });
  });
});

describe('Staff activity -- loading, errors (owner 2026-10-27)', () => {
  it('keeps the rows when an older page fails, and says so by the button', () => {
    const { page, api } = setup('platform', [{ data: [row(9), row(8)], next: 8 }]);
    api.actions.mockImplementationOnce(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })) as never);
    page.loadOlder();
    expect(page.rows().map(r => r.id)).toEqual([9, 8]);
    expect(page.error()).toBe('');
    expect(page.olderError()).toBe('The activity could not be read.');
    expect(page.loadingMore()).toBe(false);
  });

  it('says the staff list could not be read instead of offering nobody', () => {
    const { page, api, text } = setup('platform', [{ data: [row(9)], next: null }]);
    api.users.mockImplementationOnce(() => throwError(() => new HttpErrorResponse({ status: 500 })) as never);
    page.loadStaff();
    expect(page.staffState.error()).toBe('The staff could not be read.');
    expect(text()).toContain('The staff could not be read.');
  });
});
