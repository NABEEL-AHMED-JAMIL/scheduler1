import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Observable } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { Combobox } from '../../shared/ui/combobox';
import { TableShell } from '../../shared/ui/data-table';
import { BillingApi, InvoiceRow, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from './billing.service';
import { BillingAccountDialog } from './billing-account-dialog';
import { WorkspacePicker } from './workspace-picker';

/**
 * Invoices: every month closed into a bill, with its status, balance and documents. A platform
 * admin sees every workspace and closes months; a workspace admin sees their own and pays.
 */
@Component({
  selector: 'app-invoices',
  imports: [Icon, Combobox, TableShell, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './invoices.html',
})
export class Invoices implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  readonly workspaces = inject(WorkspacePicker);

  readonly isPlatformAdmin = this.auth.isPlatformAdmin;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<InvoiceRow[]>([]);
  readonly status = signal<string>('');
  readonly search = signal('');
  readonly closing = signal(false);
  readonly closePeriod = signal(Invoices.lastMonth());

  readonly statusLabel = INVOICE_STATUS_LABEL;
  readonly statusTone = INVOICE_STATUS_TONE;

  readonly counts = computed(() => {
    const by: Record<string, { n: number; amount: number }> = {};
    for (const r of this.rows()) {
      if (r.kind !== 'invoice') continue;
      const c = by[r.status] ?? (by[r.status] = { n: 0, amount: 0 });
      c.n++; c.amount += r.status === 'paid' || r.status === 'void' ? r.total : r.balance;
    }
    return by;
  });
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase(), s = this.status();
    return this.rows().filter(r => (!s || r.status === s) && (!q || `${r.number} ${r.tenantName ?? ''} ${r.periodStart}`.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.workspaces.ready(() => this.load());
  }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.api.invoices(this.workspaces.tenantId()).subscribe({
      next: r => { this.loading.set(false); if (r.status !== API_SUCCESS) { this.error.set(r.message); return; } this.rows.set((r.data ?? []).map(Invoices.numeric)); },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the invoices.'); },
    });
  }

  static numeric(r: InvoiceRow): InvoiceRow {
    return { ...r, subtotal: Number(r.subtotal), tax: Number(r.tax), total: Number(r.total), balance: Number(r.balance), taxRatePercent: Number(r.taxRatePercent) };
  }
  static lastMonth(): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  static thisMonth(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

  pickWorkspace(id: string): void { this.workspaces.tenantId.set(id); this.load(); }
  setStatus(s: string): void { this.status.set(this.status() === s ? '' : s); }
  open(r: InvoiceRow): void { this.router.navigate(['/administration/billing/invoices', r.number]); }
  money(v: number, currency = 'USD'): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }
  period(r: InvoiceRow): string { return new Date(r.periodStart + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  overdueDays(r: InvoiceRow): number { return r.dueAt ? Math.max(0, Math.floor((Date.now() - new Date(r.dueAt).getTime()) / 86_400_000)) : 0; }

  /** A draft for the picked workspace and month, from the meter -- or, for every workspace, the month close. */
  draft(period = this.closePeriod()): void {
    if (!this.isPlatformAdmin()) return;
    this.closing.set(true);
    const call: Observable<ApiResponse<unknown>> = this.workspaces.tenantId() ? this.api.draft(this.workspaces.tenantId()!, period) : this.api.closeMonth(period);
    call.subscribe({
      next: (r: ApiResponse<unknown>) => { this.closing.set(false); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
      error: (err: any) => { this.closing.set(false); this.toast.error(err?.error?.message || 'The draft could not be built.'); },
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
