import { Component, OnInit, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { RsTimePipe } from './rs-time.pipe';
import { Icon } from '../../shared/ui/icon';
import { AuthService } from '../../core/auth/auth.service';
import { GeneratedService, pipelineOf } from '../documents/generated/generated.service';
import { RunOutput } from '../jobs/run-steps/run-steps.model';
import { RunRow } from '../tasks/steps/steps.model';
import { ReportStudioApi } from './report-studio.api';
import {
  BUNDLE_MAX_PARTS, BUNDLE_PART_NAME, DataSourceRow, OneFileSource, PASTE_MAX_BYTES, SampleRow, SourceRef, jsonProblem,
} from './report-studio.model';
import { BucketSummary, StorageService } from '../objects/storage.service';
import { API_SUCCESS } from '../../core/api/api.config';

export type SourceMode = 'paste' | 'run' | 'bucket' | 'saved' | 'sample' | 'bundle';
type Mode = SourceMode;

/** One file of a bundle as the picker holds it: its name in the data, how it is picked, and the source picked. */
interface BundleRow { id: number; name: string; mode: Mode; source: SourceRef | null; }

/** What a bundle's file may be: any one-file way (never several files again). */
const PART_MODES: Mode[] = ['run', 'bucket', 'saved', 'sample', 'paste'];

/** Why a bundle's rows do not make a source yet (the first reason), or null when they do. */
export function bundleProblem(rows: { name: string; source: SourceRef | null }[]): string | null {
  if (!rows.length) return 'Add a file.';
  if (rows.length > BUNDLE_MAX_PARTS) return `At most ${BUNDLE_MAX_PARTS} files.`;
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const name = r.name.trim();
    if (!name) return `Name file ${i + 1}: the report reads it as $.name.`;
    if (!BUNDLE_PART_NAME.test(name)) return `"${name}" is not a name: a letter, then letters, digits or _.`;
    if (seen.has(name)) return `Two files are called "${name}".`;
    seen.add(name);
    if (!r.source) return `Pick the data of "${name}".`;
  }
  return null;
}

/** The bundle the rows make: {connector: BUNDLE, parts: {name: source}}, or null while bundleProblem has a reason. */
export function bundleOf(rows: { name: string; source: SourceRef | null }[]): SourceRef | null {
  if (bundleProblem(rows)) return null;
  const parts: Record<string, OneFileSource> = {};
  for (const r of rows) parts[r.name.trim()] = r.source as OneFileSource;
  return { connector: 'BUNDLE', parts };
}

/** A pipeline output a report can read: a kept file or dataset in JSON, CSV or a table format (a PDF is not data). */
const DATA_FORMATS = new Set(['json', 'jsonl', 'csv', 'parquet', 'xlsx', 'dataset', '']);

/**
 * Where test or report data comes from (the owner's 2026-10-19 rule): paste JSON (or CSV), pick the output of any
 * pipeline run the reader may open, a file uploaded on the Data tab, or one of the template's saved test samples. The
 * picker only names the data; media-service reads it as the reader, so a run or file they cannot open is refused there.
 * Pasted data is checked here first and is never stored unless the reader saves it as a test sample.
 */
@Component({
  selector: 'app-report-source-picker',
  imports: [FormsModule, Segmented, RsTimePipe, UpperCasePipe, Icon],
  template: `
    <div class="flex flex-col gap-3">
      @if (modes().length > 1) { <div class="rs-source-modes"><app-segmented [options]="modes()" [(value)]="mode" ariaLabel="Where the data comes from" /></div> }
      @switch (mode()) {
        @case ('paste') {
          <label class="field">
            <span class="label">Paste {{ csv() ? 'CSV' : 'JSON' }}</span>
            <textarea class="input mono text-xs" rows="10" spellcheck="false" [ngModel]="text()" (ngModelChange)="text.set($event)"
                      [attr.aria-invalid]="!!pasteError() || null"
                      placeholder='{"period": "September 2026", "summary": {"total": 1240}, "rows": [ ... ]}'></textarea>
            <span class="block field-note text-[color:var(--text-muted)]">
              Read straight away and never stored, unless you save it as a test sample. At most 5 MB.
            </span>
            @if (text() && pasteError()) { <span class="block field-note text-[color:var(--crit-text)]" role="alert">{{ pasteError() }}</span> }
          </label>
          <label class="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" [ngModel]="csv()" (ngModelChange)="csv.set($event)" /> It is CSV (a header row, then rows)
          </label>
        }
        @case ('run') {
          @if (runsError()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ runsError() }}</p> }
          <label class="field">
            <span class="label">Pipeline schedule</span>
            <select class="input" [ngModel]="jobId()" (ngModelChange)="pickJob($event)" aria-label="Pipeline schedule">
              <option [ngValue]="null">Choose a schedule</option>
              @for (j of jobs(); track j.jobId) { <option [ngValue]="j.jobId">{{ j.label }}</option> }
            </select>
          </label>
          @if (jobId() !== null) {
            <label class="field">
              <span class="label">Run</span>
              <select class="input" [ngModel]="runId()" (ngModelChange)="pickRun($event)" aria-label="Run">
                <option [ngValue]="null">{{ runs().length ? 'Choose a run' : 'No runs yet' }}</option>
                @for (r of runs(); track r.jobQueueId) {
                  <option [ngValue]="r.jobQueueId">#{{ r.jobQueueId }} · {{ r.jobStatus || '—' }} · {{ r.startTime | rsTime: 'dateTime' }}</option>
                }
              </select>
            </label>
          }
          @if (runId() !== null) {
            <label class="field">
              <span class="label">Output</span>
              <select class="input" [ngModel]="datasetId()" (ngModelChange)="pickDataset($event)" aria-label="Output">
                <option [ngValue]="null">{{ outputs().length ? 'Choose an output' : 'This run kept no data a report can read' }}</option>
                @for (o of outputs(); track o.runOutputId) {
                  <option [ngValue]="o.runDatasetId">{{ o.stepKey ? o.stepKey + ' · ' : '' }}{{ o.name }} ({{ (o.format || 'data') | uppercase }}@if (o.rowCount != null) {, {{ o.rowCount }} rows})</option>
                }
              </select>
            </label>
          }
          @if (newerRun(); as newest) {
            <button type="button" class="link-inline text-sm self-start" (click)="useNewest()"><app-icon name="refresh" />Use a newer run (#{{ newest }})</button>
          }
          <p class="field-note text-[color:var(--text-muted)]">Read as you: a run you cannot open in Runs is refused.</p>
        }
        @case ('bucket') {
          <label class="field">
            <span class="label">Bucket</span>
            <select class="input" [ngModel]="bucket()" (ngModelChange)="bucket.set($event); publish()" aria-label="Bucket">
              <option value="">{{ buckets().length ? 'Choose a bucket' : 'No buckets you may browse' }}</option>
              @for (b of buckets(); track b.bucket) { <option [value]="b.bucket">{{ b.label || b.bucket }}</option> }
            </select>
          </label>
          <label class="field">
            <span class="label">File (JSON or CSV)</span>
            <input class="input mono" [ngModel]="key()" (ngModelChange)="key.set($event); publish()" aria-label="File key" placeholder="reference/quality_targets_2026.json" />
          </label>
          <p class="field-note text-[color:var(--text-muted)]">Read only, as you: a bucket or file you cannot open in Storage is refused.</p>
        }
        @case ('saved') {
          <label class="field">
            <span class="label">Uploaded or saved data</span>
            <select class="input" [ngModel]="sourceId()" (ngModelChange)="sourceId.set($event); publish()" aria-label="Saved data">
              <option [ngValue]="null">{{ saved().length ? 'Choose a source' : 'Nothing saved yet: upload on the Data tab' }}</option>
              @for (s of saved(); track s.sourceId) { <option [ngValue]="s.sourceId">{{ s.name }} ({{ s.format }})</option> }
            </select>
          </label>
        }
        @case ('sample') {
          <label class="field">
            <span class="label">Test sample</span>
            <select class="input" [ngModel]="sampleId()" (ngModelChange)="sampleId.set($event); publish()" aria-label="Test sample">
              <option [ngValue]="null">Choose a sample</option>
              @for (s of samples(); track s.sampleId) {
                <option [ngValue]="s.sampleId">{{ s.name }} · {{ s.kind === 'RUN_OUTPUT' ? 'run #' + s.jobQueueId : 'pasted' }}</option>
              }
            </select>
          </label>
        }
        @case ('bundle') {
          <div class="flex flex-col gap-3" role="group" aria-label="Several files">
            <p class="field-note text-[color:var(--text-muted)]">
              Each file is read as you and put side by side in one document: the report reads a file by its name ($.summary, $.latest[0]).
              CSV becomes rows. At most {{ maxParts }} files of at most 2,000 rows.
            </p>
            @for (p of parts(); track p.id; let i = $index) {
              <section class="rs-bundle-part" [attr.aria-label]="'File ' + (i + 1)">
                <div class="rs-bundle-head">
                  <label class="field flex-1 min-w-0">
                    <span class="label">File {{ i + 1 }} is called</span>
                    <input class="input mono" maxlength="64" [value]="p.name" [attr.aria-label]="'File ' + (i + 1) + ' name'" [placeholder]="i === 0 ? 'summary' : 'details'"
                           [attr.aria-invalid]="!!partNameProblem(p) || null" (change)="renamePart(i, $any($event.target).value)" />
                    @if (partNameProblem(p); as why) { <span class="block field-note text-[color:var(--crit-text)]">{{ why }}</span> }
                  </label>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove file ' + (i + 1)" [disabled]="parts().length === 1"
                          (click)="removePart(i)"><app-icon name="trash" /></button>
                </div>
                <app-report-source-picker [only]="partModes" [samples]="samples()" [tenantId]="tenantId()" [mode]="p.mode"
                                          (modeChange)="setPart(i, { mode: $event })" [source]="p.source" (sourceChange)="setPart(i, { source: $event })" />
              </section>
            }
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-default btn-sm" [disabled]="parts().length >= maxParts" (click)="addPart()">
                <app-icon name="plus" />Add a file
              </button>
              <span class="text-xs text-[color:var(--text-muted)]">{{ parts().length }} of {{ maxParts }}</span>
              @if (bundleWhy(); as why) { <span class="text-xs text-[color:var(--text-muted)]" role="status">{{ why }}</span> }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .rs-bundle-part { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); background: var(--surface-sunken); }
    .rs-bundle-head { display: flex; align-items: flex-end; gap: 0.5rem; }
  `,
})
export class ReportSourcePicker implements OnInit {
  private readonly generated = inject(GeneratedService);
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(StorageService);

  /** The template's saved test samples, when the picker is for a template. */
  readonly samples = input<SampleRow[]>([]);
  /** A platform administrator's chosen workspace: only its schedules are offered (their list holds every workspace's). */
  readonly tenantId = input<number | null>(null);
  /** The picked data, or null while nothing usable is picked. */
  readonly source = model<SourceRef | null>(null);

  readonly mode = model<Mode>('paste');
  /** Only these ways (the Data tab picks a run's output only); all by default. */
  readonly only = input<Mode[] | null>(null);
  readonly text = signal('');
  readonly csv = signal(false);
  private readonly allJobs = signal<{ jobId: number; label: string; tenantId?: number | null }[]>([]);
  readonly jobs = computed(() => this.allJobs().filter(j => !this.tenantId() || j.tenantId == null || j.tenantId === this.tenantId()));
  readonly runs = signal<RunRow[]>([]);
  readonly outputs = signal<RunOutput[]>([]);
  readonly saved = signal<DataSourceRow[]>([]);
  readonly runsError = signal('');
  readonly jobId = signal<number | null>(null);
  readonly runId = signal<number | null>(null);
  readonly datasetId = signal<number | null>(null);
  readonly sourceId = signal<string | null>(null);
  readonly sampleId = signal<string | null>(null);
  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly key = signal('');
  /** The schedule's newest run, when a run before it is picked ("Use a newer run"). */
  readonly newerRun = computed(() => {
    const newest = this.runs()[0]?.jobQueueId;
    return newest !== undefined && this.runId() !== null && newest !== this.runId() ? newest : null;
  });

  readonly modes = computed<SegmentOption<Mode>[]>(() => this.allModes().filter(m => !this.only() || this.only()!.includes(m.id)));
  private readonly allModes = computed<SegmentOption<Mode>[]>(() => [
    { id: 'paste', label: 'Paste JSON' },
    { id: 'run', label: 'Pipeline run' },
    { id: 'bucket', label: 'Bucket file' },
    ...(this.auth.canOpen('report-data') ? [{ id: 'saved' as Mode, label: 'Uploads' }] : []),
    ...(this.samples().length ? [{ id: 'sample' as Mode, label: `Samples (${this.samples().length})` }] : []),
    { id: 'bundle', label: 'Several files' },
  ]);

  // ---------------------------------------------------------------- several files (a BUNDLE, media 2026-10-20)

  readonly maxParts = BUNDLE_MAX_PARTS;
  readonly partModes = PART_MODES;
  private nextPart = 3;
  readonly parts = signal<BundleRow[]>([{ id: 1, name: '', mode: 'run', source: null }, { id: 2, name: '', mode: 'run', source: null }]);
  readonly bundleWhy = computed(() => bundleProblem(this.parts()));

  /** A name's own problem (empty, not a name, taken by another file), shown under it once it is written. */
  partNameProblem(p: BundleRow): string | null {
    const name = p.name.trim();
    if (!name) return null;
    if (!BUNDLE_PART_NAME.test(name)) return 'A letter, then letters, digits or _ (no spaces).';
    return this.parts().some(o => o.id !== p.id && o.name.trim() === name) ? 'Another file has this name.' : null;
  }

  addPart(): void {
    if (this.parts().length >= BUNDLE_MAX_PARTS) return;
    this.parts.update(list => [...list, { id: this.nextPart++, name: '', mode: 'run', source: null }]);
    this.publish();
  }

  removePart(i: number): void {
    if (this.parts().length <= 1) return;
    this.parts.update(list => list.filter((_, at) => at !== i));
    this.publish();
  }

  renamePart(i: number, name: string): void {
    this.setPart(i, { name: name.trim() });
  }

  setPart(i: number, change: Partial<BundleRow>): void {
    const row = this.parts()[i];
    if (!row) return;
    if (change.source !== undefined && JSON.stringify(change.source) === JSON.stringify(row.source)) delete change.source;
    if (change.mode !== undefined && change.mode === row.mode) delete change.mode;
    if (!Object.keys(change).length) return;
    this.parts.update(list => list.map((p, at) => (at === i ? { ...p, ...change } : p)));
    if (this.mode() === 'bundle') this.publish();
  }

  readonly pasteError = computed(() => {
    const t = this.text();
    if (new Blob([t]).size > PASTE_MAX_BYTES) return 'Pasted data is at most 5 MB; pick the pipeline run instead.';
    return this.csv() ? (t.trim() ? null : 'Paste some CSV first.') : jsonProblem(t);
  });

  constructor() {
    effect(() => {
      this.mode();
      this.text();
      this.csv();
      untracked(() => this.publish());
    });
    effect(() => {
      if (this.mode() === 'run' && !this.allJobs().length) untracked(() => this.loadJobs());
      if (this.mode() === 'saved' && !this.saved().length) untracked(() => this.loadSaved());
      if (this.mode() === 'bucket' && !this.buckets().length) untracked(() => this.loadBuckets());
    });
  }

  ngOnInit(): void {
    this.publish();
  }

  /** The current choice as a source, or null when it is not complete or not valid. */
  publish(): void {
    switch (this.mode()) {
      case 'paste':
        this.source.set(this.pasteError() ? null : { connector: 'INLINE_JSON', text: this.text(), format: this.csv() ? 'CSV' : 'JSON' });
        break;
      case 'run':
        this.source.set(this.runId() !== null && this.datasetId() !== null
          ? { connector: 'RUN_OUTPUT', jobQueueId: this.runId()!, runDatasetId: this.datasetId()! } : null);
        break;
      case 'saved':
        this.source.set(this.sourceId() ? { connector: 'SOURCE', sourceId: this.sourceId()! } : null);
        break;
      case 'bucket':
        this.source.set(this.bucket() && this.key().trim() ? { connector: 'BUCKET_OBJECT', bucket: this.bucket(), key: this.key().trim() } : null);
        break;
      case 'sample':
        this.source.set(this.sampleId() ? { connector: 'SAMPLE', sampleId: this.sampleId()! } : null);
        break;
      case 'bundle': {
        // Each file's picker publishes on every change; the same bundle again is not a new source (no second read).
        const bundle = bundleOf(this.parts());
        if (JSON.stringify(bundle) !== JSON.stringify(this.source())) this.source.set(bundle);
        break;
      }
    }
  }

  private loadJobs(): void {
    this.runsError.set('');
    this.generated.schedules().subscribe({
      next: all => this.allJobs.set(all.map(j => ({ jobId: j.jobId, tenantId: (j as { tenantId?: number | null }).tenantId, label: `${j.jobName ?? 'Schedule ' + j.jobId}${pipelineOf(j) ? ' · ' + pipelineOf(j) : ''}` }))),
      error: () => this.runsError.set('Your schedules could not be read (they need the Schedules or Runs pages).'),
    });
  }

  private loadBuckets(): void {
    this.storage.buckets().subscribe({
      next: r => this.buckets.set(r.status === API_SUCCESS ? (r.data ?? []) : []),
      error: () => this.buckets.set([]),
    });
  }

  /** "Use a newer run": the schedule's newest run, its output of the same name when it has one. */
  useNewest(): void {
    const newest = this.runs()[0];
    if (!newest) return;
    const name = this.outputs().find(o => o.runDatasetId === this.datasetId())?.name;
    this.pickRun(newest.jobQueueId, name ?? null);
  }

  private loadSaved(): void {
    this.api.sources().subscribe({ next: list => this.saved.set(list), error: () => this.saved.set([]) });
  }

  pickJob(jobId: number | null): void {
    this.jobId.set(jobId);
    this.runId.set(null);
    this.datasetId.set(null);
    this.runs.set([]);
    this.outputs.set([]);
    this.publish();
    if (jobId === null) return;
    this.generated.runs(jobId, 10).subscribe({ next: runs => this.runs.set(runs), error: () => this.runs.set([]) });
  }

  pickRun(runId: number | null, keepOutput: string | null = null): void {
    this.runId.set(runId);
    this.datasetId.set(null);
    this.outputs.set([]);
    this.publish();
    if (runId === null) return;
    this.generated.runOutputs(runId).subscribe({
      next: list => {
        const outputs = (list ?? []).filter(o => o.kind === 'file' && o.runDatasetId != null && !o.expired
          && DATA_FORMATS.has(String(o.format ?? '').toLowerCase()));
        this.outputs.set(outputs);
        const same = keepOutput ? outputs.find(o => o.name === keepOutput) : outputs.length === 1 ? outputs[0] : undefined;
        if (same?.runDatasetId != null) this.pickDataset(same.runDatasetId);
      },
      error: () => this.outputs.set([]),
    });
  }

  pickDataset(id: number | null): void {
    this.datasetId.set(id);
    this.publish();
  }
}
