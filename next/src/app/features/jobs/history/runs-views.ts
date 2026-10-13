import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';

/**
 * UX review B3 (E1): Runs and Runs by date are one Runs page with two views -- Latest (every schedule's newest runs and
 * what waits for review) and By date (every run in a date range). Each view keeps its address and its page key (jobs
 * or queue), so old links and access profiles still work; a view the reader cannot open is not offered.
 */
@Component({
  selector: 'app-runs-views',
  imports: [RouterLink, Icon],
  template: `
    @if (views().length > 1) {
      <nav class="tabs" aria-label="Runs" data-test="runs-views">
        @for (v of views(); track v.id) {
          <a class="tab" [class.tab-active]="active() === v.id" [routerLink]="v.link" [attr.aria-current]="active() === v.id ? 'page' : null"
             [attr.data-view]="v.id"><app-icon [name]="v.icon" size="0.95em" />{{ v.label }}</a>
        }
      </nav>
    }
  `,
})
export class RunsViews {
  private readonly auth = inject(AuthService);
  readonly active = input.required<'latest' | 'date'>();
  readonly views = computed(() => {
    const can = (key: 'jobs' | 'queue') => typeof this.auth.canOpen === 'function' && this.auth.canOpen(key);
    return [
      ...(can('jobs') || can('queue') ? [{ id: 'latest' as const, label: 'Latest', icon: 'history', link: '/pipelines/executions' }] : []),
      ...(can('queue') ? [{ id: 'date' as const, label: 'By date', icon: 'calendar', link: '/pipelines/queue' }] : []),
    ];
  });
}
