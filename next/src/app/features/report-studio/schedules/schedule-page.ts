import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PageHeader } from '../../../shared/ui/page-header';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { AppLoading } from '../../../shared/ui/loading';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AuthService } from '../../../core/auth/auth.service';
import { Team, TeamsApi } from '../../../core/teams/teams.api';
import { GeneratedService, pipelineOf } from '../../documents/generated/generated.service';
import { DocumentsApi } from '../../documents/documents.service';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { DataSourceRow, TemplateRow } from '../report-studio.model';
import { Meaning, ReportLibraryApi } from '../report-library.api';
import { RsTimePipe, rsTime, zoneCity } from '../rs-time.pipe';
import {
  CHANNEL_WORDS, DAYS, DAY_WORDS, Day, RUN_WORDS, RunDetail, STATE_WORDS, ScheduleBody, ScheduleDetail, SchedulePlan, SchedulesApi,
  blankSchedule, placeholders, runTone, scheduleTone,
} from './schedules.api';
import { SchedTestThumb } from './test-thumb';

/** A test report of "Make the first 3 now (test)": its PDF (an object URL), or why it could not be made. */
interface TestReport { position: number; name: string; url?: string; pages?: number; errors?: number; warnings?: number; error?: string; }

/** What a schedule body must say before it can be planned: a template and where the data comes from (the rest can follow). */
export function plannable(b: ScheduleBody): boolean {
  const d = b.data;
  return !!b.template.templateId && (d.kind === 'SOURCE' ? !!d.sourceId : !!d.pipelineId);
}

/** Whether the "How many reports" step is complete (else the plan reads the data with a stand-in one report of all rows). */
export function splitReady(b: ScheduleBody): boolean {
  return (b.split.mode === 'ALL' || !!b.split.groupBy) && !!b.split.name.trim();
}

/**
 * The body as the plan reads it while the person is still filling it in: a step not finished yet (the field to group by,
 * the name, the email's people, the bucket, the days) is stood in for, so the data is read -- and its fields offered --
 * before everything is chosen. Saving sends the body itself, and is refused while a step is missing.
 */
export function forPlan(b: ScheduleBody): ScheduleBody {
  const out = structuredClone(b);
  if (!splitReady(out)) out.split = { mode: 'ALL', name: out.split.name.trim() || 'Report' };
  if (out.split.mode === 'ALL' && /\{(?!(year|month|week|date|n|count|schedule)\})[^{}]+\}/.test(out.split.name)) out.split.name = 'Report';
  if (out.delivery.email && !out.delivery.email.userIds.length) out.delivery.email = null;
  if (out.delivery.bucket && (!out.delivery.bucket.connection || !out.delivery.bucket.path.trim())) out.delivery.bucket = null;
  if (out.timing.repeat === 'WEEKLY' && !(out.timing.days ?? []).length) out.timing.days = ['MON'];
  if (out.timing.repeat === 'ONCE' && !out.timing.date) out.timing.repeat = 'DAILY';
  if (!out.name.trim()) out.name = 'New schedule';
  return out;
}

/** What the page says is still missing before it can be saved, in the steps' order; empty when nothing is. */
export function missing(b: ScheduleBody): string[] {
  const out: string[] = [];
  if (!b.name.trim()) out.push('Name the schedule.');
  if (!b.template.templateId) out.push('Pick a template (step 1).');
  if (b.data.kind === 'SOURCE' ? !b.data.sourceId : !b.data.pipelineId) out.push('Say where the data comes from (step 2).');
  if (b.split.mode === 'PER_GROUP' && !b.split.groupBy) out.push('Pick the field each report is for (step 3).');
  if (!b.split.name.trim()) out.push('Say how each report is named (step 3).');
  if (b.delivery.email && !b.delivery.email.userIds.length) out.push('Pick who gets the email, or turn it off (step 5).');
  if (b.delivery.bucket && (!b.delivery.bucket.connection || !b.delivery.bucket.path.trim())) out.push('Pick the bucket and folder (step 5).');
  if (b.timing.repeat === 'WEEKLY' && !(b.timing.days ?? []).length) out.push('Pick at least one day (step 6).');
  if (b.timing.repeat === 'ONCE' && !b.timing.date) out.push('Pick the day it runs (step 6).');
  return out;
}

/**
 * See results › Reports › Schedules › a schedule (reports redesign, features 3 and 4; design schedule.html; page
 * report-generate). Six steps -- Template, Data, How many reports (with the first three made as tests), Approval, Deliver
 * once approved, When -- with the Summary and the Checks before it runs beside them. A saved schedule also shows its runs
 * (each run's reports) and where its approved reports went. Every time is the workspace's (24-hour).
 */
@Component({
  selector: 'app-report-schedule',
  imports: [PageHeader, Icon, LoadError, AppLoading, AdvancedSelect, FormsModule, RouterLink, RsTimePipe, SchedTestThumb],
  templateUrl: './schedule-page.html',
  styleUrl: './schedule-page.css',
})
export class ReportSchedulePage implements OnInit {
  /** The route's id: "new" for a new schedule. */
  readonly scheduleId = input<string>('new');

  private readonly api = inject(SchedulesApi);
  private readonly studio = inject(ReportStudioApi);
  private readonly library = inject(ReportLibraryApi);
  private readonly teamsApi = inject(TeamsApi);
  private readonly generated = inject(GeneratedService);
  private readonly documents = inject(DocumentsApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private planTimer: ReturnType<typeof setTimeout> | null = null;
  private planAsked = 0;

  readonly isNew = computed(() => !this.scheduleId() || this.scheduleId() === 'new');
  readonly body = signal<ScheduleBody>(blankSchedule());
  readonly detail = signal<ScheduleDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly busy = signal(false);
  readonly canEdit = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin()
    && this.detail()?.status !== 'ARCHIVED');

  // The choices the steps offer.
  readonly templates = signal<TemplateRow[]>([]);
  readonly sources = signal<DataSourceRow[]>([]);
  readonly pipelines = signal<{ jobId: number; name: string; pipeline: string | null }[]>([]);
  readonly teams = signal<Team[]>([]);
  readonly meanings = signal<Meaning[]>([]);
  readonly buckets = signal<{ alias: string; label: string }[]>([]);
  readonly people = signal<{ userId: number; name: string; email?: string; emailable: boolean }[]>([]);
  readonly choicesError = signal('');

  readonly plan = signal<SchedulePlan | null>(null);
  readonly planning = signal(false);
  readonly planError = signal('');
  readonly tests = signal<TestReport[]>([]);
  readonly testing = signal(false);
  readonly testedOk = signal<boolean | null>(null);

  readonly openRun = signal<string | null>(null);
  readonly runDetail = signal<RunDetail | null>(null);

  readonly days = DAYS;
  readonly dayWords = DAY_WORDS;
  readonly stateWords = STATE_WORDS;
  readonly runWords = RUN_WORDS;
  readonly channelWords = CHANNEL_WORDS;
  readonly tone = scheduleTone;
  readonly runTone = runTone;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.planTimer) clearTimeout(this.planTimer);
      this.tests().forEach(t => t.url && URL.revokeObjectURL(t.url));
    });
  }

  ngOnInit(): void {
    this.loadChoices();
    if (!this.isNew()) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get(this.scheduleId()).subscribe({
      next: d => {
        this.detail.set(d);
        this.body.set({ ...structuredClone(d.spec), name: d.name, scheduleId: d.scheduleId, rowVersion: d.rowVersion });
        this.loading.set(false);
        this.askPlan(0);
      },
      error: e => { this.error.set(studioError(e, 'The schedule could not be read.').message); this.loading.set(false); },
    });
  }

  private loadChoices(): void {
    const quiet = <T>(o: Observable<T>, fallback: T) => o.pipe(catchError(() => { this.choicesError.set('Some lists could not be read; '
      + 'what is shown may be incomplete.'); return of(fallback); }));
    forkJoin({
      templates: quiet(this.studio.list({ limit: 200 }), null),
      sources: quiet(this.studio.sources(), []),
      pipelines: quiet(this.generated.schedules(), []),
      teams: quiet(this.teamsApi.list(), null),
      meanings: quiet(this.library.meanings(), null),
      buckets: quiet(this.documents.buckets(), []),
      people: quiet(this.api.recipients(), []),
    }).subscribe(c => {
      this.templates.set((c.templates?.templates ?? []).filter(t => t.status !== 'ARCHIVED' && t.ownerKind !== 'STEP' && !!t.currentPublishedVersion));
      this.sources.set(c.sources.filter(s => s.connector !== 'RUN_OUTPUT'));
      this.pipelines.set(c.pipelines.map(j => ({ jobId: j.jobId, name: j.jobName ?? 'Pipeline ' + j.jobId, pipeline: pipelineOf(j) })));
      this.teams.set((c.teams?.data ?? []).filter(t => t.status === 'ACTIVE'));
      this.meanings.set(c.meanings?.meanings ?? []);
      this.buckets.set(c.buckets);
      this.people.set(c.people);
    });
  }

  // ------------------------------------------------------------------ editing

  /** Changes the body (a copy), and plans it again a moment after the last change. */
  edit(change: (b: ScheduleBody) => void): void {
    const b = structuredClone(this.body());
    change(b);
    this.body.set(b);
    this.saveError.set('');
    this.askPlan(700);
  }

  private askPlan(delay: number): void {
    if (this.planTimer) clearTimeout(this.planTimer);
    if (!plannable(this.body())) { this.plan.set(null); return; }
    this.planTimer = setTimeout(() => this.runPlan(false), delay);
  }

  runPlan(checkFolder: boolean): void {
    const asked = ++this.planAsked;
    this.planning.set(true);
    this.planError.set('');
    const provisional = !splitReady(this.body());
    this.api.plan(forPlan(this.body()), checkFolder).subscribe({
      next: p => { if (asked === this.planAsked) { this.plan.set(provisional ? { ...p, reportsPlanned: undefined, firstReports: [], exampleName: undefined } : p);
        this.planning.set(false); } },
      error: e => { if (asked === this.planAsked) { this.planError.set(studioError(e, 'The plan could not be made.').message); this.planning.set(false); } },
    });
  }

  // The choices as options.
  readonly templateOptions = computed<AdvancedOption[]>(() => this.templates().map(t => ({
    value: t.templateId, label: t.name, description: [t.category ?? '', `published v${t.currentPublishedVersion}`].filter(Boolean).join(' · '),
    keywords: t.category ?? undefined,
  })));
  readonly versionOptions = computed<AdvancedOption[]>(() => {
    const t = this.templates().find(x => x.templateId === this.body().template.templateId);
    const out: AdvancedOption[] = [{ value: 'latest', label: 'Use the latest published version', description: 'A newer version is used from its next run' }];
    for (let v = t?.currentPublishedVersion ?? 0; v >= 1 && out.length < 8; v--) out.push({ value: String(v), label: `Keep version ${v}`, description: 'Pinned: a newer version is not used' });
    return out;
  });
  readonly watermarkOptions: AdvancedOption[] = [
    { value: 'DRAFT', label: 'DRAFT', description: 'Every copy says DRAFT until it is approved; the approved one is clean' },
    { value: 'NONE', label: 'None', description: 'No mark before approval' },
  ];
  readonly sourceOptions = computed<AdvancedOption[]>(() => [
    ...this.pipelines().map(p => ({ value: 'P:' + p.jobId, label: `Pipeline “${p.name}” · latest run`, group: 'Pipelines', description: p.pipeline ?? undefined,
      keywords: String(p.jobId) })),
    ...this.sources().map(s => ({ value: 'S:' + s.sourceId, label: s.name, group: 'Saved data sources',
      description: s.connector === 'BUCKET_OBJECT' ? 'A file in a bucket' : 'Uploaded or pasted data' })),
  ]);
  readonly sourceValue = computed(() => {
    const d = this.body().data;
    return d.kind === 'PIPELINE' ? (d.pipelineId ? 'P:' + d.pipelineId : '') : (d.sourceId ? 'S:' + d.sourceId : '');
  });
  readonly columns = computed(() => this.plan()?.data?.columns ?? []);
  readonly columnOptions = computed<AdvancedOption[]>(() => this.columns().map(c => ({ value: c, label: c, mono: true })));
  readonly dateOptions = computed<AdvancedOption[]>(() => [{ value: '', label: 'Every row' },
    ...this.columns().map(c => ({ value: c, label: `By ${c}`, mono: true }))]);
  readonly failedOptions: AdvancedOption[] = [
    { value: 'SKIP', label: 'Skip this run and tell me' },
    { value: 'LAST_GOOD', label: 'Use the last good run and tell me' },
  ];
  readonly whoOptions = computed<AdvancedOption[]>(() => [
    { value: '', label: 'Report settings’ approvers', description: 'Who Reports › Settings names' },
    { value: 'role:TENANT_ADMIN', label: 'The workspace administrators' },
    ...this.teams().map(t => ({ value: 'team:' + t.teamId, label: `Team: ${t.name} (${t.memberCount})`, group: 'Teams', keywords: t.name })),
  ]);
  readonly whoValue = computed(() => {
    const r = this.body().approval.reviewers;
    return r ? `${r.kind}:${r.value}` : '';
  });
  readonly neededOptions = computed<AdvancedOption[]>(() => this.meanings().length
    ? [1, 2].flatMap(n => this.meanings().map(m => ({ value: `${n}|${m.code}`, label: `${n} · meaning “${m.words}”`,
      group: n === 1 ? 'One approval' : 'Two approvals (the second signs)' })))
    : [{ value: '1|REVIEWED', label: '1 · meaning “Reviewed for clinical accuracy”' }]);
  readonly neededValue = computed(() => `${this.body().approval.needed}|${this.body().approval.meaning}`);
  readonly remindOptions: AdvancedOption[] = [0, 1, 2, 3, 5, 7].map(d => ({ value: String(d),
    label: d === 0 ? 'Never remind' : `${d} day${d === 1 ? '' : 's'}: remind, then tell me` }));
  readonly bucketOptions = computed<AdvancedOption[]>(() => this.buckets().map(b => ({ value: b.alias, label: b.label, sample: b.alias, mono: false })));
  readonly peopleOptions = computed<AdvancedOption[]>(() => {
    const chosen = new Set(this.body().delivery.email?.userIds ?? []);
    return this.people().filter(p => p.emailable && !chosen.has(p.userId))
      .map(p => ({ value: String(p.userId), label: p.name, description: p.email, keywords: p.email }));
  });
  readonly chosenPeople = computed(() => (this.body().delivery.email?.userIds ?? []).map(id =>
    this.people().find(p => p.userId === id) ?? { userId: id, name: 'Person ' + id, emailable: true }));
  readonly repeatOptions: AdvancedOption[] = [
    { value: 'ONCE', label: 'Once' }, { value: 'DAILY', label: 'Every day' }, { value: 'WEEKLY', label: 'Every week' },
    { value: 'MONTHLY', label: 'Every month' },
  ];
  readonly domOptions: AdvancedOption[] = [...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` })),
    { value: '0', label: 'The last day' }];
  readonly timeOptions: AdvancedOption[] = Array.from({ length: 48 }, (_, i) => {
    const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    return { value: t, label: t };
  });
  readonly zone = computed(() => this.plan()?.zone ?? this.detail()?.zone ?? 'America/Chicago');
  readonly city = computed(() => zoneCity(this.zone()));

  /** One field of a step, as the template binds it (templates hold no arrow functions). */
  set(field: string, value: unknown): void {
    const v = value as string;
    this.edit(b => {
      switch (field) {
        case 'name': b.name = v; break;
        case 'watermark': b.template.watermark = v === 'NONE' ? 'NONE' : 'DRAFT'; break;
        case 'dateField': b.data.rows.dateField = v || undefined; b.data.rows.lastDays = v ? (b.data.rows.lastDays ?? 7) : undefined; break;
        case 'lastDays': b.data.rows.lastDays = Math.max(1, Math.min(366, Number(v) || 7)); break;
        case 'ifFailed': b.data.ifFailed = v === 'LAST_GOOD' ? 'LAST_GOOD' : 'SKIP'; break;
        case 'mode': b.split.mode = v === 'ALL' ? 'ALL' : 'PER_GROUP'; break;
        case 'groupBy': b.split.groupBy = v; break;
        case 'pattern': b.split.name = v; break;
        case 'remind': b.approval.remindAfterDays = Number(v) || 0; break;
        case 'bucketConnection': if (b.delivery.bucket) b.delivery.bucket.connection = v; break;
        case 'bucketPath': if (b.delivery.bucket) b.delivery.bucket.path = v; break;
        case 'webhook': b.delivery.webhook = !!value; break;
        case 'dayOfMonth': b.timing.dayOfMonth = Number(v); break;
        case 'date': b.timing.date = v; break;
        case 'at': b.timing.at = v; break;
        case 'wait': b.data.waitMinutes = value ? 120 : 0; break;
        case 'skipUnchanged': b.data.skipUnchanged = !!value; break;
      }
    });
  }

  setTemplate(id: string): void {
    this.edit(b => { b.template.templateId = id; b.template.version = 'latest'; });
  }

  setVersion(v: string): void {
    this.edit(b => { b.template.version = v === 'latest' ? 'latest' : Number(v); });
  }

  setSource(v: string): void {
    this.edit(b => {
      if (v.startsWith('P:')) {
        const p = this.pipelines().find(x => String(x.jobId) === v.slice(2));
        b.data = { ...b.data, kind: 'PIPELINE', pipelineId: Number(v.slice(2)), pipelineName: p?.name ?? '', sourceId: undefined, sourceName: undefined,
          ifFailed: b.data.ifFailed ?? 'SKIP', waitMinutes: b.data.waitMinutes ?? 120, skipUnchanged: b.data.skipUnchanged ?? true };
      } else {
        const s = this.sources().find(x => x.sourceId === v.slice(2));
        b.data = { kind: 'SOURCE', sourceId: v.slice(2), sourceName: s?.name, rows: b.data.rows };
      }
    });
  }

  setWho(v: string): void {
    this.edit(b => { b.approval.reviewers = v ? { kind: v.split(':')[0] as 'team' | 'role', value: v.split(':')[1] } : null; });
  }

  setNeeded(v: string): void {
    const [n, code] = v.split('|');
    this.edit(b => { b.approval.needed = Number(n) === 2 ? 2 : 1; b.approval.meaning = code; });
  }

  toggleEmail(on: boolean): void {
    this.edit(b => { b.delivery.email = on ? { userIds: b.delivery.email?.userIds ?? [] } : null; });
  }

  addPerson(id: string): void {
    if (!id) return;
    this.edit(b => { b.delivery.email = { userIds: [...(b.delivery.email?.userIds ?? []), Number(id)] }; });
  }

  removePerson(id: number): void {
    this.edit(b => { if (b.delivery.email) b.delivery.email.userIds = b.delivery.email.userIds.filter(x => x !== id); });
  }

  toggleBucket(on: boolean): void {
    this.edit(b => { b.delivery.bucket = on ? (b.delivery.bucket ?? { connection: this.buckets()[0]?.alias ?? '', path: 'reports/{year}/{week}/' }) : null; });
  }

  toggleDay(d: Day): void {
    this.edit(b => {
      const days = new Set(b.timing.days ?? []);
      if (days.has(d)) days.delete(d); else days.add(d);
      b.timing.days = DAYS.filter(x => days.has(x));
    });
  }

  setRepeat(v: string): void {
    this.edit(b => {
      b.timing.repeat = v as ScheduleBody['timing']['repeat'];
      if (v === 'WEEKLY' && !(b.timing.days ?? []).length) b.timing.days = ['MON'];
      if (v === 'MONTHLY' && b.timing.dayOfMonth == null) b.timing.dayOfMonth = 1;
      if (v === 'ONCE' && !b.timing.date) b.timing.date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    });
  }

  /** The name pattern's fields that the data does not have (said under the field). */
  readonly unknownNames = computed(() => {
    const cols = new Set(this.columns());
    if (!cols.size) return [];
    return placeholders(this.body().split.name).filter(p => !['year', 'month', 'week', 'date', 'n', 'count', 'schedule'].includes(p) && !cols.has(p));
  });

  // ------------------------------------------------------------------ the right column

  readonly todo = computed(() => missing(this.body()));
  readonly summary = computed(() => {
    const p = this.plan();
    const b = this.body();
    const nextRuns = (p?.nextRuns ?? this.detail()?.nextRuns ?? []).map(r => rsTime(r, 'day', this.zone()) + ', ' + rsTime(r, 'time', this.zone()));
    return {
      every: p?.when ?? '',
      next: nextRuns.length ? 'next ' + nextRuns.join(', then ') : '',
      makes: p?.makes ? `${p.makes}${p.reportsPlanned != null ? ` · ${p.reportsPlanned} if it ran now` : ''}` : '',
      approval: p?.approval ? `${p.approval.needed} of ${p.approval.people} ${p.approval.people === 1 ? 'person' : 'people'} · “${p.approval.meaning}”`
        + (b.approval.remindAfterDays ? ` · reminder after ${b.approval.remindAfterDays} day${b.approval.remindAfterDays === 1 ? '' : 's'}` : '') : '',
      then: p?.then ?? '',
      cost: p?.reportsPlanned != null ? `about ${p.reportsPlanned} report${p.reportsPlanned === 1 ? '' : 's'} a run, billed as reports generated` : '',
    };
  });
  readonly checks = computed(() => {
    const out = [...(this.plan()?.checks ?? [])];
    const ok = this.testedOk();
    if (ok !== null) out.push({ level: ok ? 'OK' : 'ERROR', about: 'test', text: ok ? `${this.tests().length} test report${this.tests().length === 1 ? '' : 's'} made without problems`
      : 'A test report has problems: open it to see them.' });
    return out;
  });
  readonly blocking = computed(() => this.checks().filter(c => c.level === 'ERROR' && c.about !== 'test'));

  // ------------------------------------------------------------------ actions

  /** "Make the first 3 now (test)": up to three reports drawn from the data now, as previews (DRAFT), one after another. */
  async test(): Promise<void> {
    if (this.todo().length) { this.saveError.set(this.todo()[0]); return; }
    this.tests().forEach(t => t.url && URL.revokeObjectURL(t.url));
    this.tests.set([]);
    this.testing.set(true);
    this.testedOk.set(null);
    const plan = await new Promise<SchedulePlan | null>(resolve => this.api.plan(this.body()).subscribe({ next: resolve, error: e => {
      this.saveError.set(studioError(e, 'The data could not be read.').message); resolve(null); } }));
    if (!plan) { this.testing.set(false); return; }
    this.plan.set(plan);
    const first = plan.firstReports ?? [];
    let allOk = first.length > 0;
    for (const r of first) {
      const made: TestReport = await new Promise(resolve => this.api.test(this.body(), r.position - 1).subscribe({
        next: res => {
          if (!res.body || !(res.headers.get('Content-Type') ?? '').includes('pdf')) { resolve({ ...r, error: 'The template has errors; nothing was drawn.' }); return; }
          resolve({ position: r.position, name: r.name, url: URL.createObjectURL(res.body), pages: Number(res.headers.get('X-Report-Pages') ?? 0),
            errors: Number(res.headers.get('X-Report-Errors') ?? 0), warnings: Number(res.headers.get('X-Report-Warnings') ?? 0) });
        },
        error: e => resolve({ ...r, error: studioError(e, 'This report could not be made.').message }),
      }));
      if (made.error || made.errors) allOk = false;
      this.tests.set([...this.tests(), made]);
    }
    this.testedOk.set(first.length ? allOk : null);
    if (!first.length) this.saveError.set('A run now would make no reports: there are no rows for it.');
    this.testing.set(false);
  }

  /** "Save and turn on": the plan again with the bucket folder's write check, refused while a check fails; then saved. */
  save(): void {
    const todo = this.todo();
    if (todo.length) { this.saveError.set(todo[0]); return; }
    this.saving.set(true);
    this.saveError.set('');
    this.api.plan(this.body(), !!this.body().delivery.bucket).subscribe({
      next: p => {
        this.plan.set(p);
        const errors = p.checks.filter(c => c.level === 'ERROR');
        if (errors.length) { this.saveError.set(`Not saved: ${errors[0].text}`); this.saving.set(false); return; }
        this.api.save(this.body()).subscribe({
          next: d => {
            this.saving.set(false);
            this.toast.success(this.isNew() ? `“${d.name}” is on; it runs next ${rsTime(d.nextRunAt, 'recent', d.zone) ?? ''}.` : 'Schedule saved.');
            // The same page goes on showing it (the route's component is kept when only its id changes).
            const wasNew = this.isNew();
            this.detail.set(d);
            this.body.set({ ...structuredClone(d.spec), name: d.name, scheduleId: d.scheduleId, rowVersion: d.rowVersion });
            if (wasNew) void this.router.navigate(['/reports/schedules', d.scheduleId], { replaceUrl: true });
          },
          error: e => { this.saveError.set(studioError(e, 'The schedule could not be saved.').message); this.saving.set(false); },
        });
      },
      error: e => { this.saveError.set(studioError(e, 'The schedule could not be checked.').message); this.saving.set(false); },
    });
  }

  runNow(): void {
    const d = this.detail();
    if (!d) return;
    this.busy.set(true);
    this.api.runNow(d.scheduleId).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Run started: its reports appear below as they are made.'); this.load(); },
      error: e => { this.busy.set(false); this.toast.error(studioError(e, 'The run could not start.').message); },
    });
  }

  pauseOrResume(): void {
    const d = this.detail();
    if (!d) return;
    this.busy.set(true);
    (d.status === 'PAUSED' ? this.api.resume(d.scheduleId) : this.api.pause(d.scheduleId)).subscribe({
      next: x => { this.busy.set(false); this.detail.set(x); this.body.update(b => ({ ...b, rowVersion: x.rowVersion }));
        this.toast.success(x.status === 'PAUSED' ? 'Paused: it does not run until you turn it on again.' : 'On again.'); },
      error: e => { this.busy.set(false); this.toast.error(studioError(e, 'The schedule could not be changed.').message); },
    });
  }

  async archive(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const yes = await confirmWith(this.dialog, { title: `Archive “${d.name}”?`, body: 'It never runs again. Its runs, deliveries and the reports it made '
      + 'are kept; reports waiting for approval still wait.', confirmLabel: 'Archive', danger: true });
    if (!yes) return;
    this.api.archive(d.scheduleId).subscribe({
      next: () => { this.toast.success('Schedule archived.'); void this.router.navigate(['/reports/schedules']); },
      error: e => this.toast.error(studioError(e, 'The schedule could not be archived.').message),
    });
  }

  toggleRun(runId: string): void {
    if (this.openRun() === runId) { this.openRun.set(null); this.runDetail.set(null); return; }
    this.openRun.set(runId);
    this.runDetail.set(null);
    this.api.run(runId).subscribe({
      next: r => this.runDetail.set(r),
      error: e => this.toast.error(studioError(e, 'The run could not be read.').message),
    });
  }

  cancel(): void {
    void this.router.navigate(['/reports/schedules']);
  }
}
