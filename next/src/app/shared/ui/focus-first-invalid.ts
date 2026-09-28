import { Injector, afterNextRender } from '@angular/core';

/**
 * Takes focus to the first field a failed save marked, and brings it into view. "Check the
 * highlighted fields." left focus on Save, so a keyboard or screen-reader user had to go looking
 * for the highlight, often above the fold on a long form.
 *
 * Waits for the next render: app-field sets aria-invalid on its control after rendering, and the
 * save that marked the fields touched has not rendered yet. The read phase runs after those writes.
 * Does nothing when no field is invalid, so it is safe to call after any confirm.
 */
export function focusFirstInvalid(host: HTMLElement, injector: Injector): void {
  afterNextRender({
    read: () => {
      const field = host.querySelector<HTMLElement>(
        '[aria-invalid="true"], input.ng-invalid, textarea.ng-invalid, select.ng-invalid');
      if (!field) return;
      field.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      field.focus({ preventScroll: true });
    },
  }, { injector });
}
