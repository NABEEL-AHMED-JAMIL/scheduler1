import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ReceiptVerdictView, shortHash } from './receipt-verify';
import { ReceiptVerdict } from './billing.service';
import { documentState, documentTitle } from './documents';

/** Owner #10 (MIG-393): "Verify this receipt" says each check in words and a glyph, never by colour alone. */
describe('a receipt verdict', () => {
  const verdict = (ok: boolean): ReceiptVerdict => ({
    verified: ok, source: 'stored', summary: ok ? 'This receipt is genuine.' : 'This receipt does not verify: the file was changed after it was signed.',
    trustNote: 'Adobe Reader shows this signature as "validity unknown" ...',
    checks: [
      { key: 'signed', label: 'Digitally signed', ok: true, detail: 'Signed by ETL Console Billing Receipts' },
      { key: 'intact', label: 'Unchanged since signing', ok, detail: ok ? 'The signature covers every byte of the file.' : 'The file was changed after it was signed.' },
    ],
    signature: { signed: true, signerName: 'ETL Console Billing Receipts', reason: 'Payment verified', certificateSha256: 'a'.repeat(64),
      signedAt: '2026-10-19T21:16:00Z', sha256: 'b'.repeat(64), problems: [] },
  });

  function render(v: ReceiptVerdict): HTMLElement {
    TestBed.resetTestingModule();
    const f = TestBed.configureTestingModule({ imports: [ReceiptVerdictView] }).createComponent(ReceiptVerdictView);
    f.componentRef.setInput('verdict', v);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('says Genuine and Yes for every check that holds', () => {
    const el = render(verdict(true));
    expect(el.querySelector('[data-test="receipt-verdict-summary"]')?.textContent?.trim()).toBe('Genuine receipt');
    expect([...el.querySelectorAll('.receipt-check-word')].map(e => e.textContent?.trim())).toEqual(['Yes', 'Yes']);
    expect(el.textContent).toContain('Payment verified');
    expect(el.querySelector('[data-test="receipt-trust-note"]')?.textContent).toContain('validity unknown');
  });

  it('says which check failed, in words', () => {
    const el = render(verdict(false));
    expect(el.querySelector('[data-test="receipt-verdict-summary"]')?.textContent?.trim()).toBe('Does not verify');
    const intact = el.querySelector('[data-check="intact"]')!;
    expect(intact.querySelector('.receipt-check-word')?.textContent?.trim()).toBe('No');
    expect(intact.textContent).toContain('changed after it was signed');
  });

  it('shortens a fingerprint for a line and keeps a short one whole', () => {
    expect(shortHash('866d6235cdb8ace61d53d64c0fc51d85b0696512d244f7de9f80c469663ed351')).toBe('866d6235…663ed351');
    expect(shortHash('abc')).toBe('abc');
    expect(shortHash(null)).toBe('');
  });
});

/** Owner #9: a document's row says what it is, its period and its state. */
describe('a billing document in the list', () => {
  it('names a statement by its range, any other document by its number or file', () => {
    expect(documentTitle({ kind: 'statement', number: 'STM-2961-2026-01-01-2026-12-31-2', fileName: 's.pdf' })).toBe('Statement 1 Jan – 31 Dec 2026 #2');
    expect(documentTitle({ kind: 'statement', number: 'STM-2961-2025-07-01-2026-06-30-1', fileName: 's.pdf' })).toBe('Statement 1 Jul 2025 – 30 Jun 2026 #1');
    expect(documentTitle({ kind: 'receipt', number: 'RCP-2026-10-0009', fileName: 'RCP-2026-10-0009.pdf' })).toBe('RCP-2026-10-0009');
    expect(documentTitle({ kind: 'payment_slip', number: undefined, fileName: 'slip.pdf' })).toBe('slip.pdf');
  });

  it('gives a receipt Signed or Not signed, a slip its payment state, an invoice its status, a statement none', () => {
    const base = { documentId: 1, fileName: 'x.pdf', issuedAt: '2026-10-19T00:00:00Z', tenantId: 2961 };
    expect(documentState({ ...base, kind: 'receipt', signed: true })?.label).toBe('Signed');
    expect(documentState({ ...base, kind: 'receipt', signed: false })?.label).toBe('Not signed');
    expect(documentState({ ...base, kind: 'payment_slip', paymentStatus: 'submitted', paymentMethod: 'bank' })?.cls).toContain('pill-pay-pending');
    expect(documentState({ ...base, kind: 'invoice', invoiceStatus: 'paid' })).toMatchObject({ label: 'Paid', cls: 'pill pill-ok' });
    expect(documentState({ ...base, kind: 'statement' })).toBeNull();
  });
});
