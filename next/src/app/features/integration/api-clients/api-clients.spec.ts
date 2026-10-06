import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ApiClients } from './api-clients';
import { ApiClientsApi } from './api-clients.api';
import { ClientDialog, dayOf } from './client-dialog';
import { SecretDialog } from './secret-dialog';
import { RouteDialog } from './route-dialog';
import { WebhookDialog } from './webhook-dialog';
import { WebhookSecretDialog } from './webhook-secret-dialog';
import { DeliveriesDialog } from './deliveries-dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';

const CLIENTS = [
  { clientId: 'cl_portal000000000000000000', name: 'Order portal', scopes: ['pipelines:read', 'runs:write'], ipAllowlist: ['203.0.113.0/24'],
    expiresAt: '2026-12-31T23:59:59', status: 'Active', createdBy: 4602, createdAt: '2026-10-06T09:00:00', updatedAt: null,
    secretRotatedAt: null, revokedAt: null, lastUsedAt: '2026-10-06T09:20:00', lastUsedIp: '203.0.113.5' },
  { clientId: 'cl_old0000000000000000000000', name: 'Old sync', scopes: ['events:write'], ipAllowlist: [], expiresAt: null,
    status: 'Revoked', createdBy: 4602, createdAt: '2026-10-01T09:00:00', updatedAt: null, secretRotatedAt: null,
    revokedAt: '2026-10-02T09:00:00', lastUsedAt: null, lastUsedIp: null },
];
const SCOPES = [{ scope: 'pipelines:read', description: 'Read pipelines.' }, { scope: 'runs:write', description: 'Start and retry runs.' }];
const ROUTES = [{ routeId: 1000, eventType: 'order.received', targetKind: 'PIPELINE', jobId: 42, pipelineName: 'Orders', workflowKey: null,
  contractId: null, contractName: 'orders', contractVersion: null, active: true, dateCreated: '2026-10-06T09:00:00', dateUpdated: null }];
const MADE = { ...CLIENTS[0], clientId: 'cl_new0000000000000000000000', clientSecret: 'cs_the-secret-shown-once' };
const EVENT_TYPES = [{ type: 'run.completed', description: 'A run finished.' }, { type: 'run.failed', description: 'A run failed.' }];
const WEBHOOKS = [
  { id: '1000', url: 'https://portal.example.com/hooks', eventTypes: ['run.completed', 'run.failed'], active: true, pausedReason: null,
    createdAt: '2026-10-06T14:00:00Z', updatedAt: null, failingSince: '2026-10-06T15:00:00Z', lastSuccessAt: '2026-10-06T14:30:00Z',
    secretRotatedAt: null, previousSecretValidUntil: null, tenantId: 2946, createdBy: 'alice@northwind.example' },
  { id: '1001', url: 'https://old.example.com/hooks', eventTypes: ['run.failed'], active: false, pausedReason: 'Paused by its owner.',
    createdAt: '2026-10-05T14:00:00Z', updatedAt: null, failingSince: null, lastSuccessAt: null, secretRotatedAt: null,
    previousSecretValidUntil: null, tenantId: 2946, createdBy: 'API client cl_portal' },
];
const MADE_HOOK = { ...WEBHOOKS[0], id: '1002', secret: 'whsec_shown-once' };
// MIG-337: the workspace's limits and this month's calls; the first client's own limit and calls.
const LIMITS = { tenantId: 2946, bounds: { clientRateMax: 600, clientBurstMax: 100, workspaceRate: 1200, workspaceBurst: 200, monthlyCalls: 10000 },
  defaults: { clientRateMax: 600, clientBurstMax: 100, workspaceRate: 1200, workspaceBurst: 200, monthlyCalls: null }, custom: true,
  month: '2026-10', monthEndsAt: '2026-11-01T00:00:00Z', callsThisMonth: 8500, quotaUsedPercent: 85, quotaWarning: true, updatedAt: null,
  updatedBy: null };
Object.assign(CLIENTS[0], { ratePerMinute: 6, burst: 2, limit: { ratePerMinute: 6, burst: 2, capped: false }, callsThisMonth: 812 });
Object.assign(CLIENTS[1], { ratePerMinute: null, burst: null, limit: { ratePerMinute: 600, burst: 100, capped: false }, callsThisMonth: 0 });

function setup(options: { confirm?: boolean; locked?: boolean } = {}) {
  const api = {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: CLIENTS })),
    limits: vi.fn(() => of({ status: 'SUCCESS', message: '', data: LIMITS })),
    scopes: vi.fn(() => of({ status: 'SUCCESS', message: '', data: SCOPES })),
    routesList: vi.fn(() => of({ status: 'SUCCESS', message: '', data: ROUTES })),
    routeTargets: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { pipelines: [{ jobId: 42, name: 'Orders' }] } })),
    revoke: vi.fn(() => of({ status: 'SUCCESS', message: 'API client revoked. Its tokens no longer work.' })),
    rotateSecret: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MADE })),
    deleteRoute: vi.fn(() => of({ status: 'SUCCESS', message: 'Event route removed.' })),
    webhookList: vi.fn(() => of({ status: 'SUCCESS', message: '', data: WEBHOOKS })),
    eventTypes: vi.fn(() => of({ status: 'SUCCESS', message: '', data: EVENT_TYPES })),
    updateWebhook: vi.fn(() => of({ status: 'SUCCESS', message: 'Webhook saved.', data: WEBHOOKS[0] })),
    rotateWebhookSecret: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MADE_HOOK })),
    deleteWebhook: vi.fn(() => of({ status: 'SUCCESS', message: 'Webhook removed.' })),
  };
  const opened: { component: unknown; data: any }[] = [];
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    provideRouter([]),
    { provide: ApiClientsApi, useValue: api },
    { provide: AuthService, useValue: { canBuild: signal(!options.locked), builderLocked: signal(!!options.locked) } },
    { provide: Dialog, useValue: { open: (component: unknown, config: { data: any }) => {
      opened.push({ component, data: config.data });
      if (component === ClientDialog) return { closed: of({ made: MADE }) };
      if (component === WebhookDialog) return { closed: of({ made: MADE_HOOK }) };
      if (component === SecretDialog || component === RouteDialog || component === WebhookSecretDialog) return { closed: of(undefined) };
      if (component === DeliveriesDialog) return { closed: of(false) };
      return { closed: of(options.confirm ?? true) };
    } } },
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m) } },
  ] });
  const fixture = TestBed.createComponent(ApiClients);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api, opened, toasts };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('MIG-332: Integration › API Clients', () => {
  it('lists the live clients with their scopes and allowlist, revoked ones on request, and the event routes', () => {
    const { fixture, page } = setup();
    const el = fixture.nativeElement as HTMLElement;
    const table = el.querySelector('[data-api-clients]')!.textContent ?? '';
    expect(table).toContain('Order portal');
    expect(table).toContain('runs:write');
    expect(table).toContain('203.0.113.0/24');
    expect(table).not.toContain('Old sync');
    page.showRevoked.set(true);
    fixture.detectChanges();
    expect(el.querySelector('[data-api-clients]')!.textContent).toContain('Old sync');
    const routes = el.querySelector('[data-event-routes]')!.textContent ?? '';
    expect(routes).toContain('order.received');
    expect(routes).toContain('Orders');
    expect(el.textContent).not.toContain('cs_');
  });

  it('a new client\'s secret is shown once, in its own dialog', () => {
    const { page, opened } = setup();
    page.openNew();
    expect(opened[0].component).toBe(ClientDialog);
    expect(opened[0].data.scopes).toEqual(SCOPES);
    expect(opened[1].component).toBe(SecretDialog);
    expect(opened[1].data).toEqual({ name: 'Order portal', clientId: MADE.clientId, clientSecret: 'cs_the-secret-shown-once', rotated: false });
  });

  it('a new secret is asked for first, then shown once; a revoke is asked for first', async () => {
    const { page, api, opened, toasts } = setup();
    await page.rotate(CLIENTS[0] as any);
    await settle();
    expect(api.rotateSecret).toHaveBeenCalledWith(CLIENTS[0].clientId);
    expect(opened.find(o => o.component === SecretDialog)!.data.rotated).toBe(true);
    await page.revoke(CLIENTS[0] as any);
    await settle();
    expect(api.revoke).toHaveBeenCalledWith(CLIENTS[0].clientId);
    expect(toasts).toContain('API client revoked. Its tokens no longer work.');
  });

  it('nothing happens when the confirmation is declined', async () => {
    const { page, api } = setup({ confirm: false });
    await page.revoke(CLIENTS[0] as any);
    await page.rotate(CLIENTS[0] as any);
    await page.removeRoute(ROUTES[0] as any);
    expect(api.revoke).not.toHaveBeenCalled();
    expect(api.rotateSecret).not.toHaveBeenCalled();
    expect(api.deleteRoute).not.toHaveBeenCalled();
  });

  it('in a MANAGED workspace the event routes are read-only and say who sets them', () => {
    const { fixture } = setup({ locked: true });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('New event route');
    expect(el.querySelector('[data-event-routes]')!.textContent).not.toContain('Remove');
    expect(el.textContent).toContain('New API client');
  });

  it('a last day is the server\'s own wall-clock day', () => {
    expect(dayOf('2026-12-31T23:59:59')).toBe('2026-12-31');
    expect(dayOf(null)).toBe('');
  });
});

describe('MIG-337: limits and usage on Integration › API Clients', () => {
  it('shows each client\'s limit and calls this month, and the workspace\'s limits and quota with its warning', () => {
    const { fixture, page } = setup();
    page.showRevoked.set(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const limits = el.querySelectorAll('[data-client-limit]');
    expect(limits[0].textContent).toContain('6 a minute · burst 2');
    expect(limits[1].textContent).toContain('600 a minute · burst 100');
    expect(limits[1].textContent).toContain('the workspace\'s most');
    expect(el.querySelectorAll('[data-client-calls]')[0].textContent!.trim()).toBe('812');
    const strip = el.querySelector('[data-api-limits]')!.textContent ?? '';
    expect(strip).toContain('at most 600 calls a minute · burst 100');
    expect(strip).toContain('1,200 calls a minute');
    expect(strip).toContain('8,500 of 10,000 calls (85%)');
    expect(strip).toContain('Nearly used up');
  });

  it('Change hands the dialog the workspace\'s bounds, and a customer in a MANAGED workspace cannot set a limit', () => {
    let { page, opened } = setup();
    page.openClient(CLIENTS[0] as any);
    expect(opened[0].data.bounds).toEqual(LIMITS.bounds);
    expect(opened[0].data.canSetLimits).toBe(true);
    ({ page, opened } = setup({ locked: true }));
    page.openClient(CLIENTS[0] as any);
    expect(opened[0].data.canSetLimits).toBe(false);
  });

  it('a count that cannot be read shows a dash, not 0', () => {
    const { fixture, page } = setup();
    page.clients.set([{ ...CLIENTS[0], callsThisMonth: null } as any]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-client-calls]')!.textContent!.trim()).toBe('—');
  });
});

describe('MIG-337: a client\'s own limit in the client dialog', () => {
  function dialog(data: Record<string, unknown>) {
    const api = {
      create: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MADE })),
      update: vi.fn(() => of({ status: 'SUCCESS', message: 'Saved.', data: CLIENTS[0] })),
    };
    const ref = { close: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { scopes: SCOPES, bounds: LIMITS.bounds, ...data } },
      { provide: DialogRef, useValue: ref },
      { provide: ApiClientsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(ClientDialog);
    fixture.detectChanges();
    return { fixture, d: fixture.componentInstance, api, ref };
  }

  it('sends a limit only when it changed, 0 for the workspace\'s bound, and refuses one above the bound', () => {
    const { d, api } = dialog({ client: CLIENTS[0], canSetLimits: true });
    expect(d.rate()).toBe('6');
    d.save();
    expect(api.update).toHaveBeenLastCalledWith(expect.not.objectContaining({ ratePerMinute: expect.anything() }));
    d.rate.set('');
    d.burst.set('50');
    d.save();
    expect(api.update).toHaveBeenLastCalledWith(expect.objectContaining({ clientId: CLIENTS[0].clientId, ratePerMinute: 0, burst: 50 }));
    d.rate.set('601');
    expect(d.ready()).toBe(false);
    d.rate.set('6.5');
    expect(d.ready()).toBe(false);
  });

  it('a new client may start with a limit; a customer of a MANAGED workspace sends none and sees the fields locked', () => {
    let { d, api, fixture } = dialog({ canSetLimits: true });
    d.name.set('Tiny portal');
    d.toggle('pipelines:read');
    d.rate.set('6');
    d.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tiny portal', ratePerMinute: 6 }));
    ({ d, api, fixture } = dialog({ client: CLIENTS[0], canSetLimits: false }));
    expect((fixture.nativeElement.querySelector('#clientRate') as HTMLInputElement).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Our team sets this workspace\'s API limits.');
    d.rate.set('30');
    d.save();
    expect(api.update).toHaveBeenLastCalledWith(expect.not.objectContaining({ ratePerMinute: expect.anything() }));
  });
});

describe('MIG-333: webhooks on Integration › API Clients', () => {
  it('lists the webhooks with their events and state, never a secret', () => {
    const { fixture } = setup();
    const table = (fixture.nativeElement as HTMLElement).querySelector('[data-webhooks]')!.textContent ?? '';
    expect(table).toContain('https://portal.example.com/hooks');
    expect(table).toContain('run.completed');
    expect(table).toContain('Failing');
    expect(table).toContain('Paused');
    expect(table).toContain('Paused by its owner.');
    expect(table).toContain('Added by alice@northwind.example');
    expect(table).not.toContain('whsec_');
  });

  it('a new webhook\'s secret is shown once, in its own dialog', () => {
    const { page, opened } = setup();
    page.openWebhook(null);
    expect(opened[0].component).toBe(WebhookDialog);
    expect(opened[0].data.eventTypes).toEqual(EVENT_TYPES);
    expect(opened[1].component).toBe(WebhookSecretDialog);
    expect(opened[1].data).toEqual({ url: MADE_HOOK.url, secret: 'whsec_shown-once', rotated: false });
  });

  it('pausing is asked for first; resuming is not; a new secret and a removal are asked for first', async () => {
    const { page, api, opened, toasts } = setup();
    await page.setWebhookActive(WEBHOOKS[0] as any, false);
    await settle();
    expect(api.updateWebhook).toHaveBeenCalledWith({ webhookId: '1000', active: false });
    expect(toasts).toContain('Webhook paused.');
    await page.setWebhookActive(WEBHOOKS[1] as any, true);
    expect(api.updateWebhook).toHaveBeenCalledWith({ webhookId: '1001', active: true });
    await page.rotateWebhook(WEBHOOKS[0] as any);
    await settle();
    expect(api.rotateWebhookSecret).toHaveBeenCalledWith('1000');
    expect(opened.find(o => o.component === WebhookSecretDialog)!.data.rotated).toBe(true);
    await page.removeWebhook(WEBHOOKS[1] as any);
    await settle();
    expect(api.deleteWebhook).toHaveBeenCalledWith('1001');
  });

  it('nothing is paused or removed when the confirmation is declined', async () => {
    const { page, api } = setup({ confirm: false });
    await page.setWebhookActive(WEBHOOKS[0] as any, false);
    await page.removeWebhook(WEBHOOKS[0] as any);
    await page.rotateWebhook(WEBHOOKS[0] as any);
    expect(api.updateWebhook).not.toHaveBeenCalled();
    expect(api.deleteWebhook).not.toHaveBeenCalled();
    expect(api.rotateWebhookSecret).not.toHaveBeenCalled();
  });

  it('in a MANAGED workspace the webhooks are read but not made', () => {
    const { fixture, page, opened } = setup({ locked: true });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('New webhook');
    expect(el.querySelector('[data-webhooks]')!.textContent).toContain('https://portal.example.com/hooks');
    page.openDeliveries(WEBHOOKS[0] as any);
    expect(opened[0].component).toBe(DeliveriesDialog);
  });
});

describe('MIG-333: the webhook dialog', () => {
  function dialog(webhook: unknown = null) {
    const api = {
      createWebhook: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MADE_HOOK })),
      updateWebhook: vi.fn(() => of({ status: 'SUCCESS', message: 'Webhook saved.', data: WEBHOOKS[0] })),
    };
    const ref = { close: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { eventTypes: EVENT_TYPES, webhook } },
      { provide: DialogRef, useValue: ref },
      { provide: ApiClientsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(WebhookDialog);
    fixture.detectChanges();
    return { fixture, d: fixture.componentInstance, api, ref };
  }

  it('needs a URL and an event type, and sends the types in the catalogue\'s order', () => {
    const { d, api, ref } = dialog();
    expect(d.ready()).toBe(false);
    d.url.set('https://portal.example.com/hooks');
    expect(d.ready()).toBe(false);
    d.toggle('run.failed', true);
    d.toggle('run.completed', true);
    expect(d.ready()).toBe(true);
    d.save();
    expect(api.createWebhook).toHaveBeenCalledWith({ url: 'https://portal.example.com/hooks', eventTypes: ['run.completed', 'run.failed'] });
    expect(ref.close).toHaveBeenCalledWith({ made: MADE_HOOK });
  });

  it('a change keeps the webhook and says what the platform refused', () => {
    const { d, api, ref, fixture } = dialog(WEBHOOKS[0]);
    expect(d.url()).toBe(WEBHOOKS[0].url);
    api.updateWebhook.mockReturnValueOnce(of({ status: 'ERROR', message: 'url names a private, loopback, link-local or metadata address; '
      + 'a webhook must be a public address.', data: undefined } as any));
    d.url.set('https://10.0.0.5/hooks');
    d.save();
    fixture.detectChanges();
    expect(api.updateWebhook).toHaveBeenCalledWith({ webhookId: '1000', url: 'https://10.0.0.5/hooks', eventTypes: ['run.completed', 'run.failed'] });
    expect(ref.close).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('a webhook must be a public address');
  });
});

describe('MIG-333: the deliveries dialog', () => {
  const DELIVERIES = [
    { id: '7', eventId: 'e-2', eventType: 'run.failed', attempt: 2, status: 'retrying', responseStatus: 500, durationMs: 40,
      nextAttemptAt: '2026-10-06T15:01:00Z', createdAt: '2026-10-06T15:00:00Z', lastAttemptAt: '2026-10-06T15:00:30Z', deliveredAt: null,
      error: 'The receiver answered 500.', redeliveryOf: null },
    { id: '6', eventId: 'e-1', eventType: 'run.completed', attempt: 1, status: 'delivered', responseStatus: 204, durationMs: 12,
      nextAttemptAt: null, createdAt: '2026-10-06T14:00:00Z', lastAttemptAt: '2026-10-06T14:00:01Z', deliveredAt: '2026-10-06T14:00:01Z',
      error: null, redeliveryOf: null },
  ];

  function deliveries(webhook = WEBHOOKS[0]) {
    const api = {
      deliveries: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DELIVERIES })),
      attempts: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ attempt: 1, at: '2026-10-06T15:00:00Z', outcome: 'failed',
        responseStatus: 500, durationMs: 40, error: 'The receiver answered 500.' }] })),
      redeliver: vi.fn(() => of({ status: 'SUCCESS', message: 'Sent again.', data: { ...DELIVERIES[1], id: '8', status: 'pending',
        attempt: 0, redeliveryOf: '6' } })),
    };
    const ref = { close: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { webhook } },
      { provide: DialogRef, useValue: ref },
      { provide: ApiClientsApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(DeliveriesDialog);
    fixture.detectChanges();
    return { fixture, d: fixture.componentInstance, api, ref };
  }

  it('lists what was sent, newest first, with the last answer and the attempts on request', () => {
    const { fixture, d, api } = deliveries();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.querySelector('[data-deliveries]')!.textContent ?? '';
    expect(api.deliveries).toHaveBeenCalledWith('1000', null, 50);
    expect(text).toContain('Retrying');
    expect(text).toContain('Delivered');
    expect(text).toContain('The receiver answered 500.');
    d.toggle(DELIVERIES[0] as any);
    fixture.detectChanges();
    expect(api.attempts).toHaveBeenCalledWith('1000', '7');
    expect(el.querySelector('[data-attempts]')!.textContent).toContain('failed');
  });

  it('Send again sends the event as a new delivery and the page refreshes when it closes', () => {
    const { d, api, ref } = deliveries();
    d.resend(DELIVERIES[1] as any);
    expect(api.redeliver).toHaveBeenCalledWith('1000', '6');
    expect(d.rows()[0].id).toBe('8');
    expect(d.sent()).toBe(true);
    d.ref.close(d.sent());
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('a paused webhook sends nothing again until it is resumed', () => {
    const { fixture } = deliveries(WEBHOOKS[1] as any);
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .filter(b => (b.getAttribute('aria-label') ?? '').includes('again')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(b => b.disabled)).toBe(true);
  });
});

describe('MIG-332: the secret dialog', () => {
  it('says the secret is not shown again, and copies it', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { name: 'Order portal', clientId: 'cl_x', clientSecret: 'cs_y', rotated: false } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(SecretDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-secret-shown]')!.textContent).toContain('it is not shown again');
    expect((el.querySelector('input[aria-label="Client secret"]') as HTMLInputElement).value).toBe('cs_y');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
    await fixture.componentInstance.copy('cs_y', 'secret');
    expect(fixture.componentInstance.copied()).toBe('secret');
  });
});
