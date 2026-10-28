import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi, studioError } from '../../report-studio/report-studio.api';
import { SourceRef, TemplateDetail, TemplateRow } from '../../report-studio/report-studio.model';
import { StepsApi } from './steps.service';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';

/** The three settings this editor owns; the step's other settings stay in its form. */
export const REPORT_DESIGN_KEYS = ['design', 'templateId', 'templateVersion'];

/** The generate_report step's design settings as this editor writes them. */
export interface ReportDesignSettings { design: 'STEP' | 'TEMPLATE'; templateId?: string; templateVersion?: string; }

/**
 * Report Studio phase 5 (plan 1.11.1, owner 2026-10-19): where a generate_report step's report comes from.
 *
 * - **Design the report here** (the default): the step's own design, made from the step's data -- the upstream step's
 *   rows from the pipeline's latest run -- and opened in the full designer in a new tab (the pipeline being edited stays as
 *   it is). It is published like any template; the step runs its latest published version, or a pinned one. "Save as a
 *   template" copies it into the workspace's templates.
 * - **Use a saved template:** a published template of the workspace, and its version.
 */
@Component({
  selector: 'app-report-step-design',
  imports: [FormsModule, Icon, InlineStatus],
  template: `
    <div class="space-y-3" data-report-step-design>
      <div class="seg" role="radiogroup" aria-label="Where the report comes from">
        <button type="button" class="seg-btn" [class.seg-on]="mode() === 'STEP'"
                [disabled]="disabled()" (click)="setMode('STEP')" role="radio" [attr.aria-checked]="mode() === 'STEP'" data-mode-step>
          <app-icon name="edit" />Design the report here</button>
        <button type="button" class="seg-btn" [class.seg-on]="mode() === 'TEMPLATE'"
                [disabled]="disabled()" (click)="setMode('TEMPLATE')" role="radio" [attr.aria-checked]="mode() === 'TEMPLATE'" data-mode-template>
          <app-icon name="file" />Use a saved template</button>
      </div>

      @if (mode() === 'STEP') {
        @if (!pipelineKey()) {
          <p class="text-sm text-[color:var(--text-secondary)]" data-save-first>Save the pipeline first: its step's design belongs to it.</p>
        } @else if (designState.loading() || designState.error()) {
          <!-- Owner 2026-10-27: while the step's own design is read, or when it could not be, "Design the report" is not
               offered -- pressed then, it made the step a second design. -->
          <app-inline-status [loading]="designState.loading()" [error]="designState.error()" label="Loading the step's design…"
                             (retry)="retryDesign()" />
        } @else if (design(); as d) {
          <div class="rounded border border-[color:var(--border-subtle)] p-3 space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium">{{ d.name }}</span>
              @if (d.currentPublishedVersion) { <span class="pill pill-ok">Published v{{ d.currentPublishedVersion }}</span> }
              @else { <span class="pill pill-warn" data-not-published>Not published yet: the step cannot run it</span> }
              @if (d.hasDraft && d.currentPublishedVersion) { <span class="pill pill-neutral">Draft changes</span> }
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button type="button" class="btn btn-primary btn-sm" (click)="openDesigner()" data-open-designer>
                <app-icon name="external" />Open the designer</button>
              <button type="button" class="btn btn-default btn-sm" [disabled]="disabled() || saving()" (click)="askName(d)" data-save-as-template>
                <app-icon name="copy" />Save as a template</button>
            </div>
            @if (naming() !== null) {
              <div class="flex items-end gap-2 flex-wrap">
                <label class="field"><span class="label">Template name</span>
                  <input class="input max-w-80" maxlength="160" [ngModel]="naming()" (ngModelChange)="naming.set($event)" aria-label="Template name" data-template-name /></label>
                <button type="button" class="btn btn-primary btn-sm" [disabled]="!naming()?.trim() || saving()" (click)="saveAsTemplate()" data-save-template>
                  @if (saving()) { <span class="spinner"></span> }Save</button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="naming.set(null)">Cancel</button>
              </div>
            }
            <label class="field"><span class="label">Version the step runs</span>
              <select class="input max-w-72" [ngModel]="version()" (ngModelChange)="setVersion($event)" [disabled]="disabled()" aria-label="Version the step runs">
                <option value="latest">The latest published version</option>
                @for (v of publishedVersions(d); track v) { <option [value]="'' + v">Version {{ v }} (pinned)</option> }
              </select></label>
          </div>
        } @else {
          <p class="text-sm text-[color:var(--text-secondary)]">
            The designer opens with {{ upstreamKey() ? 'the rows of step ' + upstreamKey() : 'the step\\'s data' }} from the pipeline's latest run
            @if (!jobIds().length) { -- this pipeline has no run yet: paste sample JSON in the designer's Test data instead. }
          </p>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="disabled() || opening()" (click)="createDesign()" data-design-report>
            @if (opening()) { <span class="spinner"></span> } @else { <app-icon name="edit" /> }Design the report</button>
        }
      } @else {
        <label class="field"><span class="label">Template</span>
          <select class="input" [ngModel]="templateId() ?? ''" (ngModelChange)="pickTemplate($event)" [disabled]="disabled()" aria-label="Template" data-template-pick>
            <option value="">{{ templatesState.pending() ? 'Loading templates…' : 'Pick a published template' }}</option>
            @for (t of templates(); track t.templateId) { <option [value]="t.templateId">{{ t.name }} · v{{ t.currentPublishedVersion }}</option> }
          </select></label>
        <app-inline-status [loading]="templatesState.loading()" [error]="templatesState.error()" label="Loading templates…"
                           [empty]="templatesState.loaded() && !templates().length" emptyText="No published template yet."
                           (retry)="loadTemplates()" />
        @if (templateId()) {
          <label class="field"><span class="label">Version</span>
            <select class="input max-w-72" [ngModel]="version()" (ngModelChange)="setVersion($event)" [disabled]="disabled()" aria-label="Template version">
              <option value="latest">The latest published version</option>
              @for (v of pickedVersions(); track v) { <option [value]="'' + v">Version {{ v }} (pinned)</option> }
            </select></label>
        }
      }
      @if (problem() && !(mode() === 'STEP' ? design() : templateId())) {
        <p class="step-notice step-notice-crit text-sm" role="alert" data-design-problem>{{ problem() }}</p>
      }
      @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
    </div>
  `,
})
export class ReportStepDesign implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly steps = inject(StepsApi);
  private readonly toast = inject(ToastService);

  /** The step's settings (only design, templateId and templateVersion are read). */
  readonly config = input<Record<string, unknown>>({});
  /** The pipeline's key; null while it was never saved. */
  readonly pipelineKey = input<number | null>(null);
  readonly pipelineName = input('');
  readonly stepKey = input('');
  readonly stepName = input('');
  /** The step whose rows the report reads (the one before it, or the one its input names). */
  readonly upstreamKey = input<string | null>(null);
  /** The pipeline's schedules: their latest run is the step's data. */
  readonly jobIds = input<number[]>([]);
  readonly disabled = input(false);
  /** ZT-R40: the server's problem with the design settings (a report step with no design yet), shown here until one is picked. */
  readonly problem = input('');
  /** The design settings changed (merged into the step's settings by the panel). */
  readonly changed = output<ReportDesignSettings>();

  readonly design = signal<TemplateDetail | null>(null);
  readonly templates = signal<TemplateRow[]>([]);
  readonly opening = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  /** Owner 2026-10-27: the reads of the step's design and of the published templates, each with its own state. */
  readonly designState = createLoadState(false);
  readonly templatesState = createLoadState(false);
  /** The name typed for "Save as a template"; null while not asked. */
  readonly naming = signal<string | null>(null);
  private readonly modeOverride = signal<'STEP' | 'TEMPLATE' | null>(null);

  readonly mode = computed(() => this.modeOverride() ?? (this.config()['design'] === 'TEMPLATE' ? 'TEMPLATE' : 'STEP'));
  readonly templateId = computed(() => (this.config()['templateId'] as string | undefined) ?? null);
  readonly version = computed(() => String(this.config()['templateVersion'] ?? 'latest'));
  readonly pickedVersions = computed(() => {
    const t = this.templates().find(x => x.templateId === this.templateId());
    return t?.currentPublishedVersion ? Array.from({ length: t.currentPublishedVersion }, (_, i) => t.currentPublishedVersion! - i) : [];
  });

  ngOnInit(): void {
    if (this.mode() === 'STEP' && this.templateId()) this.loadDesign(this.templateId()!);
    if (this.mode() === 'TEMPLATE') this.loadTemplates();
  }

  publishedVersions(d: TemplateDetail): number[] {
    return d.versions.filter(v => v.state !== 'DRAFT').map(v => v.version).sort((a, b) => b - a);
  }

  setMode(m: 'STEP' | 'TEMPLATE'): void {
    if (m === this.mode()) return;
    this.modeOverride.set(m);
    this.error.set('');
    if (m === 'TEMPLATE') {
      this.loadTemplates();
      this.changed.emit({ design: 'TEMPLATE', templateId: undefined, templateVersion: 'latest' });
    } else {
      this.design.set(null);
      this.changed.emit({ design: 'STEP', templateId: undefined, templateVersion: 'latest' });
    }
  }

  pickTemplate(id: string): void {
    this.changed.emit({ design: 'TEMPLATE', templateId: id || undefined, templateVersion: 'latest' });
  }

  setVersion(v: string): void {
    this.changed.emit({ design: this.mode(), templateId: this.templateId() ?? undefined, templateVersion: v || 'latest' });
  }

  /** The step's design, seeded from its data, then opened in the designer. */
  createDesign(): void {
    const key = this.pipelineKey();
    if (!key) return;
    this.opening.set(true);
    this.error.set('');
    this.seed().pipe(
      switchMap(source => this.api.stepDesign({ jobId: key, stepKey: this.stepKey(), pipelineName: this.pipelineName(), stepName: this.stepName(),
        source })),
    ).subscribe({
      next: d => {
        this.opening.set(false);
        this.design.set(d);
        this.changed.emit({ design: 'STEP', templateId: d.templateId, templateVersion: 'latest' });
        this.openDesigner();
      },
      error: e => { this.opening.set(false); this.error.set(studioError(e, 'The step\'s design could not be made.').message); },
    });
  }

  /** The upstream step's rows from the newest run of any of the pipeline's schedules; null when there is none. */
  seed(): Observable<SourceRef | null> {
    const upstream = this.upstreamKey();
    const jobs = this.jobIds();
    if (!upstream || !jobs.length) return of(null);
    return forkJoin(jobs.map(id => this.steps.runs(id, 1).pipe(map(r => r.data?.jobQueues ?? []), catchError(() => of([]))))).pipe(
      map(lists => lists.flat().reduce<number | null>((max, r) => (max === null || r.jobQueueId > max ? r.jobQueueId : max), null)),
      switchMap(run => run === null ? of(null) : this.steps.timeline(run).pipe(
        map(t => {
          const step = (t.data?.steps ?? []).find(s => s.key === upstream);
          const dataset = step?.datasets?.[0];
          return dataset ? ({ connector: 'RUN_OUTPUT', jobQueueId: run, runDatasetId: dataset.runDatasetId } as SourceRef) : null;
        }),
        catchError(() => of(null)))),
    );
  }

  openDesigner(): void {
    const d = this.design() ?? (this.templateId() ? { templateId: this.templateId()! } : null);
    if (!d) return;
    const back = typeof location === 'undefined' ? '' : location.pathname + location.search;
    // ZT-R39: the pipeline's schedules go with it, so the designer's Test data offers this step's input rows from recent runs.
    const jobs = this.jobIds().length ? `&jobs=${this.jobIds().join(',')}` : '';
    window.open(`/reports/templates/${encodeURIComponent(d.templateId)}/design?step=${encodeURIComponent(this.stepKey())}${jobs}`
      + `&back=${encodeURIComponent(back)}`, '_blank', 'noopener');
  }

  /** The name a saved template starts with: the design's, without its "(step design)". */
  askName(d: TemplateDetail): void {
    this.naming.set(d.name.replace(/ \(step design\)$/, ''));
  }

  /** "Save this design as a template": a copy among the workspace's templates; the step keeps its own design. */
  saveAsTemplate(): void {
    const d = this.design();
    const name = this.naming()?.trim();
    if (!d || !name) return;
    this.saving.set(true);
    this.api.create({ from: 'COPY', name, copyOf: { templateId: d.templateId } }).subscribe({
      next: t => { this.saving.set(false); this.naming.set(null); this.toast.success(`Saved as the template ${t.name}.`); },
      error: e => { this.saving.set(false); this.toast.error(studioError(e).message); },
    });
  }

  retryDesign(): void {
    const id = this.templateId();
    if (id) this.loadDesign(id);
  }

  private loadDesign(id: string): void {
    this.designState.start();
    this.api.template(id).subscribe({
      next: d => { this.design.set(d); this.designState.done(); },
      error: e => this.designState.fail(studioError(e, 'The step\'s design could not be read.').message, 'The step\'s design could not be read.'),
    });
  }

  loadTemplates(): void {
    this.templatesState.start();
    this.api.list({ state: 'LIVE', limit: 200 }).subscribe({
      next: l => { this.templates.set(l.templates); this.templatesState.done(); },
      error: e => this.templatesState.fail(studioError(e, 'The templates could not be read.').message, 'The templates could not be read.'),
    });
  }
}
