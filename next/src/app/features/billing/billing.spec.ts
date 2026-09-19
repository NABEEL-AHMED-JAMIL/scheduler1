import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Billing } from './billing';
import { BillingApi, UsageQuery } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { daysInMonth, firstOfMonth } from './billing-format';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * Cost & usage reads the meter's priced rollup and shows it as the invoice will: the same
 * lines, the same total, with the deletes called out and a forecast that says it is a guess.
 */
function page(platformAdmin = false, rows: object[] = LINES, days: object[] = DAYS) {
  const api = {
    usageByMeter: vi.fn((q: UsageQuery) => of({ status: API_SUCCESS, data: { rows, rateCard: { version: 2, name: 'Standard, churn free', currency: 'USD', tenantSpecific: false, effectiveFrom: '2026-09-01' } } })),
    usageByDay: vi.fn(() => of({ status: API_SUCCESS, data: { rows: days } })),
    subjects: vi.fn(() => of({ status: API_SUCCESS, data: { rows: [
      { subject_type: 'object', subject_id: 'medaxis/sales/orders.csv', quantity: '2.0', events: 1, last: '2026-09-18T10:00:00Z', actor_user_id: 4385 },
    ] } })),
    refreshUsage: vi.fn(() => of({ status: API_SUCCESS })),
  };
  // The picker holds no choice until one is made; Cost & usage reads `effective`, the first
  // workspace, because it must look at one -- Invoices reads the choice itself (every workspace).
  const tenantId = { value: null as string | null };
  const options = platformAdmin ? [{ value: '2905', label: 'MedAxis' }, { value: '2901', label: 'CareBridge' }] : [];
  const workspaces = {
    tenantId: Object.assign(() => tenantId.value, { set: (v: string | null) => { tenantId.value = v; } }),
    effective: () => tenantId.value ?? options[0]?.value ?? null,
    options: () => options,
    ready: (then: () => void) => then(), isPlatformAdmin: () => platformAdmin,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: api }, { provide: WorkspacePicker, useValue: workspaces },
    { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new Billing());
  component.ngOnInit();
  return { component, api };
}

const LINES = [
  { meter: 'seats.user_days', label: 'Seats', service: 'Seats', unit: 'user-day', per: 1, unitPrice: '0.33', quantity: '140', amount: '46.2', days: 10 },
  { meter: 'storage.bytes.deleted', label: 'Bytes deleted (data churn)', service: 'Storage', unit: 'byte', per: 1073741824, unitPrice: '0.01', quantity: '41016604262', amount: '0.382', days: 3 },
  { meter: 'storage.ops.delete', label: 'Storage deletes', service: 'Storage', unit: 'op', per: 1000, unitPrice: '0.005', quantity: '1204', amount: '0.00602', days: 3 },
  { meter: 'storage.gb_hours', label: 'Storage kept', service: 'Storage', unit: 'GB-hour', per: 1, unitPrice: '0.000032', quantity: '50880', amount: '1.62816', days: 10 },
  { meter: 'ai.tokens.in', label: 'Model tokens in', service: 'Model calls', unit: 'token', per: 1000, unitPrice: '0.05', quantity: '42100', amount: '2.105', days: 4,
    includedQuantity: '1000', billableQuantity: '41100', hasTiers: true, tiers: [{ from: '0', to: '1500', units: '1500', unit_price: '0.05' }, { from: '1500', to: null, units: '39600', unit_price: '0.02' }] },
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
    expect(component.fmtMoney(0.00602)).toBe('$0.0060');
    expect(component.fmtMoney(46.2)).toBe('$46.20');
    expect(component.fmtRate(component.lines()[2])).toBe('$0.005 / 1,000 per op');
    expect(component.fmtRate(component.lines()[3])).toBe('$0.000032 per GB-hour');
    // The card that priced the month is named, and a line with an allowance or tiers says what applied.
    expect(component.rateCard()?.name).toBe('Standard, churn free');
    const tokens = component.lines()[4];
    expect(component.fmtRate(tokens)).toBe('tiered');
    expect(tokens.includedQuantity).toBe(1000);
    expect(component.fmtUnits(tokens, tokens.billableQuantity)).toBe('41,100');
    expect(tokens.tiers.map(t => component.fmtUnitPrice(t.unit_price, tokens.per, tokens.unit))).toEqual(['$0.05 / 1,000 per token', '$0.02 / 1,000 per token']);
    expect(component.fmtBytes(2048)).toBe('2 KB');
    expect(component.fmtBytes(900)).toBe('900 B');
    expect(component.fmtGb(0.43 / 1024)).toBe('440.3 KB');
    expect(component.fmtGb(12 / 1024)).toBe('12 MB');
    expect(component.fmtGb(38.2)).toBe('38.2 GB');
    expect(component.fmtQuantity({ ...component.lines()[2], unit: 'minute', quantity: 0.0017 })).toBe('0.1 s');
  });

  it('stacks each day by service and forecasts at the last seven calendar days\' pace, only for the open month', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T10:00:00'));
    try {
      const { component } = page();
      expect(component.dayBars().map(b => b.name)).toEqual(['09-16', '09-17', '09-18']);
      expect(component.dayBars()[2].segments?.map(s => s.label)).toEqual(['Seats', 'Storage', 'Model calls']);
      expect(component.yesterday()).toBe(9.8);                                   // the 18th, by date
      // Seven calendar days back from the 19th: the 12th..18th -- four quiet days count as zero.
      const perDay = (5 + 6 + 9.8) / 7;
      expect(component.forecast()).toBeCloseTo(component.total() + perDay * (component.daysInMonth() - 19), 6);
      component.shiftMonth(-1);
      expect(component.forecast()).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('storage kept is averaged over the nights measured, not the month', () => {
    const { component } = page();
    expect(component.storedNights()).toBe(10);
    expect(component.storedGbAverage()).toBe(212);                                // 50,880 GB-h / 24 / 10 nights
  });

  it('a line opens to the subjects behind it -- the object deleted, and by whom', () => {
    const { component, api } = page();
    component.toggleLine(component.lines()[1]);
    expect(api.subjects).toHaveBeenLastCalledWith(expect.objectContaining({ from: expect.stringMatching(/-01$/) }), 'storage.bytes.deleted', 25);
    expect(component.subjects()[0].subject_id).toBe('medaxis/sales/orders.csv');
    expect(component.subjectLabel(component.subjects()[0])).toBe('medaxis/sales/orders.csv');
    component.toggleLine(component.lines()[1]);
    expect(component.openLine()).toBeNull();
  });

  it('a platform admin picks a workspace and the reads carry it; a tenant admin never does', () => {
    const admin = page(true);
    expect(admin.component.workspaces.options().map(o => o.label)).toEqual(['MedAxis', 'CareBridge']);
    expect(admin.api.usageByMeter).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '2905' }));
    admin.component.pickTenant('2901');
    expect(admin.api.usageByMeter).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: '2901' }));

    const tenant = page(false);
    expect(tenant.api.usageByMeter).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: null }));
  });

  it('says plainly when the console has no meter', () => {
    const off = () => of({ status: 'ERROR', message: 'Metering is not configured on this console.' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApi, useValue: { usageByMeter: off, usageByDay: off, subjects: off, refreshUsage: off } },
      { provide: WorkspacePicker, useValue: { tenantId: () => null, effective: () => null, options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => false } },
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
    expect(daysInMonth(new Date('2026-02-10T00:00:00'))).toBe(28);
    expect(firstOfMonth(new Date('2026-09-18T00:00:00'))).toBe('2026-09-01');
  });
});
