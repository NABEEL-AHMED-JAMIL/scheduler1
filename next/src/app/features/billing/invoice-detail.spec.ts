import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { InvoicePane } from './invoice-detail';
import { BillingApi } from './billing.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** One invoice in the pane: what is paid, what is open, the story in order, and who may do what. */
const DETAIL = {
  invoiceId: 7, number: 'INV-2026-08-0006', kind: 'invoice', tenantId: 2905, tenantName: 'Northline', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'partially_paid', currency: 'USD',
  subtotal: '402.75', taxRatePercent: '0', tax: '0', total: '402.75', balance: '202.75', issuedAt: '2026-09-01T08:00:00Z', dueAt: '2026-09-30T08:00:00Z', dateCreated: '2026-09-01T07:00:00Z', createdByName: 'system',
  lines: [{ invoiceLineId: 1, sort: 0, meter: 'storage.bytes.deleted', description: 'Bytes deleted', quantity: '131000000000', unit: 'byte', per: 1073741824, unitPrice: '0.01', amount: '1.22', manual: false },
    { invoiceLineId: 2, sort: 1, meter: 'ai.tokens.in', description: 'Model tokens in', quantity: '3000', unit: 'token', per: 1000, unitPrice: '0.05', amount: '0.085', manual: false,
      includedQuantity: '1000', billableQuantity: '2000', pricingDetail: '[{"from": "0", "to": "1500", "units": "1500", "unit_price": "0.05"}, {"from": "1500", "to": null, "units": "500", "unit_price": "0.02"}]' }],
  payments: [
    { paymentId: 1, amount: '200', method: 'bank', reference: 'TRF-88213', status: 'verified', receiptNumber: 'RCP-2026-09-0012', submittedBy: 'Olivia Bennett', verifiedBy: 'Platform Admin', verifiedAt: '2026-09-08T09:30:00Z', dateCreated: '2026-09-06T14:12:00Z', hasSlip: true },
    { paymentId: 2, amount: '166.75', method: 'bank', status: 'submitted', submittedBy: 'Olivia Bennett', dateCreated: '2026-09-17T16:40:00Z', hasSlip: true },
  ],
  documents: [{ documentId: 1, kind: 'invoice', number: 'INV-2026-08-0006', fileName: 'INV-2026-08-0006.pdf', contentType: 'application/pdf', sizeBytes: 84000, issuedAt: '2026-09-01T08:00:00Z', tenantId: 2905 }],
  account: { tenantId: 2905, legalName: 'Northline Clinics Ltd', paymentTermsDays: 30 },
};

/** The pane takes its number as an input, so it is mounted inside a host the way the list mounts it. */
@Component({ imports: [InvoicePane], template: `<app-invoice-pane [number]="number" (changed)="changes = changes + 1" />` })
class Host { number = 'INV-2026-08-0006'; changes = 0; @ViewChild(InvoicePane) pane!: InvoicePane; }

function page(platformAdmin: boolean) {
  // jsdom has no object URLs; the QR code and the documents are blobs shown through one.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:qr', revokeObjectURL: () => {} }));
  const api = { invoice: vi.fn(() => of({ status: API_SUCCESS, data: DETAIL })), submitPayment: vi.fn(() => of({ status: API_SUCCESS, message: 'recorded' })), verifyPayment: vi.fn(() => of({ status: API_SUCCESS, message: 'verified' })), documentBlob: vi.fn(() => of(new Blob(['%PDF']))), qrBlob: vi.fn(() => of(new Blob(['png']))) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([]),
    { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    // Every dialog answers yes: verify and void are asked first now, in the app's own dialog.
    { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } }, { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin } },
  ] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const component = fixture.componentInstance.pane;
  return { component, api, host: fixture.componentInstance, fixture };
}

describe('InvoicePane', () => {
  it('reads the invoice, sums verified payments only, and tells the story in order', () => {
    const { component, api } = page(false);
    expect(api.invoice).toHaveBeenCalledWith('INV-2026-08-0006');
    expect(api.qrBlob).toHaveBeenCalledWith('INV-2026-08-0006', 240);   // the QR code of the number, beside the facts
    expect(component.paid()).toBe(200);
    expect(component.pending()).toHaveLength(1);
    expect(component.isOpen()).toBe(true);
    expect(component.payAmount()).toBe('202.75');
    expect(component.quantity(component.invoice()!.lines[0])).toBe('122 GB');
    expect(component.rate(component.invoice()!.lines[0])).toBe('$0.01 per GB');
    // A frozen line keeps the calculation it was priced with: the tier bands come back as numbers.
    expect(component.tiers(component.invoice()!.lines[0])).toEqual([]);
    expect(component.tiers(component.invoice()!.lines[1])).toEqual([{ from: 0, to: 1500, units: 1500, unit_price: 0.05 }, { from: 1500, to: null, units: 500, unit_price: 0.02 }]);
    const story = component.history().map(h => h.text);
    expect(story[0]).toContain('Draft INV-2026-08-0006');
    expect(story[1]).toContain('Invoice issued for $402.75');
    expect(story.some(t => t.includes('receipt RCP-2026-09-0012'))).toBe(true);
    expect(story[story.length - 1]).toContain('166.75');
  });

  it('a tenant admin can submit a slip; verifying and voiding are the platform\'s', async () => {
    const tenant = page(false);
    expect(tenant.component.canVoid()).toBe(false);
    tenant.component.payAmount.set('50');
    tenant.component.submitPayment();
    expect(tenant.api.submitPayment).toHaveBeenCalledWith(7, 50, 'bank', '', '', null);
    const admin = page(true);
    admin.component.verify(DETAIL.payments[1] as any, true);
    await new Promise(r => setTimeout(r));                // the confirm dialog answers on the microtask queue
    expect(admin.api.verifyPayment).toHaveBeenCalledWith(2, true, '');
    expect(admin.host.changes).toBe(1);                // the list beside the pane is told
    expect(admin.component.canVoid()).toBe(false);   // partly paid: a credit note, not a void
  });
});
