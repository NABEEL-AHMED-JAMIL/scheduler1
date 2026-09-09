import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { RouterLink } from '@angular/router';
import { BucketSummary, ObjectSummary, StorageService } from '../../objects/storage.service';
import { PreviewDialog } from '../../objects/preview/preview-dialog';
import { Dialog } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { confirmWith } from '../../../shared/ui/confirm';
import { formatSize } from '../../../shared/ui/format-size';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { FileDropzone } from '../../../shared/ui/file-dropzone';

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

interface ConvertResult {
  outputFileName: string;
  outputFormat: string;
  outputContentType: string;
  outputBase64: string;
}

@Component({
  selector: 'app-converter',
  imports: [Icon, RouterLink, DatePipe, Segmented, FileDropzone],
  templateUrl: './converter.html',
})
export class Converter implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly families = signal<FormatFamily[]>([]);
  readonly file = signal<File | null>(null);
  readonly outputFormat = signal('');
  readonly converting = signal(false);
  readonly result = signal<ConvertResult | null>(null);
  readonly showFormats = signal(false);

  private readonly dialog = inject(Dialog);
  private readonly storage = inject(StorageService);

  /** Upload, or pick something already in a bucket -- the endpoint only takes a multipart
      file, so a bucket choice is fetched and handed over as one. */
  readonly mode = signal<'upload' | 'bucket'>('upload');
  readonly modeOptions: SegmentOption<'upload' | 'bucket'>[] = [
    { id: 'upload', label: 'Upload a file', icon: 'upload' },
    { id: 'bucket', label: 'From a bucket', icon: 'folder' },
  ];
  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly loadingObjects = signal(false);
  readonly selectedKey = signal('');
  readonly fetchingSource = signal(false);

  /** Where in the bucket the picker is looking. Empty is the root. This mode used to only ever
      list the root (prefix hard-coded to '') with no way to go any deeper, so any bucket that
      organises its documents into folders -- the common case -- showed "Nothing convertible in
      this bucket" regardless of what it actually held. */
  readonly prefix = signal('');
  /** Set when a level has more entries than one page returned; the token to fetch the rest. */
  readonly nextToken = signal<string | undefined>(undefined);

  /** Folders at this level, so a document nested inside one can be reached. */
  readonly folders = computed(() => this.objects().filter(o => o.folder));

  /**
   * Narrows the folder list by name.
   *
   * A bucket whose folders are one-per-something -- etl-avatar has one per user id, and lists
   * over a hundred at the root -- rendered as a wall of buttons nobody could find anything in.
   * The filter only appears once there are enough folders for scanning to be the slower option.
   */
  readonly folderFilter = signal('');
  readonly filteredFolders = computed(() => {
    const q = this.folderFilter().trim().toLowerCase();
    const all = this.folders();
    return q ? all.filter(f => (f.name ?? '').toLowerCase().includes(q)) : all;
  });
  /** Below this, a filter box is more clutter than help and scanning is faster. */
  readonly folderFilterWorthIt = computed(() => this.folders().length > 12);

  /** Breadcrumb segments for the current prefix, each with the prefix to jump back to. */
  readonly crumbs = computed(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, prefix: parts.slice(0, i + 1).join('/') + '/' }));
  });

  /** Where the output goes, when it should go anywhere but the browser's downloads. */
  readonly saveToBucket = signal(false);
  readonly saveBucket = signal('');
  readonly saveFolder = signal('');
  readonly taskName = signal('');

  readonly tasks = signal<ConverterTask[]>([]);
  readonly tasksLoading = signal(false);

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
  readonly convertibleObjects = computed(() => {
    const known = new Set(this.families().flatMap(f => f.inputFormats));
    return this.objects().filter(o => {
      if (o.folder) return false;
      const dot = o.name.lastIndexOf('.');
      return dot >= 0 && known.has(o.name.slice(dot + 1).toLowerCase());
    });
  });

  readonly sourceName = computed(() => {
    if (this.mode() === 'upload') return this.file()?.name ?? '';
    const key = this.selectedKey();
    return key ? key.slice(key.lastIndexOf('/') + 1) : '';
  });

  /** True when this level holds neither a convertible document nor anywhere further to look. */
  readonly nothingHere = computed(() =>
    !this.loadingObjects() && !this.convertibleObjects().length && !this.folders().length);

  /** Nothing to convert without a source, a target format, and a destination if saving. */
  readonly canConvert = computed(() => {
    if (!this.outputFormat()) return false;
    if (this.saveToBucket() && !this.saveBucket()) return false;
    return this.mode() === 'upload' ? !!this.file() : !!this.selectedKey();
  });

  onBucketChange(value: string): void {
    this.bucket.set(value);
    this.selectedKey.set('');
    this.objects.set([]);
    this.nextToken.set(undefined);
    this.prefix.set('');
    if (!value) return;
    this.browse('');
  }

  /** Descend into a folder. */
  openFolder(key: string): void { this.browse(key); }

  /** Jump to a breadcrumb, or to the bucket root when given nothing. */
  goTo(prefix: string): void { this.browse(prefix); }

  /** Fetches the next page of the level currently open, appending rather than replacing. */
  loadMore(): void { this.browse(this.prefix(), true); }

  /** Bumped per listing; a response whose ticket is stale has been superseded. */
  private browseTicket = 0;

  private browse(prefix: string, append = false): void {
    this.prefix.set(prefix);
    this.selectedKey.set('');
    // A filter typed for one level would otherwise hide everything in the next one; "load more"
    // keeps it, since that is the same level still being read.
    if (!append) this.folderFilter.set('');
    this.loadingObjects.set(true);
    // Only the newest listing may write: clicking through folders quickly would otherwise let
    // a slow response for an abandoned one replace the level actually being viewed.
    const ticket = ++this.browseTicket;
    this.storage.listObjects(this.bucket(), prefix, append ? this.nextToken() : undefined, 200)
      .subscribe({
        next: response => {
          if (ticket !== this.browseTicket) return;
          this.loadingObjects.set(false);
          if (response.status !== API_SUCCESS) return;
          const page = response.data?.objects ?? [];
          this.objects.update(current => (append ? [...current, ...page] : page));
          this.nextToken.set(response.data?.nextContinuationToken);
        },
        error: () => {
          if (ticket !== this.browseTicket) return;
          this.loadingObjects.set(false);
        },
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

  ngOnInit(): void {
    this.loadTasks();
    this.storage.buckets().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []); },
      error: () => { /* upload mode still works with no bucket list */ },
    });
    this.http.get<ApiResponse<FormatFamily[]>>(`${API_BASE}/documentConverter.json/supportedFormats`)
      .subscribe({
        next: response => {
          if (response.status === API_SUCCESS) this.families.set(response.data ?? []);
        },
        error: () => this.toast.error('Could not load the supported formats.'),
      });
  }

  onFile(file: File | null): void {
    this.file.set(file);
    this.result.set(null);
  }

  /**
   * Picks a target format whenever the source changes, in either mode. Only the upload
   * handler used to do this, so choosing a file from a bucket left the format empty while
   * the select appeared to show one -- Convert stayed disabled with nothing explaining why.
   */
  private readonly defaultTarget = effect(() => {
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
    this.http.post<ApiResponse<ConvertResult>>(`${API_BASE}/documentConverter.json/convert`, form)
      .subscribe({
        next: response => {
          this.converting.set(false);
          if (response.status === API_SUCCESS && response.data) {
            this.result.set(response.data);
            this.toast.success(this.saveToBucket()
              ? `Converted and saved to ${this.saveBucket()}.`
              : `Converted to ${this.outputFormat().toUpperCase()}.`);
            if (this.saveToBucket()) this.loadTasks();
          } else {
            this.toast.error(response.message);
          }
        },
        error: err => {
          this.converting.set(false);
          this.toast.error(err?.error?.message || 'The conversion failed.');
        },
      });
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
    this.taskName.set('');
  }

  /**
   * Every conversion is already recorded server-side with the bucket and key it wrote to.
   * The screen never read that back, so a finished conversion was only retrievable from the
   * one browser tab that produced it -- close the tab and the output was effectively lost.
   */
  loadTasks(): void {
    this.tasksLoading.set(true);
    this.http.get<ApiResponse<ConverterTask[]>>(`${API_BASE}/documentConverter.json/fetchAllTasks`)
      .subscribe({
        next: response => {
          this.tasksLoading.set(false);
          if (response.status === API_SUCCESS) this.tasks.set(response.data ?? []);
        },
        error: () => this.tasksLoading.set(false),
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
