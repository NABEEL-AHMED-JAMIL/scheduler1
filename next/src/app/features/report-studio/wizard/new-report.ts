import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, from, interval, of, switchMap } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { PageHeader } from '../../../shared/ui/page-header';
import { Crumb, crumbsFor } from '../../../core/nav/nav-tree';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { RsTimePipe } from '../rs-time.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { Pagination } from '../../../shared/ui/pagination';
import { PAGE_SIZES } from '../../../shared/ui/pager';
import {
  JobRow, Problem, ReportDetail, ReportVersionRow, SourceRef, TemplateDefinition, TemplateDetail, TemplateRow, chipWord, idempotencyKey,
  isRunning, stageWord,
} from '../report-studio.model';
import { ProblemList } from '../problem-list';
import { PdfPages } from '../pdf-pages';
import { AssetPicture } from '../assets/asset-picture';
import { UsableProfile } from '../assets.model';
import { componentsOf, innerPath, pagesOf, primaryNames, rootPathOf, walk } from '../designer/designer-model';
import { AppLoading, InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { DataMapping } from './data-mapping';
import { templateFields } from './template-fields';

type Step = 1 | 2 | 3 | 4;

/** A template field the report needs: the data contract's (or, with none, what the template binds). */
export interface NeededField { path: string; type: string; required: boolean; label?: string | null; }

/** The checks a preview runs, in the order the server runs them (spec section 22). */
const STAGES = ['SCHEMA', 'COMPONENTS', 'DATA_CONTRACT', 'BINDINGS', 'ASSETS', 'LAYOUT', 'RENDER'];
/** Each check's words, as the checks panel lists the passed ones (drawing 5). */
export const STAGE_WORDS: Record<string, string> = {
  SCHEMA: 'Template structure', COMPONENTS: 'Components', DATA_CONTRACT: 'Data contract', BINDINGS: 'Data fields',
  ASSETS: 'Images, signatures and stamps', LAYOUT: 'Layout and page breaks', RENDER: 'Renders as PDF and HTML',
};

/** The checks a list of problems passes: every stage with no problem, in order, in words. */
export function passedStages(problems: { stage?: string }[]): string[] {
  return STAGES.filter(s => !problems.some(p => p.stage === s)).map(s => STAGE_WORDS[s]);
}

/** The data's start for one report per row: "$[0]" (the preview's first row) is "$". */
export function eachBase(root: string): string {
  return root.replace(/\[\d+\]$/, '') || '$';
}

/** The words for a contract type. */
export function typeWords(type: string, rows: number | null = null): string {
  switch (type) {
    case 'string': return 'Text';
    case 'integer': return 'Whole number';
    case 'number': return 'Decimal';
    case 'boolean': return 'Yes or no';
    case 'date': return 'Date';
    case 'datetime': return 'Date and time';
    case 'array': return rows === null ? 'List' : `List · ${rows} row${rows === 1 ? '' : 's'}`;
    case 'object': return 'Group of fields';
    default: return type;
  }
}

/**
 * The fields a template needs: its data contract, or -- when it has none -- every path it binds (each required, since a
 * bound value the data lacks is an error), lists by their top-level path.
 */
export function neededFields(def: TemplateDefinition): NeededField[] {
  const t = def.template as { dataContract?: { fields?: NeededField[] } };
  if (t.dataContract?.fields?.length) return t.dataContract.fields.map(f => ({ ...f, required: !!f.required, type: f.type ?? 'string' }));
  const names = primaryNames(def);
  const out = new Map<string, NeededField>();
  walk(componentsOf(def), b => {
    for (const key of ['binding', 'dataset']) {
      const v = b[key];
      if (typeof v !== 'string') continue;
      const inner = innerPath(v, names);
      // A list's binding, and a label and value that reads a list (its first row's field, a filter, a count: QA 2026-10-20).
      const list = key === 'dataset' || b.type === 'list' || b.type === 'imageGrid' || (b.type === 'labelValue'
        && (!!b['field'] || !!b['filter'] || (b['format'] as { type?: string } | undefined)?.type === 'count'));
      if (inner && !out.has(inner)) out.set(inner, { path: inner, type: list ? 'array' : 'string', required: true });
    }
  });
  return [...out.values()];
}

/**
 * Create report (MIG-404, the owner-approved screens 4 and 5; page report-generate): Template, Data and mapping, Preview
 * and check, Generate. Data and mapping is its own component (wizard/data-mapping.ts, the redesign the owner approved on
 * 2026-10-27): the data first -- Generate again starts from the version's own frozen data and its kept mapping -- then
 * every field matched automatically and only what needs a person shown first. The preview is the PDF the report will be,
 * with the server's checks; generating makes a new version, never overwriting one (or, for data of many rows, one report
 * per row when the person asks for it).
 */
@Component({
  selector: 'app-new-report',
  imports: [PageHeader, Icon, StatusPill, RsTimePipe, FormsModule, RouterLink, ProblemList, PdfPages, WorkspaceSelect, Pagination,
    AssetPicture, AppLoading, InlineStatus, LoadError, BlurLoader, DataMapping],
  templateUrl: './new-report.html',
  styleUrl: './new-report.css',
})
export class NewReport implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  private readonly workspaces = inject(WorkspaceDirectory);
  /** The one workspace selector (owner #5), first in the header for a platform administrator. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());
  readonly step = signal<Step>(1);
  readonly templates = signal<TemplateRow[]>([]);
  readonly thumbs = signal<Record<string, string>>({});
  readonly search = signal('');
  readonly loadingTemplates = signal(true);
  /**
   * Owner 2026-10-27: step 1's own read. Its failure is said in its place with Try again (not as the top banner over
   * "No published template yet"), and a search or a page keeps the cards under a blur once they have come.
   */
  readonly templatesError = signal('');
  readonly templatesLoaded = signal(false);
  /** The template being opened (a card clicked, or ?templateId / ?reportId): the step says so until step 2. */
  readonly picking = signal(false);
  /** What Try again in the top banner asks again: the template or report read that failed. */
  private retryLast: (() => void) | null = null;
  readonly canRetry = signal(false);
  readonly error = signal('');
  readonly t = signal<TemplateDetail | null>(null);
  readonly def = signal<TemplateDefinition | null>(null);
  readonly report = signal<ReportDetail | null>(null);
  readonly failedJob = signal<JobRow | null>(null);
  readonly name = signal('');
  readonly source = signal<SourceRef | null>(null);
  readonly rootPath = signal('$');
  /** The mapping Data and mapping made: {field: path | {combine} | {value} | {blank}, "list[*].column": item field}. */
  readonly mapping = signal<Record<string, unknown>>({});
  /** Fields that still need a person (Data and mapping's "Needs you"). */
  readonly needCount = signal(0);
  /** One report per row: how many (0 for one report). */
  readonly eachRow = signal(0);
  readonly dataLabel = signal('');
  /** One report per row: every job queued, in row order. */
  readonly jobs = signal<JobRow[]>([]);
  readonly pdfUrl = signal<string | null>(null);
  readonly checking = signal(false);
  readonly checkError = signal('');
  readonly problems = signal<Problem[]>([]);
  readonly checkedAt = signal<Date | null>(null);
  readonly pages = signal<number | null>(null);
  readonly pdf = signal(true);
  readonly html = signal(true);
  readonly reason = signal('');
  /** Phase 4: "Mark this version as COPY" -- the version carries COPY on every page. */
  readonly markCopy = signal(false);
  readonly job = signal<JobRow | null>(null);
  /** A failed read of the job's progress (step 4): said, with Check again, instead of a bar stuck at its last state. */
  readonly pollError = signal('');
  /** The Brand profile choices (step 3): loading, or why they could not be read. */
  readonly profilesState = createLoadState(false);
  readonly generating = signal(false);
  readonly generateError = signal('');
  private readonly key = idempotencyKey();
  private poll?: Subscription;

  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  readonly typeWords = typeWords;
  readonly stepNames = ['Template', 'Data and mapping', 'Preview and check', 'Generate'];
  /** The trail names the step too (drawings 4 and 5): Reports › New report › Data and mapping. */
  readonly trail = computed<Crumb[]>(() => crumbsFor('/reports/new', this.report() ? 'Generate again' : 'New report', true));
  readonly stepCrumb = computed(() => this.stepNames[this.step() - 1] ?? '');

  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  /** Owner 2026-10-20: the published templates a page at a time, searched on the service (LIVE: has a published version). */
  readonly shown = computed(() => this.templates());
  readonly templateTotal = signal(0);
  readonly templatePage = signal(1);
  readonly templateSize = signal(PAGE_SIZES[0]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private templatesAsked = 0;
  readonly version = computed(() => this.t()?.currentPublishedVersion ?? null);
  // MIG-406: the Branding box -- the brand profile this report is made in (the template's, the workspace default's, or another).
  readonly profiles = signal<UsableProfile[]>([]);
  readonly brandProfileId = signal('');
  readonly brandOff = computed(() => !!((this.def()?.template as { branding?: { disabled?: boolean } } | undefined)?.branding?.disabled));
  readonly templateProfileId = computed(() => ((this.def()?.template as { branding?: { profileId?: string } } | undefined)?.branding?.profileId) ?? '');
  readonly brand = computed<UsableProfile | null>(() => {
    if (this.brandOff()) return null;
    const id = this.brandProfileId() || this.templateProfileId();
    return this.profiles().find(p => (id ? p.profileId === id : p.isDefault)) ?? null;
  });
  readonly canBrand = computed(() => this.auth.canOpen('report-assets'));
  readonly pageCount = computed(() => this.pages() ?? (this.def() ? pagesOf(componentsOf(this.def()!)).length : 0));
  readonly firstHeading = computed(() => (this.def() ? pagesOf(componentsOf(this.def()!))[0]?.title ?? '' : ''));
  /** Generate again starts from the report's current version: its frozen data and the mapping kept with it. */
  readonly baseVersion = computed<ReportVersionRow | null>(() => {
    const r = this.report();
    if (!r?.versions?.length) return null;
    return r.versions.find(v => v.version === r.currentVersion) ?? [...r.versions].sort((a, b) => b.version - a.version)[0];
  });
  /** The pipeline a version came from (a pipeline step's report), so "A newer run" starts on it. */
  private readonly lineage = computed(() => {
    for (const v of this.report()?.versions ?? []) {
      const p = v.config?.['pipeline'] as { jobId?: number; stepKey?: string } | undefined;
      if (p?.jobId) return { jobId: Number(p.jobId), stepKey: p.stepKey ?? null };
    }
    return null;
  });
  readonly pipelineJobId = computed(() => this.lineage()?.jobId ?? null);
  readonly pipelineStep = computed(() => this.lineage()?.stepKey ?? null);
  readonly platformAdmin = computed(() => this.auth.isPlatformAdmin());
  /** The definition as a list of one, so Data and mapping starts again when another template is picked. */
  readonly defs = computed(() => (this.def() ? [this.def()!] : []));
  /** How many data fields the template needs (Data and mapping's own count). */
  readonly fieldCount = computed(() => (this.def() ? templateFields(this.def()!).fields.length : 0));
  /** The page's title: the step, and on Generate again the report (drawing 1: "Generate again · RPT-0070"). */
  readonly title = computed(() => {
    const r = this.report();
    switch (this.step()) {
      case 2: return r ? `Generate again · ${r.label}` : `New report from “${this.t()?.name ?? ''}” v${this.version() ?? ''}`;
      case 3: return 'Check before you generate';
      case 4: return this.jobs().length > 1 ? 'Generating the reports' : 'Generating the report';
      default: return r ? `Generate ${r.name} again` : 'Create a report';
    }
  });
  readonly errors = computed(() => this.problems().filter(p => p.severity === 'ERROR'));
  readonly warnings = computed(() => this.problems().filter(p => p.severity === 'WARNING'));
  readonly passedChecks = computed(() => passedStages(this.problems()));
  readonly passed = computed(() => this.passedChecks().length);
  readonly nextVersion = computed(() => (this.report()?.currentVersion ?? 0) + 1);
  readonly blocked = computed(() => this.errors().length > 0 || this.needCount() > 0);

  constructor() {
    this.destroy.onDestroy(() => {
      this.poll?.unsubscribe();
      this.dropPdf();
      Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u));
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const reportId = q.get('reportId');
    const templateId = q.get('templateId');
    if (reportId) {
      this.prefillReport(reportId);
    } else if (templateId) {
      this.pick(templateId, true);
    }
    this.readTemplates();
  }

  /** Generate again from a report (?reportId): its name, its failed job and its template. */
  private prefillReport(reportId: string): void {
    this.picking.set(true);
    this.fail('', null);
    this.api.report(reportId).subscribe({
      next: r => {
        this.report.set(r);
        this.name.set(r.name);
        this.failedJob.set(r.jobs.find(j => j.status === 'FAILED' && j.jobId === r.jobs[0]?.jobId) ?? null);
        this.pick(r.templateId, true);
      },
      error: e => { this.picking.set(false); this.fail(studioError(e, 'The report could not be read.').message, () => this.prefillReport(reportId)); },
    });
  }

  /** The top banner's words, and what its Try again reads again (null: nothing to try again). */
  private fail(message: string, retry: (() => void) | null): void {
    this.error.set(message);
    this.retryLast = retry;
    this.canRetry.set(!!retry);
  }

  retryError(): void {
    const again = this.retryLast;
    if (again) again();
  }

  /** Step 1's cards: one page of the published templates, with the search, as the service answers it. */
  readTemplates(): void {
    this.loadingTemplates.set(true);
    this.templatesError.set('');
    const asked = ++this.templatesAsked;
    this.api.list({ state: 'LIVE', q: this.search(), limit: this.templateSize(), offset: (this.templatePage() - 1) * this.templateSize() },
      this.auth.isPlatformAdmin() ? this.tenantId() : null).subscribe({
      next: lib => {
        if (asked !== this.templatesAsked) return;
        this.loadingTemplates.set(false);
        this.templatesLoaded.set(true);
        this.templates.set(lib.templates);
        this.templateTotal.set(lib.total);
        lib.templates.forEach(t => { if (!this.thumbs()[t.templateId]) this.thumb(t.templateId); });
      },
      error: e => {
        if (asked !== this.templatesAsked) return;
        this.loadingTemplates.set(false);
        this.templatesError.set(studioError(e, 'The templates could not be read.').message);
      },
    });
  }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  searchTemplates(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.templatePage.set(1); this.readTemplates(); }, 300);
  }

  templatesGoTo(page: number): void { this.templatePage.set(page); this.readTemplates(); }
  templatesSize(size: number): void { this.templateSize.set(size); this.templatePage.set(1); this.readTemplates(); }

  private thumb(templateId: string): void {
    this.api.templateThumbnail(templateId).subscribe({
      next: r => { if (r.body && (r.headers.get('Content-Type') ?? '').includes('png')) this.thumbs.update(m => ({ ...m, [templateId]: URL.createObjectURL(r.body!) })); },
      error: () => { /* the card shows without its picture */ },
    });
  }

  /** Step 1: a published template picked; its newest published version is what the report is made from. */
  pick(templateId: string, jump = false): void {
    this.fail('', null);
    this.picking.set(true);
    const again = () => this.pick(templateId, jump);
    this.api.template(templateId).subscribe({
      next: t => {
        if (!t.currentPublishedVersion) { this.picking.set(false); this.fail(`${t.name} has no published version yet: publish it first.`, null); return; }
        this.t.set(t);
        if (!this.report()) this.name.set(this.name() || t.name);
        this.api.version(templateId, String(t.currentPublishedVersion)).subscribe({
          next: v => {
            this.picking.set(false);
            this.def.set(v.definition ?? null);
            this.loadProfiles(t.templateId);
            if (v.definition && !this.report()) this.rootPath.set(rootPathOf(v.definition));
            if (jump || this.step() === 1) this.go(2);
          },
          error: e => { this.picking.set(false); this.fail(studioError(e, 'The template version could not be read.').message, again); },
        });
      },
      error: e => { this.picking.set(false); this.fail(studioError(e, 'The template could not be read.').message, again); },
    });
  }

  /** The brand profiles this report may be made in (step 3's Brand profile). */
  loadProfiles(templateId = this.t()?.templateId ?? ''): void {
    if (!templateId) return;
    this.profilesState.start();
    this.api.usable(templateId).subscribe({
      next: u => { this.profiles.set(u.profiles); this.profilesState.done(); },
      error: e => this.profilesState.fail(e, 'The brand profiles could not be read.'),
    });
  }

  go(step: Step): void {
    if (step > 1 && !this.def()) return;
    this.step.set(step);
    if (step === 3) this.check();
  }

  // ---------------------------------------------------------------- step 3: preview and checks

  private body(): Record<string, unknown> {
    return {
      templateId: this.t()?.templateId, version: String(this.version()), source: this.source(), rootPath: this.rootPath().trim() || '$',
      mapping: this.mapping(), ...(this.brandProfileId() ? { brandProfileId: this.brandProfileId() } : {}),
    };
  }

  check(): void {
    if (!this.t() || !this.source()) return;
    this.checking.set(true);
    this.checkError.set('');
    this.dropPdf();
    this.api.previewHtml(this.body()).subscribe({
      next: r => {
        this.problems.set(r.problems ?? []);
        this.checkedAt.set(new Date());
        this.api.previewPdf(this.body()).subscribe({
          next: res => {
            this.checking.set(false);
            const blob = res.body;
            if (blob && (res.headers.get('Content-Type') ?? '').includes('pdf')) {
              this.pdfUrl.set(URL.createObjectURL(blob));
              const pages = Number(res.headers.get('X-Report-Pages'));
              this.pages.set(Number.isFinite(pages) && pages > 0 ? pages : null);
            } else {
              // Owner 2026-10-27: an answer without a PDF (the checks' problems instead) is said, not a spinner for ever.
              this.checkError.set(this.errors().length ? 'The PDF was not made: fix the problems the checks list, then check again.'
                : 'The PDF could not be made; check again.');
            }
          },
          error: e => { this.checking.set(false); this.checkError.set(studioError(e, 'The PDF could not be made.').message); },
        });
      },
      error: e => {
        this.checking.set(false);
        const err = studioError(e, 'The checks could not run.');
        this.checkError.set(err.message);
        if (err.problems.length) this.problems.set(err.problems);
      },
    });
  }

  private dropPdf(): void {
    const url = this.pdfUrl();
    if (url) URL.revokeObjectURL(url);
    this.pdfUrl.set(null);
  }

  // ---------------------------------------------------------------- step 4: generate

  generate(): void {
    const t = this.t();
    if (!t || !this.source() || this.blocked()) return;
    this.generating.set(true);
    this.generateError.set('');
    const formats = [...(this.pdf() ? ['PDF'] : []), ...(this.html() ? ['HTML'] : [])];
    const body: Record<string, unknown> = {
      ...this.body(), formats,
      ...(this.report() ? { reportId: this.report()!.reportId } : { name: this.name().trim() || t.name }),
      ...(this.reason().trim() ? { reason: this.reason().trim() } : {}),
      ...(this.markCopy() ? { markAsCopy: true } : {}),
    };
    if (this.eachRow() > 0 && !this.report()) { this.generateEach(body); return; }
    this.api.generate(body, this.key).subscribe({
      next: job => {
        this.generating.set(false);
        this.job.set(job);
        this.step.set(4);
        this.follow(job.jobId);
      },
      error: e => {
        this.generating.set(false);
        const err = studioError(e, 'The report could not be queued.');
        this.generateError.set(err.message);
        if (err.problems.length) this.problems.set(err.problems);
      },
    });
  }

  /**
   * One report per row: a report for each of the data's rows (at most 50), each its own job, named by its row. They are
   * queued one after another; the page follows all of them.
   */
  private generateEach(body: Record<string, unknown>): void {
    const n = this.eachRow();
    const base = eachBase(this.rootPath());
    const name = String(body['name'] ?? '');
    this.jobs.set([]);
    from(Array.from({ length: n }, (_, i) => i)).pipe(
      concatMap(i => this.api.generate({ ...body, rootPath: `${base}[${i}]`, name: `${name} · row ${i + 1}` }, `${this.key}-row-${i}`).pipe(
        map(job => ({ ok: true as const, job })), catchError(e => of({ ok: false as const, error: studioError(e, `Row ${i + 1} could not be queued.`).message })))),
      toArray(),
    ).subscribe(results => {
      this.generating.set(false);
      const jobs = results.filter((r): r is { ok: true; job: JobRow } => r.ok).map(r => r.job);
      const failed = results.find((r): r is { ok: false; error: string } => !r.ok);
      if (failed) this.generateError.set(failed.error);
      if (!jobs.length) return;
      this.jobs.set(jobs);
      this.job.set(jobs[0]);
      this.step.set(4);
      this.followAll();
    });
  }

  private followAll(): void {
    this.poll?.unsubscribe();
    this.pollError.set('');
    this.poll = interval(2000).pipe(switchMap(() => forkJoin(this.jobs().map(j => (isRunning(j.status) ? this.api.job(j.jobId) : of(j)))))).subscribe({
      next: jobs => {
        this.jobs.set(jobs);
        this.job.set(jobs[0]);
        if (!jobs.some(j => isRunning(j.status))) this.poll?.unsubscribe();
      },
      error: e => {
        this.poll?.unsubscribe();
        this.pollError.set(loadErrorText(e, 'The reports\' progress could not be read; they may still be running.'));
      },
    });
  }

  readonly jobsDone = computed(() => this.jobs().filter(j => !isRunning(j.status)).length);

  private follow(jobId: string): void {
    this.poll?.unsubscribe();
    this.pollError.set('');
    this.poll = interval(1500).pipe(switchMap(() => this.api.job(jobId))).subscribe({
      next: job => { this.job.set(job); if (!isRunning(job.status)) this.poll?.unsubscribe(); },
      error: e => {
        this.poll?.unsubscribe();
        this.pollError.set(loadErrorText(e, 'The job\'s progress could not be read; it may still be running.'));
      },
    });
  }

  /** Check again after a progress read failed. */
  checkJobAgain(): void {
    if (this.jobs().length > 1) { this.followAll(); return; }
    const j = this.job();
    if (j) this.follow(j.jobId);
  }

  /** Data and mapping's back: Generate again goes back to its report, a new report to the templates. */
  leaveMapping(): void {
    const r = this.report();
    if (r) void this.router.navigate(['/reports/library', r.reportId]);
    else this.step.set(1);
  }

  /** A platform administrator picked a workspace: its reports are in the library. */
  leave(): void {
    void this.router.navigate(['/reports/library']);
  }

  openReport(): void {
    const job = this.job();
    if (job) void this.router.navigate(['/reports/library', job.reportId]);
  }
}
