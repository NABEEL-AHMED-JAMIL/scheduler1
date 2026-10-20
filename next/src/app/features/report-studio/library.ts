import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from './report-studio.api';
import { JobRow, ReportRow, chipWord, isRunning, stageWord } from './report-studio.model';
import { GeneratePanel, GeneratePanelData } from './generate-panel';

type View = 'reports' | 'jobs';

/**
 * See results › Reports › Reports (MIG-403, Figma frames 1 and 6; page report-library): every report with its current
 * version, and every generation job -- running ones followed live, failed ones with their code. A report's page has its
 * versions and lineage. The old Generated reports page's pipeline files are under "From pipelines" (render_pdf).
 */
@Component({
  selector: 'app-report-library',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, TableShell, StatusPill, Segmented, ServerTimePipe, RouterLink],
  templateUrl: './library.html',
})
export class ReportLibrary implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());
  private readonly destroy = inject(DestroyRef);

  readonly view = signal<View>('reports');
  readonly reports = signal<ReportRow[]>([]);
  readonly jobs = signal<JobRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly status = signal('');
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  private poll?: Subscription;

  readonly views: SegmentOption<View>[] = [{ id: 'reports', label: 'Reports' }, { id: 'jobs', label: 'Generation jobs' }];
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly canPipelineFiles = computed(() => this.auth.canOpen('tools-converter'));

  readonly shownReports = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.reports().filter(r => (!this.status() || r.status === this.status())
      && (!q || [r.name, r.label, r.templateName].some(v => (v ?? '').toLowerCase().includes(q))));
  });
  readonly shownJobs = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.jobs().filter(j => (!this.status() || j.status === this.status() || (this.status() === 'RUNNING' && isRunning(j.status)))
      && (!q || [j.label, j.reportName, j.templateName, j.errorCode].some(v => (v ?? '').toLowerCase().includes(q))));
  });

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('view') === 'jobs') this.view.set('jobs');
    this.load();
    // Running jobs move on their own: every five seconds while one is running.
    this.poll = interval(5000).subscribe(() => { if (this.jobs().some(j => isRunning(j.status))) this.load(true); });
    this.destroy.onDestroy(() => this.poll?.unsubscribe());
  }

  setView(v: View): void {
    this.view.set(v);
    this.status.set('');
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.error.set('');
    const scope = this.auth.isPlatformAdmin() ? this.tenantId() : null;
    this.api.reports('', scope).subscribe({
      next: r => { this.reports.set(r); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The reports could not be read.').message); this.loading.set(false); },
    });
    this.api.jobs('', scope).subscribe({ next: j => this.jobs.set(j), error: () => { /* the reports' error says enough */ } });
  }

  generate(): void {
    this.dialog.open<string | undefined, GeneratePanelData>(GeneratePanel, sidePanelConfig<GeneratePanelData>({}, 'wide', 'right'))
      .closed.subscribe(() => this.load());
  }
}
