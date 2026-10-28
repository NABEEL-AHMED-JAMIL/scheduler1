import { Component, DestroyRef, OnInit, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AdvancedOption, AdvancedSelect, AdvancedTone, filterOptions } from '../../../shared/ui/advanced-select';
import { Icon } from '../../../shared/ui/icon';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';
import { FileDropzone } from '../../../shared/ui/file-dropzone';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { AuthService } from '../../../core/auth/auth.service';
import { GeneratedService, pipelineOf } from '../../documents/generated/generated.service';
import { RunOutput } from '../../jobs/run-steps/run-steps.model';
import { RunRow } from '../../tasks/steps/steps.model';
import { StepsApi } from '../../tasks/steps/steps.service';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { DataSourceRow, PASTE_MAX_BYTES, ReportVersionRow, SampleRow, SourceRef, jsonProblem, sampleKindLabel } from '../report-studio.model';
import { INPUT_ROWS, ReportSourcePicker, SourceMode, stepRowsOf } from '../source-picker';
import { rsTime } from '../rs-time.pipe';
import { firstRecord, scalars } from '../designer/designer-model';
import { TemplateField } from './template-fields';
import { fitCount } from './auto-match';

/** Where the data comes from: a version's own frozen data, a pipeline run, a file in a bucket, an upload, pasted JSON, a sample. */
export type DataCard = 'same' | 'run' | 'bucket' | 'upload' | 'paste' | 'sample' | 'bundle';

/** A pipeline schedule as listSourceJob sends it (the fields the picker reads). */
interface Schedule { jobId: number; jobName?: string | null; lastJobRun?: string | null; jobRunningStatus?: string | null; tenantId?: number | null;
  taskDetail?: { taskName?: string | null } | { taskName?: string | null }[] | null; }

/** What a pipeline's newest completed run holds, read once to say how well it fits ("Fits 79 of 83"). */
export interface PipelineFit {
  state: 'reading' | 'read' | 'none' | 'failed';
  runId?: number;
  when?: string | null;
  rows?: number;
  columns?: number;
  fit?: number;
}

/** A pipeline output a report can read: a kept file or dataset in JSON, CSV or a table format (a PDF is not data). */
const DATA_FORMATS = new Set(['json', 'jsonl', 'csv', 'parquet', 'xlsx', 'dataset', '']);
/** How many pipelines' fit is read at once, and how many of those in view. */
const FIT_IN_VIEW = 5;
const BUCKET_TYPES = ['json', 'csv', 'jsonl'];

/** The outputs of a run a report can read (the files a Save step kept, then each step's rows), and the one to start on. */
export function readableOutputs(list: RunOutput[] | null, timeline: Parameters<typeof stepRowsOf>[0], stepKey: string | null,
  keepName: string | null = null): { outputs: RunOutput[]; pick: RunOutput | null } {
  const files = (list ?? []).filter(o => o.kind === 'file' && o.runDatasetId != null && !o.expired && DATA_FORMATS.has(String(o.format ?? '').toLowerCase()));
  const kept = new Set(files.map(o => o.runDatasetId));
  const outputs = [...files, ...stepRowsOf(timeline, stepKey).filter(o => !kept.has(o.runDatasetId))];
  const input = outputs.find(o => o.name.endsWith(INPUT_ROWS));
  const named = keepName ? outputs.find(o => o.name === keepName) : undefined;
  const pick = named ?? input ?? (files.length === 1 ? files[0] : !files.length ? outputs[0] ?? null : null);
  return { outputs, pick: pick ?? null };
}

/** The newest run that completed, else the newest. */
export function latestCompleted(runs: RunRow[]): RunRow | null {
  return runs.find(r => r.jobStatus === 'Completed') ?? runs[0] ?? null;
}

function statusTone(status: string | null | undefined): AdvancedTone {
  switch (status) {
    case 'Completed': return 'ok';
    case 'Failed': case 'Interrupt': return 'crit';
    case 'Running': case 'Queue': return 'info';
    default: return 'neutral';
  }
}

/**
 * "Where does the data come from?" (Report data and mapping, owner 2026-10-27): data cards, then what each needs. On
 * Generate again the version's own frozen data is first ("Same data as v2"), then a newer run of its pipeline, a file
 * (from a bucket, or uploaded) and pasted JSON; a new report offers a pipeline run, a bucket file, an upload, pasted JSON
 * and the template's test samples. A pipeline is picked from a searchable list that says each one's last run, its rows
 * and columns and how many of the template's fields it fits; its runs follow, the newest completed one chosen. The
 * component only names the data: media-service reads it as the person, so a run or file they cannot open is refused there.
 */
@Component({
  selector: 'app-rs-data-sources',
  imports: [FormsModule, NgTemplateOutlet, AdvancedSelect, Icon, AppLoading, InlineStatus, FileDropzone, ReportSourcePicker],
  templateUrl: './data-sources.html',
  styleUrl: './data-sources.css',
})
export class DataSources implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly generated = inject(GeneratedService);
  private readonly steps = inject(StepsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly destroy = inject(DestroyRef);

  /** The version Generate again starts from (its frozen data is "Same data as vN"); null for a new report. */
  readonly version = input<ReportVersionRow | null>(null);
  /** The pipeline (schedule) the report came from, when a version says (its config.pipeline). */
  readonly pipelineJobId = input<number | null>(null);
  /** The step whose rows the report was made from (a pipeline-generated report's config.pipeline.stepKey). */
  readonly stepKey = input<string | null>(null);
  readonly samples = input<SampleRow[]>([]);
  /** The template's fields: each pipeline says how many its newest run fits. */
  readonly fields = input<TemplateField[]>([]);
  /** A platform administrator's chosen workspace: only its schedules are offered. */
  readonly tenantId = input<number | null>(null);
  /** The data named, or null while nothing usable is. */
  readonly source = model<SourceRef | null>(null);
  readonly card = model<DataCard>('run');

  readonly again = computed(() => !!this.version());
  readonly canUpload = computed(() => this.auth.canOpen('report-data'));
  readonly cards = computed(() => {
    const v = this.version();
    const fileHint = this.again() ? 'From a bucket, or upload one' : 'CSV or JSON';
    const out: { id: DataCard; name: string; hint: string; disabled?: boolean }[] = [];
    if (v) out.push({ id: 'same', name: `Same data as v${v.version}`, hint: this.sameHint() });
    out.push({ id: 'run', name: this.again() ? 'A newer run' : 'A pipeline run', hint: this.runHint() });
    out.push({ id: 'bucket', name: this.again() ? 'A file' : 'A file in the bucket', hint: fileHint });
    if (!this.again() && this.canUpload()) out.push({ id: 'upload', name: 'Upload a file', hint: 'From your computer' });
    out.push({ id: 'paste', name: 'Paste JSON', hint: this.again() ? 'For a quick fix or a test' : 'One record or a list' });
    if (!this.again()) {
      const n = this.samples().length;
      out.push({ id: 'sample', name: 'A test sample', hint: n ? `${n} saved with the template` : 'None saved with the template', disabled: !n });
    }
    return out;
  });
  private readonly sameHint = computed(() => {
    const s = this.version()?.snapshot;
    if (!s) return 'Frozen with the version';
    const run = s.pipelineRunId ? `run #${s.pipelineRunId} · ` : '';
    return `Frozen with v${this.version()!.version} · ${run}${s.records ?? '?'} row${s.records === 1 ? '' : 's'}`;
  });
  private readonly runHint = computed(() => {
    const own = this.pipelineJobId();
    const fit = own ? this.fits()[own] : undefined;
    const name = own ? this.scheduleName(own) : '';
    if (this.again() && name && fit?.runId) return `Of ${name}: latest #${fit.runId}${fit.when ? ', ' + rsTime(fit.when, 'recent') : ''}`;
    if (this.again() && name) return `Of ${name}`;
    return 'Its result rows, latest run by default';
  });

  // ---------------------------------------------------------------- a pipeline run

  private readonly schedules = signal<Schedule[]>([]);
  readonly schedulesLoading = signal(false);
  readonly schedulesError = signal('');
  readonly fits = signal<Record<number, PipelineFit>>({});
  readonly jobId = signal('');
  readonly runs = signal<RunRow[]>([]);
  readonly runsLoading = signal(false);
  readonly runId = signal('');
  readonly outputs = signal<RunOutput[]>([]);
  readonly outputsLoading = signal(false);
  readonly datasetId = signal('');
  private readonly pipelineQuery = signal('');
  private readonly asked = new Set<number>();
  private reading = 0;
  private readonly waiting: number[] = [];

  private readonly visibleSchedules = computed(() => {
    const t = this.tenantId();
    // This report's own pipeline first, then those whose newest run fits the template best, then the most recent.
    const fit = (id: number) => { const f = this.fits()[id]; return f?.state === 'read' ? f.fit ?? 0 : -1; };
    return this.schedules().filter(s => !t || s.tenantId == null || s.tenantId === t)
      .sort((a, b) => Number(b.jobId === this.pipelineJobId()) - Number(a.jobId === this.pipelineJobId())
        || fit(b.jobId) - fit(a.jobId) || String(b.lastJobRun ?? '').localeCompare(String(a.lastJobRun ?? '')));
  });

  readonly pipelineOptions = computed<AdvancedOption[]>(() => {
    const total = this.fields().length;
    return this.visibleSchedules().map((s): AdvancedOption => {
      const fit = this.fits()[s.jobId];
      const pipe = pipelineOf(s as { taskDetail?: { taskName?: string | null } | null });
      const name = s.jobName || pipe || `Schedule ${s.jobId}`;
      let description = s.lastJobRun ? `Last ran ${rsTime(s.lastJobRun, 'recent')}` : 'No runs yet';
      if (fit?.state === 'read') {
        description = `Last run #${fit.runId}${fit.when ? ' ' + rsTime(fit.when, 'recent') : ''} · ${fit.rows} row${fit.rows === 1 ? '' : 's'} · ${fit.columns} column${fit.columns === 1 ? '' : 's'}`;
      } else if (fit?.state === 'none') description = 'No completed run with data yet';
      const badge = fit?.state === 'read' && total ? `Fits ${fit.fit} of ${total}` : fit?.state === 'reading' ? 'Checking…' : undefined;
      const good = fit?.state === 'read' && total > 0 && (fit.fit ?? 0) / total >= 0.8;
      return { value: String(s.jobId), label: name, description, badge, badgeTone: good ? 'ok' : 'neutral',
        keywords: [pipe, s.jobId].filter(Boolean).join(' '), group: s.jobId === this.pipelineJobId() ? 'This report\'s pipeline' : undefined };
    });
  });

  readonly runOptions = computed<AdvancedOption[]>(() => this.runs().map((r): AdvancedOption => ({
    value: String(r.jobQueueId), label: `#${r.jobQueueId}`, mono: true,
    description: [rsTime(r.startTime, 'recent'), r.jobStatusMessage].filter(Boolean).join(' · '),
    badge: r.jobStatus || '—', badgeTone: statusTone(r.jobStatus),
    sample: String(r.jobQueueId) === this.runId() && this.picked() ? this.picked()! : undefined,
  })));

  readonly outputOptions = computed<AdvancedOption[]>(() => this.outputs().map(o => ({
    value: String(o.runDatasetId), label: o.name, description: [o.stepKey, (o.format || 'data').toUpperCase()].filter(Boolean).join(' · '),
    sample: o.rowCount != null ? `${o.rowCount} row${o.rowCount === 1 ? '' : 's'}` : undefined,
  })));

  /** The chosen output's rows, said beside its run. */
  private readonly picked = computed(() => {
    const o = this.outputs().find(x => String(x.runDatasetId) === this.datasetId());
    return o?.rowCount != null ? `${o.rowCount} row${o.rowCount === 1 ? '' : 's'}` : null;
  });

  scheduleName(jobId: number): string {
    const s = this.schedules().find(x => x.jobId === jobId);
    return s ? s.jobName || pipelineOf(s as { taskDetail?: { taskName?: string | null } | null }) || `Schedule ${jobId}` : '';
  }

  // ---------------------------------------------------------------- a file, an upload, pasted data, a sample

  readonly bucketFile = signal<PickedObject | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploaded = signal<{ sourceId: string; name: string; records?: number } | null>(null);
  readonly text = signal('');
  readonly csv = signal(false);
  readonly sampleId = signal('');
  /** Several files as one report's data (a bundle): the console's bundle picker, as before. */
  readonly bundle = signal<SourceRef | null>(null);
  readonly bundleMode = signal<SourceMode>('bundle');
  readonly onlyBundle: SourceMode[] = ['bundle'];
  /** Files uploaded or saved before (the Data tab's), offered beside a new upload. */
  readonly saved = signal<DataSourceRow[]>([]);
  readonly savedId = signal('');
  readonly savedOptions = computed<AdvancedOption[]>(() => this.saved().map(s => ({ value: s.sourceId, label: s.name,
    description: [s.format, s.records != null ? `${s.records} rows` : '', s.createdAt ? rsTime(s.createdAt, 'recent') : ''].filter(Boolean).join(' · ') })));
  private savedAsked = false;
  readonly sampleOptions = computed<AdvancedOption[]>(() => this.samples().map(s => ({ value: s.sampleId, label: s.name, description: sampleKindLabel(s),
    sample: s.format })));
  readonly pasteError = computed(() => {
    const t = this.text();
    if (new Blob([t]).size > PASTE_MAX_BYTES) return 'Pasted data is at most 5 MB; pick the pipeline run instead.';
    return this.csv() ? (t.trim() ? null : 'Paste some CSV first.') : jsonProblem(t);
  });

  constructor() {
    effect(() => {
      // Each way's own state makes the source; nothing is read until the way is complete.
      this.card();
      this.text();
      this.csv();
      this.datasetId();
      this.runId();
      this.sampleId();
      this.bucketFile();
      this.uploaded();
      this.bundle();
      this.savedId();
      untracked(() => this.publish());
    });
    effect(() => {
      // The pipelines are read once, when a run is first the way (again after a failure, by Try again).
      if (this.card() === 'run') untracked(() => this.loadSchedules());
    });
    effect(() => {
      // A pipeline's fit is read for those in view: this report's own, then the most recent (or those the search finds).
      const q = this.pipelineQuery();
      const opts = this.pipelineOptions();
      if (this.card() !== 'run' || !opts.length || !this.fields().length) return;
      untracked(() => filterOptions(opts, q).slice(0, FIT_IN_VIEW).forEach(o => this.readFit(Number(o.value))));
    });
    this.destroy.onDestroy(() => this.waiting.splice(0));
  }

  ngOnInit(): void {
    if (this.version()) this.card.set('same');
    else if (!this.again()) this.card.set('run');
    // Generate again of a pipeline's report: its own pipeline is picked, its newest completed run ready to choose.
    if (this.pipelineJobId()) this.jobId.set(String(this.pipelineJobId()));
    if (this.card() === 'run' || this.pipelineJobId()) this.loadSchedules();
  }

  pick(card: DataCard): void {
    if (this.cards().find(c => c.id === card)?.disabled) return;
    this.card.set(card);
    if ((card === 'upload' || card === 'bucket') && this.canUpload() && !this.savedAsked) {
      this.savedAsked = true;
      this.api.sources(this.tenantId()).subscribe({ next: list => this.saved.set(list), error: () => { this.savedAsked = false; } });
    }
    if (card === 'run' && this.jobId() && !this.runs().length) this.pickJob(this.jobId());
  }

  /** The current way as a source, or null while it is not complete. */
  publish(): void {
    let next: SourceRef | null = null;
    switch (this.card()) {
      case 'same': {
        const v = this.version();
        next = v?.snapshotId ? { connector: 'SNAPSHOT', snapshotId: v.snapshotId } : null;
        break;
      }
      case 'run':
        next = this.runId() && this.datasetId() ? { connector: 'RUN_OUTPUT', jobQueueId: Number(this.runId()), runDatasetId: Number(this.datasetId()) } : null;
        break;
      case 'bucket': {
        const f = this.bucketFile();
        if (f) next = { connector: 'BUCKET_OBJECT', bucket: f.bucket, key: f.key };
        // On Generate again "A file" is a bucket's or an uploaded one; a new report has Upload as its own card.
        else if (this.uploaded() && this.again()) next = { connector: 'SOURCE', sourceId: this.uploaded()!.sourceId };
        else if (this.savedId() && this.again()) next = { connector: 'SOURCE', sourceId: this.savedId() };
        break;
      }
      case 'upload':
        next = this.uploaded() ? { connector: 'SOURCE', sourceId: this.uploaded()!.sourceId }
          : this.savedId() ? { connector: 'SOURCE', sourceId: this.savedId() } : null;
        break;
      case 'bundle':
        next = this.bundle();
        break;
      case 'paste':
        next = this.text().trim() && !this.pasteError() ? { connector: 'INLINE_JSON', text: this.text(), format: this.csv() ? 'CSV' : 'JSON' } : null;
        break;
      case 'sample':
        next = this.sampleId() ? { connector: 'SAMPLE', sampleId: this.sampleId() } : null;
        break;
    }
    if (JSON.stringify(next) !== JSON.stringify(this.source())) this.source.set(next);
  }

  // ---------------------------------------------------------------- pipelines and runs

  private schedulesAsked = false;

  loadSchedules(again = false): void {
    if (this.schedulesLoading() || (this.schedulesAsked && !again)) return;
    this.schedulesAsked = true;
    this.schedulesLoading.set(true);
    this.schedulesError.set('');
    this.generated.schedules().subscribe({
      next: all => {
        this.schedulesLoading.set(false);
        this.schedules.set(all as unknown as Schedule[]);
        if (this.jobId() && this.card() === 'run' && !this.runs().length) this.pickJob(this.jobId());
        if (this.pipelineJobId()) this.readFit(this.pipelineJobId()!);
      },
      error: () => {
        this.schedulesLoading.set(false);
        this.schedulesError.set('Your pipelines could not be read (they need the Schedules or Runs pages).');
      },
    });
  }

  searchPipelines(q: string): void {
    this.pipelineQuery.set(q);
  }

  /** A pipeline's newest completed run, its output and how many of the template's fields it fits, read in turn. */
  private readFit(jobId: number): void {
    if (!jobId || this.asked.has(jobId)) return;
    this.asked.add(jobId);
    this.fits.update(f => ({ ...f, [jobId]: { state: 'reading' } }));
    this.waiting.push(jobId);
    this.drain();
  }

  private drain(): void {
    while (this.reading < 2 && this.waiting.length) {
      const jobId = this.waiting.shift()!;
      this.reading++;
      this.fitOf(jobId).pipe(takeUntilDestroyed(this.destroy)).subscribe(fit => {
        this.reading--;
        this.fits.update(f => ({ ...f, [jobId]: fit }));
        this.drain();
      });
    }
  }

  private fitOf(jobId: number): Observable<PipelineFit> {
    return this.generated.runs(jobId, 10).pipe(
      switchMap(runs => {
        const run = runs.find(r => r.jobStatus === 'Completed');
        if (!run) return of<PipelineFit>({ state: 'none' });
        return this.outputsOf(run.jobQueueId).pipe(switchMap(({ pick }) => {
          if (pick?.runDatasetId == null) return of<PipelineFit>({ state: 'none', runId: run.jobQueueId, when: run.startTime });
          return this.api.inspect({ connector: 'RUN_OUTPUT', jobQueueId: run.jobQueueId, runDatasetId: pick.runDatasetId }, '$').pipe(
            map(i => ({
              state: 'read' as const, runId: run.jobQueueId, when: run.startTime, rows: i.records,
              columns: scalars(i.schema).filter(f => !f.path.includes('.')).length + i.schema.filter(f => /array/i.test(f.type) && !f.path.includes('[]')).length,
              fit: fitCount(this.fields(), i.schema, firstRecord(i)),
            })));
        }));
      }),
      catchError(() => of<PipelineFit>({ state: 'failed' })));
  }

  private outputsOf(runId: number, keepName: string | null = null): Observable<{ outputs: RunOutput[]; pick: RunOutput | null }> {
    return forkJoin([this.generated.runOutputs(runId).pipe(catchError(() => of(null))),
      this.steps.timeline(runId).pipe(map(r => r.data ?? null), catchError(() => of(null)))])
      .pipe(map(([list, timeline]) => readableOutputs(list, timeline, this.stepKey(), keepName)));
  }

  pickJob(value: string): void {
    this.jobId.set(value);
    this.runId.set('');
    this.datasetId.set('');
    this.runs.set([]);
    this.outputs.set([]);
    if (!value) return;
    this.runsLoading.set(true);
    const asked = value;
    this.generated.runs(Number(value), 10).subscribe({
      next: runs => {
        if (this.jobId() !== asked) return;
        this.runsLoading.set(false);
        this.runs.set(runs);
        const latest = latestCompleted(runs);
        if (latest) this.pickRun(String(latest.jobQueueId));
      },
      error: () => { this.runsLoading.set(false); this.runs.set([]); },
    });
    this.readFit(Number(value));
  }

  pickRun(value: string): void {
    const keep = this.outputs().find(o => String(o.runDatasetId) === this.datasetId())?.name ?? null;
    this.runId.set(value);
    this.datasetId.set('');
    this.outputs.set([]);
    if (!value) return;
    this.outputsLoading.set(true);
    this.outputsOf(Number(value), keep).subscribe(({ outputs, pick }) => {
      if (this.runId() !== value) return;
      this.outputsLoading.set(false);
      this.outputs.set(outputs);
      if (pick?.runDatasetId != null) this.datasetId.set(String(pick.runDatasetId));
    });
  }

  // ---------------------------------------------------------------- files

  chooseFile(): void {
    const f = this.bucketFile();
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick the data file', bucket: f?.bucket, selectedKey: f?.key, extensions: BUCKET_TYPES,
    })).closed.subscribe(picked => { if (picked) { this.uploaded.set(null); this.savedId.set(''); this.bucketFile.set(picked); } });
  }

  pickSaved(id: string): void {
    this.savedId.set(id);
    if (id) { this.uploaded.set(null); this.bucketFile.set(null); }
  }

  upload(files: File[]): void {
    const file = files[0];
    if (!file) return;
    this.uploading.set(true);
    this.uploadError.set('');
    this.api.upload(file, file.name).subscribe({
      next: row => {
        this.uploading.set(false);
        this.bucketFile.set(null);
        this.savedId.set('');
        this.uploaded.set({ sourceId: row.sourceId, name: row.name || file.name, records: row.records });
      },
      error: e => { this.uploading.set(false); this.uploadError.set(studioError(e, 'The file could not be uploaded.').message); },
    });
  }
}
