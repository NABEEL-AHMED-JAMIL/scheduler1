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
    <!-- The ring COLOUR is static and only its width toggles: an Angular [class.x] binding
         cannot carry a bracketed arbitrary-value class name. It was ring-brand-500, which the
         monochrome rebrand made near-black -- 1.37:1 on the dark page, so the selected filter
         looked exactly like an unselected one. -->
    <button type="button" class="card px-3.5 py-2 flex items-center gap-2 hover:shadow-md
                                 transition-shadow ring-[color:var(--focus-ring)]"
            [class.ring-2]="selected()"
            (click)="toggle.emit()">
      <app-status [label]="status()" />
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
