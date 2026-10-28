import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
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
    sensitivity: 'internal', sensitivityLabel: 'INTERNAL', currentVersion: 3, status: 'Active', folderCount: 1, requestCount: 3,
    dateCreated: '2026-09-29T02:26:22.327+00:00', dateUpdated: '2026-09-29T02:26:32.018+00:00',
    defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' } } },
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

function setup(opts: { admin?: boolean; api?: Partial<Record<string, unknown>>; confirm?: boolean; platform?: { remembered: number | null } } = {}) {
  try { localStorage.clear(); } catch { /* none */ }
  const api = {
    get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: structuredClone(DETAIL) })),
    version: vi.fn(),
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
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin ?? true, canBuild: () => opts.admin ?? true, builderLocked: () => false,
        isPlatformAdmin: () => !!opts.platform, isManagedSession: () => false, user: signal({ appUserId: 4537 }) } },
      ...(opts.platform ? [{ provide: WorkspaceDirectory, useValue: { picks: () => true, remembered: () => opts.platform!.remembered,
        workspaces: () => [], recent: () => [], names: () => new Map(), load: () => of([]), choose: vi.fn(), nameOf: (id: number) => `Workspace ${id}`,
        loaded: () => true, error: () => '' } }] : []),
    ],
  });
  const fixture = TestBed.createComponent(Collection);
  fixture.componentRef.setInput('collectionId', '1000');
  fixture.detectChanges();
  return { api, opened, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Collection -- reading', () => {
  it('reads the collection, its default auth as /get says it (MIG-310), and who uses it', () => {
    const { api, screen } = setup();
    expect(api.get).toHaveBeenCalledWith(1000, null);
    expect(api.version).not.toHaveBeenCalled();
    expect(api.usage).toHaveBeenCalledWith(1000, null);
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
    const { screen } = setup({ api: { get: vi.fn(() => of({ status: 'ERROR', message: 'API collection not found with 1000.' })) } });
    expect(screen.error()).toBe('API collection not found with 1000.');
    expect(screen.missing()).toBe(true);
  });

  it('reads any other refusal as a refusal, not a missing collection (MIG-310: the shared wording, no special case)', () => {
    const { screen } = setup({ api: { get: vi.fn(() => of({ status: 'ERROR', message: 'Your access profile does not include this page.' })) } });
    expect(screen.missing()).toBe(false);
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
    expect(api.setEnabled).toHaveBeenCalledWith(1000, false, null);
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
    expect(opened.find(o => o.component === EnvironmentDialog)!.config.data).toEqual({ collectionId: 1000, environment: DETAIL.environments[0], tenantId: null });
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

describe('Collection -- the overview stays short, every version under History (UX final I3)', () => {
  it('opens on the overview: APIs, environments and who uses them, no version list', () => {
    const { el } = setup();
    const tabs = Array.from(el.querySelectorAll('[data-test="collection-tabs"] [role="tab"]'));
    expect(tabs.map(t => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Overview', 'History 2']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[data-test="apis"]')).not.toBeNull();
    expect(el.querySelector('[data-test="environments"]')).not.toBeNull();
    expect(el.querySelector('[data-test="versions"]')).toBeNull();
    expect(tabs[1].getAttribute('href')).toBe('/?tab=history');
  });

  it('lists every version on History, the current one marked', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('tab', 'history');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="apis"]')).toBeNull();
    const rows = Array.from(el.querySelectorAll('[data-test="versions"] tbody tr')).map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatch(/^v3\s*current/);
  });
});

describe('Collection -- a platform administrator', () => {
  it('asks for a workspace first and reads nothing', () => {
    const { api, el } = setup({ platform: { remembered: null } });
    expect(api.get).not.toHaveBeenCalled();
    expect(el.querySelector('[data-test="pick-workspace"]')!.textContent).toContain('Pick a workspace to see its API collections.');
  });

  it('reads and writes in the workspace picked, and hands it to every dialog', async () => {
    const { api, opened, screen } = setup({ platform: { remembered: 2960 } });
    expect(api.get).toHaveBeenCalledWith(1000, 2960);
    expect(api.usage).toHaveBeenCalledWith(1000, 2960);
    screen.toggleEnabled(DETAIL.requests[0] as never);
    expect(api.setEnabled).toHaveBeenCalledWith(1000, false, 2960);
    await screen.removeRequest(DETAIL.requests[0] as never);
    expect(api.deleteRequest).toHaveBeenCalledWith(1000, 2960);
    await screen.removeEnvironment(DETAIL.environments[0] as never);
    expect(api.deleteEnvironment).toHaveBeenCalledWith(41, 2960);
    screen.editDetails();
    screen.openRequest(DETAIL.requests[0] as never);
    screen.newEnvironment();
    const data = opened.map(o => o.config?.data).filter(d => d && 'tenantId' in d);
    expect(data.length).toBe(3);
    expect(data.every(d => d.tenantId === 2960)).toBe(true);
    screen.pickWorkspace(2945);
    expect(api.get).toHaveBeenLastCalledWith(1000, 2945);
  });
});

describe('Collection -- sorting (owner 2026-10-27)', () => {
  it('keeps the saved order of the APIs, then sorts them by name both ways', () => {
    const { screen } = setup();
    expect(screen.sortedRequests().map(r => r.name)).toEqual(['Get status', 'Metadata probe', 'Post echo']);
    screen.requestSort.toggle('name');
    screen.requestSort.toggle('name');
    expect(screen.sortedRequests().map(r => r.name)).toEqual(['Post echo', 'Metadata probe', 'Get status']);
    screen.requestSort.toggle('timeout');
    expect(screen.sortedRequests().map(r => r.timeoutMs)).toEqual([30000, 30000, 15000]);
  });

  it('sorts the versions oldest first when asked, newest first as they came', () => {
    const { screen } = setup();
    expect(screen.sortedVersions().map(v => v.version)).toEqual([3, 2]);
    screen.versionSort.toggle('version');
    expect(screen.sortedVersions().map(v => v.version)).toEqual([3, 2]);
    screen.versionSort.toggle('version');
    expect(screen.sortedVersions().map(v => v.version)).toEqual([2, 3]);
  });

  it('sorts who uses the APIs by name, the unpinned ("Latest") after the pinned ones', () => {
    const usage = [
      { userType: 'PIPELINE', userRef: '9', userName: 'Zeta', requestName: 'Get status', pinnedVersion: null },
      { userType: 'SOURCE', userRef: '4', userName: 'Alpha', requestName: 'Get status', pinnedVersion: 2 },
    ];
    const { screen } = setup({ api: { usage: vi.fn(() => of({ status: 'SUCCESS', message: '', data: usage })) } });
    screen.usageSort.toggle('name');
    expect(screen.sortedUsage().map(u => u.userName)).toEqual(['Alpha', 'Zeta']);
    screen.usageSort.toggle('pinned');
    expect(screen.sortedUsage().map(u => u.userName)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('Collection -- loading, empty, error (owner 2026-10-27)', () => {
  it('"Used by" is loading, not "no one uses it", until its own read answers', () => {
    const { screen, el } = setup({ api: { usage: vi.fn(() => NEVER) } });
    expect(screen.usageState.loading()).toBe(true);
    expect(screen.usageState.pending()).toBe(true);
    expect(el.querySelector('[data-test="usage"]')!.textContent).not.toContain('No pipeline, source or AI tool uses these APIs yet.');
  });

  it('"Used by" is empty once an empty answer comes', () => {
    const { screen } = setup();
    expect(screen.usageState.pending()).toBe(false);
    expect(screen.sortedUsage()).toEqual([]);
  });

  it('"Used by" says it could not be read instead of claiming no one uses the APIs', () => {
    const { screen } = setup({ api: { usage: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) } });
    expect(screen.usageState.loading()).toBe(false);
    expect(screen.usageState.error()).toBe('Who uses these APIs could not be read.');
  });

  it('the figures are placeholders while the collection is on its way', () => {
    const { screen } = setup({ api: { get: vi.fn(() => NEVER) } });
    expect(screen.detail()).toBeNull();
    expect(screen.loading()).toBe(true);
  });

  it('a failed read of the collection says so in plain words', () => {
    const { screen } = setup({ api: { get: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) } });
    expect(screen.loading()).toBe(false);
    expect(screen.error()).toBe('The collection could not be read.');
  });
});
