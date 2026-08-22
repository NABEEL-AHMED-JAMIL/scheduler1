import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';

interface OllamaModel {
  name: string;
  size?: number;
  modifiedAt?: string;
  details?: { parameterSize?: string; quantizationLevel?: string };
}

@Component({
  selector: 'app-models',
  imports: [TableShell],
  templateUrl: './models.html',
})
export class Models implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly models = signal<OllamaModel[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly pullName = signal('');
  readonly pulling = signal(false);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<OllamaModel[]>>(`${API_BASE}/ollama.json/listModels`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.models.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not reach Ollama.');
      },
    });
  }

  pull(): void {
    const name = this.pullName().trim();
    if (!name) return;
    this.pulling.set(true);
    // Downloads are gigabytes and run server-side; the request returns when Ollama is done,
    // so the button stays disabled rather than pretending it was instant.
    this.http.post<ApiResponse>(`${API_BASE}/ollama.json/pullModel`, null, { params: { name } })
      .subscribe({
        next: response => {
          this.pulling.set(false);
          if (response.status === API_SUCCESS) {
            this.toast.success(`${name} pulled.`);
            this.pullName.set('');
            this.load();
          } else {
            this.toast.error(response.message);
          }
        },
        error: err => {
          this.pulling.set(false);
          this.toast.error(err?.error?.message || 'The pull failed.');
        },
      });
  }

  async remove(model: OllamaModel): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Delete model',
      body: `"${model.name}" will be removed from this host. Any agent using it will stop working until you pull it again.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.http.delete<ApiResponse>(`${API_BASE}/ollama.json/deleteModel`, { params: { name: model.name } })
      .subscribe({
        next: response => {
          if (response.status === API_SUCCESS) {
            this.toast.success(`${model.name} deleted.`);
            this.load();
          } else {
            this.toast.error(response.message);
          }
        },
        error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
      });
  }

  formatSize(bytes?: number): string {
    if (!bytes) return '—';
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
  }
}
