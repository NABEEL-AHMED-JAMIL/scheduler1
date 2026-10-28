import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ApiClientsApi } from './api-clients.api';
import { DeliveriesDialog } from './deliveries-dialog';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * Owner 2026-10-27 ("add a sort on each table"): a webhook's delivery log sorts on the server. No sort is sent before a
 * heading is picked (the newest-first cursor pages as before); a picked order reads again from the first page, and "More
 * deliveries" pages on by offset, never by the newest-first cursor.
 */
const WEBHOOK = { id: '1000', url: 'https://hooks.example.test/a', eventTypes: ['run.completed'], active: true, pausedReason: null, createdAt: null,
  updatedAt: null, failingSince: null, lastSuccessAt: null, secretRotatedAt: null, previousSecretValidUntil: null, tenantId: 2960 };
const row = (id: number) => ({ id: String(id), eventId: 'e-' + id, eventType: 'run.completed', attempt: 1, status: 'delivered', responseStatus: 204,
  durationMs: 4, nextAttemptAt: null, createdAt: '2026-10-06T14:00:00Z', lastAttemptAt: null, deliveredAt: null, error: null, redeliveryOf: null });
const PAGE = Array.from({ length: 50 }, (_, i) => row(200 - i));

function open() {
  const api = {
    deliveries: vi.fn(() => of({ status: 'SUCCESS', message: '', data: PAGE })),
    attempts: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    redeliver: vi.fn(() => of({ status: 'SUCCESS', message: 'Sent again.', data: row(300) })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    { provide: DIALOG_DATA, useValue: { webhook: WEBHOOK } },
    { provide: DialogRef, useValue: { close: vi.fn() } },
    { provide: ApiClientsApi, useValue: api },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(DeliveriesDialog);
  fixture.detectChanges();
  return { fixture, d: fixture.componentInstance, api, el: fixture.nativeElement as HTMLElement };
}

describe('Deliveries dialog -- sorted on the server (owner 2026-10-27)', () => {
  it('sends no sort before a heading is picked, and pages older by the cursor as before', () => {
    const { d, api, el } = open();
    expect(api.deliveries).toHaveBeenCalledWith('1000', null, 50, undefined);
    expect(el.querySelectorAll('[data-deliveries] th button.th-sort').length).toBe(4);
    d.older();
    expect(api.deliveries).toHaveBeenLastCalledWith('1000', '151', 50, undefined);
  });

  it('reads a picked order from the first page, then pages on by offset, never by the cursor', () => {
    const { d, api } = open();
    d.sort.toggle('attempts');
    expect(api.deliveries).toHaveBeenLastCalledWith('1000', null, 50, undefined, { sort: 'attempts', dir: 'desc', offset: 0 });
    expect(d.rows()).toHaveLength(50);
    d.older();
    expect(api.deliveries).toHaveBeenLastCalledWith('1000', null, 50, undefined, { sort: 'attempts', dir: 'desc', offset: 50 });
    expect(d.rows()).toHaveLength(100);
    d.sort.toggle('attempts');
    expect(api.deliveries).toHaveBeenLastCalledWith('1000', null, 50, undefined, { sort: 'attempts', dir: 'asc', offset: 0 });
    expect(d.rows()).toHaveLength(50);
    d.sort.toggle('when');
    expect(api.deliveries).toHaveBeenLastCalledWith('1000', null, 50, undefined, { sort: 'when', dir: 'desc', offset: 0 });
  });

  it('in a picked order, Send again reads the log again rather than putting the new one on top', () => {
    const { d, api } = open();
    d.sort.toggle('event');
    const reads = api.deliveries.mock.calls.length;
    d.resend(row(150) as never);
    expect(api.deliveries.mock.calls.length).toBe(reads + 1);
    expect(d.rows()[0].id).toBe('200');
  });
});
