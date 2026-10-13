import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavAccess } from '../../core/nav/nav-access';
import { tabAt } from '../../core/nav/nav-tree';
import { Icon } from './icon';

/**
 * A hub's tab strip (owner 2026-10-12): related pages as one menu entry with tabs -- Connections, Documents, Pipelines,
 * Runs, Settings, Platform and the rest -- read from the menu's tree (core/nav/nav-tree.ts), the one place that names a
 * hub, its tabs, their page keys and their breadcrumbs.
 *
 * Each tab is a link to a page with its own address, guard and lazy chunk; the strip only shows the way between them.
 * It lists the tabs the reader may open (their role, their access profile, our team's activity), and shows nothing
 * when that is one tab -- the page is then simply that page -- or when the page open is not one of them (a member who
 * reached Data policies from the AI Assistant: the page opens, the administrators' hub does not appear around it).
 * A detail page beneath a tab (a collection, an editor) shows no strip either.
 *
 * The page header renders it under the title (page-header.ts), so a page joins a hub by its address alone.
 */
@Component({
  selector: 'app-tab-hub',
  imports: [RouterLink, Icon],
  host: { '[style.display]': "shown() ? 'block' : 'none'", class: 'tab-hub' },
  styles: [`
    :host { margin-top: 1rem; }
    /* One line: a hub with many tabs scrolls inside its strip at a narrow width, never the page. The rule under the
       tabs is drawn inside the strip, so the scrolling box does not clip the active tab's underline. */
    .tabs { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; border-bottom-width: 0;
            box-shadow: inset 0 -1px 0 var(--border-subtle); }
    .tab { white-space: nowrap; margin-bottom: 0; }
    /* Below the sidebar's width the icons go, so Platform's nine tabs fit a 1187px screen on one line. */
    @media (max-width: 89.99rem) { .tab app-icon { display: none; } }
    .tab:focus-visible { outline: 2px solid var(--accent-mark-strong); outline-offset: -2px; border-radius: var(--radius-sm); }
  `],
  template: `
    @if (shown()) {
      <nav class="tabs" [attr.aria-label]="place()!.hub.label" data-test="tab-hub" [attr.data-hub]="place()!.hub.path">
        @for (t of tabs(); track t.path) {
          <a class="tab" [class.tab-active]="t === place()!.tab" [routerLink]="t.path"
             [attr.aria-current]="t === place()!.tab ? 'page' : null" [attr.data-tab]="t.path">
            <app-icon [name]="t.icon" size="0.95em" />{{ t.label }}
          </a>
        }
      </nav>
    }
  `,
})
export class TabHub {
  private readonly access = inject(NavAccess);
  /** The address shown (the page header follows the router and hands it in). */
  readonly url = input.required<string>();

  readonly place = computed(() => tabAt(this.url()));
  readonly tabs = computed(() => {
    const place = this.place();
    return place ? this.access.tabsOf(place.hub) : [];
  });
  readonly shown = computed(() => this.tabs().length > 1 && this.tabs().includes(this.place()!.tab));

  constructor() {
    // A hub that has the Activity tab asks, once, whether our team has acted in this workspace -- as the menu does.
    effect(() => {
      if (this.place()?.hub.tabs.some(t => t.teamOnly)) untracked(() => this.access.checkTeamActivity());
    });
  }
}
