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
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error';
import { confirmWith } from '../../shared/ui/confirm';
import { copyText } from '../../shared/ui/clipboard.util';
import { AuthService } from '../../core/auth/auth.service';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import {
  JobRow, OutputRow, ReportDetail, ReportVersionRow, VersionRow, chipWord, idempotencyKey, isRunning, size, stageWord,
} from './report-studio.model';
import { fileNameOf, saveBlob } from './report-files';
import { REPORT_FILE_TITLE_ID, ReportFileDialog } from './report-file-dialog';
import { VerifyData, VerifyPanel } from './verify-panel';
import { sidePanelConfig } from '../../shared/ui/side-panel';

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
  imports: [PageHeader, RefreshButton, Icon, StatusPill, ServerTimePipe, LoadError, ProblemList, RouterLink, FormsModule, NgTemplateOutlet],
  templateUrl: './report-page.html',
  styleUrl: './report-page.css',
})
export class ReportPage implements OnInit {
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
  readonly againJob = signal<JobRow | null>(null);
  readonly againError = signal('');
  readonly againBusy = signal(false);
  private againKey = idempotencyKey();
  private poll?: Subscription;
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  readonly size = size;

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
  readonly failedJobs = computed(() => this.r()?.jobs.filter(j => j.status === 'FAILED') ?? []);
  readonly running = computed(() => this.r()?.jobs.find(j => isRunning(j.status)) ?? null);
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin() && this.r()?.status !== 'ARCHIVED');
  readonly workspace = computed(() => this.auth.user()?.tenantName || '');
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

  /** Whether this person may approve a version: an approver who did not generate it, and it is not approved yet. */
  mayApprove(v: ReportVersionRow): boolean {
    return this.canApprove() && !v.approval && v.createdBy !== this.me();
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
        this.toast.success(a.signed ? `v${v.version} approved and its PDF signed.` : `v${v.version} approved. ${a.notSignedReason ?? ''}`);
        this.load();
      },
      error: e => { this.approving.set(false); this.toast.error(studioError(e).message); },
    });
  }

  verify(v: ReportVersionRow): void {
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
    return [...v.outputs].sort((a, b) => (a.format === 'PDF' ? -1 : 0) - (b.format === 'PDF' ? -1 : 0));
  }

  hasPdf(v: ReportVersionRow): boolean {
    return v.outputs.some(o => o.format === 'PDF');
  }

  formatsOf(v: ReportVersionRow): string {
    return v.outputs.map(o => o.format).join(' and ');
  }

  /** The data's label for a version: the pipeline run, the file or the pasted data. */
  dataOf(v: ReportVersionRow): string {
    return v.snapshot?.pipelineRunId ? `#${v.snapshot.pipelineRunId}` : v.snapshot?.label ?? '—';
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
