import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Sources } from './sources';
import { SourcesApi } from './sources.service';
import { ConnectionRow, ContractRow, SourceRow } from './sources.model';
import { SourcePanel } from './source-panel';
import { ConnectionDialog } from './connection-dialog';
import { ContractPanel } from './contract-panel';
import { TemplateDialog } from './template-dialog';
import { ContractSampleDialog } from './contract-sample-dialog';

/**
 * MIG-248: the Sources page. Three tabs on one page key: the workspace's sources (paged and searched by the
 * service), its database connections, and its data contracts (MIG-233) beside the shared system one. Every member
 * holding the page reads all three; New, Edit, Delete, Test, Install and the rest are a workspace administrator's.
 */
const SOURCES: SourceRow[] = [
  { id: 1001, tenantId: 2924, name: 'LIVE-CHECK platform bucket probe', kind: 'FILE', format: 'JSON', status: 'Active', lastTestOk: false,
    lastTestedAt: '2026-09-29T03:40:00.000+00:00', dateCreated: '2026-09-29T03:31:57.073+00:00' },
  { id: 1000, tenantId: 2924, name: 'LIVE-CHECK 0928 customers CSV', kind: 'FILE', format: 'CSV', status: 'Active', lastTestOk: true,
    lastTestedAt: '2026-09-29T03:35:00.000+00:00', dateCreated: '2026-09-29T03:31:47.916+00:00' },
  { id: 1002, tenantId: 2924, name: 'Orders', kind: 'DATABASE', format: null, status: 'Inactive', lastTestOk: null, lastTestedAt: null,
    dateCreated: '2026-09-28T10:00:00.000+00:00' },
];
const CONNECTIONS: ConnectionRow[] = [
  { id: 5, tenantId: 2924, name: 'Warehouse', engine: 'POSTGRES', host: 'db.internal', port: 5432, database: 'dw', username: 'reader',
    passwordSet: true, sslMode: 'REQUIRE', status: 'Active', dateCreated: '2026-09-28T10:00:00.000+00:00' },
];
const CONTRACTS: ContractRow[] = [
  { id: 1001, tenantId: 2924, name: 'wound_intake', direction: 'IN', currentVersion: 2, activeVersion: 1, sensitivity: null, system: false,
    dateCreated: '2026-09-29T03:32:13.857+00:00' },
  { id: 1000, tenantId: 0, name: 'result_manifest', direction: 'OUT', currentVersion: 1, activeVersion: 1, sensitivity: 'INTERNAL', system: true,
    dateCreated: '2026-09-29T03:30:32.035+00:00' },
];

function stubApi(overrides: Partial<Record<keyof SourcesApi, unknown>> = {}) {
  return {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: SOURCES, paging: { totalRecord: 3, pageSize: 50, currentPage: 1 } })),
    delete: vi.fn(() => of({ status: 'SUCCESS', message: 'Source deleted.', data: { id: 1000 } })),
    connections: vi.fn(() => of({ status: 'SUCCESS', message: '', data: CONNECTIONS })),
    deleteConnection: vi.fn(() => of({ status: 'SUCCESS', message: 'Database connection deleted.', data: CONNECTIONS[0] })),
    testConnection: vi.fn(() => of({ status: 'SUCCESS', message: 'Connected.', data: { ok: true, message: 'Connected.' } })),
    contracts: vi.fn(() => of({ status: 'SUCCESS', message: '', data: CONTRACTS })),
    ...overrides,
  };
}

function screenWith(opts: { admin?: boolean; platform?: boolean; api?: ReturnType<typeof stubApi>; confirm?: boolean; tab?: string } = {}) {
  const api = opts.api ?? stubApi();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const opened: { component: unknown; data: unknown }[] = [];
  const dialog = {
    open: vi.fn((component: unknown, config: { data?: unknown }) => {
      opened.push({ component, data: config?.data });
      return { closed: of(opts.confirm ?? true) };
    }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(opts.tab ? { tab: opts.tab } : {}) } } },
      { provide: SourcesApi, useValue: api },
      { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ tenantId: 2924, tenantName: 'Claude Demo' }] })) } },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: {
        isTenantAdmin: () => opts.admin ?? true, isPlatformAdmin: () => opts.platform ?? false, user: signal({ appUserId: 4537 }),
      } },
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  return { api, toast, dialog, opened, router };
}

afterEach(() => vi.useRealTimers());

describe('Sources -- the sources tab', () => {
  it('asks the service for the first page, and counts how the sources last answered', () => {
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    expect(api.list).toHaveBeenCalledWith('', 1, 50);
    expect(screen.rows().map(r => r.id)).toEqual([1001, 1000, 1002]);
    const tiles = Object.fromEntries(screen.kpis().map(k => [k.label, k.value]));
    expect(tiles).toEqual({ Sources: 3, Answered: 1, Failing: 1, 'Not tested': 1 });
  });

  it('searches on the service, after the typing stops, from the first page', () => {
    vi.useFakeTimers();
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    screen.goTo(2);
    screen.onSearch('live');
    screen.onSearch('live-check');
    vi.advanceTimersByTime(400);
    expect(api.list).toHaveBeenLastCalledWith('live-check', 1, 50);
    expect(api.list).toHaveBeenCalledTimes(3);
  });

  it('filters the page by kind', () => {
    screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    screen.kindFilter.set('DATABASE');
    expect(screen.filtered().map(r => r.name)).toEqual(['Orders']);
  });

  it('shows the service\'s refusal as the table\'s error', () => {
    screenWith({ api: stubApi({ list: vi.fn(() => of({ status: 'ERROR', message: 'Sources is not part of your access. Ask your workspace admin.' })) }) });
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    expect(screen.error()).toContain('not part of your access');
  });

  it('opens a source in the wide side panel, and a new one with nothing in it', () => {
    const { opened } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    screen.open(SOURCES[1]);
    screen.create();
    const panels = opened.filter(o => o.component === SourcePanel).map(o => o.data as { sourceId: number | null; canManage: boolean });
    expect(panels.map(p => p.sourceId)).toEqual([1000, null]);
    expect(panels[0].canManage).toBe(true);
  });

  it('asks before deleting a source, and does nothing on Cancel', async () => {
    const { api } = screenWith({ confirm: false });
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    await screen.remove(SOURCES[1]);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('deletes a source once confirmed, and reads the list again', async () => {
    const { api, toast } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    await screen.remove(SOURCES[1]);
    expect(api.delete).toHaveBeenCalledWith(1000);
    expect(toast.success).toHaveBeenCalledWith('Source deleted.');
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('names each workspace for a platform administrator', () => {
    screenWith({ platform: true });
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    expect(screen.filtered().map(r => r.tenantName)).toEqual(['Claude Demo', 'Claude Demo', 'Claude Demo']);
  });
});

describe('Sources -- database connections and contracts', () => {
  it('reads the connections and the contracts when their tab is opened, once', () => {
    const { api } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    expect(api.connections).not.toHaveBeenCalled();
    screen.setTab('connections');
    screen.setTab('contracts');
    screen.setTab('connections');
    expect(api.connections).toHaveBeenCalledTimes(1);
    expect(api.contracts).toHaveBeenCalledTimes(1);
    expect(screen.connections().map(c => c.name)).toEqual(['Warehouse']);
  });

  it('opens on the tab the address names', () => {
    const { api } = screenWith({ tab: 'contracts' });
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    expect(screen.tab()).toBe('contracts');
    expect(api.contracts).toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    screen.setTab('sources');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('says whether a connection connected, and why not', () => {
    const { toast } = screenWith({ api: stubApi({ testConnection: vi.fn(() => of({ status: 'SUCCESS', message: 'password authentication failed',
      data: { ok: false, message: 'password authentication failed' } })) }) });
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.testConnection(CONNECTIONS[0]);
    expect(toast.error).toHaveBeenCalledWith('Warehouse did not connect: password authentication failed');
  });

  it('shows the refusal of a connection still in use', async () => {
    const { toast } = screenWith({ api: stubApi({ deleteConnection: vi.fn(() => of({ status: 'ERROR',
      message: 'In use by 1 source (Orders); remove it from them first.' })) }) });
    const screen = TestBed.runInInjectionContext(() => new Sources());
    await screen.removeConnection(CONNECTIONS[0]);
    expect(toast.error).toHaveBeenCalledWith('In use by 1 source (Orders); remove it from them first.');
  });

  it('edits a connection in its dialog, and opens a contract, a template or a sample in theirs', () => {
    const { opened } = screenWith();
    const screen = TestBed.runInInjectionContext(() => new Sources());
    screen.ngOnInit();
    screen.editConnection(CONNECTIONS[0]);
    screen.openContract(CONTRACTS[1]);
    screen.installTemplate();
    screen.newContract();
    expect(opened.map(o => o.component)).toEqual([ConnectionDialog, ContractPanel, TemplateDialog, ContractSampleDialog]);
    expect((opened[1].data as { contract: ContractRow }).contract.system).toBe(true);
  });
});

describe('Sources -- the page', () => {
  function render(admin: boolean, tab?: string) {
    screenWith({ admin, tab });
    const fixture = TestBed.createComponent(Sources);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button, a')).map(b => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim());

  it('offers New source and a menu per row to a workspace administrator', () => {
    const el = render(true);
    expect(el.querySelector('h1')?.textContent).toContain('Sources');
    expect(buttons(el)).toEqual(expect.arrayContaining(['New source', 'Actions for LIVE-CHECK 0928 customers CSV']));
    const heads = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent!.trim());
    expect(heads).toEqual(['Source', 'Kind', 'Format', 'Last test', 'Created', 'State', 'Actions']);
    expect(el.textContent).toContain('28 Sep 2026, 22:35'); // 03:35 UTC on the 29th, in Chicago
  });

  it('shows a tenant user the list and nothing that writes', () => {
    const el = render(false);
    const names = buttons(el);
    expect(names).not.toContain('New source');
    expect(names.some(n => n.startsWith('Actions for'))).toBe(false);
  });

  it('never shows a connection\'s password: only whether one is configured', () => {
    const el = render(true, 'connections');
    expect(el.textContent).toContain('configured');
    expect(buttons(el)).toEqual(expect.arrayContaining(['New connection', 'Actions for Warehouse']));
  });

  it('marks the shared system contract read-only, and offers the workspace\'s own the administrator\'s actions', () => {
    const el = render(true, 'contracts');
    expect(el.textContent).toContain('System · read-only');
    expect(buttons(el)).toEqual(expect.arrayContaining(['Install template', 'New from sample']));
  });

  it('draws the loading state inside the table shell while the first page is on its way', () => {
    const pending = new Subject<never>();
    screenWith({ api: stubApi({ list: vi.fn(() => pending) }) });
    const fixture = TestBed.createComponent(Sources);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-table-shell [role="status"]')?.getAttribute('aria-label')).toBe('Loading');
  });
});
