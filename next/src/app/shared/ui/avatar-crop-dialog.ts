import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { CROP_SESSION } from './avatar-crop-session';

/** The side of the square the dialog hands back, in pixels. The server makes its 256 and 64 px copies from it. */
export const CROP_OUTPUT = 512;
const STAGE = 288;
const MAX_ZOOM = 4;

/**
 * Where the square crop sits on the picture: the source rectangle (in the picture's own pixels) that the stage shows.
 * Pure, so the arithmetic is tested without a canvas. {@code zoom} 1 is "the picture just covers the square".
 */
export function cropRect(natural: { w: number; h: number }, zoom: number, offset: { x: number; y: number }, stage = STAGE) {
  const scale = (stage / Math.min(natural.w, natural.h)) * zoom;
  const left = (stage - natural.w * scale) / 2 + offset.x;
  const top = (stage - natural.h * scale) / 2 + offset.y;
  return { sx: -left / scale, sy: -top / scale, side: stage / scale };
}

/** The offset kept inside the picture: however far it is dragged, the square never shows past an edge. */
export function clampOffset(natural: { w: number; h: number }, zoom: number, offset: { x: number; y: number }, stage = STAGE) {
  const scale = (stage / Math.min(natural.w, natural.h)) * zoom;
  const spareX = Math.max(0, (natural.w * scale - stage) / 2);
  const spareY = Math.max(0, (natural.h * scale - stage) / 2);
  return { x: Math.min(spareX, Math.max(-spareX, offset.x)), y: Math.min(spareY, Math.max(-spareY, offset.y)) };
}

/**
 * Choose the square of a picture that becomes someone's profile picture: drag to move, zoom with the slider, the wheel,
 * or + and -; the arrow keys move it too. The round guide shows how it will look beside a name; what is kept is the
 * whole square, drawn at 512 px as PNG -- in the browser, so a WebP picture works whatever the server can read, and a
 * phone photo arrives upright (the browser applies its orientation). The server still checks and re-encodes it.
 *
 * Loaded on demand from Profile (a dynamic import), so it costs nothing until someone changes their picture.
 */
@Component({
  selector: 'app-avatar-crop-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card shadow-2xl w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden">
      <div class="px-5 pt-4 pb-2">
        <h2 class="text-base font-semibold">Position your picture</h2>
        <p class="text-sm text-[color:var(--text-secondary)] mt-1">Drag to move it, and zoom to fit your face in the circle.</p>
      </div>
      <div class="px-5 py-2">
        <div #stage class="avatar-crop-stage" tabindex="0" role="img"
             aria-label="Picture to crop. Arrow keys move it; plus and minus zoom."
             [style.width.px]="stageSize" [style.height.px]="stageSize"
             (pointerdown)="grab($event)" (pointermove)="drag($event)" (pointerup)="release($event)" (pointercancel)="release($event)"
             (wheel)="wheel($event)" (keydown)="key($event)">
          @if (source()) {
            <img [src]="source()" alt="" draggable="false" class="avatar-crop-image"
                 [style.width.px]="shown().w" [style.height.px]="shown().h"
                 [style.transform]="'translate(' + shown().left + 'px,' + shown().top + 'px)'" (load)="loaded($event)" />
          }
          <div class="avatar-crop-guide" aria-hidden="true"></div>
          @if (failed()) {
            <p class="absolute inset-0 grid place-items-center text-sm p-6 text-center">This picture could not be opened. Try another.</p>
          }
        </div>
        <label class="flex items-center gap-3 mt-3 text-xs text-[color:var(--text-muted)]">
          <span>Zoom</span>
          <input type="range" class="flex-1" min="1" [max]="maxZoom" step="0.01" [value]="zoom()"
                 (input)="setZoom(+$any($event.target).value)" aria-label="Zoom" data-test="avatar-zoom" />
        </label>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="session.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="!ready() || saving()" (click)="use()"
                data-test="avatar-crop-use" cdkFocusInitial>
          Use this picture
        </button>
      </div>
    </div>
  `,
  styles: [`
    .avatar-crop-stage {
      position: relative; overflow: hidden; margin: 0 auto; touch-action: none; cursor: grab;
      background: var(--surface-sunken); border-radius: var(--radius-lg);
    }
    .avatar-crop-stage:active { cursor: grabbing; }
    .avatar-crop-stage:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
    .avatar-crop-image { position: absolute; left: 0; top: 0; max-width: none; user-select: none; pointer-events: none; }
    .avatar-crop-guide {
      position: absolute; inset: 0; border-radius: 9999px; pointer-events: none;
      box-shadow: 0 0 0 9999px color-mix(in srgb, var(--surface-raised) 62%, transparent);
      outline: 2px solid color-mix(in srgb, var(--surface-raised) 85%, transparent); outline-offset: -2px;
    }
  `],
})
export class AvatarCropDialog {
  readonly session = inject(CROP_SESSION);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  readonly stageSize = STAGE;
  readonly maxZoom = MAX_ZOOM;
  readonly source = signal('');
  readonly natural = signal<{ w: number; h: number } | null>(null);
  readonly zoom = signal(1);
  readonly offset = signal({ x: 0, y: 0 });
  readonly failed = signal(false);
  readonly saving = signal(false);
  readonly ready = computed(() => this.natural() !== null);

  private image: HTMLImageElement | null = null;
  private dragFrom: { x: number; y: number; ox: number; oy: number } | null = null;

  /** The picture's drawn size and position on the stage. */
  readonly shown = computed(() => {
    const n = this.natural();
    if (!n) return { w: 0, h: 0, left: 0, top: 0 };
    const scale = (STAGE / Math.min(n.w, n.h)) * this.zoom();
    const w = n.w * scale;
    const h = n.h * scale;
    return { w, h, left: (STAGE - w) / 2 + this.offset().x, top: (STAGE - h) / 2 + this.offset().y };
  });

  constructor() {
    const url = URL.createObjectURL(this.session.file);
    this.source.set(url);
    inject(DestroyRef).onDestroy(() => URL.revokeObjectURL(url));
  }

  loaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.naturalWidth || !img.naturalHeight) {
      this.failed.set(true);
      return;
    }
    this.image = img;
    this.natural.set({ w: img.naturalWidth, h: img.naturalHeight });
    this.stage().nativeElement.focus();
  }

  setZoom(value: number): void {
    const n = this.natural();
    const zoom = Math.min(MAX_ZOOM, Math.max(1, value || 1));
    this.zoom.set(zoom);
    if (n) this.offset.set(clampOffset(n, zoom, this.offset()));
  }

  private move(dx: number, dy: number, from = this.offset()): void {
    const n = this.natural();
    if (n) this.offset.set(clampOffset(n, this.zoom(), { x: from.x + dx, y: from.y + dy }));
  }

  grab(event: PointerEvent): void {
    if (!this.ready()) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragFrom = { x: event.clientX, y: event.clientY, ox: this.offset().x, oy: this.offset().y };
  }

  drag(event: PointerEvent): void {
    if (!this.dragFrom) return;
    this.move(event.clientX - this.dragFrom.x, event.clientY - this.dragFrom.y, { x: this.dragFrom.ox, y: this.dragFrom.oy });
  }

  release(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.dragFrom = null;
  }

  wheel(event: WheelEvent): void {
    event.preventDefault();
    this.setZoom(this.zoom() * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  key(event: KeyboardEvent): void {
    const step = event.shiftKey ? 24 : 6;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      this.move(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.setZoom(this.zoom() * 1.1);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.setZoom(this.zoom() / 1.1);
    }
  }

  use(): void {
    const n = this.natural();
    if (!n || !this.image) return;
    this.saving.set(true);
    const { sx, sy, side } = cropRect(n, this.zoom(), this.offset());
    const canvas = document.createElement('canvas');
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    const g = canvas.getContext('2d');
    if (!g) {
      this.saving.set(false);
      this.failed.set(true);
      return;
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.image, sx, sy, side, side, 0, 0, CROP_OUTPUT, CROP_OUTPUT);
    canvas.toBlob(blob => {
      this.saving.set(false);
      if (blob) this.session.close(blob);
      else this.failed.set(true);
    }, 'image/png');
  }
}
