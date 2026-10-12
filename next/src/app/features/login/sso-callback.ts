import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { SSO_RETURN_KEY, safeReturn } from './login';
import { SSO_FLOW_KEY, SamlTestResult, SignInApi, rememberFlow } from './sign-in.api';

/**
 * MIG-353 part 5: where a company's identity provider sends a person back (the redirect URI its administrator
 * registered: <console>/sso/callback). The code and state go to Identity, which checks the state (one use, ten minutes),
 * exchanges the code with its PKCE verifier, verifies the ID token and signs the person in; the page then goes where they
 * were headed. A provider's own error (the person cancelled, the app is not assigned to them) is said in plain words.
 *
 * MIG-353 part 6, SAML: Identity's assertion consumer service sends the browser here with ?saml=<handoff>; the handoff and
 * this tab's flow secret (kept at the start) go to Identity, which answers the sign-in -- or, for an administrator's test
 * sign-in, what would happen, shown here without signing anybody in.
 */
@Component({
  selector: 'app-sso-callback',
  imports: [Icon, BrandMark, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-8"><app-brand-mark subtitle="Data pipeline platform" /></div>
        @if (test(); as t) {
          <h1 class="text-2xl font-semibold tracking-tight mb-2">Test sign-in worked</h1>
          <p class="text-sm mb-4">Your identity provider signed this person in, and its answer passed every check.</p>
          <dl class="text-sm space-y-2 mb-4" data-test="saml-test-result">
            <div><dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">Email</dt><dd class="mono break-all">{{ t.email }}</dd></div>
            @if (t.name) { <div><dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">Name</dt><dd>{{ t.name }}</dd></div> }
            @if (t.nameId) { <div><dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">Name ID</dt><dd class="mono break-all">{{ t.nameId }}</dd></div> }
            @if (t.attributes) { <div><dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">Attributes sent</dt><dd class="mono text-xs break-all">{{ t.attributes }}</dd></div> }
          </dl>
          <p [class]="t.outcome === 'REFUSED' ? 'field-note text-crit-500 flex items-start gap-1.5 text-sm' : 'field-note flex items-start gap-1.5 text-sm'"
             role="status" data-test="saml-test-outcome">
            <app-icon [name]="t.outcome === 'REFUSED' ? 'alert' : 'checkCircle'" size="0.9em" class="mt-px shrink-0" /><span>{{ t.explanation }}</span>
          </p>
          <a routerLink="/administration/security" class="btn btn-primary w-full mt-6">Back to Security</a>
        } @else if (error()) {
          <h1 class="text-2xl font-semibold tracking-tight mb-2">Single sign-on did not finish</h1>
          <p class="field-note text-crit-500 flex items-start gap-1.5 text-sm" role="alert" data-test="sso-error">
            <app-icon name="alert" size="0.9em" class="mt-px shrink-0" /><span>{{ error() }}</span>
          </p>
          @if (attributes()) {
            <p class="field-note text-[color:var(--text-muted)] text-xs mt-2">Attributes the provider sent: <span class="mono break-all">{{ attributes() }}</span></p>
          }
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
  readonly test = signal<SamlTestResult | null>(null);
  readonly attributes = signal('');

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const providerError = query.get('error');
    if (providerError) {
      this.error.set(providerError === 'access_denied'
        ? 'Your company\'s sign-in was cancelled, or this app is not assigned to you there.'
        : providerError === 'server_error' ? 'Sign-in is unavailable right now. Try again in a few minutes.'
          : 'Your company\'s sign-in refused the request. Ask your workspace administrator to check the single sign-on settings.');
      return;
    }
    const handoff = query.get('saml');
    if (handoff) {
      this.finishSaml(handoff);
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
        this.goBack();
      },
      error: err => this.error.set(err?.error?.message || 'Could not reach the server.'),
    });
  }

  /** SAML: the handoff from Identity's consumer service, redeemed with this tab's flow secret (one use). */
  private finishSaml(handoff: string): void {
    let flow = '';
    try {
      flow = sessionStorage.getItem(SSO_FLOW_KEY) ?? '';
    } catch {
      // Storage refused: Identity refuses the handoff, and says so.
    }
    rememberFlow(null);
    this.injector.get(SignInApi).samlFinish(handoff, flow).subscribe({
      next: r => {
        const data = r.data as (SamlTestResult & { accessToken?: string; attributes?: string }) | undefined;
        if (r.status === API_SUCCESS && data?.test) {
          this.test.set(data);
          return;
        }
        if (r.status !== API_SUCCESS || !data?.accessToken) {
          this.attributes.set(data?.attributes ?? '');
          this.error.set(r.message || 'Single sign-on did not finish.');
          return;
        }
        this.goBack();
      },
      error: err => this.error.set(err?.error?.message || 'Could not reach the server.'),
    });
  }

  private goBack(): void {
    let back = '/';
    try {
      back = safeReturn(sessionStorage.getItem(SSO_RETURN_KEY));
      sessionStorage.removeItem(SSO_RETURN_KEY);
    } catch {
      // Storage refused: the dashboard.
    }
    void this.router.navigateByUrl(back, { replaceUrl: true });
  }
}
