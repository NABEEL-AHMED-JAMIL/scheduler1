import { Component, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, from, mergeMap, of, tap } from 'rxjs';
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
  imports: [Icon, DatePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, FileChat, Donut, RankedBar],
  templateUrl: './objects.html',
})
export class Objects implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);

  readonly buckets = signal<BucketSummary[]>([]);

  /** FTP is a different kind of thing from an object store, and the card should say so. */
  providerIcon(provider: string): string {
    const kind = (provider || '').toUpperCase();
    if (kind === 'FTP' || kind === 'FTPS') return 'server';
    return 'cloud';
  }

  readonly bucket = signal('');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly crumbs = signal<Crumb[]>([]);
  readonly prefix = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly nextToken = signal<string | undefined>(undefined);

  /**
   * Guards removeSelected/newFolder/rename/share against being re-entered while their own
   * confirm/prompt dialog or the request behind it is still in flight -- none of them had a
   * reentrancy guard of their own, so a fast double-click opened two confirm dialogs stacked (a
   * second `removeSelected` while the first was still awaiting its dialog) or, once past the
   * dialog, fired the same mutating request twice concurrently.
   */
  readonly actionBusy = signal(false);

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
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    const ok = await confirmWith(this.dialog, {
      title: entry.folder ? 'Delete folder' : 'Delete file',
      body: entry.folder
        ? `"${entry.name}" and everything inside it will be deleted. This cannot be undone.`
        : `"${entry.name}" will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) { this.actionBusy.set(false); return; }

    const request = entry.folder
      ? this.storage.deleteFolder(this.bucket(), entry.key)
      : this.storage.deleteObject(this.bucket(), entry.key);

    request.subscribe({
      next: response => {
        this.actionBusy.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(`${entry.name} deleted.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.actionBusy.set(false);
        this.toast.error(err?.error?.message || 'Delete failed.');
      },
    });
  }

  async removeSelected(): Promise<void> {
    if (this.actionBusy()) return;
    const keys = [...this.selected()];
    if (!keys.length) return;
    this.actionBusy.set(true);
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${keys.length} file${keys.length === 1 ? '' : 's'}`,
      body: 'The selected files will be deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) { this.actionBusy.set(false); return; }

    this.storage.deleteObjects(this.bucket(), keys).subscribe({
      next: response => {
        this.actionBusy.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(`${keys.length} file${keys.length === 1 ? '' : 's'} deleted.`);
          this.selected.set(new Set());
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.actionBusy.set(false);
        this.toast.error(err?.error?.message || 'Delete failed.');
      },
    });
  }

  /**
   * How many uploads are in the air at once.
   *
   * Sequential would make a 300-file folder feel broken, and unbounded would open 300 sockets at
   * a bucket that then rate-limits and fails most of them. Three keeps the pipe busy and leaves
   * the failure list short enough to be about the files rather than about the flood.
   */
  private static readonly UPLOAD_LANES = 3;

  /** Files still to land, and the ones that did not, for the bar under the toolbar. */
  readonly uploadTotal = signal(0);
  readonly uploadDone = signal(0);
  readonly uploadFailures = signal<string[]>([]);
  readonly uploading = computed(() => this.uploadTotal() > 0 && this.uploadDone() < this.uploadTotal());

  onUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    if (!chosen.length) return;
    void this.confirmAndUpload(chosen);
  }

  /**
   * The app's own confirmation before a folder goes up.
   *
   * The browser shows its own prompt first -- "Upload 135 files to this site?" -- and that one is
   * a security control rendered outside the page: it cannot be suppressed, restyled or replaced,
   * and every site that offers folder upload gets it. What it does NOT say is anything useful:
   * not where the files are going, not how much data that is, not that sub-folders will be
   * recreated. This says those, in the console's own dialog, and is the last point at which
   * somebody who picked the wrong folder can stop.
   *
   * Only for a real folder pick. A single file needs no ceremony, and asking twice for one file
   * is how a confirmation becomes something people dismiss without reading.
   */
  private async confirmAndUpload(chosen: File[]): Promise<void> {
    const worth = chosen.filter(file => file.size > 0);
    if (worth.length > 1) {
      const folders = new Set(worth.map(file => this.relativeDirOf(file)).filter(Boolean));
      const bytes = worth.reduce((total, file) => total + file.size, 0);
      const into = this.prefix() || 'the top of this bucket';
      const ok = await confirmWith(this.dialog, {
        title: `Upload ${this.count(worth.length, 'file')}?`,
        body: `${this.size(bytes)} into ${into}`
          + (folders.size ? `, recreating ${this.count(folders.size, 'sub-folder')}.` : '.')
          + (chosen.length > worth.length
            ? ` ${this.count(chosen.length - worth.length, 'empty file')} will be skipped.` : ''),
        confirmLabel: 'Upload',
      });
      if (!ok) return;
    }
    this.uploadAll(chosen);
  }

  /** Bytes as a person reads them, for a sentence rather than a column. */
  private size(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  }

  /**
   * Uploads a file, or a whole folder, keeping the shape the reader picked.
   *
   * THE RELATIVE PATH IS SENT AS A DEEPER PREFIX, not as part of the file name. The server takes
   * `Paths.get(originalFilename).getFileName()` -- it strips any directory off the name on
   * purpose, as path-traversal defence -- so a name of "sub/a.csv" would land as "a.csv" and a
   * folder would arrive flattened, with same-named files in different sub-folders silently
   * overwriting each other. The prefix IS checked for traversal server-side (isSafeKey refuses
   * "..", ".", a backslash and a leading slash), so composing it this way keeps that defence
   * rather than working around it, and needs no change on the server at all.
   *
   * Empty files are dropped before they are sent: the server answers an empty multipart with
   * "Uploaded file is empty", and a folder of 300 files containing two .DS_Store entries would
   * otherwise report two failures that mean nothing to the person who picked the folder.
   */
  private uploadAll(files: File[]): void {
    const worth = files.filter(file => file.size > 0);
    const skipped = files.length - worth.length;
    if (!worth.length) {
      this.toast.error(skipped
        ? `Nothing to upload — ${this.count(skipped, 'file')} had no content.`
        : 'Nothing to upload.');
      return;
    }

    const bucket = this.bucket();
    const base = this.prefix();
    this.uploadTotal.set(worth.length);
    this.uploadDone.set(0);
    this.uploadFailures.set([]);

    from(worth).pipe(
      mergeMap(file => this.storage.upload(bucket, base + this.relativeDirOf(file), file).pipe(
        tap(response => {
          if (response.status !== API_SUCCESS) {
            this.noteFailure(file, response.message);
          }
        }),
        catchError(err => {
          this.noteFailure(file, err?.error?.message);
          return of(null);
        }),
        tap(() => this.uploadDone.update(done => done + 1)),
      ), Objects.UPLOAD_LANES),
      catchError(() => EMPTY),
    ).subscribe({
      complete: () => {
        const failed = this.uploadFailures().length;
        const landed = worth.length - failed;
        if (!failed) {
          this.toast.success(`${this.count(landed, 'file')} uploaded.`
            + (skipped ? ` ${this.count(skipped, 'empty file')} skipped.` : ''));
        } else {
          // Named, not counted. "3 failed" sends someone to compare two listings by eye.
          this.toast.error(`${this.count(landed, 'file')} uploaded, ${failed} failed: `
            + this.uploadFailures().slice(0, 3).join(', ')
            + (failed > 3 ? ` and ${failed - 3} more.` : '.'));
        }
        // Once, at the end: a listing refresh per file would be one request per upload again.
        this.load();
      },
    });
  }

  /**
   * The sub-folder a picked file came from, ending in "/" so it composes onto the prefix.
   *
   * webkitRelativePath is "folder/sub/a.csv" for a directory pick and "" for a plain file pick,
   * which is exactly the difference between the two cases -- so one method serves both and a
   * single-file upload keeps landing where it always did.
   */
  private relativeDirOf(file: File): string {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const cut = path.lastIndexOf('/');
    return cut <= 0 ? '' : path.slice(0, cut + 1);
  }

  private noteFailure(file: File, message?: string): void {
    const where = this.relativeDirOf(file) + file.name;
    this.uploadFailures.update(list => [...list, message ? `${where} (${message})` : where]);
  }

  private count(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
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

  /** The FileChat instance currently rendered behind `@if (chatFile(); ...)`, if any. */
  private readonly chatRef = viewChild(FileChat);

  /**
   * Rebinding `chatFile` straight to a different entry reuses the same FileChat instance --
   * `@if` only tears it down on a truthy-to-falsy transition -- so its `ngOnInit`, which loads
   * agents and prepares the file, never ran again for the new file. The panel kept file A's
   * messages, agent list and coverage banner visible under file B's header and bucket/key
   * inputs, and any in-flight request from A's session was left running rather than cancelled.
   * Routing every switch through the same close() the × button uses closes A's session (with
   * its own "unsaved conversation" confirm, which the user can decline to stay on A) before B is
   * ever opened, so there is always at most one file's session open.
   *
   * Awaiting close() is not on its own enough to make that teardown happen, and believing it was
   * is what left this reusing the instance regardless. close() only emits `closed`, whose binding
   * sets `chatFile` to null; `@if` is re-read by change detection, and under zoneless that is
   * scheduled rather than run inline. Setting the new entry in the same turn therefore leaves the
   * signal truthy for the whole of the next cycle, the block never sees a falsy value, and B is
   * bound onto A's instance -- now carrying A's agent list and coverage figures, no ngOnInit to
   * replace them, no prepareContext for B on the server, and a persistence effect that close()
   * has already destroyed, so B's transcript is never saved either. Waiting for the render that
   * removes the panel is what turns the close into an actual teardown.
   */
  async openChat(entry: ObjectSummary): Promise<void> {
    const current = this.chatFile();
    if (current?.key === entry.key) return;
    if (current) {
      await this.chatRef()?.close();
      if (this.chatFile()) return; // declined to close -- stay on the current chat
      await this.chatPanelRemoved();
    }
    this.chatFile.set(entry);
  }

  /**
   * Resolves once the render that drops the closed panel has run, so the next write to
   * `chatFile` reaches `@if` as a fresh open rather than a rebind of the panel still on screen.
   */
  private chatPanelRemoved(): Promise<void> {
    return new Promise<void>(resolve =>
      afterNextRender(() => resolve(), { injector: this.injector }));
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
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
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
      if (!name) { this.actionBusy.set(false); return; }
      this.storage.createFolder(this.bucket(), this.prefix(), name).subscribe({
        next: response => {
          this.actionBusy.set(false);
          if (response.status === API_SUCCESS) {
            this.toast.success(`Folder "${name}" created.`);
            this.load();
          } else { this.toast.error(response.message); }
        },
        error: err => {
          this.actionBusy.set(false);
          this.toast.error(err?.error?.message || 'Could not create the folder.');
        },
      });
    });
  }

  rename(entry: ObjectSummary): void {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    this.dialog.open<string>(PromptDialog, {
      hasBackdrop: true,
      data: {
        title: 'Rename folder',
        label: 'New name',
        initial: entry.name,
        confirmLabel: 'Rename',
      },
    }).closed.subscribe(name => {
      if (!name || name === entry.name) { this.actionBusy.set(false); return; }
      this.storage.renameFolder(this.bucket(), entry.key, name).subscribe({
        next: response => {
          this.actionBusy.set(false);
          if (response.status === API_SUCCESS) {
            this.toast.success(`Renamed to "${name}".`);
            this.load();
          } else { this.toast.error(response.message); }
        },
        error: err => {
          this.actionBusy.set(false);
          this.toast.error(err?.error?.message || 'Rename failed.');
        },
      });
    });
  }

  /** Emails one file, or the current selection, as a ZIP. */
  share(entry?: ObjectSummary): void {
    if (this.actionBusy()) return;
    const keys = entry ? [entry.key] : [...this.selected()];
    if (!keys.length) return;
    this.actionBusy.set(true);
    this.dialog.open<ShareResult>(ShareDialog, {
      hasBackdrop: true,
      data: { count: keys.length },
    }).closed.subscribe(result => {
      if (!result) { this.actionBusy.set(false); return; }
      this.http.post<ApiResponse>(`${API_BASE}/fileShare.json/send`, {
        bucket: this.bucket(),
        keys,
        recipientEmail: result.recipientEmail,
        message: result.message,
      }).subscribe({
        next: response => {
          this.actionBusy.set(false);
          response.status === API_SUCCESS
            ? this.toast.success(`Sent to ${result.recipientEmail}.`)
            : this.toast.error(response.message);
        },
        error: err => {
          this.actionBusy.set(false);
          this.toast.error(err?.error?.message || 'The email could not be sent.');
        },
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
