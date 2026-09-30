import { Component, inject, input } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { Icon } from './icon';

/**
 * A panel for work too long for a table row or a small dialog -- a topic's fifty pipelines, a source's settings, a
 * step's configuration: a head with the title and Close, a body that scrolls, a foot that stays. Opened through the
 * CDK Dialog with {@link sidePanelConfig}. Centred, like every dialog (owner, 2026-09-30: a drawer pinned to the right
 * edge of a wide screen read as a dialog opened in the wrong place).
 */
@Component({
  selector: 'app-side-panel',
  imports: [Icon],
  template: `
    <aside class="side-panel" role="dialog" [attr.aria-label]="heading()">
      <header class="side-panel-head">
        <div class="min-w-0 flex-1">
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

/** Dialog config for a panel: centred, narrow (36rem) or wide (58rem), up to 85% of the window's height. */
export function sidePanelConfig<D>(data: D, width: 'narrow' | 'wide' = 'narrow') {
  return { data, panelClass: width === 'wide' ? ['side-panel-host', 'side-panel-wide'] : 'side-panel-host', hasBackdrop: true, autoFocus: 'first-tabbable' as const };
}
