import { Component, computed, inject, input, signal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Location } from '@angular/common';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';

type Kind = 'job' | 'task';

interface Endpoints {
  template: string;
  exportAll: string;
  upload: string;
  noun: string;
  backTo: string;
}

const ROUTES: Record<Kind, Endpoints> = {
  job: {
    template: '/sourceJob.json/downloadSourceJobTemplateFile',
    exportAll: '/sourceJob.json/downloadListSourceJob',
    upload: '/sourceJob.json/uploadSourceJob',
    noun: 'jobs',
    backTo: '/jobs',
  },
  task: {
    template: '/sourceTask.json/downloadSourceTaskTemplate',
    exportAll: '/sourceTask.json/downloadListSourceTask',
    upload: '/sourceTask.json/uploadSourceTask',
    noun: 'tasks',
    backTo: '/tasks',
  },
};

@Component({
  selector: 'app-bulk-transfer',
  imports: [Icon],
  templateUrl: './bulk-transfer.html',
})
export class BulkTransfer {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);

  readonly kind = input.required<Kind>();

  readonly config = computed(() => ROUTES[this.kind()]);
  readonly noun = computed(() => this.config().noun);

  readonly dragging = signal(false);
  readonly file = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly downloading = signal('');
  readonly result = signal<{ ok: boolean; message: string } | null>(null);

  readonly fileSize = computed(() => {
    const f = this.file();
    if (!f) return '';
    return f.size < 1024 ? `${f.size} B`
      : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB`
      : `${(f.size / 1024 / 1024).toFixed(1)} MB`;
  });

  back(): void {
    this.location.back();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) this.accept(dropped);
  }

  onPick(event: Event): void {
    const picked = (event.target as HTMLInputElement).files?.[0];
    if (picked) this.accept(picked);
    (event.target as HTMLInputElement).value = '';
  }

  private accept(file: File): void {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      this.toast.error('Upload the spreadsheet template — .xlsx or .xls.');
      return;
    }
    this.file.set(file);
    this.result.set(null);
  }

  clearFile(): void {
    this.file.set(null);
    this.result.set(null);
    this.progress.set(0);
  }

  upload(): void {
    const file = this.file();
    if (!file) return;
    const body = new FormData();
    body.append('file', file);

    this.uploading.set(true);
    this.progress.set(0);
    this.result.set(null);

    this.http.post<ApiResponse>(`${API_BASE}${this.config().upload}`, body, {
      reportProgress: true, observe: 'events',
    }).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((event.loaded / event.total) * 100));
        } else if (event.type === HttpEventType.Response) {
          this.uploading.set(false);
          const response = event.body as ApiResponse;
          const ok = response?.status === API_SUCCESS;
          this.result.set({ ok, message: response?.message || (ok ? 'Upload complete.' : 'The upload failed.') });
          if (ok) { this.toast.success(response.message); this.file.set(null); }
          else this.toast.error(response?.message || 'The upload failed.');
        }
      },
      error: err => {
        this.uploading.set(false);
        const message = err?.error?.message || 'The file could not be uploaded.';
        this.result.set({ ok: false, message });
        this.toast.error(message);
      },
    });
  }

  download(which: 'template' | 'exportAll'): void {
    const path = which === 'template' ? this.config().template : this.config().exportAll;
    const fallback = which === 'template'
      ? `${this.noun()}-template.xlsx`
      : `${this.noun()}-export.xlsx`;

    this.downloading.set(which);
    this.http.get(`${API_BASE}${path}`, { responseType: 'blob', observe: 'response' }).subscribe({
      next: response => {
        this.downloading.set('');
        const blob = response.body;
        if (!blob) { this.toast.error('The server returned an empty file.'); return; }
        // The filename the server chose is the useful one; fall back only when it withholds it.
        const disposition = response.headers.get('content-disposition') ?? '';
        const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
        const name = match ? decodeURIComponent(match[1].replace(/"$/, '')) : fallback;

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: err => {
        this.downloading.set('');
        this.toast.error(err?.error?.message || 'The file could not be downloaded.');
      },
    });
  }
}
