import { Component, DestroyRef, LOCALE_ID, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ImageApi } from './image.api';
import { DOWNLOADS, ImageActions } from './image-actions';
import { AreaChart, DescriptionCard, PhotoState } from './photo-parts';
import { PhotoView } from './photo-view';
import {
  Comparison, PhotoDetail, PhotoSummary, descriptionPill, measurePill, pctText, sizeParts, stateAdvice, trendWords,
} from './image.model';

const POLL_MS = 4000;
type PanelTab = 'measurement' | 'description' | 'compare';

/**
 * The selected photo in the list's side panel (design image-a): its status pills, the title and "Visit 3 · taken 23 Oct, 10:12 ·
 * location and camera details removed", Measurement / Description / Compare N, the photo with its outline and ruler, length ·
 * width · area, the line "Measured in code against the ruler. No ruler, no size: never estimated.", and Next steps -- Open,
 * Confirm description, Send to Documents, ⋮ (Download, Add to a report, Start a pipeline, Delete). A photo that could not be
 * measured or taken says why and what to do (design image-states).
 */
@Component({
  selector: 'app-photo-panel',
  imports: [Icon, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, PhotoView, DescriptionCard, PhotoState, AreaChart],
  styleUrls: ['../tools-panel.css', './images.css'],
  styles: `
    .pp-cmp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .pp-cmp figure { margin: 0; }
    .pp-cmp figcaption { margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-secondary); }
    .pp-cmp figcaption b { color: var(--text-primary); }
  `,
  host: { class: 'tx-panel', role: 'region', 'aria-label': 'The selected photo' },
  template: `
    @let p = view();
    <div class="tp-h">
      <div class="tp-top">
        <span [class]="'pill pill-' + mpill().tone" data-test="panel-status">@if (mpill().icon) { <app-icon [name]="mpill().icon!" size="0.85em" /> }{{ mpill().label }}</span>
        @if (dpill(); as d) { <span [class]="'pill pill-' + d.tone">{{ d.label }}</span> }
        <button type="button" class="btn btn-ghost btn-icon btn-xs tp-x" aria-label="Close" (click)="closed.emit()"><app-icon name="close" /></button>
      </div>
      <h2 data-test="panel-title">{{ p.title }}</h2>
      <div class="text-xs text-[color:var(--text-muted)] mt-1" data-test="panel-meta">{{ meta() }}</div>
    </div>

    @if (advice() && p.status !== 'NO_RULER') {
      <div class="tp-body" data-test="panel-state">
        @if (p.hasPhoto) { <app-photo-view [photoId]="p.photoId" [version]="p.blurCount ?? 0" [width]="p.width" [height]="p.height" [overlays]="[]" /> }
        <app-photo-state [photo]="p" (upload)="another.emit()" (remove)="remove()" (bucket)="bucket.emit()" />
      </div>
    } @else {
      <div class="tabs tp-tabs" role="tablist" aria-label="The selected photo">
        <button type="button" role="tab" class="tab" [class.tab-active]="tab() === 'measurement'" [attr.aria-selected]="tab() === 'measurement'" (click)="tab.set('measurement')">Measurement</button>
        <button type="button" role="tab" class="tab" [class.tab-active]="tab() === 'description'" [attr.aria-selected]="tab() === 'description'" (click)="tab.set('description')">Description</button>
        <button type="button" role="tab" class="tab" [class.tab-active]="tab() === 'compare'" [attr.aria-selected]="tab() === 'compare'" (click)="openCompare()">
          Compare <span class="text-xs text-[color:var(--text-muted)]">{{ p.visits || 1 }}</span></button>
      </div>
      <div class="tp-body">
        @switch (tab()) {
          @case ('description') {
            @if (detail(); as d) { <app-description-card [photo]="d" [bare]="true" [compact]="true" (changed)="onChanged($event)" /> }
          }
          @case ('compare') {
            @if (comparison(); as c) {
              <div class="pp-cmp" data-test="panel-compare">
                @for (r of c.photos.slice(-4); track r.photoId) {
                  <figure>
                    @if (r.hasPhoto) { <app-photo-view [photoId]="r.photoId" [geometry]="r.geometry" [width]="r.width" [height]="r.height" [overlays]="['outline']" [small]="true" /> }
                    <figcaption><b>{{ day(r.takenAt) }}</b> {{ r.sized ? r.areaCm2!.toFixed(1) + ' cm²' : 'no size' }}</figcaption>
                  </figure>
                }
              </div>
              @if (c.sizedCount > 1) { <app-area-chart [rows]="c.photos" kind="spark" /> }
              @if (c.sinceFirstPct != null) { <div class="ir-line"><span [class.ir-down]="c.sinceFirstPct < 0" [class.ir-up]="c.sinceFirstPct > 0">{{ trendWords(c.sinceFirstPct) }} since {{ day(c.firstAt) }}</span></div> }
            } @else { <p class="text-sm text-[color:var(--text-muted)] m-0">Loading…</p> }
          }
          @default {
            @if (p.hasPhoto) {
              <app-photo-view [photoId]="p.photoId" [version]="p.blurCount ?? 0" [geometry]="detail()?.geometry" [width]="p.width" [height]="p.height"
                              [scaleFound]="p.scaleFound" [pxPerCm]="p.pxPerCm" [lengthCm]="p.lengthCm" [widthCm]="p.widthCm" data-test="panel-photo" />
            }
            @if (size(); as s) {
              <div class="ir-metrics" data-test="panel-size">
                <div><b>{{ p.lengthCm!.toFixed(1) }} cm</b><span>Length</span></div>
                <div><b>{{ p.widthCm!.toFixed(1) }} cm</b><span>Width</span></div>
                <div><b>{{ s.area }}</b><span>Area@if (p.sinceFirstPct != null) { · {{ pctText(p.sinceFirstPct) }} since {{ day(p.firstAt) }} }</span></div>
              </div>
            } @else if (p.status === 'NO_RULER') {
              <app-photo-state [photo]="p" (upload)="another.emit()" (keep)="keep()" (remove)="remove()" />
            } @else if (p.status === 'MEASURING') {
              <p class="text-sm m-0"><app-icon name="refresh" [busy]="true" size="0.9em" /> Measuring against the ruler…</p>
            }
            <div class="ir-line"><app-icon name="shieldCheck" size="0.95em" />Measured in code against the ruler. No ruler, no size: never estimated.</div>
          }
        }
        <div class="tp-next" data-test="next-steps">
          <div class="tp-eyebrow">Next steps</div>
          <div class="tp-acts">
            <a class="btn btn-primary btn-sm" routerLink="/tools/images" [queryParams]="{ id: p.photoId }" data-test="open-photo"><app-icon name="maximize" />Open</a>
            @if (p.descriptionStatus === 'DRAFT') {
              <button type="button" class="btn btn-default btn-sm" (click)="confirmDraft()" data-test="panel-confirm"><app-icon name="check" />Confirm description</button>
            }
            @if (canSend()) {
              <button type="button" class="btn btn-default btn-sm" (click)="send()" [disabled]="p.sentToDocuments" data-test="panel-send">
                <app-icon name="inbox" />{{ p.sentToDocuments ? 'Sent to Documents' : 'Send to Documents' }}</button>
            }
            <button type="button" class="btn btn-default btn-icon btn-sm" [cdkMenuTriggerFor]="more" aria-label="More for this photo" data-test="panel-more"><app-icon name="dots" /></button>
            <ng-template #more>
              <div cdkMenu class="card shadow-xl py-1 min-w-64 text-sm">
                @for (d of downloads; track d.format) {
                  <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="actions.download(p, d.format)"><app-icon name="download" />{{ d.label }}<span class="tp-menu-ext">.{{ d.ext }}</span></button>
                }
                @if (canReport()) {
                  <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="report()" [disabled]="p.inReport" data-test="panel-report"><app-icon name="file" />{{ p.inReport ? 'In Report Studio' : 'Add to a report' }}</button>
                }
                <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="actions.pipeline(p)" data-test="panel-pipeline"><app-icon name="layers" />Start a pipeline…</button>
                <button cdkMenuItem class="menu-item menu-item-danger" (cdkMenuItemTriggered)="remove()"><app-icon name="trash" class="icon-crit" />Delete photo</button>
              </div>
            </ng-template>
          </div>
        </div>
      </div>
    }
  `,
})
export class PhotoPanel {
  private readonly api = inject(ImageApi);
  readonly actions = inject(ImageActions);
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  readonly summary = input.required<PhotoSummary>();
  readonly canSend = input(false);
  readonly canReport = input(false);
  readonly closed = output<void>();
  /** Something the list shows changed (confirmed, sent, deleted): it reads its rows again. */
  readonly changed = output<void>();
  readonly another = output<void>();
  readonly bucket = output<void>();

  readonly detail = signal<PhotoDetail | null>(null);
  readonly comparison = signal<Comparison | null>(null);
  readonly tab = signal<PanelTab>('measurement');
  readonly downloads = DOWNLOADS;
  readonly pctText = pctText;
  readonly trendWords = trendWords;
  private load: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The detail once read, the list's row before. */
  readonly view = computed<PhotoDetail>(() => {
    const d = this.detail();
    return d && d.photoId === this.summary().photoId ? d : (this.summary() as PhotoDetail);
  });
  readonly mpill = computed(() => measurePill(this.view()));
  readonly dpill = computed(() => descriptionPill(this.view()));
  readonly size = computed(() => sizeParts(this.view()));
  readonly advice = computed(() => stateAdvice(this.view()));
  readonly meta = computed(() => {
    const p = this.view();
    const parts: string[] = [];
    if (p.visit && p.patientRef) parts.push(`Visit ${p.visit}`);
    if (p.takenAt) parts.push(`taken ${this.when.transform(p.takenAt, 'recent')}`);
    if (p.status !== 'REFUSED') parts.push('location and camera details removed');
    else parts.push(p.fileName);
    return parts.join(' · ');
  });

  constructor() {
    effect(() => {
      const id = this.summary().photoId;
      untracked(() => {
        this.comparison.set(null);
        if (this.detail()?.photoId !== id) { this.detail.set(null); this.tab.set('measurement'); }
        this.read(id);
      });
    });
    inject(DestroyRef).onDestroy(() => { this.load?.unsubscribe(); if (this.timer) clearTimeout(this.timer); });
  }

  private read(id: number): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.load?.unsubscribe();
    this.load = this.api.one(id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) return;
        this.detail.set(r.data);
        if (r.data.status === 'MEASURING' || r.data.descriptionStatus === 'PENDING') this.timer = setTimeout(() => this.read(id), POLL_MS);
      },
      error: () => undefined,
    });
  }

  openCompare(): void {
    this.tab.set('compare');
    if (this.comparison()) return;
    this.api.compare(this.view().photoId).subscribe({ next: r => { if (r.status === API_SUCCESS && r.data) this.comparison.set(r.data); } });
  }

  day(iso: string | null | undefined): string {
    return iso ? this.when.transform(iso, 'day') ?? '' : '';
  }

  onChanged(d: PhotoDetail): void {
    this.detail.set(d);
    this.changed.emit();
    if (d.descriptionStatus === 'PENDING') this.read(d.photoId);
  }

  async confirmDraft(): Promise<void> {
    const d = await this.actions.confirm(this.view());
    if (d) this.onChanged(d);
  }

  async send(): Promise<void> {
    const d = await this.actions.sendToDocuments(this.view());
    if (d) this.onChanged(d);
  }

  async report(): Promise<void> {
    const d = await this.actions.addToReport(this.view());
    if (d) this.onChanged(d);
  }

  keep(): void {
    this.tab.set('measurement');
  }

  async remove(): Promise<void> {
    if (await this.actions.remove(this.view())) { this.closed.emit(); this.changed.emit(); }
  }
}
