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
  /** H9: the billing time zone the period's days were counted in, and the period as the PDF states it ("1–31 Oct 2026, America/Chicago"). */
  timeZone?: string | null; periodLabel?: string | null;
  /** The kinds of document the invoice has (invoice, payment_slip, receipt, credit_note) and slips awaiting verification. */
  documentKinds?: string[]; pendingPayments?: number;
  /**
   * MIG-359, paying by card (Stripe, test mode first): whether Pay now is offered, the open hosted checkout, the last card
   * decline (until a payment arrives) and 'card' once a card payment settled it.
   */
  cardPayable?: boolean; payLinkOpen?: boolean; payLinkUrl?: string | null; payLinkExpiresAt?: string | null;
  paymentError?: string | null; paymentErrorAt?: string | null; paidVia?: string | null;
}
export interface InvoiceLine {
  invoiceLineId: number; sort: number; meter?: string; description: string; quantity: number; unit?: string; per: number;
  unitPrice: number; amount: number; periodLabel?: string; manual: boolean;
  /** What the calculation applied when the line was frozen: the allowance and, as JSON, the tier bands. */
  includedQuantity?: number | null; billableQuantity?: number | null; pricingDetail?: string | null;
  /** MIG-337: who used the line's meter, as JSON [{subjectType, subjectId, quantity}] -- an API client's calls, a webhook's deliveries. */
  breakdown?: string | null;
  /** Rate card fallback: the default card that priced the line, when the workspace's own card does not name its meter. */
  pricedFromVersion?: number | null; pricedFromName?: string | null;
  /** Owner #23: the pricing rule of the invoice's rate card version that priced this line (its meter's usage that matched). */
  ruleNo?: number | null;
}
/** One subject of a line's breakdown (MIG-337). */
export interface LineSubject { subjectType: string; subjectId: string | null; quantity: number }
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
  /** Owner #23: the version's pricing rules, most specific first (absent: none). */
  rules?: RateRule[];
}
/** What a pricing rule matches (owner #23): one pipeline, the pipelines with a tag, or a data class. */
export type RuleKind = 'PIPELINE' | 'TAG' | 'CLASS';
/**
 * A pricing rule (owner #23): one meter's unit price for the usage of a pipeline (its id), of the pipelines with a tag,
 * or of a data class. The most specific wins -- pipeline, then tag (the lowest number), then class -- then the card's item.
 */
export interface RateRule {
  rule_no: number; meter: string; match_kind: RuleKind; match_value: string; unit_price: number | string; note?: string | null; label?: string;
}
/** What a card is saved as: everything but the version, which the meter assigns. */
export interface RateCardDraft {
  name: string; tenant_id: number | null; effective_from: string; currency: string; based_on_version: number | null; note: string;
  items: { meter: string; unit: string; per: number; unit_price: number; included_quantity: number; tiers: RateTier[] }[];
  /** Per-model items of the card it is drafted from to leave out (MIG-308). */
  removed?: string[];
  /** Owner #23: every pricing rule the version carries; absent carries the based-on version's over. */
  rules?: RateRule[];
}
/** A version being prepared (owner #23): saved, previewed, then published; it prices nothing until then. */
export interface RateCardDraftRow {
  draft_id: number; tenant_id: number | null; tenantName?: string | null; based_on_version: number | null; name: string; effective_from: string;
  card: RateCardDraft; created_at?: string; updated_at?: string; created_by?: number | null; updated_by?: number | null;
}
/** One rule's share of a meter's period (owner #23), as Cost &amp; usage and the preview list it. */
export interface RulePart {
  ruleNo: number; matchKind: RuleKind; matchValue: string; label: string; quantity: number; includedQuantity: number; billableQuantity: number;
  unitPrice: number; amount: number;
}
/** What a month would have cost with a draft (owner #23), per workspace. */
export interface RatePreview {
  period: string; tenantId: number | null; draftId?: number | null; current: number; draft: number; difference: number; onOwnCard: number;
  rules: RateRule[];
  workspaces: {
    tenantId: number; tenantName?: string | null; zone: string; currentVersion: number | null; currentName: string | null;
    current: number; draft: number; difference: number;
    invoice?: { number: string; status: string; total: number; currency: string; rateCardVersion: number | null } | null;
    changes: { meter: string; label: string; service: string; quantity: number; current: number; draft: number; difference: number;
      currentUnitPrice: number | null; draftUnitPrice: number | null; rules: RulePart[] }[];
  }[];
}
export interface PaymentRow {
  paymentId: number; amount: number; method: string; reference?: string; note?: string; status: 'submitted' | 'verified' | 'rejected';
  receiptNumber?: string; submittedBy?: string; verifiedBy?: string; verifiedAt?: string; receivedAt?: string; dateCreated: string; hasSlip: boolean;
  /** The day the money was received, YYYY-MM-DD in the workspace's billing time zone (payment review 2026-10-12). */
  receivedOn?: string | null;
  /** Answered by payment/submit and payment/verify: the invoice after the payment. */
  invoiceStatus?: string; invoiceBalance?: number;
  /** MIG-359: a card payment's provider and ids -- never card data, which Billing never sees. */
  currency?: string | null; provider?: string | null; providerPaymentId?: string | null; providerChargeId?: string | null;
  providerSessionId?: string | null; refundedAmount?: number | null;
  /** Owner #10 (MIG-393): who verified it and in what role, as the receipt names them (frozen at verification). */
  approverName?: string | null; approverRole?: string | null;
}
/** billing.json/payments: the latest payments, a workspace's or (the platform's) every workspace's (MIG-359). */
export interface PaymentListRow extends PaymentRow {
  tenantId: number; tenantName?: string | null; invoiceId: number; invoiceNumber: string;
}
/** billing.json/invoice/payLink: the provider's hosted checkout for the invoice's balance. */
export interface PayLink {
  invoiceId: number; number: string; url: string; sessionId: string; expiresAt: string; amount: number; currency: string; provider: string; testMode: boolean;
}
export interface DocumentRow {
  documentId: number; kind: 'invoice' | 'credit_note' | 'receipt' | 'statement' | 'payment_slip'; number?: string; fileName: string;
  contentType?: string; sizeBytes?: number; amount?: number; issuedAt: string; invoiceId?: number; invoiceNumber?: string; paymentId?: number;
  tenantId: number; tenantName?: string; createdByName?: string;
  /** The currency `amount` is in: its invoice's, or the workspace's for a statement. */
  currency?: string;
  /** Owner #9/#10: what it is about -- its invoice's period and status, its payment's state -- and a receipt's signature. */
  invoiceStatus?: InvoiceRow['status'] | null; periodLabel?: string | null;
  paymentStatus?: PaymentRow['status'] | null; paymentMethod?: string | null; paymentProvider?: string | null;
  paymentAmount?: number | null; refundedAmount?: number | null;
  signed?: boolean; sha256?: string | null;
}
/** Owner #10 (MIG-393): one check of "Verify this receipt". */
export interface ReceiptCheck { key: 'signed' | 'intact' | 'certified' | 'issued' | 'certificate'; label: string; ok: boolean; detail: string; }
/** billing.json/receipt/verify: the verdict, each check, the receipt it matched and what its signature says. */
export interface ReceiptVerdict {
  verified: boolean; source: 'stored' | 'upload'; summary: string; checks: ReceiptCheck[]; trustNote: string;
  receipt?: { documentId: number; number: string; tenantId: number; invoiceId?: number; paymentId?: number; amount?: number; issuedAt?: string; sha256?: string };
  signature: { signed: boolean; signerName?: string | null; signerSubject?: string | null; certificateSha256?: string | null;
    certificateNotAfter?: string | null; reason?: string | null; location?: string | null; signedAt?: string | null; sha256: string; problems: string[] };
}
/** billing.json/receipt/signing: whether receipts are signed, and with which certificate -- never the key. */
export interface ReceiptSigning {
  configured: boolean; subject?: string; signerName?: string; certificateSha256?: string; notAfter?: string; selfIssued?: boolean;
  reason: string; trustNote?: string;
}
/** billing.json/stamp: the receipt stamp the platform's (and one workspace's) receipts use. */
export interface StampInfo { fileName: string; contentType: string; sizeBytes: number; updatedBy?: number | null; dateUpdated?: string | null; }
export interface ReceiptStamp {
  platformName: string; platform: StampInfo | null; workspace?: StampInfo | null; uses: 'generated' | 'platform' | 'workspace'; signing: ReceiptSigning;
}
export interface InvoiceDetail extends InvoiceRow {
  lines: InvoiceLine[]; payments: PaymentRow[]; documents: DocumentRow[]; account: BillingAccount; referencesNumber?: string; createdByName?: string;
}
/** One row of billing.json/usage?groupBy=meter: a meter's period, priced with the card in effect. */
export interface MeterLine {
  meter: string; label: string; service: string; unit: string; per: number;
  unitPrice: number; quantity: number; amount: number; days: number;
  /** The calculation applied to the period: allowance first, then tier bands if the card has them. */
  includedQuantity: number; billableQuantity: number; tiers: AppliedTier[]; hasTiers: boolean;
  /** Used, and no card prices it -- neither the workspace's own nor the default: billed at 0. */
  unpriced?: boolean;
  /** Not on the workspace's own card: priced from the default card in effect (rate card fallback). */
  pricedFrom?: { version: number; name: string } | null;
  /**
   * Owner #23: usage pricing rules priced, each rule's part (the line's quantity and amount include them), and the card's
   * own part: its quantity and amount. Absent when no rule priced this meter.
   */
  rules?: RulePart[];
  cardQuantity?: number; cardAmount?: number; cardIncludedQuantity?: number; cardBillableQuantity?: number;
}
/** The card a period is priced with, as the meter names it. */
export interface PricedWith {
  version: number; name: string; currency: string; tenantSpecific: boolean; effectiveFrom: string;
  /** A workspace's own card: the default card the meters it does not name are priced from. */
  fallback?: { version: number; name: string; effectiveFrom: string } | null;
}
export interface DayRow {
  day: string; amount: number; byService: Record<string, number>;
  /** Each meter's quantity and flat amount that day, before the month's allowances and tiers (a day picked on Cost by day). */
  byMeter?: Record<string, { quantity: number; amount: number }>;
}
/** A billing day's count and total over a whole range, every page included: a day header of Cost per model call or By run. */
export interface DayTotal { day: string | null; runs: number; amount?: number; cost?: number; }
/**
 * H9: the billing calendar a usage answer was counted in -- the workspace's billing time zone, today there, the month under
 * way there, and the instants the range covers. Days are the workspace's, never the browser's or UTC's.
 */
export interface UsageCalendar { timeZone?: string | null; endTimeZone?: string; today?: string; currentMonth?: string; periodStart?: string; periodEnd?: string; }
/** H9: a workspace's billing time zone, as Billing keeps it (Administration › Tenants). */
export interface BillingTimeZone {
  tenantId: number; month: string; zone: string; monthStart: string; monthEnd: string; today: string; defaultZone: string;
  nextMonth: string; nextMonthZone: string; changeTakesEffect: string;
  scheduled: { effectiveMonth: string; zone: string }[];
  history: { id: number; effectiveMonth: string; zone: string; reason: string | null; setBy: number | null; setAt: string | null }[];
}
export interface SubjectRow { subject_type: string; subject_id: string; quantity: number; events: number; last: string | null; actor_user_id: number | null; actor_name?: string | null; }
/** One priced line of a run: what its tokens were priced as (a model's own item, or the meter's). */
export interface RunLine { meter: string; label: string; quantity: number; unit: string; per: number; unit_price: number; amount: number; }
/**
 * billing.json/runs (MIG-308): one model-call run -- a prompt, a document's extraction, a tool run, a question, a
 * console call -- with its model and what it cost at that model's rate, before monthly allowances and tiers.
 */
export interface RunRow {
  run: string; subject_type: string | null; subject_id: string | null; model: string; job_queue_id: number | null;
  actor_user_id: number | null; actor_name?: string | null; source: string | null; first: string; last: string;
  tokens_in: number; tokens_out: number; amount: number; lines: RunLine[];
  /** The pipeline run's schedule (for its link) and pipeline, as Core names them; absent when Core did not answer. */
  job_id?: number | null; task_detail_id?: number | null; pipeline?: string | null;
}
/** The figures billing.json/runs/summary adds up, for the range, a source or a model. */
export interface ModelCallFigures { calls: number; runs: number; tokens_in: number; tokens_out: number; amount: number; last: string | null; }
/** One thing that called a model: a saved prompt (subject_id), or every tool run, document extraction, question or console call. */
export interface ModelCallSource extends ModelCallFigures { subject_type: string | null; subject_id: string | null; label: string; model: string | null; models: number; }
export interface ModelCallModel extends ModelCallFigures { model: string | null; }
/** A rate the calls were priced at: a model's own item (model named) or the meter's. */
export interface ModelCallRate { meter: string; side: 'in' | 'out'; model: string | null; unit: string; per: number; unit_price: number; }
/**
 * Cost & usage redesign (2026-10-19): billing.json/runs/summary -- every page of /runs added up by what called the model
 * and by model, at the same prices (before the month's allowances and tiers).
 */
export interface ModelCallSummary {
  from: string; to: string; zone: string | null; currency: string | null;
  totals: ModelCallFigures; bySource: ModelCallSource[]; byModel: ModelCallModel[]; rates: ModelCallRate[];
}
/** What every usage read names: a range, a workspace for a platform administrator, and how to group. */
export interface UsageQuery { from: string; to: string; tenantId?: string | null; }

/** UX review B9 (BL1): one run's share of the priced lines (billing.json/pipelineCosts, runCost). */
/** Owner #23: `line` and `ruleNo` name a pricing rule's part of a meter (its label says the rule). */
export interface RunCostMeter { meter: string; label: string; quantity: number; unit: string; cost: number; line?: string; ruleNo?: number | null; }
export interface RunCostRow {
  jobQueueId: number; jobId: number | null; schedule: string | null; taskDetailId: number | null; pipeline: string | null;
  status?: string | null; startedAt: string | null; lastUsageAt?: string | null; cost: number; meters: RunCostMeter[];
}
export interface PipelineCostRow {
  taskDetailId: number | null; pipeline: string | null; runs: number; cost: number; lastRunAt: string | null;
  /** What the pipeline's runs cost by meter, the dearest first (By pipeline's "mostly model tokens"). */
  meters?: { meter: string; label: string; cost: number }[];
}
/** Which runs By run lists: one pipeline's, a search, a status (billing.json/pipelineCosts' taskDetailId, q, status). */
export interface RunFilter { taskDetailId?: number | null; q?: string | null; status?: string | null; }
export interface PipelineCosts {
  from: string; to: string; zone: string | null; currency: string | null; total: number; attributed: number; notTiedToRun: number;
  namesResolved?: boolean; pipelines: PipelineCostRow[];
  runs: { total: number; page: number; limit: number; rows: RunCostRow[]; days?: DayTotal[]; cost?: number;
    statuses?: { status: string | null; runs: number }[]; filter?: RunFilter };
}
export interface RunCost extends RunCostRow { from: string | null; to: string | null; currency: string | null; namesResolved?: boolean; }

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
  /** unpricedMeters: meters the workspace used that no card prices -- neither its own nor the default (billed at 0). */
  usageByTenant?: { tenantId: number; amount: number; quantityByMeter: Record<string, number>; unpricedMeters?: string[] }[] | null;
}

/**
 * Owner #22 (2026-10-19): billing.json/costTrends -- what was used, priced day by day (before the month's allowances and
 * tiers), by month, by service and by pipeline; across every workspace (the platform's, with no tenantId) by workspace
 * instead of by pipeline.
 */
export interface CostTrends {
  tenantId: number | null;
  from: string;
  to: string;
  total: number;
  months: { month: string; amount: number; byService: Record<string, number> }[];
  byService: { service: string; amount: number }[];
  byPipeline?: PipelineCostRow[] | null;
  byWorkspace?: { tenantId: number; amount: number }[];
}

/** Owner #19: Platform › Workspaces' cost figures (billing.json/workspaceFigures, platform administrators). */
export interface WorkspaceFigure {
  tenantId: number;
  costThisMonth: number;
  /** Bytes written less bytes deleted, as metered since the start. */
  storageBytes: number | null;
  plan: string | null;
  planVersion?: number | null;
  planOwn?: boolean;
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
  /**
   * A payment against an invoice: a workspace's slip, or the platform's record of money received (`verified`: counted at
   * once, with its receipt). `idempotencyKey` is sent as the Idempotency-Key header: the same key for every try of one
   * form, so a double click or a retry records it once. Refusals come back as 4xx with the sentence (payment review 2026-10-12).
   */
  submitPayment(invoiceId: number, amount: number | string, method: string, reference: string, note: string, slip: File | null,
                extra: { currency?: string; receivedOn?: string; verified?: boolean; idempotencyKey?: string } = {}): Observable<ApiResponse<PaymentRow>> {
    const form = new FormData();
    form.append('invoiceId', String(invoiceId)); form.append('amount', String(amount)); form.append('method', method);
    if (reference) form.append('reference', reference);
    if (note) form.append('note', note);
    if (slip) form.append('slip', slip, slip.name);
    if (extra.currency) form.append('currency', extra.currency);
    if (extra.receivedOn) form.append('receivedOn', extra.receivedOn);
    if (extra.verified) form.append('verified', 'true');
    const headers: Record<string, string> = extra.idempotencyKey ? { 'Idempotency-Key': extra.idempotencyKey } : {};
    return this.http.post<ApiResponse<PaymentRow>>(`${this.base}/payment/submit`, form, { headers });
  }
  verifyPayment(paymentId: number, accept: boolean, note: string): Observable<ApiResponse<PaymentRow>> {
    return this.http.post<ApiResponse<PaymentRow>>(`${this.base}/payment/verify`, null, { params: { paymentId: String(paymentId), accept: String(accept), note } });
  }
  /** MIG-359: the invoice's card pay link -- the open checkout reused, else a new one. */
  payLink(invoiceId: number): Observable<ApiResponse<PayLink>> { return this.http.post<ApiResponse<PayLink>>(`${this.base}/invoice/payLink`, null, { params: { invoiceId: String(invoiceId) } }); }
  /** MIG-359: the latest payments -- slips, cards (paid and declined), credit notes applied. */
  payments(tenantId?: string | null): Observable<ApiResponse<PaymentListRow[]>> { return this.http.get<ApiResponse<PaymentListRow[]>>(`${this.base}/payments`, { params: this.tenantParam(tenantId) }); }
  documents(tenantId?: string | null): Observable<ApiResponse<DocumentRow[]>> { return this.http.get<ApiResponse<DocumentRow[]>>(`${this.base}/documents`, { params: this.tenantParam(tenantId) }); }
  /** The invoice number as a QR code (PNG); the PDF carries the same one. */
  qrBlob(number: string, size = 160): Observable<Blob> { return this.http.get(`${this.base}/invoice/qr`, { params: { number, size: String(size) }, responseType: 'blob' }); }
  // ---- owner #10 (MIG-393): signed receipts and the receipt stamp ----
  verifyReceipt(number: string): Observable<ApiResponse<ReceiptVerdict>> { return this.http.get<ApiResponse<ReceiptVerdict>>(`${this.base}/receipt/verify`, { params: { number } }); }
  verifyReceiptFile(file: File): Observable<ApiResponse<ReceiptVerdict>> {
    const form = new FormData(); form.append('file', file, file.name);
    return this.http.post<ApiResponse<ReceiptVerdict>>(`${this.base}/receipt/verify`, form);
  }
  receiptSigning(): Observable<ApiResponse<ReceiptSigning>> { return this.http.get<ApiResponse<ReceiptSigning>>(`${this.base}/receipt/signing`); }
  receiptCertificate(): Observable<Blob> { return this.http.get(`${this.base}/receipt/certificate`, { responseType: 'blob' }); }
  stamp(tenantId?: number | null): Observable<ApiResponse<ReceiptStamp>> { return this.http.get<ApiResponse<ReceiptStamp>>(`${this.base}/stamp`, { params: this.tenantParam(tenantId == null ? null : String(tenantId)) }); }
  saveStamp(file: File, tenantId?: number | null): Observable<ApiResponse<ReceiptStamp>> {
    const form = new FormData(); form.append('file', file, file.name);
    return this.http.post<ApiResponse<ReceiptStamp>>(`${this.base}/stamp`, form, { params: this.tenantParam(tenantId == null ? null : String(tenantId)) });
  }
  removeStamp(tenantId?: number | null): Observable<ApiResponse<ReceiptStamp>> { return this.http.post<ApiResponse<ReceiptStamp>>(`${this.base}/stamp/remove`, null, { params: this.tenantParam(tenantId == null ? null : String(tenantId)) }); }
  stampSpecimen(tenantId?: number | null): Observable<Blob> { return this.http.get(`${this.base}/stamp/specimen`, { params: this.tenantParam(tenantId == null ? null : String(tenantId)), responseType: 'blob' }); }
  // ---- Report Studio phase 7, the comparison month (RS-Q11): platform administrators ----
  /** Compares an issued invoice, credit note or receipt with Report Studio's copy of it, now. */
  studioCompare(documentId: number): Observable<ApiResponse<StudioComparison>> {
    return this.http.post<ApiResponse<StudioComparison>>(`${this.base}/studioComparison/run`, null, { params: { documentId: String(documentId) } });
  }
  /** The verdicts kept, newest first (one workspace's, or every one's), and how many documents have none yet. */
  studioComparisons(tenantId?: string | null): Observable<ApiResponse<{ comparisons: StudioComparisonRow[]; byVerdict: Record<string, number>; notYetCompared: number }>> {
    return this.http.get<ApiResponse<{ comparisons: StudioComparisonRow[]; byVerdict: Record<string, number>; notYetCompared: number }>>(`${this.base}/studioComparisons`,
      { params: { ...this.tenantParam(tenantId), limit: '500' } });
  }
  /** Report Studio's copy of a document as a PDF (drawn again, never stored). */
  studioCopy(documentId: number): Observable<Blob> { return this.http.get(`${this.base}/studioComparison/copy`, { params: { documentId: String(documentId) }, responseType: 'blob' }); }
  documentBlob(documentId: number): Observable<Blob> { return this.http.get(`${this.base}/document`, { params: { documentId: String(documentId) }, responseType: 'blob' }); }
  statement(from: string, to: string, tenantId?: string | null): Observable<ApiResponse<DocumentRow>> {
    return this.http.post<ApiResponse<DocumentRow>>(`${this.base}/statement`, null, { params: { from, to, ...this.tenantParam(tenantId) } });
  }
  summary(tenantId?: string | null): Observable<ApiResponse<BillingSummary>> { return this.http.get<ApiResponse<BillingSummary>>(`${this.base}/summary`, { params: this.tenantParam(tenantId) }); }
  usageByMeter(q: UsageQuery): Observable<ApiResponse<{ rows: MeterLine[]; rateCard?: PricedWith } & UsageCalendar>> {
    return this.http.get<ApiResponse<{ rows: MeterLine[]; rateCard?: PricedWith } & UsageCalendar>>(`${this.base}/usage`, { params: this.usageParams(q, 'meter') });
  }
  usageByDay(q: UsageQuery): Observable<ApiResponse<{ rows: DayRow[] } & UsageCalendar>> {
    return this.http.get<ApiResponse<{ rows: DayRow[] } & UsageCalendar>>(`${this.base}/usage`, { params: this.usageParams(q, 'day') });
  }
  /** H9: a workspace's billing time zone, its months and every change recorded (a workspace administrator reads their own). */
  timeZone(tenantId?: string | number | null): Observable<ApiResponse<BillingTimeZone>> {
    return this.http.get<ApiResponse<BillingTimeZone>>(`${this.base}/timeZone`, { params: this.tenantParam(tenantId == null ? null : String(tenantId)) });
  }
  /** H9: the IANA zones a platform administrator may pick. */
  timeZones(): Observable<ApiResponse<string[]>> { return this.http.get<ApiResponse<string[]>>(`${this.base}/timeZones`); }
  /** H9: sets a workspace's billing time zone from the first month it may take effect (the platform administrator). */
  setTimeZone(tenantId: number, zone: string, reason: string): Observable<ApiResponse<{ zone: string; effectiveMonth: string; previousZone: string }>> {
    return this.http.post<ApiResponse<{ zone: string; effectiveMonth: string; previousZone: string }>>(`${this.base}/timeZone`, null,
      { params: { tenantId: String(tenantId), zone, reason } });
  }
  subjects(q: UsageQuery, meter: string, limit: number): Observable<ApiResponse<{ rows: SubjectRow[] }>> {
    return this.http.get<ApiResponse<{ rows: SubjectRow[] }>>(`${this.base}/subjects`, { params: { ...this.usageParams(q, 'meter'), meter, limit: String(limit) } });
  }
  /** Cost per run (MIG-308): the month's model-call runs, newest first, a page at a time. */
  runs(q: UsageQuery, page: number, limit: number): Observable<ApiResponse<{ total: number; page: number; limit: number; rows: RunRow[]; days?: DayTotal[] }>> {
    return this.http.get<ApiResponse<{ total: number; page: number; limit: number; rows: RunRow[]; days?: DayTotal[] }>>(`${this.base}/runs`, {
      params: { from: q.from, to: q.to, page: String(page), limit: String(limit), ...this.tenantParam(q.tenantId) } });
  }
  /** Rolls every workspace's last two days again: the platform administrator's refresh. */
  /** UX review B9: what each pipeline and run cost, shared out of the same priced lines (adds up to the range's total). */
  pipelineCosts(q: UsageQuery, page = 1, limit = 25, filter: RunFilter = {}): Observable<ApiResponse<PipelineCosts>> {
    const narrow: Record<string, string> = {};
    if (filter.taskDetailId) narrow['taskDetailId'] = String(filter.taskDetailId);
    if (filter.q?.trim()) narrow['q'] = filter.q.trim();
    if (filter.status) narrow['status'] = filter.status;
    return this.http.get<ApiResponse<PipelineCosts>>(`${this.base}/pipelineCosts`, {
      params: { from: q.from, to: q.to, page: String(page), limit: String(limit), ...narrow, ...this.tenantParam(q.tenantId) } });
  }
  /** AI model calls (Cost & usage redesign): the range's calls added up by source and by model, priced as /runs prices them. */
  runSummary(q: UsageQuery): Observable<ApiResponse<ModelCallSummary>> {
    return this.http.get<ApiResponse<ModelCallSummary>>(`${this.base}/runs/summary`, { params: { from: q.from, to: q.to, ...this.tenantParam(q.tenantId) } });
  }
  runCost(jobQueueId: number, tenantId?: string | null): Observable<ApiResponse<RunCost>> {
    return this.http.get<ApiResponse<RunCost>>(`${this.base}/runCost`, { params: { jobQueueId: String(jobQueueId), ...this.tenantParam(tenantId) } });
  }
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
  // Owner #23: drafts, publishing and the preview (Billing › Settings, platform administrators).
  rateCardDrafts(): Observable<ApiResponse<{ drafts: RateCardDraftRow[] }>> {
    return this.http.get<ApiResponse<{ drafts: RateCardDraftRow[] }>>(`${this.base}/rateCardDrafts`);
  }
  /** A draft saved: a new one, or `draftId` changed. A refusal carries one sentence per problem in data.problems. */
  saveRateCardDraft(card: RateCardDraft, draftId?: number | null): Observable<ApiResponse<RateCardDraftRow>> {
    return this.http.put<ApiResponse<RateCardDraftRow>>(`${this.base}/rateCardDraft`, card, { params: draftId ? { draftId: String(draftId) } : {} });
  }
  deleteRateCardDraft(draftId: number): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/rateCardDraft`, { params: { draftId: String(draftId) } });
  }
  publishRateCardDraft(draftId: number): Observable<ApiResponse<RateCard>> {
    return this.http.post<ApiResponse<RateCard>>(`${this.base}/rateCardDraft/publish`, null, { params: { draftId: String(draftId) } });
  }
  /** What last month (or `period`, YYYY-MM) would have cost with a saved draft, or with the card given. Read only. */
  previewRateCard(what: { draftId: number } | { card: RateCardDraft }, period?: string): Observable<ApiResponse<RatePreview>> {
    const params: Record<string, string> = { ...('draftId' in what ? { draftId: String(what.draftId) } : {}), ...(period ? { period } : {}) };
    return this.http.post<ApiResponse<RatePreview>>(`${this.base}/rateCard/preview`, 'card' in what ? what.card : null, { params });
  }
  costTrends(from: string, to: string, tenantId?: number | null): Observable<ApiResponse<CostTrends>> {
    return this.http.get<ApiResponse<CostTrends>>(`${this.base}/costTrends`, { params: { from, to, ...(tenantId ? { tenantId: String(tenantId) } : {}) } });
  }
  workspaceFigures(): Observable<ApiResponse<{ month: string; storageDay: string; workspaces: WorkspaceFigure[] }>> {
    return this.http.get<ApiResponse<{ month: string; storageDay: string; workspaces: WorkspaceFigure[] }>>(`${this.base}/workspaceFigures`);
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
export { SERVICES } from './cost-by-day-model';
/** The meters a card may price per model, as `<meter>@<model>` items (MIG-308). */
export const MODEL_PRICED_METERS = ['ai.tokens.in', 'ai.tokens.out'];
/** The model a per-model item names; null for a meter's own item. */
export function modelOfMeter(meter: string): string | null {
  const at = meter.indexOf('@');
  return at > 0 && MODEL_PRICED_METERS.includes(meter.slice(0, at)) ? meter.slice(at + 1) : null;
}

/**
 * MIG-359: the card payment chip beside an invoice's status -- Paid by card, a card that was declined, or a pay link
 * that is open -- or null when card payment says nothing about the invoice.
 */
export function cardPaymentChip(i: Pick<InvoiceRow, 'status' | 'paidVia' | 'paymentError' | 'payLinkOpen' | 'cardPayable'>):
  { label: string; tone: string; title: string } | null {
  if (i.status === 'paid' && i.paidVia === 'card') return { label: 'Paid by card', tone: 'pill-pay pill-pay-card', title: 'Paid online by card through Stripe' };
  const open = i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue';
  if (!open) return null;
  if (i.paymentError) return { label: 'Card declined', tone: 'pill-pay pill-pay-failed', title: i.paymentError };
  if (i.payLinkOpen) return { label: 'Pay link open', tone: 'pill-neutral', title: 'A Stripe checkout is open for this invoice' };
  return null;
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', partially_paid: 'Partially paid', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};
/**
 * Owner #8 (2026-10-19): each invoice state its own chip -- a draft outlined (still changing), issued blue (open, nothing
 * wrong), partly paid amber, paid green, overdue red, void grey -- where issued and partly paid were one amber, and a
 * draft and a void one grey.
 */
export const INVOICE_STATUS_TONE: Record<string, string> = {
  draft: 'pill-brand', issued: 'pill-info', partially_paid: 'pill-warn', paid: 'pill-ok', overdue: 'pill-crit', void: 'pill-neutral',
};
export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', receipt: 'Receipt', statement: 'Statement', payment_slip: 'Payment slip',
};

/** Report Studio phase 7 (RS-Q11): an issued document compared with Report Studio's copy of it. */
export interface StudioComparison {
  documentId: number; number?: string | null; kind: string; verdict: 'MATCH' | 'DIFFER' | 'FAILED'; checked?: number; missing?: string[];
  notInIssued?: string[]; copyPages?: number; error?: string;
}
export interface StudioComparisonRow {
  id: number; tenantId: number; documentId: number; kind: string; number?: string | null; verdict: 'MATCH' | 'DIFFER' | 'FAILED'; checked: number;
  differences: { missing?: string[]; notInIssued?: string[] }; copyPages?: number | null; error?: string | null; comparedAt: string;
}
