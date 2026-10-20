import { Component, OnInit, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { AuthService } from '../../core/auth/auth.service';
import { GeneratedService, pipelineOf } from '../documents/generated/generated.service';
import { RunOutput } from '../jobs/run-steps/run-steps.model';
import { RunRow } from '../tasks/steps/steps.model';
import { ReportStudioApi } from './report-studio.api';
import { DataSourceRow, PASTE_MAX_BYTES, SampleRow, SourceRef, jsonProblem } from './report-studio.model';

export type SourceMode = 'paste' | 'run' | 'saved' | 'sample';
type Mode = SourceMode;

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
  imports: [FormsModule, Segmented, ServerTimePipe, UpperCasePipe],
  template: `
    <div class="flex flex-col gap-3">
      @if (modes().length > 1) { <app-segmented [options]="modes()" [(value)]="mode" ariaLabel="Where the data comes from" /> }
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
                  <option [ngValue]="r.jobQueueId">#{{ r.jobQueueId }} · {{ r.jobStatus || '—' }} · {{ r.startTime | serverTime: 'dateTime' }}</option>
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
          <p class="field-note text-[color:var(--text-muted)]">Read as you: a run you cannot open in Runs is refused.</p>
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
      }
    </div>
  `,
})
export class ReportSourcePicker implements OnInit {
  private readonly generated = inject(GeneratedService);
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);

  /** The template's saved test samples, when the picker is for a template. */
  readonly samples = input<SampleRow[]>([]);
  /** The picked data, or null while nothing usable is picked. */
  readonly source = model<SourceRef | null>(null);

  readonly mode = model<Mode>('paste');
  /** Only these ways (the Data tab picks a run's output only); all by default. */
  readonly only = input<Mode[] | null>(null);
  readonly text = signal('');
  readonly csv = signal(false);
  readonly jobs = signal<{ jobId: number; label: string }[]>([]);
  readonly runs = signal<RunRow[]>([]);
  readonly outputs = signal<RunOutput[]>([]);
  readonly saved = signal<DataSourceRow[]>([]);
  readonly runsError = signal('');
  readonly jobId = signal<number | null>(null);
  readonly runId = signal<number | null>(null);
  readonly datasetId = signal<number | null>(null);
  readonly sourceId = signal<string | null>(null);
  readonly sampleId = signal<string | null>(null);

  readonly modes = computed<SegmentOption<Mode>[]>(() => this.allModes().filter(m => !this.only() || this.only()!.includes(m.id)));
  private readonly allModes = computed<SegmentOption<Mode>[]>(() => [
    { id: 'paste', label: 'Paste JSON' },
    { id: 'run', label: 'Pipeline run' },
    ...(this.auth.canOpen('report-data') ? [{ id: 'saved' as Mode, label: 'Uploads' }] : []),
    ...(this.samples().length ? [{ id: 'sample' as Mode, label: `Samples (${this.samples().length})` }] : []),
  ]);

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
      if (this.mode() === 'run' && !this.jobs().length) untracked(() => this.loadJobs());
      if (this.mode() === 'saved' && !this.saved().length) untracked(() => this.loadSaved());
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
      case 'sample':
        this.source.set(this.sampleId() ? { connector: 'SAMPLE', sampleId: this.sampleId()! } : null);
        break;
    }
  }

  private loadJobs(): void {
    this.runsError.set('');
    this.generated.schedules().subscribe({
      next: all => this.jobs.set(all.map(j => ({ jobId: j.jobId, label: `${j.jobName ?? 'Schedule ' + j.jobId}${pipelineOf(j) ? ' · ' + pipelineOf(j) : ''}` }))),
      error: () => this.runsError.set('Your schedules could not be read (they need the Schedules or Runs pages).'),
    });
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

  pickRun(runId: number | null): void {
    this.runId.set(runId);
    this.datasetId.set(null);
    this.outputs.set([]);
    this.publish();
    if (runId === null) return;
    this.generated.runOutputs(runId).subscribe({
      next: list => this.outputs.set((list ?? []).filter(o => o.kind === 'file' && o.runDatasetId != null && !o.expired
        && DATA_FORMATS.has(String(o.format ?? '').toLowerCase()))),
      error: () => this.outputs.set([]),
    });
  }

  pickDataset(id: number | null): void {
    this.datasetId.set(id);
    this.publish();
  }
}
