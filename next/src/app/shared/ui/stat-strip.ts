import { Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Params, RouterLink } from '@angular/router';
import { Icon } from './icon';
import { StatTone } from './stat-tile';

/** One count in a strip. Plain data only -- no callbacks, so a template never binds a function. */
export interface StatStripItem {
  label: string;
  value: string | number;
  /** A line under the label, e.g. "of 42". */
  foot?: string;
  /** Tooltip for the tile, and part of its accessible name when the tile is clickable. */
  hint?: string;
  /** Tints the icon (or a small dot when there is no icon) -- never the number. */
  tone?: StatTone;
  icon?: string;
  /** Makes the tile a router link. */
  link?: string | readonly unknown[];
  queryParams?: Params;
  /** Makes the tile a button that emits (itemClick). Ignored when `link` is set. */
  clickable?: boolean;
  /** For a clickable tile that toggles a filter: exposed as aria-pressed. */
  pressed?: boolean;
  /** Draws the value muted -- a zero that is information rather than a reading. */
  quiet?: boolean;
  /** Shows a pulsing live dot; the text is its tooltip and its screen-reader wording. */
  live?: string;
}

export interface StatStripSummary { label: string; value: string | number; }

export type StripPhoneCols = 2 | 3;
export type StripCols = 2 | 3 | 4 | 5 | 6;

/*
 * Written out in full so Tailwind finds every class when it scans this file: a class built
 * by string concatenation is never generated.
 */
const PHONE_COLS: Record<StripPhoneCols, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3' };
const SM_COLS: Record<StripCols, string> = {
  2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6',
};
const LG_COLS: Record<StripCols, string> = {
  2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6',
};
const SPAN: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
};
const SM_SPAN: Record<number, string> = {
  1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4', 5: 'sm:col-span-5', 6: 'sm:col-span-6',
};
const LG_SPAN: Record<number, string> = {
  1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6',
};

/** How many columns the last tile has to cover so its row has no blank square. */
const lastSpan = (count: number, cols: number): number => count % cols === 0 ? 1 : cols - (count % cols) + 1;

/**
 * The dense row of small counts -- run totals, durations, live status -- drawn as tiles
 * separated by hairlines. Four screens had hand-rolled copies with different paddings, type
 * sizes and label orders; this is the one they share. For a page's headline KPIs use
 * app-stat-tile instead: this is the compact form.
 *
 * Wraps to 2 (or 3) columns on a phone and to `smCols` / `lgCols` above that. When the tiles
 * do not fill the last row, the last tile stretches across it rather than leaving a blank
 * square of hairline colour.
 *
 * In the DOM each tile's label comes before its value, so a screen reader says "Running, 3";
 * the value is drawn first. A tile with a link or `clickable` is a real <a> or <button> with
 * a focus ring, and its accessible name is spelled out in full.
 */
@Component({
  selector: 'app-stat-strip',
  imports: [Icon, RouterLink, NgTemplateOutlet],
  host: {
    class: 'stat-strip',
    role: 'list',
    '[class]': 'gridClass()',
    '[class.is-start]': "align() === 'start'",
    '[class.is-md]': "size() === 'md'",
    '[attr.aria-label]': 'label() || null',
  },
  template: `
    @for (item of items(); track item.label; let last = $last) {
      <div role="listitem" class="stat-strip-cell" [class]="last ? lastClass() : ''">
        @if (item.link) {
          <a class="stat-strip-item is-action" [routerLink]="item.link" [queryParams]="item.queryParams ?? null"
             [attr.title]="item.hint || null" [attr.aria-label]="nameOf(item)">
            <ng-container *ngTemplateOutlet="body; context: { $implicit: item }" />
          </a>
        } @else if (item.clickable) {
          <button type="button" class="stat-strip-item is-action"
                  [attr.title]="item.hint || null" [attr.aria-label]="nameOf(item)"
                  [attr.aria-pressed]="item.pressed === undefined ? null : item.pressed"
                  (click)="itemClick.emit(item)">
            <ng-container *ngTemplateOutlet="body; context: { $implicit: item }" />
          </button>
        } @else {
          <div class="stat-strip-item" [attr.title]="item.hint || null">
            <ng-container *ngTemplateOutlet="body; context: { $implicit: item }" />
          </div>
        }
      </div>
    }
    @if (summary(); as total) {
      <div role="listitem" class="stat-strip-summary">
        <span class="stat-strip-value">{{ total.value }}</span>
        <span class="stat-strip-label">{{ total.label }}</span>
      </div>
    }

    <ng-template #body let-item>
      @if (item.icon) {
        <span class="stat-strip-glyph" [class]="'icon-' + (item.tone || 'muted')">
          <app-icon [name]="item.icon" size="1.05em" />
        </span>
      } @else if (item.tone) {
        <span class="stat-strip-dot" [class]="'icon-' + item.tone" aria-hidden="true"></span>
      }
      <span class="stat-strip-text">
        <span class="stat-strip-label">{{ item.label }}</span>
        <span class="stat-strip-value" [class.is-quiet]="item.quiet">{{ item.value }}</span>
        @if (item.foot) { <span class="stat-strip-foot">{{ item.foot }}</span> }
      </span>
      @if (item.live) {
        <span class="live-dot live-on stat-strip-live" [attr.title]="item.live" aria-hidden="true"></span>
        <span class="sr-only">{{ item.live }}</span>
      }
    </ng-template>
  `,
})
export class StatStrip {
  readonly items = input.required<readonly StatStripItem[]>();
  /** Columns on a phone. Two or three: a fourth squeezes the labels into single letters. */
  readonly cols = input<StripPhoneCols>(2);
  /** Columns from the sm breakpoint; defaults to the phone count. */
  readonly smCols = input<StripCols | null>(null);
  /** Columns from the lg breakpoint; defaults to the sm count. */
  readonly lgCols = input<StripCols | null>(null);
  /** Centred tiles (the default) or tiles that read from the left, for a strip led by icons. */
  readonly align = input<'center' | 'start'>('center');
  /** `md` draws the value larger, for a strip that stands on its own above a table. */
  readonly size = input<'sm' | 'md'>('sm');
  /** A full-width line under the tiles, e.g. the total the tiles add up to. */
  readonly summary = input<StatStripSummary | null>(null);
  /** The list's accessible name. */
  readonly label = input('');

  readonly itemClick = output<StatStripItem>();

  private readonly smCount = computed<number>(() => this.smCols() ?? this.cols());
  private readonly lgCount = computed<number>(() => this.lgCols() ?? this.smCount());

  readonly gridClass = computed(() => [
    PHONE_COLS[this.cols()],
    this.smCols() ? SM_COLS[this.smCols()!] : '',
    this.lgCols() ? LG_COLS[this.lgCols()!] : '',
  ].filter(Boolean).join(' '));

  readonly lastClass = computed(() => {
    const n = this.items().length;
    return [SPAN[lastSpan(n, this.cols())], SM_SPAN[lastSpan(n, this.smCount())], LG_SPAN[lastSpan(n, this.lgCount())]]
      .join(' ');
  });

  /** "Failed: 3, of 42 -- Runs that ended in an error": everything the tile shows, in reading order. */
  nameOf(item: StatStripItem): string {
    return [`${item.label}: ${item.value}`, item.foot, item.hint].filter(Boolean).join(', ');
  }
}
