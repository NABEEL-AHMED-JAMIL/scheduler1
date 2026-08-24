import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { BucketSummary, ObjectSummary, StorageService } from './storage.service';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { copyText } from '../../shared/ui/clipboard.util';
import { PreviewDialog } from './preview/preview-dialog';
import { Donut } from '../../shared/charts/donut';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { FileChat } from './chat/file-chat';
import { PromptDialog } from './dialogs/prompt-dialog';
import { ShareDialog, ShareResult } from './dialogs/share-dialog';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { formatSize } from '../../shared/ui/format-size';

interface Crumb { name: string; prefix: string; }

/** Providers where a request costs a full connect + login, so per-folder work is not free. */
const SLOW_PROVIDERS = ['FTP', 'FTPS'];

@Component({
  selector: 'app-objects',
  imports: [Icon, DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, FileChat, Donut, RankedBar],
  templateUrl: './objects.html',
})
export class Objects implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly http = inject(HttpClient);

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

  readonly dateFrom = signal('');
  readonly dateTo = signal('');

  readonly hasFilters = computed(() => !!(this.search() || this.dateFrom() || this.dateTo()));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const from = this.dateFrom();
    const to = this.dateTo();
    return this.objects().filter(entry => {
      if (term && !entry.name.toLowerCase().includes(term)) return false;
      // Folders carry no modified date, so a date filter would silently hide them all --
      // keep them visible and let the dates narrow files only.
      if ((from || to) && !entry.folder) {
        const day = (entry.lastModified ?? '').slice(0, 10);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    });
  });

  readonly counts = computed(() => {
    const list = this.objects();
    return {
      files: list.filter(o => !o.folder).length,
      folders: list.filter(o => o.folder).length,
      bytes: list.reduce((sum, o) => sum + (o.size ?? 0), 0),
    };
  });

  /** Oldest-first, because the order is the point -- sorting these by size would hide the shape. */
  private static readonly AGE_BUCKETS: { label: string; maxDays: number }[] = [
    { label: 'Last 30 days', maxDays: 30 },
    { label: '1-6 months', maxDays: 182 },
    { label: '6-12 months', maxDays: 365 },
    { label: '1-2 years', maxDays: 730 },
    { label: '2-5 years', maxDays: 1825 },
    { label: '5+ years', maxDays: Infinity },
  ];

  readonly showInsights = signal(false);

  readonly mix = computed(() => {
    const c = this.counts();
    return [
      { name: 'Files', value: c.files },
      { name: 'Folders', value: c.folders },
    ].filter(s => s.value > 0);
  });

  readonly byType = computed(() => {
    const counts = new Map<string, number>();
    this.objects().filter(o => !o.folder).forEach(o => {
      const dot = o.name.lastIndexOf('.');
      const ext = dot > 0 && dot < o.name.length - 1
        ? o.name.slice(dot + 1).toUpperCase()
        : 'no extension';
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  });

  readonly byAge = computed(() => {
    const now = Date.now();
    const buckets = new Map<string, number>();
    this.objects().filter(o => !o.folder).forEach(o => {
      const modified = o.lastModified ? new Date(o.lastModified).getTime() : NaN;
      const days = Number.isNaN(modified) ? Infinity : Math.max(0, (now - modified) / 86_400_000);
      const bucket = Objects.AGE_BUCKETS.find(b => days <= b.maxDays) ?? Objects.AGE_BUCKETS[Objects.AGE_BUCKETS.length - 1];
      buckets.set(bucket.label, (buckets.get(bucket.label) ?? 0) + 1);
    });
    return Objects.AGE_BUCKETS
      .map(b => ({ name: b.label, value: buckets.get(b.label) ?? 0 }))
      .filter(b => b.value > 0);
  });

  readonly bySize = computed(() =>
    this.objects()
      .filter(o => !o.folder && (o.size ?? 0) > 0)
      .map(o => ({ name: o.name, value: o.size!, display: this.humanSize(o.size!), key: o.key })));

  readonly hasInsights = computed(() =>
    this.objects().some(o => !o.folder) || this.counts().folders > 0);

  /** Bound as a value so the template can hand it to the chart without re-binding `this`. */
  readonly humanSizeFn = (bytes: number) => this.humanSize(bytes);

  humanSize = formatSize;

  readonly allSelected = computed(() => {
    const rows = this.filtered().filter(o => !o.folder);
    return rows.length > 0 && rows.every(o => this.selected().has(o.key));
  });

  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    this.storage.buckets().subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.buckets.set(response.data ?? []);
          this.openDeepLink();
        }
      },
      error: () => this.toast.error('Could not load storage connections.'),
    });
  }

  /**
   * ?bucket=&prefix= opens the browser straight at a folder. A job's row links here with the
   * bucket its task writes to, and without this the link landed on an empty browser with
   * nothing selected. Waits for the bucket list so an unknown bucket can be ignored rather
   * than left selected and failing to load.
   */
  private openDeepLink(): void {
    const params = this.route.snapshot.queryParamMap;
    const bucket = params.get('bucket');
    if (!bucket || !this.buckets().some(b => b.bucket === bucket)) return;

    const prefix = params.get('prefix') || '';
    this.bucket.set(bucket);
    this.prefix.set(prefix);
    this.crumbs.set(prefix
      ? prefix.replace(/\/+$/, '').split('/').map((segment, index, segments) => ({
          name: segment,
          prefix: segments.slice(0, index + 1).join('/') + '/',
        }))
      : []);
    this.load();
  }

  onBucketChange(value: string): void {
    this.bucket.set(value);
    this.prefix.set('');
    this.crumbs.set([]);
    this.selected.set(new Set());
    this.search.set('');
    if (value) this.load();
  }

  /** Bumped per listing; a response whose ticket is stale has been superseded. */
  private listTicket = 0;

  load(append = false): void {
    if (!this.bucket()) return;
    // Only the newest listing may write to the screen. Clicking a large folder and then a
    // small one left the slow response landing last and replacing the fast one, so the rows
    // showed the folder we had left while the breadcrumb showed the one we were in -- and
    // every row action, delete included, then pointed somewhere the reader was not looking.
    const ticket = ++this.listTicket;
    this.loading.set(true);
    this.error.set('');
    this.storage.listObjects(this.bucket(), this.prefix(), append ? this.nextToken() : undefined)
      .subscribe({
        next: response => {
          if (ticket !== this.listTicket) return;
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
          if (ticket !== this.listTicket) return;
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
    this.storage.download(this.bucket(), entry.key).subscribe({
      next: blob => StorageService.saveBlob(blob, StorageService.fileNameOf(entry.key)),
      error: err => this.toast.error(err?.error?.message || `Could not download ${entry.name}.`),
    });
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
    this.dialog.open<boolean>(PreviewDialog, {
      data: {
        bucket: this.bucket(), key: entry.key, name: entry.name,
        size: entry.size, lastModified: entry.lastModified,
      },
      hasBackdrop: true,
    // An edit saved from the preview overwrites the object, so the row's size and modified
    // date are stale until the folder is read again.
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  openChat(entry: ObjectSummary): void {
    this.chatFile.set(entry);
  }

  /** Preview the file the chat is about; the two are independent panels. */
  previewChatFile(): void {
    const entry = this.chatFile();
    if (entry) this.preview(entry);
  }

  clearFilters(): void {
    this.search.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  newFolder(): void {
    this.dialog.open<string>(PromptDialog, {
      hasBackdrop: true,
      data: {
        title: 'New folder',
        label: 'Folder name',
        placeholder: 'reports',
        confirmLabel: 'Create',
        hint: 'Created inside the folder you are currently viewing.',
      },
    }).closed.subscribe(name => {
      if (!name) return;
      this.storage.createFolder(this.bucket(), this.prefix(), name).subscribe({
        next: response => {
          if (response.status === API_SUCCESS) {
            this.toast.success(`Folder "${name}" created.`);
            this.load();
          } else { this.toast.error(response.message); }
        },
        error: err => this.toast.error(err?.error?.message || 'Could not create the folder.'),
      });
    });
  }

  rename(entry: ObjectSummary): void {
    this.dialog.open<string>(PromptDialog, {
      hasBackdrop: true,
      data: {
        title: 'Rename folder',
        label: 'New name',
        initial: entry.name,
        confirmLabel: 'Rename',
      },
    }).closed.subscribe(name => {
      if (!name || name === entry.name) return;
      this.storage.renameFolder(this.bucket(), entry.key, name).subscribe({
        next: response => {
          if (response.status === API_SUCCESS) {
            this.toast.success(`Renamed to "${name}".`);
            this.load();
          } else { this.toast.error(response.message); }
        },
        error: err => this.toast.error(err?.error?.message || 'Rename failed.'),
      });
    });
  }

  /** Emails one file, or the current selection, as a ZIP. */
  share(entry?: ObjectSummary): void {
    const keys = entry ? [entry.key] : [...this.selected()];
    if (!keys.length) return;
    this.dialog.open<ShareResult>(ShareDialog, {
      hasBackdrop: true,
      data: { count: keys.length },
    }).closed.subscribe(result => {
      if (!result) return;
      this.http.post<ApiResponse>(`${API_BASE}/fileShare.json/send`, {
        bucket: this.bucket(),
        keys,
        recipientEmail: result.recipientEmail,
        message: result.message,
      }).subscribe({
        next: response => {
          response.status === API_SUCCESS
            ? this.toast.success(`Sent to ${result.recipientEmail}.`)
            : this.toast.error(response.message);
        },
        error: err => this.toast.error(err?.error?.message || 'The email could not be sent.'),
      });
    });
  }

  /** Downloads each selected file individually; folders are skipped rather than zipped. */
  downloadSelected(): void {
    const files = this.filtered().filter(o => !o.folder && this.selected().has(o.key));
    if (!files.length) return;
    this.toast.info(`Downloading ${files.length} file${files.length === 1 ? '' : 's'}.`);
    let failed = 0;
    files.forEach(file => this.storage.download(this.bucket(), file.key).subscribe({
      next: blob => StorageService.saveBlob(blob, StorageService.fileNameOf(file.key)),
      error: () => {
        // One summary rather than a toast per file: a failed batch of twenty should not
        // bury the screen in twenty identical messages.
        if (++failed === 1) this.toast.error('Some files could not be downloaded.');
      },
    }));
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
