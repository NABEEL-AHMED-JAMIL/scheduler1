import { Component, input, output } from '@angular/core';

/**
 * Shared chrome for the list screens: a titled card with a filter slot, plus consistent
 * loading, error and empty states. Every table screen had its own slightly different version
 * of these three states in the old app, which is why some rendered a bare header when a
 * filter matched nothing.
 */
@Component({
  selector: 'app-table-shell',
  template: `
    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b"
           style="border-color: var(--border-subtle);">
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
        <div class="p-12 text-center text-sm text-[color:var(--text-muted)]">Loading…</div>
      } @else if (error()) {
        <div class="p-12 text-center">
          <p class="text-sm text-crit-500">{{ error() }}</p>
          <button type="button" class="btn btn-default btn-sm mt-3" (click)="retry.emit()">Try again</button>
        </div>
      } @else if (isEmpty()) {
        <div class="p-14 text-center">
          <p class="text-sm text-[color:var(--text-secondary)]">{{ emptyMessage() }}</p>
          <ng-content select="[empty-action]" />
        </div>
      } @else {
        <div class="overflow-x-auto"><ng-content /></div>
      }
    </div>
  `,
})
export class TableShell {
  readonly heading = input.required<string>();
  readonly loading = input(false);
  readonly error = input('');
  readonly isEmpty = input(false);
  readonly emptyMessage = input('Nothing here yet.');
  readonly shown = input<number | null>(null);
  readonly total = input<number | null>(null);
  readonly retry = output<void>();
}
