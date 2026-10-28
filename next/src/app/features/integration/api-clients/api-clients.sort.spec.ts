import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { ApiClients } from './api-clients';
import { ApiClientsApi } from './api-clients.api';
import { DeliveriesDialog } from './deliveries-dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';

/** Owner 2026-10-27: "add a sort on each table" and "a loader on each component like it's loading". */

const ok = (data: unknown) => of({ status: 'SUCCESS', message: '', data });
const FAILS = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

const CLIENTS = [
  { clientId: 'cl_b', name: 'Portal', scopes: [], ipAllowlist: [], expiresAt: null, status: 'Active', createdBy: null, createdAt: null,
    updatedAt: null, secretRotatedAt: null, revokedAt: null, lastUsedAt: '2026-10-06T09:00:00', lastUsedIp: null, callsThisMonth: 12 },
  { clientId: 'cl_a', name: 'Billing sync', scopes: [], ipAllowlist: [], expiresAt: null, status: 'Active', createdBy: null, createdAt: null,
    updatedAt: null, secretRotatedAt: null, revokedAt: null, lastUsedAt: '2026-10-07T09:00:00', lastUsedIp: null, callsThisMonth: 300 },
];
const ROUTES = [
  { routeId: 1, eventType: 'order.received', targetKind: 'PIPELINE', jobId: 4, pipelineName: 'Orders', workflowKey: null, contractId: null,
    contractName: null, contractVersion: null, active: true, dateCreated: null, dateUpdated: null },
  { routeId: 2, eventType: 'invoice.paid', targetKind: 'PIPELINE', jobId: 5, pipelineName: 'Payments', workflowKey: null, contractId: null,
    contractName: null, contractVersion: null, active: false, dateCreated: null, dateUpdated: null },
];
const WEBHOOKS = [
  { id: '1', url: 'https://b.example.com', eventTypes: [], active: true, pausedReason: null, createdAt: null, updatedAt: null,
    failingSince: null, lastSuccessAt: '2026-10-06T09:00:00Z', secretRotatedAt: null, previousSecretValidUntil: null, tenantId: 1, createdBy: null },
  { id: '2', url: 'https://a.example.com', eventTypes: [], active: true, pausedReason: null, createdAt: null, updatedAt: null,
    failingSince: null, lastSuccessAt: '2026-10-07T09:00:00Z', secretRotatedAt: null, previousSecretValidUntil: null, tenantId: 1, createdBy: null },
];

function page(answers: { list?: () => Observable<unknown>; scopes?: () => Observable<unknown>; limits?: () => Observable<unknown> } = {}) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  const api = {
    list: vi.fn(answers.list ?? (() => ok(CLIENTS))),
    limits: vi.fn(answers.limits ?? (() => ok(null))),
    scopes: vi.fn(answers.scopes ?? (() => ok([{ scope: 'runs:read', description: '' }]))),
    routesList: vi.fn(() => ok(ROUTES)),
    routeTargets: vi.fn(() => ok({ pipelines: [] })),
    webhookList: vi.fn(() => ok(WEBHOOKS)),
    eventTypes: vi.fn(() => ok([])),
  };
  TestBed.configureTestingModule({ providers: [
    { provide: ApiClientsApi, useValue: api },
    { provide: Dialog, useValue: {} },
    { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    { provide: AuthService, useValue: { canBuild: signal(true), user: () => ({ appUserId: 1 }) } },
    { provide: WorkspaceDirectory, useValue: { picks: () => false, remembered: () => null, nameOf: (id: number) => `Workspace ${id}` } },
  ] });
  const screen = TestBed.runInInjectionContext(() => new ApiClients());
  screen.ngOnInit();
  return screen;
}

describe('API Clients -- sorting (owner 2026-10-27)', () => {
  it('keeps the API order, then sorts the clients by name both ways', () => {
    const screen = page();
    expect(screen.sortedClients().map(c => c.name)).toEqual(['Portal', 'Billing sync']);
    screen.clientSort.toggle('name');
    expect(screen.sortedClients().map(c => c.name)).toEqual(['Billing sync', 'Portal']);
    screen.clientSort.toggle('name');
    expect(screen.sortedClients().map(c => c.name)).toEqual(['Portal', 'Billing sync']);
  });

  it('sorts the calls as numbers, the most first', () => {
    const screen = page();
    screen.clientSort.toggle('calls');
    expect(screen.sortedClients().map(c => c.callsThisMonth)).toEqual([300, 12]);
  });

  it('sorts the event routes by type and the webhooks by last delivery', () => {
    const screen = page();
    screen.routeSort.toggle('eventType');
    expect(screen.sortedRoutes().map(r => r.eventType)).toEqual(['invoice.paid', 'order.received']);
    screen.webhookSort.toggle('lastDelivered');
    expect(screen.sortedWebhooks().map(w => w.id)).toEqual(['2', '1']);
  });
});

describe('API Clients -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not empty, until the clients answer', () => {
    const screen = page({ list: () => NEVER });
    expect(screen.loading()).toBe(true);
    expect(screen.state.pending()).toBe(true);
  });

  it('is empty once an empty list answers', () => {
    const screen = page({ list: () => ok([]) });
    expect(screen.loading()).toBe(false);
    expect(screen.state.pending()).toBe(false);
    expect(screen.sortedClients()).toEqual([]);
  });

  it('says the clients could not be read, in plain words', () => {
    const screen = page({ list: FAILS });
    expect(screen.loading()).toBe(false);
    expect(screen.error()).toBe('The API clients could not be read.');
  });

  it('says why New API client is disabled when the scopes cannot be read', () => {
    const screen = page({ scopes: FAILS });
    expect(screen.scopesState.error()).toBe('The API scopes could not be read, so no client can be made yet.');
    expect(screen.newClientBlocked()).toBe('The API scopes could not be read, so no client can be made yet.');
  });

  it('says the API limits could not be read instead of hiding the card', () => {
    const screen = page({ limits: FAILS });
    expect(screen.limits()).toBeNull();
    expect(screen.limitsState.error()).toBe('The API limits could not be read.');
  });
});

describe('Deliveries dialog -- loading, empty, error (owner 2026-10-27)', () => {
  function dialog(deliveries: () => Observable<unknown>, attempts: () => Observable<unknown> = () => ok([])) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DIALOG_DATA, useValue: { webhook: WEBHOOKS[0] } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: ApiClientsApi, useValue: { deliveries: vi.fn(deliveries), attempts: vi.fn(attempts) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ] });
    const d = TestBed.runInInjectionContext(() => new DeliveriesDialog());
    d.ngOnInit();
    return d;
  }
  const ROW = { id: '7', eventId: 'e', eventType: 'run.failed', attempt: 1, status: 'failed', responseStatus: 500, durationMs: 4,
    nextAttemptAt: null, createdAt: null, lastAttemptAt: null, deliveredAt: null, error: null, redeliveryOf: null };

  it('is loading until the first page answers, then empty', () => {
    expect(dialog(() => NEVER).state.pending()).toBe(true);
    const empty = dialog(() => ok([]));
    expect(empty.state.pending()).toBe(false);
    expect(empty.rows()).toEqual([]);
  });

  it('says the deliveries could not be read, and stops loading', () => {
    const d = dialog(FAILS);
    expect(d.loading()).toBe(false);
    expect(d.error()).toBe('The deliveries could not be read.');
  });

  it('a failed attempts read says so instead of "Loading…" forever', () => {
    const d = dialog(() => ok([ROW]), FAILS);
    d.toggle(ROW as any);
    expect(d.attemptsState.loading()).toBe(false);
    expect(d.attemptsState.error()).toBe('The attempts could not be read.');
  });

  it('a failed "Older deliveries" keeps the rows and says so below them', () => {
    let call = 0;
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...ROW, id: String(100 - i) }));
    const d = dialog(() => (call++ === 0 ? ok(rows) : FAILS()));
    d.older();
    expect(d.rows().length).toBe(50);
    expect(d.error()).toBe('');
    expect(d.olderError()).toBe('The older deliveries could not be read.');
  });
});
