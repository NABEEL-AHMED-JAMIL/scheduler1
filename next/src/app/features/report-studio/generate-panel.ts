import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval, switchMap } from 'rxjs';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import { JobRow, Problem, SampleRow, SourceRef, TemplateRow, idempotencyKey, isRunning, stageWord } from './report-studio.model';
import { ReportSourcePicker } from './source-picker';

export interface GeneratePanelData {
  /** A template already chosen (its page), or null to pick one of the published ones. */
  templateId?: string | null;
  /** A new version of this report (Generate again). */
  reportId?: string | null;
  reportName?: string | null;
  samples?: SampleRow[];
}

/**
 * Generate a report (spec section 15): a published template version, data the reader may read -- a pipeline run's output,
 * pasted JSON, an upload, a test sample -- frozen as the version's snapshot, then rendered by a job whose stages show
 * here as they happen. Generating again makes the next version of the same report; nothing is overwritten, and a job
 * that fails makes no version. One click is one job (an idempotency key per open panel).
 */
@Component({
  selector: 'app-report-generate-panel',
  imports: [SidePanel, Icon, FormsModule, ReportSourcePicker, ProblemList],
  template: `
    <app-side-panel [heading]="data.reportId ? 'Generate again: ' + (data.reportName || 'report') : 'Generate a report'"
                    subtitle="A new version from a published template and the data you pick. Earlier versions are kept.">
      @if (!job()) {
        <div class="flex flex-col gap-5">
          @if (!data.templateId && !data.reportId) {
            <label class="field">
              <span class="label">Template</span>
              <select class="input" [ngModel]="templateId()" (ngModelChange)="templateId.set($event)" aria-label="Template">
                <option [ngValue]="null">{{ published().length ? 'Choose a published template' : 'No template is published yet' }}</option>
                @for (t of published(); track t.templateId) { <option [ngValue]="t.templateId">{{ t.name }} · v{{ t.currentPublishedVersion }}</option> }
              </select>
            </label>
          }
          <section class="flex flex-col gap-3" aria-labelledby="rsGenData">
            <h3 id="rsGenData" class="text-sm font-semibold">Data</h3>
            <app-report-source-picker [samples]="data.samples || []" [(source)]="source" />
            <label class="field">
              <span class="label">Report data starts at</span>
              <input class="input mono max-w-80" [ngModel]="rootPath()" (ngModelChange)="rootPath.set($event)" aria-label="Root path" placeholder="$" />
            </label>
          </section>
          @if (!data.reportId) {
            <label class="field">
              <span class="label">Report name</span>
              <input class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" aria-label="Report name"
                     placeholder="Monthly quality report · September 2026" />
              <span class="block field-note text-[color:var(--text-muted)]">Left empty, the template's name (and the run's number).</span>
            </label>
          }
          <fieldset class="field">
            <legend class="label">Files</legend>
            <div class="flex gap-4 text-sm">
              <label class="inline-flex items-center gap-2"><input type="checkbox" [ngModel]="pdf()" (ngModelChange)="pdf.set($event)" />PDF</label>
              <label class="inline-flex items-center gap-2"><input type="checkbox" [ngModel]="html()" (ngModelChange)="html.set($event)" />HTML</label>
            </div>
          </fieldset>
          <label class="field">
            <span class="label">Why (optional)</span>
            <input class="input" [ngModel]="reason()" (ngModelChange)="reason.set($event)" aria-label="Reason"
                   placeholder="Corrected target mapping" />
          </label>
          @if (error()) {
            <div class="flex flex-col gap-2" role="alert">
              <p class="field-note text-[color:var(--crit-text)]">{{ error() }}</p>
              @if (problems().length) { <app-report-problems [problems]="problems()" /> }
            </div>
          }
        </div>
      } @else {
        <div class="flex flex-col gap-4" aria-live="polite">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ job()!.label }}</span>
            <span class="text-sm text-[color:var(--text-muted)]">{{ job()!.reportLabel }} · {{ job()!.reportName }}</span>
          </div>
          <div class="rs-progress" role="progressbar" [attr.aria-valuenow]="job()!.progressPct" aria-valuemin="0" aria-valuemax="100"
               [attr.aria-label]="stage()"><i [style.width.%]="job()!.progressPct"></i></div>
          <p class="text-sm">{{ stage() }} · {{ job()!.progressPct }}%</p>
          @if (job()!.status === 'FAILED') {
            <p class="text-sm text-[color:var(--crit-text)]" role="alert">{{ job()!.error }} No report version was made.</p>
            <app-report-problems [problems]="job()!.diagnostics || []" />
          }
          @if (job()!.status === 'SUCCEEDED') {
            <p class="text-sm text-[color:var(--ok-text)]">Version {{ job()!.resultVersion }} is ready@if (job()!.pages) { ({{ job()!.pages }} page{{ job()!.pages === 1 ? '' : 's' }}) }.</p>
          }
        </div>
      }
      <div foot class="flex justify-end gap-2">
        @if (!job()) {
          <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !ready()" (click)="generate()">
            <app-icon name="play" />Generate
          </button>
        } @else {
          @if (running()) {
            <button type="button" class="btn btn-default btn-sm" (click)="cancel()"><app-icon name="stop" />Cancel the job</button>
          }
          <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
          @if (job()!.status === 'SUCCEEDED' || job()!.status === 'FAILED') {
            <button type="button" class="btn btn-primary btn-sm" (click)="open()"><app-icon name="arrowRight" />Open the report</button>
          }
        }
      </div>
    </app-side-panel>
  `,
  styles: `
    .rs-progress { height: 0.5rem; border-radius: var(--radius-full); background: var(--surface-sunken); overflow: hidden; }
    .rs-progress > i { display: block; height: 100%; background: var(--accent-mark-strong); transition: width 300ms ease; }
  `,
})
export class GeneratePanel implements OnInit {
  readonly data = inject<GeneratePanelData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<string | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  readonly published = signal<TemplateRow[]>([]);
  readonly templateId = signal<string | null>(null);
  readonly source = signal<SourceRef | null>(null);
  readonly rootPath = signal('$');
  readonly name = signal('');
  readonly pdf = signal(true);
  readonly html = signal(true);
  readonly reason = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = signal<Problem[]>([]);
  readonly job = signal<JobRow | null>(null);
  private readonly key = idempotencyKey();
  private poll?: Subscription;

  readonly running = computed(() => isRunning(this.job()?.status));
  readonly stage = computed(() => stageWord(this.job()?.status));
  readonly ready = computed(() => !!this.source() && (this.pdf() || this.html())
    && (!!this.data.templateId || !!this.data.reportId || !!this.templateId()));

  ngOnInit(): void {
    if (!this.data.templateId && !this.data.reportId) {
      this.api.list().subscribe({
        next: lib => this.published.set(lib.templates.filter(t => t.currentPublishedVersion != null && t.status !== 'ARCHIVED')),
        error: () => this.published.set([]),
      });
    }
    this.destroy.onDestroy(() => this.poll?.unsubscribe());
  }

  generate(): void {
    this.busy.set(true);
    this.error.set('');
    this.problems.set([]);
    const formats = [...(this.pdf() ? ['PDF'] : []), ...(this.html() ? ['HTML'] : [])];
    const body: Record<string, unknown> = {
      source: this.source(), rootPath: this.rootPath().trim() || '$', formats,
      ...(this.reason().trim() ? { reason: this.reason().trim() } : {}),
      ...(this.data.reportId ? { reportId: this.data.reportId } : { templateId: this.data.templateId ?? this.templateId() }),
      ...(this.name().trim() ? { name: this.name().trim() } : {}),
    };
    this.api.generate(body, this.key).subscribe({
      next: job => {
        this.busy.set(false);
        this.job.set(job);
        this.follow(job.jobId);
      },
      error: e => {
        this.busy.set(false);
        const err = studioError(e, 'The report could not be queued.');
        this.error.set(err.message);
        this.problems.set(err.problems);
      },
    });
  }

  /** The job's stages as it moves through them: every two seconds until it ends. */
  private follow(jobId: string): void {
    this.poll?.unsubscribe();
    this.poll = interval(2000).pipe(switchMap(() => this.api.job(jobId))).subscribe({
      next: job => {
        this.job.set(job);
        if (!isRunning(job.status)) this.poll?.unsubscribe();
      },
      error: () => this.poll?.unsubscribe(),
    });
  }

  cancel(): void {
    const job = this.job();
    if (!job) return;
    this.api.cancelJob(job.jobId).subscribe({ next: j => this.job.set(j), error: () => { /* the poll shows what happened */ } });
  }

  open(): void {
    const job = this.job();
    if (!job) return;
    this.ref.close(job.reportId);
    void this.router.navigate(['/reports/library', job.reportId]);
  }
}
