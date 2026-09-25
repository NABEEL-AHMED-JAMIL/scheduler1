import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';

/**
 * An address that matches no page (a typo, a stale bookmark, a link to something removed). It used to land on the
 * Dashboard without a word, so a reader never learned the link was wrong.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="card p-10 text-center max-w-lg mx-auto mt-8">
        <app-icon name="search" size="2.25rem" class="icon-muted block mx-auto mb-4" />
        <h1 class="text-xl font-semibold">Page not found</h1>
        <p class="text-sm text-[color:var(--text-secondary)] mt-2 leading-relaxed">
          Nothing lives at this address. The link may be mistyped, or the page may have moved.
        </p>
        <div class="flex items-center justify-center gap-2 mt-6">
          <button type="button" class="btn btn-default btn-sm" (click)="back()">
            <app-icon name="arrowLeft" />Go back
          </button>
          <a routerLink="/" class="btn btn-primary btn-sm">
            <app-icon name="chart" />Dashboard
          </a>
        </div>
      </div>
    </div>
  `,
})
export class NotFound {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Back where the reader came from, or the Dashboard in a fresh tab rather than out of the console. */
  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigateByUrl('/');
  }
}
