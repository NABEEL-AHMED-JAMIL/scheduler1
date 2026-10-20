import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { StatStrip, StatStripItem } from '../../shared/ui/stat-strip';
import { StatusPill } from '../../shared/ui/status-pill';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { LoadError } from '../../shared/ui/load-error';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ReportStudioApi, studioError } from './report-studio.api';
import { StudioOverview, chipWord, isRunning, stageWord } from './report-studio.model';
import { GeneratePanel, GeneratePanelData } from './generate-panel';

/**
 * See results › Reports › Overview (MIG-403, Figma frame 1; page report-studio): what was made this month, the
 * templates, the jobs running and failing, and where to start. A failed job is named with its code -- it made no
 * version and the report keeps its last good one.
 */
@Component({
  selector: 'app-report-overview',
  imports: [PageHeader, RefreshButton, Icon, StatStrip, StatusPill, ServerTimePipe, LoadError, RouterLink],
  templateUrl: './overview.html',
})
export class ReportOverview implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspaceDirectory);

  readonly data = signal<StudioOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;

  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly canTemplates = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canData = computed(() => this.auth.canOpen('report-data'));
  readonly canLibrary = computed(() => this.auth.canOpen('report-library'));

  readonly kpis = computed((): StatStripItem[] => {
    const f = this.data()?.figures;
    if (!f) return [];
    const rate = f.jobsFinishedThisMonth ? `${((f.jobsSucceededThisMonth / f.jobsFinishedThisMonth) * 100).toFixed(1)}%` : '—';
    return [
      { label: 'Report versions this month', value: f.versionsThisMonth, icon: 'file', tone: 'info', foot: `${f.reports} reports in all` },
      { label: 'Published templates', value: f.publishedTemplates, icon: 'template', tone: 'info',
        foot: f.templatesWithDrafts ? `${f.templatesWithDrafts} with draft changes` : `${f.templates} templates in all` },
      { label: 'Generated OK', value: rate, icon: 'checkCircle', tone: 'ok',
        foot: `${f.jobsSucceededThisMonth} of ${f.jobsFinishedThisMonth} jobs this month` },
      { label: 'Needs attention', value: f.failedLast7Days, icon: 'alert', tone: f.failedLast7Days ? 'crit' : 'muted',
        foot: f.running ? `${f.running} running now` : 'failed jobs, last 7 days' },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.overview(this.auth.isPlatformAdmin() ? this.workspaces.remembered() : null).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The overview could not be read.').message); this.loading.set(false); },
    });
  }

  generate(): void {
    this.dialog.open<string | undefined, GeneratePanelData>(GeneratePanel, sidePanelConfig<GeneratePanelData>({}, 'wide', 'right'))
      .closed.subscribe(() => this.load());
  }

  newTemplate(): void {
    void this.router.navigate(['/reports/templates'], { queryParams: { new: 1 } });
  }
}
