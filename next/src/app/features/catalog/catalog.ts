import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NeedsWorkspace } from '../../shared/ui/needs-workspace';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { Pagination } from '../../shared/ui/pagination';
import { PAGE_SIZES } from '../../shared/ui/pager';
import { SegmentOption, Segmented } from '../../shared/ui/segmented';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { StatStrip, StatStripItem } from '../../shared/ui/stat-strip';
import { CatalogApi } from './catalog.api';
import { CatalogAsset, CatalogSummary, freshnessText, kindText, sensitivityTone, tagText, whereText } from './catalog.model';
import { CatalogPanel, CatalogPanelData } from './catalog-panel';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { createLoadState, loadErrorText } from '../../shared/ui/loading';
import { createTableSort } from '../../shared/ui/sort';
import { SortHeader } from '../../shared/ui/sort-header';

type KindFilter = '' | 'dataset' | 'file' | 'document_type';

/**
 * Data › Data Catalog (Wave 5, MIG-288; page 'data-catalog'): every dataset, file and document type of the workspace --
 * what it holds, who owns it, how fresh it is, which fields are sensitive and how complete it is. The strip counts
 * and filters (sensitive, stale, without an owner); the chips narrow by kind; the search reads names, paths,
 * descriptions, columns and tags. A row opens its asset in a panel: details, columns and tags, lineage, access.
 * ?flag=, ?q= and ?asset= open the page that way (the strip's tiles link to themselves with a flag).
 *
 * Paged on the server (UI review U4, P2 #29): kind, flag and text are all filtered there, the heading says "N of M"
 * from the server's total, and a new search cancels the one still in flight so a slow answer cannot overwrite it.
 */
@Component({
  selector: 'app-catalog',
  imports: [RefreshButton, PageHeader, NeedsWorkspace, StatStrip, TableShell, Icon, Segmented, Pagination, RouterLink, SortHeader],
  templateUrl: './catalog.html',
})
export class Catalog implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly auth = inject(AuthService);
  /**
   * ZT-A12 (owner 2026-10-21, "Managed session only"): a platform administrator's own sign-in has no workspace, and
   * the catalog answers it 403 on a workspace's data; the page says so (NeedsWorkspace) and makes no call.
   */
  readonly noWorkspace = computed(() => !!this.auth.isPlatformAdmin?.() && !this.auth.user?.()?.tenantId);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

  /** ?flag=sensitive|stale|noOwner, ?q=, ?asset= (an asset to open). */
  readonly flagParam = input<string | undefined>(undefined, { alias: 'flag' });
  readonly qParam = input<string | undefined>(undefined, { alias: 'q' });
  readonly assetParam = input<string | undefined>(undefined, { alias: 'asset' });

  readonly assets = signal<CatalogAsset[]>([]);
  readonly summary = signal<CatalogSummary | null>(null);
  /** Owner 2026-10-27: the strip's read -- placeholders until it answers, "Not available right now" when it fails. */
  readonly summaryState = createLoadState();
  readonly loading = signal(true);
  readonly error = signal('');
  readonly kind = signal<KindFilter>('');
  readonly flag = signal('');
  readonly search = signal('');
  readonly withDeleted = signal(false);
  /** Review 2026-10-07 (M13): the platform's own files (OCR pages and intermediates), for an administrator who asks. */
  readonly withSystem = signal(false);
  readonly canSeeSystem = computed(() => this.auth.isTenantAdmin() || this.auth.isPlatformAdmin());
  /** The page shown, from 1 as the pager counts; the server counts from 0. */
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);
  /** How many assets the filter matches in all; null until the first answer. */
  readonly total = signal<number | null>(null);
  private inFlight?: Subscription;

  readonly kinds: SegmentOption<KindFilter>[] = [
    { id: '', label: 'All' }, { id: 'dataset', label: 'Datasets', icon: 'database' }, { id: 'file', label: 'Files', icon: 'file' },
    { id: 'document_type', label: 'Document types', icon: 'list' },
  ];
  readonly flags = [
    { id: '', label: 'Any' }, { id: 'sensitive', label: 'Sensitive' }, { id: 'stale', label: 'Stale' }, { id: 'noOwner', label: 'Without an owner' },
  ];

  readonly kindText = kindText;
  readonly tagText = tagText;
  readonly tagList = (tags: string[] | null | undefined) => (tags ?? []).map(tagText).join(', ');
  readonly where = whereText;
  readonly tone = sensitivityTone;
  readonly fresh = (at: string | null) => freshnessText(at);

  /**
   * Owner 2026-10-27 ("add a sort on each table"): the catalog is paged, so it sorts on the server
   * (analyticsCatalog.json/list sort/dir) and a new order goes back to the first page. No order picked: newest change
   * first, as before, and no sort is sent. Sensitive fields (a list of tags) does not sort.
   */
  readonly sort = createTableSort<CatalogAsset>({
    id: 'data-catalog',
    server: true,
    columns: {
      name: { value: a => a.name, param: 'name' },
      kind: { value: a => kindText(a.kind), param: 'kind' },
      owner: { value: a => a.ownerName, param: 'owner' },
      freshness: { value: a => a.lastChangedAt, kind: 'date', param: 'freshness' },
      sensitivity: { value: a => a.sensitivity, kind: 'status', param: 'sensitivity' },
      quality: { value: a => a.qualityScore, kind: 'number', param: 'quality' },
    },
    onChange: () => { this.page.set(1); this.load(); },
  });

  /** The rows shown: one page, filtered by kind, flag and text and sorted on the server. */
  readonly shown = this.assets.asReadonly();

  readonly kpis = computed<StatStripItem[]>(() => {
    const s = this.summary();
    // Before the first answer (or after a failed one) the strip keeps its four tiles, drawn as placeholders or "—".
    if (!s) {
      return [
        { label: 'Assets', value: 0, icon: 'database' }, { label: 'With sensitive fields', value: 0, icon: 'shield' },
        { label: 'Stale', value: 0, icon: 'clock' }, { label: 'Without an owner', value: 0, icon: 'user' },
      ];
    }
    const link = (flag: string) => ({ link: '/data/catalog', queryParams: { flag } });
    return [
      { label: 'Assets', value: s.assets, icon: 'database', foot: `${s.datasets} datasets · ${s.files} files`, link: '/data/catalog', queryParams: {} },
      { label: 'With sensitive fields', value: s.sensitive, icon: 'shield', tone: s.sensitive ? 'warn' : undefined, ...link('sensitive') },
      { label: `Stale over ${s.staleDays} days`, value: s.stale, icon: 'clock', tone: s.stale ? 'crit' : undefined, ...link('stale') },
      { label: 'Without an owner', value: s.noOwner, icon: 'user', ...link('noOwner') },
    ];
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.inFlight?.unsubscribe(); if (this.searchTimer) clearTimeout(this.searchTimer); });
    // The address is the filter: a tile, a link or the back button sets the flag and text, and the list follows.
    effect(() => {
      const flag = this.flagParam() ?? '';
      const q = this.qParam() ?? '';
      untracked(() => {
        this.flag.set(flag);
        this.search.set(q);
        this.page.set(1);
        if (!this.noWorkspace()) this.load();
      });
    });
    effect(() => {
      const asset = Number(this.assetParam());
      if (asset > 0 && !this.noWorkspace()) untracked(() => this.open(asset, ''));
    });
  }

  ngOnInit(): void {
    if (this.noWorkspace()) return;
    this.loadSummary();
  }

  loadSummary(): void {
    this.summaryState.start();
    this.api.summary(this.withSystem()).subscribe({
      next: res => {
        if (res.status === API_SUCCESS && res.data) { this.summary.set(res.data); this.summaryState.done(); }
        else this.summaryState.fail(res, 'The catalog figures could not be read.');
      },
      error: err => this.summaryState.fail(err, 'The catalog figures could not be read.'),
    });
  }

  load(): void {
    this.inFlight?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.inFlight = this.api.list({ q: this.search().trim() || undefined, kind: this.kind() || undefined, flag: this.flag() || undefined,
      withDeleted: this.withDeleted(), withSystem: this.withSystem(), page: this.page() - 1, size: this.size(), ...(this.sort.param() ?? {}) }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS) {
          this.error.set(loadErrorText(res, 'The catalog could not be read.'));
          return;
        }
        const rows = res.data ?? [];
        this.assets.set(rows);
        this.total.set(res.paging?.total ?? rows.length);
        // A filter that shrank the list under the page shown: go to its last page rather than show a blank one.
        const last = Math.max(1, Math.ceil((this.total() ?? 0) / this.size()));
        if (!rows.length && this.page() > last) this.goTo(last);
      },
      error: err => { this.loading.set(false); this.error.set(loadErrorText(err, 'The catalog could not be read.')); },
    });
  }

  refresh(): void {
    this.load();
    this.loadSummary();
  }

  setFlag(flag: string): void {
    this.router.navigate([], { queryParams: { flag: flag || null }, queryParamsHandling: 'merge' });
  }

  typed(text: string): void {
    this.search.set(text);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.load(); }, 300);
  }

  setKind(kind: KindFilter): void {
    this.kind.set(kind);
    this.page.set(1);
    this.load();
  }

  showDeleted(on: boolean): void {
    this.withDeleted.set(on);
    this.page.set(1);
    this.load();
  }

  showSystem(on: boolean): void {
    this.withSystem.set(on);
    this.page.set(1);
    this.refresh();
  }

  goTo(page: number): void {
    this.page.set(Math.max(1, page));
    this.load();
  }

  setSize(size: number): void {
    this.size.set(size);
    this.page.set(1);
    this.load();
  }

  open(assetId: number, name: string): void {
    this.dialog.open<void>(CatalogPanel, sidePanelConfig<CatalogPanelData>({ assetId, name, changed: () => this.refresh() }, 'wide', 'right'));
  }
}
