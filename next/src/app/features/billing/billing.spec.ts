import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { Billing } from './billing';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * Cost & usage reads the meter's priced rollup and shows it as the invoice will: the same
 * lines, the same total, with the deletes called out and a forecast that says it is a guess.
 */
function page(platformAdmin = false, rows: object[] = LINES, days: object[] = DAYS) {
  const get = vi.fn((url: string, options?: { params?: Record<string, string> }) => {
    if (url.endsWith('/billing.json/usage')) return of({ status: API_SUCCESS, data: { rows: options?.params?.['groupBy'] === 'day' ? days : rows } });
    if (url.endsWith('/billing.json/rateCard')) return of({ status: API_SUCCESS, data: { version: 1, currency: 'USD' } });
    if (url.endsWith('/billing.json/subjects')) return of({ status: API_SUCCESS, data: { rows: [
      { subject_type: 'object', subject_id: 'medaxis/sales/orders.csv', quantity: '2.0', events: 1, last: '2026-09-18T10:00:00Z', actor_user_id: 4385 },
    ] } });
    if (url.endsWith('/tenant.json/listTenants')) return of({ status: API_SUCCESS, data: [{ tenantId: 2905, tenantName: 'MedAxis' }, { tenantId: 2901, tenantName: 'CareBridge' }] });
    throw new Error('unexpected GET ' + url);
  });
  const post = vi.fn(() => of({ status: API_SUCCESS }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get, post } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new Billing());
  component.ngOnInit();
  return { component, get, post };
}

const LINES = [
  { meter: 'seats.user_days', label: 'Seats', service: 'Seats', unit: 'user-day', per: 1, unitPrice: '0.33', quantity: '140', amount: '46.2', days: 10 },
  { meter: 'storage.bytes.deleted', label: 'Bytes deleted (data churn)', service: 'Storage', unit: 'byte', per: 1073741824, unitPrice: '0.01', quantity: '41016604262', amount: '0.382', days: 3 },
  { meter: 'storage.ops.delete', label: 'Storage deletes', service: 'Storage', unit: 'op', per: 1000, unitPrice: '0.005', quantity: '1204', amount: '0.00602', days: 3 },
  { meter: 'storage.gb_hours', label: 'Storage kept', service: 'Storage', unit: 'GB-hour', per: 1, unitPrice: '0.000032', quantity: '50880', amount: '1.62816', days: 10 },
  { meter: 'ai.tokens.in', label: 'Model tokens in', service: 'Model calls', unit: 'token', per: 1000, unitPrice: '0.05', quantity: '42100', amount: '2.105', days: 4 },
];
const DAYS = [
  { day: '2026-09-16', amount: '5.0', byService: { Seats: '4.62', Storage: '0.38' } },
  { day: '2026-09-17', amount: '6.0', byService: { Seats: '4.62', Storage: '0.38', 'Model calls': '1.0' } },
  { day: '2026-09-18', amount: '9.8', byService: { Seats: '4.62', Storage: '0.38', 'Model calls': '4.8' } },
];

describe('Billing', () => {
  it('shows the lines the invoice will carry, largest service first, and the deletes called out', () => {
    const { component } = page();
    expect(component.lines().map(l => l.meter)).toContain('storage.bytes.deleted');
    expect(component.total()).toBeCloseTo(50.32118, 4);
    expect(component.byService().map(s => s.service)).toEqual(['Storage', 'Model calls', 'Seats']);
    expect(component.byService().find(s => s.service === 'Storage')?.amount).toBeCloseTo(2.01618, 4);
    expect(component.deletedBytes()).toBe(41016604262);
    expect(component.fmtBytes(41016604262)).toBe('38.2 GB');
    expect(component.fmtRate(component.lines()[1])).toBe('$0.01 per GB');
    expect(component.deleteOps()).toBe(1204);
    expect(component.churnAmount()).toBeCloseTo(0.38802, 4);
    expect(component.seats()).toBe(14);
    expect(component.storedGbDays()).toBe(2120);
    expect(component.fmtMoney(0.00602)).toBe('$0.0060');
    expect(component.fmtMoney(46.2)).toBe('$46.20');
    expect(component.fmtRate(component.lines()[2])).toBe('$0.0050 / 1,000 per op');
    expect(component.fmtRate(component.lines()[3])).toBe('$0.000032 per GB-hour');
    expect(component.fmtBytes(2048)).toBe('2 KB');
    expect(component.fmtBytes(900)).toBe('900 B');
    expect(component.fmtGb(0.43 / 1024)).toBe('440.3 KB');
    expect(component.fmtGb(12 / 1024)).toBe('12 MB');
    expect(component.fmtGb(38.2)).toBe('38.2 GB');
    expect(component.fmtQuantity({ ...component.lines()[2], unit: 'minute', quantity: 0.0017 })).toBe('0.1 s');
  });

  it('stacks each day by service and forecasts at the last week\'s pace, only for the open month', () => {
    const { component } = page();
    expect(component.dayBars().map(b => b.name)).toEqual(['09-16', '09-17', '09-18']);
    expect(component.dayBars()[2].segments?.map(s => s.label)).toEqual(['Seats', 'Storage', 'Model calls']);
    expect(component.yesterday()).toBe(6.0);
    if (component.isCurrentMonth()) {
      const perDay = (5 + 6 + 9.8) / 3;
      expect(component.forecast()).toBeCloseTo(component.total() + perDay * (component.daysInMonth() - component.daysElapsed()), 6);
    } else {
      expect(component.forecast()).toBeNull();
    }
  });

  it('a line opens to the subjects behind it -- the object deleted, and by whom', () => {
    const { component, get } = page();
    component.toggleLine(component.lines()[1]);
    expect(get).toHaveBeenLastCalledWith(expect.stringContaining('/billing.json/subjects'), { params: expect.objectContaining({ meter: 'storage.bytes.deleted', limit: '25' }) });
    expect(component.subjects()[0].subject_id).toBe('medaxis/sales/orders.csv');
    expect(component.subjectLabel(component.subjects()[0])).toBe('medaxis/sales/orders.csv');
    component.toggleLine(component.lines()[1]);
    expect(component.openLine()).toBeNull();
  });

  it('a platform admin picks a workspace and the reads carry it; a tenant admin never does', () => {
    const admin = page(true);
    expect(admin.component.tenantOptions().map(o => o.label)).toEqual(['MedAxis', 'CareBridge']);
    expect(admin.component.tenantId()).toBe('2905');
    expect(admin.get).toHaveBeenCalledWith(expect.stringContaining('/billing.json/usage'), { params: expect.objectContaining({ tenantId: '2905', groupBy: 'meter' }) });
    admin.component.pickTenant('2901');
    expect(admin.get).toHaveBeenLastCalledWith(expect.stringContaining('/billing.json/usage'), { params: expect.objectContaining({ tenantId: '2901' }) });

    const tenant = page(false);
    const usageCall = tenant.get.mock.calls.find(c => String(c[0]).endsWith('/billing.json/usage'))!;
    expect((usageCall[1] as any).params.tenantId).toBeUndefined();
  });

  it('says plainly when the console has no meter', () => {
    const get = vi.fn((url: string) => url.endsWith('/rateCard') ? of({ status: 'ERROR', message: 'Metering is not configured on this console.' })
      : of({ status: 'ERROR', message: 'Metering is not configured on this console.' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get, post: () => of({}) } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ] });
    const component = TestBed.runInInjectionContext(() => new Billing());
    component.ngOnInit();
    expect(component.notConfigured()).toBe(true);
    expect(component.error()).toBe('');
  });

  it('months step back and never forward past today', () => {
    const { component } = page();
    const start = component.month();
    component.shiftMonth(-1);
    expect(component.month() < start).toBe(true);
    expect(component.isCurrentMonth()).toBe(false);
    expect(component.forecast()).toBeNull();
    component.shiftMonth(1);
    expect(component.month()).toBe(start);
    expect(Billing.daysInMonth(new Date('2026-02-10T00:00:00'))).toBe(28);
    expect(Billing.firstOfMonth(new Date('2026-09-18T00:00:00'))).toBe('2026-09-01');
  });
});
