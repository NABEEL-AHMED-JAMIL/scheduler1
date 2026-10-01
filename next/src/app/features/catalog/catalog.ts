import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
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
 */
@Component({
  selector: 'app-catalog',
  imports: [StatStrip, TableShell, Icon, Segmented],
  templateUrl: './catalog.html',
})
export class Catalog implements OnInit {
  private readonly api = inject(CatalogApi);
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

  readonly kinds: SegmentOption<KindFilter>[] = [
    { id: '', label: 'All' }, { id: 'dataset', label: 'Datasets', icon: 'database' }, { id: 'file', label: 'Files', icon: 'file' },
    { id: 'document_type', label: 'Document types', icon: 'list' },
  ];
  readonly flags = [
    { id: '', label: 'Any' }, { id: 'sensitive', label: 'Sensitive' }, { id: 'stale', label: 'Stale' }, { id: 'noOwner', label: 'Without an owner' },
  ];

  readonly kindText = kindText;
  readonly tagText = tagText;
  readonly where = whereText;
  readonly tone = sensitivityTone;
  readonly fresh = (at: string | null) => freshnessText(at);

  /** The rows shown: the server filters by flag and text; kind is narrowed here so the chips answer at once. */
  readonly shown = computed(() => {
    const kind = this.kind();
    return kind ? this.assets().filter(a => a.kind === kind) : this.assets();
  });

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
    // The address is the filter: a tile, a link or the back button sets the flag and text, and the list follows.
    effect(() => {
      const flag = this.flagParam() ?? '';
      const q = this.qParam() ?? '';
      untracked(() => {
        this.flag.set(flag);
        this.search.set(q);
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
    this.api.summary().subscribe({ next: res => this.summary.set(res.status === API_SUCCESS ? res.data ?? null : null) });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ q: this.search().trim() || undefined, flag: this.flag() || undefined, withDeleted: this.withDeleted() }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS) {
          this.error.set(res.message || 'The catalog could not be read.');
          return;
        }
        this.assets.set(res.data ?? []);
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
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  showDeleted(on: boolean): void {
    this.withDeleted.set(on);
    this.load();
  }

  open(assetId: number, name: string): void {
    this.dialog.open<void>(CatalogPanel, sidePanelConfig<CatalogPanelData>({ assetId, name, changed: () => this.refresh() }, 'wide'));
  }
}
