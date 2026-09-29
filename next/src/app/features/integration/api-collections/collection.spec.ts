import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollectionsApi } from './api-collections.service';
import { Collection } from './collection';
import { RequestPanel } from './request-panel';
import { EnvironmentDialog } from './environment-dialog';
import { InUseDialog } from './in-use-dialog';

/**
 * MIG-247: one collection -- its APIs (edited and tested in the side panel), its environments (secrets shown as
 * configured, never as values), its versions and who uses it. Writes are a workspace administrator's.
 */
const DETAIL = {
  collection: { collectionId: 1000, tenantId: 2924, name: 'LIVE-CHECK 0928 httpbin', description: 'MIG-227 live check', sourceFormat: 'MANUAL',
    sensitivity: 'INTERNAL', currentVersion: 3, status: 'Active', folderCount: 1, requestCount: 3,
    dateCreated: '2026-09-29T02:26:22.327+00:00', dateUpdated: '2026-09-29T02:26:32.018+00:00' },
  folders: [{ folderId: 31, parentFolderId: null, name: 'Status', sortOrder: 0 }],
  requests: [
    { requestId: 1000, folderId: null, name: 'Get status', method: 'GET', urlTemplate: 'https://example.com/', authMode: 'NONE', bodyType: 'NONE', timeoutMs: 30000, enabled: true },
    { requestId: 1001, folderId: null, name: 'Metadata probe', method: 'GET', urlTemplate: 'http://169.254.169.254/latest/meta-data/', authMode: 'NONE', bodyType: 'NONE', timeoutMs: 30000, enabled: true },
    { requestId: 1002, folderId: 31, name: 'Post echo', method: 'POST', urlTemplate: '{{baseUrl}}/post', authMode: 'INHERIT', bodyType: 'JSON', timeoutMs: 15000, enabled: false },
  ],
  environments: [{ environmentId: 41, name: 'Prod', isDefault: true, variables: [
    { key: 'baseUrl', secret: false, value: 'https://httpbin.org', configured: true },
    { key: 'token', secret: true, value: null, configured: true },
  ] }],
  versions: [{ version: 3, createdBy: 4537, dateCreated: '2026-09-29T02:26:32.017+00:00' }, { version: 2, createdBy: 4537, dateCreated: '2026-09-29T02:26:22.486+00:00' }],
  access: [], imports: [],
};

function setup(opts: { admin?: boolean; api?: Partial<Record<string, unknown>>; confirm?: boolean } = {}) {
  const api = {
    get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: structuredClone(DETAIL) })),
    version: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { collectionId: 1000, version: 3, snapshot: { collection: { defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' } } } } } })),
    usage: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    setEnabled: vi.fn(() => of({ status: 'SUCCESS', message: 'API request disabled.', data: { id: 1000, collectionId: 1000, version: 4 } })),
    deleteRequest: vi.fn(() => of({ status: 'SUCCESS', message: 'API request deleted.', data: { id: 1000, collectionId: 1000, version: 4 } })),
    deleteEnvironment: vi.fn(() => of({ status: 'SUCCESS', message: 'API environment deleted.', data: {} })),
    ...opts.api,
  };
  const opened: { component: unknown; config: any }[] = [];
  const dialog = { open: vi.fn((component: unknown, config: any) => { opened.push({ component, config }); return { closed: of(opts.confirm ?? true) }; }) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ApiCollectionsApi, useValue: api },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin ?? true, isPlatformAdmin: () => false, user: signal({ appUserId: 4537 }) } },
    ],
  });
  const fixture = TestBed.createComponent(Collection);
  fixture.componentRef.setInput('collectionId', '1000');
  fixture.detectChanges();
  return { api, opened, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Collection -- reading', () => {
  it('reads the collection, its default auth from the current version, and who uses it', () => {
    const { api, screen } = setup();
    expect(api.get).toHaveBeenCalledWith(1000);
    expect(api.version).toHaveBeenCalledWith(1000, 3);
    expect(api.usage).toHaveBeenCalledWith(1000);
    expect(screen.defaultAuth()).toEqual({ type: 'BEARER', bearer: { token: '{{token}}' } });
    expect(Object.fromEntries(screen.kpis().map(k => [k.label, k.value]))).toEqual({ APIs: 3, Enabled: 2, Folders: 1, Environments: 1, Version: 'v3' });
  });

  it('filters the APIs by folder, state and words', () => {
    const { screen } = setup();
    screen.folderFilter.set('31');
    expect(screen.visibleRequests().map(r => r.name)).toEqual(['Post echo']);
    screen.folderFilter.set('top');
    expect(screen.visibleRequests().map(r => r.name)).toEqual(['Get status', 'Metadata probe']);
    screen.folderFilter.set('');
    screen.stateFilter.set('disabled');
    expect(screen.visibleRequests().map(r => r.name)).toEqual(['Post echo']);
    screen.stateFilter.set('');
    screen.search.set('169.254');
    expect(screen.visibleRequests().map(r => r.name)).toEqual(['Metadata probe']);
  });

  it('says plainly when the collection does not exist, with no Try again', () => {
    const { screen } = setup({ api: { get: vi.fn(() => of({ status: 'ERROR', message: 'API collection not found.' })) } });
    expect(screen.error()).toBe('API collection not found.');
    expect(screen.missing()).toBe(true);
  });

  it('shows a secret as configured and never as a value', () => {
    const { el } = setup();
    const envTable = el.querySelector('[data-test="environments"]') as HTMLElement;
    expect(envTable.textContent).toContain('token');
    expect(envTable.textContent).toContain('configured');
    expect(envTable.querySelector('.secret-mask')).not.toBeNull();
  });
});

describe('Collection -- writing', () => {
  it('opens an API in the wide side panel with what the editor needs', () => {
    const { screen, opened } = setup();
    screen.openRequest(DETAIL.requests[0]);
    const panel = opened.find(o => o.component === RequestPanel)!;
    expect(panel.config.panelClass).toContain('side-panel-wide');
    expect(panel.config.data).toEqual(expect.objectContaining({ requestId: 1000, canManage: true,
      defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' } } }));
    expect(panel.config.data.environments.length).toBe(1);
  });

  it('adds an API in the folder being looked at', () => {
    const { screen, opened } = setup();
    screen.folderFilter.set('31');
    screen.addRequest();
    expect(opened.find(o => o.component === RequestPanel)!.config.data).toEqual(expect.objectContaining({ requestId: null, folderId: 31 }));
  });

  it('switches an API off and on', () => {
    const { screen, api } = setup();
    screen.toggleEnabled(DETAIL.requests[0]);
    expect(api.setEnabled).toHaveBeenCalledWith(1000, false);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('lists who still uses an API the service would not delete', async () => {
    const users = [{ userType: 'PIPELINE', userRef: '77', userName: 'Daily status', requestName: 'Get status', pinnedVersion: 3, currentVersion: 3, behind: false }];
    const { screen, opened } = setup({ api: { deleteRequest: vi.fn(() => of({ status: 'ERROR', message: 'In use by 1 pipeline or source; remove it from them first.', data: users })) } });
    await screen.removeRequest(DETAIL.requests[0]);
    expect(opened.find(o => o.component === InUseDialog)!.config.data.users).toEqual(users);
  });

  it('edits an environment in its dialog', () => {
    const { screen, opened } = setup();
    screen.editEnvironment(DETAIL.environments[0]);
    expect(opened.find(o => o.component === EnvironmentDialog)!.config.data).toEqual({ collectionId: 1000, environment: DETAIL.environments[0] });
  });
});

describe('Collection -- the page', () => {
  const names = (el: HTMLElement) => Array.from(el.querySelectorAll('button, a')).map(b => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim());

  it('matches the prototype\'s APIs table for a workspace administrator', () => {
    const { el } = setup();
    expect(el.querySelector('h1')!.textContent).toContain('LIVE-CHECK 0928 httpbin');
    const apis = el.querySelector('[data-test="apis"]') as HTMLElement;
    expect(Array.from(apis.querySelectorAll('thead th')).map(th => th.textContent!.trim()))
      .toEqual(['API', 'Method · endpoint', 'Auth', 'Folder', 'Timeout', 'Last test', 'State', 'Actions']);
    expect(names(el)).toEqual(expect.arrayContaining(['Add API', 'New environment', 'Edit details', 'Actions for Get status']));
  });

  it('gives a tenant user the same view with nothing that writes', () => {
    const { el } = setup({ admin: false });
    const n = names(el);
    for (const control of ['Add API', 'New environment', 'Edit details']) expect(n).not.toContain(control);
    expect(n.some(x => x.startsWith('Actions for'))).toBe(false);
    // The API's name still opens it, read-only.
    expect(n).toContain('Get status');
  });
});
