import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
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

type Tab = 'assets' | 'profiles' | 'restricted';

/**
 * See results › Reports › Assets & branding (MIG-406, the owner-approved screen 8, Figma frame 8; page report-assets):
 * the workspace's logos, images, signatures and stamps as cards -- a picture, the kind and version, Approved / In review
 * / Retired, where each is used, and whether editors manage it or its use is limited -- with the brand profiles below;
 * beside them what this person may do here, the difference between a signature picture and a digital signature, and the
 * replace and retire rules. Signatures and stamps have their own tab.
 */
const inUse = (a: AssetCard) => a.templates + a.reports + (a.profiles ?? 0) > 0;

@Component({
  selector: 'app-report-assets',
  imports: [PageHeader, RefreshButton, Icon, LoadError, ServerTimePipe, WorkspaceSelect, RouterLink, AssetPicture],
  templateUrl: './assets.html',
  styleUrl: './assets.css',
})
export class ReportAssets implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
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
  readonly search = signal('');
  readonly kind = signal('');
  readonly state = signal('');
  readonly used = signal('');
  readonly kindWords = KIND_WORDS;
  readonly stateWord = stateWord;
  readonly stateTone = stateTone;
  readonly typeOf = typeOf;

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly canLibrary = computed(() => this.auth.canOpen('report-assets') && !this.auth.isPlatformAdmin());
  readonly canCustodian = computed(() => this.auth.canOpen('report-asset-custodian') && !this.auth.isPlatformAdmin());
  readonly canApprove = computed(() => this.auth.canOpen('report-approve') && !this.auth.isPlatformAdmin());
  readonly canPublish = computed(() => this.auth.canOpen('report-publish') && !this.auth.isPlatformAdmin());
  readonly workspace = computed(() => this.auth.user()?.tenantName || 'this workspace');
  /** The role word the side panel names, as the console's roles read. */
  readonly roleWord = computed(() => (this.auth.isPlatformAdmin() ? 'Platform administrator' : this.auth.isTenantAdmin() ? 'Admin'
    : this.canApprove() ? 'Approver' : 'Editor'));

  readonly restrictedCount = computed(() => this.assets().filter(a => a.restricted).length);
  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.assets().filter(a => (this.tab() !== 'restricted' || a.restricted)
      && (!this.kind() || a.kind === this.kind())
      && (!this.state() || a.state === this.state())
      && (!this.used() || (this.used() === 'USED' ? inUse(a) : !inUse(a)))
      && (!q || [a.name, a.description, a.updatedByName, a.ownerName, a.label].some(v => (v ?? '').toLowerCase().includes(q))));
  });

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('tab');
    if (t === 'profiles' || t === 'restricted') this.tab.set(t);
    this.load();
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t === 'assets' ? null : t }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const scope = this.auth.isPlatformAdmin() ? this.tenantId() : null;
    this.api.assets({}, scope).subscribe({
      next: lib => { this.assets.set(lib.assets); this.profiles.set(lib.profiles ?? []); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The assets could not be read.').message); this.loading.set(false); },
    });
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
