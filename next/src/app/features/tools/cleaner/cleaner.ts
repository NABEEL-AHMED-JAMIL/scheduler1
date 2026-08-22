import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';

@Component({
  selector: 'app-cleaner',
  templateUrl: './cleaner.html',
})
export class Cleaner {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly input = signal('');
  readonly output = signal('');
  readonly cleaning = signal(false);

  clean(): void {
    const text = this.input().trim();
    if (!text) return;
    this.cleaning.set(true);
    this.http.post<ApiResponse<string>>(`${API_BASE}/textCleaner.json/clean`, { text }).subscribe({
      next: response => {
        this.cleaning.set(false);
        if (response.status === API_SUCCESS) this.output.set(String(response.data ?? ''));
        else this.toast.error(response.message);
      },
      error: err => {
        this.cleaning.set(false);
        this.toast.error(err?.error?.message || 'The clean-up failed.');
      },
    });
  }

  async copy(): Promise<void> {
    if (await copyText(this.output())) this.toast.success('Cleaned text copied.');
    else this.toast.error('Could not copy the text.');
  }
}
