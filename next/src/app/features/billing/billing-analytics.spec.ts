import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BillingAnalyticsPage } from './billing-analytics';
import { BillingApi } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * The platform's view of billing (MIG-211): months named as the console names them, workspaces
 * that share a name told apart, statuses in sentence case, and tables that scroll inside their
 * card on a phone rather than pushing the whole page sideways.
 */
const DATA = {
  invoiced: '0.51', collected: '0', open: '0.51', overdue: '0', overdueCount: 0, drafts: '0', medianDaysToPay: 0, pendingPayments: 0,
  months: [{ month: '2026-08', invoiced: '0', collected: '0' }, { month: '2026-09', invoiced: '0.51', collected: '0' }],
  tenants: [{ tenantId: 2901, tenantName: 'CareBridge Health Services', invoiced: '0.51', collected: '0', open: '0.51', overdue: '0', status: 'issued' }],
  usageByTenant: [
    { tenantId: 2905, amount: '58.23', quantityByMeter: { 'storage.bytes.deleted': 575693 } },
    { tenantId: 3107, amount: '10', quantityByMeter: {} },
    { tenantId: 2901, amount: '0.48', quantityByMeter: { 'ai.tokens.in': 600, 'ai.tokens.out': 92 } },
  ],
};
const TENANTS = [
  { tenantId: 2905, tenantName: 'MedAxis Care Network' }, { tenantId: 2901, tenantName: 'CareBridge Health Services' }, { tenantId: 3107, tenantName: 'MedAxis Care Network' },
];

function page(data: object = DATA, payments: object[] = []) {
  const api = { analytics: vi.fn(() => of({ status: API_SUCCESS, data })), payments: vi.fn(() => of({ status: API_SUCCESS, data: payments })) };
  const tenants = signal(TENANTS);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [BillingAnalyticsPage], providers: [provideRouter([]),
    { provide: BillingApi, useValue: api },
    { provide: WorkspacePicker, useValue: { tenants, ready: (then: () => void) => then() } },
  ] });
  const fixture = TestBed.createComponent(BillingAnalyticsPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('BillingAnalyticsPage', () => {
  it('names each month the way the rest of the console does, not "26-09"', () => {
    const { component } = page();
    expect(component.bars().map(b => b.name)).toEqual(['Aug 2026', 'Sep 2026']);
  });

  it('tells two workspaces with one name apart, and keeps a unique name as it is', () => {
    const { component } = page();
    expect(component.churn().map(c => c.tenantName)).toEqual(['MedAxis Care Network (#2905)', 'MedAxis Care Network (#3107)', 'CareBridge Health Services']);
  });

  it('writes an invoice status in sentence case', () => {
    const { el } = page();
    expect([...el.querySelectorAll('.pill')].map(p => p.textContent!.trim())).toContain('Issued');
  });

  it('says nothing was collected rather than "0% · median 0 days to pay", and counts one day as a day', () => {
    expect(page().component.collectedFoot()).toBe('nothing collected yet');
    const paid = page({ ...DATA, collected: '0.51', medianDaysToPay: 1 });
    expect(paid.component.collectedFoot()).toBe('100% · median 1 day to pay');
  });

  it('keeps each table inside a scroller of its own, so a phone never scrolls the page sideways', () => {
    const { el } = page();
    const tables = [...el.querySelectorAll('table')];
    expect(tables.length).toBe(3);   // by workspace, usage and churn, payments (MIG-359)
    for (const t of tables) expect(t.parentElement!.classList).toContain('overflow-x-auto');
    // A grid item will not shrink below its content unless told to; the scroller inside it then never scrolls.
    for (const card of el.querySelectorAll('.card')) if (card.parentElement!.classList.contains('grid')) expect(card.classList).toContain('min-w-0');
  });

  it('marks the chosen range as pressed, so it is not carried by an outline alone', () => {
    const { el, fixture, component } = page();
    const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('[aria-label="Range"] button')];
    expect(buttons().map(b => b.textContent!.trim())).toEqual(['Last 3 months', 'Last 6 months', 'Last 12 months']);
    expect(buttons().map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    buttons()[2].click();
    fixture.detectChanges();
    expect(component.months()).toBe(12);
    expect(buttons().map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('lists the workspaces that used a meter no card prices, and says nothing when every meter has a price', () => {
    expect(page().el.querySelector('[data-unpriced-warning]')).toBeNull();
    const usage = [{ tenantId: 2905, amount: '1', quantityByMeter: { 'new.meter': 5 }, unpricedMeters: ['new.meter'] },
      { tenantId: 2901, amount: '1', quantityByMeter: {}, unpricedMeters: [] }];
    const { component, el } = page({ ...DATA, usageByTenant: usage });
    expect(component.unpriced()).toEqual([{ tenantId: 2905, tenantName: 'MedAxis Care Network (#2905)', meters: ['new.meter'] }]);
    const warning = el.querySelector('[data-unpriced-warning]')!;
    expect(warning.textContent).toContain('no price anywhere');
    expect(warning.textContent).toContain('MedAxis Care Network (#2905): new.meter');
    expect(warning.textContent).not.toContain('CareBridge');
  });

  it('offers Try again when the read fails, and it reads again', () => {
    const api = { analytics: vi.fn(() => of({ status: 'FAILED', message: 'The meter did not answer.' })), payments: vi.fn(() => of({ status: API_SUCCESS, data: [] })) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BillingAnalyticsPage], providers: [provideRouter([]),
      { provide: BillingApi, useValue: api },
      { provide: WorkspacePicker, useValue: { tenants: signal(TENANTS), ready: (then: () => void) => then() } },
    ] });
    const fixture = TestBed.createComponent(BillingAnalyticsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('The meter did not answer.');
    const retry = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'));
    expect(retry).toBeTruthy();
    retry!.click();
    expect(api.analytics).toHaveBeenCalledTimes(2);
  });

  it('MIG-359: the platform sees every workspace\'s payments, cards through Stripe among them, declined ones said so', () => {
    const { component, fixture, el } = page(DATA, [
      { paymentId: 2, tenantId: 2905, tenantName: 'MedAxis Care Network', invoiceId: 7, invoiceNumber: 'INV-2026-10-0002', amount: '12.00', method: 'card',
        status: 'rejected', note: 'Your card was declined.', provider: 'stripe', providerPaymentId: 'pi_test_2', dateCreated: '2026-10-06T21:41:00', hasSlip: false },
      { paymentId: 1, tenantId: 2901, tenantName: 'CareBridge Health Services', invoiceId: 6, invoiceNumber: 'INV-2026-10-0001', amount: '9.67', method: 'card',
        status: 'verified', receiptNumber: 'RCP-2026-10-0001', provider: 'stripe', providerPaymentId: 'pi_test_1', dateCreated: '2026-10-06T21:40:00', hasSlip: false },
    ]);
    fixture.detectChanges();
    expect(component.cardPayments()).toHaveLength(2);
    const rows = [...el.querySelectorAll('[data-payments] tbody tr')].map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    for (const said of ['INV-2026-10-0002', 'Card · Stripe', 'pi_test_2', 'Declined']) expect(rows[0]).toContain(said);
    for (const said of ['CareBridge Health Services', '$9.67', 'Paid']) expect(rows[1]).toContain(said);
  });
});
