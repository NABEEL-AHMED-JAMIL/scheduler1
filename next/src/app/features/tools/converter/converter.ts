import { Component, DestroyRef, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { instantOf } from '../../../core/instant';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { Pagination } from '../../../shared/ui/pagination';
import { PAGE_SIZES } from '../../../shared/ui/pager';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { confirmWith } from '../../../shared/ui/confirm';
import { formatSize } from '../../../shared/ui/format-size';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { StorageService } from '../../objects/storage.service';
import { KeepChoice, KeepDialog, KeepDialogData, monthFolder } from '../keep-dialog';
import { saveBlob } from '../tools-shared';
import { ConverterApi } from './converter.api';
import { ConversionPreview, PreviewAction } from './conversion-preview';
import { FormatsSheet } from './formats-sheet';
import {
  BUSY_RETRY_MS, ConversionRow, ConverterLimits, FormatFamily, HistoryDays, HistoryView, QUEUE_MAX, QUEUE_PARALLEL, QueueItem,
  assistantPrompt, badgeTone, defaultTarget, documentsTakes, doneText, dropHint, extensionOf, familyOf, folderOf, kindLabel,
  notKeptText, problemOf, queueChip, queueProblem, resultText, statusNote, statusOf,
} from './converter.model';

/**
 * The Document Converter (tools redesign, owner-approved 2026-11-02): several files at once, each converted on the server
 * and recorded in Recent conversions for 30 days (failed ones too) unless kept in a bucket; the result beside its original
 * with the converter's checks; and the next step one click away -- Download, Send to Documents, Start a pipeline, Keep in a
 * bucket. A PDF from a dataset or a run is made from Reports › From pipelines (the old ?mode= links land there).
 */
@Component({
  selector: 'app-converter',
  imports: [PageHeader, Icon, RouterLink, Segmented, Pagination, ServerTimePipe, AppLoading, InlineStatus, ConversionPreview,
    CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './converter.html',
  styleUrl: './converter.css',
})
export class Converter implements OnInit {
  private readonly api = inject(ConverterApi);
  private readonly storage = inject(StorageService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  /** The platform administrator's own sign-in converts uploads only (ZT-A12): a bucket is a workspace's data. */
  readonly ownSignIn = isOwnPlatformSignIn(this.auth);
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  /** Send to Documents is offered to whoever may open Documents' intake. */
  readonly canSend = computed(() => !!this.auth?.canOpen?.('document-intelligence'));

  readonly families = signal<FormatFamily[]>([]);
  readonly formatsState = createLoadState();
  readonly limits = signal<ConverterLimits | null>(null);
  readonly limitsState = createLoadState();
  readonly hint = computed(() => dropHint(this.limits()));
  readonly allTargets = computed(() => [...new Set(this.families().flatMap(f => f.outputFormats))].sort());

  // ------------------------------------------------------------------------------------------------------------ queue
  readonly queue = signal<QueueItem[]>([]);
  private nextId = 1;
  private readonly sending = new Map<number, Subscription>();
  readonly convertAllTo = signal('pdf');
  /** Where results are kept: a bucket and folder, or null (30 days in Recent conversions). */
  readonly keep = signal<KeepChoice | null>(null);
  readonly dragging = signal(false);
  readonly chip = computed(() => queueChip(this.queue(), this.limits()));
  readonly waitingCount = computed(() => this.queue().filter(i => i.state === 'waiting' && !i.asked).length);
  readonly finishedCount = computed(() => this.queue().filter(i => i.state === 'done' || i.state === 'failed').length);
  readonly selected = signal<ConversionRow | null>(null);

  // ---------------------------------------------------------------------------------------------------------- history
  readonly viewOptions = computed<SegmentOption<HistoryView>[]>(() => [
    { id: 'everyone', label: 'Everyone' },
    { id: 'mine', label: 'Mine' },
    { id: 'failed', label: this.failedCount() ? `Failed ${this.failedCount()}` : 'Failed' },
  ]);
  readonly dayOptions: SegmentOption<'7' | '30' | '90'>[] = [
    { id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' },
  ];
  readonly view = signal<HistoryView>('everyone');
  readonly days = signal<'7' | '30' | '90'>('30');
  readonly query = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(PAGE_SIZES[0]);
  readonly rows = signal<ConversionRow[]>([]);
  readonly total = signal(0);
  readonly failedCount = signal(0);
  readonly historyState = createLoadState();
  readonly picked = signal<ReadonlySet<number>>(new Set());
  readonly allPicked = computed(() => this.rows().length > 0 && this.rows().every(r => this.picked().has(r.conversionId)));
  private historyLoad: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly size = formatSize;
  readonly badgeTone = badgeTone;
  readonly kindLabel = kindLabel;
  readonly doneText = doneText;
  readonly resultText = resultText;
  readonly statusOf = statusOf;
  readonly folderOf = folderOf;
  readonly documentsTakes = documentsTakes;
  readonly queueMax = QUEUE_MAX;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.sending.forEach(s => s.unsubscribe());
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
        // Files dropped before the formats arrived get their family and target now.
        this.queue.update(list => list.map(i => i.state === 'waiting' && !i.problem ? this.withTarget(i) : i));
      },
      error: err => this.formatsState.fail(err, 'The supported formats could not be read.'),
    });
  }

  loadLimits(): void {
    this.limitsState.start();
    this.api.limits().subscribe({
      next: r => {
        if (r.status === API_SUCCESS && typeof r.data?.maxFileSizeMb === 'number') { this.limits.set(r.data); this.limitsState.done(); }
        else this.limitsState.fail(r, 'The limits could not be read.');
      },
      error: err => this.limitsState.fail(err, 'The limits could not be read.'),
    });
  }

  openFormats(): void {
    this.dialog.open(FormatsSheet, sidePanelConfig({ families: this.families() }, 'narrow', 'right'));
  }

  // ------------------------------------------------------------------------------------------------- adding to queue

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

  /** Files join the queue (at most QUEUE_MAX in it); a type the converter does not read is said at once. */
  add(files: File[]): void {
    const room = QUEUE_MAX - this.queue().length;
    if (files.length > room) this.toast.warn(`The queue holds ${QUEUE_MAX} files; ${files.length - Math.max(0, room)} were left out. Clear finished ones and add them again.`);
    const added = files.slice(0, Math.max(0, room)).map(file => this.item(file.name, file.size, file, null));
    this.queue.update(list => [...list, ...added]);
  }

  fromBucket(): void {
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick a document to convert',
      extensions: this.families().flatMap(f => f.inputFormats),
    })).closed.subscribe(picked => {
      if (!picked) return;
      if (this.queue().length >= QUEUE_MAX) { this.toast.warn(`The queue holds ${QUEUE_MAX} files. Clear finished ones first.`); return; }
      this.queue.update(list => [...list, this.item(picked.name, picked.size ?? null, null, { bucket: picked.bucket, key: picked.key })]);
    });
  }

  private item(name: string, size: number | null, file: File | null, source: { bucket: string; key: string } | null): QueueItem {
    const base: QueueItem = { id: this.nextId++, name, size, extension: extensionOf(name), file, source, target: '', state: 'waiting',
      progress: null, asked: false, busy: false, problem: null, row: null };
    return this.withTarget(base);
  }

  private withTarget(i: QueueItem): QueueItem {
    if (!this.families().length) return i;
    const problem = queueProblem(this.families(), i.name);
    if (problem) return { ...i, state: 'failed', problem };
    return { ...i, target: i.target || defaultTarget(familyOf(this.families(), i.extension), i.extension, this.convertAllTo()) };
  }

  targetsOf(i: QueueItem): string[] {
    return familyOf(this.families(), i.extension)?.outputFormats ?? [];
  }

  setTarget(id: number, target: string): void {
    this.queue.update(list => list.map(i => i.id === id ? { ...i, target } : i));
  }

  /** "Convert all to": every waiting file whose family has it takes it. */
  setConvertAllTo(target: string): void {
    this.convertAllTo.set(target);
    this.queue.update(list => list.map(i => i.state === 'waiting' && !i.asked && this.targetsOf(i).includes(target) ? { ...i, target } : i));
  }

  remove(id: number): void {
    this.sending.get(id)?.unsubscribe();
    this.sending.delete(id);
    this.queue.update(list => list.filter(i => i.id !== id));
  }

  clearFinished(): void {
    this.queue.update(list => list.filter(i => i.state !== 'done' && i.state !== 'failed'));
  }

  chooseKeep(): void {
    const current = this.keep();
    this.dialog.open<KeepChoice | undefined>(KeepDialog, { data: {
      heading: 'Keep results in a bucket', subtitle: 'Each result is saved to this folder and listed with a link to it.',
      confirmLabel: 'Keep them here', folder: current?.folder ?? monthFolder('converted'), bucket: current?.bucket,
    } satisfies KeepDialogData }).closed.subscribe(choice => { if (choice) this.keep.set(choice); });
  }

  // ------------------------------------------------------------------------------------------------------- converting

  convertWaiting(): void {
    this.queue.update(list => list.map(i => i.state === 'waiting' && !i.problem ? { ...i, asked: true } : i));
    this.pump();
  }

  /** Starts asked files while fewer than QUEUE_PARALLEL are on their way. */
  private pump(): void {
    const active = this.queue().filter(i => i.state === 'uploading' || i.state === 'converting').length;
    const next = this.queue().filter(i => i.state === 'waiting' && i.asked && !i.busy).slice(0, Math.max(0, QUEUE_PARALLEL - active));
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
    const keep = this.keep();
    const sub = this.api.convert(file!, now.target, keep ? { bucketName: keep.bucket, targetFolder: keep.folder } : null).subscribe({
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
          this.patch(item.id, { state: row.outcome === 'FAILED' ? 'failed' : 'done', row, progress: null,
            problem: problemOf(row, this.limits()) });
          if (!this.selected() && row.outcome !== 'FAILED') this.selected.set(row);
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
          setTimeout(() => { this.patch(item.id, { busy: false }); this.pump(); }, BUSY_RETRY_MS);
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
    this.loadLimits();
  }

  /** Waiting · next in line / Waiting · 2nd in line / Waiting for Convert. */
  waitingText(i: QueueItem): string {
    if (i.busy) return 'The converter is busy · trying again by itself';
    if (!i.asked) return 'Waiting · press Convert';
    const ahead = this.queue().filter(q => q.state === 'waiting' && q.asked && q.id < i.id).length;
    return ahead === 0 ? 'Waiting · next in line' : `Waiting · ${ahead} ahead`;
  }

  select(row: ConversionRow | null): void {
    this.selected.set(row);
  }

  // ------------------------------------------------------------------------------------------------------------ result

  onPreview(action: PreviewAction): void {
    const row = this.selected();
    if (!row) return;
    if (action === 'download') this.download(row);
    else if (action === 'documents') void this.sendToDocuments(row);
    else if (action === 'pipeline') this.startPipeline(row);
    else this.keepRow(row);
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
      body: `${row.outputFileName || row.name} goes to Documents as an upload: it is read, given a document type and put in the review queue.`,
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
      confirmLabel: 'Keep it', folder: this.keep()?.folder ?? monthFolder('converted'), bucket: this.keep()?.bucket, ...words,
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

  private replaceRow(row: ConversionRow): void {
    if (this.selected()?.conversionId === row.conversionId) this.selected.set(row);
    this.rows.update(list => list.map(r => r.conversionId === row.conversionId ? row : r));
    this.queue.update(list => list.map(i => i.row?.conversionId === row.conversionId ? { ...i, row } : i));
  }

  // ----------------------------------------------------------------------------------------------------------- history

  loadHistory(): void {
    this.historyLoad?.unsubscribe();
    this.historyState.start();
    this.historyLoad = this.api.list(this.view(), Number(this.days()) as HistoryDays, this.query(), this.page(), this.pageSize()).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.historyState.fail(r, 'Recent conversions could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.total.set(r.data.total ?? 0);
        this.failedCount.set(r.data.failedCount ?? 0);
        const ids = new Set(this.rows().map(x => x.conversionId));
        this.picked.update(set => new Set([...set].filter(id => ids.has(id))));
        this.historyState.done();
      },
      error: err => this.historyState.fail(err, 'Recent conversions could not be read.'),
    });
  }

  setView(view: HistoryView): void { this.view.set(view); this.page.set(1); this.loadHistory(); }
  setDays(days: '7' | '30' | '90'): void { this.days.set(days); this.page.set(1); this.loadHistory(); }
  goTo(page: number): void { this.page.set(page); this.loadHistory(); }
  setPageSize(size: number): void { this.pageSize.set(size); this.page.set(1); this.loadHistory(); }

  setQuery(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.loadHistory(); }, 300);
  }

  togglePick(id: number): void {
    this.picked.update(set => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  togglePickAll(): void {
    this.picked.set(this.allPicked() ? new Set() : new Set(this.rows().filter(r => r.outcome !== 'FAILED').map(r => r.conversionId)));
  }

  downloadPicked(): void {
    const ids = [...this.picked()];
    if (!ids.length) return;
    this.api.download(ids).subscribe({
      next: blob => saveBlob(blob, `conversions-${ids.length}.zip`),
      error: () => this.toast.error('The selected files could not be downloaded.'),
    });
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
        this.toast.success(`${row.name} deleted.`);
        this.loadHistory();
      },
      error: err => this.toast.error(err?.error?.message || 'It could not be deleted.'),
    });
  }

  view_(row: ConversionRow): void {
    this.selected.set(row);
    if (typeof document !== 'undefined') document.querySelector('[data-test=conversion-preview]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  byText(row: ConversionRow): string {
    if (row.createdBy != null && row.createdBy === this.me()) return 'You';
    return row.createdByName || '—';
  }

  keptText(row: ConversionRow): string {
    const at = instantOf(row.expiresAt ?? '');
    return notKeptText(row, at ? this.when.transform(at, 'day') : null);
  }

  note(row: ConversionRow): string {
    return statusNote(row, this.limits());
  }
}
