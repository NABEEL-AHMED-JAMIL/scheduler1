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
  CHANNEL_LABELS, DatasetRow, DocumentType, Extraction, IntakeRow, Mailbox, OcrDocument, RecentRow, TypeStats, lowLine, recentRows, refusalText,
  totalsOf,
} from './documents.model';
import { DocumentTriggerRow, DocumentsApi } from './documents.service';
import { ConfidenceBar } from './confidence-bar';
import { ReadDocumentData, ReadDocumentDialog, ReadDocumentResult } from './read-document-dialog';
import { TypePanel, TypePanelData } from './type-panel';
import { UploadDocumentsDialog, UploadDocumentsResult } from './upload-documents-dialog';
import { ManagedBanner } from '../../shared/ui/managed-banner';
import { NeedsWorkspace } from '../../shared/ui/needs-workspace';
import { NgTemplateOutlet } from '@angular/common';
import { StartersDialog, StartersDialogResult } from './starters-dialog';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';

/**
 * The page's views. overview, types and dataset are tabs of Documents (Documents in, Document types, Approved data);
 * upload and email are sections of Documents › Intake (owner 2026-10-20, §0.1), drawn inside the Intake page's frame.
 */
export type IntelligenceTab = 'overview' | 'types' | 'dataset' | 'upload' | 'email';
const TABS: IntelligenceTab[] = ['overview', 'types', 'dataset', 'upload', 'email'];
/** Tab hubs (2026-10-12): each view is a tab of Documents, or a section of its Intake tab, at its own address. */
export const INTELLIGENCE_VIEW_PATHS: Record<IntelligenceTab, string> = {
  overview: '/documents/in', types: '/documents/types', dataset: '/documents/approved-data', upload: '/documents/intake/upload',
  email: '/documents/intake/email-in',
};
/** The views drawn inside Documents › Intake, which has the page's header: they draw none of their own. */
const INTAKE_VIEWS: IntelligenceTab[] = ['upload', 'email'];
/** Older ?tab= names, as links still carry them. */
const TAB_ALIASES: Record<string, IntelligenceTab> = { intake: 'email', 'email-in': 'email', datasets: 'dataset' };

/** Document types a workspace typically reads, named in the empty states (generic examples, no workspace's data). */
export const EXAMPLE_DOCUMENT_TYPES = 'an invoice, a referral letter, a lab result or a contract';

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
  imports: [RefreshButton, PageHeader, RouterLink, Icon, TableShell, StatusPill, StatStrip, Pagination, DataText, ServerTimePipe, ConfidenceBar, CdkMenu, CdkMenuItem, CdkMenuTrigger, ManagedBanner, NeedsWorkspace, NgTemplateOutlet],
  templateUrl: './intelligence.html',
})
export class DocumentIntelligence implements OnInit {
  private readonly api = inject(DocumentsApi);
  readonly exampleTypes = EXAMPLE_DOCUMENT_TYPES;
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly tabs: { id: IntelligenceTab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'types', label: 'Document types' }, { id: 'dataset', label: 'Approved data' },
    { id: 'upload', label: 'Upload' }, { id: 'email', label: 'Email-in' },
  ];
  /**
   * Tab hubs (2026-10-12): the address names the view -- Documents › Documents in, Document types, Approved data, or a
   * section of Intake -- and the hub's strip is the way between them, so the page's own tab strip is not shown. Without a
   * view in the route (a unit test mounting the page alone) the page keeps its own tabs, read from ?tab=.
   */
  readonly hubView = (this.route.snapshot?.data?.['view'] as IntelligenceTab | undefined) ?? null;
  readonly tab = signal<IntelligenceTab>(this.hubView ?? this.tabOf(this.route.snapshot?.queryParamMap?.get('tab')));
  /** A section of Documents › Intake: the Intake page draws the header and the section strip around it. */
  readonly embedded = !!this.hubView && INTAKE_VIEWS.includes(this.hubView);
  readonly heading = computed(() => ({
    overview: 'Documents in', types: 'Document types', dataset: 'Approved data', upload: 'Upload documents', email: 'Email-in',
  })[this.tab()]);
  /** A sign-in with no workspace (a platform administrator's own): every call here would answer "Pick a workspace". */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);
  readonly canManage = computed(() => this.auth.canBuild());
  /** The email-in address is the workspace's: an administrator's to turn on, renew or turn off (MIG-271). */
  readonly canManageMailbox = computed(() => this.auth.isTenantAdmin());

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
        foot: t.inReview ? 'waiting for a reviewer' : 'nothing waiting', link: '/review/documents' },
      { label: 'Field accuracy', value: pct(t.accuracy), icon: 'zap', tone: t.accuracy == null ? 'muted' : 'info', quiet: t.accuracy == null,
        foot: 'values reviewers left as read' },
    ];
  });

  /** Documents per type over the stats' days, for the type cards. */
  private readonly docsByType = computed(() => new Map(this.stats().map(s => [s.documentTypeId, s.documents])));
  /**
   * UX review DI1, moved to Document types' "When approved, starts…" column (owner 2026-10-20, §0.1): the schedules an
   * approved document starts -- Schedules' read, so only for a reader who holds it.
   */
  readonly canSeeSchedules = computed(() => typeof this.auth.canOpen === 'function' && this.auth.canOpen('jobs'));
  readonly triggers = signal<DocumentTriggerRow[] | null>(null);
  /** Each type's schedules its approved documents start (switched-off triggers say so), by type id. */
  readonly startsByType = computed(() => {
    const byType = new Map<number, { jobId: number; name: string; on: boolean; why: string }[]>();
    for (const t of this.triggers() ?? []) {
      const id = Number(t.documentTypeId);
      byType.set(id, [...(byType.get(id) ?? []), { jobId: t.jobId, name: t.jobName || `Schedule #${t.jobId}`, on: t.enabled && t.jobStatus === 'Active',
        why: !t.enabled ? 'trigger off' : t.jobStatus !== 'Active' ? 'schedule not active' : '' }]);
    }
    return byType;
  });
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
    if (this.noWorkspace()) { this.loading.set(false); return; }
    // An old link to a view by ?tab= (Document types) opens that view's own tab.
    const raw = this.route.snapshot?.queryParamMap?.get('tab');
    const asked = raw ? (TAB_ALIASES[raw] ?? raw) : null;
    if (this.hubView && asked && (TABS as string[]).includes(asked) && asked !== this.hubView) {
      void this.router.navigate([INTELLIGENCE_VIEW_PATHS[asked as IntelligenceTab]], { replaceUrl: true });
      return;
    }
    // Each Intake section lists what arrived by its own channel first.
    if (this.tab() === 'upload') this.channelFilter.set('upload');
    if (this.tab() === 'email') this.channelFilter.set('email');
    // An Intake section needs no numbers: the types (for Read a stored file) and what arrived.
    if (this.embedded) { this.loadTypes(); this.readTab(this.tab()); return; }
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
    const v = value ? (TAB_ALIASES[value] ?? value) : '';
    return (TABS as string[]).includes(v) ? v as IntelligenceTab : 'overview';
  }

  setTab(tab: IntelligenceTab): void {
    if (this.hubView) { void this.router.navigateByUrl(INTELLIGENCE_VIEW_PATHS[tab]); return; }
    this.tab.set(tab);
    this.readTab(tab);
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private readTab(tab: IntelligenceTab): void {
    if (tab === 'overview' && !this.overviewRead) this.load();
    if (tab === 'types' && this.triggers() === null) this.loadTriggers();
    if (tab === 'dataset' && !this.datasetRead && this.datasetType()) this.loadDataset();
    if ((tab === 'upload' || tab === 'email') && !this.intakeRead) this.loadIntake();
  }

  refresh(): void {
    this.loadTypes();
    if (this.tab() === 'dataset') this.loadDataset();
    else if (this.tab() === 'upload' || this.tab() === 'email') this.loadIntake();
    else if (this.tab() === 'types') this.loadTriggers();
    else this.load();
  }

  /** The schedules each type's approved documents start, for Document types' "When approved, starts…" column. */
  loadTriggers(): void {
    if (!this.canSeeSchedules()) return;
    this.api.documentTriggers?.()?.subscribe({
      next: r => this.triggers.set(r.status === API_SUCCESS && Array.isArray(r.data) ? r.data : []),
      error: () => this.triggers.set([]),
    });
  }

  startsOf(t: DocumentType): { jobId: number; name: string; on: boolean; why: string }[] {
    return this.startsByType().get(Number(t.documentTypeId)) ?? [];
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

  documentsOf(t: DocumentType): number { return this.docsByType().get(t.documentTypeId) ?? 0; }
  low(r: RecentRow): boolean { return !!r.extraction && (r.extraction.minConfidence ?? 0) < lowLine(r.extraction.autoApproveThreshold); }
  thresholdOf(t: DocumentType): string { return t.autoApproveThreshold == null ? 'Never' : `${Math.round(t.autoApproveThreshold * 100)}%`; }

  // -------------------------------------------------------------------------------------------- actions

  readDocument(read: OcrDocument | null = null, documentTypeId: number | null = null): void {
    const data: ReadDocumentData = { types: this.types(), read, documentTypeId };
    this.dialog.open<ReadDocumentResult>(ReadDocumentDialog, { data, hasBackdrop: true }).closed.subscribe(result => {
      if (!result?.changed) return;
      this.load();
      if (result.openExtractionId) this.router.navigate(['/review/documents', result.openExtractionId]);
    });
  }

  /** Many files at once (MIG-271): one document each, read and extracted on its own. */
  uploadDocuments(): void {
    this.dialog.open<UploadDocumentsResult>(UploadDocumentsDialog, { hasBackdrop: true }).closed.subscribe(result => {
      if (!result?.changed) return;
      this.load();
      if (this.intakeRead) this.loadIntake();
    });
  }

  // -------------------------------------------------------------------------------------------- intake (MIG-271)

  readonly channelLabels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS);
  readonly intakes = signal<IntakeRow[]>([]);
  /**
   * ZT-D4: the document a file was taken as, by its OCR read -- so a duplicate links to the earlier document by the number
   * every screen shows (#1159), not the OCR read's own number ("OCR 1054"), which no screen names.
   */
  readonly takenAs = computed(() => {
    const byRead = new Map<number, number>();
    for (const i of this.intakes()) {
      if (i.ocrDocumentId && i.extractionId && !byRead.has(i.ocrDocumentId)) byRead.set(i.ocrDocumentId, i.extractionId);
    }
    return byRead;
  });
  readonly intakeLoading = signal(false);
  readonly intakeError = signal('');
  readonly channelFilter = signal('');
  readonly mailbox = signal<Mailbox | null>(null);
  readonly mailboxBusy = signal(false);
  private intakeRead = false;

  loadIntake(): void {
    this.intakeRead = true;
    this.intakeLoading.set(true);
    this.intakeError.set('');
    this.api.intakes(this.channelFilter()).subscribe({
      next: r => {
        this.intakeLoading.set(false);
        if (r.status !== API_SUCCESS) { this.intakeError.set(r.message || 'Could not load what arrived.'); return; }
        this.intakes.set(r.data ?? []);
      },
      error: err => { this.intakeLoading.set(false); this.intakeError.set(refusalText(err, 'Could not load what arrived.')); },
    });
    this.api.mailbox().subscribe({ next: r => { if (r.status === API_SUCCESS) this.mailbox.set(r.data ?? null); }, error: () => this.mailbox.set(null) });
  }

  pickChannel(channel: string): void { this.channelFilter.set(channel); this.loadIntake(); }

  /** What "What arrived" says when the channel picked has brought nothing yet. */
  arrivalsEmpty(): string {
    const c = this.channelFilter();
    if (c === 'upload') return 'Nothing uploaded yet. Upload documents, or read a stored file.';
    if (c === 'email') return 'Nothing has been mailed in yet. Turn on the address and mail attachments to it.';
    if (c) return `Nothing has arrived by ${this.channelLabels[c] ?? c} yet.`;
    return 'Nothing has arrived yet: upload documents, mail them to the email-in address, or send a form with a file field set to Document Intelligence.';
  }

  mailboxAction(action: 'enable' | 'rotate' | 'disable'): void {
    this.mailboxBusy.set(true);
    this.api.mailboxAction(action).subscribe({
      next: r => {
        this.mailboxBusy.set(false);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The email-in address could not be changed.'); return; }
        this.mailbox.set(r.data ?? null);
        this.toast.success(r.message);
      },
      error: err => { this.mailboxBusy.set(false); this.toast.error(refusalText(err, 'The email-in address could not be changed.')); },
    });
  }

  copyAddress(address: string): void {
    navigator.clipboard?.writeText(address).then(() => this.toast.success('Address copied.'), () => this.toast.error('Could not copy the address.'));
  }

  openReview(extractionId: number): void { this.router.navigate(['/review/documents', extractionId]); }

  extractAgain(row: RecentRow): void {
    if (row.ocr) this.readDocument(row.ocr, row.extraction?.documentTypeId ?? null);
  }

  /** Add from starters (owner 2026-10-20, §0.2): the catalog's types by market, added as the workspace's own. */
  addStarters(): void {
    this.dialog.open<StartersDialogResult>(StartersDialog, { hasBackdrop: true }).closed.subscribe(result => {
      if (result?.changed) this.loadTypes();
    });
  }

  openType(t: DocumentType | null): void {
    const data: TypePanelData = { documentTypeId: t?.documentTypeId ?? null, canManage: this.canManage(), types: this.types() };
    this.dialog.open<boolean>(TypePanel, sidePanelConfig(data, 'wide', 'right')).closed.subscribe(() => this.loadTypes());
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
