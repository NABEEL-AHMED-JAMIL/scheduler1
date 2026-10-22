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
import { Pagination } from '../../shared/ui/pagination';
import { PAGE_SIZES } from '../../shared/ui/pager';
import { RsTimePipe } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { ReportStudioApi, TemplateQuery, studioError } from './report-studio.api';
import { StarterRow, TemplateDetail, TemplateRow, chipWord, originWord } from './report-studio.model';
import { ImportTemplatePanel, NewTemplateData, NewTemplatePanel } from './template-panels';
import { TestPanel, TestPanelData } from './test-panel';
import { downloadJson } from './report-files';
import { RsTabCounts } from './rs-tab-counts';

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
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, TableShell, StatusPill, RsTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger,
    Segmented, ViewToggle, Pagination],
  templateUrl: './templates.html',
  styleUrl: './templates.css',
  host: { '[style.--rst-brand]': 'brandColour()' },
})
export class ReportTemplates implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly tabCounts = inject(RsTabCounts);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  /** One page of the workspace's templates, as the service answers it; the starters are all of them (a handful, from the code). */
  readonly templates = signal<TemplateRow[]>([]);
  readonly starters = signal<StarterRow[]>([]);
  /** How many templates the filters match in all, and how many the scope has before them. */
  readonly templateTotal = signal(0);
  readonly templateCount = signal(0);
  readonly serverCategories = signal<string[]>([]);
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);
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

  /** The starters the filters let through (the old client rules: a starter reads as published and as "from a starter"). */
  readonly starterMatches = computed<StarterRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    return this.starters().filter(s => (!this.category() || s.category === this.category())
      && (!this.state() || this.state() === 'PUBLISHED') && (!this.owner() || this.owner() === 'starter')
      && (!q || [s.name, s.description, s.category].some(v => (v ?? '').toLowerCase().includes(q))));
  });
  private readonly withTemplates = computed(() => this.group() === 'all' || this.group() === 'workspace');
  private readonly withStarters = computed(() => this.group() === 'all' || this.group() === 'starters');
  /**
   * Owner 2026-10-20: the library pages on the server. One list -- the workspace's templates (newest change first, a page
   * at a time from the service), then the matching starters -- cut into pages: page p shows its window of both.
   */
  readonly total = computed(() => (this.withTemplates() ? this.templateTotal() : 0) + (this.withStarters() ? this.starterMatches().length : 0));
  readonly filtered = computed<LibraryItem[]>(() => {
    if (this.group() === 'shared') return [];
    const start = (this.page() - 1) * this.size();
    const end = start + this.size();
    const before = this.withTemplates() ? this.templateTotal() : 0;
    const rows = this.withTemplates() ? this.templates() : [];
    const starters = this.withStarters() ? this.starterMatches().slice(Math.max(0, start - before), Math.max(0, end - before)) : [];
    return [
      ...rows.map(t => ({ kind: 'template' as const, id: t.templateId, name: t.name, description: t.description, category: t.category, template: t })),
      ...starters.map(s => ({ kind: 'starter' as const, id: 'starter:' + s.key, name: s.name, description: s.description, category: s.category, starter: s })),
    ];
  });
  readonly groups = computed<SegmentOption<Group>[]>(() => [
    { id: 'all', label: `All ${this.templateCount() + this.starters().length}` },
    { id: 'workspace', label: `This workspace ${this.templateCount()}` },
    { id: 'starters', label: `Starters ${this.starters().length}` },
    { id: 'shared', label: 'Shared with me 0', title: 'Sharing between workspaces comes with Teams' },
  ]);
  readonly categories = computed(() => [...new Set([...this.serverCategories(), ...this.starters().map(s => s.category)]
    .filter((c): c is string => !!c))].sort());
  readonly filtering = computed(() => !!(this.search().trim() || this.state() || this.category() || this.owner()));
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Answers come back in any order: only the latest read's is kept. */
  private asked = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u));
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  ngOnInit(): void {
    this.load();
    if (this.route.snapshot.queryParamMap.get('new') && this.canEdit()) this.create(null);
  }

  /** The workspace's own brand colour for the starters' page sketches (drawing 2), from its default brand profile. */
  readonly brandColour = signal<string | null>(null);

  private loadBrand(scope: number | null): void {
    this.api.brandProfiles(scope).subscribe({
      next: rows => {
        const d = rows.find(r => r.isDefault && r.status === 'ACTIVE');
        if (!d) { this.brandColour.set(null); return; }
        this.api.brandProfile(d.profileId, scope).subscribe({
          next: p => {
            const c = (p.published ?? p.draft)?.definition?.colors?.primary ?? null;
            this.brandColour.set(c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null);
          },
          error: () => this.brandColour.set(null),
        });
      },
      error: () => this.brandColour.set(null),
    });
  }

  /** Another workspace picked (and the first read): the brand, the tab counts and the list again, from the first page. */
  load(): void {
    this.page.set(1);
    this.refresh();
  }

  /** The refresh button: the brand, the tab counts and the page the reader is on. */
  refresh(): void {
    const scope = this.scope();
    this.tabCounts.refresh(scope);
    this.loadBrand(scope);
    this.read();
  }

  /** The current page, with its filters, as the service answers it (the starters come with every answer). */
  read(): void {
    this.loading.set(true);
    this.error.set('');
    const asked = ++this.asked;
    const scope = this.scope();
    const start = (this.page() - 1) * this.size();
    const owner = this.owner() === 'starter' ? 'STARTER' : this.owner() === 'copy' ? 'COPY' : this.owner() === 'me' ? 'ME' : '';
    const query: TemplateQuery = { archived: this.archived(), q: this.search(), category: this.category(), state: this.state(), owner,
      limit: this.size(), offset: start };
    this.api.list(query, scope).subscribe({
      next: lib => {
        if (asked !== this.asked) return;
        this.starters.set(lib.starters);
        this.templateTotal.set(lib.total);
        this.templateCount.set(lib.counts.templates);
        this.serverCategories.set(lib.categories);
        // A page emptied under the reader (templates archived or deleted): the last page that still has rows.
        if (this.page() > 1 && start >= this.total() && this.total() > 0) {
          this.page.set(Math.ceil(this.total() / this.size()));
          this.read();
          return;
        }
        this.templates.set(this.withTemplates() ? lib.templates : []);
        this.loading.set(false);
        if (this.withTemplates()) lib.templates.forEach(t => this.thumb(t, scope));
      },
      error: e => {
        if (asked !== this.asked) return;
        this.error.set(studioError(e, 'The templates could not be read.').message);
        this.loading.set(false);
      },
    });
  }

  private scope(): number | null {
    return this.isPlatformAdmin() ? this.tenantId() : null;
  }

  setGroup(g: Group): void { this.group.set(g); this.page.set(1); this.read(); }
  setCategory(c: string): void { this.category.set(c); this.page.set(1); this.read(); }
  setState(v: string): void { this.state.set(v); this.page.set(1); this.read(); }
  setOwner(v: string): void { this.owner.set(v); this.page.set(1); this.read(); }
  goTo(page: number): void { this.page.set(page); this.read(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.read(); }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.read(); }, 300);
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
    this.page.set(1);
    this.read();
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
        next: () => { this.toast.success(`${t.name} archived.`); this.refresh(); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }

  remove(t: TemplateRow): void {
    void confirmWith(this.dialog, { title: `Delete ${t.name}?`, body: TEMPLATE_DELETE_WORDS, confirmLabel: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      this.api.remove(t.templateId).subscribe({
        next: () => { this.toast.success(`${t.name} deleted.`); this.refresh(); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }
}
