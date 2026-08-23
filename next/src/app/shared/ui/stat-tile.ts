import { Component, input } from '@angular/core';
import { Icon } from './icon';

/**
 * The KPI tile that sits above a page's table. Six screens had hand-rolled copies of the
 * same three divs, which is how they drifted apart in the first place -- one class per
 * page, four different paddings. The icon carries the tile's meaning at a glance so the
 * label does not have to be read; the tone tints it, defaulting to the muted glyph used
 * for a plain count.
 */
@Component({
  selector: 'app-stat-tile',
  imports: [Icon],
  host: { class: 'stat-tile' },
  template: `
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="stat-label">{{ label() }}</div>
        <div class="stat-value">{{ value() }}</div>
      </div>
      @if (icon()) {
        <span class="stat-glyph" [class]="'icon-' + tone()">
          <app-icon [name]="icon()" size="1.05em" />
        </span>
      }
    </div>
    @if (foot()) { <div class="stat-foot truncate">{{ foot() }}</div> }
  `,
})
export class StatTile {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly foot = input('');
  readonly icon = input('');
  /** Matches the icon-* helpers in styles.css, so the tint follows the same palette as everywhere else. */
  readonly tone = input<'ok' | 'warn' | 'crit' | 'info' | 'muted'>('muted');
}
