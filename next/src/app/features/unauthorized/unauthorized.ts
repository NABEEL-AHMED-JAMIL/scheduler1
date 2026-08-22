import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="card p-10 text-center max-w-lg mx-auto mt-8">
        <app-icon name="shield" size="2.25rem" class="icon-warn block mx-auto mb-4" />
        <h1 class="text-xl font-semibold">You do not have access to that page</h1>
        <p class="text-sm text-[color:var(--text-secondary)] mt-2 leading-relaxed">
          Your role is <strong>{{ roleLabel() }}</strong>, which cannot reach it. Roles are
          enforced on the server, so this is not something the page can work around — an
          administrator has to grant it.
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
export class Unauthorized {
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);

  roleLabel(): string {
    const role = this.auth.role() ?? '';
    return role ? role.toLowerCase().replace(/_/g, ' ') : 'unknown';
  }

  back(): void {
    this.location.back();
  }
}
