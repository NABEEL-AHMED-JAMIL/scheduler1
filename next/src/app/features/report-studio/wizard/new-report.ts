import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, interval, switchMap } from 'rxjs';
import { PageHeader } from '../../../shared/ui/page-header';
import { Crumb, crumbsFor } from '../../../core/nav/nav-tree';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { RsTimePipe } from '../rs-time.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from '../report-studio.api';
import {
  InspectResult, JobRow, Problem, ReportDetail, SchemaField, SourceRef, TemplateDefinition, TemplateDetail, TemplateRow, chipWord, idempotencyKey,
  bundleParts, isRunning, stageWord,
} from '../report-studio.model';
import { ReportSourcePicker, SourceMode } from '../source-picker';
import { ProblemList } from '../problem-list';
import { PdfPages } from '../pdf-pages';
import { AssetPicture } from '../assets/asset-picture';
import { UsableProfile } from '../assets.model';
import {
  collections, componentsOf, firstRecord, innerPath, itemFields, lengthAt, pagesOf, primaryNames, rootPathOf, sampleText, scalars, valueAt, walk,
} from '../designer/designer-model';

type Step = 1 | 2 | 3 | 4;
type SourceView = 'sample' | 'schema' | 'json';

/** A template field the report needs: the data contract's (or, with none, what the template binds). */
export interface NeededField { path: string; type: string; required: boolean; label?: string | null; }

/** One row of the matching table: the field, the source path chosen for it, a sample, and whether it is matched. */
export interface MatchRow {
  field: NeededField;
  source: string;
  sample: string;
  state: 'matched' | 'missing' | 'optional';
  options: SchemaField[];
  feeds: { label: string; columns: { field: string; ok: boolean }[] }[];
}

/** The checks a preview runs, in the order the server runs them (spec section 22). */
const STAGES = ['SCHEMA', 'COMPONENTS', 'DATA_CONTRACT', 'BINDINGS', 'ASSETS', 'LAYOUT', 'RENDER'];

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
 * and check, Generate. The data is a pipeline run's output, a bucket file, an upload or pasted JSON, read as the person;
 * every required template field is matched to a path in it -- a field the data names the same way is matched as it is,
 * nothing is guessed, and a required field with no source blocks generating. The preview is the PDF the report will be,
 * with the server's checks; generating makes a new version, never overwriting one.
 */
@Component({
  selector: 'app-new-report',
  imports: [PageHeader, Icon, StatusPill, RsTimePipe, FormsModule, RouterLink, ReportSourcePicker, ProblemList, PdfPages, WorkspaceSelect,
    AssetPicture],
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
  readonly error = signal('');
  readonly t = signal<TemplateDetail | null>(null);
  readonly def = signal<TemplateDefinition | null>(null);
  readonly report = signal<ReportDetail | null>(null);
  readonly failedJob = signal<JobRow | null>(null);
  readonly name = signal('');
  readonly source = signal<SourceRef | null>(null);
  readonly sourceMode = signal<SourceMode>('run');
  readonly rootPath = signal('$');
  readonly inspect = signal<InspectResult | null>(null);
  readonly inspecting = signal(false);
  readonly inspectError = signal('');
  readonly view = signal<SourceView>('sample');
  /** Several files' parts by name, as the read names them (media's label). */
  readonly bundleParts = bundleParts;
  readonly mapping = signal<Record<string, string>>({});
  readonly pdfUrl = signal<string | null>(null);
  readonly checking = signal(false);
  readonly checkError = signal('');
  readonly problems = signal<Problem[]>([]);
  readonly checkedAt = signal<Date | null>(null);
  readonly pages = signal<number | null>(null);
  readonly pdf = signal(true);
  readonly html = signal(true);
  readonly reason = signal('');
  readonly job = signal<JobRow | null>(null);
  readonly generating = signal(false);
  readonly generateError = signal('');
  private readonly key = idempotencyKey();
  private poll?: Subscription;

  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  readonly typeWords = typeWords;
  isNumber(v: unknown): boolean { return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))); }
  readonly stepNames = ['Template', 'Data and mapping', 'Preview and check', 'Generate'];
  /** The trail names the step too (drawings 4 and 5): Reports › New report › Data and mapping. */
  readonly trail = computed<Crumb[]>(() => crumbsFor('/reports/new', this.report() ? 'Generate again' : 'New report', true));
  readonly stepCrumb = computed(() => this.stepNames[this.step() - 1] ?? '');

  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.templates().filter(t => !q || [t.name, t.description, t.category].some(v => (v ?? '').toLowerCase().includes(q)));
  });
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
  readonly needed = computed<NeededField[]>(() => (this.def() ? neededFields(this.def()!) : []));
  readonly schema = computed<SchemaField[]>(() => this.inspect()?.schema ?? []);
  readonly sample = computed(() => firstRecord(this.inspect()));
  readonly pageCount = computed(() => this.pages() ?? (this.def() ? pagesOf(componentsOf(this.def()!)).length : 0));
  readonly firstHeading = computed(() => (this.def() ? pagesOf(componentsOf(this.def()!))[0]?.title ?? '' : ''));
  readonly sampleRows = computed(() => {
    const s = this.inspect()?.sample;
    return Array.isArray(s) ? s.slice(0, 100) : s ? [s] : [];
  });
  readonly sampleText = computed(() => JSON.stringify(this.inspect()?.sample ?? null, null, 2));
  /** The first list in the data, shown as a table under the sample's single values ("What the run produced"). */
  readonly sampleTable = computed(() => {
    const list = collections(this.schema())[0];
    if (!list) return null;
    const rows = valueAt(this.sample(), list.path);
    if (!Array.isArray(rows)) return null;
    const cols = itemFields(this.schema(), list.path).filter(f => !/object|list|array/i.test(f.type)).slice(0, 6).map(f => f.path);
    return { path: list.path, cols, rows: rows.slice(0, 8).map(r => cols.map(c => sampleText(valueAt(r, c)))) };
  });
  readonly sampleScalars = computed(() => scalars(this.schema()).slice(0, 12).map(f => ({ path: f.path, value: sampleText(valueAt(this.sample(), f.path)) })));

  readonly rows = computed<MatchRow[]>(() => {
    const schema = this.schema();
    const has = new Set(schema.map(f => f.path));
    const map = this.mapping();
    const def = this.def();
    const names = def ? primaryNames(def) : [];
    return this.needed().map(field => {
      const list = field.type === 'array';
      const source = map[field.path] ?? '';
      const found = !!source && has.has(source);
      const v = found ? valueAt(this.sample(), source) : undefined;
      const n = found && list ? lengthAt(this.inspect()?.tree, source) ?? (Array.isArray(v) ? v.length : null) : null;
      const feeds: MatchRow['feeds'] = [];
      if (list && def) {
        walk(componentsOf(def), b => {
          if (b.type !== 'table' || typeof b['dataset'] !== 'string' || innerPath(b['dataset'] as string, names) !== field.path) return;
          const items = new Set(itemFields(schema, source).map(f => f.path));
          feeds.push({ label: String(b['title'] ?? b['name'] ?? 'a table'),
            columns: ((b['columns'] ?? []) as { field: string }[]).map(c => ({ field: c.field, ok: !found || items.has(c.field) })) });
        });
      }
      return {
        field, source, sample: !found ? '' : list ? `${n ?? '?'} row${n === 1 ? '' : 's'}` : sampleText(v),
        state: found ? 'matched' : field.required ? 'missing' : 'optional',
        options: list ? collections(schema) : scalars(schema), feeds,
      } as MatchRow;
    });
  });
  readonly matched = computed(() => this.rows().filter(r => r.state === 'matched').length);
  readonly missing = computed(() => this.rows().filter(r => r.state === 'missing'));
  readonly errors = computed(() => this.problems().filter(p => p.severity === 'ERROR'));
  readonly warnings = computed(() => this.problems().filter(p => p.severity === 'WARNING'));
  readonly passed = computed(() => STAGES.filter(s => !this.problems().some(p => p.stage === s)).length);
  readonly nextVersion = computed(() => (this.report()?.currentVersion ?? 0) + 1);
  readonly blocked = computed(() => this.errors().length > 0 || this.missing().length > 0);

  constructor() {
    this.destroy.onDestroy(() => {
      this.poll?.unsubscribe();
      this.dropPdf();
      Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u));
    });
    // A new source is read at once, so the matching table fills as the person picks.
    effect(() => {
      const s = this.source();
      this.rootPath();
      untracked(() => { if (s) this.read(); else { this.inspect.set(null); } });
    });
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const reportId = q.get('reportId');
    const templateId = q.get('templateId');
    if (reportId) {
      this.api.report(reportId).subscribe({
        next: r => {
          this.report.set(r);
          this.name.set(r.name);
          this.failedJob.set(r.jobs.find(j => j.status === 'FAILED' && j.jobId === r.jobs[0]?.jobId) ?? null);
          this.pick(r.templateId, true);
        },
        error: e => this.error.set(studioError(e, 'The report could not be read.').message),
      });
    } else if (templateId) {
      this.pick(templateId, true);
    }
    this.api.list(false, this.auth.isPlatformAdmin() ? this.tenantId() : null).subscribe({
      next: lib => {
        this.loadingTemplates.set(false);
        const published = lib.templates.filter(t => t.currentPublishedVersion != null && t.status !== 'ARCHIVED');
        this.templates.set(published);
        published.slice(0, 24).forEach(t => this.thumb(t.templateId));
      },
      error: e => { this.loadingTemplates.set(false); this.error.set(studioError(e, 'The templates could not be read.').message); },
    });
  }

  private thumb(templateId: string): void {
    this.api.templateThumbnail(templateId).subscribe({
      next: r => { if (r.body && (r.headers.get('Content-Type') ?? '').includes('png')) this.thumbs.update(m => ({ ...m, [templateId]: URL.createObjectURL(r.body!) })); },
      error: () => { /* the card shows without its picture */ },
    });
  }

  /** Step 1: a published template picked; its newest published version is what the report is made from. */
  pick(templateId: string, jump = false): void {
    this.error.set('');
    this.api.template(templateId).subscribe({
      next: t => {
        if (!t.currentPublishedVersion) { this.error.set(`${t.name} has no published version yet: publish it first.`); return; }
        this.t.set(t);
        if (!this.report()) this.name.set(this.name() || t.name);
        this.api.version(templateId, String(t.currentPublishedVersion)).subscribe({
          next: v => {
            this.def.set(v.definition ?? null);
            this.api.usable(t.templateId).subscribe({ next: u => this.profiles.set(u.profiles), error: () => this.profiles.set([]) });
            if (v.definition) this.rootPath.set(rootPathOf(v.definition));
            if (jump || this.step() === 1) this.go(2);
          },
          error: e => this.error.set(studioError(e, 'The template version could not be read.').message),
        });
      },
      error: e => this.error.set(studioError(e, 'The template could not be read.').message),
    });
  }

  go(step: Step): void {
    if (step > 1 && !this.def()) return;
    this.step.set(step);
    if (step === 3) this.check();
  }

  // ---------------------------------------------------------------- step 2: the data and the matching

  private read(): void {
    const s = this.source();
    if (!s) return;
    this.inspecting.set(true);
    this.inspectError.set('');
    this.api.inspect(s, this.rootPath().trim() || '$').subscribe({
      next: r => {
        this.inspecting.set(false);
        this.inspect.set(r);
        this.autoMatch(r.schema);
      },
      error: e => { this.inspecting.set(false); this.inspect.set(null); this.inspectError.set(studioError(e, 'The data could not be read.').message); },
    });
  }

  /** A field the data names exactly as the template does is matched as it is; everything else waits for the person. */
  private autoMatch(schema: SchemaField[]): void {
    const has = new Set(schema.map(f => f.path));
    const next: Record<string, string> = {};
    for (const f of this.needed()) {
      const kept = this.mapping()[f.path];
      if (kept && has.has(kept)) next[f.path] = kept;
      else if (has.has(f.path)) next[f.path] = f.path;
    }
    this.mapping.set(next);
  }

  setSource(field: string, path: string): void {
    this.mapping.update(m => {
      const next = { ...m };
      if (path) next[field] = path; else delete next[field];
      return next;
    });
  }

  /** The mapping as the server takes it: only the fields read from somewhere else. */
  private mappingBody(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [field, source] of Object.entries(this.mapping())) {
      if (source && source !== field) out[field] = source;
    }
    return out;
  }

  // ---------------------------------------------------------------- step 3: preview and checks

  private body(): Record<string, unknown> {
    return {
      templateId: this.t()?.templateId, version: String(this.version()), source: this.source(), rootPath: this.rootPath().trim() || '$',
      mapping: this.mappingBody(), ...(this.brandProfileId() ? { brandProfileId: this.brandProfileId() } : {}),
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
    };
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

  private follow(jobId: string): void {
    this.poll?.unsubscribe();
    this.poll = interval(1500).pipe(switchMap(() => this.api.job(jobId))).subscribe({
      next: job => { this.job.set(job); if (!isRunning(job.status)) this.poll?.unsubscribe(); },
      error: () => this.poll?.unsubscribe(),
    });
  }

  /** A platform administrator picked a workspace: its reports are in the library. */
  leave(): void {
    void this.router.navigate(['/reports/library']);
  }

  openReport(): void {
    const job = this.job();
    if (job) void this.router.navigate(['/reports/library', job.reportId]);
  }

  /** The table blocks a list feeds, in words ("feeds the Department table: department, rate"). */
  feedsText(r: MatchRow): string {
    return r.feeds.map(f => `${f.label}: ${f.columns.map(c => c.field + (c.ok ? '' : ' (not in the data)')).join(', ')}`).join(' · ');
  }
}
