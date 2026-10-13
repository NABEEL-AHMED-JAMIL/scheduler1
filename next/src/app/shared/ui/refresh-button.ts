import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * UX review 2026-10-12 (A2): a header's Refresh, as an icon button, first in the actions group, with the "Live" dot
 * inside it when the page follows a feed. The word stays for a screen reader (and as the button's text content), and
 * in the tooltip.
 */
@Component({
  selector: 'app-refresh-button',
  imports: [Icon],
  host: { 'data-refresh': '', class: 'contents' },
  styles: `
    .refresh-btn { position: relative; }
    .refresh-live { position: absolute; top: 0.1875rem; right: 0.1875rem; width: 0.375rem; height: 0.375rem; }
  `,
  template: `
    <button type="button" class="btn btn-default btn-sm btn-icon refresh-btn" [disabled]="loading() && disableWhileLoading()"
            [title]="live() ? label() + ' (live: changes arrive as they happen)' : label()" (click)="refresh.emit()">
      <app-icon name="refresh" [class.spin]="loading()" />
      @if (live()) { <span class="live-dot live-on refresh-live" aria-hidden="true"></span> }
      <span class="sr-only">{{ label() }}</span>
    </button>
  `,
})
export class RefreshButton {
  readonly loading = input(false);
  /** The page follows a live feed: a pulsing dot in the button. */
  readonly live = input(false);
  readonly label = input('Refresh');
  /** Most pages refuse a second read while one runs; a page that queues it can leave the button on. */
  readonly disableWhileLoading = input(true);
  readonly refresh = output<void>();
}
