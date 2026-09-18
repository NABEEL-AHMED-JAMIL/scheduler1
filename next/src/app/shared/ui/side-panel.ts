import { Component, inject, input } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { Icon } from './icon';

/**
 * A drawer that slides in from the right edge for a list too long to unfold inside a table
 * row -- a topic's fifty pipelines, say. Opened through the CDK Dialog with
 * {@link sidePanelConfig} so it takes the full height beside the page rather than the
 * centre of it; the page stays visible and the row that opened it is still in view.
 */
@Component({
  selector: 'app-side-panel',
  imports: [Icon],
  template: `
    <aside class="side-panel" role="dialog" [attr.aria-label]="heading()">
      <header class="side-panel-head">
        <div class="min-w-0">
          <h2 class="text-base font-semibold truncate">{{ heading() }}</h2>
          @if (subtitle()) { <p class="text-sm text-[color:var(--text-secondary)] truncate">{{ subtitle() }}</p> }
        </div>
        <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0" aria-label="Close" (click)="ref.close()">
          <app-icon name="close" />
        </button>
      </header>
      <div class="side-panel-body"><ng-content /></div>
      <footer class="side-panel-foot"><ng-content select="[foot]" /></footer>
    </aside>
  `,
})
export class SidePanel {
  readonly ref = inject<DialogRef<unknown>>(DialogRef);
  readonly heading = input.required<string>();
  readonly subtitle = input('');
}

/** Dialog config that pins the panel to the right edge, full height. */
export function sidePanelConfig<D>(data: D) {
  return { data, panelClass: 'side-panel-host', hasBackdrop: true, autoFocus: 'first-tabbable' as const };
}
