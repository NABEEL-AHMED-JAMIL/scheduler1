import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { BillingAnalyticsPage } from './billing-analytics';
import { BillingApi } from './billing.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';

/**
 * Billing › Analytics (owner #22, 2026-10-19; MIG-211's platform view before it): the trends -- by month, service and
 * pipeline -- for whoever opens it, scoped by the server (a workspace administrator's own); the cross-customer revenue
 * only for a platform administrator over every workspace. Months named as the console names them, workspaces that share a
 * name told apart, statuses in sentence case, and tables that scroll inside their card on a phone.
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

const TRENDS = {
  tenantId: null, from: '2026-05-01', to: '2026-10-19', total: '12.50000',
  months: [{ month: '2026-09', amount: '4.50000', byService: { Pipelines: '4.50000' } }, { month: '2026-10', amount: '8.00000', byService: { Pipelines: '5', 'Model calls': '3' } }],
  byService: [{ service: 'Pipelines', amount: '9.50000' }, { service: 'Model calls', amount: '3.00000' }],
  byWorkspace: [{ tenantId: 2905, amount: '10' }, { tenantId: 2901, amount: '2.5' }],
};
const OWN_TRENDS = { ...TRENDS, tenantId: 2960, byWorkspace: undefined,
  byPipeline: [{ taskDetailId: 1, pipeline: 'Patient 360', runs: 12, cost: '7.25', lastRunAt: '2026-10-19T06:04:00Z' }] };

function page(data: object = DATA, payments: object[] = [], role: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' = 'PLATFORM_ADMIN', trends: object = TRENDS,
              over: Record<string, () => Observable<unknown>> = {}) {
  const api = { analytics: vi.fn(() => of({ status: API_SUCCESS, data })), payments: vi.fn(() => of({ status: API_SUCCESS, data: payments })),
    costTrends: vi.fn(() => of({ status: API_SUCCESS, data: trends })), ...over };
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({ imports: [BillingAnalyticsPage], providers: [provideRouter([]),
    { provide: BillingApi, useValue: api },
    { provide: AuthService, useValue: { isPlatformAdmin: () => role === 'PLATFORM_ADMIN', isManagedSession: () => false,
      user: () => ({ tenantName: role === 'PLATFORM_ADMIN' ? null : 'Riverside Health' }) } },
  ] });
  TestBed.inject(WorkspaceDirectory).workspaces.set(TENANTS);
  const fixture = TestBed.createComponent(BillingAnalyticsPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api };
}

describe('BillingAnalyticsPage', () => {
  beforeEach(() => sessionStorage.clear());
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
    expect(tables.length).toBe(5);   // trends: by service, by workspace; revenue: by workspace, usage and churn, payments (MIG-359)
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
    const api = { analytics: vi.fn(() => of({ status: 'FAILED', message: 'The meter did not answer.' })), payments: vi.fn(() => of({ status: API_SUCCESS, data: [] })),
      costTrends: vi.fn(() => of({ status: API_SUCCESS, data: TRENDS })) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BillingAnalyticsPage], providers: [provideRouter([]),
      { provide: BillingApi, useValue: api },
      { provide: AuthService, useValue: { isPlatformAdmin: () => true, isManagedSession: () => false, user: () => null } },
    ] });
    const fixture = TestBed.createComponent(BillingAnalyticsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('The meter did not answer.');
    const retry = [...el.querySelectorAll<HTMLButtonElement>('[data-test="revenue"] button')].find(b => b.textContent!.includes('Try again'));
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

  it('owner #22: a workspace administrator sees their own trends -- by month, service and pipeline -- and never the revenue', () => {
    const { api, el, component } = page(DATA, [], 'TENANT_ADMIN', OWN_TRENDS);
    expect(api.costTrends).toHaveBeenCalledWith(expect.any(String), expect.any(String), null);
    expect(api.analytics).not.toHaveBeenCalled();
    expect(api.payments).not.toHaveBeenCalled();
    expect(el.querySelector('[data-test="revenue"]')).toBeNull();
    expect(el.querySelector('[data-test="workspace-select"]')).toBeNull();
    expect(el.querySelector('[data-test="cost-by-pipeline"]')!.textContent).toContain('Patient 360');
    expect(el.querySelector('[data-test="cost-by-workspace"]')).toBeNull();
    expect(component.monthBars().map(b => b.name)).toEqual(['Sep 2026', 'Oct 2026']);
    expect(component.scopeName()).toBe('Riverside Health');
  });

  it('owner #22: the platform sees every workspace by workspace with the revenue, or one workspace\'s trends alone', () => {
    const all = page();
    expect(all.api.costTrends).toHaveBeenCalledWith(expect.any(String), expect.any(String), null);
    expect(all.api.analytics).toHaveBeenCalled();
    expect(all.el.querySelector('[data-test="revenue"]')).not.toBeNull();
    expect(all.el.querySelector('[data-test="cost-by-workspace"]')!.textContent).toContain('MedAxis Care Network (#2905)');

    all.component.pickWorkspace(2905);
    all.fixture.detectChanges();
    expect(all.api.costTrends).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 2905);
    expect(all.api.analytics).toHaveBeenCalledTimes(1);
    expect(all.el.querySelector('[data-test="revenue"]')).toBeNull();
  });
});

describe('BillingAnalyticsPage -- sorting (owner 2026-10-27)', () => {
  beforeEach(() => sessionStorage.clear());
  it('keeps usage and churn most-deleted first, and sorts it by metered cost both ways', () => {
    const { component } = page();
    expect(component.sortedChurn().map(c => c.tenantId)).toEqual([2905, 3107, 2901]);
    component.churnSort.toggle('cost');
    expect(component.sortedChurn().map(c => c.tenantId)).toEqual([2905, 3107, 2901]);
    component.churnSort.toggle('cost');
    expect(component.sortedChurn().map(c => c.tenantId)).toEqual([2901, 3107, 2905]);
  });

  it('sorts By service and By workspace by their names', () => {
    const { component } = page();
    component.serviceSort.toggle('service');
    expect(component.sortedServices().map(s => s.service)).toEqual(['Model calls', 'Pipelines']);
    component.workspaceSort.toggle('cost');
    expect(component.sortedWorkspaces().map(w => w.tenantId)).toEqual([2905, 2901]);
    component.workspaceSort.toggle('cost');
    expect(component.sortedWorkspaces().map(w => w.tenantId)).toEqual([2901, 2905]);
  });
});

describe('BillingAnalyticsPage -- loading, empty, error (owner 2026-10-27)', () => {
  beforeEach(() => sessionStorage.clear());
  it('is loading, not empty, until the trends and the payments answer', () => {
    const { component, el } = page(DATA, [], 'PLATFORM_ADMIN', TRENDS, { costTrends: () => NEVER, analytics: () => NEVER, payments: () => NEVER });
    expect(component.trendsLoading()).toBe(true);
    expect(component.loading()).toBe(true);
    expect(component.paymentsLoading()).toBe(true);
    expect(el.textContent).not.toContain('Nothing used in this range.');
    expect(el.textContent).not.toContain('No invoice in this range.');
  });

  it('says nothing was used once an empty range answers', () => {
    const empty = { ...TRENDS, total: '0', months: [], byService: [], byWorkspace: [] };
    const { component, el } = page(DATA, [], 'PLATFORM_ADMIN', empty);
    expect(component.trendsLoading()).toBe(false);
    expect(component.sortedServices()).toEqual([]);
    expect(el.querySelector('[data-test="cost-by-service"]')!.textContent).toContain('Nothing used in this range.');
    expect(el.querySelector('[data-payments]')!.textContent).toContain('No payment yet.');
  });

  it('says the trends and the payments could not be read, in plain words, with Try again', () => {
    const fail = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
    const { component, el, fixture } = page(DATA, [], 'PLATFORM_ADMIN', TRENDS, { costTrends: fail, payments: fail });
    fixture.detectChanges();
    expect(component.trendsLoading()).toBe(false);
    expect(component.trendsError()).toBe('The cost trends could not be read.');
    expect(component.paymentsError()).toBe('The payments could not be read.');
    expect(el.querySelector('[data-payments]')!.textContent).not.toContain('No payment yet.');
    expect(el.querySelector('[data-test="cost-trends"]')!.textContent).toContain('Try again');
  });
});
