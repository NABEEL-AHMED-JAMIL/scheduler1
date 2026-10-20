import { TEMPLATE_DELETE_WORDS } from './template-page';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ListView, ViewToggle } from '../../shared/ui/view-toggle';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from './report-studio.api';
import { StarterRow, TemplateDetail, TemplateRow, chipWord, originWord } from './report-studio.model';
import { ImportTemplatePanel, NewTemplateData, NewTemplatePanel } from './template-panels';
import { TestPanel, TestPanelData } from './test-panel';
import { downloadJson } from './report-files';

/** Which templates the library shows (Figma frame 2's tabs). */
type Group = 'all' | 'workspace' | 'starters' | 'shared';

/** One card or row of the library: a workspace template, or a platform starter. */
export interface LibraryItem {
  kind: 'template' | 'starter';
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  template?: TemplateRow;
  starter?: StarterRow;
}

/**
 * See results › Reports › Templates (MIG-403, MIG-404; the owner-approved screen 2, Figma frame 2; page report-templates,
 * read by report-generate too): the workspace's templates and the platform's starters as cards with their first page, or
 * as a table; All, This workspace, Starters and Shared with me; search, category, state and owner. A starter is copied into
 * the workspace, never shared live; "Make a copy" makes a new template with its own history; Import takes a template's
 * JSON. Published versions never change: edits go into a draft, in the designer.
 */
@Component({
  selector: 'app-report-templates',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, TableShell, StatusPill, ServerTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger,
    Segmented, ViewToggle],
  templateUrl: './templates.html',
  styleUrl: './templates.css',
})
export class ReportTemplates implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  readonly templates = signal<TemplateRow[]>([]);
  readonly starters = signal<StarterRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly state = signal('');
  readonly category = signal('');
  readonly owner = signal('');
  readonly group = signal<Group>('all');
  readonly view = signal<ListView>('cards');
  readonly archived = signal(false);
  /** Each template's first page (an object URL) and how many pages it has, as the thumbnails arrive. */
  readonly thumbs = signal<Record<string, string>>({});
  readonly pages = signal<Record<string, number>>({});
  readonly chipWord = chipWord;
  readonly originWord = originWord;

  /** Editing is report-templates' and a workspace member's (a platform administrator reads). */
  readonly canEdit = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly isAdmin = computed(() => this.auth.role() === 'TENANT_ADMIN' || this.auth.isPlatformAdmin());
  private readonly me = computed(() => this.auth.user()?.appUserId ?? null);

  readonly items = computed<LibraryItem[]>(() => [
    ...this.templates().map(t => ({ kind: 'template' as const, id: t.templateId, name: t.name, description: t.description, category: t.category, template: t })),
    ...this.starters().map(s => ({ kind: 'starter' as const, id: 'starter:' + s.key, name: s.name, description: s.description, category: s.category, starter: s })),
  ]);
  readonly groups = computed<SegmentOption<Group>[]>(() => [
    { id: 'all', label: `All ${this.items().length}` },
    { id: 'workspace', label: `This workspace ${this.templates().length}` },
    { id: 'starters', label: `Starters ${this.starters().length}` },
    { id: 'shared', label: 'Shared with me 0', title: 'Sharing between workspaces comes with Teams' },
  ]);
  readonly categories = computed(() => [...new Set(this.items().map(i => i.category).filter((c): c is string => !!c))].sort());

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const g = this.group();
    return this.items().filter(i => {
      if (g === 'shared') return false;
      if (g === 'workspace' && i.kind !== 'template') return false;
      if (g === 'starters' && i.kind !== 'starter') return false;
      if (this.category() && i.category !== this.category()) return false;
      const t = i.template;
      if (this.state()) {
        if (!t) return this.state() === 'PUBLISHED';
        if (this.state() === 'HAS_DRAFT' ? !t.hasDraft : t.status !== this.state()) return false;
      }
      if (this.owner()) {
        if (!t) return this.owner() === 'starter';
        if (this.owner() === 'me' && t.createdBy !== this.me()) return false;
        if (this.owner() === 'starter' && t.origin !== 'STARTER') return false;
        if (this.owner() === 'copy' && t.origin !== 'COPY' && t.origin !== 'IMPORT') return false;
      }
      return !q || [i.name, i.description, i.category, ...(t?.tags ?? [])].some(v => (v ?? '').toLowerCase().includes(q));
    });
  });
  readonly shownTemplates = computed(() => this.filtered().filter(i => i.kind === 'template').length);

  constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u)));
  }

  ngOnInit(): void {
    this.load();
    if (this.route.snapshot.queryParamMap.get('new') && this.canEdit()) this.create(null);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const scope = this.isPlatformAdmin() ? this.tenantId() : null;
    this.api.list(this.archived(), scope).subscribe({
      next: lib => {
        this.templates.set(lib.templates);
        this.starters.set(lib.starters);
        this.loading.set(false);
        lib.templates.slice(0, 48).forEach(t => this.thumb(t, scope));
      },
      error: e => { this.error.set(studioError(e, 'The templates could not be read.').message); this.loading.set(false); },
    });
  }

  /** A template's first page as a picture (drawn by the server once per version), and its page count. */
  private thumb(t: TemplateRow, scope: number | null): void {
    if (this.thumbs()[t.templateId + ':' + t.updatedAt]) return;
    this.api.templateThumbnail(t.templateId, null, scope ?? (this.isPlatformAdmin() ? t.tenantId : null)).subscribe({
      next: r => {
        if (!r.body || !(r.headers.get('Content-Type') ?? '').includes('png')) return;
        const url = URL.createObjectURL(r.body);
        this.thumbs.update(m => { if (m[t.templateId]) URL.revokeObjectURL(m[t.templateId]); return { ...m, [t.templateId]: url }; });
        const n = Number(r.headers.get('X-Report-Pages'));
        if (n > 0) this.pages.update(m => ({ ...m, [t.templateId]: n }));
      },
      error: () => { /* the card shows its page outline instead */ },
    });
  }

  showArchived(on: boolean): void {
    this.archived.set(on);
    this.load();
  }

  pagesOf(t: TemplateRow): string {
    const n = this.pages()[t.templateId];
    return n ? `${n} page${n === 1 ? '' : 's'}` : '';
  }

  /** Who made it, as the card says it: you, a starter, a copy, an import, or the workspace. */
  ownerOf(t: TemplateRow): string {
    if (t.createdBy && t.createdBy === this.me()) return 'You';
    return t.origin === 'STARTER' ? originWord(t).replace(/^From the /, 'From ') : t.origin === 'BLANK' ? 'This workspace' : originWord(t);
  }

  create(starter: StarterRow | null): void {
    this.openNew({ starter });
  }

  copy(t: TemplateRow): void {
    this.openNew({ copyOf: { templateId: t.templateId, name: t.name } });
  }

  private openNew(data: NewTemplateData): void {
    this.dialog.open<TemplateDetail | undefined, NewTemplateData>(NewTemplatePanel, sidePanelConfig(data, 'narrow', 'right')).closed
      .subscribe(t => { if (t) void this.router.navigate(['/reports/templates', t.templateId, 'design']); });
  }

  importJson(): void {
    this.dialog.open<TemplateDetail | undefined>(ImportTemplatePanel, sidePanelConfig({}, 'wide', 'right')).closed
      .subscribe(t => { if (t) void this.router.navigate(['/reports/templates', t.templateId, 'design']); });
  }

  /** "Edit draft": the designer, starting a draft from the newest version when there is none. */
  edit(t: TemplateRow): void {
    if (t.hasDraft || !t.currentPublishedVersion) { void this.router.navigate(['/reports/templates', t.templateId, 'design']); return; }
    this.api.newDraft(t.templateId, t.currentPublishedVersion).subscribe({
      next: () => void this.router.navigate(['/reports/templates', t.templateId, 'design']),
      error: e => this.toast.error(studioError(e).message),
    });
  }

  createReport(t: TemplateRow): void {
    void this.router.navigate(['/reports/new'], { queryParams: { templateId: t.templateId } });
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
    void confirmWith(this.dialog, { title: `Delete ${t.name}?`, body: TEMPLATE_DELETE_WORDS, confirmLabel: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      this.api.remove(t.templateId).subscribe({
        next: () => { this.toast.success(`${t.name} deleted.`); this.load(); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }
}
