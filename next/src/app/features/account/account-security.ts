import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { Field } from '../../shared/ui/field';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { AccountSecurityApi, METHOD_LABEL, PasswordRules, SessionRow, deviceOf } from './account-security.api';
import { PasswordRulesHint } from './password-rules';
import { SignInHistory } from './sign-in-history';
import { TwoFactorCard } from './two-factor-card';
import { PageHeader } from '../../shared/ui/page-header';

/**
 * MIG-353: My account › Security -- the person's own sign-in security, in one place: their password (the workspace's
 * rules beside it), two-factor login, the sessions they are signed in with (and ending them), and their sign-in history.
 * Everything here is about the caller and nobody else; the server answers only their own.
 */
@Component({
  selector: 'app-account-security',
  imports: [PageHeader, Icon, Field, ServerTimePipe, RouterLink, PasswordRulesHint, SignInHistory, TwoFactorCard],
  templateUrl: './account-security.html',
})
export class AccountSecurity implements OnInit {
  private readonly api = inject(AccountSecurityApi);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly rules = signal<PasswordRules | null>(null);
  readonly sessions = signal<SessionRow[]>([]);
  readonly sessionsLoading = signal(false);
  readonly sessionsError = signal('');
  readonly ending = signal<string | null>(null);

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly savingPassword = signal(false);
  readonly passwordError = signal('');

  readonly minLength = computed(() => this.rules()?.passwordMinLength ?? 8);
  readonly canChangePassword = computed(() => !!this.currentPassword() && this.newPassword().length >= this.minLength());
  readonly idleMinutes = computed(() => this.auth.user()?.idleMinutes ?? null);
  readonly otherSessions = computed(() => this.sessions().filter(s => !s.current).length);

  ngOnInit(): void {
    this.api.myRules().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) this.rules.set(r.data); },
      error: () => {},
    });
    this.loadSessions();
  }

  device(userAgent: string | null): string {
    return deviceOf(userAgent);
  }

  methodText(method: string): string {
    return METHOD_LABEL[method] ?? method;
  }

  loadSessions(): void {
    this.sessionsLoading.set(true);
    this.sessionsError.set('');
    this.api.sessions().subscribe({
      next: r => {
        this.sessionsLoading.set(false);
        if (r.status === API_SUCCESS) this.sessions.set(r.data ?? []);
        else this.sessionsError.set(r.message || 'Your sessions could not be read.');
      },
      error: err => {
        this.sessionsLoading.set(false);
        this.sessionsError.set(err?.error?.message || 'Your sessions could not be read.');
      },
    });
  }

  /** Ends one session; ending this one is signing out. */
  endSession(row: SessionRow): void {
    if (row.current) {
      this.auth.logout();
      return;
    }
    this.ending.set(row.sessionId);
    this.api.endSession(row.sessionId).subscribe({
      next: r => {
        this.ending.set(null);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadSessions(); }
        else this.toast.error(r.message);
      },
      error: err => { this.ending.set(null); this.toast.error(err?.error?.message || 'The session could not be ended.'); },
    });
  }

  endOthers(): void {
    this.ending.set('others');
    this.api.endOtherSessions().subscribe({
      next: r => {
        this.ending.set(null);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadSessions(); }
        else this.toast.error(r.message);
      },
      error: err => { this.ending.set(null); this.toast.error(err?.error?.message || 'The sessions could not be ended.'); },
    });
  }

  /**
   * The same change as the profile's: the current password too, both fields cleared whatever the outcome. The server
   * holds the workspace's rules and says which one failed; the interceptor adopts the new pair the change hands back.
   */
  changePassword(): void {
    if (!this.canChangePassword() || this.savingPassword()) return;
    this.passwordError.set('');
    this.savingPassword.set(true);
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/changeOwnPassword`, {
      currentPassword: this.currentPassword(),
      newPassword: this.newPassword(),
    }).subscribe({
      next: response => {
        this.savingPassword.set(false);
        this.currentPassword.set('');
        this.newPassword.set('');
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          if (this.auth.isLoggedIn()) this.loadSessions();
        } else {
          this.passwordError.set(response.message);
        }
      },
      error: err => {
        this.savingPassword.set(false);
        this.currentPassword.set('');
        this.newPassword.set('');
        this.passwordError.set(err?.error?.message || 'Your password could not be changed.');
      },
    });
  }
}
