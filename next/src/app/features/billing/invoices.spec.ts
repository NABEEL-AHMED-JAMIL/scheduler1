import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Invoices } from './invoices';
import { BillingApi } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** The invoices list: chips that count and sum, a search, and drafting for the platform administrator only. */
const ROWS = [
  { invoiceId: 1, number: 'INV-2026-08-0003', kind: 'invoice', tenantId: 2901, tenantName: 'CareBridge', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'overdue', currency: 'USD', subtotal: '198.4', taxRatePercent: '0', tax: '0', total: '198.4', balance: '198.4', issuedAt: '2026-09-01T08:00:00Z', dueAt: '2026-09-15T08:00:00Z' },
  { invoiceId: 2, number: 'INV-2026-08-0007', kind: 'invoice', tenantId: 2905, tenantName: 'MedAxis', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'paid', currency: 'USD', subtotal: '241.1', taxRatePercent: '0', tax: '0', total: '241.1', balance: '0' },
  { invoiceId: 3, number: 'CN-2026-08-0001', kind: 'credit_note', tenantId: 2905, tenantName: 'MedAxis', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'issued', currency: 'USD', subtotal: '-36', taxRatePercent: '0', tax: '0', total: '-36', balance: '0' },
  { invoiceId: 4, number: 'INV-2026-09-0007', kind: 'invoice', tenantId: 2905, tenantName: 'MedAxis', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'draft', currency: 'USD', subtotal: '184.62', taxRatePercent: '0', tax: '0', total: '184.62', balance: '184.62' },
];

function page(platformAdmin: boolean, number: string | null = null) {
  const router = { navigate: vi.fn() };
  const api = { invoices: vi.fn(() => of({ status: API_SUCCESS, data: ROWS.map(r => ({ ...r, documentKinds: r.status === 'paid' ? ['invoice', 'payment_slip', 'receipt'] : r.status === 'draft' ? [] : ['invoice'], pendingPayments: r.number === 'INV-2026-08-0003' ? 1 : 0 })) })), draft: vi.fn(() => of({ status: API_SUCCESS, message: 'Draft built.' })), closeMonth: vi.fn(() => of({ status: API_SUCCESS, message: '2 drafts.' })), statement: vi.fn(), documentBlob: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: toast }, { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
    { provide: Router, useValue: router }, { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin } },
    { provide: ActivatedRoute, useValue: { paramMap: of(new Map(number ? [['number', number]] : [])) } },
    { provide: WorkspacePicker, useValue: { tenantId: Object.assign(() => (platformAdmin ? '2905' : null), { set: vi.fn() }), options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => platformAdmin } },
  ] });
  const component = TestBed.runInInjectionContext(() => new Invoices());
  component.ngOnInit();
  return { component, api, toast, router };
}

describe('Invoices', () => {
  it('tiles what needs attention, filters by state and search, and lists each bill\'s documents', () => {
    const { component } = page(false);
    expect(component.rows()).toHaveLength(4);
    expect(component.summary()).toMatchObject({ overdue: 1, overdueAmount: 198.4, open: 0, slips: 1, drafts: 1, paid: 1, paidAmount: 241.1 });
    expect(component.counts()['overdue']).toBe(1);
    expect(component.counts()['issued']).toBe(1);                       // the credit note's state counts in the filter…
    expect(component.summary().open).toBe(0);                           // …but not as money to collect
    component.status.set('overdue');
    expect(component.visible().map(r => r.number)).toEqual(['INV-2026-08-0003']);
    component.clearFilters();
    component.search.set('medaxis');
    expect(component.visible()).toHaveLength(3);
    expect(component.money(198.4)).toBe('$198.40');
    expect(component.overdueDays(component.rows()[0])).toBeGreaterThan(0);
    expect(component.tone(component.rows()[0])).toBe('crit');
    expect(component.docsLabel(component.rows()[0])).toBe('PDF · slip pending');
    expect(component.docsLabel(component.rows()[1])).toBe('PDF · slip · receipt');
    expect(component.docsLabel(component.rows()[3])).toBe('');
  });

  it('selects the overdue bill first, or the one the address names, and writes the number to the address', () => {
    const { component, router } = page(false);
    expect(component.selectedNumber()).toBe('INV-2026-08-0003');
    expect(router.navigate).toHaveBeenCalledWith(['/billing/invoices', 'INV-2026-08-0003'], { replaceUrl: true });
    const deep = page(false, 'INV-2026-09-0007');
    expect(deep.component.selectedNumber()).toBe('INV-2026-09-0007');
    expect(deep.router.navigate).not.toHaveBeenCalled();
    // A number that is not in this list is kept, not swapped for the first row: the pane reads
    // it by number and says why it cannot, which is the truthful answer to a wrong address.
    const foreign = page(false, 'INV-2026-09-9999');
    expect(foreign.component.selectedNumber()).toBe('INV-2026-09-9999');
    expect(foreign.router.navigate).not.toHaveBeenCalled();
    deep.component.select(deep.component.rows()[1]);
    expect(deep.component.selectedNumber()).toBe('INV-2026-08-0007');
    expect(deep.router.navigate).toHaveBeenLastCalledWith(['/billing/invoices', 'INV-2026-08-0007'], { replaceUrl: false });
  });

  it('a platform administrator drafts a month for the picked workspace; a tenant administrator cannot', () => {
    const admin = page(true);
    admin.component.draft('2026-08');
    expect(admin.api.draft).toHaveBeenCalledWith('2905', '2026-08');
    expect(admin.toast.success).toHaveBeenCalledWith('Draft built.');
    const tenant = page(false);
    tenant.component.draft('2026-08');
    expect(tenant.api.draft).not.toHaveBeenCalled();
  });
});

describe('Invoices tiles in the currency billed', () => {
  it('shows a pound invoice as pounds, and never adds it to dollars', () => {
    const { component } = page(false);
    component.rows.set([
      { ...component.rows()[0], kind: 'invoice', status: 'overdue', balance: 100, total: 100, currency: 'GBP' },
      { ...component.rows()[0], kind: 'invoice', status: 'overdue', balance: 40, total: 40, currency: 'USD' },
    ] as any);

    const tile = component.totals(component.summary().overdueTotals);
    expect(tile).toContain('£100.00');
    expect(tile).toContain('$40.00');
    expect(tile).not.toContain('140');
  });
});
