import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Connectors } from './connectors';
import { ConnectorsApi } from './connectors.api';
import { ConnectPanel, ConnectPanelData } from './connect-panel';
import { ConnectionPanel } from './connection-panel';
import {
  Connection, ConnectionDetail, ConnectorCard, ConnectorSpec, agoText, connectionState, lagText, scheduleText, suggestedMode,
} from './connectors.model';

/**
 * Connector Hub (MIG-292): the gallery with its chips and search, connections with their sync health; the connect stepper
 * (credentials -> tables -> sync -> schedule) with a test's cause and fix; a connection's streams, schema change and runs.
 */
const POSTGRES: ConnectorSpec = {
  key: 'postgres', label: 'PostgreSQL', category: 'DATABASE', summary: 'Database · incremental (CDC)', auth: 'SECRET', oauthProvider: null,
  sourceKind: 'table', modes: ['FULL', 'INCREMENTAL', 'CDC'], available: true, unavailableReason: null,
  fields: [
    { name: 'host', label: 'Host', type: 'text', required: true, secret: false, help: null, options: [], placeholder: null },
    { name: 'password', label: 'Password', type: 'password', required: true, secret: true, help: null, options: [], placeholder: null },
  ],
};
const CARDS: ConnectorCard[] = [
  { spec: POSTGRES, oauthRegistered: true, connections: 1 },
  { spec: { ...POSTGRES, key: 'hubspot', label: 'HubSpot', category: 'SAAS', summary: 'SaaS · CRM objects', auth: 'OAUTH', oauthProvider: 'hubspot',
    fields: [] }, oauthRegistered: false, connections: 0 },
  { spec: { ...POSTGRES, key: 'mysql', label: 'MySQL', available: false, unavailableReason: 'no driver yet.' }, oauthRegistered: true, connections: 0 },
  { spec: { ...POSTGRES, key: 'files', label: 'Files in storage', category: 'FILES', sourceKind: 'file', modes: ['FULL', 'INCREMENTAL'],
    fields: [] }, oauthRegistered: true, connections: 0 },
];
const CONNECTION: Connection = {
  id: 1000, uuid: 'u', tenantId: 2924, name: 'Shop DB (demo)', connectorKey: 'postgres', connectorLabel: 'PostgreSQL', category: 'DATABASE',
  config: { host: 'demo-source-db' }, secretsSet: ['password'], authKind: 'SECRET', oauthProvider: null, oauthStatus: null, oauthConnectedAt: null,
  targetAlias: 'ui-review-s3', targetPrefix: null, folder: 'connectors/1000/', lastTestAt: '2026-09-30T23:50:00', lastTestOk: true,
  lastError: null, lastErrorFix: null, lastErrorAt: null, status: 'Active',
  health: { streams: 2, rows: 296, lastSyncAt: '2026-09-30T23:51:30', lastStatus: 'Succeeded', failed24h: 0, schemaPending: true, lagSeconds: 77,
    modes: 'CDC,INCREMENTAL', scheduleMinutes: 1 },
  dateCreated: '2026-09-30T23:50:00', dateUpdated: null,
};
const FAILED: Connection = { ...CONNECTION, id: 1001, name: 'Broken', lastError: 'Could not connect: password refused.',
  lastErrorFix: 'Check the password.', health: { ...CONNECTION.health!, schemaPending: false, lastStatus: 'Failed', failed24h: 2 } };
const DETAIL: ConnectionDetail = {
  connection: CONNECTION,
  streams: [{ id: 1, connectionId: 1000, name: 'public.customers', sourceKind: 'table', mode: 'INCREMENTAL', cursorColumn: 'updated_at',
    primaryKey: null, scheduleMinutes: 60, detectSensitive: true, registerCatalog: true, enabled: true, options: {},
    acceptedSchema: [{ name: 'id', type: 'integer' }], sensitiveColumns: [{ column: 'email', tag: 'email', level: 'Confidential' }],
    pendingSchema: { added: [{ name: 'segment', type: 'string' }], dropped: [], changed: [], columns: [], summary: 'The source added segment.',
      detectedAt: '2026-09-30T23:51:00' }, stateCursor: 'x', stateUpdatedAt: null, caughtUpAt: '2026-09-30T23:51:00',
    lastSyncAt: '2026-09-30T23:51:30', nextRunAt: null, runRequested: false, rowsTotal: 42, lagSeconds: 77, sourceId: null,
    folder: 'connectors/1000/public.customers/' }],
  runs: [{ id: 9, syncId: 's9', streamId: 1, stream: 'public.customers', mode: 'INCREMENTAL', trigger: 'SCHEDULE', status: 'Failed',
    startedAt: '2026-09-30T23:51:00', finishedAt: '2026-09-30T23:51:02', rows: 0, bytes: 0, parts: 0, cursorFrom: null, cursorTo: null,
    targetAlias: 'ui-review-s3', targetKey: null, caughtUp: false, error: 'The source dropped notes.', errorFix: 'Accept the change.', resumedCount: 0 }],
};

function api() {
  return {
    connectors: vi.fn(() => of({ status: 'SUCCESS', message: '', data: CARDS })),
    connections: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [CONNECTION, FAILED] })),
    connection: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL })),
    storageTargets: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ storageConnectionId: 1, alias: 'ui-review-s3', connectionName: 'Lake',
      provider: 'S3', status: 'Active' }] })),
    save: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...CONNECTION, id: 1500 } })),
    test: vi.fn(() => of({ status: 'SUCCESS', message: 'Could not connect: refused.', data: { ok: false, message: 'Could not connect: refused.',
      fix: 'Check the host, port, database, user and password.' } })),
    discover: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ name: 'public.orders', kind: 'table', ref: 'public.orders',
      columns: [{ name: 'id', type: 'integer' }, { name: 'updated_at', type: 'timestamp' }], primaryKey: ['id'], cursorCandidates: ['updated_at'],
      rowEstimate: 250 }] })),
    saveStream: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL.streams[0] })),
    runNow: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    acceptSchema: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL.streams[0] })),
    oauthStart: vi.fn(() => of({ status: 'ERROR', message: 'The HubSpot OAuth app is not registered on this platform yet.', data: null })),
  };
}

function auth(admin = true) {
  return { canBuild: signal(admin), isTenantAdmin: signal(admin), isPlatformAdmin: signal(false), managementMode: signal('SELF'),
    builderLocked: signal(false), isManagedSession: signal(false) };
}

function page(admin = true) {
  const fake = api();
  const dialog = { open: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ConnectorsApi, useValue: fake }, { provide: Dialog, useValue: dialog },
      { provide: AuthService, useValue: auth(admin) }],
  });
  const fixture = TestBed.createComponent(Connectors);
  fixture.detectChanges();
  return { fake, dialog, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Connector Hub page', () => {
  it('shows the gallery with what each card can do, and narrows it by chip and search', () => {
    const { el, screen, fixture } = page();
    const card = (key: string) => el.querySelector(`[data-connector="${key}"]`) as HTMLElement;
    expect(card('postgres').textContent).toContain('Connected');
    expect(card('hubspot').textContent).toContain('On request');
    expect(card('mysql').textContent).toContain('Not yet');
    expect(card('files').querySelector('button')?.textContent).toContain('Connect');
    screen.chip.set('SAAS');
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-connector]').length).toBe(1);
    screen.chip.set('');
    screen.search.set('files');
    fixture.detectChanges();
    expect(el.querySelector('[data-connector]')?.getAttribute('data-connector')).toBe('files');
  });

  it('lists connections with mode, last sync, rows, lag and state, and filters by state', () => {
    const { el, screen, fixture } = page();
    const row = el.querySelector('tr[data-connection="1000"]') as HTMLElement;
    expect(row.textContent).toContain('CDC');
    expect(row.textContent).toContain('Every minute');
    expect(row.textContent).toContain('296');
    expect(row.textContent).toContain('1 min');
    expect(row.textContent).toContain('Schema change');
    expect((el.querySelector('tr[data-connection="1001"]') as HTMLElement).textContent).toContain('Error');
    screen.stateFilter.set('Error');
    fixture.detectChanges();
    expect(el.querySelectorAll('tr[data-connection]').length).toBe(1);
  });

  it('opens a connection from the list and from ?connection=, and hides building from a member', () => {
    const { el, dialog } = page();
    (el.querySelector('tr[data-connection="1000"]') as HTMLElement).click();
    expect(dialog.open).toHaveBeenCalledWith(ConnectionPanel, expect.objectContaining({ data: expect.objectContaining({ connectionId: 1000 }) }));
    const member = page(false);
    expect(member.el.querySelector('[data-new-connection]')).toBeNull();
    expect(member.el.querySelector('[data-connector="files"] button')).toBeNull();
    member.fixture.componentRef.setInput('connection', '1001');
    member.fixture.detectChanges();
    expect(member.dialog.open).toHaveBeenCalledWith(ConnectionPanel, expect.objectContaining({ data: expect.objectContaining({ connectionId: 1001 }) }));
  });
});

function connect(card: ConnectorCard | null, connection: Connection | null = null) {
  const fake = api();
  const changed = vi.fn();
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: ConnectorsApi, useValue: fake },
      { provide: DIALOG_DATA, useValue: { cards: CARDS, card, connection, changed } as ConnectPanelData }, { provide: DialogRef, useValue: { close } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }],
  });
  const fixture = TestBed.createComponent(ConnectPanel);
  fixture.detectChanges();
  return { fake, changed, close, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Connect stepper', () => {
  it('saves the credentials once, and shows a failed test\'s cause and fix without moving on', () => {
    const { el, fake, screen, fixture } = connect(CARDS[0]);
    expect(el.querySelector('[data-step="credentials"]')).not.toBeNull();
    screen.set(POSTGRES.fields[0], 'db.example.test');
    screen.set(POSTGRES.fields[1], 'pa55-word');
    fixture.detectChanges();
    (el.querySelector('[data-next]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fake.save).toHaveBeenCalledWith(expect.objectContaining({ connectorKey: 'postgres', config: { host: 'db.example.test' },
      secrets: { password: 'pa55-word' }, targetAlias: 'ui-review-s3' }));
    const problem = el.querySelector('[data-problem]') as HTMLElement;
    expect(problem.textContent).toContain('Could not connect: refused.');
    expect(problem.textContent).toContain('Fix: Check the host');
    expect(screen.step()).toBe(1);
    expect(screen.values()['password']).toBeUndefined();
  });

  it('goes from tables to sync to schedule, and saves one stream per table before syncing now', () => {
    const { el, fake, screen, fixture, close } = connect(CARDS[0], CONNECTION);
    expect(screen.step()).toBe(2);
    expect(fake.discover).toHaveBeenCalledWith(1000);
    fixture.detectChanges();
    (el.querySelector('[data-table="public.orders"]') as HTMLInputElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-next]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(screen.mode()).toBe('INCREMENTAL');
    expect((el.querySelector('[data-cursor="public.orders"]') as HTMLSelectElement).value).toBe('updated_at');
    (el.querySelector('[data-next]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-summary]')?.textContent).toContain('1 table, incremental, hourly.');
    (el.querySelector('[data-finish]') as HTMLButtonElement).click();
    expect(fake.saveStream).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 1000, name: 'public.orders', mode: 'INCREMENTAL',
      cursorColumn: 'updated_at', primaryKey: 'id', scheduleMinutes: 60, detectSensitive: true, registerCatalog: true }));
    expect(fake.runNow).toHaveBeenCalledWith({ connectionId: 1000 });
    expect(close).toHaveBeenCalled();
  });

  it('chooses the connector first when opened from New connection', () => {
    const { el, screen, fixture } = connect(null);
    expect(screen.step()).toBe(0);
    (el.querySelector('[data-choose="files"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(screen.heading()).toBe('Connect Files in storage');
    expect(screen.step()).toBe(1);
  });
});

describe('Connection panel', () => {
  function panel() {
    const fake = api();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ConnectorsApi, useValue: fake },
        { provide: DIALOG_DATA, useValue: { connectionId: 1000, name: 'Shop DB (demo)', cards: CARDS, changed: vi.fn() } },
        { provide: DialogRef, useValue: { close: vi.fn() } }, { provide: Dialog, useValue: { open: vi.fn() } },
        { provide: AuthService, useValue: auth(true) }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(ConnectionPanel);
    fixture.detectChanges();
    return { fake, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows health, streams with their sensitive columns, a schema change to accept, and each failed run\'s cause and fix', () => {
    const { el, fake, fixture } = panel();
    expect(el.querySelector('[data-health]')?.textContent).toContain('296');
    expect(el.querySelector('tr[data-stream="public.customers"]')?.textContent).toContain('email');
    expect(el.querySelector('[data-schema="public.customers"]')?.textContent).toContain('The source added segment.');
    const run = el.querySelector('tr[data-run="s9"]') as HTMLElement;
    expect(run.textContent).toContain('The source dropped notes.');
    expect(run.textContent).toContain('Fix: Accept the change.');
    (el.querySelector('[data-accept]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fake.acceptSchema).toHaveBeenCalledWith(1);
  });
});

describe('Connector Hub model', () => {
  it('reads schedules, lags and times as people do', () => {
    expect(scheduleText(null)).toBe('On demand');
    expect(scheduleText(15)).toBe('Every 15 min');
    expect(scheduleText(60)).toBe('Hourly');
    expect(scheduleText(1440)).toBe('Daily');
    expect(lagText(4)).toBe('4 s');
    expect(lagText(720)).toBe('12 min');
    expect(lagText(null)).toBe('—');
    // A naive time is Chicago wall-clock (instantOf): 23:51:30 Chicago is 04:51:30Z.
    expect(agoText('2026-09-30T23:51:30', Date.parse('2026-10-01T04:52:30Z'))).toBe('1 min ago');
    expect(agoText('2026-10-01T04:51:30+00:00', Date.parse('2026-10-01T04:52:30Z'))).toBe('1 min ago');
  });

  it('names a connection\'s state from its grant, last sync and error', () => {
    expect(connectionState(CONNECTION)).toBe('Active');
    expect(connectionState(FAILED)).toBe('Error');
    expect(connectionState({ ...CONNECTION, authKind: 'OAUTH', oauthStatus: 'REVOKED' })).toBe('Needs you');
    expect(connectionState({ ...CONNECTION, authKind: 'OAUTH', oauthStatus: 'PENDING' })).toBe('Not connected');
    expect(connectionState({ ...CONNECTION, status: 'Inactive' })).toBe('Paused');
    expect(suggestedMode(POSTGRES, undefined)).toBe('FULL');
  });
});
