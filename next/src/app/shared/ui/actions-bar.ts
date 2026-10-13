import { Component, ViewEncapsulation, input } from '@angular/core';

/**
 * UX review 2026-10-12 (A5, G6): the one place an editor saves. A bar at the bottom of the editor -- sticky, so Save
 * is never below the fold -- with the change state on the left ("No changes", "3 unsaved changes") and the buttons on
 * the right in a fixed order the stylesheet enforces: Cancel (a .btn-ghost) first, then secondary saves, then the
 * one .btn-primary rightmost. A dialog's footer is the same bar, not sticky (`dialog`).
 */
@Component({
  selector: 'app-actions-bar',
  host: { class: 'actions-bar', '[class.actions-bar-sticky]': '!dialog()', role: 'group', '[attr.aria-label]': 'label()' },
  // Global on purpose: the rules order and space the content a page projects into it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .actions-bar {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.75rem 1rem; border-top: 1px solid var(--border-subtle); background: var(--surface-raised);
    }
    .actions-bar-sticky { position: sticky; bottom: 0; z-index: 5; margin-top: 1.5rem; }
    .actions-bar-state { font-size: 0.75rem; line-height: 1rem; color: var(--text-muted); min-width: 0; }
    .actions-bar-buttons { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-left: auto; }
    .actions-bar-buttons > .btn-ghost { order: -1; }
    .actions-bar-buttons > .btn-primary, .actions-bar-buttons > .btn-danger { order: 10; }
  `,
  template: `
    <div class="actions-bar-state" aria-live="polite">{{ state() }}<ng-content select="[state]" /></div>
    <div class="actions-bar-buttons"><ng-content /></div>
  `,
})
export class ActionsBar {
  /** What saving would change, on the left: "No changes", "3 unsaved changes". */
  readonly state = input('');
  /** A dialog's footer: in the flow, not stuck to the bottom of the window. */
  readonly dialog = input(false);
  readonly label = input('Actions');
}
