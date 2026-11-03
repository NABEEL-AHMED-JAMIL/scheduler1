import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { TabCounts } from '../../../core/nav/tab-counts';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { rangeText } from '../tools-shared';
import { FacetGroup, FacetPicks, ToolsFacets, facetOptions, togglePick } from '../tools-facets';
import { ImageApi } from './image.api';
import { PhotoPanel } from './photo-panel';
import { PhotoView } from './photo-view';
import { UploadSheet, UploadSheetData } from './upload-sheet';
import { DocumentsPicker } from './documents-picker';
import {
  BY_WORDS, DEFAULT_IMAGE_LIMITS, ImageDocument, ImageLimits, PhotoDetail, PhotoFacets, PhotoSummary, SITE_WORDS, STATUS_WORDS, listPill,
  pctText, sizeParts, subLine,
} from './image.model';

const POLL_MS = 5000;
const PAGE_SIZE = 25;

/** The list's window: 7 or 30 days, or every photo still kept (design image-a). */
type ImageDays = '7' | '30' | '0';
const DAY_OPTIONS: { id: ImageDays; label: string }[] = [{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '0', label: 'All kept' }];

/**
 * Image review's list (owner-approved design 2026-11-03, image-a.html), as the Report library: facets with counts (Status, Body
 * site, Patient, Made by), one search and a range; one slim drop strip (Choose photos, From a bucket, From Documents) that says
 * location and camera details are removed on upload; the table -- thumbnail, patient · site, size (in code), change, status, by,
 * taken -- and the selected photo in the side panel. Photos dropped anywhere on the page open the upload.
 */
@Component({
  selector: 'app-image-list',
  imports: [PageHeader, Icon, Segmented, ServerTimePipe, AppLoading, InlineStatus, ToolsFacets, PhotoPanel, PhotoView],
  templateUrl: './image-list.html',
  styleUrls: ['../tools-explorer.css', './images.css'],
  styles: `
    .il-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin: 0.75rem 0.875rem; padding: 0.75rem 0.875rem;
      border: 1.5px dashed var(--border-strong); border-radius: var(--radius-lg); background: var(--surface-inset); font-size: 0.8125rem; }
    .il-strip-on { border-color: var(--color-info-600); background: var(--info-soft); }
    .il-strip-text { flex: 1 1 34rem; min-width: 0; }
    .il-strip-text b { font-weight: 600; }
    .il-strip-acts { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-left: auto; }
    .il-thumb { width: 3.5rem; }
    .il-t th, .il-t td { padding-left: 0.625rem; padding-right: 0.625rem; }
    .il-thumb-none { width: 3.5rem; height: 2.625rem; border-radius: 0.3125rem; background: var(--surface-sunken); display: grid; place-items: center;
      color: var(--text-muted); }
    .il-c-th { width: 4.75rem; }
    .il-c-size { width: 10.875rem; white-space: nowrap; }
    .il-c-chg { width: 4rem; }
    .il-c-st { width: 9.875rem; }
    .il-c-by { width: 5.75rem; }
    .il-c-taken { width: 7rem; white-space: nowrap; }
    .il-sub { font-size: 0.75rem; color: var(--text-muted); }
    .il-down { color: var(--ok-text); }
    .il-up { color: var(--crit-text); }
    .il-drop { outline: 2px dashed var(--color-info-600); outline-offset: 4px; }
    @media (max-width: 1499px) { .il-c-by { width: 5.25rem; } }
    @media (max-width: 1179px) { .il-c-by { display: none; } .il-c-chg { width: 4.5rem; } }
  `,
})
export class ImageList implements OnInit {
  private readonly api = inject(ImageApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly tabCounts = inject(TabCounts, { optional: true });

  /** ?new=1: the upload is open over the list. */
  readonly openNew = input(false);

  readonly ownSignIn = isOwnPlatformSignIn(this.auth);
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  readonly limits = signal<ImageLimits>(DEFAULT_IMAGE_LIMITS);
  readonly canSend = computed(() => this.limits().documents && !!this.auth?.canOpen?.('document-intelligence'));
  readonly canReport = computed(() => this.limits().reports);
  readonly canDocuments = computed(() => !this.ownSignIn && !!this.auth?.canOpen?.('document-intelligence'));

  readonly dayOptions = DAY_OPTIONS;
  readonly days = signal<ImageDays>('30');
  readonly query = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(PAGE_SIZE);
  readonly picks = signal<FacetPicks>({});
  readonly rows = signal<PhotoSummary[]>([]);
  readonly total = signal(0);
  readonly all = signal(0);
  readonly counts = signal<PhotoFacets>({});
  readonly listState = createLoadState();
  readonly facetsOpen = signal(false);
  readonly dragging = signal(false);
  readonly selected = signal<PhotoSummary | null>(null);
  private listLoad: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private sheet: DialogRef<PhotoDetail[] | undefined, UploadSheet> | null = null;

  readonly groups = computed<FacetGroup[]>(() => {
    const c = this.counts(), p = this.picks();
    return [
      { key: 'status', title: 'Status', options: facetOptions(c.status, STATUS_WORDS, p['status'] ?? [], ['measured', 'no_ruler', 'to_confirm', 'could_not_read'])
        .filter(o => o.value !== 'measuring' || o.count > 0) },
      { key: 'site', title: 'Body site', options: facetOptions(c.site, SITE_WORDS, p['site'] ?? []) },
      { key: 'patient', title: 'Patient', options: facetOptions(c.patient, {}, p['patient'] ?? [], [], v => v || 'Unknown') },
      { key: 'by', title: 'Made by', options: facetOptions(c.by, BY_WORDS, p['by'] ?? [], ['me', 'others']) },
    ];
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly footText = computed(() => {
    const n = this.total();
    const count = this.pages() > 1 ? `${rangeText(this.page(), this.pageSize(), n)} photos` : `${n} ${n === 1 ? 'photo' : 'photos'}`;
    return `${count} · kept ${this.limits().keepDays} days, then removed under the workspace's retention unless sent to Documents or a report`;
  });
  readonly filtered = computed(() => !!this.query().trim() || Object.values(this.picks()).some(v => v.length));
  readonly hint = computed(() => `JPG, PNG or HEIC · up to ${this.limits().maxAtOnce} at once, ${this.limits().maxMb} MB each · location and camera details are removed on upload`);

  readonly listPill = listPill;
  readonly sizeParts = sizeParts;
  readonly pctText = pctText;
  readonly subLine = subLine;

  constructor() {
    effect(() => {
      const open = this.openNew();
      untracked(() => { if (open) this.openSheet({}); else this.sheet?.close(); });
    });
    inject(DestroyRef).onDestroy(() => {
      [this.timer, this.searchTimer].forEach(t => t && clearTimeout(t));
      this.listLoad?.unsubscribe();
      this.sheet?.close();
    });
  }

  ngOnInit(): void {
    this.api.limits().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data && Array.isArray(r.data.formats)) this.limits.set({ ...DEFAULT_IMAGE_LIMITS, ...r.data }); },
      error: () => this.limits.set(DEFAULT_IMAGE_LIMITS),
    });
    this.load();
  }

  load(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.listLoad?.unsubscribe();
    this.listState.start();
    const p = this.picks();
    this.listLoad = this.api.list({ days: Number(this.days()), q: this.query(), page: this.page(), size: this.pageSize(),
      status: p['status'] ?? [], site: p['site'] ?? [], patient: p['patient'] ?? [], by: p['by'] ?? [] }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.listState.fail(r, 'The photos could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.total.set(r.data.total ?? this.rows().length);
        this.all.set(r.data.all ?? r.data.total ?? 0);
        this.counts.set(r.data.facets ?? {});
        this.tabCounts?.set({ '/tools/images': this.all() });
        const open = this.selected();
        const fresh = open ? this.rows().find(x => x.photoId === open.photoId) : null;
        if (fresh) this.selected.set(fresh);
        this.listState.done();
        if (this.rows().some(x => x.status === 'MEASURING' || x.descriptionStatus === 'PENDING')) this.timer = setTimeout(() => this.load(), POLL_MS);
      },
      error: err => this.listState.fail(err, 'The photos could not be read.'),
    });
  }

  setDays(days: ImageDays): void { this.days.set(days); this.page.set(1); this.load(); }
  goTo(page: number): void { this.page.set(Math.min(this.pages(), Math.max(1, page))); this.load(); }

  toggleFacet(change: { key: string; value: string }): void {
    this.picks.set(togglePick(this.picks(), change.key, change.value));
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.picks.set({});
    this.query.set('');
    this.page.set(1);
    this.load();
  }

  setQuery(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.load(); }, 300);
  }

  select(r: PhotoSummary): void {
    this.selected.set(this.selected()?.photoId === r.photoId ? null : r);
  }

  openKey(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter' && event.key !== ' ') return false;
    event.preventDefault();
    return true;
  }

  byText(r: PhotoSummary): string {
    if (r.createdBy != null && r.createdBy === this.me()) return 'You';
    return r.createdByName || '—';
  }

  // ------------------------------------------------------------------------------------------------ upload photos

  /** Upload photos: ?new=1, so a reload or a link opens it too. */
  askNew(): void {
    if (this.router) void this.router.navigate([], { relativeTo: this.route ?? undefined, queryParams: { new: 1 } });
    else this.openSheet({});
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) this.openSheet({ files });
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) this.openSheet({ files });
  }

  fromBucket(): void {
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({ heading: 'Pick a photo', extensions: ['jpg', 'jpeg', 'png', 'heic'] }))
      .closed.subscribe(picked => { if (picked) this.openSheet({ bucket: { bucket: picked.bucket, key: picked.key, name: picked.name, size: picked.size } }); });
  }

  fromDocuments(): void {
    this.dialog.open<ImageDocument | undefined>(DocumentsPicker, sidePanelConfig({}, 'narrow', 'right'))
      .closed.subscribe(d => { if (d) this.openSheet({ document: { ocrDocumentId: d.ocrDocumentId, name: d.name, size: d.size } }); });
  }

  openSheet(source: Omit<UploadSheetData, 'limits'>): void {
    if (this.sheet) return;
    const data: UploadSheetData = { limits: this.limits(), ...source };
    const ref = this.dialog.open<PhotoDetail[] | undefined, UploadSheetData, UploadSheet>(UploadSheet, sidePanelConfig(data, 'wide', 'right'));
    this.sheet = ref;
    ref.closed.subscribe(made => {
      this.sheet = null;
      if (this.openNew() && this.router) void this.router.navigate([], { relativeTo: this.route ?? undefined, queryParams: {}, replaceUrl: true });
      if (made?.length) {
        const taken = made.filter(p => p.status !== 'REFUSED');
        if (taken.length) this.toast.success(taken.length === 1 ? 'The photo is measured; its description is being drafted.'
          : `${taken.length} photos are measured; their descriptions are being drafted.`);
        this.selected.set(made[0]);
        this.load();
      }
    });
  }
}
