import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
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

/** Subfolders of the reports folder listed too (one level), at most this many. */
export const SUBFOLDER_CAP = 10;
const DATASET_FORMATS = ['csv', 'json', 'jsonl'] as const;
/** A run's kept file that is a report (render_pdf, MIG-255), not rows. */
const isPdf = (r: GeneratedReport) => r.type.toLowerCase() === 'pdf';

/**
 * MIG-253: Documents › Reports -- the documents and files made from your data.
 *
 * There is no table of generated files (a backend gap: a generated-outputs endpoint). The list is
 * built from what exists: the files in one bucket folder (renders are saved to `reports/` unless
 * named otherwise), one level of its subfolders, and the outputs of recent runs, read through a
 * capped fan-out. It says how far it looked, so a file it did not reach is not taken for missing.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-generated-reports',
  imports: [Icon, Combobox, RouterLink, ServerTimePipe, TableShell, Pagination],
  templateUrl: './generated-reports.html',
})
export class GeneratedReports implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly service = inject(GeneratedService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly folder = signal('reports/');
  readonly loadingRuns = signal(false);
  readonly loadingObjects = signal(false);
  readonly loading = computed(() => this.loadingRuns() || this.loadingObjects());
  readonly objectsError = signal('');
  readonly runsError = signal('');
  readonly objects = signal<GeneratedReport[]>([]);
  readonly runs = signal<RecentOutputs | null>(null);
  readonly subfoldersRead = signal(0);
  readonly query = signal('');

  readonly reports = computed(() => mergeReports(this.objects(), this.runs()?.reports ?? []));
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.reports();
    return this.reports().filter(r => [r.name, r.type, r.pipeline, r.jobName, r.owner]
      .some(v => (v ?? '').toLowerCase().includes(q)));
  });
  readonly pager = createPager<GeneratedReport>();
  readonly paged = computed(() => this.pager.slice(this.filtered()));

  readonly bucketOptions = computed<ComboboxOption[]>(() =>
    this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));

  /** How far the list looked: which folder, and how many runs of how many schedules. */
  readonly reach = computed(() => {
    const parts: string[] = [];
    if (this.bucket()) {
      const subs = this.subfoldersRead();
      parts.push(`the files in ${this.bucket()}/${this.folder()}${subs ? ` and ${subs} of its subfolders` : ''}`);
    }
    const runs = this.runs();
    if (runs) {
      parts.push(`the outputs of ${runs.runsRead} recent runs (the newest ${FAN_OUT.runsPerJob} of each of the ${runs.jobsRead} `
        + `most recently run schedules${runs.failed ? `; ${runs.failed} could not be read` : ''})`);
    }
    return parts.length ? `Showing ${parts.join(', and ')}. Nothing lists every generated file yet.` : '';
  });

  ngOnInit(): void {
    this.storage.buckets().subscribe({
      next: r => {
        const list = r.status === API_SUCCESS ? (r.data ?? []) : [];
        this.buckets.set(list);
        if (!this.bucket() && list.length) this.bucket.set(list[0].bucket);
        this.load();
      },
      error: () => this.load(),
    });
  }

  load(fresh = false): void {
    this.loadingRuns.set(true);
    this.runsError.set('');
    this.service.recentOutputs(fresh).subscribe({
      next: r => { this.runs.set(r); this.loadingRuns.set(false); },
      error: e => {
        this.runs.set(null);
        this.runsError.set(e?.error?.message || e?.message || 'Could not read recent runs\' outputs.');
        this.loadingRuns.set(false);
      },
    });
    this.loadObjects();
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
    if (!bucket) { this.objects.set([]); return; }
    this.loadingObjects.set(true);
    const list = (prefix: string): Observable<ObjectSummary[]> => this.storage.listObjects(bucket, prefix).pipe(
      map(r => { if (r.status !== API_SUCCESS) throw new Error(r.message); return r.data?.objects ?? []; }));
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
        this.objectsError.set(e?.error?.message || e?.message || `Could not read ${bucket}/${this.folder()}.`);
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
        next: blob => window.open(URL.createObjectURL(blob), '_blank', 'noopener'),
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
