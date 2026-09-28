import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { copyText } from '../../shared/ui/clipboard.util';

/** How many of a rejected sheet's row reasons the card lists before "and N more". */
const ROWS_SHOWN = 20;

/**
 * The server's reasons for a rejected sheet (ResponseDto.data): one string per bad row, holding that
 * row's reasons one per line. Each reason is listed on its own; a "<br>" from an older server counts
 * as a line break rather than being shown as text.
 */
export function rowsOf(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.filter((x): x is string => typeof x === 'string')
    .flatMap(x => x.split(/<br\s*\/?>|\n/i))
    .map(x => x.trim()).filter(Boolean);
}

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
    backTo: '/operations/jobs',
  },
  task: {
    template: '/sourceTask.json/downloadSourceTaskTemplate',
    exportAll: '/sourceTask.json/downloadListSourceTask',
    upload: '/sourceTask.json/uploadSourceTask',
    noun: 'tasks',
    backTo: '/operations/tasks',
  },
};

@Component({
  selector: 'app-bulk-transfer',
  imports: [Icon, RouterLink, FileDropzone],
  templateUrl: './bulk-transfer.html',
})
export class BulkTransfer {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dropzone = viewChild(FileDropzone);

  readonly kind = input.required<Kind>();

  readonly config = computed(() => ROUTES[this.kind()]);
  readonly noun = computed(() => this.config().noun);

  readonly file = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly downloading = signal('');
  readonly result = signal<{ ok: boolean; message: string; rows: string[] } | null>(null);
  /**
   * A rejected sheet names every bad row, and the card showed only "Total 3 source jobs invalid.",
   * so there was no way to know what to fix. The first rows are listed, and all of them can be copied.
   */
  readonly rowsShown = computed(() => this.result()?.rows.slice(0, ROWS_SHOWN) ?? []);
  readonly rowsHidden = computed(() => Math.max(0, (this.result()?.rows.length ?? 0) - ROWS_SHOWN));

  /**
   * A pick or a drop from the shared dropzone, or its Remove (null). The picker's accept filter
   * does not reach a drop, so a file that is not a spreadsheet is refused here and the zone is
   * cleared, rather than left showing a file this screen will not send.
   */
  onFile(file: File | null): void {
    this.result.set(null);
    this.progress.set(0);
    if (file) {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
        this.toast.error('Upload the spreadsheet template — .xlsx or .xls.');
        this.file.set(null);
        this.dropzone()?.file.set(null);
        return;
      }
    }
    this.file.set(file);
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
          // The result card says how it went and stays; a toast saying the same was twice.
          this.result.set({ ok, message: response?.message || (ok ? 'Upload complete.' : 'The upload failed.'),
            rows: ok ? [] : rowsOf(response?.data) });
          if (ok) this.file.set(null);
        }
      },
      error: err => {
        this.uploading.set(false);
        // A 5xx carries the server's catch-all ("Some internal error occurred contact with support."),
        // which tells the uploader nothing they can act on.
        const message = err?.status >= 500
          ? 'The server could not read that file. Check it is the .xlsx import template and try again.'
          : err?.error?.message || 'The file could not be uploaded.';
        this.result.set({ ok: false, message, rows: rowsOf(err?.error?.data) });
      },
    });
  }

  async copyRows(): Promise<void> {
    const rows = this.result()?.rows ?? [];
    if (await copyText(rows.join('\n'))) this.toast.success(`Copied ${rows.length} ${rows.length === 1 ? 'reason' : 'reasons'}.`);
    else this.toast.error('The reasons could not be copied.');
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
      error: async err => {
        this.downloading.set('');
        this.toast.error(await refusalOf(err) || 'The file could not be downloaded.');
      },
    });
  }
}

/**
 * The server's reason for a refused download. The request asks for a blob, so a refusal's body
 * arrives as a Blob too, and `err.error.message` was always undefined: it has to be read and
 * parsed. Anything that is not a JSON envelope with a message (an HTML error page) gives ''.
 */
export async function refusalOf(err: any): Promise<string> {
  const body = err?.error;
  if (!(body instanceof Blob)) return body?.message ?? '';
  try {
    const parsed = JSON.parse(await body.text());
    return typeof parsed?.message === 'string' ? parsed.message : '';
  } catch {
    return '';
  }
}
