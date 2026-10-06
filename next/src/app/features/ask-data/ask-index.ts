import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { AskDataApi } from './ask-data.api';
import { AskIndexStatus, IndexFolder } from './ask-data.model';

/**
 * MIG-281: the workspace's search index, as its administrator chooses it on the Ask your data page -- on or off, Document
 * Intelligence's reads, the forms' submissions and files, and the folders whose files are searched -- with what the index
 * holds and how its last sweep went. Shown to a workspace administrator only (the endpoints are TENANT_ADMIN). Each person's
 * question still searches only what they can open.
 */
@Component({
  selector: 'app-ask-index',
  imports: [Icon, ServerTimePipe],
  templateUrl: './ask-index.html',
})
export class AskIndex implements OnInit {
  private readonly api = inject(AskDataApi);
  private readonly toast = inject(ToastService);

  readonly open = signal(false);
  readonly status = signal<AskIndexStatus | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly buckets = signal<{ bucket: string; label?: string | null }[]>([]);

  readonly enabled = signal(false);
  readonly documents = signal(true);
  readonly forms = signal(true);
  readonly folders = signal<IndexFolder[]>([]);

  /** "On: 12 documents, 3 forms, 40 files" -- the closed panel's one line. */
  readonly summary = computed(() => {
    const s = this.status();
    if (!s) return '';
    if (!s.available) return 'Not set up on this platform';
    if (!s.enabled) return 'Off: every question reads your sources live';
    const n = s.indexed;
    return `On: ${n.document} document${n.document === 1 ? '' : 's'}, ${n.form} form record${n.form === 1 ? '' : 's'}, ${n.file} file${n.file === 1 ? '' : 's'}`
      + (n.failed ? `, ${n.failed} failed` : '');
  });

  readonly dirty = computed(() => {
    const s = this.status();
    if (!s) return false;
    return s.enabled !== this.enabled() || s.documents !== this.documents() || s.forms !== this.forms()
      || JSON.stringify(s.folders) !== JSON.stringify(this.folders());
  });

  readonly canSave = computed(() => this.dirty() && !this.saving() && this.folders().every(f => !!f.connection));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadError.set(null);
    this.api.indexStatus().subscribe({
      next: res => {
        if (res.status !== API_SUCCESS || !res.data) {
          this.loadError.set(res.message || 'The search index could not be read.');
          return;
        }
        this.apply(res.data);
      },
      error: (err: unknown) => this.loadError.set(this.errorText(err, 'The search index could not be read.')),
    });
  }

  toggle(): void {
    this.open.update(o => !o);
    if (this.open() && !this.buckets().length) {
      this.api.buckets().subscribe({
        next: res => this.buckets.set(res.status === API_SUCCESS && res.data ? res.data : []),
        error: () => this.buckets.set([]),
      });
    }
  }

  addFolder(): void {
    const first = this.buckets()[0]?.bucket ?? '';
    this.folders.update(fs => [...fs, { connection: first, prefix: '' }]);
  }

  removeFolder(i: number): void {
    this.folders.update(fs => fs.filter((_, at) => at !== i));
  }

  setFolder(i: number, patch: Partial<IndexFolder>): void {
    this.folders.update(fs => fs.map((f, at) => (at === i ? { ...f, ...patch } : f)));
  }

  reset(): void {
    const s = this.status();
    if (s) this.apply(s);
  }

  save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.api.saveIndex({ enabled: this.enabled(), documents: this.documents(), forms: this.forms(), folders: this.folders() }).subscribe({
      next: res => {
        this.saving.set(false);
        if (res.status !== API_SUCCESS || !res.data) {
          this.saveError.set(res.message || 'The search index could not be saved.');
          return;
        }
        this.apply(res.data);
        this.toast.success(res.data.sweeping ? 'Search index saved. Indexing runs in the background.' : 'Search index saved.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.errorText(err, 'The search index could not be saved.'));
      },
    });
  }

  bucketLabel(b: { bucket: string; label?: string | null }): string {
    return b.label && b.label !== b.bucket ? `${b.label} (${b.bucket})` : b.bucket;
  }

  private apply(s: AskIndexStatus): void {
    this.status.set(s);
    this.enabled.set(s.enabled);
    this.documents.set(s.documents);
    this.forms.set(s.forms);
    this.folders.set((s.folders ?? []).map(f => ({ connection: f.connection, prefix: f.prefix ?? '' })));
  }

  private errorText(err: unknown, otherwise: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string } | null;
      if (body && typeof body === 'object' && body.message) return body.message;
    }
    return otherwise;
  }
}
