import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';

interface OllamaModel {
  name: string;
  size?: number;
  modifiedAt?: string;
  family?: string;
  /** The endpoint returns these flat. They were read as details.parameterSize, which does
      not exist on the response, so both columns showed a dash for every installed model. */
  parameterSize?: string;
  quantizationLevel?: string;
}

/** One entry in the catalogue below. */
export interface CatalogueModel {
  name: string;
  /** Approximate download size in bytes -- Ollama's own figure varies with quantisation. */
  approxSize: number;
  purpose: string;
  note: string;
}

/**
 * A curated shortlist of openly-licensed models, so the pull box is not a blank field you
 * have to already know the answer to. Ollama publishes no catalogue endpoint this backend
 * proxies, so this is a hand-maintained list rather than a live feed -- sizes are
 * approximate and the real download is whatever the host pulls.
 */
const CATALOGUE: CatalogueModel[] = [
  { name: 'gemma3:1b',          approxSize: 815_000_000,   purpose: 'General',   note: 'Smallest useful general model; fits almost anywhere.' },
  { name: 'llama3.2:1b',        approxSize: 1_300_000_000, purpose: 'General',   note: 'Fast, low memory, good for simple extraction.' },
  { name: 'llama3.2:3b',        approxSize: 2_000_000_000, purpose: 'General',   note: 'A step up while still running on modest hardware.' },
  { name: 'qwen3:4b',           approxSize: 2_600_000_000, purpose: 'General',   note: 'Strong multilingual results for its size.' },
  { name: 'phi4-mini:3.8b',     approxSize: 2_500_000_000, purpose: 'General',   note: 'Microsoft’s small model; good instruction following.' },
  { name: 'gemma3:4b',          approxSize: 3_300_000_000, purpose: 'General',   note: 'Handles images as well as text.' },
  { name: 'mistral:7b',         approxSize: 4_100_000_000, purpose: 'General',   note: 'Long-standing, dependable general model.' },
  { name: 'llama3.1:8b',        approxSize: 4_700_000_000, purpose: 'General',   note: 'The common default when memory allows.' },
  { name: 'qwen3:8b',           approxSize: 5_200_000_000, purpose: 'General',   note: 'Larger Qwen; noticeably better at structured output.' },
  { name: 'deepseek-r1:7b',     approxSize: 4_700_000_000, purpose: 'Reasoning', note: 'Shows its working; slower but better on hard questions.' },
  { name: 'deepseek-r1:14b',    approxSize: 9_000_000_000, purpose: 'Reasoning', note: 'The larger reasoning model; wants real GPU memory.' },
  { name: 'phi4:14b',           approxSize: 9_100_000_000, purpose: 'Reasoning', note: 'Strong at maths and logic for its size.' },
  { name: 'qwen2.5-coder:7b',   approxSize: 4_700_000_000, purpose: 'Code',      note: 'Best of the small coding models.' },
  { name: 'codellama:7b',       approxSize: 3_800_000_000, purpose: 'Code',      note: 'Meta’s code model; wide language coverage.' },
  { name: 'llava:7b',           approxSize: 4_700_000_000, purpose: 'Vision',    note: 'Reads images and answers questions about them.' },
  { name: 'nomic-embed-text',   approxSize: 274_000_000,   purpose: 'Embedding', note: 'Turns text into vectors for search; not a chat model.' },
];

@Component({
  selector: 'app-models',
  imports: [Icon, TableShell],
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
  readonly showCatalogue = signal(false);
  readonly catalogueFilter = signal('');

  readonly catalogue = CATALOGUE;

  /** What is on disk, so the host's storage cost is visible before pulling a 9 GB model. */
  readonly stats = computed(() => {
    const list = this.models();
    const total = list.reduce((sum, m) => sum + (m.size ?? 0), 0);
    const largest = list.reduce<OllamaModel | null>(
      (worst, m) => (!worst || (m.size ?? 0) > (worst.size ?? 0) ? m : worst), null);
    const families = new Set(list.map(m => m.family).filter(Boolean));
    return {
      count: list.length,
      total,
      totalLabel: this.formatSize(total),
      average: list.length ? total / list.length : 0,
      largest,
      families: families.size,
    };
  });

  /** Disk share per model, largest first, for the breakdown bar. */
  readonly diskShare = computed(() => {
    const total = this.stats().total;
    if (!total) return [];
    return [...this.models()]
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .map(m => ({
        name: m.name,
        value: m.size ?? 0,
        display: this.formatSize(m.size),
        percent: Math.round(((m.size ?? 0) / total) * 100),
      }));
  });

  readonly installedNames = computed(() => new Set(this.models().map(m => m.name)));

  readonly catalogueRows = computed(() => {
    const term = this.catalogueFilter().trim().toLowerCase();
    const installed = this.installedNames();
    return this.catalogue
      .map(m => ({ ...m, installed: installed.has(m.name), sizeLabel: this.formatSize(m.approxSize) }))
      .filter(m => !term
        || m.name.toLowerCase().includes(term)
        || m.purpose.toLowerCase().includes(term)
        || m.note.toLowerCase().includes(term));
  });

  /** Pull straight from the catalogue rather than retyping the name. */
  pullNamed(name: string): void {
    this.pullName.set(name);
    this.pull();
  }

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
