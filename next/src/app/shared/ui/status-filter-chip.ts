import { Component, input, output } from '@angular/core';
import { StatusPill } from './status-pill';

/**
 * A status count shown as a toggleable filter -- click it to narrow the table to that one
 * status, click again to clear it. Two screens (Queue, Job history) had this hand-copied as
 * an identical `.card`-based button; this is the one place that markup lives now.
 */
@Component({
  selector: 'app-status-filter-chip',
  imports: [StatusPill],
  template: `
    <!-- Owner 2026-10-12: a filter of the list, in its toolbar -- the toolbar's one 28 px height, not a card standing
         twice as tall beside the search. The ring colour is static and only its width toggles (a bracketed arbitrary
         value cannot ride a [class.x] binding); --focus-ring keeps the selected chip visible in dark mode. -->
    <button type="button" class="btn btn-default btn-sm gap-2 ring-[color:var(--focus-ring)]"
            [class.ring-2]="selected()"
            [attr.aria-pressed]="selected()"
            [attr.data-status]="status()"
            (click)="toggle.emit()">
      <app-status [label]="status()" [quiet]="true" />
      <span class="tabular font-semibold">{{ count() }}</span>
    </button>
  `,
})
export class StatusFilterChip {
  readonly status = input.required<string>();
  readonly count = input<number>(0);
  readonly selected = input(false);
  readonly toggle = output<void>();
}
