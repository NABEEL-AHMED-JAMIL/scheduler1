import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ToastService } from '../../../shared/ui/toast.service';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { PdfViewer } from '../../objects/preview/pdf-viewer';
import { BucketSummary, StorageService } from '../../objects/storage.service';
import { RunOutput } from '../../jobs/run-steps/run-steps.model';
import { RunRow } from '../../tasks/steps/steps.model';
import { GeneratedService } from '../../documents/generated/generated.service';
import {
  DEFAULT_OPTIONS, Orientation, PAGE_SIZES, PageSize, RenderFormat, RenderResult, ReportTemplateSummary, TemplateOptions,
  base64ToBlob, datasetOf, parseDatasetText, recentJobs, renderBody,
} from '../../documents/generated/generated.model';

/** Where the rows come from. */
export type RenderSource = 'dataset' | 'execution';

/** The folder a saved render goes to unless another is named; Documents › Reports reads it. */
export const REPORTS_FOLDER = 'reports/';

/** Tables media-service's render can read from a bucket (MIG-232's source). */
const TABLE_EXTENSIONS = ['csv', 'tsv', 'xlsx', 'parquet', 'json', 'jsonl'];

interface ScheduleRow { jobId: number; jobName?: string | null; lastJobRun?: string | null; }

/**
 * MIG-253: Document Converter's "Dataset → PDF" and "From an execution" modes.
 *
 * Rows -- pasted, a table in a bucket, or a dataset a run kept -- are rendered by media-service
 * (POST /documentConverter.json/render) through a saved template or the default layout. The
 * preview is that same render as a PDF, drawn by the console's pdf.js viewer from an object URL
 * of the bytes: a template is the tenant's own HTML, and it never enters this page's DOM.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-render-panel',
  imports: [Icon, Combobox, Segmented, PdfViewer, RouterLink, ServerTimePipe],
  templateUrl: './render-panel.html',
})
export class RenderPanel implements OnInit {
  private readonly service = inject(GeneratedService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly source = input.required<RenderSource>();
  readonly buckets = input<BucketSummary[]>([]);

  readonly formats = signal<RenderFormat[]>([]);
  readonly formatsError = signal('');
  readonly templates = signal<ReportTemplateSummary[]>([]);
  readonly outputFormat = signal('pdf');
  readonly options = signal<TemplateOptions>({ ...DEFAULT_OPTIONS });
  readonly pageSizes = PAGE_SIZES;

  // ---- Dataset: pasted rows, or a table in a bucket
  readonly datasetFrom = signal<'paste' | 'table'>('paste');
  readonly datasetFromOptions: SegmentOption<'paste' | 'table'>[] = [
    { id: 'paste', label: 'Paste rows', icon: 'code' },
    { id: 'table', label: 'A table in a bucket', icon: 'table' },
  ];
  readonly datasetText = signal('');
  readonly parsed = computed(() => parseDatasetText(this.datasetText()));
  readonly table = signal<PickedObject | null>(null);
  readonly rowsPlaceholder = '[{"region": "North", "revenue": 1234.50}, {"region": "South", "revenue": 980}]';
  readonly rowsHint = 'A list of records, or {"columns": [...], "rows": [[...]]}; a "title" beside them heads the document.';
  /** "2 rows · 3 columns: a, b, c" for good rows, or what is wrong with them. */
  readonly parsedSummary = computed(() => {
    const p = this.parsed();
    if (!p.ok) return '';
    const cols = p.columns.length;
    return `${p.rows} row${p.rows === 1 ? '' : 's'} · ${cols} column${cols === 1 ? '' : 's'}: ${p.columns.join(', ')}`;
  });
  readonly parseError = computed(() => { const p = this.parsed(); return p.ok ? '' : p.error; });

  // ---- From an execution: schedule → run → dataset
  readonly schedules = signal<ScheduleRow[]>([]);
  readonly schedulesError = signal('');
  readonly jobId = signal<number | null>(null);
  readonly runList = signal<RunRow[]>([]);
  readonly jobQueueId = signal<number | null>(null);
  readonly outputs = signal<RunOutput[] | null>(null);
  readonly datasets = computed(() => datasetOf(this.outputs() ?? []));
  readonly datasetId = signal<number | null>(null);
  readonly runRows = signal<unknown>(null);
  readonly readingRun = signal(false);

  // ---- Output
  readonly fileName = signal('');
  readonly saveToBucket = signal(false);
  readonly saveBucket = signal('');
  readonly saveFolder = signal(REPORTS_FOLDER);
  readonly rendering = signal<'preview' | 'make' | null>(null);
  readonly error = signal('');
  readonly previewUrl = signal<string | null>(null);
  readonly previewPages = signal<number | null>(null);
  readonly result = signal<RenderResult | null>(null);

  readonly usesTemplate = computed(() => this.formats().find(f => f.format === this.outputFormat())?.usesTemplate ?? true);
  readonly usesDefault = computed(() => this.options().templateId == null);
  readonly bucketOptions = computed<ComboboxOption[]>(() =>
    this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));
  readonly templateOptions = computed<ComboboxOption[]>(() =>
    this.templates().map(t => ({ value: String(t.reportTemplateId), label: t.name, hint: t.pageSize ?? undefined })));
  readonly scheduleOptions = computed<ComboboxOption[]>(() =>
    recentJobs(this.schedules(), 200).map(j => ({ value: String(j.jobId), label: j.jobName || `Schedule ${j.jobId}` })));

  /** The rows or table the render reads, or null while there is nothing to render. */
  private readonly renderInput = computed<{ dataset?: unknown; source?: { bucket: string; key: string } } | null>(() => {
    if (this.source() === 'execution') return this.runRows() == null ? null : { dataset: this.runRows() };
    if (this.datasetFrom() === 'table') {
      const t = this.table();
      return t ? { source: { bucket: t.bucket, key: t.key } } : null;
    }
    const p = this.parsed();
    return p.ok ? { dataset: p.dataset } : null;
  });

  /** A run's dataset has no title of its own: its file name heads the document unless a title is typed. */
  readonly defaultTitle = computed(() => {
    if (this.source() !== 'execution') return '';
    const d = this.datasets().find(x => x.runDatasetId === this.datasetId());
    return d ? d.name.replace(/\.[^.]+$/, '') : '';
  });
  private readonly effectiveOptions = computed<TemplateOptions>(() => {
    const o = this.options();
    return o.title.trim() || !this.defaultTitle() ? o : { ...o, title: this.defaultTitle() };
  });

  readonly canMake = computed(() => !!this.renderInput() && !this.rendering() && (!this.saveToBucket() || !!this.saveBucket()));
  readonly canPreview = computed(() => !!this.renderInput() && !this.rendering() && this.usesTemplate());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dropPreview());
  }

  ngOnInit(): void {
    this.service.formats().subscribe({
      next: r => r.status === 'SUCCESS' ? this.formats.set(r.data?.formats ?? []) : this.formatsError.set(r.message),
      error: e => this.formatsError.set(e?.error?.message || 'Could not read the formats a dataset renders to.'),
    });
    this.service.templates().subscribe({
      next: r => { if (r.status === 'SUCCESS') this.templates.set(r.data ?? []); },
      error: () => { /* the default layout still works with no template list */ },
    });
    if (this.source() === 'execution') this.loadSchedules();
  }

  loadSchedules(): void {
    this.schedulesError.set('');
    this.service.schedules().subscribe({
      next: list => this.schedules.set(list),
      error: e => this.schedulesError.set(e?.error?.message || e?.message || 'Could not read the schedules.'),
    });
  }

  pickSchedule(value: string): void {
    const jobId = value ? Number(value) : null;
    this.jobId.set(jobId);
    this.runList.set([]);
    this.pickRun('');
    if (jobId == null) return;
    this.service.runs(jobId).subscribe({
      next: runs => this.runList.set(runs.slice(0, 20)),
      error: () => this.toast.error('Could not read this schedule\'s runs.'),
    });
  }

  pickRun(value: string): void {
    const jobQueueId = value ? Number(value) : null;
    this.jobQueueId.set(jobQueueId);
    this.outputs.set(null);
    this.pickDataset('');
    if (jobQueueId == null) return;
    this.service.runOutputs(jobQueueId).subscribe({
      next: list => {
        this.outputs.set(list ?? []);
        const only = this.datasets();
        if (only.length === 1) this.pickDataset(String(only[0].runDatasetId));
      },
      error: () => { this.outputs.set([]); this.toast.error('Could not read what this run put out.'); },
    });
  }

  pickDataset(value: string): void {
    const id = value ? Number(value) : null;
    this.datasetId.set(id);
    this.runRows.set(null);
    this.clearOutput();
    if (id == null) return;
    this.readingRun.set(true);
    this.service.runDataset(id).subscribe({
      next: rows => { this.readingRun.set(false); this.runRows.set(rows); },
      error: () => { this.readingRun.set(false); this.toast.error('Could not read that dataset; it may have expired.'); },
    });
  }

  /** The row count of what the run kept, for the line under the picker. */
  readonly runRowCount = computed(() => {
    const rows = this.runRows();
    return Array.isArray(rows) ? rows.length : null;
  });

  setTemplate(value: string): void {
    this.options.update(o => ({ ...o, templateId: value ? Number(value) : null }));
  }

  setPageSize(value: string): void { this.options.update(o => ({ ...o, pageSize: value as PageSize })); }
  setOrientation(value: string): void { this.options.update(o => ({ ...o, orientation: value as Orientation })); }
  setTitle(value: string): void { this.options.update(o => ({ ...o, title: value })); }
  setWatermark(value: string): void { this.options.update(o => ({ ...o, watermark: value })); }

  /** A stored table, picked in the console's one ObjectPicker; media-service reads it as the caller. */
  chooseTable(): void {
    const t = this.table();
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick a table to render',
      bucket: t?.bucket,
      prefix: t ? t.key.slice(0, t.key.lastIndexOf('/') + 1) : undefined,
      extensions: TABLE_EXTENSIONS,
    })).closed.subscribe(picked => { if (picked) { this.table.set(picked); this.clearOutput(); } });
  }

  /** Renders the layout as a PDF and shows it; nothing is saved. */
  preview(): void {
    const input = this.renderInput();
    if (!input) return;
    this.run('preview', renderBody({ outputFormat: 'pdf', ...input, options: this.effectiveOptions() }), done => {
      this.dropPreview();
      this.previewUrl.set(URL.createObjectURL(base64ToBlob(done.outputBase64, done.outputContentType || 'application/pdf')));
      this.previewPages.set(done.pageCount ?? null);
    });
  }

  /** Renders in the chosen format, into a bucket too when asked; the file is then ready to download. */
  make(): void {
    const input = this.renderInput();
    if (!input) return;
    const save = this.saveToBucket() ? { bucket: this.saveBucket(), folder: this.saveFolder() } : null;
    this.run('make', renderBody({ outputFormat: this.outputFormat(), ...input, options: this.effectiveOptions(),
      fileName: this.fileName(), save }), done => {
      this.result.set(done);
      this.toast.success(done.save && done.bucketName
        ? `${done.outputFileName} saved to ${done.bucketName}.` : `${done.outputFileName} is ready.`);
    });
  }

  private run(kind: 'preview' | 'make', body: Record<string, unknown>, then: (done: RenderResult) => void): void {
    this.rendering.set(kind);
    this.error.set('');
    this.service.render(body).subscribe({
      next: r => {
        this.rendering.set(null);
        if (r.status === 'SUCCESS' && r.data) then(r.data);
        else this.error.set(r.message || 'The render failed.');
      },
      error: e => {
        this.rendering.set(null);
        this.error.set(e?.error?.message || 'The render failed.');
      },
    });
  }

  download(): void {
    const done = this.result();
    if (!done) return;
    StorageService.saveBlob(base64ToBlob(done.outputBase64, done.outputContentType), done.outputFileName);
  }

  /** The folder a saved file landed in, to open Browse files at. */
  savedFolder(done: RenderResult): string {
    const key = done.outputStorageKey ?? '';
    return key.slice(0, key.lastIndexOf('/') + 1);
  }

  private clearOutput(): void {
    this.result.set(null);
    this.error.set('');
    this.dropPreview();
  }

  private dropPreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewPages.set(null);
  }

  size = formatSize;
}
