import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, ViewChild, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, of } from 'rxjs';
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
    { paymentId: 1, amount: '200', method: 'bank', reference: 'TRF-88213', status: 'verified', receiptNumber: 'RCP-2026-09-0012', submittedBy: 'Olivia Bennett', verifiedBy: 'Platform administrator', verifiedAt: '2026-09-08T09:30:00Z', dateCreated: '2026-09-06T14:12:00Z', hasSlip: true },
    { paymentId: 2, amount: '166.75', method: 'bank', status: 'submitted', submittedBy: 'Olivia Bennett', dateCreated: '2026-09-17T16:40:00Z', hasSlip: true },
  ],
  documents: [{ documentId: 1, kind: 'invoice', number: 'INV-2026-08-0006', fileName: 'INV-2026-08-0006.pdf', contentType: 'application/pdf', sizeBytes: 84000, issuedAt: '2026-09-01T08:00:00Z', tenantId: 2905 }],
  account: { tenantId: 2905, legalName: 'Northline Clinics Ltd', paymentTermsDays: 30 },
};

/** The pane takes its number as an input, so it is mounted inside a host the way the list mounts it. */
@Component({ imports: [InvoicePane], template: `<app-invoice-pane [number]="number" (changed)="changes = changes + 1" />` })
class Host { number = 'INV-2026-08-0006'; changes = 0; @ViewChild(InvoicePane) pane!: InvoicePane; }

function page(platformAdmin: boolean, detail: object = DETAIL) {
  // jsdom has no object URLs; the QR code and the documents are blobs shown through one.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:qr', revokeObjectURL: () => {} }));
  const api = { invoice: vi.fn(() => of({ status: API_SUCCESS, data: detail })), submitPayment: vi.fn(() => of({ status: API_SUCCESS, message: 'recorded' })), verifyPayment: vi.fn(() => of({ status: API_SUCCESS, message: 'verified' })), documentBlob: vi.fn(() => of(new Blob(['%PDF']))), qrBlob: vi.fn(() => of(new Blob(['png']))) };
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

  it('a tenant administrator can submit a slip; verifying and voiding are the platform\'s', async () => {
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

  /** MIG-211: the pane reads like the rest of the console -- sentence case, one date style, one precision per column. */
  it('writes statuses and methods in sentence case, and dates the way the rest of the pane does', () => {
    const { fixture, component } = page(false);
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Partially paid · $202.75 open');
    expect(text).toContain('Bank transfer');
    expect(text).not.toMatch(/\bbank\b/);
    expect(text).toContain('Verified');
    expect(text).toContain('Pending verification');
    expect(text).toMatch(/Issued \d{1,2} Sep 2026/);
    expect(text).toMatch(/Due 30 Sep 2026 \(net 30\)/);
    expect(text).toMatch(/Paid \$200\.00 · balance \$202\.75/);
    // "due 9/30/2026" was the browser's own date format, in the browser's own zone.
    expect(component.history().find(h => h.text.startsWith('Invoice issued'))!.text).toBe('Invoice issued for $402.75, due 30 Sep 2026');
  });

  it('a column of line amounts shares one precision, so $0.0010 never sits above $0.01', () => {
    const tiny = { ...DETAIL, lines: [...DETAIL.lines, { invoiceLineId: 3, sort: 2, meter: 'storage.ops.read', description: 'Storage reads', quantity: '243', unit: 'op', per: 1000, unitPrice: '0.004', amount: '0.000972', manual: false }] };
    const { fixture } = page(false, tiny);
    const amounts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.lookup-entry-table tbody tr td:last-child')].slice(0, 3).map(td => td.textContent!.trim());
    expect(amounts).toEqual(['$1.2200', '$0.0850', '$0.0010']);
  });

  it('a platform administrator reads a manual line and a system draft in sentence case', () => {
    const manual = { ...DETAIL, lines: [{ invoiceLineId: 9, sort: 0, description: 'Onboarding support', quantity: '1', unit: 'each', per: 1, unitPrice: '3.02', amount: '3.02', manual: true }] };
    const { fixture } = page(true, manual);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Manual');
    expect(text).not.toMatch(/\bmanual\b/);
  });
});

/** A host whose number is a signal, so switching invoices reaches the pane without a zone. */
@Component({ imports: [InvoicePane], template: `<app-invoice-pane [number]="number()" />` })
class SwitchHost { readonly number = signal('INV-2026-08-0006'); @ViewChild(InvoicePane) pane!: InvoicePane; }

/** Audit 09-22: what the pane shows between two invoices, and after a manual line. */
describe('InvoicePane, switching and adding', () => {
  function mount() {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:qr', revokeObjectURL: () => {} }));
    let calls = 0;
    const api = {
      invoice: vi.fn(() => (calls++ === 0 ? of({ status: API_SUCCESS, data: DETAIL }) : NEVER)),
      addLine: vi.fn(() => of({ status: API_SUCCESS, message: 'Line added.' })),
      documentBlob: vi.fn(() => of(new Blob(['%PDF']))), qrBlob: vi.fn(() => of(new Blob(['png']))),
    };
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SwitchHost], providers: [provideRouter([]),
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } }, { provide: AuthService, useValue: { isPlatformAdmin: () => true } },
    ] });
    const fixture = TestBed.createComponent(SwitchHost);
    fixture.detectChanges();
    return { fixture, api, toast, pane: fixture.componentInstance.pane };
  }

  it('does not leave the previous invoice live, with its actions, while the next one loads', () => {
    const { fixture, pane } = mount();
    expect(pane.invoice()?.number).toBe('INV-2026-08-0006');
    fixture.componentInstance.number.set('INV-2026-09-0007');
    fixture.detectChanges();
    expect(pane.loading()).toBe(true);
    expect(pane.invoice()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading INV-2026-09-0007');
  });

  it('confirms a manual line the way it confirms every other change', () => {
    const { pane, api, toast } = mount();
    pane.lineDescription.set('Onboarding support');
    pane.lineQuantity.set('1');
    pane.linePrice.set('3.02');
    pane.addLine();
    expect(api.addLine).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Line added.');
  });
});

