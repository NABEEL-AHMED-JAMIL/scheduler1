import { Component, OnInit, inject, signal } from '@angular/core';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { AccountSecurityApi, MfaEnrolment, MfaStatus } from './account-security.api';
import { MfaEnrolmentPanel } from './mfa-enrolment';
import { RecoveryCodes } from './recovery-codes';

/**
 * MIG-353 part 4: My account › Security › Two-factor login: whether it is on, setting it up with an authenticator app,
 * new recovery codes, and turning it off (the password and a code; not while the workspace requires it).
 */
@Component({
  selector: 'app-two-factor-card',
  imports: [Icon, ServerTimePipe, MfaEnrolmentPanel, RecoveryCodes],
  template: `
    <section class="card p-4" aria-labelledby="mfa-heading" data-test="mfa-card">
      <div class="flex items-start gap-2">
        <app-icon name="shield" class="icon-muted mt-0.5 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="mfa-heading" class="text-sm font-semibold">Two-factor login</h2>
            @if (status(); as s) {
              <span [class]="s.enabled ? 'pill pill-ok' : 'pill pill-neutral'" data-test="mfa-state">{{ s.enabled ? 'On' : 'Off' }}</span>
              @if (s.required) { <span class="pill pill-brand">Required by your workspace</span> }
            }
          </div>
          <p class="field-note text-[color:var(--text-muted)] mt-0.5">
            After your password, a code from an app on your phone. A stolen password alone is then not enough to sign in.
          </p>
        </div>
      </div>

      @if (error()) {
        <p class="field-note text-crit-500 mt-3" role="alert">{{ error() }}</p>
      } @else if (status(); as s) {
        @if (codes().length) {
          <div class="mt-4"><app-recovery-codes [codes]="codes()" [account]="auth.user()?.username ?? ''" /></div>
        }
        @if (!s.enabled) {
          @if (enrolment(); as e) {
            <div class="mt-4">
              <app-mfa-enrolment [enrolment]="e" [busy]="busy()" [error]="actionError()" (confirmed)="confirm($event)" />
            </div>
          } @else {
            <div class="mt-4">
              <button type="button" class="btn btn-primary btn-sm" (click)="start()" [disabled]="busy()" data-test="mfa-start">
                <app-icon name="shield" [busy]="busy()" />Set up two-factor login
              </button>
            </div>
          }
        } @else {
          <dl class="grid grid-cols-2 gap-3 mt-4 text-sm max-w-md">
            <div>
              <dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">On since</dt>
              <dd>{{ s.enrolledAt | serverTime: 'dateTime' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">Recovery codes left</dt>
              <dd [class.text-warn-500]="s.recoveryCodesLeft < 3">{{ s.recoveryCodesLeft }} of 10</dd>
            </div>
          </dl>
          @if (mode() === 'idle') {
            <div class="flex flex-wrap gap-2 mt-4">
              <button type="button" class="btn btn-default btn-sm" (click)="mode.set('codes')"><app-icon name="key" />New recovery codes</button>
              @if (!s.required) {
                <button type="button" class="btn btn-default btn-sm btn-intent-crit" (click)="mode.set('off')">
                  <app-icon name="power" />Turn off
                </button>
              }
            </div>
          } @else {
            <form class="mt-4 grid sm:grid-cols-2 gap-3 max-w-lg" (submit)="$event.preventDefault(); act()">
              <div class="field">
                <label class="label" for="mfa-password">Your password</label>
                <input id="mfa-password" type="password" class="input" autocomplete="current-password"
                       [value]="password()" (input)="password.set($any($event.target).value)" />
              </div>
              @if (mode() === 'off') {
                <div class="field">
                  <label class="label" for="mfa-off-code">Code from the app, or a recovery code</label>
                  <input id="mfa-off-code" class="input mono" autocomplete="one-time-code"
                         [value]="code()" (input)="code.set($any($event.target).value)" />
                </div>
              }
              <div class="sm:col-span-2 flex gap-2">
                <button type="submit" class="btn btn-sm" [class.btn-primary]="mode() === 'codes'" [class.btn-danger]="mode() === 'off'"
                        [disabled]="busy() || !password() || (mode() === 'off' && !code())">
                  <app-icon [name]="mode() === 'off' ? 'power' : 'key'" [busy]="busy()" />
                  {{ mode() === 'off' ? 'Turn off two-factor login' : 'Make new codes' }}
                </button>
                <button type="button" class="btn btn-default btn-sm" (click)="cancel()">Cancel</button>
              </div>
            </form>
          }
          @if (actionError()) {
            <p class="field-note text-crit-500 mt-3" role="alert">{{ actionError() }}</p>
          }
        }
      } @else {
        <p class="text-sm text-[color:var(--text-muted)] mt-4">Loading…</p>
      }
    </section>
  `,
})
export class TwoFactorCard implements OnInit {
  private readonly api = inject(AccountSecurityApi);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly status = signal<MfaStatus | null>(null);
  readonly enrolment = signal<MfaEnrolment | null>(null);
  readonly codes = signal<string[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly mode = signal<'idle' | 'codes' | 'off'>('idle');
  readonly password = signal('');
  readonly code = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.mfa().subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data) this.status.set(r.data);
        else this.error.set(r.message || 'Two-factor login could not be read.');
      },
      error: err => this.error.set(err?.error?.message || 'Two-factor login could not be read.'),
    });
  }

  start(): void {
    this.busy.set(true);
    this.actionError.set('');
    this.codes.set([]);
    this.api.startMfa().subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS && r.data) this.enrolment.set(r.data);
        else this.actionError.set(r.message);
      },
      error: err => { this.busy.set(false); this.actionError.set(err?.error?.message || 'Two-factor login could not be set up.'); },
    });
  }

  confirm(code: string): void {
    this.busy.set(true);
    this.actionError.set('');
    this.api.confirmMfa(code).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS && r.data) {
          this.enrolment.set(null);
          this.codes.set(r.data.recoveryCodes);
          this.toast.success('Two-factor login is on.');
          this.load();
        } else {
          this.actionError.set(r.message);
        }
      },
      error: err => { this.busy.set(false); this.actionError.set(err?.error?.message || 'The code could not be checked.'); },
    });
  }

  act(): void {
    this.busy.set(true);
    this.actionError.set('');
    const done = (ok: boolean, message: string, codes?: string[]) => {
      this.busy.set(false);
      if (!ok) { this.actionError.set(message); return; }
      this.toast.success(message);
      this.codes.set(codes ?? []);
      this.cancel();
      this.load();
    };
    const fail = (err: { error?: { message?: string } }) => done(false, err?.error?.message || 'That did not work. Try again.');
    if (this.mode() === 'off') {
      this.api.disableMfa(this.password(), this.code().trim()).subscribe({
        next: r => done(r.status === API_SUCCESS, r.message),
        error: fail,
      });
    } else {
      this.api.newRecoveryCodes(this.password()).subscribe({
        next: r => done(r.status === API_SUCCESS, r.message, r.data?.recoveryCodes),
        error: fail,
      });
    }
  }

  cancel(): void {
    this.mode.set('idle');
    this.password.set('');
    this.code.set('');
  }
}
