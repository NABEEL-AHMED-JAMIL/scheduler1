import { Component, LOCALE_ID, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Combobox } from '../../../shared/ui/combobox';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BucketSummary, StorageService } from '../../objects/storage.service';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { PreviewDialog } from '../../objects/preview/preview-dialog';
import { Dialog } from '@angular/cdk/dialog';

import { confirmWith } from '../../../shared/ui/confirm';
import { formatSize } from '../../../shared/ui/format-size';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { FileDropzone } from '../../../shared/ui/file-dropzone';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { TableShell } from '../../../shared/ui/data-table';
import { Pagination } from '../../../shared/ui/pagination';
import { createPager } from '../../../shared/ui/pager';
import { RenderPanel } from './render-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Section } from '../../../shared/ui/section';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { DateRange, DateRangePicker, rangeKey, restoreRange, saveRange } from '../../../shared/ui/date-range';
import { localIsoDay } from '../../../shared/ui/local-day';
import { instantOf } from '../../../core/instant';
import { AuthService } from '../../../core/auth/auth.service';
import { ConversionAction, ConversionPanel, ConversionPanelData } from './conversion-panel';

interface FormatFamily {
  key: string;
  label: string;
  inputFormats: string[];
  outputFormats: string[];
}

export interface ConverterTask {
  documentConverterTaskId: number;
  taskName: string;
  inputFileName: string;
  inputFormat: string;
  inputFileSize?: number;
  outputFormat: string;
  outputFileName: string;
  outputFileSize?: number;
  bucketName?: string;
  targetFolder?: string;
  inputStorageKey?: string;
  outputStorageKey?: string;
  status: string;
  dateCreated?: string;
}

/** A file converted (upload, bucket), or rows rendered (MIG-253: dataset, execution). */
export type ConverterMode = 'upload' | 'bucket' | 'dataset' | 'execution';

interface ConvertResult {
  outputFileName: string;
  outputFormat: string;
  outputContentType: string;
  outputBase64: string;
  outputFileSize?: number;
  /** ADR-027: "table" (drawn without LibreOffice) or "libreoffice". */
  engine?: string;
  pageCount?: number | null;
  /** A table converted to PDF: its data rows, the rows printed, and whether rows were left out. */
  rowCount?: number | null;
  rowsShown?: number | null;
  truncated?: boolean | null;
}

/** What the converter takes (documentConverter.json/limits, ADR-027), shown before a file is picked. */
export interface ConverterLimits {
  maxFileSizeMb: number;
  tableMaxFileSizeMb: number;
  xlsxMaxFileSizeMb: number;
  pdfMaxRows: number;
  pdfMaxPages: number;
  maxOutputMb: number;
  timeoutSeconds: number;
  slots: number;
  maxWaiting: number;
  /** Now: conversions converting and waiting (ADR-027's gate); older servers leave them out. */
  running?: number;
  waiting?: number;
}

/** The size limit for one conversion: a CSV/TSV (or XLSX) to PDF is streamed, everything else goes to LibreOffice. */
export function limitMbFor(limits: ConverterLimits | null, extension: string, target: string): number | null {
  if (!limits) return null;
  if (target === 'pdf' && (extension === 'csv' || extension === 'tsv')) return limits.tableMaxFileSizeMb;
  if (target === 'pdf' && extension === 'xlsx') return limits.xlsxMaxFileSizeMb;
  return limits.maxFileSizeMb;
}

/** The limits in one line for the drop zone. */
export function limitsHint(limits: ConverterLimits | null): string {
  if (!limits) return '';
  return `Up to ${limits.maxFileSizeMb} MB; a CSV or TSV to PDF up to ${limits.tableMaxFileSizeMb} MB, an XLSX to PDF up to `
    + `${limits.xlsxMaxFileSizeMb} MB. A table's PDF prints its first ${limits.pdfMaxRows.toLocaleString('en-US')} rows.`;
}

/** Whether a conversion was made inside the range ("yyyy-MM-dd" days, both included; empty ends are open). */
export function createdIn(task: Pick<ConverterTask, 'dateCreated'>, range: Pick<DateRange, 'from' | 'to'>): boolean {
  if (!range.from && !range.to) return true;
  // A row with no readable date is not hidden by a date filter it cannot be judged against.
  const at = instantOf(task.dateCreated ?? '');
  if (!at) return true;
  const day = localIsoDay(at);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

@Component({
  selector: 'app-converter',
  imports: [PageHeader, Icon, RouterLink, ServerTimePipe, Segmented, FileDropzone, Combobox, TableShell, Pagination, RenderPanel,
    Section, DateRangePicker],
  templateUrl: './converter.html',
  styles: `
    /* Owner #26: the limits as one wrapping line of facts at the top of the card, not a column beside it. */
    .limits-strip { display: flex; flex-wrap: wrap; gap: 0.375rem 1.25rem; font-size: 0.8125rem; color: var(--text-secondary);
                    padding: 0.625rem 0.875rem; margin-bottom: 1rem; border-radius: var(--radius-lg); background: var(--surface-inset);
                    border: 1px solid var(--border-subtle); font-variant-numeric: tabular-nums; }
    .limits-strip b { font-weight: 500; color: var(--text-muted); margin-right: 0.25rem; }
    .limits-note { color: var(--text-muted); flex-basis: 100%; }
    .formats-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); margin-bottom: 1rem; }
    .format-family { display: grid; gap: 0.375rem; padding: 0.75rem 0.875rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
    .picked-file { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border: 1px solid var(--border-subtle);
                   border-radius: var(--radius-lg); background: var(--surface-sunken); }
    .picked-empty { border-style: dashed; background: transparent; }
    .conv-row { cursor: pointer; }
    .conv-row:hover > td { background: var(--surface-sunken); }
  `,
})
export class Converter implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly families = signal<FormatFamily[]>([]);
  readonly file = signal<File | null>(null);
  readonly outputFormat = signal('');
  readonly converting = signal(false);
  readonly result = signal<ConvertResult | null>(null);
  /** The supported-formats read failed: said as such, not as "this file can't be converted". */
  readonly formatsError = signal('');
  readonly showFormats = signal(false);
  /** ADR-027: the converter's limits, read once; null until read (the screen works without them). */
  readonly limits = signal<ConverterLimits | null>(null);
  readonly limitsHint = computed(() => limitsHint(this.limits()));
  /** Upload progress of the file being converted (0-100), then null while the server converts. */
  readonly progress = signal<number | null>(null);
  /** Why the last conversion failed, said where the Convert button is (busy, too big, unreadable). */
  readonly convertError = signal('');
  readonly busy = signal(false);
  /** The picked file is over this conversion's limit: said before it is sent. */
  readonly overLimit = computed(() => {
    const file = this.mode() === 'upload' ? this.file() : null;
    const mb = limitMbFor(this.limits(), this.extension(), this.outputFormat());
    if (!file || mb == null) return '';
    return file.size > mb * 1024 * 1024
      ? `This file is ${this.size(file.size)}; a ${this.extension().toUpperCase()} to ${this.outputFormat().toUpperCase()} takes up to ${mb} MB.`
      : '';
  });

  private readonly dialog = inject(Dialog);
  private readonly storage = inject(StorageService);

  /** Upload, or pick something already in a bucket -- the endpoint only takes a multipart
      file, so a bucket choice is fetched and handed over as one. */
  readonly mode = signal<ConverterMode>('upload');
  readonly modeOptions: SegmentOption<ConverterMode>[] = [
    { id: 'upload', label: 'Upload a file', icon: 'upload' },
    { id: 'bucket', label: 'From a bucket', icon: 'folder' },
    // MIG-253: rows rendered through a template (media-service's render), not a file converted.
    // UX final CV1: the same job as Generated reports' "PDF from a dataset" button, in the same words; a run, not an
    // execution (review G12).
    { id: 'dataset', label: 'PDF from a dataset', icon: 'table' },
    { id: 'execution', label: 'PDF from a run', icon: 'play' },
  ];
  /** Converting a file (upload or bucket), as opposed to rendering rows. */
  readonly fileMode = computed(() => this.mode() === 'upload' || this.mode() === 'bucket');
  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly selectedKey = signal('');
  readonly fetchingSource = signal(false);

  /** Where the output goes, when it should go anywhere but the browser's downloads. */
  readonly saveToBucket = signal(false);
  readonly saveBucket = signal('');
  readonly saveFolder = signal('');
  readonly taskName = signal('');

  readonly tasks = signal<ConverterTask[]>([]);
  readonly tasksLoading = signal(false);
  readonly tasksError = signal('');
  readonly taskPager = createPager<ConverterTask>();

  /** Recent conversions narrowed by the shared date range (remembered per viewer) and a search of names. */
  private readonly auth = inject(AuthService, { optional: true });
  readonly rangeStore = rangeKey('converter-tasks', typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null);
  readonly range = signal<DateRange>(restoreRange(this.rangeStore, '30d'));
  readonly taskQuery = signal('');
  readonly shownTasks = computed(() => {
    const q = this.taskQuery().trim().toLowerCase();
    return this.tasks().filter(t => createdIn(t, this.range())
      && (!q || [t.taskName, t.inputFileName, t.outputFileName, t.inputFormat, t.outputFormat, t.bucketName]
        .some(v => (v ?? '').toLowerCase().includes(q))));
  });
  readonly pagedTasks = computed(() => this.taskPager.slice(this.shownTasks()));
  /** The picked bucket file, with its size and date for the card (the picker's answer). */
  readonly picked = signal<PickedObject | null>(null);

  readonly extension = computed(() => {
    const name = this.mode() === 'upload'
      ? (this.file()?.name ?? '')
      : this.sourceName();
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  });

  readonly family = computed(() =>
    this.families().find(f => f.inputFormats.includes(this.extension())) ?? null);

  /** Only files the converter can actually read are worth offering. */
  readonly bucketOptions = computed(() => this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));

  readonly sourceName = computed(() => {
    if (this.mode() === 'upload') return this.file()?.name ?? '';
    const key = this.selectedKey();
    return key ? key.slice(key.lastIndexOf('/') + 1) : '';
  });

  /** Nothing to convert without a source, a target format, and a destination if saving. */
  readonly canConvert = computed(() => {
    if (!this.outputFormat()) return false;
    if (this.saveToBucket() && !this.saveBucket()) return false;
    return this.mode() === 'upload' ? !!this.file() : !!this.selectedKey();
  });

  /**
   * Chooses the source document in the console's one ObjectPicker, offering only the formats
   * the converter reads. It reopens in the folder of the last pick; dismissing it keeps that pick.
   */
  chooseFile(): void {
    const key = this.selectedKey();
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick a document to convert',
      bucket: this.bucket() || undefined,
      selectedKey: key || undefined,
      extensions: this.families().flatMap(f => f.inputFormats),
    })).closed.subscribe(picked => {
      if (!picked) return;
      this.bucket.set(picked.bucket);
      this.selectedKey.set(picked.key);
      this.picked.set(picked);
    });
  }

  /** "77.0 KB · modified 19 Oct 2026, 18:07" for the picked file's card; empty when the picker said neither. */
  readonly pickedMeta = computed(() => {
    const picked = this.picked();
    if (!picked) return '';
    const parts: string[] = [];
    if (picked.size != null) parts.push(formatSize(picked.size));
    const at = picked.lastModified ? this.when.transform(picked.lastModified, 'dateTime') : null;
    if (at) parts.push(`modified ${at}`);
    return parts.join(' · ');
  });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  /** The folder a picked key sits in, for the card. */
  folderOf(key: string): string {
    const cut = key.lastIndexOf('/');
    return cut > 0 ? key.slice(0, cut + 1) : '/';
  }

  applyRange(range: DateRange): void {
    this.range.set(range);
    saveRange(this.rangeStore, range);
    this.taskPager.reset();
  }

  setTaskQuery(value: string): void {
    this.taskQuery.set(value);
    this.taskPager.reset();
  }

  /** Reads the limits again: the queue's "now" numbers change while the page is open. */
  loadLimits(): void {
    this.http.get<ApiResponse<ConverterLimits>>(`${API_BASE}/documentConverter.json/limits`).subscribe({
      next: r => { if (r?.status === API_SUCCESS && typeof r.data?.maxFileSizeMb === 'number') this.limits.set(r.data); },
      error: () => { /* the limits are a hint; the server still checks */ },
    });
  }

  /** A conversion's details, sliding over the right; its actions are done here. */
  openTask(task: ConverterTask): void {
    const data: ConversionPanelData = { task, folder: this.outputFolderOf(task) };
    this.dialog.open<ConversionAction | undefined>(ConversionPanel, sidePanelConfig(data, 'narrow', 'right'))
      .closed.subscribe(action => {
        if (action === 'input' || action === 'output') this.view(task, action);
        else if (action === 'delete') this.removeTask(task);
      });
  }

  /** Pulls the chosen object down so it can be posted as the multipart file. */
  private fetchSource(): Promise<File | null> {
    const bucket = this.bucket(), key = this.selectedKey();
    if (!bucket || !key) return Promise.resolve(null);
    this.fetchingSource.set(true);
    return new Promise(resolve => {
      this.storage.previewBlob(bucket, key).subscribe({
        next: blob => {
          this.fetchingSource.set(false);
          resolve(new File([blob], this.sourceName()));
        },
        error: () => {
          this.fetchingSource.set(false);
          this.toast.error('Could not read that file from the bucket.');
          resolve(null);
        },
      });
    });
  }

  /** Optional: the converter is also built directly in a spec, outside any route. */
  private readonly route = inject(ActivatedRoute, { optional: true });

  ngOnInit(): void {
    // ?mode=dataset opens straight on that source: Generated reports' "PDF from a dataset" links here (UX final CV1).
    const asked = this.route?.snapshot?.queryParamMap?.get('mode');
    if (asked && this.modeOptions.some(o => o.id === asked)) this.mode.set(asked as ConverterMode);
    this.loadTasks();
    this.storage.buckets().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []); },
      error: () => { /* upload mode still works with no bucket list */ },
    });
    this.loadFormats();
    this.loadLimits();
  }

  loadFormats(): void {
    this.formatsError.set('');
    this.http.get<ApiResponse<FormatFamily[]>>(`${API_BASE}/documentConverter.json/supportedFormats`)
      .subscribe({
        next: response => {
          if (response.status === API_SUCCESS) this.families.set(response.data ?? []);
          else this.formatsError.set('Could not load the supported formats.');
        },
        error: () => this.formatsError.set('Could not load the supported formats.'),
      });
  }

  constructor() {
    // A result belongs to the source and target that produced it. Picking another bucket file,
    // another target or the other mode left the old "Ready to download" card offering the old
    // output under the new selection.
    effect(() => {
      this.sourceName(); this.outputFormat(); this.mode();
      untracked(() => { this.result.set(null); this.convertError.set(''); this.busy.set(false); });
    });
    // Picks a target format whenever the source changes, in either mode. Only the upload
    // handler used to do this, so choosing a file from a bucket left the format empty while
    // the select appeared to show one -- Convert stayed disabled with nothing explaining why.
    effect(() => {
      const family = this.family();
      const current = untracked(() => this.outputFormat());
      if (!family) {
        if (current) this.outputFormat.set('');
        return;
      }
      if (current && family.outputFormats.includes(current)) return;
      const own = untracked(() => this.extension());
      this.outputFormat.set(
        family.outputFormats.find(f => f !== own) ?? family.outputFormats[0] ?? '');
    });
  }

  onFile(file: File | null): void {
    this.file.set(file);
    this.result.set(null);
  }

  async convert(): Promise<void> {
    if (!this.outputFormat()) return;
    // A bucket source has to be pulled down first; an upload is already in hand.
    const file = this.mode() === 'upload' ? this.file() : await this.fetchSource();
    if (!file) return;

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('outputFormat', this.outputFormat());
    // Saving writes the result into a bucket so it outlives this tab; otherwise the file
    // only exists as the base64 payload in the response.
    form.append('save', String(this.saveToBucket()));
    if (this.saveToBucket()) {
      form.append('bucketName', this.saveBucket());
      if (this.saveFolder().trim()) form.append('targetFolder', this.saveFolder().trim());
      const name = this.taskName().trim() || file.name.replace(/\.[^.]+$/, '');
      form.append('taskName', name);
    }

    this.converting.set(true);
    this.convertError.set('');
    this.busy.set(false);
    this.progress.set(0);
    this.http.post<ApiResponse<ConvertResult>>(`${API_BASE}/documentConverter.json/convert`, form,
      { reportProgress: true, observe: 'events' })
      .subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress) {
            // Uploaded: the rest is the server converting, shown as such (no percentage to give).
            const done = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            this.progress.set(done >= 100 ? null : done);
            return;
          }
          if (event.type !== HttpEventType.Response) return;
          this.converting.set(false);
          this.progress.set(null);
          const response = event.body;
          if (response?.status === API_SUCCESS && response.data) {
            this.result.set(response.data);
            this.toast.success(this.saveToBucket()
              ? `Converted and saved to ${this.saveBucket()}.`
              : `Converted to ${this.outputFormat().toUpperCase()}.`);
            if (this.saveToBucket()) this.loadTasks();
            this.loadLimits();
          } else {
            this.convertError.set(response?.message || 'The conversion failed.');
          }
        },
        error: err => {
          this.converting.set(false);
          this.progress.set(null);
          // 429: every office process is busy and the queue is full -- nothing went wrong with the file.
          this.busy.set(err?.status === 429);
          if (err?.status === 429) this.loadLimits();
          this.convertError.set(err?.error?.message
            || (err?.status === 429 ? 'The converter is busy. Try again in a minute.'
              : err?.status === 413 ? 'The file is too big for the converter.' : 'The conversion failed.'));
        },
      });
  }

  /** "Showing 5,000 of 1,000,000 rows" for a table converted to PDF; nothing for any other file. */
  rowsNote(done: ConvertResult): string {
    if (done.rowCount == null) return '';
    const total = done.rowCount.toLocaleString('en-US');
    return done.truncated
      ? `First ${(done.rowsShown ?? 0).toLocaleString('en-US')} of ${total} rows printed; the full data is the file you converted.`
      : `${total} rows`;
  }

  download(): void {
    const result = this.result();
    if (!result) return;
    // The API returns the file inline as base64; turn it back into bytes to save it.
    const bytes = Uint8Array.from(atob(result.outputBase64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: result.outputContentType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.outputFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  reset(): void {
    this.file.set(null);
    this.result.set(null);
    this.outputFormat.set('');
    this.selectedKey.set('');
    this.picked.set(null);
    this.taskName.set('');
  }

  /**
   * Every conversion is already recorded server-side with the bucket and key it wrote to.
   * The screen never read that back, so a finished conversion was only retrievable from the
   * one browser tab that produced it -- close the tab and the output was effectively lost.
   */
  loadTasks(): void {
    this.tasksLoading.set(true);
    this.tasksError.set('');
    this.http.get<ApiResponse<ConverterTask[]>>(`${API_BASE}/documentConverter.json/fetchAllTasks`)
      .subscribe({
        next: response => {
          this.tasksLoading.set(false);
          if (response.status !== API_SUCCESS) { this.tasksError.set(response.message || 'Could not read the recent conversions.'); return; }
          this.tasks.set(response.data ?? []);
        },
        error: err => {
          this.tasksLoading.set(false);
          this.tasksError.set(err?.error?.message || 'Could not read the recent conversions.');
        },
      });
  }

  async removeTask(task: ConverterTask): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Delete conversion',
      body: `"${task.taskName}" leaves the list. The converted file stays in the bucket.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/documentConverter.json/deleteTask`,
      { params: { documentConverterTaskId: String(task.documentConverterTaskId) } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${task.taskName} deleted.`);
          this.loadTasks();
        } else { this.toast.error(response.message); }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
    });
  }

  /**
   * Opens either side of a past conversion in the same viewer the object browser uses, so a
   * result can be checked without downloading it or hunting for it in a bucket.
   */
  view(task: ConverterTask, side: 'input' | 'output'): void {
    const key = side === 'input' ? task.inputStorageKey : task.outputStorageKey;
    if (!task.bucketName || !key) {
      this.toast.info(`This conversion did not keep its ${side} file.`);
      return;
    }
    this.dialog.open(PreviewDialog, {
      data: {
        bucket: task.bucketName, key,
        name: side === 'input' ? task.inputFileName : task.outputFileName,
        size: side === 'input' ? task.inputFileSize : task.outputFileSize,
      },
      hasBackdrop: true,
    });
  }

  /** Folder holding the output, so the row can open the object browser at it. */
  outputFolderOf(task: ConverterTask): string {
    const key = task.outputStorageKey ?? '';
    const cut = key.lastIndexOf('/');
    return cut > 0 ? key.slice(0, cut + 1) : (task.targetFolder ?? '');
  }

  size = formatSize;
}
