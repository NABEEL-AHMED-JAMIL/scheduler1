import { Component, input } from '@angular/core';

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
      @if (active()) {
        <div class="blur-loader-veil" role="status" [attr.aria-label]="label()">
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
}
