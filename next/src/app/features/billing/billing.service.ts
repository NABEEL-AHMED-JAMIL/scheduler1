import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

export interface BillingAccount {
  billingAccountId?: number; tenantId: number; legalName?: string; address?: string; billingEmail?: string;
  taxId?: string; taxRatePercent?: number; taxLabel?: string; currency?: string; paymentTermsDays?: number;
}
export interface InvoiceRow {
  invoiceId: number; number: string; kind: 'invoice' | 'credit_note'; referencesInvoiceId?: number; tenantId: number; tenantName?: string;
  periodStart: string; periodEnd: string; status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void'; currency: string;
  subtotal: number; taxRatePercent: number; tax: number; total: number; balance: number; note?: string;
  issuedAt?: string; dueAt?: string; paidAt?: string; voidedAt?: string; rateCardVersion?: number; dateCreated?: string;
}
export interface InvoiceLine {
  invoiceLineId: number; sort: number; meter?: string; description: string; quantity: number; unit?: string; per: number;
  unitPrice: number; amount: number; periodLabel?: string; manual: boolean;
}
export interface PaymentRow {
  paymentId: number; amount: number; method: string; reference?: string; note?: string; status: 'submitted' | 'verified' | 'rejected';
  receiptNumber?: string; submittedBy?: string; verifiedBy?: string; verifiedAt?: string; receivedAt?: string; dateCreated: string; hasSlip: boolean;
}
export interface DocumentRow {
  documentId: number; kind: 'invoice' | 'credit_note' | 'receipt' | 'statement' | 'payment_slip'; number?: string; fileName: string;
  contentType?: string; sizeBytes?: number; amount?: number; issuedAt: string; invoiceId?: number; invoiceNumber?: string; paymentId?: number;
  tenantId: number; tenantName?: string; createdByName?: string;
}
export interface InvoiceDetail extends InvoiceRow {
  lines: InvoiceLine[]; payments: PaymentRow[]; documents: DocumentRow[]; account: BillingAccount; referencesNumber?: string; createdByName?: string;
}
export interface BillingAnalytics {
  invoiced: number; collected: number; open: number; overdue: number; overdueCount: number; drafts: number; medianDaysToPay: number; pendingPayments: number;
  months: { month: string; invoiced?: number; collected?: number; open?: number; drafts?: number }[];
  tenants: { tenantId: number; tenantName: string; invoiced: number; collected: number; open: number; overdue: number; status: string }[];
  usageByTenant?: { tenantId: number; amount: number; quantityByMeter: Record<string, number> }[] | null;
}

/** The billing.json calls: invoices, payments, documents, the account, the platform's view. */
@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/billing.json`;

  private tenantParam(tenantId?: string | null): Record<string, string> { return tenantId ? { tenantId } : {}; }

  account(tenantId?: string | null): Observable<ApiResponse<BillingAccount>> { return this.http.get<ApiResponse<BillingAccount>>(`${this.base}/account`, { params: this.tenantParam(tenantId) }); }
  saveAccount(account: BillingAccount, tenantId?: string | null): Observable<ApiResponse<BillingAccount>> { return this.http.post<ApiResponse<BillingAccount>>(`${this.base}/account`, account, { params: this.tenantParam(tenantId) }); }
  invoices(tenantId?: string | null): Observable<ApiResponse<InvoiceRow[]>> { return this.http.get<ApiResponse<InvoiceRow[]>>(`${this.base}/invoices`, { params: this.tenantParam(tenantId) }); }
  invoice(number: string): Observable<ApiResponse<InvoiceDetail>> { return this.http.get<ApiResponse<InvoiceDetail>>(`${this.base}/invoice`, { params: { number } }); }
  draft(tenantId: string, period: string): Observable<ApiResponse<InvoiceRow>> { return this.http.post<ApiResponse<InvoiceRow>>(`${this.base}/invoice/draft`, null, { params: { tenantId, period } }); }
  closeMonth(period: string): Observable<ApiResponse<number>> { return this.http.post<ApiResponse<number>>(`${this.base}/closeMonth`, null, { params: { period } }); }
  addLine(invoiceId: number, description: string, quantity: number, unitPrice: number): Observable<ApiResponse<InvoiceLine>> {
    return this.http.post<ApiResponse<InvoiceLine>>(`${this.base}/invoice/line`, null, { params: { invoiceId: String(invoiceId), description, quantity: String(quantity), unitPrice: String(unitPrice) } });
  }
  issue(invoiceId: number): Observable<ApiResponse<InvoiceRow>> { return this.http.post<ApiResponse<InvoiceRow>>(`${this.base}/invoice/issue`, null, { params: { invoiceId: String(invoiceId) } }); }
  void(invoiceId: number, reason: string): Observable<ApiResponse<InvoiceRow>> { return this.http.post<ApiResponse<InvoiceRow>>(`${this.base}/invoice/void`, null, { params: { invoiceId: String(invoiceId), reason } }); }
  creditNote(invoiceId: number, amount: number, reason: string): Observable<ApiResponse<InvoiceRow>> {
    return this.http.post<ApiResponse<InvoiceRow>>(`${this.base}/invoice/creditNote`, null, { params: { invoiceId: String(invoiceId), amount: String(amount), reason } });
  }
  submitPayment(invoiceId: number, amount: number, method: string, reference: string, note: string, slip: File | null): Observable<ApiResponse<PaymentRow>> {
    const form = new FormData();
    form.append('invoiceId', String(invoiceId)); form.append('amount', String(amount)); form.append('method', method);
    if (reference) form.append('reference', reference);
    if (note) form.append('note', note);
    if (slip) form.append('slip', slip, slip.name);
    return this.http.post<ApiResponse<PaymentRow>>(`${this.base}/payment/submit`, form);
  }
  verifyPayment(paymentId: number, accept: boolean, note: string): Observable<ApiResponse<PaymentRow>> {
    return this.http.post<ApiResponse<PaymentRow>>(`${this.base}/payment/verify`, null, { params: { paymentId: String(paymentId), accept: String(accept), note } });
  }
  documents(tenantId?: string | null): Observable<ApiResponse<DocumentRow[]>> { return this.http.get<ApiResponse<DocumentRow[]>>(`${this.base}/documents`, { params: this.tenantParam(tenantId) }); }
  documentBlob(documentId: number): Observable<Blob> { return this.http.get(`${this.base}/document`, { params: { documentId: String(documentId) }, responseType: 'blob' }); }
  statement(from: string, to: string, tenantId?: string | null): Observable<ApiResponse<DocumentRow>> {
    return this.http.post<ApiResponse<DocumentRow>>(`${this.base}/statement`, null, { params: { from, to, ...this.tenantParam(tenantId) } });
  }
  analytics(from: string, to: string): Observable<ApiResponse<BillingAnalytics>> { return this.http.get<ApiResponse<BillingAnalytics>>(`${this.base}/analytics`, { params: { from, to } }); }

  /** Opens a fetched document in a new tab (a PDF renders there; an image too). */
  static open(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  static save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'draft', issued: 'issued', partially_paid: 'partially paid', paid: 'paid', overdue: 'overdue', void: 'void',
};
export const INVOICE_STATUS_TONE: Record<string, string> = {
  draft: 'pill-neutral', issued: 'pill-warn', partially_paid: 'pill-warn', paid: 'pill-ok', overdue: 'pill-crit', void: 'pill-neutral',
};
export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  invoice: 'invoice', credit_note: 'credit note', receipt: 'receipt', statement: 'statement', payment_slip: 'payment slip',
};
