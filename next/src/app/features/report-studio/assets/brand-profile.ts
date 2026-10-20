import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PRINTED_LOOK } from './printed-look';
import { Dialog } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, switchMap, catchError, of } from 'rxjs';
import { PageHeader } from '../../../shared/ui/page-header';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { RsTimePipe } from '../rs-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AuthService } from '../../../core/auth/auth.service';
import { ReportStudioApi, studioError } from '../report-studio.api';
import {
  AssetCard, BrandDefinition, BrandProfileDetail, Lock, contrastRatio, emptyDefinition,
} from '../assets.model';
import { RsPickSearch } from '../pick-search';
import { AssetPicture } from './asset-picture';

const FONTS = ['Noto Sans', 'Noto Serif', 'Noto Sans Mono', 'DejaVu Sans'];

/**
 * One brand profile (MIG-406, the owner-approved screen 9, Figma frame 9; page report-assets): its draft over its published
 * version -- the look (a logo from the library, the main, text and background colours with WCAG AA checked as you type,
 * heading and body fonts from the bundled Noto set), contact and page defaults (header and footer lines with
 * {{report.period}} and {{contact.email}}), the approved signatures and stamps (a list templates may choose from: nothing is
 * placed automatically) and whether an approval signs the PDF -- beside a live A4 preview drawn by the server and which
 * setting wins, with what is allowed and what is locked. Publishing needs report-publish; new versions apply to future
 * reports only.
 */
/** The brand profile's three asset pickers. */
type Picker = 'logos' | 'signatures' | 'stamps';

@Component({
  selector: 'app-brand-profile',
  imports: [PageHeader, Icon, LoadError, RsTimePipe, FormsModule, AssetPicture, RsPickSearch],
  templateUrl: './brand-profile.html',
  styleUrl: './assets.css',
})
export class BrandProfilePage implements OnInit {
  readonly profileId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  readonly p = signal<BrandProfileDetail | null>(null);
  readonly def = signal<BrandDefinition>(emptyDefinition());
  readonly saved = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly saveError = signal('');
  readonly previewHtml = signal('');
  /** The server's page (compiled through SafeHtml, with its own CSP: no scripts, images as data only) in a sandboxed frame, as the test panel shows it. */
  readonly previewDoc = computed<SafeHtml | null>(() => this.previewHtml() ? this.sanitizer.bypassSecurityTrustHtml(this.previewHtml()) : null);
  readonly previewing = signal(false);
  /** Why the live preview is not drawn (a reader the server does not draw it for): said in its place, not as a spinner. */
  readonly previewError = signal('');
  readonly logos = signal<AssetCard[]>([]);
  readonly signatures = signal<AssetCard[]>([]);
  readonly stamps = signal<AssetCard[]>([]);
  /** How many each picker's search matches in all (the selects hold 200 at most). */
  readonly totals = signal<Record<Picker, number>>({ logos: 0, signatures: 0, stamps: 0 });
  readonly fonts = FONTS;
  readonly printed = PRINTED_LOOK;
  private readonly redraw = new Subject<BrandDefinition>();

  readonly canEdit = computed(() => this.auth.canOpen('report-assets') && !this.auth.isPlatformAdmin() && this.p()?.status === 'ACTIVE');
  readonly canPublish = computed(() => this.auth.canOpen('report-publish') && !this.auth.isPlatformAdmin());
  readonly dirty = computed(() => JSON.stringify(this.def()) !== this.saved());
  readonly editingVersion = computed(() => this.p()?.draft?.version ?? ((this.p()?.currentPublishedVersion ?? 0) + 1));
  readonly textRatio = computed(() => contrastRatio(this.def().colors.text || PRINTED_LOOK.text, this.def().colors.background || PRINTED_LOOK.background));
  readonly mainRatio = computed(() => contrastRatio(this.def().colors.primary || PRINTED_LOOK.primary, this.def().colors.background || PRINTED_LOOK.background));
  readonly passes = computed(() => this.textRatio() >= 4.5 && this.mainRatio() >= 3);
  /** The logos to choose from; a platform administrator, who reads no asset library, sees the profile's own. */
  readonly logoChoices = computed(() => this.logos().length ? this.logos()
    : (this.p()?.assets ?? []).filter(a => a.kind === 'LOGO' || a.kind === 'IMAGE'));
  readonly logo = computed(() => this.logoChoices().find(a => a.assetId === this.def().logo?.assetId) ?? null);

  ngOnInit(): void {
    this.load();
    const sub = this.redraw.pipe(debounceTime(500), switchMap(d => {
      this.previewing.set(true);
      return this.api.previewBrand(this.profileId(), d).pipe(catchError(e => { this.previewError.set(studioError(e, 'The preview could not be drawn.').message); return of(null); }));
    })).subscribe(r => { this.previewing.set(false); if (r) { this.previewError.set(''); this.previewHtml.set(r.html); } });
    this.destroy.onDestroy(() => sub.unsubscribe());
  }

  load(): void {
    this.error.set('');
    this.api.brandProfile(this.profileId()).subscribe({
      next: p => {
        this.p.set(p);
        const d = { ...emptyDefinition(), ...(p.draft?.definition ?? p.published?.definition ?? {}) } as BrandDefinition;
        this.def.set(d);
        this.saved.set(JSON.stringify(d));
        this.redraw.next(d);
      },
      error: e => this.error.set(studioError(e, 'The brand profile could not be read.').message),
    });
    if (!this.auth.isPlatformAdmin()) {
      this.find('logos', '');
      this.find('signatures', '');
      this.find('stamps', '');
    }
  }

  /**
   * One picker's choices: the approved, active assets of its kinds, searched on the service (the first 200 and how many
   * match). What was offered before stays offered, so a pick made from an earlier search keeps its name.
   */
  find(picker: Picker, q: string): void {
    const kinds = picker === 'logos' ? ['LOGO', 'IMAGE'] : picker === 'signatures' ? ['SIGNATURE'] : ['STAMP'];
    this.api.usable(null, { q, kinds }).subscribe({
      next: u => {
        const list = this[picker];
        const found = new Set(u.assets.map(a => a.assetId));
        const picked = new Set(this.pickedIds());
        list.set([...u.assets, ...list().filter(a => !found.has(a.assetId) && picked.has(a.assetId))]);
        this.totals.update(t => ({ ...t, [picker]: u.total }));
      },
      error: () => { /* the pickers say there is nothing to choose */ },
    });
  }

  private pickedIds(): string[] {
    const d = this.def();
    return [d.logo?.assetId ?? '', ...(d.signatures ?? []).map(s => s.assetId), ...(d.stamps ?? []).map(s => s.assetId)].filter(Boolean);
  }

  /** One change to the definition: kept, the preview redrawn. */
  change(mutate: (d: BrandDefinition) => void): void {
    const d = JSON.parse(JSON.stringify(this.def())) as BrandDefinition;
    mutate(d);
    this.def.set(d);
    this.redraw.next(d);
  }

  setColor(key: 'primary' | 'text' | 'background', raw: string): void {
    const v = raw.trim().toUpperCase();
    this.change(d => { if (v) d.colors[key] = v.startsWith('#') ? v : `#${v}`; else delete d.colors[key]; });
  }

  setText(key: 'header' | 'footer' | 'confidentiality', v: string): void {
    this.change(d => { if (v.trim()) d[key] = v; else delete d[key]; });
  }

  setContact(key: 'organisation' | 'email' | 'website' | 'phone', v: string): void {
    this.change(d => { if (v.trim()) d.contact[key] = v.trim(); else delete d.contact[key]; });
  }

  setFont(key: 'heading' | 'body', v: string): void {
    this.change(d => { if (v) d.fonts[key] = v; else delete d.fonts[key]; });
  }

  setLogo(assetId: string): void {
    this.change(d => { d.logo = assetId ? { assetId } : null; });
  }

  addTo(list: 'signatures' | 'stamps', assetId: string): void {
    if (!assetId) return;
    this.change(d => { if (!d[list].some(x => x.assetId === assetId)) d[list].push({ assetId }); });
  }

  removeFrom(list: 'signatures' | 'stamps', assetId: string): void {
    this.change(d => { d[list] = d[list].filter(x => x.assetId !== assetId); });
  }

  setSign(on: boolean): void {
    this.change(d => { d.signOnApproval = on; });
  }

  setLock(key: 'look' | 'fontsContact' | 'confidentiality', v: Lock): void {
    this.change(d => { d.locks[key] = v; });
  }

  nameOf(list: AssetCard[], id: string): string {
    const a = list.find(x => x.assetId === id) ?? (this.p()?.assets ?? []).find(x => x.assetId === id);
    return a ? `${a.name} · v${a.currentVersion}` : 'An asset no longer usable';
  }

  cancel(): void {
    const d = JSON.parse(this.saved() || '{}') as BrandDefinition;
    this.def.set({ ...emptyDefinition(), ...d });
    this.redraw.next(this.def());
  }

  save(): void {
    const p = this.p();
    if (!p) return;
    this.busy.set(true);
    this.saveError.set('');
    this.api.saveBrandDraft(p.profileId, p.draft?.revision ?? null, this.def()).subscribe({
      next: next => {
        this.busy.set(false);
        this.p.set(next);
        this.saved.set(JSON.stringify(this.def()));
        this.toast.success(`Draft v${next.draft?.version ?? ''} saved.`);
      },
      error: e => { this.busy.set(false); this.saveError.set(studioError(e, 'The draft could not be saved.').message); },
    });
  }

  askApproval(): void {
    const p = this.p();
    if (!p?.draft) { this.toast.info('Save the draft first.'); return; }
    this.api.askBrandApproval(p.profileId).subscribe({
      next: next => { this.p.set(next); this.toast.success('Approval asked for: someone who may publish reviews the draft.'); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  async publish(): Promise<void> {
    const p = this.p();
    if (!p?.draft) return;
    if (this.dirty()) { this.toast.info('Save the draft first, then publish it.'); return; }
    const ok = await confirmWith(this.dialog, { title: `Publish ${p.name} v${p.draft.version}?`, confirmLabel: 'Publish',
      body: 'Reports made from now on use it. Reports made before keep the brand they were made with. A published version never changes.' });
    if (!ok) return;
    this.api.publishBrand(p.profileId, p.draft.revision).subscribe({
      next: next => { this.p.set(next); this.toast.success(`${p.name} v${next.currentPublishedVersion} published.`); this.load(); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  makeDefault(): void {
    const p = this.p();
    if (!p) return;
    this.api.setDefaultBrand(p.profileId).subscribe({
      next: next => { this.p.set(next); this.toast.success(`${p.name} is the workspace default now.`); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  async archive(): Promise<void> {
    const p = this.p();
    if (!p) return;
    const ok = await confirmWith(this.dialog, { title: `Archive ${p.name}?`, confirmLabel: 'Archive', danger: true,
      body: 'Templates that name it use the workspace default instead. Reports made with it keep it.' });
    if (!ok) return;
    this.api.archiveBrandProfile(p.profileId).subscribe({
      next: () => { this.toast.success(`${p.name} archived.`); void this.router.navigate(['/reports/assets'], { queryParams: { tab: 'profiles' } }); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  lockWord(l: Lock): string {
    return l === 'LOCKED' ? 'Locked' : 'Allowed';
  }
}
