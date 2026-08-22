import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';

interface FormatFamily {
  key: string;
  label: string;
  inputFormats: string[];
  outputFormats: string[];
}

interface ConvertResult {
  outputFileName: string;
  outputFormat: string;
  outputContentType: string;
  outputBase64: string;
}

@Component({
  selector: 'app-converter',
  imports: [Icon],
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

  readonly extension = computed(() => {
    const name = this.file()?.name ?? '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  });

  readonly family = computed(() =>
    this.families().find(f => f.inputFormats.includes(this.extension())) ?? null);

  ngOnInit(): void {
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
}
