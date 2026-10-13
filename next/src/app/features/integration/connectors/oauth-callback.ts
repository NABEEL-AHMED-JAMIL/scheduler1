import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ConnectorsApi } from './connectors.api';
import { PageHeader } from '../../../shared/ui/page-header';

/**
 * Where an OAuth provider sends the person's browser back (MIG-292; INTEGRATION_CONNECTORS_OAUTH_REDIRECT_URL): the code
 * and state it carries go to /connectorHub.json/oauth/complete as the signed-in person, and the connection opens -- or the
 * provider's refusal is shown with what to do. The code is never kept here.
 */
@Component({
  selector: 'app-oauth-callback',
  imports: [PageHeader, Icon, RouterLink],
  template: `
    <div class="page">
      <app-page-header>
        <div class="page-head"><div><h1 class="page-title">Connecting…</h1></div></div>
      </app-page-header>
      <div class="card p-4 flex flex-col gap-3 max-w-2xl" data-oauth-callback>
        @if (problem()) {
          <p class="text-sm" role="alert"><app-icon name="alert" /> {{ problem() }}</p>
          <a class="btn btn-default btn-sm w-fit" routerLink="/connections/connectors">Back to Connections</a>
        } @else {
          <p class="text-sm" role="status"><app-icon name="refresh" class="spin" /> Finishing the grant…</p>
        }
      </div>
    </div>
  `,
})
export class OAuthCallback implements OnInit {
  private readonly api = inject(ConnectorsApi);
  private readonly router = inject(Router);

  readonly code = input<string | undefined>(undefined);
  readonly state = input<string | undefined>(undefined);
  readonly error = input<string | undefined>(undefined);
  readonly problem = signal('');

  ngOnInit(): void {
    if (!this.state() && !this.error()) {
      this.problem.set('This page is where a provider sends you back after granting access; it was opened without one.');
      return;
    }
    this.api.oauthComplete({ state: this.state() ?? null, code: this.code() ?? null, error: this.error() ?? null }).subscribe({
      next: res => {
        if (res.status !== API_SUCCESS || !res.data) {
          this.problem.set(res.message || 'The grant could not be finished.');
          return;
        }
        this.router.navigate(['/connections/connectors'], { queryParams: { connection: res.data.id }, replaceUrl: true });
      },
      error: err => this.problem.set(err?.error?.message || 'Connector Hub could not be reached; start Connect again.'),
    });
  }
}
