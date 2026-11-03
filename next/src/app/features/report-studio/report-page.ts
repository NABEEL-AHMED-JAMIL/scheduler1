import { plainHint } from '../../shared/ui/plain-words';
import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription, interval, switchMap } from 'rxjs';
import { PageHeader } from '../../shared/ui/page-header';
import { Icon } from '../../shared/ui/icon';
import { RsTimePipe, zoneCity, rsTime } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error';
import { confirmWith } from '../../shared/ui/confirm';
import { copyText } from '../../shared/ui/clipboard.util';
import { AuthService } from '../../core/auth/auth.service';
import { ActivityLine, activityDetail, activityLine } from './report-activity';
import { Person } from './assets.model';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import {
  ApprovalSigner, JobRow, OutputRow, REPORT_DELETE_WORDS, REPORT_KEPT_WORDS, ReportDetail, ReportVersionRow, VersionRow, bundleParts, chipWord, deletedWords, idempotencyKey,
  isRunning, pageLimitOf, recordsWord, size, stageWord,
  openableOutputs,
} from './report-studio.model';
import { fileNameOf, saveBlob } from './report-files';
import { REPORT_FILE_TITLE_ID, ReportFileDialog } from './report-file-dialog';
import { VerifyData, VerifyPanel } from './verify-panel';
import { askVoidReason } from './void-dialog';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { formatDuration } from '../../shared/ui/time-format';
import { PageLimitActions } from './page-limit-actions';
import { AppLoading, InlineStatus, createLoadState, loadErrorText } from '../../shared/ui/loading';
import { createTableSort } from '../../shared/ui/sort';
import { AdvancedOption, AdvancedSelect } from '../../shared/ui/advanced-select';
import { idOf, idValue } from '../../shared/ui/advanced-options';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { askReason } from '../../shared/ui/reason';
import { ReportViewer } from './report-viewer';
import { CommentAnchor, ReportComments, pinsOf } from './report-comments';
import { DeidentifiedStatus, Meaning, ReportLibraryApi, ReviewComment, ReviewComments, TemplateFeatures } from './report-library.api';
import { ReportDeliveries, SchedulesApi } from './schedules/schedules.api';
import { Stage, reportStages } from './report-stages';
import { encodeQr } from './designer/qr-encoder';
import { qrPath } from './designer/qr-inspector';

type Tab = 'approval' | 'comments' | 'details' | 'activity' | 'access' | 'again';

/**
 * One report (MIG-403, MIG-404; the owner-approved screen 6, Figma frame 6; page report-library): the current version --
 * its first page, its key figures, its PDF and HTML -- every version (never overwritten) with what each was made from,
 * its activity, and beside them "Generate again": a pinned template version and the data (the same frozen data, or other
 * data through Create report) make the next version. Where a version came from is its lineage: the template version, the
 * data, the job, the report. Downloads go through a signed link, the reader's own, valid five minutes; each is recorded.
 */
@Component({
  selector: 'app-report-page',
  imports: [PageHeader, Icon, RsTimePipe, LoadError, ProblemList, RouterLink, FormsModule, PageLimitActions, AppLoading, InlineStatus, AdvancedSelect,
    CdkMenu, CdkMenuItem, CdkMenuTrigger, ReportViewer, ReportComments],
  templateUrl: './report-page.html',
  styleUrl: './report-page.css',
})
export class ReportPage implements OnInit {
  /** ZT-U8: a job's message in the menu's words (Reports › Settings, not Report Studio › Settings). */
  plain(text: string | null | undefined): string { return plainHint(text ?? ''); }
  /** Milliseconds in the console's duration words (formatDuration): "420 ms", "1.4 sec", "15 sec". */
  took(ms: number): string { return formatDuration(ms / 1000); }

  readonly reportId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly library = inject(ReportLibraryApi);
  private readonly schedulesApi = inject(SchedulesApi);
  /** Features 3 and 4: where a schedule's report went, by version (the Delivered step). */
  readonly deliveries = signal<ReportDeliveries | null>(null);

  readonly r = signal<ReportDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Reports redesign: the side card's tab -- Approval first; Generate again is the menu's, in the same card. */
  readonly tab = signal<Tab>('approval');
  readonly downloading = signal('');
  /** The version the viewer shows: the current one, or another picked in Versions. */
  readonly shown = signal<number | null>(null);
  readonly shownVersion = computed(() => {
    const r = this.r();
    const n = this.shown() ?? r?.currentVersion ?? null;
    return r?.versions.find(v => v.version === n) ?? null;
  });
  /** What an approval may mean (feature 2), and the one picked; null keeps the step's default. */
  readonly meanings = signal<Meaning[]>([]);
  readonly meaningDefaults = signal<{ first: string; final: string }>({ first: 'REVIEWED', final: 'RELEASE' });
  readonly meaning = signal<string | null>(null);
  /** The QR code the current version's template prints, when it has one (what it encodes), from the report itself. */
  readonly qr = computed<{ content: string; sizeMm?: number } | null>(() => {
    const f = (this.r() as (ReportDetail & { templateFeatures?: TemplateFeatures }) | null)?.templateFeatures;
    return f?.qr ? { content: f.qrContent ?? 'text' } : null;
  });
  /** The template's versions a report can be made from (published, and the ones superseded since). */
  readonly templateVersions = signal<VersionRow[]>([]);
  /** The Template version choices' read: loading, none, or why it failed (owner 2026-10-27). */
  readonly versionsState = createLoadState(false);
  /** Following a queued job: a progress read that fails says so (and can be asked again), not a job "running" for ever. */
  readonly pollError = signal('');
  readonly againVersion = signal<number | null>(null);
  readonly idValue = idValue;
  readonly idOf = idOf;
  /** The template's versions a report may be made again with: published (fixed) or superseded, newest first, with when. */
  readonly versionOptions = computed<AdvancedOption[]>(() => [...this.templateVersions()].sort((a, b) => b.version - a.version).map(tv => ({
    value: String(tv.version),
    label: `v${tv.version}`,
    description: [tv.changeSummary ?? '', tv.publishedAt ? 'published ' + (rsTime(tv.publishedAt, 'date') ?? '') : ''].filter(Boolean).join(' · ') || undefined,
    badge: tv.state === 'PUBLISHED' ? 'Published (fixed)' : 'Superseded',
    badgeTone: tv.state === 'PUBLISHED' ? 'ok' : 'neutral',
  })));
  readonly againData = signal<'same' | 'other'>('same');
  /** Phase 4: "Mark this version as COPY" -- the new version carries COPY on every page. */
  readonly againCopy = signal(false);
  /** Phase 7: "Ask for approval when it is ready" -- the new version waits in the reviewers' Task inbox. */
  readonly againAsk = signal(false);
  readonly asking = signal(false);
  /** Phase 4: the console's verify link (a report's QR code) opens Verify signature for its version. */
  readonly verify = input<string | undefined>();
  readonly version = input<string | undefined>();
  private verifyOpened = false;
  readonly againJob = signal<JobRow | null>(null);
  readonly againError = signal('');
  readonly againBusy = signal(false);
  private againKey = idempotencyKey();
  private poll?: Subscription;
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  readonly size = size;
  readonly recordsText = recordsWord;

  readonly current = computed<ReportVersionRow | undefined>(() => {
    const r = this.r();
    return r?.versions.find(v => v.version === r.currentVersion);
  });
  readonly newestJob = computed(() => this.r()?.jobs[0] ?? null);
  readonly lastFailed = computed(() => {
    const newest = this.newestJob();
    return newest?.status === 'FAILED' ? newest : null;
  });
  readonly justMade = computed(() => {
    const j = this.newestJob();
    const v = this.current();
    // Only a version made in the last ten minutes is news; an old report does not keep saying it is ready.
    const recent = !!j?.finishedAt && Date.now() - new Date(j.finishedAt).getTime() < 10 * 60_000;
    return j?.status === 'SUCCEEDED' && v && recent && j.resultVersion === v.version && v.version > 1 ? j : null;
  });
  /** Owner 2026-10-21: the job failed for the page limit (its own next steps then, not Fix field mapping). */
  overLimit(j: JobRow): boolean {
    return !!pageLimitOf(j);
  }

  readonly failedJobs = computed(() => this.r()?.jobs.filter(j => j.status === 'FAILED') ?? []);
  readonly running = computed(() => this.r()?.jobs.find(j => isRunning(j.status)) ?? null);
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin() && this.r()?.status !== 'ARCHIVED');
  readonly workspace = computed(() => this.auth.user()?.tenantName || '');
  readonly zoneCity = zoneCity;
  readonly nextVersion = computed(() => (this.r()?.currentVersion ?? 0) + 1);
  readonly records = computed(() => this.current()?.snapshot?.records ?? null);
  /** MIG-406: an approver (report-approve) approves a version they did not generate; it certifies the PDF in their name. */
  readonly canApprove = computed(() => this.auth.canOpen('report-approve') && !this.auth.isPlatformAdmin() && this.r()?.status !== 'ARCHIVED');
  readonly me = computed(() => this.auth.user()?.appUserId ?? null);
  readonly approving = signal(false);

  /** Owner 2026-10-27: the versions sort by version, when, template or approval; the service's order until one is picked. */
  readonly versionSort = createTableSort<ReportVersionRow>({
    id: 'report-versions',
    columns: {
      version: { value: v => v.version, kind: 'number' },
      generated: { value: v => v.createdAt, kind: 'date' },
      template: { value: v => v.templateVersion, kind: 'number' },
      signed: { value: v => this.signedWord(v), kind: 'status', order: ['Signed', 'Approved', 'Waiting', 'Superseded'] },
    },
  });
  readonly sortedVersions = computed(() => this.versionSort.apply(this.r()?.versions ?? []));

  // ---------------------------------------------------------------- feature 16: comments while reviewing

  /** A comment's link (?comment=) opens its thread; ?comments=1 opens the tab. */
  readonly comment = input<string | undefined>();
  readonly comments = input<string | undefined>();
  readonly commentsData = signal<ReviewComments | null>(null);
  readonly commentAnchor = signal<CommentAnchor | null>(null);
  readonly selectedComment = signal<string | null>(null);
  readonly resolvedShown = signal(false);
  readonly picking = signal(false);
  private readonly viewer = viewChild(ReportViewer);
  private commentOpened = false;
  /** Whoever opens the report in the library comments on it (the server says so per version: may.comment). */
  readonly mayComment = computed(() => !this.auth.isPlatformAdmin() && (this.commentsData()?.may.comment ?? false));
  readonly pins = computed(() => pinsOf(this.commentsData(), this.resolvedShown()));
  readonly openComments = computed(() => this.commentsData()?.open ?? 0);

  private loadComments(reportId: string, version: number): void {
    this.library.comments(reportId, version).subscribe({
      next: d => {
        this.commentsData.set(d);
        const wanted = this.comment();
        if (!this.commentOpened && (wanted || this.comments() === '1')) {
          this.commentOpened = true;
          this.tab.set('comments');
          const t = wanted ? d.threads.find(x => x.commentId === wanted || x.replies?.some(r => r.commentId === wanted)) : undefined;
          if (t) { this.resolvedShown.set(!!t.resolvedAt); this.goToThread(t); }
        }
      },
      error: () => this.commentsData.set(null),
    });
  }

  /** The viewer picked a place: the Comments tab opens with it as the new comment's place. */
  onPinned(at: CommentAnchor): void {
    this.commentAnchor.set(at);
    this.tab.set('comments');
    // Where the side card is under the report (a narrow screen), the new comment's box is brought into view.
    setTimeout(() => document.querySelector('[data-test="report-comments"] textarea')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  /** A pin on the page was clicked: its thread is selected in the Comments tab. */
  openThread(id: string): void {
    this.selectedComment.set(id);
    this.tab.set('comments');
  }

  /** A thread was opened in the panel: the viewer turns to its page. */
  goToThread(t: ReviewComment): void {
    this.selectedComment.set(t.commentId);
    if (t.page) this.viewer()?.go(t.page);
  }

  startPick(): void {
    this.picking.set(true);
    // The page to click may be above the card (a narrow screen): it is brought into view.
    setTimeout(() => document.querySelector('.rv-sheet')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.poll?.unsubscribe());
    // The shown version's comments: for the viewer's pins and the tab's count.
    effect(() => {
      const v = this.shownVersion();
      const r = this.r();
      untracked(() => {
        if (!r || !v || v.downloadable === false) { this.commentsData.set(null); return; }
        if (this.commentsData()?.reportId === r.reportId && this.commentsData()?.version === v.version) return;
        this.commentsData.set(null);
        this.commentAnchor.set(null);
        this.loadComments(r.reportId, v.version);
      });
    });
  }

  ngOnInit(): void {
    this.load();
    if (this.canApprove()) {
      this.library.meanings().subscribe({
        next: m => { this.meanings.set(m.meanings); this.meaningDefaults.set({ first: m.firstDefault, final: m.finalDefault }); },
        error: () => { /* the step's default meaning applies */ },
      });
    }
    if (!this.askedPeople && (this.auth.canOpen('report-assets') || this.auth.canOpen('report-approve'))) {
      this.askedPeople = true;
      this.api.people().subscribe({ next: p => this.people.set(p), error: () => { /* names from the entries alone */ } });
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.report(this.reportId()).subscribe({
      next: r => {
        this.r.set(r);
        this.loading.set(false);
        if (this.shown() != null && !r.versions.some(v => v.version === this.shown())) this.shown.set(null);
        if (this.canGenerate()) this.loadVersions(r.templateId);
        this.schedulesApi.deliveries(r.reportId).subscribe({ next: d => this.deliveries.set(d), error: () => this.deliveries.set(null) });
        this.loadCopyStatus(r);
        const asked = Number(this.version());
        const v = this.verify() === '1' && !this.verifyOpened ? r.versions.find(x => x.version === asked) : undefined;
        if (v) {
          this.verifyOpened = true;
          this.verifyVersion(v);
        }
      },
      error: e => { this.error.set(studioError(e, 'The report could not be read.').message); this.loading.set(false); },
    });
  }

  /** Feature 12: whether the current version has a copy without names (its template says which fields are personal). */
  readonly copyStatus = signal<DeidentifiedStatus | null>(null);
  readonly copying = signal('');

  private loadCopyStatus(r: ReportDetail): void {
    this.copyStatus.set(null);
    if (!r.currentVersion) return;
    const v = r.versions.find(x => x.version === r.currentVersion);
    if (!v || v.expired || v.downloadable === false) return;
    this.library.deidentified(r.reportId, r.currentVersion).subscribe({ next: c => this.copyStatus.set(c), error: () => this.copyStatus.set(null) });
  }

  /** Feature 12: the version's copy without names as a file (made now when it was not, then kept). */
  downloadCopy(v: ReportVersionRow, format: 'PDF' | 'HTML'): void {
    const r = this.r();
    if (!r) return;
    this.copying.set(format);
    this.library.downloadDeidentified(r.reportId, v.version, format).subscribe({
      next: res => {
        this.copying.set('');
        if (res.body) saveBlob(res.body, fileNameOf(res.headers.get('Content-Disposition'), `DEIDENTIFIED-${r.label}-v${v.version}.${format.toLowerCase()}`));
        if (!this.copyStatus()?.copy) this.loadCopyStatus(r);
      },
      error: e => { this.copying.set(''); this.toast.error(studioError(e, 'The copy without names could not be made.').message); },
    });
  }

  /** Feature 10: the two versions Versions offers to compare -- the one before the current, and the current. */
  readonly compareWith = computed<{ a: number; b: number } | null>(() => {
    const r = this.r();
    if (!r || r.versions.length < 2 || !r.currentVersion) return null;
    const older = [...r.versions].map(v => v.version).filter(n => n < r.currentVersion!).sort((x, y) => y - x)[0];
    return older ? { a: older, b: r.currentVersion } : null;
  });

  /** The Signed column's word for a version, as the cell shows it (for its sort). */
  signedWord(v: ReportVersionRow): string | null {
    if (v.approval?.signed) return 'Signed';
    if (v.approval) return 'Approved';
    if (this.waiting(v)) return 'Waiting';
    if (this.superseded(v)) return 'Superseded';
    return null;
  }

  /** Owner 2026-10-20: a version's PDF or HTML read in place, through the same signed and audited download. */
  view(v: ReportVersionRow, o: OutputRow): void {
    const r = this.r();
    if (!r) return;
    this.dialog.open<void>(ReportFileDialog, {
      data: { reportId: r.reportId, version: v.version, format: o.format, fileName: o.fileName, title: r.name },
      hasBackdrop: true, ariaLabelledBy: REPORT_FILE_TITLE_ID,
    });
  }

  loadVersions(templateId = this.r()?.templateId ?? ''): void {
    if (!templateId) return;
    this.versionsState.start();
    this.api.template(templateId).subscribe({
      next: t => {
        const made = t.versions.filter(v => v.state !== 'DRAFT');
        this.templateVersions.set(made);
        this.againVersion.set(t.currentPublishedVersion ?? made[0]?.version ?? null);
        this.versionsState.done();
      },
      error: e => this.versionsState.fail(e, 'The template\'s versions could not be read.'),
    });
  }

  /**
   * Whether this person may approve a version: an approver who did not generate it, it is not approved yet, and it is the
   * report's current version (media refuses a superseded one: a newer version exists).
   */
  mayApprove(v: ReportVersionRow): boolean {
    const review = v.review?.state === 'OPEN' ? v.review : null;
    // Phase 7: nobody approves the review they asked for, nor gives both approvals of two.
    return this.canApprove() && !v.approval && !v.expired && v.createdBy !== this.me() && v.version === this.r()?.currentVersion
      && !(review && review.requestedBy === this.me()) && !(review?.firstApproval && review.firstApproval.by === this.me());
  }

  /** Phase 7: the version's review is open in the Task inbox. */
  waiting(v: ReportVersionRow): boolean {
    return v.review?.state === 'OPEN';
  }

  /** Phase 7: whoever may generate asks for the current version's approval (once; it is a task for the reviewers). */
  mayAsk(v: ReportVersionRow): boolean {
    return this.canGenerate() && !v.approval && !v.expired && !v.void && this.hasPdf(v) && v.version === this.r()?.currentVersion && !this.waiting(v);
  }

  async ask(v: ReportVersionRow): Promise<void> {
    const r = this.r();
    if (!r) return;
    const ok = await confirmWith(this.dialog, { title: `Ask for approval of ${r.label} v${v.version}?`, confirmLabel: 'Ask for approval',
      body: 'It waits for the reviewers in Review › Approvals. Someone who did not generate it approves it, and its PDF is signed in their name; a newer version replaces the request.' });
    if (!ok) return;
    this.asking.set(true);
    this.api.requestReportApproval(r.reportId, v.version).subscribe({
      next: () => { this.asking.set(false); this.toast.success(`v${v.version} waits for approval in the reviewers' Review › Approvals.`); this.load(); },
      error: e => { this.asking.set(false); this.toast.error(studioError(e).message); },
    });
  }

  /** MIG-428: how the approver's signature on the PDF was made: their own signature picture, or their typed name. */
  signerWords(s: ApprovalSigner): string {
    const who = s.slot === 2 ? 'second approver' : 'approver';
    return s.signature === 'ASSET' ? `${who}'s own signature${s.assetVersion ? ' (v' + s.assetVersion + ')' : ''}`
      : `${who}'s typed name, signed digitally (no signature of their own)`;
  }

  /** The review's state in words, for the version's details. */
  reviewWords(v: ReportVersionRow): string {
    const q = v.review;
    if (!q) return '';
    switch (q.state) {
      case 'OPEN': return q.firstApproval ? `First approval by ${q.firstApproval.byName}; waiting for a second approver` : 'Waiting for approval';
      case 'REJECTED': return `Rejected by ${q.decidedByName ?? 'a reviewer'}`;
      case 'APPROVED': return `Approved by ${q.decidedByName ?? 'a reviewer'}`;
      default: return q.closeReason ?? 'The request was closed';
    }
  }

  /** An older version nobody approved: a newer one replaced it, so only the current version can be approved now. */
  superseded(v: ReportVersionRow): boolean {
    const current = this.r()?.currentVersion;
    return !v.approval && current != null && v.version < current;
  }

  async approve(v: ReportVersionRow): Promise<void> {
    const r = this.r();
    if (!r) return;
    const meaning = this.meaningWords(v);
    const ok = await confirmWith(this.dialog, { title: `Approve ${r.label} v${v.version}?`, confirmLabel: 'Approve and sign',
      body: `Your approval says: “${meaning}”. ` + (this.firstOfTwo(v)
        ? 'It is the first of two approvals: a second person approves it next, and its PDF is signed then.'
        : 'Its PDF is digitally signed in your name with the time. Any later change to the file breaks the signature. A new version needs its own approval.') });
    if (!ok) return;
    this.approving.set(true);
    this.api.approve(r.reportId, v.version, '', null, this.meaning()).subscribe({
      next: a => {
        this.approving.set(false);
        if (a.stage === 'FIRST') {
          this.toast.success(`First approval of v${v.version} recorded; a second person approves it next, and its PDF is signed then.`);
        } else {
          this.toast.success(a.signed ? `v${v.version} approved and its PDF signed.` : `v${v.version} approved. ${a.notSignedReason ?? ''}`);
        }
        this.load();
      },
      error: e => { this.approving.set(false); this.toast.error(studioError(e).message); },
    });
  }

  /** The approval this person would give now is the first of two (the workspace asks for a second approver). */
  firstOfTwo(v: ReportVersionRow): boolean {
    return !!v.review && v.review.state === 'OPEN' && v.review.needsSecond && !v.review.firstApproval;
  }

  /** The meaning this approval states: the one picked, else the step's default, in words. */
  meaningWords(v: ReportVersionRow): string {
    const code = this.meaning() ?? (this.firstOfTwo(v) ? this.meaningDefaults().first : this.meaningDefaults().final);
    return this.meanings().find(m => m.code === code)?.words ?? (this.firstOfTwo(v) ? 'Reviewed for clinical accuracy' : 'Approved for release');
  }

  /** The meaning's code the select shows (the default until one is picked). */
  meaningCode(v: ReportVersionRow): string {
    return this.meaning() ?? (this.firstOfTwo(v) ? this.meaningDefaults().first : this.meaningDefaults().final);
  }

  /** Send back: the version waiting for approval is rejected with the reason the person who asked reads. */
  async sendBack(v: ReportVersionRow): Promise<void> {
    const r = this.r();
    if (!r) return;
    const open = this.commentsData()?.version === v.version ? this.openComments() : 0;
    const carried = open ? ` Its ${open} open comment${open === 1 ? '' : 's'} go${open === 1 ? 'es' : ''} back with it.` : '';
    const note = await askReason(this.dialog, { title: `Send ${r.label} v${v.version} back?`, label: 'Why',
      hint: `The person who asked for the approval reads it; the version stays as it is and is not signed.${carried}`, confirmLabel: 'Send back', required: true });
    if (!note) return;
    this.approving.set(true);
    this.api.rejectVersion(r.reportId, v.version, note).subscribe({
      next: res => {
        this.approving.set(false);
        const n = (res as { openComments?: number }).openComments ?? 0;
        this.toast.success(`v${v.version} was sent back${n ? ` with ${n} open comment${n === 1 ? '' : 's'}` : ''}; ${v.review?.requestedByName ?? 'the person who asked'} is told why.`);
        this.load();
        this.commentsData.set(null);
        this.loadComments(r.reportId, v.version);
      },
      error: e => { this.approving.set(false); this.toast.error(studioError(e).message); },
    });
  }

  /** The life-cycle strip: Generated, Checked, the approvals, Delivered. */
  readonly stages = computed<Stage[]>(() => {
    const v = this.current();
    return v ? reportStages(v, this.took.bind(this), Date.now(), this.deliveries()) : [];
  });

  /** May this person void a version (the people who generate reports). */
  readonly canVoid = computed(() => this.canGenerate());

  /**
   * The link a scan opens: the public verify page by the version's random code (feature 1); a version made before codes
   * kept the signed-in link it printed.
   */
  verifyLink(v: ReportVersionRow): string {
    return v.verifyCode ? `${window.location.origin}/r/${v.verifyCode}`
      : `${window.location.origin}/reports/library/${v.reportId}?version=${v.version}&verify=1`;
  }

  /** The QR code the version prints, drawn here from the same link (its modules and quiet zone of 4). */
  qrDrawing(v: ReportVersionRow): { across: number; path: string } | null {
    const m = encodeQr(this.verifyLink(v), 'M');
    return m ? { across: m.modules + 8, path: qrPath(m.dark, 4) } : null;
  }

  copyVerify(v: ReportVersionRow): void {
    void copyText(this.verifyLink(v)).then(ok => this.toast[ok ? 'success' : 'error'](ok ? 'Verify link copied.' : 'The link could not be copied.'));
  }

  /** Show a version in the viewer (another than the current one: its own files). */
  showVersion(v: ReportVersionRow): void {
    this.shown.set(v.version === this.r()?.currentVersion ? null : v.version);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** The viewer's note beside the size: whether this PDF is signed. */
  viewerNote(v: ReportVersionRow): string {
    if (v.void) return 'VOID copy';
    if (v.approval?.signed) return 'signed';
    if (v.approval) return 'approved, not signed';
    return this.hasPdf(v) ? 'signed after approval' : '';
  }

  /** Initials for an approver's round badge. */
  initials(name: string | null | undefined): string {
    const parts = (name ?? '').replace(/,.*$/, '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Phase 4: marks a version VOID after the person says why. */
  async voidIt(v: ReportVersionRow): Promise<void> {
    const r = this.r();
    if (!r) return;
    const reason = await askVoidReason(this.dialog, { label: r.label, version: v.version, signed: !!v.approval?.signed });
    if (!reason) return;
    this.api.voidVersion(r.reportId, v.version, reason).subscribe({
      next: () => { this.toast.success(`v${v.version} is VOID. Every download of it now says so.`); this.load(); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  verifyVersion(v: ReportVersionRow): void {
    const r = this.r();
    if (!r) return;
    this.dialog.open<void, VerifyData>(VerifyPanel, sidePanelConfig<VerifyData>({ reportId: r.reportId, version: v.version, label: r.label }, 'narrow', 'right'));
  }

  tabTo(tab: Tab): void {
    this.tab.set(tab);
  }

  download(v: ReportVersionRow, o: OutputRow): void {
    const r = this.r();
    if (!r) return;
    this.downloading.set(v.versionId + o.format);
    this.api.download(r.reportId, v.version, o.format).subscribe({
      next: res => {
        this.downloading.set('');
        if (res.body) saveBlob(res.body, fileNameOf(res.headers.get('Content-Disposition'), o.fileName));
      },
      error: e => { this.downloading.set(''); this.toast.error(studioError(e, 'The file could not be downloaded.').message); },
    });
  }

  /** The current version's PDF (else its HTML), downloaded. */
  downloadCurrent(): void {
    const v = this.current();
    const o = v?.outputs.find(x => x.format === 'PDF') ?? v?.outputs[0];
    if (v && o) this.download(v, o);
  }

  /** The current version opened in a new tab: its PDF, through a signed link, as a blob the browser shows. */
  open(): void {
    const r = this.r();
    const v = this.current();
    const o = v?.outputs.find(x => x.format === 'PDF');
    if (!r || !v || !o) return;
    this.api.download(r.reportId, v.version, 'PDF').subscribe({
      next: res => {
        if (!res.body) return;
        const url = URL.createObjectURL(new Blob([res.body], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: e => this.toast.error(studioError(e, 'The report could not be opened.').message),
    });
  }

  share(): void {
    void copyText(window.location.href).then(ok => this.toast[ok ? 'success' : 'error'](ok
      ? 'Link copied. Only people in this workspace who may open reports can follow it.' : 'The link could not be copied.'));
  }

  /** "Generate again": the same frozen data with the chosen template version, as a new version; other data goes through Create report. */
  again(): void {
    const r = this.r();
    const v = this.current();
    if (!r) return;
    if (this.againData() === 'other' || !v) {
      void this.router.navigate(['/reports/new'], { queryParams: { reportId: r.reportId } });
      return;
    }
    this.againBusy.set(true);
    this.againError.set('');
    this.api.generate({
      reportId: r.reportId, version: String(this.againVersion() ?? v.templateVersion), source: { connector: 'SNAPSHOT', snapshotId: v.snapshotId },
      rootPath: (v.config?.['rootPath'] as string | undefined) ?? '$', ...(v.config?.['mapping'] ? { mapping: v.config['mapping'] } : {}),
      reason: `Again from v${v.version}'s data, template v${this.againVersion() ?? v.templateVersion}`,
      ...(this.againCopy() ? { markAsCopy: true } : {}),
      ...(this.againAsk() ? { requestApproval: true } : {}),
    }, this.againKey).subscribe({
      next: job => {
        this.againBusy.set(false);
        this.againJob.set(job);
        this.againKey = idempotencyKey();
        this.follow(job.jobId);
      },
      error: e => { this.againBusy.set(false); this.againError.set(studioError(e, 'The report could not be queued.').message); },
    });
  }

  private follow(jobId: string): void {
    this.poll?.unsubscribe();
    this.pollError.set('');
    this.poll = interval(1500).pipe(switchMap(() => this.api.job(jobId))).subscribe({
      next: job => {
        this.againJob.set(job);
        if (!isRunning(job.status)) { this.poll?.unsubscribe(); this.load(); }
      },
      error: e => {
        this.poll?.unsubscribe();
        this.pollError.set(loadErrorText(e, 'The job\'s progress could not be read; it may still be running.'));
      },
    });
  }

  /** Try again after a progress read failed: follows the same job again. */
  checkAgain(): void {
    const j = this.againJob();
    if (j) this.follow(j.jobId);
  }

  readonly keptWords = REPORT_KEPT_WORDS;

  remove(): void {
    const r = this.r();
    if (!r || r.approved) return;
    void confirmWith(this.dialog, { title: `Delete ${r.name}?`, body: REPORT_DELETE_WORDS, confirmLabel: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      this.api.deleteReport(r.reportId).subscribe({
        next: d => { this.toast.success(deletedWords(r.name, d.filesLeft)); void this.router.navigate(['/reports/library']); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }

  archive(): void {
    const r = this.r();
    if (!r) return;
    void confirmWith(this.dialog, { title: `Archive ${r.name}?`, body: 'It leaves the library; its versions and files are kept.',
      confirmLabel: 'Archive' }).then(ok => {
      if (!ok) return;
      this.api.archiveReport(r.reportId).subscribe({ next: () => this.load(), error: e => this.toast.error(studioError(e).message) });
    });
  }

  /** A version's files, the PDF first (as the people who read it open it). */
  outputsOf(v: ReportVersionRow): OutputRow[] {
    // Phase 7: a version whose files retention removed has nothing to open or download.
    return openableOutputs(v);
  }

  hasHtml(v: ReportVersionRow): boolean {
    return v.outputs.some(o => o.format === 'HTML');
  }

  hasPdf(v: ReportVersionRow): boolean {
    return v.outputs.some(o => o.format === 'PDF');
  }

  formatsOf(v: ReportVersionRow): string {
    return v.outputs.map(o => o.format).join(' and ');
  }

  /** The data's label for a version: the pipeline run, the file or the pasted data. */
  dataOf(v: ReportVersionRow): string {
    const parts = this.partsOf(v);
    if (parts) return `${parts.length} files: ${parts.map(p => p.name).join(', ')}`;
    return v.snapshot?.pipelineRunId ? `#${v.snapshot.pipelineRunId}` : v.snapshot?.label ?? '—';
  }

  /** A version made from several files: its parts by name (and what each was), else null. */
  partsOf(v: ReportVersionRow | null | undefined): { name: string; label: string }[] | null {
    return bundleParts(v?.snapshot);
  }

  versionBy(v: ReportVersionRow): string {
    const name = v.config?.['requestedByName'];
    return typeof name === 'string' && name ? name : v.createdBy ? 'A workspace member' : '—';
  }

  /** The Activity in words (report-activity.ts): what happened and who, its facts, and why when the entry says. */
  readonly activity = computed<ActivityLine[]>(() => {
    const people = this.people();
    const me = this.auth.user()?.appUserId;
    const nameOf = (id: number) => (id === me ? 'you' : people.find(p => p.userId === id)?.name ?? null);
    return (this.r()?.activity ?? []).map(a => activityLine(a, nameOf));
  });
  /** The workspace's people, for who acted; read when the reader may (Report assets' people), else names come from the entries. */
  private readonly people = signal<Person[]>([]);
  private askedPeople = false;

  activityWord(action: string): string {
    return activityLine({ action, at: '', detail: {} }).text;
  }

  detail(d: Record<string, unknown>): string {
    return activityDetail(d);
  }
}
