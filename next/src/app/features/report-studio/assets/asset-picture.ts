import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ReportStudioApi } from '../report-studio.api';

/**
 * An asset's picture (MIG-406): its stored, re-encoded PNG or JPEG read through the API -- the bearer is needed, so the
 * page never points an <img> at the service -- shown through an object URL, released when the component goes. A
 * signature sits on white, a logo on the paper colour; while it loads, or if it cannot be read, a quiet box.
 */
@Component({
  selector: 'app-rs-asset-picture',
  host: { class: 'rsa-pic' },
  template: `
    @if (src(); as s) { <img [src]="s" [alt]="alt()" [style.max-height]="maxHeight()" /> }
    @else {
      <!-- Owner 2026-10-27: the quiet box has a name for a screen reader too -- loading, or that there is no picture. -->
      <span class="rsa-pic-empty" [class.rsa-pic-loading]="!failed()" role="img" [attr.aria-busy]="failed() ? null : 'true'"
            [attr.aria-label]="failed() ? 'No picture' + (alt() ? ' of ' + alt() : '') : 'Loading the picture' + (alt() ? ' of ' + alt() : '') + '…'">{{ failed() ? 'No picture' : '' }}</span>
    }
  `,
  styles: `
    :host { display: grid; place-items: center; min-width: 0; }
    img { max-width: 100%; object-fit: contain; display: block; }
    .rsa-pic-empty { font-size: 0.75rem; color: var(--text-muted); }
    .rsa-pic-loading { display: block; width: 3.5rem; height: 2rem; border-radius: var(--radius-sm); background: var(--surface-sunken);
      animation: rsa-pic-pulse 1.4s ease-in-out infinite; }
    @keyframes rsa-pic-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    @media (prefers-reduced-motion: reduce) { .rsa-pic-loading { animation: none; } }
  `,
})
export class AssetPicture {
  readonly assetId = input.required<string>();
  readonly version = input<number | null | undefined>(null);
  readonly tenantId = input<number | null | undefined>(null);
  readonly alt = input('');
  readonly maxHeight = input('5rem');
  private readonly api = inject(ReportStudioApi);
  readonly src = signal<string | null>(null);
  readonly failed = signal(false);
  private url: string | null = null;

  constructor() {
    effect(onCleanup => {
      const id = this.assetId();
      const v = this.version();
      const t = this.tenantId();
      const sub = this.api.assetFile(id, v ?? null, t ?? null).subscribe({
        next: blob => { this.release(); this.url = URL.createObjectURL(blob); this.src.set(this.url); this.failed.set(false); },
        error: () => { this.release(); this.src.set(null); this.failed.set(true); },
      });
      onCleanup(() => sub.unsubscribe());
    });
    inject(DestroyRef).onDestroy(() => this.release());
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
