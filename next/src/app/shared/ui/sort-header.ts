import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon } from './icon';
import { TableSort } from './sort';

/**
 * A sortable column heading (owner 2026-10-27, "add a sort on each table"): `<th appSort="key" [sortBy]="sort">Name</th>`.
 *
 * The heading's text goes inside a real <button>, so a keyboard reaches it with Tab and sorts with Enter or Space, and
 * the th carries aria-sort while it is the sorted column. The console's sort glyph says which way it sorts, or that it
 * can sort at all. A column that cannot sort just now (see SortColumn.blocked) keeps its button, disabled for clicks
 * but still focusable, with the reason as its tooltip and description, so nobody wonders why nothing happens.
 */
@Component({
  selector: 'th[appSort]',
  imports: [Icon, NgTemplateOutlet],
  host: {
    '[attr.aria-sort]': 'sortBy().ariaSort(appSort())',
  },
  template: `
    <ng-template #label><ng-content /></ng-template>
    @if (sortable()) {
      <button type="button" class="th-sort" [class.th-sort-active]="active()"
              [attr.aria-disabled]="blocked() ? 'true' : null" [attr.title]="title() || null"
              (click)="sortBy().toggle(appSort())">
        <ng-container [ngTemplateOutlet]="label" />
        <app-icon [name]="sortBy().iconFor(appSort())" size="0.875rem" aria-hidden="true"
                  [class]="active() ? 'icon-info' : 'icon-muted'" />
        @if (blocked()) { <span class="sr-only">({{ blocked() }})</span> }
      </button>
    } @else {
      <!-- A column with no sortable key (an empty grid heading): a plain heading, no button that does nothing. -->
      <ng-container [ngTemplateOutlet]="label" />
    }
  `,
})
export class SortHeader {
  /** The column's key in the table's createTableSort columns. */
  readonly appSort = input.required<string>();
  readonly sortBy = input.required<TableSort<any>>();

  protected readonly sortable = computed(() => !!this.appSort() && this.sortBy().sortable(this.appSort()));
  protected readonly active = computed(() => this.sortBy().key() === this.appSort());
  protected readonly blocked = computed(() => this.sortBy().blockedReason(this.appSort()));
  protected readonly title = computed(() => this.blocked() || this.sortBy().note);
}
