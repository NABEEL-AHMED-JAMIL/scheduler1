import { Component, input, output } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

/** Where a widget is in its life. */
export type WidgetState = 'idle' | 'queued' | 'running' | 'failed' | 'stopped' | 'empty' | 'ready';

/**
 * The chrome every analytics widget wears -- on a board, on the Studio's overview -- so a tile
 * on one screen looks and behaves like a tile on the other: a title, one line under it, a
 * refresh, an actions slot, and one place that decides how loading, empty, failed and stopped
 * read. What is drawn inside is the caller's; what happens around it is not.
 */
@Component({
  selector: 'app-analytics-widget',
  imports: [Icon],
  template: `
    <div class="card widget min-w-0" [class.widget-busy]="state() === 'running'">
      <div class="widget-head">
        <div class="min-w-0 flex-1">
          <h3 class="widget-title truncate" [title]="title()">{{ title() }}</h3>
          @if (subtitle()) { <p class="widget-sub truncate" [title]="subtitle()">{{ subtitle() }}</p> }
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <ng-content select="[actions]" />
          @if (refreshable()) {
            <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Run ' + title() + ' again'" title="Run again" [disabled]="state() === 'running' || state() === 'queued'" (click)="refresh.emit()">
              <app-icon name="refresh" [class.spin]="state() === 'running'" />
            </button>
          }
        </div>
      </div>
      <div class="widget-body">
        @switch (state()) {
          @case ('queued') {
            <p class="widget-note text-center py-4">Waiting its turn. Widgets run one at a time.</p>
          }
          @case ('running') {
            <!-- A skeleton that keeps the tile's height, so a board does not reflow under a reader as each widget lands. -->
            <div class="py-3 flex flex-col gap-2" aria-busy="true" [attr.aria-label]="'Running ' + title()">
              <span class="sr-only">Running {{ title() }}…</span>
              @for (line of skeletonLines; track line) { <span class="block h-3 rounded bg-sunken pulse" [style.width.%]="line" aria-hidden="true"></span> }
            </div>
          }
          @case ('failed') {
            <div class="widget-state">
              <app-icon name="alert" size="1.2rem" class="icon-crit" />
              <p class="text-xs text-crit-500">{{ error() || 'This widget could not run.' }}</p>
              @if (refreshable()) { <button type="button" class="btn btn-default btn-xs" (click)="refresh.emit()"><app-icon name="refresh" />Try again</button> }
            </div>
          }
          @case ('stopped') {
            <p class="widget-note text-center py-4">Stopped before it ran. Nothing is on this tile, which is not the same as nothing being in the data.</p>
          }
          @case ('empty') {
            <div class="widget-state">
              <app-icon name="inbox" size="1.2rem" class="icon-muted" />
              <p class="widget-note">{{ emptyMessage() }}</p>
            </div>
          }
          @case ('idle') {
            <p class="widget-note text-center py-4">Not run yet.</p>
          }
          @default { <ng-content /> }
        }
      </div>
      <ng-content select="[foot]" />
    </div>
  `,
  styles: `
    .widget { display: flex; flex-direction: column; padding: 1rem; gap: 0.5rem; }
    .widget-head { display: flex; align-items: flex-start; gap: 0.5rem; }
    .widget-title { font-size: 0.875rem; font-weight: 600; line-height: 1.25rem; }
    .widget-sub { font-size: 11px; color: var(--text-muted); line-height: 1rem; }
    .widget-body { min-width: 0; }
    .widget-note { font-size: 12px; color: var(--text-muted); }
    .widget-state { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; text-align: center; padding: 1.25rem 0.5rem; }
    .widget-busy { opacity: 0.92; }
  `,
})
export class AnalyticsWidget {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly state = input<WidgetState>('ready');
  readonly error = input('');
  readonly emptyMessage = input('No rows in this result.');
  readonly refreshable = input(true);
  readonly refresh = output<void>();
  /** Three lines of a plausible tile, as widths: the skeleton the running state draws. */
  readonly skeletonLines = [92, 68, 80];
}
