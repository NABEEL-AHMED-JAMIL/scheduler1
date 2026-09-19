import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { PdfViewer } from '../objects/preview/pdf-viewer';
import { formatSize } from '../../shared/ui/format-size';
import { BillingApi, DOCUMENT_KIND_LABEL, DocumentRow } from './billing.service';
import { WorkspacePicker } from './workspace-picker';

/**
 * Every billing document -- invoices, receipts, credit notes, statements, payment slips -- as a
 * rail, with the one picked read on the right: the PDF in the console's own viewer, an image
 * as itself. `?document=<id>` lands on one, which is how an invoice's document list gets here.
 */
@Component({
  selector: 'app-billing-documents',
  imports: [Icon, StatTile, RouterLink, DatePipe, PdfViewer, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './documents.html',
})
export class BillingDocuments implements OnInit, OnDestroy {
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  readonly workspaces = inject(WorkspacePicker);
  readonly isPlatformAdmin = this.workspaces.isPlatformAdmin;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<DocumentRow[]>([]);
  readonly kind = signal('');
  readonly year = signal(String(new Date().getFullYear()));
  readonly search = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewLoading = signal(false);
  readonly previewError = signal('');
  readonly kindLabel = DOCUMENT_KIND_LABEL;
  readonly kinds = ['invoice', 'receipt', 'payment_slip', 'credit_note', 'statement'];
  readonly humanSize = formatSize;
  private wanted: number | null = null;

  readonly years = computed(() => { const ys = new Set(this.rows().map(r => r.issuedAt.slice(0, 4))); ys.add(String(new Date().getFullYear())); return [...ys].sort().reverse(); });
  readonly inYear = computed(() => this.rows().filter(r => r.issuedAt.startsWith(this.year())));
  readonly counts = computed(() => { const by: Record<string, number> = {}; for (const r of this.inYear()) by[r.kind] = (by[r.kind] ?? 0) + 1; return by; });
  readonly summary = computed(() => {
    const s = { documents: this.inYear().length, invoices: 0, invoiced: 0, receipts: 0, received: 0, slips: 0 };
    for (const r of this.inYear()) {
      if (r.kind === 'invoice') { s.invoices++; s.invoiced += Number(r.amount ?? 0); }
      if (r.kind === 'receipt') { s.receipts++; s.received += Number(r.amount ?? 0); }
      if (r.kind === 'payment_slip') s.slips++;
    }
    return s;
  });
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase(), k = this.kind();
    return this.inYear().filter(r => (!k || r.kind === k) && (!q || `${r.number ?? ''} ${r.fileName} ${r.invoiceNumber ?? ''} ${r.tenantName ?? ''} ${r.createdByName ?? ''}`.toLowerCase().includes(q)));
  });
  readonly selected = computed(() => this.rows().find(r => r.documentId === this.selectedId()) ?? null);
  readonly hasFilters = computed(() => !!this.search() || !!this.kind());
  readonly previewKind = computed<'pdf' | 'image' | 'other'>(() => {
    const t = this.selected()?.contentType ?? '';
    return t.includes('pdf') ? 'pdf' : t.startsWith('image/') ? 'image' : 'other';
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(q => { const id = Number(q.get('document')); this.wanted = id > 0 ? id : null; if (this.wanted && this.rows().length) this.pick(this.wanted); });
    this.workspaces.ready(() => this.load());
  }
  ngOnDestroy(): void { this.revoke(); }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.api.documents(this.workspaces.tenantId()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.rows.set(r.data ?? []);
        const want = this.wanted && this.rows().find(x => x.documentId === this.wanted) ? this.wanted : null;
        if (want) { this.year.set(this.rows().find(x => x.documentId === want)!.issuedAt.slice(0, 4)); this.pick(want); }
        else if (!this.selectedId() || !this.rows().some(x => x.documentId === this.selectedId())) { const first = this.visible()[0]; if (first) this.pick(first.documentId); else this.selectedId.set(null); }
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the documents.'); },
    });
  }

  pick(documentId: number): void {
    if (this.selectedId() === documentId && this.previewUrl()) return;
    this.selectedId.set(documentId);
    this.revoke(); this.previewLoading.set(true); this.previewError.set('');
    this.api.documentBlob(documentId).subscribe({
      next: b => { this.previewLoading.set(false); if (this.selectedId() !== documentId) return; this.previewUrl.set(URL.createObjectURL(b)); },
      error: () => { this.previewLoading.set(false); this.previewError.set('The document could not be read.'); },
    });
  }
  private revoke(): void { const u = this.previewUrl(); if (u) URL.revokeObjectURL(u); this.previewUrl.set(null); }

  pickWorkspace(id: string): void { this.workspaces.tenantId.set(id); this.selectedId.set(null); this.revoke(); this.load(); }
  setKind(k: string): void { this.kind.set(this.kind() === k ? '' : k); }
  clearFilters(): void { this.search.set(''); this.kind.set(''); }
  money(v: number): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v); }
  glyph(d: DocumentRow): string { const t = d.contentType || ''; return t.includes('pdf') ? 'PDF' : t.startsWith('image/') ? 'IMG' : 'FILE'; }
  open(d: DocumentRow): void { this.api.documentBlob(d.documentId).subscribe({ next: b => BillingApi.open(b), error: () => this.toast.error('Could not open the document.') }); }
  download(d: DocumentRow): void { this.api.documentBlob(d.documentId).subscribe({ next: b => BillingApi.save(b, d.fileName), error: () => this.toast.error('Could not download the document.') }); }
  statement(): void {
    const y = this.year();
    this.api.statement(`${y}-01-01`, `${y}-12-31`, this.workspaces.tenantId()).subscribe({
      next: r => { if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; } this.toast.success(r.message); this.wanted = r.data.documentId; this.load(); },
      error: err => this.toast.error(err?.error?.message || 'The statement could not be prepared.'),
    });
  }
}
