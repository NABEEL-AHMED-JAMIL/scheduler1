import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { PaymentPanel, PaymentPanelData } from './payment-panel';
import { BillingApi } from './billing.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { amountProblem, dayProblem, minorDigits, openToPay, slipProblem } from './payment-form';

const INVOICE = {
  invoiceId: 81, number: 'INV-2026-09-0002', kind: 'invoice', tenantId: 2960, tenantName: 'Riverside Health', status: 'issued', currency: 'USD',
  total: 40, balance: 40, subtotal: 40, tax: 0, taxRatePercent: 0, timeZone: 'America/Chicago', periodStart: '2026-09-01', periodEnd: '2026-09-30',
  lines: [], payments: [], documents: [], account: { tenantId: 2960 },
};

function mount(platformAdmin: boolean, pending = 0, answer: unknown = of({ status: API_SUCCESS, message: 'Payment recorded.', data: { paymentId: 5 } })) {
  const api = { submitPayment: vi.fn(() => answer), timeZone: vi.fn(() => of({ status: API_SUCCESS, data: { zone: 'America/Chicago', today: '2026-10-12' } })) };
  const ref = { close: vi.fn() };
  const data: PaymentPanelData = { invoice: INVOICE as any, paid: 0, credited: 0, pending, platformAdmin };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PaymentPanel], providers: [
    { provide: BillingApi, useValue: api }, { provide: DialogRef, useValue: ref }, { provide: DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(PaymentPanel);
  fixture.detectChanges();
  return { panel: fixture.componentInstance, api, ref, fixture, text: () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ') };
}

describe('the payment form rules', () => {
  const money = (v: number) => '$' + v.toFixed(2);
  it('an amount is above zero, in cents, and at most what is open', () => {
    expect(amountProblem('', 40, 0, 'USD', money)).toBe('Enter the amount paid.');
    expect(amountProblem('0', 40, 0, 'USD', money)).toBe('Enter an amount above zero.');
    expect(amountProblem('-3', 40, 0, 'USD', money)).toContain('Enter a number');
    expect(amountProblem('1.005', 40, 0, 'USD', money)).toBe('Amounts in USD have at most 2 decimals.');
    expect(amountProblem('1.50', 40, 0, 'USD', money)).toBe('');
    expect(amountProblem('40.01', 40, 0, 'USD', money)).toBe('At most $40.00 is still owed.');
    expect(amountProblem('30', 25, 15, 'USD', money)).toBe('At most $25.00 is still owed ($15.00 more is in slips awaiting verification).');
    expect(amountProblem('1.5', 100, 0, 'JPY', money)).toBe('Amounts in JPY have no decimals.');
    expect(minorDigits('KWD')).toBe(3);
    expect(openToPay(40, 15.1, 'USD')).toBe(24.9);
  });
  it('a day is not after today in the billing zone, and at most a year back', () => {
    const t = (d: string) => d;
    expect(dayProblem('', '2026-10-12', 'UTC', t)).toBe('');
    expect(dayProblem('2026-10-13', '2026-10-12', 'UTC', t)).toBe('Not after today (2026-10-12, UTC).');
    expect(dayProblem('2025-10-01', '2026-10-12', 'UTC', t)).toBe('At most a year back.');
    expect(dayProblem('2026-10-12', '2026-10-12', 'UTC', t)).toBe('');
  });
  it('a slip is a PDF, a PNG or a JPEG of at most 10 MB; a workspace must attach one', () => {
    const size = (b: number) => `${b} B`;
    expect(slipProblem(null, true, size)).toContain('Attach the transfer slip');
    expect(slipProblem(null, false, size)).toBe('');
    expect(slipProblem(new File(['x'], 'slip.html', { type: 'text/html' }), false, size)).toContain('PDF, a PNG or a JPEG');
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
    expect(slipProblem(big, false, size)).toContain('at most 10 MB');
    expect(slipProblem(new File(['%PDF-'], 'slip.pdf', { type: 'application/pdf' }), true, size)).toBe('');
  });
});

describe('PaymentPanel', () => {
  it('opens on the balance, in the currency, with the invoice in the head', () => {
    const { panel, text } = mount(true);
    expect(panel.heading).toBe('Record a payment for INV-2026-09-0002');
    expect(panel.subtitle).toBe('Riverside Health · balance due $40.00 USD');
    expect(panel.amount()).toBe('40.00');
    expect(panel.isFull()).toBe(true);
    expect(text()).toContain('Balance due');
    expect(text()).toContain('Record as verified');
    expect(text()).toContain('becomes Paid');
    expect(panel.primaryLabel()).toBe('Record and verify');
  });

  it('records as verified with one key for every try, and closes with Billing\'s answer', () => {
    const { panel, api, ref } = mount(true);
    panel.setAmount('15'); panel.reference.set(' TRF-1 '); panel.setDay('2026-10-10');
    expect(panel.nextSteps().join(' ')).toContain('$25.00 stays open');
    panel.submit();
    expect(api.submitPayment).toHaveBeenCalledWith(81, '15', 'bank', 'TRF-1', '', null,
      expect.objectContaining({ currency: 'USD', receivedOn: '2026-10-10', verified: true, idempotencyKey: expect.any(String) }));
    expect(ref.close).toHaveBeenCalledWith({ message: 'Payment recorded.', payment: { paymentId: 5 } });
  });

  it('"Record, verify later" is not verified; a workspace\'s slip never is', () => {
    const admin = mount(true);
    admin.panel.counting.set('later');
    admin.panel.submit();
    expect((admin.api.submitPayment.mock.calls[0] as any[])[6].verified).toBe(false);
    const ws = mount(false);
    expect(ws.panel.heading).toBe('Upload a payment slip for INV-2026-09-0002');
    expect(ws.text()).not.toContain('Record as verified');
    ws.panel.submit();                                   // no slip yet: refused here, nothing sent
    expect(ws.api.submitPayment).not.toHaveBeenCalled();
    expect(ws.panel.slipError()).toContain('Attach the transfer slip');
    ws.panel.setSlip(new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' }));
    ws.panel.submit();
    expect((ws.api.submitPayment.mock.calls[0] as any[])[6].verified).toBe(false);
  });

  it('shows a problem under its field before anything is sent, and Billing\'s refusal in the panel, not only a toast', () => {
    const { panel, api, ref, fixture } = mount(true, 10);
    panel.setAmount('35');
    panel.submit();
    expect(api.submitPayment).not.toHaveBeenCalled();
    expect(panel.amountError()).toBe('At most $30.00 is still owed ($10.00 more is in slips awaiting verification).');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('At most $30.00 is still owed');

    const refused = mount(true, 0, throwError(() => ({ status: 409, error: { status: 'ERROR', message: 'INV-2026-09-0002 is already paid in full.' } })));
    refused.panel.submit();
    expect(refused.ref.close).not.toHaveBeenCalled();
    expect(refused.panel.serverError()).toBe('INV-2026-09-0002 is already paid in full.');
    refused.fixture.detectChanges();
    expect((refused.fixture.nativeElement as HTMLElement).querySelector('[data-pay-error]')?.textContent).toContain('already paid in full');
    void ref;
  });

  it('a double click sends once while the first is on its way', () => {
    const { panel, api } = mount(true, 0, { subscribe: () => ({ unsubscribe() {} }) });
    panel.submit(); panel.submit();
    expect(api.submitPayment).toHaveBeenCalledTimes(1);
  });
});
