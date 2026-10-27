import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PageKey } from '../../core/auth/page-keys';
import { NAV, NavChild, NavViewer, entryVisible } from '../../core/nav/nav-tree';
import { Icon } from '../../shared/ui/icon';

/** The menu entries Home offers a way to, in the main flow's order: build, run, review, results, then your own systems. */
export const QUICK_PATHS = ['/pipelines', '/runs', '/review', '/documents', '/forms', '/reports', '/data/analytics/dashboards', '/developers'];

/** The menu's own entries for those paths: Home names each as the menu does, with its hint. */
export function quickEntries(): NavChild[] {
  const children = NAV.flatMap(item => item.children ?? []);
  return QUICK_PATHS.map(path => children.find(c => c.path === path)).filter((c): c is NavChild => !!c);
}

/**
 * Owner 2026-10-20 ("update the main pages"): Home's way to the console's main parts -- Pipelines, Runs, Review,
 * Documents, Forms, Reports, Dashboards and Developers -- read from the menu's own tree, so each is named, iconned and
 * gated exactly as the menu has it: an entry the reader's role or page access hides is not offered here either. Each
 * opens the hub's first tab the reader may open.
 */
@Component({
  selector: 'app-quick-links',
  imports: [RouterLink, Icon],
  template: `
    @if (links().length) {
      <section class="card p-4" aria-labelledby="quick-links-title" data-test="home-quick-links">
        <h2 id="quick-links-title" class="text-sm font-semibold mb-3">Go to</h2>
        <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          @for (l of links(); track l.path) {
            <li class="min-w-0">
              <a class="quick-link flex items-start gap-2.5 p-2.5 h-full" [routerLink]="l.path" [attr.data-quick]="l.path" [title]="l.hint ?? l.label">
                <span class="stat-glyph shrink-0"><app-icon [name]="l.icon" /></span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium">{{ l.label }}</span>
                  @if (l.hint) { <span class="block text-xs text-[color:var(--text-muted)] line-clamp-2">{{ l.hint }}</span> }
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [`
    .quick-link { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); color: var(--text-primary); }
    .quick-link:hover { border-color: var(--border-strong); background: var(--surface-inset); }
  `],
})
export class QuickLinks {
  private readonly auth = inject(AuthService);

  /** The reader as the menu sees them; written defensively, as Home's other cards are, for a partial session. */
  private readonly viewer = computed<NavViewer>(() => {
    if (typeof this.auth.pageKeys === 'function') this.auth.pageKeys();
    return {
      canOpen: (key: PageKey) => typeof this.auth.canOpen === 'function' && this.auth.canOpen(key),
      isAdmin: typeof this.auth.isTenantAdmin === 'function' && this.auth.isTenantAdmin(),
      isPlatform: typeof this.auth.isPlatformAdmin === 'function' && this.auth.isPlatformAdmin(),
      showTeam: false,
    };
  });

  readonly links = computed(() => {
    const viewer = this.viewer();
    return quickEntries().filter(entry => entryVisible(entry, viewer));
  });
}
