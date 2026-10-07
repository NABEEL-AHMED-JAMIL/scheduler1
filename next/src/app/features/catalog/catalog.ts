import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
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
  imports: [StatStrip, TableShell, Icon, Segmented, Pagination],
  templateUrl: './catalog.html',
})
export class Catalog implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

  /** ?flag=sensitive|stale|noOwner, ?q=, ?asset= (an asset to open). */
  readonly flagParam = input<string | undefined>(undefined, { alias: 'flag' });
  readonly qParam = input<string | undefined>(undefined, { alias: 'q' });
  readonly assetParam = input<string | undefined>(undefined, { alias: 'asset' });

  readonly assets = signal<CatalogAsset[]>([]);
  readonly summary = signal<CatalogSummary | null>(null);
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

  /** The rows shown: one page, filtered by kind, flag and text on the server. */
  readonly shown = this.assets.asReadonly();

  readonly kpis = computed<StatStripItem[]>(() => {
    const s = this.summary();
    if (!s) return [];
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
        this.load();
      });
    });
    effect(() => {
      const asset = Number(this.assetParam());
      if (asset > 0) untracked(() => this.open(asset, ''));
    });
  }

  ngOnInit(): void {
    this.loadSummary();
  }

  loadSummary(): void {
    this.api.summary(this.withSystem()).subscribe({ next: res => this.summary.set(res.status === API_SUCCESS ? res.data ?? null : null) });
  }

  load(): void {
    this.inFlight?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.inFlight = this.api.list({ q: this.search().trim() || undefined, kind: this.kind() || undefined, flag: this.flag() || undefined,
      withDeleted: this.withDeleted(), withSystem: this.withSystem(), page: this.page() - 1, size: this.size() }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS) {
          this.error.set(res.message || 'The catalog could not be read.');
          return;
        }
        const rows = res.data ?? [];
        this.assets.set(rows);
        this.total.set(res.paging?.total ?? rows.length);
        // A filter that shrank the list under the page shown: go to its last page rather than show a blank one.
        const last = Math.max(1, Math.ceil((this.total() ?? 0) / this.size()));
        if (!rows.length && this.page() > last) this.goTo(last);
      },
      error: () => { this.loading.set(false); this.error.set('The catalog could not be reached.'); },
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
    this.dialog.open<void>(CatalogPanel, sidePanelConfig<CatalogPanelData>({ assetId, name, changed: () => this.refresh() }, 'wide'));
  }
}
