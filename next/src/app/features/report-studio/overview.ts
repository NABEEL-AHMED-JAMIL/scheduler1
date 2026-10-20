import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { StatStrip, StatStripItem } from '../../shared/ui/stat-strip';
import { StatusPill } from '../../shared/ui/status-pill';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { LoadError } from '../../shared/ui/load-error';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from './report-studio.api';
import { JobRow, StudioOverview, chipWord, isRunning, stageWord } from './report-studio.model';
import { GeneratedService, pipelineOf } from '../documents/generated/generated.service';
import { RunRow } from '../tasks/steps/steps.model';

/** A pipeline whose runs fed reports lately (the Overview's "Connected pipelines"), as the person may see it. */
export interface ConnectedPipeline {
  jobId: number; name: string; pipeline: string | null; lastRun: RunRow | null; templates: number; usedRun: number;
}

/** Error codes that mean the data does not fit the template: the way out is the field mapping. */
const MAPPING_CODES = new Set(['REQUIRED_FIELD_MISSING', 'BINDING_NOT_RESOLVED', 'DATA_SCHEMA_MISMATCH']);

/**
 * See results › Reports › Overview (MIG-403, MIG-404; the owner-approved screen 1, Figma frame 1; page report-studio): what
 * was made this month, the templates, the jobs running and failing, the pipelines that feed reports, and where to start. A
 * failed job is named with its code -- it made no version and the report keeps its last good one; a job blocked by the data
 * leads straight to the field mapping.
 */
@Component({
  selector: 'app-report-overview',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, StatStrip, StatusPill, ServerTimePipe, LoadError, RouterLink],
  templateUrl: './overview.html',
})
export class ReportOverview implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly generated = inject(GeneratedService);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  readonly data = signal<StudioOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly pipelines = signal<ConnectedPipeline[]>([]);
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;

  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly canTemplates = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canPublish = computed(() => this.auth.canOpen('report-publish') && !this.auth.isPlatformAdmin());
  readonly canData = computed(() => this.auth.canOpen('report-data'));
  readonly canLibrary = computed(() => this.auth.canOpen('report-library'));
  private readonly me = computed(() => this.auth.user()?.appUserId ?? null);

  readonly kpis = computed((): StatStripItem[] => {
    const f = this.data()?.figures;
    if (!f) return [];
    const rate = f.jobsFinishedThisMonth ? `${((f.jobsSucceededThisMonth / f.jobsFinishedThisMonth) * 100).toFixed(1)}%` : '—';
    return [
      { label: 'Reports this month', value: f.versionsThisMonth, icon: 'file', tone: 'info', foot: `${f.reports} report${f.reports === 1 ? '' : 's'} in all` },
      { label: 'Published templates', value: f.publishedTemplates, icon: 'template', tone: 'info',
        foot: f.templatesWithDrafts ? `${f.templatesWithDrafts} ha${f.templatesWithDrafts === 1 ? 's' : 've'} draft changes` : `${f.templates} template${f.templates === 1 ? '' : 's'} in all` },
      { label: 'Generated OK', value: rate, icon: 'checkCircle', tone: 'ok',
        foot: `${f.jobsSucceededThisMonth} of ${f.jobsFinishedThisMonth} jobs this month` },
      { label: 'Needs attention', value: f.failedLast7Days, icon: 'alert', tone: f.failedLast7Days ? 'crit' : 'muted',
        foot: f.running ? `${f.running} running now` : f.failedLast7Days ? 'failed jobs, last 7 days' : 'nothing failed this week' },
    ];
  });

  /** The newest failed job, when its report made no version since: the banner. */
  readonly blocked = computed(() => {
    const d = this.data();
    const j = d?.failedJobs[0];
    if (!j) return null;
    const later = d!.recentJobs.find(x => x.reportId === j.reportId && x.status === 'SUCCEEDED' && (x.createdAt ?? '') > (j.createdAt ?? ''));
    return later ? null : j;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.overview(this.auth.isPlatformAdmin() ? this.tenantId() : null).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); this.connect(d); },
      error: e => { this.error.set(studioError(e, 'The overview could not be read.').message); this.loading.set(false); },
    });
  }

  /**
   * The pipelines behind the runs reports were made from: the reader's schedules, the newest runs of the most recently run
   * ones, matched to the runs Report Studio used. A schedule the reader may not see is not listed.
   */
  private connect(d: StudioOverview): void {
    const used = d.pipelineRuns ?? [];
    this.pipelines.set([]);
    if (!used.length || this.auth.isPlatformAdmin()) return;
    this.generated.schedules().subscribe({
      next: all => {
        const recent = [...all].sort((a, b) => String(b.lastJobRun ?? '').localeCompare(String(a.lastJobRun ?? ''))).slice(0, 10);
        for (const job of recent) {
          this.generated.runs(job.jobId, 15).subscribe({
            next: runs => {
              const hits = used.filter(u => runs.some(r => r.jobQueueId === u.pipelineRunId));
              if (!hits.length) return;
              const templates = new Set(hits.flatMap(h => h.templateIds)).size;
              this.pipelines.update(list => [...list.filter(p => p.jobId !== job.jobId), {
                jobId: job.jobId, name: job.jobName ?? `Schedule ${job.jobId}`, pipeline: pipelineOf(job), lastRun: runs[0] ?? null, templates,
                usedRun: hits[0].pipelineRunId,
              }].slice(0, 4));
            },
            error: () => { /* a schedule whose runs the reader cannot read is left out */ },
          });
        }
      },
      error: () => this.pipelines.set([]),
    });
  }

  /** The run's state as the panel's chip says it ("Ran today", "Running", "Failed"). */
  runWord(r: RunRow | null): string {
    if (!r) return 'No runs';
    const s = String(r.jobStatus ?? '').toLowerCase();
    if (/run|start|queue/.test(s)) return 'Running';
    if (/fail|interrupt/.test(s)) return 'Failed';
    const at = r.endTime ?? r.startTime;
    return at && at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'Ran today' : 'Completed';
  }

  startedBy(j: JobRow): string {
    if (j.source && j.source !== 'CONSOLE') return 'Pipeline step';
    if (j.requestedBy && j.requestedBy === this.me()) return 'You';
    return j.requestedByName || 'A workspace member';
  }

  /** Whether a failed job's way out is the field mapping. */
  isMapping(j: JobRow): boolean {
    return MAPPING_CODES.has(j.errorCode ?? '');
  }

  fixMapping(j: JobRow): void {
    void this.router.navigate(['/reports/new'], { queryParams: { reportId: j.reportId } });
  }

  newReport(): void {
    void this.router.navigate(['/reports/new']);
  }

  newTemplate(): void {
    void this.router.navigate(['/reports/templates'], { queryParams: { new: 1 } });
  }
}
