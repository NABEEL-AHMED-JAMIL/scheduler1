import { TEMPLATE_DELETE_WORDS } from './template-page';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of, switchMap } from 'rxjs';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ListView, ViewToggle } from '../../shared/ui/view-toggle';
import { LoadError } from '../../shared/ui/load-error';
import { AppLoading } from '../../shared/ui/loading';
import { RsTimePipe } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from './report-studio.api';
import { StarterRow, TemplateDetail, TemplateRow } from './report-studio.model';
import { ImportTemplatePanel, NewTemplateData, NewTemplatePanel } from './template-panels';
import { TestPanel, TestPanelData } from './test-panel';
import { downloadJson } from './report-files';
import { RsTabCounts } from './rs-tab-counts';
import { SortHeader } from '../../shared/ui/sort-header';
import { createTableSort } from '../../shared/ui/sort';
import {
  GalleryFilters, GallerySort, HasFacet, NO_FILTERS, StatusFacet, facetCounts, featureChips, groupByCategory, isTest, sortTemplates,
  visibleStarters, visibleTemplates, withTestTag,
} from './templates-gallery';

/** The service's largest page; a workspace has tens of templates, so the gallery reads them all and pages on past 200. */
export const GALLERY_PAGE = 200;
/** At most this many pages of each list (2,000 templates); more than that is said on the page. */
const MAX_PAGES = 10;

interface AllTemplates { templates: TemplateRow[]; starters: StarterRow[]; total: number; }

/**
 * See results › Reports › Report templates (reports redesign, owner 2026-11-02; before it MIG-403/404's library). Every
 * template of the workspace, read at once and grouped by category as compact cards that say what each has (approvers,
 * QR, charts, images, conditional and repeated sections), how many reports it made and when the newest was, and its
 * state (vN published, draft vN+1). A facet column with counts -- Status, Category, Has, and Hidden: test templates
 * (tag "test") and the platform's starters -- the search, three orders (Name, Most used, Recently changed) and a table.
 * A starter is copied into the workspace, never shared live; Import takes a template's JSON; ?new=1 opens New template.
 */
@Component({
  selector: 'app-report-templates',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, RsTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger,
    Segmented, ViewToggle, SortHeader, LoadError, AppLoading, NgTemplateOutlet],
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

  /** Every template of the scope, archived ones included (the Archived facet), and the platform's starters. */
  readonly rows = signal<TemplateRow[]>([]);
  readonly starters = signal<StarterRow[]>([]);
  /** More templates than the gallery reads (MAX_PAGES pages): said on the page. */
  readonly capped = signal(false);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly filters = signal<GalleryFilters>({ ...NO_FILTERS });
  readonly view = signal<ListView>('cards');
  /** The facet column below 1100 px opens from the Filters button. */
  readonly facetsOpen = signal(false);
  /** Each template's first page (an object URL), as the pictures arrive. */
  readonly thumbs = signal<Record<string, string>>({});
  private readonly asked = new Set<string>();
  readonly featureChips = featureChips;
  readonly isTest = isTest;

  /** Editing is report-templates' and a workspace member's (a platform administrator reads). */
  readonly canEdit = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  /**
   * One order for the cards and the table: Most used first (the design's), Name or Recently changed from the segmented
   * control, or any table heading (Category too). Remembered per browser like every table's sort.
   */
  readonly sort = createTableSort<TemplateRow>({
    id: 'report-templates-gallery', initial: { key: 'used', direction: 'desc' },
    columns: {
      name: { value: t => t.name, kind: 'text' },
      category: { value: t => t.category, kind: 'text' },
      used: { value: t => t.reportCount ?? 0, kind: 'number', first: 'desc' },
      changed: { value: t => t.updatedAt, kind: 'date', first: 'desc' },
    },
  });
  readonly sortOptions: SegmentOption<GallerySort>[] = [
    { id: 'name', label: 'Name' }, { id: 'used', label: 'Most used' }, { id: 'changed', label: 'Recently changed' },
  ];
  readonly sortPick = computed(() => this.sort.key() as GallerySort);

  readonly counts = computed(() => facetCounts(this.rows(), this.starters(), this.filters()));
  readonly visible = computed(() => {
    const rows = visibleTemplates(this.rows(), this.filters());
    const key = this.sort.key();
    if (key === 'name' || key === 'used' || key === 'changed') return sortTemplates(rows, key, this.sort.direction());
    return this.sort.apply(sortTemplates(rows, 'name'));
  });
  readonly groups = computed(() => groupByCategory(this.visible()));
  readonly shownStarters = computed(() => visibleStarters(this.starters(), this.filters()));
  /** The workspace has no template at all (archived ones aside). */
  readonly noTemplates = computed(() => this.loaded() && !this.rows().some(t => t.status !== 'ARCHIVED'));
  readonly filtering = computed(() => {
    const f = this.filters();
    return !!(f.q.trim() || f.status.length || f.category.length || f.has.length);
  });
  readonly hiddenTests = computed(() => (this.filters().tests ? 0 : this.counts().tests));

  constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u)));
    // The first page of each template on show, once per change of the template.
    effect(() => {
      const rows = this.visible();
      untracked(() => rows.forEach(t => this.thumb(t)));
    });
  }

  ngOnInit(): void {
    this.load();
    if (this.route.snapshot.queryParamMap.get('new') && this.canEdit()) this.create(null);
  }

  /** The workspace's own brand colour for the starters' page sketches, from its default brand profile. */
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

  /** Another workspace picked (and the first read): the brand, the tab counts and every template again. */
  load(): void {
    const scope = this.scope();
    this.tabCounts.refresh(scope);
    this.loadBrand(scope);
    this.read();
  }

  /** The refresh button. */
  refresh(): void {
    this.load();
  }

  private generation = 0;

  /** Every template, the live ones and the archived ones side by side, each read 200 at a time. */
  read(): void {
    this.loading.set(true);
    this.error.set('');
    const asked = ++this.generation;
    const scope = this.scope();
    forkJoin([this.all(false, scope), this.all(true, scope)]).subscribe({
      next: ([live, archived]) => {
        if (asked !== this.generation) return;
        this.rows.set([...live.templates, ...archived.templates]);
        this.starters.set(live.starters);
        this.capped.set(live.templates.length < live.total || archived.templates.length < archived.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: e => {
        if (asked !== this.generation) return;
        this.error.set(studioError(e, 'The templates could not be read.').message);
        this.loading.set(false);
      },
    });
  }

  private all(archived: boolean, scope: number | null): Observable<AllTemplates> {
    const step = (offset: number, got: TemplateRow[]): Observable<AllTemplates> =>
      this.api.list({ archived, limit: GALLERY_PAGE, offset }, scope).pipe(switchMap(lib => {
        const rows = [...got, ...lib.templates];
        const more = lib.templates.length > 0 && rows.length < lib.total && offset / GALLERY_PAGE < MAX_PAGES - 1;
        return more ? step(offset + GALLERY_PAGE, rows) : of({ templates: rows, starters: lib.starters ?? [], total: lib.total });
      }));
    return step(0, []);
  }

  private scope(): number | null {
    return this.isPlatformAdmin() ? this.tenantId() : null;
  }

  // ---------------------------------------------------------------- facets

  isOn(group: 'status' | 'category' | 'has', value: string): boolean {
    return (this.filters()[group] as string[]).includes(value);
  }

  toggle(group: 'status', value: StatusFacet): void;
  toggle(group: 'has', value: HasFacet): void;
  toggle(group: 'category', value: string): void;
  toggle(group: 'status' | 'category' | 'has', value: string): void {
    this.filters.update(f => {
      const list = f[group] as string[];
      return { ...f, [group]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });
  }

  setHidden(which: 'tests' | 'starters', on: boolean): void {
    this.filters.update(f => ({ ...f, [which]: on }));
  }

  onSearch(q: string): void {
    this.filters.update(f => ({ ...f, q }));
  }

  /** Clears the search and the facets; what Hidden shows stays as it is. */
  clearFilters(): void {
    this.filters.update(f => ({ ...NO_FILTERS, tests: f.tests, starters: f.starters }));
  }

  setSort(by: GallerySort): void {
    this.sort.set({ key: by, direction: by === 'name' ? 'asc' : 'desc' });
  }

  // ---------------------------------------------------------------- one template

  /** A template's first page as a picture (drawn by the server once per version). */
  private thumb(t: TemplateRow): void {
    const key = t.templateId + ':' + (t.updatedAt ?? '');
    if (this.asked.has(key)) return;
    this.asked.add(key);
    const scope = this.scope() ?? (this.isPlatformAdmin() ? t.tenantId : null);
    this.api.templateThumbnail(t.templateId, null, scope).subscribe({
      next: r => {
        if (!r.body || !(r.headers.get('Content-Type') ?? '').includes('png')) return;
        const url = URL.createObjectURL(r.body);
        this.thumbs.update(m => { if (m[t.templateId]) URL.revokeObjectURL(m[t.templateId]); return { ...m, [t.templateId]: url }; });
      },
      error: () => { /* the card shows a page outline instead */ },
    });
  }

  /** "v2 published · draft v3": the pills a card and a row show. */
  draftVersion(t: TemplateRow): number {
    return (t.currentPublishedVersion ?? 0) + 1;
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

  /** "Edit": the designer, starting a draft from the newest version when there is none. */
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

  /** Mark as test / Not a test: the tag "test" alone, no draft; the card hides (or comes back) at once. */
  markTest(t: TemplateRow, on: boolean): void {
    this.api.setTags(t.templateId, withTestTag(t.tags, on), t.rowVersion).subscribe({
      next: d => {
        this.rows.update(rows => rows.map(r => (r.templateId === t.templateId
          ? { ...r, tags: d.tags ?? withTestTag(t.tags, on), test: d.test ?? on, rowVersion: d.rowVersion ?? r.rowVersion, updatedAt: d.updatedAt ?? r.updatedAt }
          : r)));
        this.toast.success(on ? `${t.name} is a test template now: hidden unless "Test templates" is ticked.` : `${t.name} is no longer a test template.`);
      },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  archive(t: TemplateRow): void {
    void confirmWith(this.dialog, { title: `Archive ${t.name}?`, body: 'It leaves the gallery and no new report can be made from it. '
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
