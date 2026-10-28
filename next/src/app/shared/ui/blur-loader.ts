import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { LOADING_DELAY_MS } from './loading';

/**
 * Keeps what is on screen while the next answer is on its way, blurred under a spinner,
 * instead of swapping a full table for a "Loading…" block and back. A refresh, a filter, or
 * picking another profile then reads as the same list updating rather than the page
 * flickering empty. Input stays blocked while active so a click cannot land on a stale row.
 */
@Component({
  selector: 'app-blur-loader',
  template: `
    <div class="blur-loader" [class.is-loading]="active()" [attr.aria-busy]="active() ? 'true' : null">
      <div class="blur-loader-content"><ng-content /></div>
      @if (active() && shown()) {
        <div class="blur-loader-veil" role="status" [attr.aria-label]="label() || 'Loading'">
          <div class="blur-loader-badge">
            <div class="spinner"></div>
            @if (label()) { <span>{{ label() }}</span> }
          </div>
        </div>
      }
    </div>
  `,
})
export class BlurLoader {
  readonly active = input(false);
  readonly label = input('');

  /**
   * Owner 2026-10-27: the veil waits LOADING_DELAY_MS before it appears, so a quick refresh does not flash the rows;
   * the content is aria-busy (and blocked) from the first moment.
   */
  protected readonly shown = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const on = this.active();
      clearTimeout(this.timer);
      if (!on) { this.shown.set(false); return; }
      this.timer = setTimeout(() => this.shown.set(true), LOADING_DELAY_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }
}
