import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { BillingZoneDialog, monthDay } from './billing-zone-dialog';
import { BillingApi } from '../../billing/billing.service';
import { ToastService } from '../../../shared/ui/toast.service';

const ZONE = {
  tenantId: 2961, month: '2026-10', zone: 'UTC', monthStart: '2026-10-01T00:00:00Z', monthEnd: '2026-11-01T00:00:00Z', today: '2026-10-07',
  defaultZone: 'America/Chicago', nextMonth: '2026-11', nextMonthZone: 'America/Chicago', changeTakesEffect: '2026-11',
  scheduled: [{ effectiveMonth: '2026-11', zone: 'America/Chicago' }],
  history: [
    { id: 2, effectiveMonth: '2026-11', zone: 'America/Chicago', reason: 'Workspace time zones (H9): the default zone', setBy: null, setAt: '2026-10-07T13:42:38Z' },
    { id: 1, effectiveMonth: '2026-08', zone: 'UTC', reason: 'Billed in UTC days before workspace time zones (H9)', setBy: null, setAt: '2026-10-07T13:42:38Z' },
  ],
};

function dialog() {
  const api = {
    timeZone: vi.fn(() => of({ status: 'SUCCESS', message: '', data: ZONE })),
    timeZones: vi.fn(() => of({ status: 'SUCCESS', message: '', data: ['UTC', 'America/Chicago', 'Europe/London'] })),
    setTimeZone: vi.fn(() => of({ status: 'SUCCESS', message: 'Billing time zone set to Europe/London from 2026-11.', data: {} })),
  };
  const ref = { close: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    { provide: DIALOG_DATA, useValue: { tenantId: 2961, tenantName: 'Meridian Finance & Retail' } },
    { provide: DialogRef, useValue: ref },
    { provide: BillingApi, useValue: api },
    { provide: ToastService, useValue: toast },
  ] });
  const fixture = TestBed.createComponent(BillingZoneDialog);
  fixture.detectChanges();
  return { fixture, d: fixture.componentInstance, api, ref, toast };
}

describe('H9: a workspace\'s billing time zone (Administration › Tenants)', () => {
  it('says the zone of this month and the next, when a change would start, and every change recorded', () => {
    const { fixture, api } = dialog();
    expect(api.timeZone).toHaveBeenCalledWith(2961);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('This month (October 2026): UTC');
    expect(text).toContain('November 2026: America/Chicago');
    expect(text).toContain('takes effect from November 2026');
    expect(fixture.nativeElement.querySelectorAll('[data-billing-zone-history] tbody tr').length).toBe(2);
  });

  it('saves a zone from the list with its reason, and not the one the month already has', () => {
    const { d, api, ref, toast } = dialog();
    expect(d.zone()).toBe('America/Chicago');
    expect(d.ready()).toBe(false);
    d.zone.set('Mars/Base');
    expect(d.ready()).toBe(false);
    d.zone.set('Europe/London');
    d.reason.set(' The customer bills from London ');
    expect(d.ready()).toBe(true);
    d.save();
    expect(api.setTimeZone).toHaveBeenCalledWith(2961, 'Europe/London', 'The customer bills from London');
    expect(toast.success).toHaveBeenCalledWith('Billing time zone set to Europe/London from 2026-11.');
    expect(ref.close).toHaveBeenCalledWith(true);
    expect(monthDay('2026-11')).toBe('2026-11-01');
    expect(monthDay('garbage')).toBe('');
  });
});
