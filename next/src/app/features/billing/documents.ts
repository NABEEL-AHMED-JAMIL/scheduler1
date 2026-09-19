import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { Combobox } from '../../shared/ui/combobox';
import { TableShell } from '../../shared/ui/data-table';
import { formatSize } from '../../shared/ui/format-size';
import { BillingApi, DOCUMENT_KIND_LABEL, DocumentRow } from './billing.service';
import { WorkspacePicker } from './workspace-picker';

/** Every billing document -- invoices, receipts, credit notes, statements, payment slips -- in one list. */
@Component({
  selector: 'app-billing-documents',
  imports: [Icon, Combobox, TableShell, RouterLink, DatePipe],
  templateUrl: './documents.html',
})
export class BillingDocuments implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  readonly workspaces = inject(WorkspacePicker);
  readonly isPlatformAdmin = this.workspaces.isPlatformAdmin;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<DocumentRow[]>([]);
  readonly kind = signal('');
  readonly year = signal(String(new Date().getFullYear()));
  readonly search = signal('');
  readonly kindLabel = DOCUMENT_KIND_LABEL;
  readonly kinds = ['invoice', 'receipt', 'payment_slip', 'credit_note', 'statement'];
  readonly humanSize = formatSize;

  readonly years = computed(() => { const ys = new Set(this.rows().map(r => r.issuedAt.slice(0, 4))); ys.add(String(new Date().getFullYear())); return [...ys].sort().reverse(); });
  readonly counts = computed(() => { const by: Record<string, number> = {}; for (const r of this.rows()) if (r.issuedAt.startsWith(this.year())) by[r.kind] = (by[r.kind] ?? 0) + 1; return by; });
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase(), k = this.kind(), y = this.year();
    return this.rows().filter(r => r.issuedAt.startsWith(y) && (!k || r.kind === k) && (!q || `${r.number ?? ''} ${r.fileName} ${r.invoiceNumber ?? ''} ${r.tenantName ?? ''} ${r.createdByName ?? ''}`.toLowerCase().includes(q)));
  });

  ngOnInit(): void { this.workspaces.ready(() => this.load()); }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.api.documents(this.workspaces.tenantId()).subscribe({
      next: r => { this.loading.set(false); if (r.status !== API_SUCCESS) { this.error.set(r.message); return; } this.rows.set(r.data ?? []); },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the documents.'); },
    });
  }
  pickWorkspace(id: string): void { this.workspaces.tenantId.set(id); this.load(); }
  setKind(k: string): void { this.kind.set(this.kind() === k ? '' : k); }
  money(v: number): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v); }
  open(d: DocumentRow): void { this.api.documentBlob(d.documentId).subscribe({ next: b => BillingApi.open(b), error: () => this.toast.error('Could not open the document.') }); }
  download(d: DocumentRow): void { this.api.documentBlob(d.documentId).subscribe({ next: b => BillingApi.save(b, d.fileName), error: () => this.toast.error('Could not download the document.') }); }
  statement(): void {
    const y = this.year();
    this.api.statement(`${y}-01-01`, `${y}-12-31`, this.workspaces.tenantId()).subscribe({
      next: r => { if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success(r.message); this.load(); },
      error: err => this.toast.error(err?.error?.message || 'The statement could not be prepared.'),
    });
  }
}
