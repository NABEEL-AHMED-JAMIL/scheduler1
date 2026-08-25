import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * Shared chrome for the list screens: a titled card with a filter slot, plus consistent
 * loading, error and empty states. Every table screen had its own slightly different version
 * of these three states in the old app, which is why some rendered a bare header when a
 * filter matched nothing.
 */
@Component({
  selector: 'app-table-shell',
  imports: [Icon],
  template: `
    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-subtle"
          >
        <h2 class="text-sm font-semibold mr-auto">
          {{ heading() }}
          @if (total() !== null) {
            <span class="text-[color:var(--text-muted)] font-normal">
              ({{ shown() }} of {{ total() }})
            </span>
          }
        </h2>
        <ng-content select="[toolbar]" />
      </div>

      @if (loading()) {
        <div class="px-6 py-14 text-center text-sm text-[color:var(--text-muted)]">
          <div class="spinner mx-auto mb-3" role="status" aria-label="Loading"></div>
          Loading…
        </div>
      } @else if (error()) {
        <div class="px-6 py-14 text-center">
          <app-icon name="alert" size="1.75rem" class="icon-crit block mx-auto mb-3" />
          <p class="text-sm text-crit-500">{{ error() }}</p>
          <button type="button" class="btn btn-default btn-sm mt-4" (click)="retry.emit()">
            <app-icon name="refresh" />Try again
          </button>
        </div>
      } @else if (isEmpty()) {
        <div class="px-6 py-14 text-center">
          <app-icon [name]="emptyIcon()" size="1.75rem"
                    class="icon-muted block mx-auto mb-3" />
          <p class="text-sm text-[color:var(--text-secondary)]">{{ emptyMessage() }}</p>
          <div class="mt-4"><ng-content select="[empty-action]" /></div>
        </div>
      } @else {
        <!-- The rows scroll inside their own box so the toolbar above and the pager below
             stay put. Without it a 369-entry log ran the page to 15,000px and the view
             switcher, search and refresh were all off-screen by the second row. -->
        <div class="overflow-x-auto" [class.scroll-table]="scrollRows()"><ng-content /></div>
      }
      <!-- Outside the scroll box: paging controls that scroll away with the rows are
           unreachable exactly when a long list makes them necessary. -->
      <ng-content select="[pager]" />
    </div>
  `,
})
export class TableShell {
  readonly heading = input.required<string>();
  readonly loading = input(false);
  readonly error = input('');
  readonly isEmpty = input(false);
  readonly emptyMessage = input('Nothing here yet.');
  /** Something that suggests what is missing beats a generic box on every screen. */
  readonly emptyIcon = input('inbox');
  /**
   * Whether the rows scroll in their own box, keeping the toolbar and pager pinned.
   *
   * On by default because that is what a long list needs: a 369-entry log ran the page to
   * 15,000px and put the view switcher, search and refresh off-screen by the second row. A
   * screen whose list is short enough to read in one piece can turn it off and let the page
   * scroll instead, which costs the pinning but reads more naturally.
   */
  readonly scrollRows = input(true);
  readonly shown = input<number | null>(null);
  readonly total = input<number | null>(null);
  readonly retry = output<void>();
}
