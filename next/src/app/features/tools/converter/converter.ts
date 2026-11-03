import { Component, DestroyRef, ElementRef, LOCALE_ID, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { instantOf } from '../../../core/instant';
import { TabCounts } from '../../../core/nav/tab-counts';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { confirmWith } from '../../../shared/ui/confirm';
import { formatSize } from '../../../shared/ui/format-size';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { StorageService } from '../../objects/storage.service';
import { KeepChoice, KeepDialog, KeepDialogData, monthFolder } from '../keep-dialog';
import { DAY_OPTIONS, ToolDays, rangeText, saveBlob } from '../tools-shared';
import { FacetGroup, FacetPicks, ToolsFacets, facetOptions, togglePick } from '../tools-facets';
import { ConverterApi } from './converter.api';
import { ConversionPanel, LocalItem, PanelAction } from './conversion-panel';
import { FormatsSheet } from './formats-sheet';
import {
  BUSY_RETRY_MS, BY_WORDS, ConversionFacets, ConversionRow, ConverterLimits, FROM_WORDS, FormatFamily, KEPT_WORDS, QUEUE_MAX,
  QUEUE_PARALLEL, QueueItem, STATUS_WORDS, assistantPrompt, badgeTone, conversionText, defaultTarget, extensionOf, familyOf,
  folderOf, notKeptText, problemOf, queueProblem, resultShort, statusNote, statusOf, stripHint,
} from './converter.model';

const PAGE_SIZE = 25;

/** A row of the table: a file still in the page's queue, or a conversion the server recorded. */
export type TableRow = { kind: 'local'; item: QueueItem } | { kind: 'row'; row: ConversionRow };

/**
 * The Document Converter (tools Option A, owner 2026-11-02; design converter-a.html): the conversion history is the page,
 * as the Report library -- facets with counts (Status, From, Kept, Made by), one search, 7 / 30 / 90 days or all time, and
 * the table. One slim strip above it takes files (dropped anywhere on the page, chosen, or from a bucket): they convert at
 * once, at most two at a time, and show at the top of the table with their progress. A row opens the side panel: the
 * result beside its original page by page, the converter's checks, and Next steps. A PDF from a dataset or a run is made
 * from Reports › From pipelines (the old ?mode= links land there).
 */
@Component({
  selector: 'app-converter',
  imports: [PageHeader, Icon, Segmented, ServerTimePipe, AppLoading, InlineStatus, ToolsFacets, ConversionPanel],
  templateUrl: './converter.html',
  styleUrls: ['../tools-explorer.css', './converter.css'],
})
export class Converter implements OnInit {
  private readonly api = inject(ConverterApi);
  private readonly storage = inject(StorageService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly tabCounts = inject(TabCounts, { optional: true });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  /** The platform administrator's own sign-in converts uploads only (ZT-A12): a bucket is a workspace's data. */
  readonly ownSignIn = isOwnPlatformSignIn(this.auth);
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  /** Send to Documents is offered to whoever may open Documents' intake. */
  readonly canSend = computed(() => !!this.auth?.canOpen?.('document-intelligence'));
  readonly filesInput = viewChild<ElementRef<HTMLInputElement>>('files');

  readonly families = signal<FormatFamily[]>([]);
  readonly formatsState = createLoadState();
  readonly limits = signal<ConverterLimits | null>(null);
  readonly hint = computed(() => stripHint(this.limits()));
  readonly allTargets = computed(() => {
    const all = [...new Set(this.families().flatMap(f => f.outputFormats))].sort();
    return all.length ? all : ['pdf'];
  });

  // ------------------------------------------------------------------------------------------------------------ queue
  readonly queue = signal<QueueItem[]>([]);
  private nextId = 1;
  private readonly sending = new Map<number, Subscription>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** The format files dropped now become (the strip's "to"): PDF unless the reader picks another. */
  readonly convertAllTo = signal('pdf');
  readonly dragging = signal(false);
  readonly inFlight = computed(() => this.queue().filter(i => i.state === 'waiting' || i.state === 'uploading' || i.state === 'converting'));

  // ---------------------------------------------------------------------------------------------------------- history
  readonly dayOptions = DAY_OPTIONS;
  readonly days = signal<ToolDays>('30');
  readonly query = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(PAGE_SIZE);
  readonly picks = signal<FacetPicks>({});
  readonly rows = signal<ConversionRow[]>([]);
  readonly total = signal(0);
  readonly all = signal(0);
  readonly counts = signal<ConversionFacets>({});
  readonly historyState = createLoadState();
  readonly facetsOpen = signal(false);
  private historyLoad: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** The conversion open in the side panel (kept while the list reloads), or a file of the queue. */
  readonly selected = signal<ConversionRow | null>(null);
  readonly selectedLocal = signal<number | null>(null);
  readonly panelOpen = computed(() => !!this.selected() || this.localPanel() !== null);

  readonly groups = computed<FacetGroup[]>(() => {
    const c = this.counts(), p = this.picks();
    const status = { ...(c.status ?? {}), CONVERTING: this.inFlight().length };
    const always = ['DONE', ...(this.inFlight().length ? ['CONVERTING'] : []), 'SHORTENED', 'FAILED'];
    return [
      { key: 'status', title: 'Status', options: facetOptions(status, STATUS_WORDS, p['status'] ?? [], always) },
      { key: 'from', title: 'From', options: facetOptions(c.from, FROM_WORDS, p['from'] ?? []) },
      { key: 'kept', title: 'Kept', options: facetOptions(c.kept, KEPT_WORDS, p['kept'] ?? []) },
      { key: 'by', title: 'Made by', options: facetOptions(c.by, BY_WORDS, p['by'] ?? [], ['me', 'others']) },
    ];
  });

  /** The queue's files on top (unless the facets leave them out), then the server's rows. */
  readonly tableRows = computed<TableRow[]>(() => {
    const p = this.picks(), status = p['status'] ?? [];
    const listed = new Set(this.rows().map(r => r.conversionId));
    const q = this.query().trim().toLowerCase();
    const plain = !(p['from'] ?? []).length && !(p['kept'] ?? []).length && !(p['by'] ?? []).includes('others');
    const local = this.queue().filter(i => {
      if (i.row && listed.has(i.row.conversionId)) return false;
      if (!plain || (q && !i.name.toLowerCase().includes(q))) return false;
      const key = i.row ? i.row.outcome : i.state === 'failed' ? 'FAILED' : 'CONVERTING';
      return !status.length || status.includes(key);
    }).reverse();
    const server = !status.length || status.some(s => s !== 'CONVERTING') ? this.rows() : [];
    return [...local.map(item => ({ kind: 'local' as const, item })), ...server.map(row => ({ kind: 'row' as const, row }))];
  });

  readonly localPanel = computed<LocalItem | null>(() => {
    const id = this.selectedLocal();
    const item = id == null ? null : this.queue().find(i => i.id === id);
    return item ? { name: item.name, pill: this.localPill(item), meta: this.localConversion(item), problem: item.problem } : null;
  });

  readonly footText = computed(() => rangeText(this.page(), this.pageSize(), this.total()));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly filtered = computed(() => !!this.query().trim() || Object.values(this.picks()).some(v => v.length));

  readonly size = formatSize;
  readonly badgeTone = badgeTone;
  readonly conversionText = conversionText;
  readonly resultShort = resultShort;
  readonly statusOf = statusOf;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.sending.forEach(s => s.unsubscribe());
      this.timers.forEach(t => clearTimeout(t));
      this.historyLoad?.unsubscribe();
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  ngOnInit(): void {
    // A PDF from a dataset or a run is Reports › From pipelines' now; links that asked for it here land there.
    const mode = this.route?.snapshot?.queryParamMap?.get('mode');
    if ((mode === 'dataset' || mode === 'execution') && this.router) {
      void this.router.navigate(['/reports/from-pipelines'], { queryParams: { make: mode }, replaceUrl: true });
      return;
    }
    this.loadFormats();
    this.loadLimits();
    this.loadHistory();
  }

  loadFormats(): void {
    this.formatsState.start();
    this.api.formats().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.formatsState.fail(r, 'The supported formats could not be read.'); return; }
        this.families.set(r.data ?? []);
        this.formatsState.done();
        // Files dropped before the formats arrived get their family and target now, and go.
        this.queue.update(list => list.map(i => i.state === 'waiting' && !i.problem && !i.target ? this.withTarget(i) : i));
        this.pump();
      },
      error: err => this.formatsState.fail(err, 'The supported formats could not be read.'),
    });
  }

  loadLimits(): void {
    this.api.limits().subscribe({
      next: r => { if (r.status === API_SUCCESS && typeof r.data?.maxFileSizeMb === 'number') this.limits.set(r.data); },
      error: () => undefined,
    });
  }

  openFormats(): void {
    this.dialog.open(FormatsSheet, sidePanelConfig({ families: this.families() }, 'narrow', 'right'));
  }

  chooseFiles(): void {
    this.filesInput()?.nativeElement.click();
  }

  // ------------------------------------------------------------------------------------------------- adding to queue

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.add([...(event.dataTransfer?.files ?? [])]);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.add([...(input.files ?? [])]);
    input.value = '';
  }

  /** Files join the queue (at most QUEUE_MAX on their way at once) and convert at once; a type it does not read is said. */
  add(files: File[]): void {
    const room = QUEUE_MAX - this.inFlight().length;
    if (files.length > room) this.toast.warn(`Up to ${QUEUE_MAX} files convert at once; ${files.length - Math.max(0, room)} were left out. Add them when these are done.`);
    const added = files.slice(0, Math.max(0, room)).map(file => this.item(file.name, file.size, file, null));
    if (!added.length) return;
    this.queue.update(list => [...list, ...added]);
    this.pump();
  }

  fromBucket(): void {
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick a document to convert',
      extensions: this.families().flatMap(f => f.inputFormats),
    })).closed.subscribe(picked => {
      if (!picked) return;
      if (this.inFlight().length >= QUEUE_MAX) { this.toast.warn(`Up to ${QUEUE_MAX} files convert at once. Add it when these are done.`); return; }
      this.queue.update(list => [...list, this.item(picked.name, picked.size ?? null, null, { bucket: picked.bucket, key: picked.key })]);
      this.pump();
    });
  }

  private item(name: string, size: number | null, file: File | null, source: { bucket: string; key: string } | null): QueueItem {
    const base: QueueItem = { id: this.nextId++, name, size, extension: extensionOf(name), file, source, target: '', state: 'waiting',
      progress: null, asked: true, busy: false, problem: null, row: null, addedAt: new Date() };
    return this.withTarget(base);
  }

  private withTarget(i: QueueItem): QueueItem {
    if (!this.families().length) return i;
    const problem = queueProblem(this.families(), i.name);
    if (problem) return { ...i, state: 'failed', problem };
    return { ...i, target: i.target || defaultTarget(familyOf(this.families(), i.extension), i.extension, this.convertAllTo()) };
  }

  /** The strip's "to": the files waiting take it when their family has it. */
  setConvertAllTo(target: string): void {
    this.convertAllTo.set(target);
    this.queue.update(list => list.map(i => i.state === 'waiting' && (familyOf(this.families(), i.extension)?.outputFormats ?? []).includes(target)
      ? { ...i, target } : i));
  }

  removeLocal(id: number): void {
    this.sending.get(id)?.unsubscribe();
    this.sending.delete(id);
    this.queue.update(list => list.filter(i => i.id !== id));
    if (this.selectedLocal() === id) this.selectedLocal.set(null);
    this.pump();
  }

  // ------------------------------------------------------------------------------------------------------- converting

  /** Kept for the unit specs and the old Convert button's callers: everything waiting is asked to go. */
  convertWaiting(): void {
    this.queue.update(list => list.map(i => i.state === 'waiting' && !i.problem ? { ...i, asked: true } : i));
    this.pump();
  }

  /** Starts asked files while fewer than QUEUE_PARALLEL are on their way (none before the formats are known). */
  private pump(): void {
    if (!this.families().length) return;
    const active = this.queue().filter(i => i.state === 'uploading' || i.state === 'converting').length;
    const next = this.queue().filter(i => i.state === 'waiting' && i.asked && !i.busy && !!i.target).slice(0, Math.max(0, QUEUE_PARALLEL - active));
    next.forEach(i => void this.send(i));
  }

  private patch(id: number, change: Partial<QueueItem>): void {
    this.queue.update(list => list.map(i => i.id === id ? { ...i, ...change } : i));
  }

  private async send(item: QueueItem): Promise<void> {
    // A conversion that answered at once may already have started this one (pump runs again when one ends).
    const now = this.queue().find(i => i.id === item.id);
    if (!now || now.state !== 'waiting' || now.busy || !now.asked) return;
    this.patch(item.id, { state: 'uploading', progress: 0 });
    let file = item.file;
    if (!file && item.source) {
      file = await new Promise<File | null>(resolve => this.storage.previewBlob(item.source!.bucket, item.source!.key).subscribe({
        next: blob => resolve(new File([blob], item.name)),
        error: () => resolve(null),
      }));
      if (!file) {
        this.patch(item.id, { state: 'failed', problem: { title: 'The file could not be read from the bucket.', icon: 'alert',
          text: 'Check that it is still there, then add it again.' } });
        this.pump();
        return;
      }
    }
    if (!this.queue().some(i => i.id === item.id)) return;
    const sub = this.api.convert(file!, now.target, null).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          const done = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
          this.patch(item.id, done >= 100 ? { state: 'converting', progress: null } : { progress: done });
          return;
        }
        if (event.type !== HttpEventType.Response) return;
        this.sending.delete(item.id);
        const r = event.body;
        if (r?.status === API_SUCCESS && r.data) {
          const row = r.data;
          this.patch(item.id, { state: row.outcome === 'FAILED' ? 'failed' : 'done', row, progress: null, problem: problemOf(row, this.limits()) });
          if (this.selectedLocal() === item.id) { this.selectedLocal.set(null); this.selected.set(row); }
        } else {
          this.patch(item.id, { state: 'failed', progress: null, problem: { title: 'The conversion failed.', icon: 'alert',
            text: r?.message || 'Try again; if it keeps failing, ask your administrator.' } });
        }
        this.afterOne();
      },
      error: err => {
        this.sending.delete(item.id);
        if (err?.status === 429) {
          // Busy: nothing is wrong with the file. It waits and is asked again by itself.
          this.patch(item.id, { state: 'waiting', busy: true, progress: null });
          const timer = setTimeout(() => { this.timers.delete(timer); this.patch(item.id, { busy: false }); this.pump(); }, BUSY_RETRY_MS);
          this.timers.add(timer);
          this.loadLimits();
          return;
        }
        this.patch(item.id, { state: 'failed', progress: null, problem: { title: 'The conversion failed.', icon: 'alert',
          text: err?.error?.message || (err?.status === 413 ? 'The file is too big for the converter.' : 'Try again; if it keeps failing, ask your administrator.') } });
        this.afterOne();
      },
    });
    this.sending.set(item.id, sub);
  }

  private afterOne(): void {
    this.pump();
    this.loadHistory();
  }

  /** "Waiting · press Convert" was the old queue's; now: busy, next in line, or n ahead. */
  waitingText(i: QueueItem): string {
    if (i.busy) return 'The converter is busy · trying again by itself';
    const ahead = this.queue().filter(q => q.state === 'waiting' && q.asked && q.id < i.id).length;
    return ahead === 0 ? 'Waiting · next in line' : `Waiting · ${ahead} ahead`;
  }

  /** A queue file's status pill: Waiting, Converter busy, Converting 70%, or its failure. */
  localPill(i: QueueItem): LocalItem['pill'] {
    if (i.row) { const s = statusOf(i.row); return { label: s.label, tone: s.tone }; }
    switch (i.state) {
      case 'uploading': return { label: `Converting ${Math.min(99, i.progress ?? 0)}%`, tone: 'info' };
      case 'converting': return { label: 'Converting', tone: 'info' };
      case 'failed': return { label: i.problem?.title.startsWith('Not a format') || i.problem?.title.startsWith('A recording') ? 'Not supported' : 'Failed', tone: 'crit' };
      default: return i.busy ? { label: 'Converter busy', tone: 'warn' } : { label: 'Waiting', tone: 'neutral' };
    }
  }

  localConversion(i: QueueItem): string {
    if (i.row) return conversionText(i.row);
    return `${(i.extension || '?').toUpperCase()} → ${i.target && i.state !== 'failed' ? i.target.toUpperCase() : '—'}`;
  }

  // ------------------------------------------------------------------------------------------------------- the panel

  select(row: ConversionRow): void {
    this.selectedLocal.set(null);
    this.selected.set(this.selected()?.conversionId === row.conversionId ? null : row);
  }

  selectLocal(i: QueueItem): void {
    if (i.row) { this.select(i.row); return; }
    this.selected.set(null);
    this.selectedLocal.set(this.selectedLocal() === i.id ? null : i.id);
  }

  closePanel(): void {
    this.selected.set(null);
    this.selectedLocal.set(null);
  }

  /** Enter or Space on a focused row opens it, as a click does. */
  openKey(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter' && event.key !== ' ') return false;
    event.preventDefault();
    return true;
  }

  onPanel(action: PanelAction): void {
    const local = this.selectedLocal();
    if (action === 'remove' && local != null) { this.removeLocal(local); return; }
    const row = this.selected();
    if (!row) return;
    if (action === 'download') this.download(row);
    else if (action === 'documents') void this.sendToDocuments(row);
    else if (action === 'pipeline') this.startPipeline(row);
    else if (action === 'keep') this.keepRow(row);
    else if (action === 'delete') void this.removeRow(row);
  }

  download(row: ConversionRow): void {
    this.api.file(row.conversionId, 'output').subscribe({
      next: blob => saveBlob(blob, row.outputFileName || `${row.name}.${row.outputFormat}`),
      error: () => this.toast.error('The converted file could not be downloaded. It may have been removed after 30 days.'),
    });
  }

  async sendToDocuments(row: ConversionRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Send to Documents',
      body: `${row.outputFileName || row.name} goes to Documents as an upload: it is read, given a document type (for example Discharge summary) and put in the review queue.`,
      confirmLabel: 'Send',
    });
    if (!ok) return;
    this.api.sendToDocuments(row.conversionId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be sent to Documents.'); return; }
        const { intake, conversion } = r.data;
        this.replaceRow(conversion);
        if (intake.outcome === 'Refused') this.toast.error(intake.reason || 'Documents refused the file.');
        else this.toast.success(intake.outcome === 'Duplicate'
          ? `Documents already has this file (document ${intake.ocrDocumentId}).`
          : `Sent to Documents as document ${intake.ocrDocumentId}; it appears under Documents in once it is read.`);
      },
      error: err => this.toast.error(err?.error?.message || 'It could not be sent to Documents.'),
    });
  }

  keepRow(row: ConversionRow, then?: (kept: ConversionRow) => void, words?: Partial<KeepDialogData>): void {
    this.dialog.open<KeepChoice | undefined>(KeepDialog, { data: {
      heading: 'Keep in a bucket', subtitle: 'The result is saved to this folder and kept until you remove it there.',
      confirmLabel: 'Keep it', folder: monthFolder('converted'), ...words,
    } satisfies KeepDialogData }).closed.subscribe(choice => {
      if (!choice) return;
      this.api.keep(row.conversionId, choice.bucket, choice.folder).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be kept.'); return; }
          this.replaceRow(r.data);
          this.toast.success(`Kept in ${choice.bucket}/${folderOf(r.data)}`);
          then?.(r.data);
        },
        error: err => this.toast.error(err?.error?.message || 'It could not be kept.'),
      });
    });
  }

  /** A pipeline reads files from a bucket: keep the result first if it is not, then describe it to the AI Assistant. */
  startPipeline(row: ConversionRow): void {
    const go = (kept: ConversionRow) => {
      if (!kept.bucketName || !kept.outputStorageKey) return;
      void this.router?.navigate(['/ai/assistant'], { queryParams: { prompt: assistantPrompt(kept.bucketName, kept.outputStorageKey) } });
    };
    if (row.keptIn === 'bucket') { go(row); return; }
    this.keepRow(row, go, { heading: 'Keep it in a bucket first', confirmLabel: 'Keep and continue',
      subtitle: 'A pipeline reads its files from a bucket. Keep the result there, then describe the pipeline to the AI Assistant.' });
  }

  async removeRow(row: ConversionRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Delete conversion',
      body: row.keptIn === 'bucket'
        ? `"${row.name}" leaves the list. The converted file stays in the bucket.`
        : `"${row.name}" and its converted file are removed now, rather than after 30 days.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    this.api.remove(row.conversionId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'It could not be deleted.'); return; }
        if (this.selected()?.conversionId === row.conversionId) this.selected.set(null);
        this.queue.update(list => list.filter(i => i.row?.conversionId !== row.conversionId));
        this.toast.success(`${row.name} deleted.`);
        this.loadHistory();
      },
      error: err => this.toast.error(err?.error?.message || 'It could not be deleted.'),
    });
  }

  private replaceRow(row: ConversionRow): void {
    if (this.selected()?.conversionId === row.conversionId) this.selected.set(row);
    this.rows.update(list => list.map(r => r.conversionId === row.conversionId ? row : r));
    this.queue.update(list => list.map(i => i.row?.conversionId === row.conversionId ? { ...i, row } : i));
  }

  // ----------------------------------------------------------------------------------------------------------- history

  loadHistory(): void {
    this.historyLoad?.unsubscribe();
    this.historyState.start();
    const p = this.picks();
    this.historyLoad = this.api.list({ days: Number(this.days()), q: this.query(), page: this.page(), size: this.pageSize(),
      status: (p['status'] ?? []).filter(s => s !== 'CONVERTING'), from: p['from'] ?? [], kept: p['kept'] ?? [], by: p['by'] ?? [] }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.historyState.fail(r, 'Recent conversions could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.total.set(r.data.total ?? 0);
        this.all.set(r.data.all ?? r.data.total ?? 0);
        this.counts.set(r.data.facets ?? {});
        this.tabCounts?.set({ '/tools/converter': this.all() });
        // The open conversion follows its fresh copy (Sent to Documents, kept).
        const open = this.selected();
        const fresh = open ? this.rows().find(x => x.conversionId === open.conversionId) : null;
        if (fresh) this.selected.set(fresh);
        this.historyState.done();
      },
      error: err => this.historyState.fail(err, 'Recent conversions could not be read.'),
    });
  }

  setDays(days: ToolDays): void { this.days.set(days); this.page.set(1); this.loadHistory(); }
  goTo(page: number): void { this.page.set(Math.min(this.pages(), Math.max(1, page))); this.loadHistory(); }

  toggleFacet(change: { key: string; value: string }): void {
    this.picks.set(togglePick(this.picks(), change.key, change.value));
    this.page.set(1);
    this.loadHistory();
  }

  clearFilters(): void {
    this.picks.set({});
    this.query.set('');
    this.page.set(1);
    this.loadHistory();
  }

  setQuery(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.loadHistory(); }, 300);
  }

  byText(row: { createdBy?: number | null; createdByName?: string | null }): string {
    if (row.createdBy != null && row.createdBy === this.me()) return 'You';
    return row.createdByName || '—';
  }

  keptText(row: ConversionRow): string {
    const at = instantOf(row.expiresAt ?? '');
    return notKeptText(row, at ? this.when.transform(at, 'day') : null).replace(/^Not kept · until /, 'Kept until ');
  }

  /** The words under a failed or shortened row's pill, as its title: "61.2 MB, limit 50 MB". */
  note(row: ConversionRow): string {
    return statusNote(row, this.limits());
  }
}
