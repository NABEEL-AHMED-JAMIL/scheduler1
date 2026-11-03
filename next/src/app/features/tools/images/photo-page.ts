import { Component, DestroyRef, LOCALE_ID, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription, firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { instantOf } from '../../../core/instant';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { confirmWith } from '../../../shared/ui/confirm';
import { formatSize } from '../../../shared/ui/format-size';
import { ToastService } from '../../../shared/ui/toast.service';
import { ImageApi } from './image.api';
import { DOWNLOADS, ImageActions, messageOf } from './image-actions';
import { AreaChart, DescriptionCard, PhotoState } from './photo-parts';
import { DrawMode, Overlay, PhotoView } from './photo-view';
import {
  BlurRegion, BodyPart, Comparison, DEFAULT_IMAGE_LIMITS, ImageLimits, PhotoDetail, SITE_WORDS, descriptionPill, measurePill, pctText,
  sizeParts, stateAdvice, trendWords,
} from './image.model';
import { localNow } from './upload-sheet';
import { TakenField } from './taken-field';

const POLL_MS = 4000;
export type PhotoTab = 'measurement' | 'description' | 'compare' | 'privacy' | 'details';
type Shown = 'outline' | 'ruler' | 'photo';

/**
 * A photo's own page (owner-approved design 2026-11-03, image-a-detail and image-a-compare), as a run's page: the title with its
 * status pills, "Visit 3 · taken 23 Oct 2026, 10:12 · uploaded by you · file.jpg · location and camera details removed",
 * Download, ⋮ and Send to Documents as a visit note; then Measurement · Description (draft) · Compare · Privacy · Details.
 * Measurement: the photo large (Outline / Ruler / Photo only, Adjust outline, Blur a region) beside "Size, measured in code" with
 * the area's trend and the Description card. Compare: the same wound's photos side by side, the area chart and its table.
 */
@Component({
  selector: 'app-photo-page',
  imports: [PageHeader, Icon, Segmented, ServerTimePipe, AppLoading, InlineStatus, CdkMenu, CdkMenuItem, CdkMenuTrigger, PhotoView, DescriptionCard,
    PhotoState, AreaChart, TakenField],
  templateUrl: './photo-page.html',
  styleUrls: ['./images.css'],
  styles: `
    .pg-meta { margin: 0.375rem 0 0; font-size: 0.8125rem; color: var(--text-secondary); }
    .pg-count { margin-left: 0.25rem; font-size: 0.75rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .pg-ext { margin-left: auto; padding-left: 1rem; font-size: 0.75rem; color: var(--text-muted); }
    .dg { display: grid; grid-template-columns: minmax(0, 1fr) 27.5rem; gap: 1.25rem; margin-top: 1.25rem; align-items: start; }
    .cg { display: grid; grid-template-columns: minmax(0, 1fr) 26.25rem; gap: 1.25rem; margin-top: 1.25rem; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
    .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; padding: 1rem; background: var(--surface-sunken); }
    .cap { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; margin-top: 0.5rem; font-size: 0.8125rem; }
    .kv { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: 0.5rem 0.75rem; margin: 0; font-size: 0.875rem; }
    .kv dt { color: var(--text-muted); }
    .kv dd { margin: 0; overflow-wrap: anywhere; }
    .pg-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 1rem; max-width: 46rem; }
    .pg-wide { grid-column: 1 / -1; }
    .pg-t { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    .pg-t th { text-align: left; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary);
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); }
    .pg-t td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); font-variant-numeric: tabular-nums; }
    .pg-t tr:last-child td { border-bottom: 0; }
    .pg-t .num { text-align: right; }
    .pg-ok { color: var(--ok-text); display: flex; gap: 0.5rem; align-items: center; font-size: 0.875rem; }
    @media (max-width: 1179px) { .dg, .cg { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 900px) { .three { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PhotoPage implements OnInit {
  private readonly api = inject(ImageApi);
  readonly actions = inject(ImageActions);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));
  private readonly view = viewChild<PhotoView>('big');

  readonly id = input.required<number>();
  readonly initialTab = input<PhotoTab>('measurement');
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  readonly limits = signal<ImageLimits>(DEFAULT_IMAGE_LIMITS);
  readonly canSend = computed(() => this.limits().documents && !!this.auth?.canOpen?.('document-intelligence'));
  readonly canReport = computed(() => this.limits().reports);

  readonly detail = signal<PhotoDetail | null>(null);
  readonly comparison = signal<Comparison | null>(null);
  readonly state = createLoadState();
  readonly tab = signal<PhotoTab>('measurement');
  readonly shown = signal<Shown>('outline');
  readonly compareShown = signal<'on' | 'off'>('on');
  readonly mode = signal<DrawMode>('view');
  readonly boxes = signal<BlurRegion[]>([]);
  readonly busy = signal(false);
  readonly form = signal<{ patientRef: string; woundLabel: string; bodyPart: BodyPart; siteDetail: string; note: string; takenAt: string } | null>(null);
  private load: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly downloads = DOWNLOADS;
  readonly siteWords = SITE_WORDS;
  readonly bodyParts = Object.keys(SITE_WORDS) as BodyPart[];
  readonly pctText = pctText;
  readonly trendWords = trendWords;
  readonly shownOptions: { id: Shown; label: string }[] = [{ id: 'outline', label: 'Outline' }, { id: 'ruler', label: 'Ruler' }, { id: 'photo', label: 'Photo only' }];
  readonly compareOptions: { id: 'on' | 'off'; label: string }[] = [{ id: 'on', label: 'Outline on' }, { id: 'off', label: 'Photos only' }];

  readonly mpill = computed(() => this.detail() ? measurePill(this.detail()!) : null);
  readonly dpill = computed(() => this.detail() ? descriptionPill(this.detail()!) : null);
  readonly size = computed(() => this.detail() ? sizeParts(this.detail()!) : null);
  readonly advice = computed(() => this.detail() ? stateAdvice(this.detail()!) : null);
  readonly overlays = computed<Overlay[]>(() => this.shown() === 'photo' ? [] : this.shown() === 'ruler' ? ['ruler'] : ['outline', 'ruler', 'lw']);
  readonly crumb = computed(() => { const d = this.detail(); return d ? d.title + (d.visit && d.patientRef ? ` · visit ${d.visit}` : '') : 'Photo'; });
  readonly meta = computed(() => {
    const d = this.detail();
    if (!d) return '';
    const parts: string[] = [];
    if (d.visit && d.patientRef) parts.push(`Visit ${d.visit}`);
    if (d.takenAt) parts.push(`taken ${this.when.transform(d.takenAt, 'dateTime')}`);
    parts.push(`uploaded by ${d.createdBy != null && d.createdBy === this.me() ? 'you' : d.createdByName || 'someone'}`);
    return parts.join(' · ');
  });
  readonly compareMeta = computed(() => {
    const c = this.comparison();
    const n = c?.photos.length ?? this.detail()?.visits ?? 1;
    // "in 30 days": all of them inside the history's days (a photo sent on may be older).
    const keep = this.detail()?.keepDays ?? 30;
    const first = c?.photos[0]?.takenAt ? instantOf(c.photos[0].takenAt) : null;
    const inside = !!first && Date.now() - first.getTime() <= keep * 86_400_000;
    return `${n} ${n === 1 ? 'photo' : 'photos'} of this wound${inside ? ` in ${keep} days` : ''} · each measured in code against its own ruler`;
  });
  readonly compareRows = computed(() => (this.comparison()?.photos ?? []).slice(-3));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => { this.tab.set(this.initialTab()); this.read(id); });
    });
    // Compare's photos and the area line under the size: read once the photo is, and again after a change.
    effect(() => { if (this.detail() && !this.comparison()) untracked(() => this.readCompare()); });
    inject(DestroyRef).onDestroy(() => { this.load?.unsubscribe(); if (this.timer) clearTimeout(this.timer); });
  }

  ngOnInit(): void {
    this.api.limits().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data && Array.isArray(r.data.formats)) this.limits.set({ ...DEFAULT_IMAGE_LIMITS, ...r.data }); },
      error: () => undefined,
    });
  }

  read(id = this.id()): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.load?.unsubscribe();
    if (!this.detail()) this.state.start();
    this.load = this.api.one(id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'The photo could not be read.'); return; }
        this.set(r.data);
        this.state.done();
      },
      error: err => this.state.fail(err, 'The photo could not be read.'),
    });
  }

  private set(d: PhotoDetail): void {
    this.detail.set(d);
    if (this.timer) clearTimeout(this.timer);
    if (d.status === 'MEASURING' || d.descriptionStatus === 'PENDING') this.timer = setTimeout(() => this.read(d.photoId), POLL_MS);
  }

  readCompare(): void {
    this.api.compare(this.id()).subscribe({ next: r => { if (r.status === API_SUCCESS && r.data) this.comparison.set(r.data); } });
  }

  open(tab: PhotoTab): void {
    this.tab.set(tab);
    this.mode.set('view');
    if (tab === 'details') this.startForm();
  }

  day(iso: string | null | undefined): string {
    return iso ? this.when.transform(iso, 'day') ?? '' : '';
  }

  size_(n: number | null | undefined): string {
    return n == null ? '—' : formatSize(n);
  }

  onChanged(d: PhotoDetail): void {
    this.set(d);
    this.comparison.set(null);
  }

  // ------------------------------------------------------------------------------------------------ Adjust outline, Blur

  adjust(): void {
    this.shown.set('outline');
    this.mode.set(this.mode() === 'outline' ? 'view' : 'outline');
  }

  async outlined(points: number[]): Promise<void> {
    const d = this.detail();
    if (!d) return;
    this.busy.set(true);
    const done = await this.actions.call(() => this.api.outline(d.photoId, points), 'The outline could not be measured.');
    this.busy.set(false);
    if (!done) return;
    this.mode.set('view');
    this.onChanged(done);
    this.toast.success(done.scaleFound ? `Measured: ${done.areaCm2?.toFixed(1)} cm² against the ruler.` : 'Measured in pixels only: there is no ruler.');
  }

  finishOutline(): void {
    this.view()?.finish();
  }

  undoPoint(): void {
    this.view()?.undoPoint();
  }

  async remeasure(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const done = await this.actions.call(() => this.api.remeasure(d.photoId), 'It could not be measured again.');
    if (done) this.onChanged(done);
  }

  startBlur(): void {
    this.tab.set(this.tab() === 'privacy' ? 'privacy' : this.tab());
    this.boxes.set([]);
    this.mode.set(this.mode() === 'blur' ? 'view' : 'blur');
  }

  boxed(b: BlurRegion): void {
    this.boxes.update(list => [...list, b]);
    this.view()?.clear();
  }

  async applyBlur(): Promise<void> {
    const d = this.detail();
    const regions = this.boxes();
    if (!d || !regions.length) return;
    const ok = await confirmWith(this.dialog, { title: regions.length === 1 ? 'Blur this region' : `Blur ${regions.length} regions`, confirmLabel: 'Blur',
      danger: true, body: 'It is blurred in the stored photo itself, so in every copy: download, Documents and reports. The original is not kept unblurred, so this cannot be undone.' });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.blur(d.photoId, regions));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be blurred.'); return; }
      this.boxes.set([]);
      this.mode.set('view');
      this.onChanged(r.data);
      this.toast.success(regions.length === 1 ? '1 region blurred.' : `${regions.length} regions blurred.`);
    } catch (err) {
      this.toast.error(messageOf(err) || 'It could not be blurred.');
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------------------------------------------------------------------------------ next steps

  async send(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const done = await this.actions.sendToDocuments(d);
    if (done) this.onChanged(done);
  }

  async report(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const done = await this.actions.addToReport(d);
    if (done) this.onChanged(done);
  }

  async remove(): Promise<void> {
    const d = this.detail();
    if (d && await this.actions.remove(d)) void this.router?.navigate(['/tools/images']);
  }

  another(): void {
    void this.router?.navigate(['/tools/images'], { queryParams: { new: 1 } });
  }

  // ------------------------------------------------------------------------------------------------ Details

  startForm(): void {
    const d = this.detail();
    if (!d) return;
    const taken = d.takenAt ? this.when.transform(d.takenAt, "yyyy-MM-dd'T'HH:mm") ?? '' : '';
    this.form.set({ patientRef: d.patientRef ?? '', woundLabel: d.woundLabel ?? '', bodyPart: (d.bodyPart ?? 'other') as BodyPart,
      siteDetail: d.siteDetail ?? '', note: d.note ?? '', takenAt: taken });
  }

  setField(key: 'patientRef' | 'woundLabel' | 'bodyPart' | 'siteDetail' | 'note' | 'takenAt', value: string): void {
    const f = this.form();
    if (f) this.form.set({ ...f, [key]: value });
  }

  async saveDetails(): Promise<void> {
    const d = this.detail(), f = this.form();
    if (!d || !f) return;
    this.busy.set(true);
    const done = await this.actions.call(() => this.api.edit(d.photoId, { ...f, takenAt: f.takenAt || undefined }), 'The details could not be saved.');
    this.busy.set(false);
    if (done) { this.onChanged(done); this.startForm(); this.toast.success('Saved.'); }
  }

  readonly nowLocal = localNow();

  keptText(d: PhotoDetail): string {
    if (d.documents || d.reportAsset) return 'Kept until the workspace\'s retention removes it: it was sent on.';
    return d.expiresAt ? `Until ${this.when.transform(d.expiresAt, 'date')}, then removed under the workspace's retention unless sent to Documents or a report.`
      : `${d.keepDays ?? 30} days.`;
  }
}
