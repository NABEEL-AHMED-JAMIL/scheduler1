import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { formatSize } from '../../shared/ui/format-size';
import { BillingApi, DOCUMENT_KIND_LABEL, InvoiceDetail as Detail, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, PaymentRow } from './billing.service';

/** One entry of the invoice's story, in order. */
interface HistoryEntry { at: string; text: string; tone?: 'ok' | 'warn' | 'crit' | 'muted'; }

/**
 * One invoice: its lines as frozen, the documents around it, the payments against it and the
 * story so far. A workspace admin reads it and uploads a payment slip; a platform admin issues
 * a draft, verifies or rejects a slip, adds a line, voids, or issues a credit note.
 */
@Component({
  selector: 'app-invoice-detail',
  imports: [Icon, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './invoice-detail.html',
})
export class InvoiceDetailPage implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);

  readonly isPlatformAdmin = this.auth.isPlatformAdmin;
  readonly number = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly invoice = signal<Detail | null>(null);
  readonly busy = signal('');
  readonly statusLabel = INVOICE_STATUS_LABEL;
  readonly statusTone = INVOICE_STATUS_TONE;
  readonly kindLabel = DOCUMENT_KIND_LABEL;
  readonly humanSize = formatSize;

  // ---- the payment form (a workspace admin's slip) ----
  readonly paying = signal(false);
  readonly payAmount = signal('');
  readonly payMethod = signal('bank');
  readonly payReference = signal('');
  readonly payNote = signal('');
  readonly paySlip = signal<File | null>(null);

  // ---- a manual line, a credit note (platform admin) ----
  readonly addingLine = signal(false);
  readonly lineDescription = signal('');
  readonly lineQuantity = signal('1');
  readonly linePrice = signal('');
  readonly crediting = signal(false);
  readonly creditAmount = signal('');
  readonly creditReason = signal('');

  readonly paid = computed(() => (this.invoice()?.payments ?? []).filter(p => p.status === 'verified').reduce((n, p) => n + Number(p.amount), 0));
  readonly pending = computed(() => (this.invoice()?.payments ?? []).filter(p => p.status === 'submitted'));
  readonly isOpen = computed(() => ['issued', 'partially_paid', 'overdue'].includes(this.invoice()?.status ?? ''));
  readonly canVoid = computed(() => this.isPlatformAdmin() && !!this.invoice() && this.invoice()!.status !== 'void' && this.invoice()!.kind === 'invoice' && this.paid() === 0);
  readonly taxApplies = computed(() => Number(this.invoice()?.taxRatePercent ?? 0) > 0);

  readonly history = computed<HistoryEntry[]>(() => {
    const i = this.invoice();
    if (!i) return [];
    const out: HistoryEntry[] = [];
    if (i.dateCreated) out.push({ at: i.dateCreated, text: `Draft ${i.number} built from the meter${i.createdByName ? ' by ' + i.createdByName : ''}`, tone: 'muted' });
    if (i.issuedAt) out.push({ at: i.issuedAt, text: `${i.kind === 'credit_note' ? 'Credit note' : 'Invoice'} issued for ${this.money(i.total)}${i.dueAt ? ', due ' + new Date(i.dueAt).toLocaleDateString() : ''}`, tone: 'ok' });
    for (const p of i.payments) {
      out.push({ at: p.dateCreated, text: `Payment of ${this.money(Number(p.amount))} ${p.method === 'credit_note' ? 'credited (' + p.reference + ')' : 'submitted' + (p.submittedBy ? ' by ' + p.submittedBy : '') + (p.reference ? ' · ' + p.reference : '')}`, tone: 'muted' });
      if (p.verifiedAt && p.method !== 'credit_note') out.push({ at: p.verifiedAt, text: p.status === 'verified' ? `Verified${p.verifiedBy ? ' by ' + p.verifiedBy : ''} · receipt ${p.receiptNumber}` : `Rejected${p.verifiedBy ? ' by ' + p.verifiedBy : ''}${p.note ? ' · ' + p.note : ''}`, tone: p.status === 'verified' ? 'ok' : 'crit' });
    }
    if (i.paidAt && i.status === 'paid') out.push({ at: i.paidAt, text: 'Paid in full', tone: 'ok' });
    if (i.voidedAt) out.push({ at: i.voidedAt, text: `Voided${i.note ? ' · ' + i.note : ''}`, tone: 'crit' });
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => { this.number.set(p.get('number') ?? ''); this.load(); });
  }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.api.invoice(this.number()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'No such invoice.'); return; }
        const d = r.data;
        this.invoice.set({ ...d, subtotal: Number(d.subtotal), tax: Number(d.tax), total: Number(d.total), balance: Number(d.balance), taxRatePercent: Number(d.taxRatePercent),
          lines: d.lines.map(l => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), amount: Number(l.amount) })) });
        if (!this.payAmount()) this.payAmount.set(String(Number(d.balance).toFixed(2)));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the invoice.'); },
    });
  }

  money(v: number, currency = this.invoice()?.currency ?? 'USD'): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }
  rate(l: { unitPrice: number; per: number; unit?: string }): string {
    if (l.unit === 'byte' && l.per === 1024 * 1024 * 1024) return `${this.money(l.unitPrice)} per GB`;
    if (l.unit === 'each') return '';
    const digits = l.unitPrice >= 0.01 ? 2 : l.unitPrice >= 0.0001 ? 4 : 6;
    const price = new Intl.NumberFormat(undefined, { style: 'currency', currency: this.invoice()?.currency ?? 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(l.unitPrice);
    return `${price}${l.per > 1 ? ' / ' + l.per.toLocaleString() : ''} per ${l.unit ?? ''}`;
  }
  quantity(l: { quantity: number; unit?: string }): string {
    if (l.unit === 'byte') { const b = l.quantity; return b < 1024 ? `${Math.round(b)} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(2)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`; }
    if (l.unit === 'GB-hour') return `${l.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} GB·h`;
    return l.quantity.toLocaleString(undefined, { maximumFractionDigits: l.quantity < 10 ? 3 : 0 });
  }

  // ---- documents ----
  openDocument(documentId: number): void {
    this.api.documentBlob(documentId).subscribe({ next: b => BillingApi.open(b), error: () => this.toast.error('Could not open the document.') });
  }
  downloadDocument(documentId: number, fileName: string): void {
    this.api.documentBlob(documentId).subscribe({ next: b => BillingApi.save(b, fileName), error: () => this.toast.error('Could not download the document.') });
  }
  pdf(): void {
    const doc = this.invoice()?.documents.find(d => d.kind === 'invoice' || d.kind === 'credit_note');
    if (doc) this.openDocument(doc.documentId); else this.toast.info('The PDF is made when the invoice is issued.');
  }

  // ---- payments ----
  slipPicked(event: Event): void { const f = (event.target as HTMLInputElement).files?.[0] ?? null; this.paySlip.set(f); }
  submitPayment(): void {
    const i = this.invoice(); if (!i) return;
    const amount = Number(this.payAmount());
    if (!(amount > 0)) { this.toast.error('Enter the amount paid.'); return; }
    this.busy.set('pay');
    this.api.submitPayment(i.invoiceId, amount, this.payMethod(), this.payReference(), this.payNote(), this.paySlip()).subscribe({
      next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.paying.set(false); this.payReference.set(''); this.payNote.set(''); this.paySlip.set(null); this.load(); },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The payment could not be recorded.'); },
    });
  }
  verify(p: PaymentRow, accept: boolean): void {
    const note = accept ? '' : (window.prompt('Why is this payment rejected?') ?? '');
    if (!accept && note === null) return;
    this.busy.set('verify' + p.paymentId);
    this.api.verifyPayment(p.paymentId, accept, note).subscribe({
      next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The payment could not be verified.'); },
    });
  }

  // ---- platform actions ----
  issue(): void {
    const i = this.invoice(); if (!i) return;
    confirmWith(this.dialog, { title: `Issue ${i.number}?`, body: `${this.money(i.total)} for ${i.tenantName ?? 'the workspace'}. Once issued the lines are frozen and the PDF is made; a dispute becomes a credit note.`, confirmLabel: 'Issue' })
      .then(ok => { if (!ok) return; this.busy.set('issue'); this.api.issue(i.invoiceId).subscribe({
        next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
        error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The invoice could not be issued.'); } }); });
  }
  redraft(): void {
    const i = this.invoice(); if (!i) return;
    this.busy.set('draft');
    this.api.draft(String(i.tenantId), i.periodStart.slice(0, 7)).subscribe({
      next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The draft could not be rebuilt.'); },
    });
  }
  addLine(): void {
    const i = this.invoice(); if (!i) return;
    const q = Number(this.lineQuantity()), p = Number(this.linePrice());
    if (!this.lineDescription().trim() || !(q > 0) || Number.isNaN(p)) { this.toast.error('A description, a quantity and a price.'); return; }
    this.busy.set('line');
    this.api.addLine(i.invoiceId, this.lineDescription().trim(), q, p).subscribe({
      next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.addingLine.set(false); this.lineDescription.set(''); this.linePrice.set(''); this.load(); },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The line could not be added.'); },
    });
  }
  voidInvoice(): void {
    const i = this.invoice(); if (!i) return;
    const reason = window.prompt(`Void ${i.number}? Say why:`);
    if (!reason) return;
    this.busy.set('void');
    this.api.void(i.invoiceId, reason).subscribe({
      next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The invoice could not be voided.'); },
    });
  }
  creditNote(): void {
    const i = this.invoice(); if (!i) return;
    const amount = Number(this.creditAmount());
    if (!(amount > 0) || !this.creditReason().trim()) { this.toast.error('An amount and a reason.'); return; }
    this.busy.set('credit');
    this.api.creditNote(i.invoiceId, amount, this.creditReason().trim()).subscribe({
      next: r => { this.busy.set(''); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.crediting.set(false); this.creditAmount.set(''); this.creditReason.set(''); this.load(); },
      error: err => { this.busy.set(''); this.toast.error(err?.error?.message || 'The credit note could not be issued.'); },
    });
  }
}
