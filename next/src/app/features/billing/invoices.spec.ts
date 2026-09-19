import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Invoices } from './invoices';
import { BillingApi } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** The invoices list: chips that count and sum, a search, and drafting for the platform admin only. */
const ROWS = [
  { invoiceId: 1, number: 'INV-2026-08-0003', kind: 'invoice', tenantId: 2901, tenantName: 'CareBridge', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'overdue', currency: 'USD', subtotal: '198.4', taxRatePercent: '0', tax: '0', total: '198.4', balance: '198.4', issuedAt: '2026-09-01T08:00:00Z', dueAt: '2026-09-15T08:00:00Z' },
  { invoiceId: 2, number: 'INV-2026-08-0007', kind: 'invoice', tenantId: 2905, tenantName: 'MedAxis', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'paid', currency: 'USD', subtotal: '241.1', taxRatePercent: '0', tax: '0', total: '241.1', balance: '0' },
  { invoiceId: 3, number: 'CN-2026-08-0001', kind: 'credit_note', tenantId: 2905, tenantName: 'MedAxis', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'issued', currency: 'USD', subtotal: '-36', taxRatePercent: '0', tax: '0', total: '-36', balance: '0' },
  { invoiceId: 4, number: 'INV-2026-09-0007', kind: 'invoice', tenantId: 2905, tenantName: 'MedAxis', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'draft', currency: 'USD', subtotal: '184.62', taxRatePercent: '0', tax: '0', total: '184.62', balance: '184.62' },
];

function page(platformAdmin: boolean) {
  const api = { invoices: vi.fn(() => of({ status: API_SUCCESS, data: ROWS })), draft: vi.fn(() => of({ status: API_SUCCESS, message: 'Draft built.' })), closeMonth: vi.fn(() => of({ status: API_SUCCESS, message: '2 drafts.' })), statement: vi.fn(), documentBlob: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: toast }, { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
    { provide: Router, useValue: { navigate: vi.fn() } }, { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin } },
    { provide: WorkspacePicker, useValue: { tenantId: Object.assign(() => (platformAdmin ? '2905' : null), { set: vi.fn() }), options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => platformAdmin } },
  ] });
  const component = TestBed.runInInjectionContext(() => new Invoices());
  component.ngOnInit();
  return { component, api, toast };
}

describe('Invoices', () => {
  it('counts each status, sums what is still owed, and searches', () => {
    const { component } = page(false);
    expect(component.rows()).toHaveLength(4);
    expect(component.counts()['overdue']).toEqual({ n: 1, amount: 198.4 });
    expect(component.counts()['paid']).toEqual({ n: 1, amount: 241.1 });
    expect(component.counts()['draft']?.n).toBe(1);
    expect(Object.keys(component.counts())).not.toContain('issued');   // the credit note is not an invoice
    component.setStatus('overdue');
    expect(component.visible().map(r => r.number)).toEqual(['INV-2026-08-0003']);
    component.setStatus('overdue');
    component.search.set('medaxis');
    expect(component.visible()).toHaveLength(3);
    expect(component.money(198.4)).toBe('$198.40');
    expect(component.overdueDays(component.rows()[0])).toBeGreaterThan(0);
  });

  it('a platform admin drafts a month for the picked workspace; a tenant admin cannot', () => {
    const admin = page(true);
    admin.component.draft('2026-08');
    expect(admin.api.draft).toHaveBeenCalledWith('2905', '2026-08');
    expect(admin.toast.success).toHaveBeenCalledWith('Draft built.');
    const tenant = page(false);
    tenant.component.draft('2026-08');
    expect(tenant.api.draft).not.toHaveBeenCalled();
  });
});
