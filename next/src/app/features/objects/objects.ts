import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { BucketSummary, ObjectSummary, StorageService } from './storage.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { copyText } from '../../shared/ui/clipboard.util';
import { PreviewDialog } from './preview/preview-dialog';
import { FileChat } from './chat/file-chat';

interface Crumb { name: string; prefix: string; }

/** Providers where a request costs a full connect + login, so per-folder work is not free. */
const SLOW_PROVIDERS = ['FTP', 'FTPS'];

@Component({
  selector: 'app-objects',
  imports: [DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, FileChat],
  templateUrl: './objects.html',
})
export class Objects implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly crumbs = signal<Crumb[]>([]);
  readonly prefix = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly nextToken = signal<string | undefined>(undefined);

  readonly provider = computed(() =>
    this.buckets().find(b => b.bucket === this.bucket())?.provider?.toUpperCase() ?? '');

  readonly isSlowProvider = computed(() => SLOW_PROVIDERS.includes(this.provider()));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.objects();
    return this.objects().filter(o => o.name.toLowerCase().includes(term));
  });

  readonly counts = computed(() => {
    const list = this.objects();
    return {
      files: list.filter(o => !o.folder).length,
      folders: list.filter(o => o.folder).length,
      bytes: list.reduce((sum, o) => sum + (o.size ?? 0), 0),
    };
  });

  readonly allSelected = computed(() => {
    const rows = this.filtered().filter(o => !o.folder);
    return rows.length > 0 && rows.every(o => this.selected().has(o.key));
  });

  ngOnInit(): void {
    this.storage.buckets().subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.buckets.set(response.data ?? []);
      },
      error: () => this.toast.error('Could not load storage connections.'),
    });
  }

  onBucketChange(value: string): void {
    this.bucket.set(value);
    this.prefix.set('');
    this.crumbs.set([]);
    this.selected.set(new Set());
    this.search.set('');
    if (value) this.load();
  }

  load(append = false): void {
    if (!this.bucket()) return;
    this.loading.set(true);
    this.error.set('');
    this.storage.listObjects(this.bucket(), this.prefix(), append ? this.nextToken() : undefined)
      .subscribe({
        next: response => {
          this.loading.set(false);
          if (response.status !== API_SUCCESS) {
            this.error.set(response.message);
            return;
          }
          const page = response.data?.objects ?? [];
          this.objects.update(current => (append ? [...current, ...page] : page));
          this.nextToken.set(response.data?.nextContinuationToken);
        },
        error: err => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not list this location.');
        },
      });
  }

  openFolder(entry: ObjectSummary): void {
    this.crumbs.update(list => [...list, { name: entry.name, prefix: entry.key }]);
    this.prefix.set(entry.key);
    this.selected.set(new Set());
    this.load();
  }

  goToCrumb(index: number): void {
    if (index < 0) {
      this.crumbs.set([]);
      this.prefix.set('');
    } else {
      const crumbs = this.crumbs().slice(0, index + 1);
      this.crumbs.set(crumbs);
      this.prefix.set(crumbs[index].prefix);
    }
    this.selected.set(new Set());
    this.load();
  }

  toggleSelect(key: string): void {
    this.selected.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  toggleSelectAll(): void {
    const rows = this.filtered().filter(o => !o.folder).map(o => o.key);
    this.selected.update(set => (rows.every(k => set.has(k)) ? new Set() : new Set(rows)));
  }

  download(entry: ObjectSummary): void {
    window.open(this.storage.downloadUrl(this.bucket(), entry.key), '_blank');
  }

  async copy(value: string, what: string): Promise<void> {
    if (await copyText(value)) {
      this.toast.success(`${what} copied.`);
    } else {
      this.toast.error(`Could not copy the ${what.toLowerCase()}.`);
    }
  }

  async remove(entry: ObjectSummary): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: entry.folder ? 'Delete folder' : 'Delete file',
      body: entry.folder
        ? `"${entry.name}" and everything inside it will be deleted. This cannot be undone.`
        : `"${entry.name}" will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const request = entry.folder
      ? this.storage.deleteFolder(this.bucket(), entry.key)
      : this.storage.deleteObject(this.bucket(), entry.key);

    request.subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${entry.name} deleted.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
    });
  }

  async removeSelected(): Promise<void> {
    const keys = [...this.selected()];
    if (!keys.length) return;
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${keys.length} file${keys.length === 1 ? '' : 's'}`,
      body: 'The selected files will be deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.storage.deleteObjects(this.bucket(), keys).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${keys.length} file${keys.length === 1 ? '' : 's'} deleted.`);
          this.selected.set(new Set());
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
    });
  }

  onUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.storage.upload(this.bucket(), this.prefix(), file).subscribe({
      next: response => {
        input.value = '';
        if (response.status === API_SUCCESS) {
          this.toast.success(`${file.name} uploaded.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        input.value = '';
        this.toast.error(err?.error?.message || 'Upload failed.');
      },
    });
  }

  /** The file the chat panel is bound to; null when the panel is closed. */
  readonly chatFile = signal<ObjectSummary | null>(null);

  preview(entry: ObjectSummary): void {
    this.dialog.open(PreviewDialog, {
      data: { bucket: this.bucket(), key: entry.key, name: entry.name },
      hasBackdrop: true,
    });
  }

  openChat(entry: ObjectSummary): void {
    this.chatFile.set(entry);
  }

  /** Preview the file the chat is about; the two are independent panels. */
  previewChatFile(): void {
    const entry = this.chatFile();
    if (entry) this.preview(entry);
  }

  formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
  }
}
