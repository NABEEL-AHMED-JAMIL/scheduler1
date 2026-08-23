import { Component, computed, input, output } from '@angular/core';
import { Icon } from './icon';
import { PAGE_SIZES } from './pager';

/**
 * The pager control for a list screen. Hides itself when everything fits on one page at the
 * smallest size, so short lists are not given furniture they do not need.
 */
@Component({
  selector: 'app-pagination',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    @if (total() > sizes[0]) {
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-t"
           style="border-color: var(--border-subtle);">
        <span class="text-xs text-[color:var(--text-muted)]">
          {{ firstRow() }}–{{ lastRow() }} of {{ total() }}
        </span>

        <div class="ml-auto flex items-center gap-1">
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() === 1"
                  (click)="goTo.emit(page() - 1)" aria-label="Previous page">
            <app-icon name="chevronLeft" />Prev
          </button>
          <span class="text-xs px-2 tabular">Page {{ page() }} of {{ totalPages() }}</span>
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() === totalPages()"
                  (click)="goTo.emit(page() + 1)" aria-label="Next page">
            Next<app-icon name="chevronRight" />
          </button>
        </div>

        <label class="flex items-center gap-1.5 text-xs text-[color:var(--text-muted)]">
          Per page
          <select class="input w-20 py-1 text-xs" [value]="size()"
                  (change)="setSize.emit(+$any($event.target).value)">
            @for (option of sizes; track option) { <option [value]="option">{{ option }}</option> }
          </select>
        </label>
      </div>
    }
  `,
})
export class Pagination {
  readonly total = input(0);
  readonly page = input(1);
  readonly size = input(PAGE_SIZES[0]);

  readonly goTo = output<number>();
  readonly setSize = output<number>();

  readonly sizes = PAGE_SIZES;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  readonly firstRow = computed(() => this.total() === 0 ? 0 : (this.page() - 1) * this.size() + 1);
  readonly lastRow = computed(() => Math.min(this.page() * this.size(), this.total()));
}
