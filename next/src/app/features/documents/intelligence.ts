import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { StatStrip, StatStripItem } from '../../shared/ui/stat-strip';
import { Pagination } from '../../shared/ui/pagination';
import { PAGE_SIZES } from '../../shared/ui/pager';
import { DataText } from '../../shared/ui/data-text';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { StorageService } from '../objects/storage.service';
import {
  DatasetRow, DocumentType, Extraction, OcrDocument, RecentRow, TypeStats, lowLine, recentRows, refusalText, totalsOf,
} from './documents.model';
import { DocumentsApi } from './documents.service';
import { ConfidenceBar } from './confidence-bar';
import { ReadDocumentData, ReadDocumentDialog, ReadDocumentResult } from './read-document-dialog';
import { TypePanel, TypePanelData } from './type-panel';

export type IntelligenceTab = 'overview' | 'types' | 'dataset';
const TABS: IntelligenceTab[] = ['overview', 'types', 'dataset'];

/** A type's glyph on its card, from what it is for. */
const TYPE_ICONS: Record<string, string> = {
  invoice: 'file', purchase_order: 'briefcase', contract: 'edit', id_document: 'user', application_form: 'list',
};

/** How the recent documents can be narrowed by state: what the row shows. */
const RECENT_STATES = ['In review', 'Approved', 'Auto-approved', 'Rejected', 'Failed', 'Unclassified', 'Queued', 'Running', 'Read'];

/**
 * Document Intelligence (MIG-272, Documents menu, page key document-intelligence): documents read into structured data
 * against a document type, with a confidence for every value.
 *
 * Overview: the numbers over the last 30 days (/documentExtraction.json/stats), the document types, and the recent
 * documents -- each OCR read with its newest extraction -- with their confidence and state; a row in review opens it,
 * a read not yet extracted can be. Read a document stores a file in one of the workspace's storage connections, reads
 * it and extracts it (read-document-dialog.ts). Types: the types with the editor (type-panel.ts). Dataset: a type's
 * approved documents, one row each, as the service keeps them, and the file (CSV or JSON Lines) to download.
 *
 * Every member holding the page reads, reads documents and extracts; changing a type is a workspace administrator's,
 * and the page offers it to no one else.
 */
@Component({
  selector: 'app-document-intelligence',
  imports: [RouterLink, Icon, TableShell, StatusPill, StatStrip, Pagination, DataText, ServerTimePipe, ConfidenceBar, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './intelligence.html',
  styles: [`
    .type-cards { display: grid; gap: 0.75rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @media (min-width: 640px) { .type-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (min-width: 1280px) { .type-cards { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
    .type-card { text-align: left; display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; }
    .type-card:hover { border-color: var(--border-strong); }
    .type-card-add { border-style: dashed; align-items: center; justify-content: center; color: var(--text-secondary); }
  `],
})
export class DocumentIntelligence implements OnInit {
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly tabs: { id: IntelligenceTab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'types', label: 'Document types' }, { id: 'dataset', label: 'Dataset' },
  ];
  readonly tab = signal<IntelligenceTab>(this.tabOf(this.route.snapshot?.queryParamMap?.get('tab')));
  readonly canManage = computed(() => this.auth.isTenantAdmin());

  // -------------------------------------------------------------------------------------------- overview

  readonly stats = signal<TypeStats[]>([]);
  readonly types = signal<DocumentType[]>([]);
  readonly reads = signal<OcrDocument[]>([]);
  readonly extractions = signal<Extraction[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly typesError = signal('');

  readonly states = RECENT_STATES;
  readonly typeFilter = signal('');
  readonly stateFilter = signal('');
  readonly search = signal('');

  readonly totals = computed(() => totalsOf(this.stats()));
  readonly kpis = computed((): StatStripItem[] => {
    const t = this.totals();
    const pct = (v: number | null) => v == null ? '—' : `${Math.round(v * 100)}%`;
    return [
      { label: 'Documents', value: t.documents, icon: 'file', tone: 'info', foot: 'in the last 30 days' },
      { label: 'Auto-approved', value: pct(t.autoRate), icon: 'checkCircle', tone: t.autoRate ? 'ok' : 'muted', quiet: !t.autoRate,
        foot: `${t.autoApproved} of those decided` },
      { label: 'In review', value: t.inReview, icon: 'eye', tone: t.inReview ? 'warn' : 'muted', quiet: !t.inReview,
        foot: t.inReview ? 'waiting for a reviewer' : 'nothing waiting', link: '/documents/review' },
      { label: 'Field accuracy', value: pct(t.accuracy), icon: 'zap', tone: t.accuracy == null ? 'muted' : 'info', quiet: t.accuracy == null,
        foot: 'values reviewers left as read' },
    ];
  });

  /** Documents per type over the stats' days, for the type cards. */
  private readonly docsByType = computed(() => new Map(this.stats().map(s => [s.documentTypeId, s.documents])));
  readonly activeTypes = computed(() => this.types().filter(t => t.status === 'Active'));
  readonly recent = computed(() => recentRows(this.reads(), this.extractions()));
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.recent().filter(r =>
      (!this.typeFilter() || r.extraction?.documentTypeKey === this.typeFilter())
      && (!this.stateFilter() || r.status === this.stateFilter())
      && (!q || r.name.toLowerCase().includes(q) || (r.ocr?.sourceKey ?? '').toLowerCase().includes(q)));
  });
  readonly hasFilters = computed(() => !!this.typeFilter() || !!this.stateFilter() || !!this.search().trim());

  // -------------------------------------------------------------------------------------------- dataset

  readonly datasetType = signal('');
  readonly dataset = signal<DatasetRow[]>([]);
  readonly datasetTotal = signal(0);
  readonly datasetLoading = signal(false);
  readonly datasetError = signal('');
  readonly datasetPage = signal(1);
  readonly datasetSize = signal(PAGE_SIZES[0]);
  readonly downloading = signal('');
  readonly datasetDefinition = computed(() => this.types().find(t => String(t.documentTypeId) === this.datasetType())?.definition ?? null);
  readonly datasetColumns = computed(() => (this.datasetDefinition()?.fields ?? []).map(f => ({ key: f.key, label: f.label || f.key })));
  readonly datasetTables = computed(() => (this.datasetDefinition()?.tables ?? []).map(t => ({ key: t.key, label: t.label || t.key })));

  private overviewRead = false;
  private datasetRead = false;

  ngOnInit(): void {
    // The stats first: the dataset opens on the type most documents were approved as.
    this.loadStats(() => { this.loadTypes(); this.readTab(this.tab()); });
  }

  private loadStats(then?: () => void): void {
    this.api.stats(30).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.stats.set(r.data ?? []); then?.(); },
      error: () => { this.stats.set([]); then?.(); },
    });
  }

  private tabOf(value: string | null | undefined): IntelligenceTab {
    return (TABS as string[]).includes(value ?? '') ? value as IntelligenceTab : 'overview';
  }

  setTab(tab: IntelligenceTab): void {
    this.tab.set(tab);
    this.readTab(tab);
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private readTab(tab: IntelligenceTab): void {
    if (tab === 'overview' && !this.overviewRead) this.load();
    if (tab === 'dataset' && !this.datasetRead && this.datasetType()) this.loadDataset();
  }

  refresh(): void {
    this.loadTypes();
    if (this.tab() === 'dataset') this.loadDataset();
    else this.load();
  }

  /** The overview's three lists; the stats and the reads are optional to it, the extractions are not. */
  load(): void {
    this.loading.set(true);
    this.error.set('');
    if (this.overviewRead) this.loadStats();
    this.overviewRead = true;
    this.api.reads().subscribe({ next: r => { if (r.status === API_SUCCESS) this.reads.set(r.data ?? []); }, error: () => this.reads.set([]) });
    this.api.extractions().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'Could not load the documents.'); return; }
        this.extractions.set(r.data ?? []);
      },
      error: err => { this.loading.set(false); this.error.set(refusalText(err, 'Could not load the documents.')); },
    });
  }

  loadTypes(): void {
    this.typesError.set('');
    this.api.types().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.typesError.set(r.message); return; }
        const types = r.data ?? [];
        this.types.set(types);
        if (!this.datasetType() && types.length) {
          // The dataset opens on the type with the most documents behind it.
          const busiest = [...this.stats()].sort((a, b) => b.approvedByReviewer + b.autoApproved - a.approvedByReviewer - a.autoApproved)[0];
          this.datasetType.set(String(busiest?.documentTypeId ?? types[0].documentTypeId));
          if (this.tab() === 'dataset') this.loadDataset();
        }
      },
      error: err => this.typesError.set(refusalText(err, 'Could not load the document types.')),
    });
  }

  clearFilters(): void { this.typeFilter.set(''); this.stateFilter.set(''); this.search.set(''); }

  typeIcon(t: DocumentType): string { return TYPE_ICONS[t.typeKey] ?? 'file'; }
  documentsOf(t: DocumentType): number { return this.docsByType().get(t.documentTypeId) ?? 0; }
  low(r: RecentRow): boolean { return !!r.extraction && (r.extraction.minConfidence ?? 0) < lowLine(r.extraction.autoApproveThreshold); }
  thresholdOf(t: DocumentType): string { return t.autoApproveThreshold == null ? 'Never' : `${Math.round(t.autoApproveThreshold * 100)}%`; }

  // -------------------------------------------------------------------------------------------- actions

  readDocument(read: OcrDocument | null = null, documentTypeId: number | null = null): void {
    const data: ReadDocumentData = { types: this.types(), read, documentTypeId };
    this.dialog.open<ReadDocumentResult>(ReadDocumentDialog, { data, hasBackdrop: true }).closed.subscribe(result => {
      if (!result?.changed) return;
      this.load();
      if (result.openExtractionId) this.router.navigate(['/documents/review', result.openExtractionId]);
    });
  }

  openReview(extractionId: number): void { this.router.navigate(['/documents/review', extractionId]); }

  extractAgain(row: RecentRow): void {
    if (row.ocr) this.readDocument(row.ocr, row.extraction?.documentTypeId ?? null);
  }

  openType(t: DocumentType | null): void {
    const data: TypePanelData = { documentTypeId: t?.documentTypeId ?? null, canManage: this.canManage(), types: this.types() };
    this.dialog.open<boolean>(TypePanel, sidePanelConfig(data, 'wide')).closed.subscribe(() => this.loadTypes());
  }

  // -------------------------------------------------------------------------------------------- dataset

  pickDatasetType(id: string): void {
    this.datasetType.set(id);
    this.datasetPage.set(1);
    this.loadDataset();
  }

  loadDataset(): void {
    const id = Number(this.datasetType());
    if (!id) return;
    this.datasetRead = true;
    this.datasetLoading.set(true);
    this.datasetError.set('');
    this.api.dataset(id, this.datasetPage() - 1, this.datasetSize()).subscribe({
      next: r => {
        this.datasetLoading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.datasetError.set(r.message || 'Could not load the dataset.'); return; }
        this.dataset.set(r.data.rows ?? []);
        this.datasetTotal.set(r.data.total ?? 0);
      },
      error: err => { this.datasetLoading.set(false); this.datasetError.set(refusalText(err, 'Could not load the dataset.')); },
    });
  }

  datasetGoTo(page: number): void { this.datasetPage.set(page); this.loadDataset(); }
  datasetSetSize(size: number): void { this.datasetSize.set(size); this.datasetPage.set(1); this.loadDataset(); }

  /** A value as the dataset keeps it: text as it is, anything else as JSON writes it; nothing is a dash. */
  cell(row: DatasetRow, key: string): string {
    const v = row.row?.fields?.[key];
    if (v === null || v === undefined) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  countOf(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? '' : 's'}`; }
  rowsOf(row: DatasetRow, table: string): number { return row.row?.tables?.[table]?.length ?? 0; }
  approvalText(a: string): string { return a === 'reviewer' ? 'By a reviewer' : a === 'auto' ? 'On its own' : a; }

  download(format: 'csv' | 'jsonl'): void {
    const id = Number(this.datasetType());
    if (!id) return;
    this.downloading.set(format);
    this.api.datasetExport(id, format).subscribe({
      next: response => {
        this.downloading.set('');
        const blob = response.body;
        if (!blob) { this.toast.error('The service sent an empty file.'); return; }
        const disposition = response.headers.get('content-disposition') ?? '';
        const served = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition)?.[1];
        const type = this.types().find(t => t.documentTypeId === id);
        StorageService.saveBlob(blob, served ? decodeURIComponent(served) : `${type?.typeKey ?? 'documents'}-dataset.${format}`);
      },
      error: async err => {
        this.downloading.set('');
        let message = '';
        try { message = JSON.parse(await (err?.error as Blob).text())?.message ?? ''; } catch { /* not JSON */ }
        this.toast.error(message || refusalText(err, 'The dataset could not be downloaded.'));
      },
    });
  }
}
