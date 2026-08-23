import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  imports: [Icon, RouterLink, DatePipe],
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
  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly loadingObjects = signal(false);
  readonly selectedKey = signal('');
  readonly fetchingSource = signal(false);

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
    if (!value) return;
    this.loadingObjects.set(true);
    this.storage.listObjects(value, '').subscribe({
      next: response => {
        this.loadingObjects.set(false);
        if (response.status === API_SUCCESS) this.objects.set(response.data?.objects ?? []);
      },
      error: () => this.loadingObjects.set(false),
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

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0] ?? null;
    this.file.set(chosen);
    this.result.set(null);
    // Default to something other than the input's own format, which is the common intent.
    const family = this.family();
    this.outputFormat.set(
      family?.outputFormats.find(f => f !== this.extension()) ?? family?.outputFormats[0] ?? '');
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

  size(bytes?: number): string {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
  }
}
