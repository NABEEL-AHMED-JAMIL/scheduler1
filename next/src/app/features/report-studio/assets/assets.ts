import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { RsTimePipe } from '../rs-time.pipe';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { AssetCard, AssetDetail, BrandProfileRow, KIND_WORDS, stateTone, stateWord, typeOf } from '../assets.model';
import { AssetPicture } from './asset-picture';
import { UploadData, UploadPanel } from './upload-panel';
import { NewProfilePanel, NewProfileData } from './new-profile-panel';
import { RsTabCounts } from '../rs-tab-counts';
import { Pagination } from '../../../shared/ui/pagination';
import { PAGE_SIZES } from '../../../shared/ui/pager';
import { AppLoading } from '../../../shared/ui/loading';
import { BlurLoader } from '../../../shared/ui/blur-loader';

type Tab = 'assets' | 'profiles' | 'restricted';

/**
 * See results › Reports › Assets & branding (MIG-406, the owner-approved screen 8, Figma frame 8; page report-assets):
 * the workspace's logos, images, signatures and stamps as cards -- a picture, the kind and version, Approved / In review
 * / Retired, where each is used, and whether editors manage it or its use is limited -- with the brand profiles below;
 * beside them what this person may do here, the difference between a signature picture and a digital signature, and the
 * replace and retire rules. Signatures and stamps have their own tab.
 */
@Component({
  selector: 'app-report-assets',
  imports: [PageHeader, RefreshButton, Icon, LoadError, RsTimePipe, WorkspaceSelect, RouterLink, AssetPicture, Pagination, AppLoading, BlurLoader],
  templateUrl: './assets.html',
  styleUrl: './assets.css',
})
export class ReportAssets implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly tabCounts = inject(RsTabCounts);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly workspaces = inject(WorkspaceDirectory);
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  readonly tab = signal<Tab>('assets');
  readonly assets = signal<AssetCard[]>([]);
  readonly profiles = signal<BrandProfileRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /**
   * Owner 2026-10-27: whether this workspace's cards have answered once. Until then the grid, the brand profiles and the
   * tab counts show a skeleton, not "No assets yet" and 0; after it a filter, a page or Refresh keeps the cards under a
   * blur instead of swapping them for a spinner.
   */
  readonly loaded = signal(false);
  readonly search = signal('');
  readonly kind = signal('');
  readonly state = signal('');
  readonly used = signal('');
  /** Owner 2026-10-20: one page of cards from the service, how many the filters match, and the scope's counts. */
  readonly total = signal(0);
  readonly counts = signal({ all: 0, signaturesAndStamps: 0 });
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);
  readonly filtering = computed(() => !!(this.search().trim() || this.kind() || this.state() || this.used()));
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Answers come back in any order: only the latest read's is kept. */
  private asked = 0;
  readonly kindWords = KIND_WORDS;
  readonly stateWord = stateWord;
  readonly stateTone = stateTone;
  readonly typeOf = typeOf;

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly canLibrary = computed(() => this.auth.canOpen('report-assets') && !this.auth.isPlatformAdmin());
  readonly canCustodian = computed(() => this.auth.canOpen('report-asset-custodian') && !this.auth.isPlatformAdmin());
  readonly canApprove = computed(() => this.auth.canOpen('report-approve') && !this.auth.isPlatformAdmin());
  readonly canPublish = computed(() => this.auth.canOpen('report-publish') && !this.auth.isPlatformAdmin());
  readonly workspace = computed(() => (this.auth.isPlatformAdmin() && this.tenantId() ? this.workspaces.nameOf(this.tenantId()) : this.auth.user()?.tenantName)
    || 'this workspace');
  /** The role word the side panel names, as the console's roles read. */
  readonly roleWord = computed(() => (this.auth.isPlatformAdmin() ? 'Platform administrator' : this.auth.isTenantAdmin() ? 'Admin'
    : this.canApprove() ? 'Approver' : 'Editor'));

  readonly restrictedCount = computed(() => this.counts().signaturesAndStamps);
  readonly shown = computed(() => this.assets());

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.searchTimer) clearTimeout(this.searchTimer); });
  }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('tab');
    if (t === 'profiles' || t === 'restricted') this.tab.set(t);
    this.load();
  }

  setTab(t: Tab): void {
    const was = this.tab();
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t === 'assets' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
    // The cards differ between the two card tabs (the restricted one is signatures and stamps only): page 1 of the new one.
    if (t !== 'profiles' && t !== was) {
      if (t === 'restricted') this.kind.set('');
      this.page.set(1);
      this.read();
    }
  }

  /** Another workspace picked (and the first read): the tab counts and the cards again, from the first page. */
  load(): void {
    this.page.set(1);
    // Another workspace: what is on screen is not its, so the first-load skeleton again.
    this.loaded.set(false);
    this.refresh();
  }

  /** The refresh button: the tab counts and the page the reader is on. */
  refresh(): void {
    this.tabCounts.refresh(this.scope());
    this.read();
  }

  /** The current page of cards, with the filters, as the service answers it (the brand profiles come with it). */
  read(): void {
    this.loading.set(true);
    this.error.set('');
    const asked = ++this.asked;
    const offset = (this.page() - 1) * this.size();
    this.api.assets({ q: this.search(), kind: this.tab() === 'restricted' ? 'SIGNATURES_AND_STAMPS' : this.kind(), state: this.state(),
      used: this.used(), limit: this.size(), offset }, this.scope()).subscribe({
      next: lib => {
        if (asked !== this.asked) return;
        // A page emptied under the reader (assets retired or deleted): the last page that still has cards.
        if (!lib.assets.length && lib.total > 0 && this.page() > 1) {
          this.page.set(Math.ceil(lib.total / this.size()));
          this.read();
          return;
        }
        this.assets.set(lib.assets);
        this.total.set(lib.total);
        this.counts.set(lib.counts ?? { all: lib.total, signaturesAndStamps: 0 });
        this.profiles.set(lib.profiles ?? []);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: e => {
        if (asked !== this.asked) return;
        this.error.set(studioError(e, 'The assets could not be read.').message);
        this.loading.set(false);
      },
    });
  }

  private scope(): number | null {
    return this.auth.isPlatformAdmin() ? this.tenantId() : null;
  }

  setKind(v: string): void { this.kind.set(v); this.page.set(1); this.read(); }
  setState(v: string): void { this.state.set(v); this.page.set(1); this.read(); }
  setUsed(v: string): void { this.used.set(v); this.page.set(1); this.read(); }
  goTo(page: number): void { this.page.set(page); this.read(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.read(); }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.read(); }, 300);
  }

  usedWord(a: AssetCard): string {
    const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    const parts = [...(a.templates || a.reports ? [n(a.templates, 'template'), n(a.reports, 'report')] : []),
      ...(a.profiles ? [n(a.profiles, 'brand profile')] : [])];
    return parts.length ? parts.join(' · ') : 'Not used yet';
  }

  upload(): void {
    this.dialog.open<AssetDetail | undefined, UploadData>(UploadPanel, sidePanelConfig<UploadData>({
      custodian: this.canCustodian(), library: this.canLibrary(), kind: this.tab() === 'restricted' && this.canCustodian() ? 'SIGNATURE' : undefined,
    })).closed.subscribe(a => {
      if (!a) return;
      this.toast.success(a.restricted ? `${a.name} uploaded; it waits for an approver.` : `${a.name} uploaded.`);
      void this.router.navigate(['/reports/assets', a.assetId]);
    });
  }

  newProfile(): void {
    this.dialog.open<string | undefined, NewProfileData>(NewProfilePanel, sidePanelConfig<NewProfileData>({ profiles: this.profiles() }))
      .closed.subscribe(id => { if (id) void this.router.navigate(['/reports/assets/branding', id]); });
  }
}
