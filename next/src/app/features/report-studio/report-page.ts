import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error';
import { confirmWith } from '../../shared/ui/confirm';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import { OutputRow, ReportDetail, ReportVersionRow, chipWord, isRunning, size, stageWord } from './report-studio.model';
import { GeneratePanel, GeneratePanelData } from './generate-panel';
import { fileNameOf, saveBlob } from './report-files';

type Tab = 'details' | 'versions' | 'activity';

/**
 * One report (MIG-403, Figma frame 6; page report-library): its current version with its files and where it came from
 * -- the template version, the data snapshot, the job -- every version (never overwritten), its jobs (a failed one made
 * no version) and its activity. Downloads go through a signed link, the reader's own, valid five minutes; each one is
 * recorded. "Generate again" makes the next version from a newer run, a corrected file or pasted data.
 */
@Component({
  selector: 'app-report-page',
  imports: [PageHeader, RefreshButton, Icon, StatusPill, Segmented, ServerTimePipe, LoadError, ProblemList, RouterLink],
  templateUrl: './report-page.html',
})
export class ReportPage implements OnInit {
  readonly reportId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly r = signal<ReportDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tab = signal<Tab>('details');
  readonly downloading = signal('');
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  readonly size = size;

  readonly tabs = computed<SegmentOption<Tab>[]>(() => [
    { id: 'details', label: 'Details' },
    { id: 'versions', label: `Versions (${this.r()?.versions.length ?? 0})` },
    { id: 'activity', label: `Activity (${this.r()?.activity.length ?? 0})` },
  ]);
  readonly current = computed<ReportVersionRow | undefined>(() => {
    const r = this.r();
    return r?.versions.find(v => v.version === r.currentVersion);
  });
  readonly lastFailed = computed(() => {
    const r = this.r();
    const failed = r?.jobs.find(j => j.status === 'FAILED');
    const newest = r?.jobs[0];
    return failed && newest && failed.jobId === newest.jobId ? failed : null;
  });
  readonly running = computed(() => this.r()?.jobs.find(j => isRunning(j.status)) ?? null);
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin() && this.r()?.status !== 'ARCHIVED');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.report(this.reportId()).subscribe({
      next: r => { this.r.set(r); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The report could not be read.').message); this.loading.set(false); },
    });
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

  again(): void {
    const r = this.r();
    if (!r) return;
    this.dialog.open<string | undefined, GeneratePanelData>(GeneratePanel, sidePanelConfig<GeneratePanelData>({
      reportId: r.reportId, reportName: r.name,
    }, 'wide', 'right')).closed.subscribe(() => this.load());
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
