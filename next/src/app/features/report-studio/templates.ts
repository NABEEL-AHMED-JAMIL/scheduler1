import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ReportStudioApi, studioError } from './report-studio.api';
import { StarterRow, TemplateDetail, TemplateRow, chipWord, originWord } from './report-studio.model';
import { ImportTemplatePanel, NewTemplateData, NewTemplatePanel } from './template-panels';
import { TestPanel, TestPanelData } from './test-panel';
import { downloadJson } from './report-files';

/**
 * See results › Reports › Templates (MIG-403, Figma frame 2; page report-templates, read by report-generate too): the
 * workspace's templates and the platform's starters. A starter is copied into the workspace, never shared live; "Make a
 * copy" makes a new template with its own history; Import takes a template's JSON. Published versions never change.
 */
@Component({
  selector: 'app-report-templates',
  imports: [PageHeader, RefreshButton, Icon, TableShell, StatusPill, ServerTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './templates.html',
})
export class ReportTemplates implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly workspaces = inject(WorkspaceDirectory);

  readonly templates = signal<TemplateRow[]>([]);
  readonly starters = signal<StarterRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly state = signal('');
  readonly archived = signal(false);
  readonly chipWord = chipWord;
  readonly originWord = originWord;

  /** Editing is report-templates' and a workspace member's (a platform administrator reads). */
  readonly canEdit = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.templates().filter(t => (!this.state() || t.status === this.state() || (this.state() === 'HAS_DRAFT' && t.hasDraft))
      && (!q || [t.name, t.description, t.category, ...(t.tags ?? [])].some(v => (v ?? '').toLowerCase().includes(q))));
  });

  ngOnInit(): void {
    this.load();
    if (this.route.snapshot.queryParamMap.get('new') && this.canEdit()) this.create(null);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.archived(), this.isPlatformAdmin() ? this.workspaces.remembered() : null).subscribe({
      next: lib => { this.templates.set(lib.templates); this.starters.set(lib.starters); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The templates could not be read.').message); this.loading.set(false); },
    });
  }

  showArchived(on: boolean): void {
    this.archived.set(on);
    this.load();
  }

  create(starter: StarterRow | null): void {
    this.openNew({ starter });
  }

  copy(t: TemplateRow): void {
    this.openNew({ copyOf: { templateId: t.templateId, name: t.name } });
  }

  private openNew(data: NewTemplateData): void {
    this.dialog.open<TemplateDetail | undefined, NewTemplateData>(NewTemplatePanel, sidePanelConfig(data, 'narrow', 'right')).closed
      .subscribe(t => { if (t) void this.router.navigate(['/reports/templates', t.templateId]); });
  }

  importJson(): void {
    this.dialog.open<TemplateDetail | undefined>(ImportTemplatePanel, sidePanelConfig({}, 'wide', 'right')).closed
      .subscribe(t => { if (t) void this.router.navigate(['/reports/templates', t.templateId]); });
  }

  test(t: TemplateRow): void {
    this.api.template(t.templateId).subscribe({
      next: detail => this.dialog.open<boolean, TestPanelData>(TestPanel, sidePanelConfig<TestPanelData>({
        templateId: t.templateId, title: t.name, version: null, samples: detail.samples, canKeep: this.canEdit(),
      }, 'wide', 'right')),
      error: e => this.toast.error(studioError(e).message),
    });
  }

  exportJson(t: TemplateRow): void {
    const version = t.hasDraft ? 'draft' : String(t.currentPublishedVersion ?? 'draft');
    this.api.exportJson(t.templateId, version).subscribe({
      next: doc => downloadJson(doc, `${t.name}.template.json`),
      error: e => this.toast.error(studioError(e).message),
    });
  }

  archive(t: TemplateRow): void {
    void confirmWith(this.dialog, { title: `Archive ${t.name}?`, body: 'It leaves the library and no new report can be made from it. '
      + 'Its versions and the reports made from it are kept.', confirmLabel: 'Archive' }).then(ok => {
      if (!ok) return;
      this.api.archive(t.templateId).subscribe({
        next: () => { this.toast.success(`${t.name} archived.`); this.load(); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }

  remove(t: TemplateRow): void {
    void confirmWith(this.dialog, { title: `Delete ${t.name}?`, body: 'Only a template that was never published and made no report can be '
      + 'deleted; anything else is archived instead.', confirmLabel: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      this.api.remove(t.templateId).subscribe({
        next: () => { this.toast.success(`${t.name} deleted.`); this.load(); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }
}
