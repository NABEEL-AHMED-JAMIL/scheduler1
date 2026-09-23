import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { BillingApi, InvoiceRow, INVOICE_STATUSES, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from './billing.service';
import { MoneyTotals, addMoney, daysOverdue, formatMoney, formatTotals, yearMonth } from './billing-format';
import { BillingAccountDialog } from './billing-account-dialog';
import { InvoicePane } from './invoice-detail';
import { WorkspacePicker } from './workspace-picker';

/**
 * Invoices as rail and pane: every month closed into a bill on the left, the one picked on the
 * right with its lines, QR code, documents, payments and story. A platform admin sees every
 * workspace and closes months; a workspace admin sees their own and pays. The address carries
 * the number (`/invoices/INV-…`), so a link from a document or a notification lands on the bill.
 */
@Component({
  selector: 'app-invoices',
  imports: [Icon, StatTile, InvoicePane, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './invoices.html',
})
export class Invoices implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly workspaces = inject(WorkspacePicker);

  readonly isPlatformAdmin = this.auth.isPlatformAdmin;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<InvoiceRow[]>([]);
  readonly status = signal<string>('');
  readonly search = signal('');
  readonly selectedNumber = signal<string | null>(null);
  readonly closing = signal(false);
  readonly closePeriod = signal(Invoices.lastMonth());

  readonly statusLabel = INVOICE_STATUS_LABEL;
  readonly statusTone = INVOICE_STATUS_TONE;
  readonly statuses = INVOICE_STATUSES;

  /** What needs attention, and what has been settled: the tiles. */
  readonly summary = computed(() => {
    const s = { overdue: 0, overdueAmount: 0, open: 0, openAmount: 0, slips: 0, drafts: 0, draftAmount: 0, paid: 0, paidAmount: 0,
      // What the tiles show: the same sums kept apart by currency, so pounds never read as dollars.
      overdueTotals: {} as MoneyTotals, openTotals: {} as MoneyTotals, draftTotals: {} as MoneyTotals, paidTotals: {} as MoneyTotals };
    for (const r of this.rows()) {
      if (r.kind !== 'invoice') continue;
      s.slips += r.pendingPayments ?? 0;
      if (r.status === 'overdue') { s.overdue++; s.overdueAmount += r.balance; s.overdueTotals = addMoney(s.overdueTotals, r.balance, r.currency); }
      if (r.status === 'issued' || r.status === 'partially_paid') { s.open++; s.openAmount += r.balance; s.openTotals = addMoney(s.openTotals, r.balance, r.currency); }
      if (r.status === 'draft') { s.drafts++; s.draftAmount += r.total; s.draftTotals = addMoney(s.draftTotals, r.total, r.currency); }
      if (r.status === 'paid') { s.paid++; s.paidAmount += r.total; s.paidTotals = addMoney(s.paidTotals, r.total, r.currency); }
    }
    return s;
  });
  readonly counts = computed(() => {
    const by: Record<string, number> = {};
    for (const r of this.rows()) by[r.status] = (by[r.status] ?? 0) + 1;
    return by;
  });
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase(), s = this.status();
    return this.rows().filter(r => (!s || r.status === s) && (!q || `${r.number} ${r.tenantName ?? ''} ${r.periodStart} ${this.period(r)}`.toLowerCase().includes(q)));
  });
  readonly selected = computed(() => this.rows().find(r => r.number === this.selectedNumber()) ?? null);
  readonly hasFilters = computed(() => !!this.search() || !!this.status());

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => { const n = p.get('number'); if (n) this.selectedNumber.set(n); });
    this.workspaces.ready(() => this.load());
  }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.api.invoices(this.workspaces.tenantId()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        const rows = (r.data ?? []).map(Invoices.numeric);
        this.rows.set(rows);
        // The address names one, and is left alone even when it is not in this list -- the
        // pane reads it by number and says why it cannot (a wrong number, another workspace's).
        // It used to be swapped for the first row here, so a deep link to a foreign or mistyped
        // invoice quietly opened a different bill. Otherwise the first that needs a look, else
        // the newest.
        if (!this.selectedNumber()) {
          const first = rows.find(x => x.status === 'overdue') ?? rows.find(x => (x.pendingPayments ?? 0) > 0) ?? rows[0] ?? null;
          if (first) this.select(first, true);
        }
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the invoices.'); },
    });
  }

  static numeric(r: InvoiceRow): InvoiceRow {
    return { ...r, subtotal: Number(r.subtotal), tax: Number(r.tax), total: Number(r.total), balance: Number(r.balance), taxRatePercent: Number(r.taxRatePercent), documentKinds: r.documentKinds ?? [], pendingPayments: Number(r.pendingPayments ?? 0) };
  }
  static lastMonth(): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return yearMonth(d); }

  select(r: InvoiceRow, replace = false): void {
    this.selectedNumber.set(r.number);
    this.router.navigate(['/billing/invoices', r.number], { replaceUrl: replace });
  }
  pickWorkspace(id: string): void { this.workspaces.tenantId.set(id); this.selectedNumber.set(null); this.load(); }
  setStatus(s: string): void { this.status.set(this.status() === s ? '' : s); }
  clearFilters(): void { this.search.set(''); this.status.set(''); }
  money(v: number, currency = 'USD'): string { return formatMoney(v, currency); }
  totals(t: MoneyTotals): string { return formatTotals(t); }
  period(r: InvoiceRow): string { return new Date(r.periodStart + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  overdueDays(r: InvoiceRow): number { return daysOverdue(r.dueAt); }
  /** The rail's dot: what the row's state means for the reader. */
  tone(r: InvoiceRow): string {
    return r.status === 'overdue' ? 'crit' : (r.pendingPayments ?? 0) > 0 ? 'warn' : r.status === 'paid' ? 'ok' : r.status === 'draft' || r.status === 'void' ? 'muted' : 'info';
  }
  docsLabel(r: InvoiceRow): string {
    const short: Record<string, string> = { invoice: 'PDF', credit_note: 'PDF', payment_slip: 'slip', receipt: 'receipt', statement: 'statement' };
    const order = ['invoice', 'credit_note', 'payment_slip', 'receipt', 'statement'];
    const kinds = [...(r.documentKinds ?? [])].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(k => short[k] ?? k);
    return kinds.length ? kinds.join(' · ') + ((r.pendingPayments ?? 0) > 0 ? ' · slip pending' : '') : ((r.pendingPayments ?? 0) > 0 ? 'slip pending' : '');
  }

  /** A draft for the picked workspace and month, from the meter -- or, for every workspace, the month close. */
  draft(period = this.closePeriod()): void {
    if (!this.isPlatformAdmin()) return;
    this.closing.set(true);
    const call: Observable<ApiResponse<unknown>> = this.workspaces.tenantId() ? this.api.draft(this.workspaces.tenantId()!, period) : this.api.closeMonth(period);
    call.subscribe({
      next: (r: ApiResponse<unknown>) => { this.closing.set(false); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
      error: (err: HttpErrorResponse) => { this.closing.set(false); this.toast.error(err.error?.message || 'The draft could not be built.'); },
    });
  }

  editAccount(): void {
    this.dialog.open<boolean>(BillingAccountDialog, { hasBackdrop: true, data: { tenantId: this.workspaces.tenantId() } })
      .closed.subscribe(saved => { if (saved) this.toast.success('Billing profile saved.'); });
  }

  statement(): void {
    const year = new Date().getFullYear();
    this.api.statement(`${year}-01-01`, `${year}-12-31`, this.workspaces.tenantId()).subscribe({
      next: r => { if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; } this.toast.success(r.message); this.api.documentBlob(r.data.documentId).subscribe(b => BillingApi.open(b)); },
      error: err => this.toast.error(err?.error?.message || 'The statement could not be prepared.'),
    });
  }
}
