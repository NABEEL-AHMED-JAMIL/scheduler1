import { Component, DestroyRef, ElementRef, Injectable, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ImageApi } from './image.api';
import { BlurRegion, Geometry } from './image.model';

/**
 * The photos' bytes as object URLs, read once with the reader's token (an <img> cannot send it): keyed by photo, size and
 * version (a blur writes the stored copy over, so its version changes), at most 120 kept.
 */
@Injectable({ providedIn: 'root' })
export class PhotoImages {
  private readonly api = inject(ImageApi);
  private readonly urls = new Map<string, string>();
  private readonly waiting = new Map<string, ((url: string | null) => void)[]>();

  url(id: number, thumb: boolean, version: number, done: (url: string | null) => void): Subscription | null {
    const key = `${id}:${thumb ? 't' : 'f'}:${version}`;
    const known = this.urls.get(key);
    if (known) { done(known); return null; }
    const queue = this.waiting.get(key);
    if (queue) { queue.push(done); return null; }
    this.waiting.set(key, [done]);
    return this.api.image(id, thumb).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        this.urls.set(key, url);
        if (this.urls.size > 120) {
          const [first, old] = this.urls.entries().next().value as [string, string];
          this.urls.delete(first);
          URL.revokeObjectURL(old);
        }
        (this.waiting.get(key) ?? []).forEach(f => f(url));
        this.waiting.delete(key);
      },
      error: () => { (this.waiting.get(key) ?? []).forEach(f => f(null)); this.waiting.delete(key); },
    });
  }
}

export type Overlay = 'outline' | 'ruler' | 'lw';
export type DrawMode = 'view' | 'outline' | 'blur';

/**
 * One photo as stored (location and camera details removed, blurred where asked) with what was measured drawn over it, in the
 * photo's own pixels: the outline found in code (blue), the ruler as found (green, "Ruler found · 10 cm · 70.2 px/cm"), the
 * length and width lines with their sizes, or "No ruler found: no size". A small one (the list's) draws no labels. In
 * "outline" mode a click adds a point of a new outline (Done, or a double click, ends it); in "blur" mode a drag draws a box.
 */
@Component({
  selector: 'app-photo-view',
  host: { class: 'pv', '[class.pv-sm]': 'small()', '[class.pv-dark]': "target() === 'contrast'", '[class.pv-drawing]': "mode() !== 'view'", '[attr.data-photo]': 'photoId()' },
  styles: `
    :host { position: relative; display: block; border-radius: var(--radius-lg); overflow: hidden; background: var(--color-ink-950); line-height: 0; }
    :host(.pv-sm) { border-radius: var(--radius-sm); }
    img { width: 100%; display: block; }
    .pv-ph { position: relative; display: grid; place-items: center; color: var(--color-ink-400); font-size: 0.75rem; line-height: 1.2; }
    .pv-ph svg { position: static; display: block; width: 100%; height: auto; }
    .pv-ph span { position: absolute; inset: 0; display: grid; place-items: center; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    :host(.pv-drawing) svg { cursor: crosshair; }
    .pv-tag { position: absolute; line-height: 1.2; font: 600 0.6875rem var(--font-sans); padding: 0.1875rem 0.4375rem; border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--color-ink-900) 82%, transparent); color: var(--on-solid); white-space: nowrap; pointer-events: none; }
    .pv-tag.pv-ok { background: var(--color-ok-500); }
    .pv-tag.pv-warn { background: var(--color-warn-600); }
    .pv-corner { left: 3%; bottom: 4%; }
    .pv-outline { fill: color-mix(in oklab, var(--color-info-500) 10%, transparent); stroke: var(--color-info-500); }
    /* A dark region (a skin lesion, target contrast) is outlined in amber, as the design draws it; a red region stays blue. */
    :host(.pv-dark) .pv-outline { fill: color-mix(in oklab, var(--color-warn-400) 12%, transparent); stroke: var(--color-warn-400); }
    .pv-lw { stroke: var(--on-solid); }
    .pv-ruler { fill: none; stroke: var(--color-ok-400); }
    .pv-blur { fill: none; stroke: var(--color-warn-400); }
    .pv-draw { fill: color-mix(in oklab, var(--color-warn-400) 12%, transparent); stroke: var(--color-warn-400); }
    .pv-dot { fill: var(--color-warn-400); }
    .pv-box { fill: color-mix(in oklab, var(--color-warn-400) 20%, transparent); stroke: var(--color-warn-400); }
    :host(.pv-sm) .pv-tag { display: none; }
  `,
  template: `
    @if (src(); as s) {
      <img [src]="s" [alt]="alt()" (load)="loaded.set(true)" />
    } @else {
      <div class="pv-ph"><svg [attr.viewBox]="'0 0 ' + w() + ' ' + h()" aria-hidden="true"></svg><span>{{ failed() ? 'The photo could not be shown.' : '' }}</span></div>
    }
    @if (src()) {
      <svg #svg [attr.viewBox]="'0 0 ' + w() + ' ' + h()" preserveAspectRatio="none" (click)="onClick($event)" (dblclick)="finish()"
           (pointerdown)="onDown($event)" (pointermove)="onMove($event)" (pointerup)="onUp($event)" aria-hidden="true">
        @if (show('outline') && outlinePath(); as d) {
          <path class="pv-outline" [attr.d]="d" [attr.stroke-width]="stroke()" stroke-linejoin="round" />
        }
        @if (show('lw') && sized()) {
          @for (l of lines(); track $index) {
            <line [attr.x1]="l[0]" [attr.y1]="l[1]" [attr.x2]="l[2]" [attr.y2]="l[3]" class="pv-lw" [attr.stroke-width]="stroke() * 0.75"
                  [attr.stroke-dasharray]="stroke() * 2.5 + ' ' + stroke() * 1.5" />
          }
        }
        @if (show('ruler') && rulerBox(); as r) {
          <rect [attr.x]="r[0]" [attr.y]="r[1]" [attr.width]="r[2] - r[0]" [attr.height]="r[3] - r[1]" rx="6" class="pv-ruler"
                [attr.stroke-width]="stroke() * 1.25" />
        }
        @for (b of blurBoxes(); track $index) {
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.width" [attr.height]="b.height" rx="10" class="pv-blur"
                [attr.stroke-width]="stroke()" [attr.stroke-dasharray]="stroke() * 3 + ' ' + stroke() * 2" />
        }
        @if (drawing().length) {
          <polyline class="pv-draw" [attr.points]="drawingPoints()" [attr.stroke-width]="stroke()" />
          @for (p of drawingDots(); track $index) { <circle [attr.cx]="p[0]" [attr.cy]="p[1]" [attr.r]="stroke() * 1.4" class="pv-dot" /> }
        }
        @if (box(); as b) {
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.width" [attr.height]="b.height" class="pv-box"
                [attr.stroke-width]="stroke()" />
        }
      </svg>
      @if (!small()) {
        @if (show('lw') && sized()) {
          @if (lengthTag(); as t) { <span class="pv-tag" [style.left.%]="t.x" [style.top.%]="t.y" data-test="tag-length">L {{ lengthCm()!.toFixed(1) }} cm</span> }
          @if (widthTag(); as t) { <span class="pv-tag" [style.left.%]="t.x" [style.top.%]="t.y" data-test="tag-width">W {{ widthCm()!.toFixed(1) }} cm</span> }
        }
        @if (show('ruler') && rulerTag(); as t) {
          <span class="pv-tag pv-ok" [style.left.%]="t.x" [style.top.%]="t.y" data-test="tag-ruler">Ruler found · {{ t.cm }} cm · {{ pxPerCm()!.toFixed(1) }} px/cm</span>
        }
        @if (noRuler() && !hideNoRuler()) { <span class="pv-tag pv-warn pv-corner" data-test="tag-no-ruler">No ruler found: no size</span> }
      }
    }
  `,
})
export class PhotoView {
  private readonly images = inject(PhotoImages);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');

  readonly photoId = input.required<number>();
  readonly version = input(0);
  readonly small = input(false);
  readonly geometry = input<Geometry | null | undefined>(null);
  readonly width = input<number | null | undefined>(null);
  readonly height = input<number | null | undefined>(null);
  readonly overlays = input<readonly Overlay[]>(['outline', 'ruler', 'lw']);
  readonly scaleFound = input<boolean | null | undefined>(null);
  readonly pxPerCm = input<number | null | undefined>(null);
  readonly lengthCm = input<number | null | undefined>(null);
  readonly widthCm = input<number | null | undefined>(null);
  readonly blurRegions = input<readonly BlurRegion[]>([]);
  readonly hideNoRuler = input(false);
  /** The measurement's target: contrast (a dark region) draws the outline in amber. */
  readonly target = input<string | null | undefined>(null);
  readonly mode = input<DrawMode>('view');
  readonly alt = input('Wound photo');
  readonly outlineDrawn = output<number[]>();
  readonly boxDrawn = output<BlurRegion>();

  readonly src = signal<string | null>(null);
  readonly failed = signal(false);
  readonly loaded = signal(false);
  readonly drawing = signal<number[][]>([]);
  readonly box = signal<BlurRegion | null>(null);
  private start: number[] | null = null;
  private sub: Subscription | null = null;

  readonly w = computed(() => this.geometry()?.width ?? this.width() ?? 1000);
  readonly h = computed(() => this.geometry()?.height ?? this.height() ?? 760);
  readonly ratio = computed(() => `${this.w()} / ${this.h()}`);
  readonly stroke = computed(() => Math.max(2, this.w() / 250));
  readonly sized = computed(() => !!this.scaleFound() && this.lengthCm() != null && this.widthCm() != null);
  readonly noRuler = computed(() => this.scaleFound() === false && !!this.geometry());
  readonly rulerBox = computed(() => { const r = this.geometry()?.rulerBox; return r && r.length === 4 ? r : null; });
  readonly blurBoxes = computed(() => this.blurRegions());
  readonly outlinePath = computed(() => {
    const o = this.geometry()?.outline;
    if (!o || o.length < 6) return null;
    let d = '';
    for (let i = 0; i + 1 < o.length; i += 2) d += `${i ? 'L' : 'M'}${o[i]} ${o[i + 1]}`;
    return d + 'Z';
  });
  readonly lines = computed(() => [this.geometry()?.lengthLine, this.geometry()?.widthLine].filter((l): l is number[] => !!l && l.length === 4));
  /** The length tag sits right of the length line's far end; the width tag just below the width line's lower end. */
  readonly lengthTag = computed(() => {
    const l = this.geometry()?.lengthLine;
    if (!l || l.length !== 4) return null;
    const right = l[0] > l[2] ? [l[0], l[1]] : [l[2], l[3]];
    return { x: (right[0] + this.w() * 0.01) / this.w() * 100, y: (right[1] - this.h() * 0.016) / this.h() * 100 };
  });
  readonly widthTag = computed(() => {
    const l = this.geometry()?.widthLine;
    if (!l || l.length !== 4) return null;
    const low = l[1] > l[3] ? [l[0], l[1]] : [l[2], l[3]];
    return { x: (low[0] + this.w() * 0.008) / this.w() * 100, y: (low[1] + this.h() * 0.008) / this.h() * 100 };
  });
  readonly rulerTag = computed(() => {
    const r = this.rulerBox(), s = this.pxPerCm();
    if (!r || !s) return null;
    return { x: r[0] / this.w() * 100, y: Math.max(0, (r[1] - this.h() * 0.035)) / this.h() * 100, cm: Math.round((r[2] - r[0]) / s) };
  });
  readonly drawingPoints = computed(() => this.drawing().map(p => `${p[0]},${p[1]}`).join(' '));
  readonly drawingDots = computed(() => this.drawing());

  constructor() {
    effect(() => {
      const id = this.photoId(), small = this.small(), version = this.version();
      this.sub?.unsubscribe();
      this.failed.set(false);
      this.sub = this.images.url(id, small, version, url => { this.src.set(url); this.failed.set(!url); });
    });
    effect(() => { if (this.mode() === 'view') { this.drawing.set([]); this.box.set(null); } });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  show(o: Overlay): boolean {
    return this.overlays().includes(o);
  }

  /** The point under the pointer, in the photo's own pixels. */
  private at(event: MouseEvent): number[] | null {
    const el = this.svg()?.nativeElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = Math.round(Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * this.w());
    const y = Math.round(Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) * this.h());
    return [x, y];
  }

  onClick(event: MouseEvent): void {
    if (this.mode() !== 'outline') return;
    const p = this.at(event);
    if (p) this.drawing.update(list => [...list, p]);
  }

  /** Ends the outline being drawn (at least 3 points) and hands it out. */
  finish(): void {
    if (this.mode() !== 'outline') return;
    const pts = this.drawing();
    if (pts.length >= 3) this.outlineDrawn.emit(pts.flat());
  }

  undoPoint(): void {
    this.drawing.update(list => list.slice(0, -1));
  }

  clear(): void {
    this.drawing.set([]);
    this.box.set(null);
  }

  onDown(event: PointerEvent): void {
    if (this.mode() !== 'blur') return;
    this.start = this.at(event);
    (event.target as Element)?.setPointerCapture?.(event.pointerId);
  }

  onMove(event: PointerEvent): void {
    if (this.mode() !== 'blur' || !this.start) return;
    const p = this.at(event);
    if (!p) return;
    this.box.set({ x: Math.min(p[0], this.start[0]), y: Math.min(p[1], this.start[1]), width: Math.abs(p[0] - this.start[0]),
      height: Math.abs(p[1] - this.start[1]) });
  }

  onUp(_event: PointerEvent): void {
    if (this.mode() !== 'blur' || !this.start) return;
    this.start = null;
    const b = this.box();
    if (b && b.width >= 4 && b.height >= 4) this.boxDrawn.emit(b);
  }
}
