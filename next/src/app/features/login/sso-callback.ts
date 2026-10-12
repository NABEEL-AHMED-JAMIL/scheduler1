import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { SSO_RETURN_KEY, safeReturn } from './login';
import { SignInApi } from './sign-in.api';

/**
 * MIG-353 part 5: where a company's identity provider sends a person back (the redirect URI its administrator
 * registered: <console>/sso/callback). The code and state go to Identity, which checks the state (one use, ten minutes),
 * exchanges the code with its PKCE verifier, verifies the ID token and signs the person in; the page then goes where they
 * were headed. A provider's own error (the person cancelled, the app is not assigned to them) is said in plain words.
 */
@Component({
  selector: 'app-sso-callback',
  imports: [Icon, BrandMark, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-8"><app-brand-mark subtitle="Data pipeline platform" /></div>
        @if (error()) {
          <h1 class="text-2xl font-semibold tracking-tight mb-2">Single sign-on did not finish</h1>
          <p class="field-note text-crit-500 flex items-start gap-1.5 text-sm" role="alert" data-test="sso-error">
            <app-icon name="alert" size="0.9em" class="mt-px shrink-0" /><span>{{ error() }}</span>
          </p>
          <a routerLink="/login" class="btn btn-primary w-full mt-6">Back to sign in</a>
        } @else {
          <h1 class="text-2xl font-semibold tracking-tight mb-2">Signing you in…</h1>
          <div class="spinner mt-4" role="status" aria-label="Signing in"></div>
        }
      </div>
    </div>
  `,
})
export class SsoCallback implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  readonly error = signal('');

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const providerError = query.get('error');
    if (providerError) {
      this.error.set(providerError === 'access_denied'
        ? 'Your company\'s sign-in was cancelled, or this app is not assigned to you there.'
        : 'Your company\'s sign-in refused the request. Ask your workspace administrator to check the single sign-on settings.');
      return;
    }
    const code = query.get('code') ?? '';
    const state = query.get('state') ?? '';
    if (!code || !state) {
      this.error.set('This sign-in link is incomplete. Start again from the sign-in page.');
      return;
    }
    this.injector.get(SignInApi).ssoCallback(code, state).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data?.accessToken) {
          this.error.set(r.message || 'Single sign-on did not finish.');
          return;
        }
        let back = '/';
        try {
          back = safeReturn(sessionStorage.getItem(SSO_RETURN_KEY));
          sessionStorage.removeItem(SSO_RETURN_KEY);
        } catch {
          // Storage refused: the dashboard.
        }
        void this.router.navigateByUrl(back, { replaceUrl: true });
      },
      error: err => this.error.set(err?.error?.message || 'Could not reach the server.'),
    });
  }
}
