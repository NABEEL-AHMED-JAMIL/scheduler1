import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StaffActivity } from './staff-activity';
import { ActionsQuery, ManagedServiceApi } from './managed-service.api';

/**
 * Owner 2026-10-27 ("add a sort on each table"): Staff activity is sorted by Identity. A heading sends sort/dir and reads
 * from the first page again; a sorted audit pages by offset (paging.nextOffset), never by the id cursor; newest first is
 * the audit's own order and sends no sort, keeping the beforeId pages.
 */
const row = (id: number) => ({ id, tenantId: 2924, tenantName: 'Claude Demo', appUserId: 5001, fullName: 'Sam Staff',
  username: 'sam@platform.local', service: 'process', method: 'POST', path: '/x.json/save', createdAt: '2026-09-28 10:00:00' });

function setup(scope: 'platform' | 'workspace') {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  const calls: ActionsQuery[] = [];
  const api = {
    actions: vi.fn((q: ActionsQuery) => {
      calls.push(q);
      if (!q.sort) return of({ status: 'SUCCESS', message: '', data: [row(9), row(8)], paging: { limit: 50, nextBeforeId: 8 } });
      const first = !q.offset;
      return of({ status: 'SUCCESS', message: '', data: first ? [row(3), row(1)] : [row(2)],
        paging: { limit: 50, nextBeforeId: null, offset: q.offset ?? 0, nextOffset: first ? 2 : null, sort: q.sort, dir: q.dir } });
    }),
    users: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
  };
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: ManagedServiceApi, useValue: api }, { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: [] })) } }] });
  const fixture = TestBed.createComponent(StaffActivity);
  fixture.componentRef.setInput('scope', scope);
  fixture.detectChanges();
  return { page: fixture.componentInstance, calls, fixture };
}

afterEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Staff activity -- sorted on the server (owner 2026-10-27)', () => {
  it('sends no sort before a choice, and pages newest first by the id cursor as before', () => {
    const { page, calls } = setup('platform');
    expect(calls[0]).toEqual({ tenantId: null, appUserId: null, beforeId: null, limit: 50 });
    expect(page.sort.ariaSort('createdAt')).toBe('descending');
    page.loadOlder();
    expect(calls.at(-1)).toEqual({ tenantId: null, appUserId: null, beforeId: 8, limit: 50 });
  });

  it('a heading sends its column and dir from the first page, then pages by offset without the id cursor', () => {
    const { page, calls } = setup('platform');
    page.loadOlder();
    page.sort.toggle('staff');
    expect(calls.at(-1)).toEqual({ tenantId: null, appUserId: null, beforeId: null, limit: 50, sort: 'staff', dir: 'asc', offset: 0 });
    expect(page.rows().map(r => r.id)).toEqual([3, 1]);
    expect(page.nextBeforeId()).toBeNull();
    expect(page.hasMore()).toBe(true);
    page.loadOlder();
    expect(calls.at(-1)).toMatchObject({ sort: 'staff', dir: 'asc', offset: 2, beforeId: null });
    expect(page.rows().map(r => r.id)).toEqual([3, 1, 2]);
    expect(page.hasMore()).toBe(false);
  });

  it('flips direction on a second click and keeps the filters', () => {
    const { page, calls } = setup('platform');
    page.setTenant('2924');
    page.sort.toggle('workspace');
    page.sort.toggle('workspace');
    expect(calls.at(-1)).toMatchObject({ tenantId: 2924, sort: 'workspace', dir: 'desc', offset: 0 });
    page.sort.toggle('service');
    expect(calls.at(-1)).toMatchObject({ sort: 'service', dir: 'asc', offset: 0 });
  });

  it('When oldest first is a sort; back to newest first is the id cursor again', () => {
    const { page, calls } = setup('workspace');
    page.sort.toggle('createdAt');
    expect(calls.at(-1)).toMatchObject({ sort: 'createdAt', dir: 'asc', offset: 0 });
    page.sort.toggle('createdAt');
    expect(calls.at(-1)).toEqual({ tenantId: null, appUserId: null, beforeId: null, limit: 50 });
    expect(page.nextBeforeId()).toBe(8);
  });

  it('puts the sort headings on the allowed columns only', () => {
    const { fixture } = setup('platform');
    const heads = [...(fixture.nativeElement as HTMLElement).querySelectorAll('thead th')];
    const sortable = heads.filter(th => th.querySelector('button.th-sort')).map(th => th.textContent?.trim());
    expect(sortable).toEqual(['When', 'Staff member', 'Workspace', 'Service']);
  });

  it('sends sort, dir and offset to Identity only when a sort is picked', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const real = TestBed.inject(ManagedServiceApi);
    const http = TestBed.inject(HttpTestingController);
    real.actions({ limit: 50, sort: 'service', dir: 'desc', offset: 100 }).subscribe();
    const sorted = http.expectOne(r => r.url.endsWith('/managedService.json/actions'));
    expect(sorted.request.params.get('sort')).toBe('service');
    expect(sorted.request.params.get('dir')).toBe('desc');
    expect(sorted.request.params.get('offset')).toBe('100');
    sorted.flush({ status: 'SUCCESS', data: [] });
    real.actions({ limit: 50 }).subscribe();
    const plain = http.expectOne(r => r.url.endsWith('/managedService.json/actions'));
    expect(plain.request.params.has('sort')).toBe(false);
    expect(plain.request.params.has('offset')).toBe(false);
    plain.flush({ status: 'SUCCESS', data: [] });
    http.verify();
  });
});
