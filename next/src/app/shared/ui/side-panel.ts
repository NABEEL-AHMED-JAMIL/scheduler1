import { Component, ViewEncapsulation, inject, input } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { Icon } from './icon';

/**
 * A panel for work too long for a table row or a small dialog -- a topic's fifty pipelines, a source's settings, a
 * step's configuration: a head with the title and Close, a body that scrolls, a foot that stays. Opened through the
 * CDK Dialog with {@link sidePanelConfig}: centred for a picker or a form (owner, 2026-09-30), or sliding over the
 * right for a row's detail (UX review 2026-10-12, A9, after the owner's reference screens of 10-12).
 */
@Component({
  selector: 'app-side-panel',
  imports: [Icon],
  // Global: the rules style the overlay pane the panel is opened in (sidePanelConfig's panelClass).
  encapsulation: ViewEncapsulation.None,
  styles: `
    /* UX review 2026-10-12 (A9, G9): a row's detail slides over the right of the screen, as the reference products'
       detail panel does, rather than a modal over the middle of the list. Full height; the list stays readable beside it. */
    .side-panel-host.side-panel-right { position: fixed !important; top: 0; right: 0; bottom: 0; margin: 0 !important; max-height: none; height: 100dvh; }
    .side-panel-right .side-panel { max-height: none; height: 100%; border-radius: 0; border-width: 0 0 0 1px; animation: side-panel-slide 180ms ease-out; }
    @keyframes side-panel-slide { from { transform: translateX(1.5rem); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .side-panel-right .side-panel { animation: none; } }
  `,
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

/**
 * Dialog config for a panel: narrow (36rem) or wide (58rem). Centred, up to 85% of the window's height -- a picker, a
 * settings form -- or, `place: 'right'`, a row's detail sliding over the right of the screen at full height (UX review
 * 2026-10-12, A9 and G9: the catalog asset, a pipeline's step, a connection, a run), with the list still beside it.
 */
export function sidePanelConfig<D>(data: D, width: 'narrow' | 'wide' = 'narrow', place: 'center' | 'right' = 'center') {
  const panelClass = ['side-panel-host', ...(width === 'wide' ? ['side-panel-wide'] : []), ...(place === 'right' ? ['side-panel-right'] : [])];
  return { data, panelClass: panelClass.length === 1 ? panelClass[0] : panelClass, hasBackdrop: true, autoFocus: 'first-tabbable' as const };
}
