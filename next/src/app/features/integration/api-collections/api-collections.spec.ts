import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollections } from './api-collections';
import { ApiCollectionsApi } from './api-collections.service';
import { CollectionRow } from './api-collections.model';
import { InUseDialog } from './in-use-dialog';

/**
 * MIG-247: the API Collections list. A page of the workspace's collections from the service (it pages and
 * searches), the counts over them, and -- for a workspace administrator only -- New collection, Import and each
 * row's Edit, Activate/Deactivate and Delete. A delete the service refuses names who still uses the collection.
 */
const ROWS: CollectionRow[] = [
  { collectionId: 1000, tenantId: 2924, name: 'LIVE-CHECK 0928 httpbin', description: 'MIG-227 live check', sourceFormat: 'MANUAL',
    sensitivity: 'internal', sensitivityLabel: 'INTERNAL', currentVersion: 3, status: 'Active', folderCount: 0, requestCount: 2, dateUpdated: '2026-09-29T02:26:32.018+00:00' },
  { collectionId: 1001, tenantId: 2924, name: 'Clinic API', sourceFormat: 'POSTMAN', sensitivity: 'sensitive', sensitivityLabel: 'PHI', currentVersion: 1,
    status: 'Inactive', folderCount: 2, requestCount: 7, dateUpdated: '2026-09-28T10:00:00.000+00:00' },
];

function stubApi(overrides: Partial<Record<keyof ApiCollectionsApi, unknown>> = {}) {
  return {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: ROWS, paging: { totalRecord: 2, pageSize: 50, currentPage: 1 } })),
    version: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { collectionId: 1000, version: 3,
      snapshot: { collection: { defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' } } } } } })),
    saveCollection: vi.fn(() => of({ status: 'SUCCESS', message: 'API collection saved.', data: { id: 1000, collectionId: 1000, version: 4 } })),
    deleteCollection: vi.fn(() => of({ status: 'SUCCESS', message: 'API collection deleted.', data: { id: 1000, collectionId: 1000 } })),
    ...overrides,
  };
}

function screenWith(opts: { admin?: boolean; platform?: boolean; api?: ReturnType<typeof stubApi>; confirm?: boolean } = {}) {
  const api = opts.api ?? stubApi();
  const toast = { success: vi.fn(), error: vi.fn() };
  const opened: { component: unknown; data: unknown }[] = [];
  const dialog = {
    open: vi.fn((component: unknown, config: { data?: unknown }) => {
      opened.push({ component, data: config?.data });
      // The confirm resolves true/false; every other dialog closes with nothing.
      return { closed: of(opts.confirm ?? true) };
    }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ApiCollectionsApi, useValue: api },
      { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ tenantId: 2924, tenantName: 'Claude Demo' }] })) } },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: {
        isTenantAdmin: () => opts.admin ?? true, isPlatformAdmin: () => opts.platform ?? false, user: signal({ appUserId: 4537 }),
      } },
    ],
  });
  return { api, toast, dialog, opened };
}

afterEach(() => vi.useRealTimers());

describe('API Collections list -- reading', () => {
  it('asks the service for the first page, and counts what came back', () => {
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    expect(api.list).toHaveBeenCalledWith('', 1, 50);
    expect(screen.rows().map(r => r.collectionId)).toEqual([1000, 1001]);
    expect(screen.total()).toBe(2);
    const tiles = Object.fromEntries(screen.kpis().map(k => [k.label, k.value]));
    expect(tiles).toEqual({ Collections: 2, APIs: 9, Imported: 1, Inactive: 1 });
  });

  it('searches on the service, after the typing stops, from the first page', () => {
    vi.useFakeTimers();
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    screen.goTo(2);
    screen.onSearch('cli');
    screen.onSearch('clinic');
    vi.advanceTimersByTime(400);
    expect(api.list).toHaveBeenLastCalledWith('clinic', 1, 50);
    expect(api.list).toHaveBeenCalledTimes(3);
  });

  it('filters the page by state', () => {
    screenWith();
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    screen.statusFilter.set('Inactive');
    expect(screen.filtered().map(r => r.name)).toEqual(['Clinic API']);
  });

  it('shows the service\'s refusal as the table\'s error', () => {
    screenWith({ api: stubApi({ list: vi.fn(() => of({ status: 'ERROR', message: 'API Collections is not part of your access. Ask your workspace admin.' })) }) });
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    expect(screen.error()).toContain('not part of your access');
    expect(screen.loading()).toBe(false);
  });

  it('names each workspace for a platform administrator', () => {
    screenWith({ platform: true });
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    expect(screen.filtered().map(r => r.tenantName)).toEqual(['Claude Demo', 'Claude Demo']);
  });
});

describe('API Collections list -- writing', () => {
  it('keeps the collection\'s default auth when it is switched off: read from its current version first', () => {
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    screen.setStatus(ROWS[0]);
    expect(api.version).toHaveBeenCalledWith(1000, 3);
    expect(api.saveCollection).toHaveBeenCalledWith({
      collectionId: 1000, name: 'LIVE-CHECK 0928 httpbin', description: 'MIG-227 live check', sensitivity: 'INTERNAL', status: 'Inactive',
      defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' } },
    });
  });

  it('sends back the word the collection was given (MIG-243), not the level it is read as', () => {
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    screen.setStatus({ ...ROWS[0], sensitivity: 'sensitive', sensitivityLabel: 'PHI' });
    expect(api.saveCollection).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 'PHI' }));
    const { sensitivityLabel: _dropped, ...unlabelled } = ROWS[0];
    screen.setStatus({ ...unlabelled, sensitivity: 'internal' });
    expect(api.saveCollection).toHaveBeenLastCalledWith(expect.objectContaining({ sensitivity: null }));
  });

  it('does not save when the default auth could not be read, rather than wiping it', () => {
    const { api, toast } = screenWith({ api: stubApi({ version: vi.fn(() => of({ status: 'ERROR', message: 'Version 3 of this collection does not exist.' })) }) });
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    screen.setStatus(ROWS[0]);
    expect(api.saveCollection).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('lists who still uses a collection the service would not delete', async () => {
    const users = [{ userType: 'PIPELINE', userRef: '77', userName: 'Daily patients', requestName: 'List patients', pinnedVersion: 2, currentVersion: 3, behind: true }];
    const { opened } = screenWith({ api: stubApi({ deleteCollection: vi.fn(() => of({ status: 'ERROR', message: 'In use by 1 pipeline or source; remove it from them first.', data: users })) }) });
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    await screen.remove(ROWS[0]);
    const inUse = opened.find(o => o.component === InUseDialog);
    expect(inUse?.data).toEqual({ heading: 'LIVE-CHECK 0928 httpbin is still in use', message: 'In use by 1 pipeline or source; remove it from them first.', users });
  });

  it('asks before deleting, and does nothing on Cancel', async () => {
    const { api } = screenWith({ confirm: false });
    const screen = TestBed.runInInjectionContext(() => new ApiCollections());
    screen.ngOnInit();
    await screen.remove(ROWS[0]);
    expect(api.deleteCollection).not.toHaveBeenCalled();
  });
});

describe('API Collections list -- the page', () => {
  function render(admin: boolean) {
    screenWith({ admin });
    const fixture = TestBed.createComponent(ApiCollections);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button, a')).map(b => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim());

  it('offers New collection, Import and a menu per row to a workspace administrator', () => {
    const el = render(true);
    expect(el.querySelector('h1')?.textContent).toContain('API Collections');
    expect(buttons(el)).toEqual(expect.arrayContaining(['Import', 'New collection', 'Actions for LIVE-CHECK 0928 httpbin']));
    const heads = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent!.trim());
    expect(heads).toEqual(['Collection', 'Source', 'Sensitivity', 'APIs', 'Folders', 'Version', 'Updated', 'State', 'Actions']);
    expect(el.textContent).toContain('28 Sep 2026');
  });

  it('shows a tenant user the list and nothing that writes', () => {
    const el = render(false);
    const names = buttons(el);
    expect(names).not.toContain('Import');
    expect(names).not.toContain('New collection');
    expect(names.some(n => n.startsWith('Actions for'))).toBe(false);
    expect(Array.from(el.querySelectorAll('thead th')).map(th => th.textContent!.trim())).not.toContain('Actions');
  });

  it('draws the loading state inside the table shell while the first page is on its way', () => {
    const pending = new Subject<never>();
    screenWith({ api: stubApi({ list: vi.fn(() => pending) }) });
    const fixture = TestBed.createComponent(ApiCollections);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-table-shell [role="status"]')?.getAttribute('aria-label')).toBe('Loading');
  });

  it('says how to start when the workspace has none', () => {
    screenWith({ api: stubApi({ list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [], paging: { totalRecord: 0, pageSize: 50, currentPage: 1 } })) }) });
    const fixture = TestBed.createComponent(ApiCollections);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No API collections yet.');
  });
});
