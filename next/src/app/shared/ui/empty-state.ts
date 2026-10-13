import { Component, ViewEncapsulation, input } from '@angular/core';
import { Icon } from './icon';

/**
 * UX review 2026-10-12 (A8, G10): an empty list or page says what it holds, why it is empty, and what to do next --
 * the primary next step as a button, and a link to the step before it ("See API Collections"), projected in that
 * order. "Nothing here yet." with no way forward is what a first-time user read as "there is no data".
 */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  host: { class: 'empty-state', role: 'status' },
  // Global on purpose: the rules order and space the content a page projects into it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .empty-state { display: block; text-align: center; }
    .empty-state-title { font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; color: var(--text-primary); }
    .empty-state-message { font-size: 0.875rem; line-height: 1.25rem; color: var(--text-secondary); margin-inline: auto; max-width: 36rem; }
    .empty-state-title + .empty-state-message { margin-top: 0.25rem; }
    .empty-state-hint { margin: 0.25rem auto 0; max-width: 36rem; font-size: 0.75rem; line-height: 1rem; color: var(--text-muted); }
    .empty-state-actions { margin-top: 1rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem; }
    .empty-state-actions:empty { display: none; }
  `,
  template: `
    <app-icon [name]="icon()" size="1.75rem" class="icon-muted block mx-auto mb-3" />
    @if (title()) { <p class="empty-state-title">{{ title() }}</p> }
    @if (message()) { <p class="empty-state-message">{{ message() }}</p> }
    <ng-content select="[hint]" />
    <div class="empty-state-actions"><ng-content /></div>
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  /** What this list holds ("No schedules yet"). */
  readonly title = input('');
  /** Why it is empty, and what fills it. */
  readonly message = input('');
}
