import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, expand, forkJoin, map, of, reduce, switchMap } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { ToastService } from '../../../shared/ui/toast.service';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { TableShell } from '../../../shared/ui/data-table';
import { Pagination } from '../../../shared/ui/pagination';
import { createPager } from '../../../shared/ui/pager';
import { formatSize } from '../../../shared/ui/format-size';
import { BucketSummary, ObjectSummary, StorageService } from '../../objects/storage.service';
import { PreviewDialog } from '../../objects/preview/preview-dialog';
import { ShareDialog, ShareResult } from '../../objects/dialogs/share-dialog';
import { FAN_OUT, GeneratedService, RecentOutputs } from './generated.service';
import { GeneratedReport, mergeReports, reportsFromObjects } from './generated.model';
import { ReportPreviewDialog } from './report-preview-dialog';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';

/** Subfolders of the reports folder listed too (one level), at most this many. */
export const SUBFOLDER_CAP = 10;
/** Files read per folder, following the listing's pages of 100 (scale review P2 #33: it stopped at the first 100). */
export const FOLDER_FILE_CAP = 1000;
const DATASET_FORMATS = ['csv', 'json', 'jsonl'] as const;
/** Find reads the schedules beyond the recent ones that it names after this pause, and from this many characters. */
export const FIND_DELAY_MS = 400;
export const FIND_MIN_CHARS = 3;
/** A run's kept file that is a report (render_pdf, MIG-255), not rows. */
const isPdf = (r: GeneratedReport) => r.type.toLowerCase() === 'pdf';

/**
 * MIG-253: Documents › Reports -- the documents and files made from your data.
 *
 * There is no table of generated files (a backend gap: a generated-outputs endpoint). The list is
 * built from what exists: the files in one bucket folder (renders are saved to `reports/` unless
 * named otherwise), one level of its subfolders, and the outputs of recent runs, read through a
 * capped fan-out. It says how far it looked, so a file it did not reach is not taken for missing.
 * Find also reaches past that fan-out: a query reads the outputs of the other schedules whose name or
 * pipeline it names (2026-10-20: the eleventh most recently run schedule's outputs could not be found).
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-generated-reports',
  imports: [PageHeader, RefreshButton, SortHeader, InlineStatus, CdkMenu, CdkMenuItem, CdkMenuTrigger, Icon, Combobox, RouterLink, ServerTimePipe, TableShell, Pagination],
  templateUrl: './generated-reports.html',
})
export class GeneratedReports implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly service = inject(GeneratedService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly folder = signal('reports/');
  /**
   * Owner 2026-10-27: the bucket list is read before anything else, so it counts as the list loading -- the table
   * showed "Nothing generated yet" while the buckets were still on the way. Both reads start as loading for the same
   * reason; every path clears them.
   */
  readonly bucketsState = createLoadState();
  readonly loadingRuns = signal(true);
  readonly loadingObjects = signal(true);
  readonly loading = computed(() => this.bucketsState.loading() || this.loadingRuns() || this.loadingObjects());
  readonly objectsError = signal('');
  readonly runsError = signal('');
  readonly objects = signal<GeneratedReport[]>([]);
  readonly runs = signal<RecentOutputs | null>(null);
  readonly subfoldersRead = signal(0);
  /** A folder held more than FOLDER_FILE_CAP files, so the list stops short there. */
  readonly folderCut = signal(false);
  readonly query = signal('');
  /** What Find reached beyond the recent runs: the outputs of the other schedules the query names, and the query. */
  readonly found = signal<(RecentOutputs & { query: string }) | null>(null);
  private findTimer: ReturnType<typeof setTimeout> | null = null;
  /** The newest Find asked; an older answer that comes back late is dropped. */
  private findSeq = 0;
  /** Owner 2026-10-27: Find's own read, said while it runs and when it fails (it read as "no other schedule"). */
  readonly finding = signal(false);
  readonly findError = signal('');

  readonly reports = computed(() => mergeReports(this.objects(), [...this.runs()?.reports ?? [], ...this.found()?.reports ?? []]));
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.reports();
    return this.reports().filter(r => [r.name, r.type, r.pipeline, r.jobName, r.owner]
      .some(v => (v ?? '').toLowerCase().includes(q)));
  });
  /** Owner 2026-10-27: every column sorts; the list starts as mergeReports orders it, newest first. */
  readonly sort = createTableSort<GeneratedReport>({
    id: 'generated-outputs',
    columns: {
      name: r => r.name,
      type: r => r.type,
      pipeline: r => r.pipeline || r.jobName,
      created: { value: r => r.created, kind: 'date' },
      size: { value: r => r.size, kind: 'number' },
      status: { value: r => r.status, kind: 'status' },
      owner: r => r.owner,
    },
    initial: { key: 'created', direction: 'desc' },
  });
  readonly sorted = computed(() => this.sort.apply(this.filtered()));
  readonly pager = createPager<GeneratedReport>();
  /** Sorted before the page is cut, so a sort covers every row and not just this page. */
  readonly paged = computed(() => this.pager.slice(this.sorted()));

  readonly bucketOptions = computed<ComboboxOption[]>(() =>
    this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));

  /** How far the list looked: which folder, and how many runs of how many schedules. */
  readonly reach = computed(() => {
    const parts: string[] = [];
    if (this.bucket()) {
      const subs = this.subfoldersRead();
      parts.push(`the files in ${this.bucket()}/${this.folder()}${subs ? ` and ${subs} of its subfolders` : ''}`
        + (this.folderCut() ? ` (the first ${FOLDER_FILE_CAP.toLocaleString('en-US')} of a folder)` : ''));
    }
    const runs = this.runs();
    if (runs) {
      parts.push(`the outputs of ${runs.runsRead} recent runs (the newest ${FAN_OUT.runsPerJob} of each of the ${runs.jobsRead} `
        + `most recently run schedules${runs.failed ? `; ${runs.failed} could not be read` : ''})`);
    }
    const found = this.found();
    if (found) {
      parts.push(found.jobsRead
        ? `the outputs of ${found.runsRead} runs of the ${found.jobsRead} other schedules whose name or pipeline has "${found.query}"`
          + (found.failed ? ` (${found.failed} could not be read)` : '')
        : `no other schedule whose name or pipeline has "${found.query}"`);
    }
    return parts.length ? `Showing ${parts.join(', and ')}. Nothing lists every generated file yet.` : '';
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => { if (this.findTimer) clearTimeout(this.findTimer); });
    this.loadBuckets(true);
  }

  /**
   * The bucket choices. A failure is said under the bucket field with Try again (it was silent, and the list then
   * just had no files); the recent runs are still read without a bucket.
   */
  loadBuckets(thenLoad = false): void {
    this.bucketsState.start();
    this.storage.buckets().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) {
          this.bucketsState.fail(r, 'The storage connections could not be read.');
        } else {
          const list = r.data ?? [];
          this.buckets.set(list);
          this.bucketsState.done();
          if (!this.bucket() && list.length) {
            this.bucket.set(list[0].bucket);
            if (!thenLoad) this.loadObjects();
          }
        }
        if (thenLoad) this.load();
      },
      error: err => {
        this.bucketsState.fail(err, 'The storage connections could not be read.');
        if (thenLoad) this.load();
      },
    });
  }

  load(fresh = false): void {
    this.loadingRuns.set(true);
    this.runsError.set('');
    this.service.recentOutputs(fresh).subscribe({
      next: r => { this.runs.set(r); this.loadingRuns.set(false); },
      error: e => {
        this.runs.set(null);
        this.runsError.set(loadErrorText(e, 'Could not read recent runs\' outputs.'));
        this.loadingRuns.set(false);
      },
    });
    this.loadObjects();
    if (this.found()) this.findBeyond(this.found()!.query);
  }

  /**
   * Find: the list narrows at once to what is in hand; after a pause, the schedules beyond the recent ones whose name or
   * pipeline has the query are read too, so a report of a schedule that has not run lately is found by its name.
   */
  search(value: string): void {
    this.query.set(value);
    this.pager.goTo(1, this.filtered().length);
    if (this.findTimer) clearTimeout(this.findTimer);
    this.findTimer = null;
    const q = value.trim();
    if (q.length < FIND_MIN_CHARS) {
      this.findSeq++;
      this.found.set(null);
      this.finding.set(false);
      this.findError.set('');
      return;
    }
    this.findTimer = setTimeout(() => { this.findTimer = null; this.findBeyond(q); }, FIND_DELAY_MS);
  }

  findBeyond(q: string): void {
    const seq = ++this.findSeq;
    this.finding.set(true);
    this.findError.set('');
    this.service.matchingOutputs(q).subscribe({
      next: r => { if (seq === this.findSeq) { this.found.set({ ...r, query: q }); this.finding.set(false); } },
      // Owner 2026-10-27: a failed Find said "no other schedule has it", which is not what happened.
      error: e => {
        if (seq !== this.findSeq) return;
        this.found.set(null);
        this.finding.set(false);
        this.findError.set(loadErrorText(e, `The other schedules could not be searched for "${q}".`));
      },
    });
  }

  pickBucket(bucket: string): void {
    this.bucket.set(bucket);
    this.loadObjects();
  }

  /** A folder typed in is read when the field is left, not on every key. */
  setFolder(value: string): void {
    const folder = value.trim().replace(/^\/+/, '');
    const normal = folder && !folder.endsWith('/') ? `${folder}/` : folder;
    if (normal === this.folder()) return;
    this.folder.set(normal);
    this.loadObjects();
  }

  /** The folder's files, and those of up to SUBFOLDER_CAP of its subfolders (one level). */
  loadObjects(): void {
    const bucket = this.bucket();
    this.objectsError.set('');
    this.subfoldersRead.set(0);
    this.folderCut.set(false);
    if (!bucket) { this.objects.set([]); this.loadingObjects.set(false); return; }
    this.loadingObjects.set(true);
    // Each folder's pages, one after another, until the listing ends or FOLDER_FILE_CAP files are in.
    const page = (prefix: string, token?: string) => this.storage.listObjects(bucket, prefix, token).pipe(
      // The answer itself is thrown, so its own words (when plain) reach loadErrorText; a JS Error's would not.
      map(r => { if (r.status !== API_SUCCESS) throw r; return r.data ?? { objects: [] }; }));
    const list = (prefix: string): Observable<ObjectSummary[]> => page(prefix).pipe(
      expand((r, i) => r.nextContinuationToken && (i + 1) * 100 < FOLDER_FILE_CAP ? page(prefix, r.nextContinuationToken) : EMPTY),
      reduce((all, r) => {
        if (r.nextContinuationToken && all.length + r.objects.length >= FOLDER_FILE_CAP) this.folderCut.set(true);
        return [...all, ...r.objects];
      }, [] as ObjectSummary[]),
      map(all => all.slice(0, FOLDER_FILE_CAP)));
    list(this.folder()).pipe(
      switchMap(top => {
        const subs = top.filter(o => o.folder).slice(0, SUBFOLDER_CAP);
        if (!subs.length) return of({ top, nested: [] as ObjectSummary[][] });
        return forkJoin(subs.map(f => list(f.key).pipe(catchError(() => of([] as ObjectSummary[])))))
          .pipe(map(nested => ({ top, nested })));
      }),
    ).subscribe({
      next: ({ top, nested }) => {
        this.subfoldersRead.set(nested.length);
        this.objects.set(reportsFromObjects(bucket, [...top, ...nested.flat()]));
        this.loadingObjects.set(false);
      },
      error: e => {
        this.objects.set([]);
        this.objectsError.set(loadErrorText(e, `Could not read ${bucket}/${this.folder()}.`));
        this.loadingObjects.set(false);
      },
    });
  }

  canPreview(r: GeneratedReport): boolean {
    return r.origin === 'run-file' ? r.status === 'Ready' && r.runDatasetId != null : !!(r.bucket && r.key);
  }

  preview(r: GeneratedReport): void {
    if (!this.canPreview(r)) return;
    if (r.origin === 'run-file' && isPdf(r)) {
      // MIG-255: a pipeline's report is a document, not rows -- it opens as the PDF it is, in the browser's own viewer.
      this.service.runDatasetFile(r.runDatasetId!, 'pdf').subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          // MIG-214: the new tab has the PDF by then; the URL would otherwise live as long as this tab.
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => this.toast.error(`Could not open ${r.name}.`),
      });
      return;
    }
    if (r.origin === 'run-file') {
      this.dialog.open(ReportPreviewDialog, { data: { name: r.name, runDatasetId: r.runDatasetId! }, hasBackdrop: true });
      return;
    }
    this.dialog.open(PreviewDialog, {
      data: { bucket: r.bucket!, key: r.key!, name: r.name, size: r.size ?? undefined,
        lastModified: r.origin === 'bucket' ? r.created ?? undefined : undefined },
      hasBackdrop: true,
    });
  }

  download(r: GeneratedReport): void {
    if (!this.canPreview(r)) return;
    const done = (blob: Blob, name: string) => StorageService.saveBlob(blob, name);
    const failed = () => this.toast.error(`Could not download ${r.name}.`);
    if (r.origin === 'run-file' && isPdf(r)) {
      this.service.runDatasetFile(r.runDatasetId!, 'pdf').subscribe({ next: b => done(b, r.name), error: failed });
      return;
    }
    if (r.origin === 'run-file') {
      const own = r.type.toLowerCase();
      const format = (DATASET_FORMATS as readonly string[]).includes(own) ? own as typeof DATASET_FORMATS[number] : 'json';
      const name = format === own ? r.name : `${r.name.replace(/\.[^.]+$/, '')}.${format}`;
      this.service.runDatasetFile(r.runDatasetId!, format).subscribe({ next: b => done(b, name), error: failed });
      return;
    }
    this.storage.download(r.bucket!, r.key!).subscribe({ next: b => done(b, r.name), error: failed });
  }

  /** Only a file in a bucket can be emailed: storage sends it; a run's kept dataset is Core's. */
  canShare(r: GeneratedReport): boolean {
    return r.origin !== 'run-file' && !!(r.bucket && r.key);
  }

  share(r: GeneratedReport): void {
    if (!this.canShare(r)) return;
    const send = (result: ShareResult) => this.storage.share(r.bucket!, [r.key!], result.recipientEmail, result.message);
    this.dialog.open<ShareResult>(ShareDialog, { hasBackdrop: true, data: { count: 1, send } }).closed
      .subscribe(result => { if (result) this.toast.success(`Sent to ${result.recipientEmail}.`); });
  }

  /** Browse files at the folder holding the file; null for a run's kept dataset, which is in no bucket. */
  storageParams(r: GeneratedReport): { bucket: string; prefix: string } | null {
    if (r.origin === 'run-file' || !r.bucket || !r.key) return null;
    return { bucket: r.bucket, prefix: r.key.slice(0, r.key.lastIndexOf('/') + 1) };
  }

  size = formatSize;
}
