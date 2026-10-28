import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, IDLE_REASON, PASSWORD_CHANGED_NOTICE, PASSWORD_CHANGED_REASON } from '../../core/auth/auth.service';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ThemeService } from '../../core/theme.service';
import { ConsolePreview } from '../landing/console-preview';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Field } from '../../shared/ui/field';
import { ToastService } from '../../shared/ui/toast.service';
import { MfaEnrolment } from '../account/account-security.api';
import { MfaEnrolmentPanel } from '../account/mfa-enrolment';
import { RecoveryCodes } from '../account/recovery-codes';
import { SignInApi, SignInStep, SignedIn, rememberFlow } from './sign-in.api';
import { AppLoading } from '../../shared/ui/loading';

/** What the page says after the workspace's idle sign-out ended a session (MIG-353). Here, not in AuthService: the
 * initial bundle carries AuthService. */
export const IDLE_NOTICE = 'You were signed out because the console was not used for a while. Sign in again to carry on.';

/** Where the SSO callback page returns a person after their company signed them in (sessionStorage). */
export const SSO_RETURN_KEY = 'etl_sso_return';

/** Which part of signing in the page is showing. */
type Stage = 'password' | 'company' | 'code' | 'enrol' | 'codes';

/**
 * Only a path from this application is followed, so a crafted returnUrl cannot send someone to another site after
 * signing in.
 */
export function safeReturn(requested: string | null | undefined): string {
  const path = requested ?? '';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

@Component({
  selector: 'app-login',
  imports: [ConsolePreview, Icon, BrandMark, ReactiveFormsModule, Field, RouterLink, MfaEnrolmentPanel, RecoveryCodes, AppLoading],
  templateUrl: './login.html',
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService, { optional: true });
  readonly theme = inject(ThemeService);

  readonly submitting = signal(false);
  readonly error = signal('');
  readonly stage = signal<Stage>('password');

  /** MIG-353: the second step -- the challenge the right password answered, and what the person types for it. */
  private mfaToken = '';
  readonly code = signal('');
  readonly useRecovery = signal(false);
  readonly enrolment = signal<MfaEnrolment | null>(null);
  readonly recoveryCodes = signal<string[]>([]);
  readonly signedInName = signal('');
  private pending: ApiResponse<SignedIn> | null = null;

  /** MIG-353 part 5: a workspace's own sign-in link (/login?sso=<key>), and the company sign-in by address. */
  readonly ssoKey = this.route.snapshot.queryParamMap.get('sso') ?? '';
  readonly ssoName = signal('');
  /**
   * Owner 2026-10-27: the sign-in link's company sign-in is looked up -- "Checking…" while it is, and a line when the
   * link has none or the check failed, instead of the page silently looking like a plain sign-in.
   */
  readonly ssoChecking = signal(!!this.ssoKey);
  readonly ssoNote = signal('');
  readonly companyEmail = signal('');

  /**
   * Why the person is here, when a session ended under them: a password change signed it out and the
   * server handed back no new pair, or the workspace's idle sign-out ended it (MIG-353). Only reasons this
   * console sends are shown; anything else in the address is ignored rather than printed.
   */
  readonly notice = this.route.snapshot.queryParamMap.get('reason') === PASSWORD_CHANGED_REASON
    ? PASSWORD_CHANGED_NOTICE
    : this.route.snapshot.queryParamMap.get('reason') === IDLE_REASON ? IDLE_NOTICE : '';

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  /** Created on first use: most visits never take a second step, and the page's tests give it no HTTP. */
  private api(): SignInApi {
    return this.injector.get(SignInApi);
  }

  ngOnInit(): void {
    if (this.ssoKey) {
      this.api().ssoDiscover({ loginKey: this.ssoKey }).subscribe({
        next: r => {
          this.ssoChecking.set(false);
          if (r.status === API_SUCCESS && r.data?.sso) this.ssoName.set(r.data.displayName || 'your company');
          else this.ssoNote.set('Company sign-in is not available for this link. Sign in with your username and password.');
        },
        error: () => {
          this.ssoChecking.set(false);
          this.ssoNote.set('Company sign-in could not be checked just now. Sign in with your username and password, or reload the page to try again.');
        },
      });
    }
  }

  submit(): void {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: response => {
        this.submitting.set(false);
        if (response.status !== API_SUCCESS) {
          this.error.set(response.message || 'Sign in failed.');
          return;
        }
        const step = response.data as unknown as SignInStep | undefined;
        if (step?.mfaToken) {
          this.mfaToken = step.mfaToken;
          this.signedInName.set(step.username ?? username);
          this.form.controls.password.setValue('');
          if (step.mfaEnrolmentRequired) this.beginEnrolment();
          else this.stage.set('code');
          return;
        }
        this.proceed();
      },
      error: err => {
        this.submitting.set(false);
        this.error.set(err?.error?.message || 'Could not reach the server.');
      },
    });
  }

  /** The code (or a recovery code) for the challenge the password answered. */
  submitCode(): void {
    const typed = this.code().trim();
    if (!typed || this.submitting()) return;
    this.error.set('');
    this.submitting.set(true);
    const recovery = this.useRecovery();
    this.api().verifyMfa(this.mfaToken, recovery ? null : typed.replace(/\s/g, ''), recovery ? typed : null).subscribe({
      next: r => {
        this.submitting.set(false);
        if (r.status !== API_SUCCESS) {
          this.error.set(r.message || 'That code did not work.');
          // A spent or expired step: back to the password, with the reason shown.
          if (/sign in again|Too many sign-in attempts/i.test(r.message ?? '')) this.restart(r.message);
          return;
        }
        const left = r.data?.recoveryCodesLeft;
        if (left !== undefined && left !== null && left < 3) {
          this.toast?.info(`${left} recovery code${left === 1 ? '' : 's'} left. Make new ones under Security.`);
        }
        this.proceed();
      },
      error: err => { this.submitting.set(false); this.error.set(err?.error?.message || 'Could not reach the server.'); },
    });
  }

  toggleRecovery(): void {
    this.useRecovery.update(v => !v);
    this.code.set('');
    this.error.set('');
  }

  private beginEnrolment(): void {
    this.stage.set('enrol');
    this.submitting.set(true);
    this.api().startEnrolment(this.mfaToken).subscribe({
      next: r => {
        this.submitting.set(false);
        if (r.status === API_SUCCESS && r.data) this.enrolment.set(r.data);
        else this.restart(r.message);
      },
      error: err => { this.submitting.set(false); this.restart(err?.error?.message || 'Could not reach the server.'); },
    });
  }

  confirmEnrolment(code: string): void {
    this.error.set('');
    this.submitting.set(true);
    this.api().confirmEnrolment(this.mfaToken, code).subscribe({
      next: r => {
        this.submitting.set(false);
        if (r.status !== API_SUCCESS || !r.data) {
          this.error.set(r.message || 'That code did not work.');
          if (/sign in again/i.test(r.message ?? '')) this.restart(r.message);
          return;
        }
        // The session waits until the person has seen their recovery codes, which are shown only now.
        this.pending = r;
        this.recoveryCodes.set(r.data.recoveryCodes ?? []);
        this.stage.set('codes');
      },
      error: err => { this.submitting.set(false); this.error.set(err?.error?.message || 'Could not reach the server.'); },
    });
  }

  continueAfterCodes(): void {
    if (this.pending) this.auth.signedIn(this.pending);
    this.pending = null;
    this.proceed();
  }

  /** Back to the password, saying why. */
  restart(message?: string): void {
    this.stage.set('password');
    this.mfaToken = '';
    this.code.set('');
    this.useRecovery.set(false);
    this.enrolment.set(null);
    this.error.set(message ?? '');
  }

  // ---- single sign-on (MIG-353 part 5) ----------------------------------------------------------------------

  showCompany(): void {
    this.error.set('');
    this.companyEmail.set(this.form.controls.username.value);
    this.stage.set('company');
  }

  /** "Continue with <company>": the workspace's own link, or the address's domain. */
  startSso(byKey: boolean): void {
    const email = this.companyEmail().trim();
    if (!byKey && !email.includes('@')) {
      this.error.set('Type your work email address.');
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    try {
      sessionStorage.setItem(SSO_RETURN_KEY, safeReturn(this.route.snapshot.queryParamMap.get('returnUrl')));
    } catch {
      // Storage refused: the callback lands on the dashboard.
    }
    this.api().ssoStart(byKey ? { loginKey: this.ssoKey } : { email }).subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data?.authorizationUrl) {
          rememberFlow(r.data.flow);
          window.location.assign(r.data.authorizationUrl);
          return;
        }
        this.submitting.set(false);
        this.error.set(r.message || 'Single sign-on is not set up for that address.');
      },
      error: err => { this.submitting.set(false); this.error.set(err?.error?.message || 'Could not reach the server.'); },
    });
  }

  private proceed(): void {
    void this.router.navigateByUrl(safeReturn(this.route.snapshot.queryParamMap.get('returnUrl')));
  }
}
