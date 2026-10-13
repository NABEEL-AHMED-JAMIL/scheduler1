import { Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DOCS } from './developer-docs';
import { PORTAL } from './guide-markdown';
import { groupByTag, operationsOf } from './openapi';

interface NavLink { label: string; route?: string; fragment?: string; exact?: boolean; sub?: boolean; mono?: boolean }

/**
 * MIG-336: Integration › Developer portal -- the customer API's docs inside the console: an overview, the guides, the
 * API reference (by tag, the event types, the problem types), the changelog and the downloads. The contents sit on the
 * left from lg up and fold into a <details> above the page below that, like the setup guide's.
 */
@Component({
  selector: 'app-developer-layout',
  imports: [NgTemplateOutlet, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="portal flex flex-col gap-4 min-w-0" data-developer-portal>
      <nav class="hidden lg:block w-56 shrink-0" aria-label="Developer portal">
        <div class="contents-rail sticky top-20 overflow-y-auto pr-1">
          <p class="text-xs uppercase tracking-wider text-[color:var(--text-muted)] mb-3">Developer portal</p>
          <ng-container *ngTemplateOutlet="links" />
        </div>
      </nav>

      <details #small class="lg:hidden card p-4">
        <summary class="text-sm font-medium cursor-pointer">Developer portal contents</summary>
        <div class="mt-3" (click)="small.open = false"><ng-container *ngTemplateOutlet="links" /></div>
      </details>

      <div class="min-w-0 flex-1">
        <router-outlet />
      </div>
    </div>

    <ng-template #links>
      <ul class="flex flex-col gap-0.5 text-sm" data-portal-nav>
        @for (link of nav; track link.label + (link.fragment ?? '')) {
          <li>
            @if (!link.route) {
              <span class="dev-nav dev-head">{{ link.label }}</span>
            } @else if (link.fragment) {
              <a [routerLink]="link.route" [fragment]="link.fragment" class="dev-nav" [class.dev-sub]="link.sub" [class.mono]="link.mono"
                 [class.text-xs]="link.mono">{{ link.label }}</a>
            } @else {
              <a [routerLink]="link.route" routerLinkActive="dev-nav-on" [routerLinkActiveOptions]="{ exact: !!link.exact }"
                 class="dev-nav" [class.dev-sub]="link.sub">{{ link.label }}</a>
            }
          </li>
        }
      </ul>
    </ng-template>
  `,
  styles: [`
    @media (min-width: 1024px) { .portal { flex-direction: row; gap: 2rem; } }
    .contents-rail { max-height: calc(100vh - 6rem); }
    .dev-nav { display: block; padding: .25rem .5rem; border-radius: var(--radius-md); color: var(--text-secondary); }
    .dev-nav:hover { color: var(--text-primary); background: var(--surface-inset); }
    .dev-nav-on { color: var(--accent-text); font-weight: 600; background: var(--surface-inset); }
    .dev-nav.dev-sub { padding-left: 1.25rem; }
    .dev-head, .dev-head:hover { color: var(--text-primary); background: none; }
  `],
})
export class DeveloperLayout {
  readonly nav: NavLink[] = DeveloperLayout.links();

  static links(): NavLink[] {
    const reference = `${PORTAL}/reference`;
    const tags = groupByTag(DOCS.spec, operationsOf(DOCS.spec));
    return [
      { label: 'Overview', route: PORTAL, exact: true },
      ...(DOCS.guides.length ? [{ label: 'Guides' }] : []),
      ...DOCS.guides.map(g => ({ label: g.title, route: `${PORTAL}/guides/${g.slug}`, sub: true })),
      { label: 'API reference', route: reference, exact: true },
      ...tags.map(t => ({ label: t.name, route: reference, fragment: `tag-${t.name}`, sub: true, mono: true })),
      { label: 'Schemas', route: reference, fragment: 'schemas', sub: true },
      { label: 'Event types', route: reference, fragment: 'events' },
      { label: 'Problem types', route: reference, fragment: 'problems' },
      { label: 'Rate limits', route: reference, fragment: 'rate-limits' },
      { label: 'Changelog', route: `${PORTAL}/changelog` },
      { label: 'Downloads', route: PORTAL, fragment: 'downloads' },
    ];
  }
}
