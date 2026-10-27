import { Component, input, output } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { KpiCard } from '../../shared/charts/kpi-card';

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
  imports: [Icon, KpiCard],
  template: `
    <div class="card widget min-w-0" [class.widget-busy]="state() === 'running' || busy()" [attr.aria-busy]="busy() ? 'true' : null">
      <div class="widget-head">
        <div class="min-w-0 flex-1">
          <h3 class="widget-title truncate" [title]="title()">{{ title() }}</h3>
          @if (subtitle()) { <p class="widget-sub truncate" [title]="subtitleTitle() || subtitle()">{{ subtitle() }}</p> }
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <ng-content select="[actions]" />
          @if (refreshable()) {
            <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Run ' + title() + ' again'" title="Run again" [disabled]="state() === 'running' || state() === 'queued' || busy()" (click)="refresh.emit()">
              <app-icon name="refresh" [class.spin]="state() === 'running' || busy()" />
            </button>
          }
        </div>
      </div>
      <div class="widget-body">
        @switch (state()) {
          @case ('queued') {
            <!-- Waiting for a place among the tiles running now (a board runs three at once): the same skeleton, so
                 the board is drawn whole from the start and nothing moves when a tile's turn comes. -->
            <div class="flex flex-col gap-2" [class.py-3]="!reserveKpi()" [class.relative]="!!reserveKpi()" aria-busy="true" [attr.aria-label]="'Waiting to run ' + title()" [style.min-height.px]="reserve()">
              <span class="sr-only">Waiting to run {{ title() }}…</span>
              <!-- ZT §3.11: a figure's own card, unseen, holds the height the figure will take at this width. -->
              @if (reserveKpi(); as size) { <app-kpi-card class="kpi-reserve" aria-hidden="true" value="0" label="·" caption="·" [size]="size" /> }
              <div class="flex flex-col gap-2" [class.kpi-reserve-lines]="!!reserveKpi()">
                @for (line of skeletonLines; track line) { <span class="block h-3 rounded bg-sunken" [style.width.%]="line" aria-hidden="true"></span> }
              </div>
            </div>
          }
          @case ('running') {
            <!-- A skeleton that keeps the tile's height, so a board does not reflow under a reader as each widget lands. -->
            <div class="flex flex-col gap-2" [class.py-3]="!reserveKpi()" [class.relative]="!!reserveKpi()" aria-busy="true" [attr.aria-label]="'Running ' + title()" [style.min-height.px]="reserve()">
              <span class="sr-only">Running {{ title() }}…</span>
              <!-- ZT §3.11: a figure's own card, unseen, holds the height the figure will take at this width. -->
              @if (reserveKpi(); as size) { <app-kpi-card class="kpi-reserve" aria-hidden="true" value="0" label="·" caption="·" [size]="size" /> }
              <div class="flex flex-col gap-2" [class.kpi-reserve-lines]="!!reserveKpi()">
                @for (line of skeletonLines; track line) { <span class="block h-3 rounded bg-sunken pulse" [style.width.%]="line" aria-hidden="true"></span> }
              </div>
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
    .kpi-reserve { visibility: hidden; }
    .kpi-reserve-lines { position: absolute; inset: 0.75rem 0 auto 0; }
  `,
})
export class AnalyticsWidget {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** The longer form of the subtitle, on hover: a board shows a file's name and keeps its path here. */
  readonly subtitleTitle = input('');
  readonly state = input<WidgetState>('ready');
  /**
   * Re-running while still drawing its last result: the content stays (so the tile keeps its
   * size) and the tile says it is busy -- the refresh icon turns and the card dims a shade.
   */
  readonly busy = input(false);
  /**
   * MIG-416 (CLS 0.27 at 1024): the height the tile's drawing will take, held by its skeleton while it waits and runs --
   * a chart is drawn at a known height, and a short skeleton grew into it, moving every tile below. Null: the lines' own.
   */
  readonly reserve = input<number | null>(null);
  /**
   * ZT §3.11 (CLS 0.12-0.62 at 1024 on Riverside's board): a figure tile's skeleton held three lines (154 px a tile) and its
   * figure took 240, moving every row below. A figure's size is set by its width (the card is its own container), so the
   * skeleton holds an unseen card of that size: 'lg' for a quarter-width tile's centred figure, 'md' otherwise.
   */
  readonly reserveKpi = input<'lg' | 'md' | null>(null);
  readonly error = input('');
  readonly emptyMessage = input('No rows in this result.');
  readonly refreshable = input(true);
  readonly refresh = output<void>();
  /** Three lines of a plausible tile, as widths: the skeleton the running state draws. */
  readonly skeletonLines = [92, 68, 80];
}
