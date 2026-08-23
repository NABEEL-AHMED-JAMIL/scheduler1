import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { RouterLink } from '@angular/router';
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
  readonly tasks = signal<ConverterTask[]>([]);
  readonly tasksLoading = signal(false);

  readonly extension = computed(() => {
    const name = this.file()?.name ?? '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  });

  readonly family = computed(() =>
    this.families().find(f => f.inputFormats.includes(this.extension())) ?? null);

  ngOnInit(): void {
    this.loadTasks();
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

  convert(): void {
    const file = this.file();
    if (!file || !this.outputFormat()) return;

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('outputFormat', this.outputFormat());
    form.append('save', 'false');

    this.converting.set(true);
    this.http.post<ApiResponse<ConvertResult>>(`${API_BASE}/documentConverter.json/convert`, form)
      .subscribe({
        next: response => {
          this.converting.set(false);
          if (response.status === API_SUCCESS && response.data) {
            this.result.set(response.data);
            this.toast.success(`Converted to ${this.outputFormat().toUpperCase()}.`);
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
