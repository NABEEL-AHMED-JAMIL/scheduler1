import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';

/**
 * MIG-246 / MIG-267: the entry point of a Wave 4 or Wave 5 page that is on the menu before it is built.
 *
 * One component for all of them: the route names the page (its title) and says in one line what it will
 * do (`data.comingSoon`). It calls nothing -- there is no backend behind any of these yet -- and the
 * route keeps the page's own access-profile key, so the gate is already in place when the real screen
 * replaces this one.
 */
@Component({
  selector: 'app-coming-soon',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ title }}</h1>
          @if (summary) { <p class="page-subtitle">{{ summary }}</p> }
        </div>
      </div>
      <div class="card p-10 text-center max-w-lg mx-auto mt-4">
        <app-icon name="clock" size="2.25rem" class="icon-muted block mx-auto mb-4" />
        <h2 class="text-lg font-semibold">Coming soon</h2>
        <p class="text-sm text-[color:var(--text-secondary)] mt-2 leading-relaxed">
          {{ title }} is not ready yet. This page will open here once it is built; nothing on it reads
          or changes your data today.
        </p>
        <div class="flex items-center justify-center gap-2 mt-6">
          <a routerLink="/dashboard" class="btn btn-default btn-sm">
            <app-icon name="chart" />Dashboard
          </a>
        </div>
      </div>
    </div>
  `,
})
export class ComingSoon {
  private readonly route = inject(ActivatedRoute);
  readonly title = (this.route.snapshot.title ?? '') as string;
  readonly summary = (this.route.snapshot.data['comingSoon'] ?? '') as string;
}
