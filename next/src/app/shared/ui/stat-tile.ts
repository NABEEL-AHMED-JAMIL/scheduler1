import { Component, ViewEncapsulation, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Params, RouterLink } from '@angular/router';
import { Icon } from './icon';

/** The intent tints shared by the stat tile and the stat strip: the icon-* helpers in styles.css. */
export type StatTone = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

/** A number with en-US grouping; anything else as it is. */
export function figure(value: string | number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : String(value ?? '');
}

/**
 * One KPI tile, for a page that lays its tiles out in its own template rather than handing app-stat-strip a list.
 *
 * UX review 2026-10-12 (A7, G5): there were two KPI components -- this one as separate cards with the icon on the
 * right, app-stat-strip as a joined strip with the icon on the left -- and they read as two systems. This tile now
 * draws exactly a strip cell (icon left, label, figure, foot) and sits in a `.stat-strip.stat-row` container, so every
 * KPI row in the console is the same component on screen. `link` (and `queryParams`) make the tile the filter it
 * counts ("3 in review" opens the review filter).
 */
@Component({
  selector: 'app-stat-tile',
  imports: [Icon, RouterLink, NgTemplateOutlet],
  host: { class: 'stat-strip-cell stat-tile-cell', role: 'listitem' },
  // Global: the rules style the row the page lays its tiles in.
  encapsulation: ViewEncapsulation.None,
  styles: `
    /* A7: a row of tiles drawn as app-stat-strip -- one surface, hairlines between the tiles, and no blank square of
       border colour when the last row is short. */
    .stat-strip.stat-row { gap: 0; background: var(--surface-raised); }
    .stat-row > .stat-strip-cell { box-shadow: -1px 0 0 var(--border-subtle), 0 -1px 0 var(--border-subtle); }
  `,
  template: `
    @if (link()) {
      <a class="stat-strip-item is-action" [routerLink]="link()" [queryParams]="queryParams()"
         [attr.title]="hint() || null" [attr.aria-label]="name()">
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <div class="stat-strip-item" [attr.title]="hint() || null"><ng-container *ngTemplateOutlet="body" /></div>
    }
    <ng-template #body>
      @if (icon()) {
        <span class="stat-strip-glyph" [class]="'icon-' + tone()"><app-icon [name]="icon()" size="1.05em" /></span>
      }
      <span class="stat-strip-text">
        <span class="stat-strip-label">{{ label() }}</span>
        <span class="stat-strip-value">{{ shown() }}</span>
        <!-- Two lines before an ellipsis: a narrow tile cut "forecast $0.03 · Aug $0.02" at "Aug $…". -->
        @if (foot()) { <span class="stat-strip-foot line-clamp-2" [title]="foot()">{{ foot() }}</span> }
      </span>
    </ng-template>
  `,
})
export class StatTile {
  readonly label = input('');
  readonly value = input<string | number>('');
  /** A count with thousands separators: 137500 tokens read as 137,500 (UI review U12). Text passes as given. */
  protected readonly shown = computed(() => figure(this.value()));
  readonly foot = input('');
  readonly icon = input('');
  /** Matches the icon-* helpers in styles.css, so the tint follows the same palette as everywhere else. */
  readonly tone = input<StatTone>('muted');
  /** Makes the tile a link to the list it counts, filtered. */
  readonly link = input<string | readonly unknown[] | null>(null);
  readonly queryParams = input<Params | null>(null);
  /** Tooltip, and part of the accessible name when the tile is a link. */
  readonly hint = input('');
  protected readonly name = computed(() =>
    [`${this.label()}: ${this.shown()}`, this.foot(), this.hint()].filter(Boolean).join(', '));
}
