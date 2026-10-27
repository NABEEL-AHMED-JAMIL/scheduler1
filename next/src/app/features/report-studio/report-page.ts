import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription, interval, switchMap } from 'rxjs';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { RsTimePipe, zoneCity } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error';
import { confirmWith } from '../../shared/ui/confirm';
import { copyText } from '../../shared/ui/clipboard.util';
import { AuthService } from '../../core/auth/auth.service';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import {
  JobRow, OutputRow, REPORT_DELETE_WORDS, REPORT_KEPT_WORDS, ReportDetail, ReportVersionRow, VersionRow, bundleParts, chipWord, deletedWords, idempotencyKey,
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

type Tab = 'details' | 'versions' | 'activity' | 'access';

/**
 * One report (MIG-403, MIG-404; the owner-approved screen 6, Figma frame 6; page report-library): the current version --
 * its first page, its key figures, its PDF and HTML -- every version (never overwritten) with what each was made from,
 * its activity, and beside them "Generate again": a pinned template version and the data (the same frozen data, or other
 * data through Create report) make the next version. Where a version came from is its lineage: the template version, the
 * data, the job, the report. Downloads go through a signed link, the reader's own, valid five minutes; each is recorded.
 */
@Component({
  selector: 'app-report-page',
  imports: [PageHeader, RefreshButton, Icon, StatusPill, RsTimePipe, LoadError, ProblemList, RouterLink, FormsModule, NgTemplateOutlet, PageLimitActions],
  templateUrl: './report-page.html',
  styleUrl: './report-page.css',
})
export class ReportPage implements OnInit {
  /** Milliseconds in the console's duration words (formatDuration): "420 ms", "1.4 sec", "15 sec". */
  took(ms: number): string { return formatDuration(ms / 1000); }

  readonly reportId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly r = signal<ReportDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tab = signal<Tab>('details');
  readonly downloading = signal('');
  readonly thumb = signal<string | null>(null);
  /** The page the small view shows (owner 2026-10-20: Back and Next). */
  readonly thumbPage = signal(1);
  readonly thumbLoading = signal(false);
  /** The template's versions a report can be made from (published, and the ones superseded since). */
  readonly templateVersions = signal<VersionRow[]>([]);
  readonly againVersion = signal<number | null>(null);
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
    return j?.status === 'SUCCEEDED' && v && j.resultVersion === v.version && v.version > 1 ? j : null;
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

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.poll?.unsubscribe();
      const t = this.thumb();
      if (t) URL.revokeObjectURL(t);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.report(this.reportId()).subscribe({
      next: r => {
        this.r.set(r);
        this.loading.set(false);
        this.loadThumb(r);
        if (this.canGenerate()) this.loadVersions(r.templateId);
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

  private loadThumb(r: ReportDetail, page = 1): void {
    if (!r.currentVersion || !this.current()?.outputs.some(o => o.format === 'PDF')) return;
    this.thumbLoading.set(true);
    this.api.reportThumbnail(r.reportId, r.currentVersion, this.auth.isPlatformAdmin() ? r.tenantId : null, page).subscribe({
      next: res => {
        this.thumbLoading.set(false);
        if (!res.body || !(res.headers.get('Content-Type') ?? '').includes('png')) return;
        const old = this.thumb();
        if (old) URL.revokeObjectURL(old);
        this.thumb.set(URL.createObjectURL(res.body));
        this.thumbPage.set(page);
      },
      error: () => { this.thumbLoading.set(false); /* the card keeps the page it had */ },
    });
  }

  /** Back (-1) or Next (+1) in the small view, within the version's pages. */
  turn(step: number): void {
    const r = this.r();
    const pages = this.current()?.pages ?? 1;
    const next = this.thumbPage() + step;
    if (!r || next < 1 || next > pages || this.thumbLoading()) return;
    this.loadThumb(r, next);
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

  private loadVersions(templateId: string): void {
    this.api.template(templateId).subscribe({
      next: t => {
        const made = t.versions.filter(v => v.state !== 'DRAFT');
        this.templateVersions.set(made);
        this.againVersion.set(t.currentPublishedVersion ?? made[0]?.version ?? null);
      },
      error: () => this.templateVersions.set([]),
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
    const ok = await confirmWith(this.dialog, { title: `Approve ${r.label} v${v.version}?`, confirmLabel: 'Approve and sign',
      body: 'Its PDF is digitally signed in your name with the time. Any later change to the file breaks the signature. A new version needs its own approval.' });
    if (!ok) return;
    this.approving.set(true);
    this.api.approve(r.reportId, v.version).subscribe({
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
    this.poll = interval(1500).pipe(switchMap(() => this.api.job(jobId))).subscribe({
      next: job => {
        this.againJob.set(job);
        if (!isRunning(job.status)) { this.poll?.unsubscribe(); this.load(); }
      },
      error: () => this.poll?.unsubscribe(),
    });
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

  activityWord(action: string): string {
    const words: Record<string, string> = {
      'report.created': 'Report created', 'report.requested': 'Generation requested', 'report.generated': 'Version made',
      'report.failed': 'Generation failed', 'report.downloaded': 'Downloaded', 'report.archived': 'Archived',
    };
    return words[action] ?? action;
  }

  detail(d: Record<string, unknown>): string {
    return Object.entries(d).filter(([k]) => ['version', 'format', 'code', 'templateVersion'].includes(k))
      .map(([k, v]) => `${k} ${v}`).join(' · ');
  }
}
