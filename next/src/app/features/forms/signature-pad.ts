import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

/**
 * A box to sign in (MIG-277): drawn with a mouse, pen or finger, then kept as a PNG. Nothing is uploaded here -- the
 * page takes the PNG and uploads it as the field's signature. Clear starts again.
 */
@Component({
  selector: 'app-signature-pad',
  imports: [Icon],
  template: `
    <div class="flex flex-col gap-2">
      <canvas #pad class="signature-pad" width="600" height="180" [attr.aria-label]="label() + ': draw your signature'" role="img"
              [class.is-disabled]="disabled()"
              (pointerdown)="start($event)" (pointermove)="draw($event)" (pointerup)="end()" (pointerleave)="end()"></canvas>
      <div class="flex items-center gap-2 flex-wrap">
        <button type="button" class="btn btn-default btn-sm" [disabled]="disabled() || !drawn()" (click)="use()" data-sign>
          <app-icon name="check" />Use this signature</button>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="disabled() || !drawn()" (click)="clear()">Clear</button>
        <span class="text-xs text-[color:var(--text-muted)]">Sign inside the box.</span>
      </div>
    </div>
  `,
})
export class SignaturePad {
  readonly label = input('Signature');
  readonly disabled = input(false);
  readonly signed = output<Blob>();

  private readonly pad = viewChild.required<ElementRef<HTMLCanvasElement>>('pad');
  readonly drawn = signal(false);
  private drawing = false;

  private point(event: PointerEvent): [number, number] {
    const canvas = this.pad().nativeElement;
    const box = canvas.getBoundingClientRect();
    return [(event.clientX - box.left) * (canvas.width / box.width), (event.clientY - box.top) * (canvas.height / box.height)];
  }

  start(event: PointerEvent): void {
    if (this.disabled()) return;
    const ctx = this.pad().nativeElement.getContext('2d');
    if (!ctx) return;
    this.drawing = true;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const [x, y] = this.point(event);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(this.pad().nativeElement).getPropertyValue('--signature-ink').trim() || 'black';
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  draw(event: PointerEvent): void {
    if (!this.drawing) return;
    const ctx = this.pad().nativeElement.getContext('2d');
    if (!ctx) return;
    const [x, y] = this.point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.drawn.set(true);
  }

  end(): void {
    this.drawing = false;
  }

  clear(): void {
    const canvas = this.pad().nativeElement;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.drawn.set(false);
  }

  use(): void {
    this.pad().nativeElement.toBlob(blob => { if (blob) this.signed.emit(blob); }, 'image/png');
  }
}
