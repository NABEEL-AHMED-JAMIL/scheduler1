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
  issuedAt?: string; dueAt?: string; paidAt?: string; voidedAt?: string; rateCardVersion?: number; rateCardName?: string; dateCreated?: string;
  /** The kinds of document the invoice has (invoice, payment_slip, receipt, credit_note) and slips awaiting verification. */
  documentKinds?: string[]; pendingPayments?: number;
}
export interface InvoiceLine {
  invoiceLineId: number; sort: number; meter?: string; description: string; quantity: number; unit?: string; per: number;
  unitPrice: number; amount: number; periodLabel?: string; manual: boolean;
  /** What the calculation applied when the line was frozen: the allowance and, as JSON, the tier bands. */
  includedQuantity?: number | null; billableQuantity?: number | null; pricingDetail?: string | null;
}
/** One band of a graduated price: units from `from` (to the next band's `from`) cost `unit_price` per `per`. */
export interface RateTier { from: number; unit_price: number; }
/** A tier band as it was applied to a period's quantity. */
export interface AppliedTier { from: number; to: number | null; units: number; unit_price: number; }
export interface RateItem {
  meter: string; label?: string; service?: string; unit: string; per: number; unit_price: number;
  included_quantity?: number; tiers?: RateTier[];
}
/**
 * One version of the calculation. `tenant_id` null is the default card every workspace without
 * its own falls back to; a workspace's card wins for that workspace from its effective date.
 */
export interface RateCard {
  version: number; name: string; tenant_id: number | null; tenantName?: string | null; effective_from: string; currency: string;
  based_on_version?: number | null; note?: string | null; created_at?: string; items: RateItem[];
}
/** What a card is saved as: everything but the version, which the meter assigns. */
export interface RateCardDraft {
  name: string; tenant_id: number | null; effective_from: string; currency: string; based_on_version: number | null; note: string;
  items: { meter: string; unit: string; per: number; unit_price: number; included_quantity: number; tiers: RateTier[] }[];
}
export interface PaymentRow {
  paymentId: number; amount: number; method: string; reference?: string; note?: string; status: 'submitted' | 'verified' | 'rejected';
  receiptNumber?: string; submittedBy?: string; verifiedBy?: string; verifiedAt?: string; receivedAt?: string; dateCreated: string; hasSlip: boolean;
}
export interface DocumentRow {
  documentId: number; kind: 'invoice' | 'credit_note' | 'receipt' | 'statement' | 'payment_slip'; number?: string; fileName: string;
  contentType?: string; sizeBytes?: number; amount?: number; issuedAt: string; invoiceId?: number; invoiceNumber?: string; paymentId?: number;
  tenantId: number; tenantName?: string; createdByName?: string;
  /** The currency `amount` is in: its invoice's, or the workspace's for a statement. */
  currency?: string;
}
export interface InvoiceDetail extends InvoiceRow {
  lines: InvoiceLine[]; payments: PaymentRow[]; documents: DocumentRow[]; account: BillingAccount; referencesNumber?: string; createdByName?: string;
}
/** One row of billing.json/usage?groupBy=meter: a meter's period, priced with the card in effect. */
export interface MeterLine {
  meter: string; label: string; service: string; unit: string; per: number;
  unitPrice: number; quantity: number; amount: number; days: number;
  /** The calculation applied to the period: allowance first, then tier bands if the card has them. */
  includedQuantity: number; billableQuantity: number; tiers: AppliedTier[]; hasTiers: boolean; unpriced?: boolean;
}
/** The card a period is priced with, as the meter names it. */
export interface PricedWith { version: number; name: string; currency: string; tenantSpecific: boolean; effectiveFrom: string; }
export interface DayRow { day: string; amount: number; byService: Record<string, number>; }
export interface SubjectRow { subject_type: string; subject_id: string; quantity: number; events: number; last: string | null; actor_user_id: number | null; actor_name?: string | null; }
/** What every usage read names: a range, a workspace for a platform administrator, and how to group. */
export interface UsageQuery { from: string; to: string; tenantId?: string | null; }

/** billing.json/summary: the bill in one glance, for a profile card or a dashboard row. */
export interface BillingSummary {
  currency: string; monthToDate: number; periodStart: string; rateCardName?: string; rateCardVersion?: number; meterDown?: boolean;
  openBalance: number; openCount: number; overdueBalance: number; overdueCount: number; pendingSlips: number;
  nextDueAt?: string; nextDueNumber?: string; nextDueBalance?: number;
  latestNumber?: string; latestTotal?: number; latestStatus?: string; latestPeriodStart?: string;
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
  /** The invoice number as a QR code (PNG); the PDF carries the same one. */
  qrBlob(number: string, size = 160): Observable<Blob> { return this.http.get(`${this.base}/invoice/qr`, { params: { number, size: String(size) }, responseType: 'blob' }); }
  documentBlob(documentId: number): Observable<Blob> { return this.http.get(`${this.base}/document`, { params: { documentId: String(documentId) }, responseType: 'blob' }); }
  statement(from: string, to: string, tenantId?: string | null): Observable<ApiResponse<DocumentRow>> {
    return this.http.post<ApiResponse<DocumentRow>>(`${this.base}/statement`, null, { params: { from, to, ...this.tenantParam(tenantId) } });
  }
  summary(tenantId?: string | null): Observable<ApiResponse<BillingSummary>> { return this.http.get<ApiResponse<BillingSummary>>(`${this.base}/summary`, { params: this.tenantParam(tenantId) }); }
  usageByMeter(q: UsageQuery): Observable<ApiResponse<{ rows: MeterLine[]; rateCard?: PricedWith }>> {
    return this.http.get<ApiResponse<{ rows: MeterLine[]; rateCard?: PricedWith }>>(`${this.base}/usage`, { params: this.usageParams(q, 'meter') });
  }
  usageByDay(q: UsageQuery): Observable<ApiResponse<{ rows: DayRow[] }>> {
    return this.http.get<ApiResponse<{ rows: DayRow[] }>>(`${this.base}/usage`, { params: this.usageParams(q, 'day') });
  }
  subjects(q: UsageQuery, meter: string, limit: number): Observable<ApiResponse<{ rows: SubjectRow[] }>> {
    return this.http.get<ApiResponse<{ rows: SubjectRow[] }>>(`${this.base}/subjects`, { params: { ...this.usageParams(q, 'meter'), meter, limit: String(limit) } });
  }
  /** Rolls every workspace's last two days again: the platform administrator's refresh. */
  refreshUsage(): Observable<ApiResponse<unknown>> { return this.http.post<ApiResponse<unknown>>(`${this.base}/refresh`, null); }
  /** Rolls the signed-in workspace's today and yesterday again: a workspace administrator's refresh. */
  refreshWorkspace(): Observable<ApiResponse<unknown>> { return this.http.post<ApiResponse<unknown>>(`${this.base}/refreshWorkspace`, null); }
  private usageParams(q: UsageQuery, groupBy: string): Record<string, string> {
    return { from: q.from, to: q.to, groupBy, ...this.tenantParam(q.tenantId) };
  }
  rateCards(): Observable<ApiResponse<{ cards: RateCard[] }>> { return this.http.get<ApiResponse<{ cards: RateCard[] }>>(`${this.base}/rateCards`); }
  rateCard(version: number): Observable<ApiResponse<RateCard>> { return this.http.get<ApiResponse<RateCard>>(`${this.base}/rateCard`, { params: { version: String(version) } }); }
  rateCardFor(tenantId: string | null, day?: string): Observable<ApiResponse<RateCard>> {
    return this.http.get<ApiResponse<RateCard>>(`${this.base}/rateCard`, { params: { ...this.tenantParam(tenantId), ...(day ? { day } : {}) } });
  }
  saveRateCard(card: RateCardDraft): Observable<ApiResponse<RateCard>> { return this.http.put<ApiResponse<RateCard>>(`${this.base}/rateCard`, card); }
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

/** The fixed sets the screens offer, in the order they are offered. They mirror the console's enums. */
export const INVOICE_STATUSES = ['overdue', 'issued', 'partially_paid', 'draft', 'paid', 'void'] as const;
export const DOCUMENT_KINDS = ['invoice', 'receipt', 'payment_slip', 'credit_note', 'statement'] as const;
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'bank', label: 'Bank transfer' }, { value: 'card', label: 'Card' }, { value: 'cash', label: 'Cash' }, { value: 'manual', label: 'Other' },
];
/** A payment's method as a person reads it; a credit note applied is recorded as a payment too. */
export function paymentMethodLabel(method: string): string {
  if (method === 'credit_note') return 'Credit note';
  return PAYMENT_METHODS.find(m => m.value === method)?.label ?? (method ? method[0].toUpperCase() + method.slice(1) : '');
}
/** The services a meter rolls up under, in the order the screens list them. */
export const SERVICES = ['Storage', 'Model calls', 'Seats', 'Pipelines', 'Analytics & tools', 'Other'];

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', partially_paid: 'Partially paid', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};
export const INVOICE_STATUS_TONE: Record<string, string> = {
  draft: 'pill-neutral', issued: 'pill-warn', partially_paid: 'pill-warn', paid: 'pill-ok', overdue: 'pill-crit', void: 'pill-neutral',
};
export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', receipt: 'Receipt', statement: 'Statement', payment_slip: 'Payment slip',
};
