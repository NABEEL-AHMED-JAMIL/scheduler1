import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * "This could not be read" with a way to try again: the alert glyph, the reason, and a Try again
 * button. The table shell's error state, lifted out so a page that is not a list -- an editor
 * whose record would not load, a dashboard whose charts did not arrive -- says so the same way
 * instead of toasting and then showing an empty form or empty charts.
 *
 * `retryable` is false when trying again cannot help -- a record that does not exist -- and the
 * page puts its own way out (a "Back to tasks" link) in as content instead.
 */
@Component({
  selector: 'app-load-error',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <div class="px-6 py-14 text-center">
      <app-icon name="alert" size="1.75rem" class="icon-crit block mx-auto mb-3" />
      <p class="text-sm text-crit-500">{{ message() }}</p>
      @if (retryable()) {
        <button type="button" class="btn btn-default btn-sm mt-4" (click)="retry.emit()">
          <app-icon name="refresh" />Try again
        </button>
      }
      <ng-content />
    </div>
  `,
})
export class LoadError {
  readonly message = input.required<string>();
  readonly retryable = input(true);
  readonly retry = output<void>();
}
