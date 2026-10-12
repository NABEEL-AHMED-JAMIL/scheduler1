import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';

/**
 * MIG-353: sign-in security -- the rules a password is held to, the workspace's settings, sessions, the sign-in history,
 * two-factor and single sign-on. Only the security screens and the password fields import this, so it rides in their
 * lazy chunks, never the initial bundle.
 */

/** A workspace's settings as a row holds them: a null is "the platform's default". */
export interface SecuritySettings {
  passwordMinLength: number | null;
  passwordRequireUpper: boolean | null;
  passwordRequireLower: boolean | null;
  passwordRequireDigit: boolean | null;
  passwordRequireSymbol: boolean | null;
  passwordHistory: number | null;
  passwordMaxAgeDays: number | null;
  lockoutThreshold: number | null;
  lockoutMinutes: number | null;
  idleMinutes: number | null;
  requireMfa: boolean | null;
}

/** The rules in force, with the console's sentences for them. */
export interface PasswordRules extends SecuritySettings {
  rules: string[];
}

export interface SecurityPolicy {
  tenantId: number;
  workspace: SecuritySettings;
  platform: SecuritySettings;
  effective: PasswordRules;
}

export interface SignInEvent {
  id: number;
  tenantId: number | null;
  appUserId: number | null;
  username: string;
  outcome: string;
  reason: string | null;
  reasonText: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  actorId: number | null;
  at: string;
}

export interface SignInPage {
  items: SignInEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface SignInFilter {
  tenantId?: number | null;
  appUserId?: number | null;
  outcome?: string | null;
  method?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

export interface SessionRow {
  sessionId: string;
  current: boolean;
  method: string;
  ip: string | null;
  userAgent: string | null;
  signedInAt: string;
  lastActiveAt: string;
  idleExpiresAt: string;
}

export interface PersonStanding {
  lockedUntil: string | null;
  failedSignIns: number;
  passwordChangedAt: string | null;
  mfaEnabled?: boolean;
  mfaEnrolledAt?: string | null;
}

/** MIG-353 part 4: a person's two-factor login. */
export interface MfaStatus {
  enabled: boolean;
  enrolledAt: string | null;
  recoveryCodesLeft: number;
  required: boolean;
}

/** An enrolment begun: what the authenticator app needs, shown once. */
export interface MfaEnrolment {
  secret: string;
  otpauthUri: string;
  qr: { size: number; path: string };
  account: string;
  issuer: string;
}

/** The outcomes and methods as people read them. */
export const OUTCOME_LABEL: Record<string, string> = {
  SUCCESS: 'Signed in', FAILURE: 'Failed', LOCKED: 'Locked', UNLOCKED: 'Unlocked', MFA_ENROLLED: 'Two-factor on',
  MFA_DISABLED: 'Two-factor off', MFA_RESET: 'Two-factor reset', SIGNED_OUT: 'Signed out',
};
export const METHOD_LABEL: Record<string, string> = {
  PASSWORD: 'Password', MFA: 'Password + code', RECOVERY_CODE: 'Recovery code', SSO: 'Single sign-on', ADMIN: 'Administrator',
  SESSION: 'Session',
};

function params(filter: SignInFilter): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== null && value !== undefined && value !== '') p = p.set(key, String(value));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class AccountSecurityApi {
  private readonly http = inject(HttpClient);

  /** The caller's own workspace's rules. */
  myRules(): Observable<ApiResponse<PasswordRules>> {
    return this.http.get<ApiResponse<PasswordRules>>(`${API_BASE}/appUser.json/security/passwordRules`);
  }

  /** A workspace's rules, for an administrator setting someone else's password (a platform administrator names it). */
  rulesFor(tenantId: number | null | undefined): Observable<ApiResponse<PasswordRules>> {
    const p = tenantId ? new HttpParams().set('tenantId', tenantId) : new HttpParams();
    return this.http.get<ApiResponse<PasswordRules>>(`${API_BASE}/tenant.json/security/passwordRules`, { params: p });
  }

  policy(tenantId?: number | null): Observable<ApiResponse<SecurityPolicy>> {
    const p = tenantId ? new HttpParams().set('tenantId', tenantId) : new HttpParams();
    return this.http.get<ApiResponse<SecurityPolicy>>(`${API_BASE}/tenant.json/security/policy`, { params: p });
  }

  savePolicy(body: Partial<SecuritySettings> & { tenantId?: number | null }): Observable<ApiResponse<SecurityPolicy>> {
    return this.http.post<ApiResponse<SecurityPolicy>>(`${API_BASE}/tenant.json/security/policy`, body);
  }

  platformPolicy(): Observable<ApiResponse<PasswordRules>> {
    return this.http.get<ApiResponse<PasswordRules>>(`${API_BASE}/tenant.json/security/platformPolicy`);
  }

  savePlatformPolicy(body: Partial<SecuritySettings>): Observable<ApiResponse<PasswordRules>> {
    return this.http.post<ApiResponse<PasswordRules>>(`${API_BASE}/tenant.json/security/platformPolicy`, body);
  }

  workspaceHistory(filter: SignInFilter): Observable<ApiResponse<SignInPage>> {
    return this.http.get<ApiResponse<SignInPage>>(`${API_BASE}/tenant.json/security/history`, { params: params(filter) });
  }

  workspaceHistoryCsv(filter: SignInFilter): Observable<Blob> {
    return this.http.get(`${API_BASE}/tenant.json/security/history.csv`, { params: params(filter), responseType: 'blob' });
  }

  myHistory(filter: SignInFilter): Observable<ApiResponse<SignInPage>> {
    return this.http.get<ApiResponse<SignInPage>>(`${API_BASE}/appUser.json/security/history`, { params: params(filter) });
  }

  myHistoryCsv(filter: SignInFilter): Observable<Blob> {
    return this.http.get(`${API_BASE}/appUser.json/security/history.csv`, { params: params(filter), responseType: 'blob' });
  }

  people(tenantId?: number | null): Observable<ApiResponse<Record<string, PersonStanding>>> {
    const p = tenantId ? new HttpParams().set('tenantId', tenantId) : new HttpParams();
    return this.http.get<ApiResponse<Record<string, PersonStanding>>>(`${API_BASE}/tenant.json/security/people`, { params: p });
  }

  unlock(appUserId: number): Observable<ApiResponse<{ appUserId: number; wasLocked: boolean }>> {
    return this.http.post<ApiResponse<{ appUserId: number; wasLocked: boolean }>>(`${API_BASE}/tenant.json/security/unlock`,
      { appUserId });
  }

  mfa(): Observable<ApiResponse<MfaStatus>> {
    return this.http.get<ApiResponse<MfaStatus>>(`${API_BASE}/appUser.json/security/mfa`);
  }

  startMfa(): Observable<ApiResponse<MfaEnrolment>> {
    return this.http.post<ApiResponse<MfaEnrolment>>(`${API_BASE}/appUser.json/security/mfa/start`, {});
  }

  confirmMfa(code: string): Observable<ApiResponse<{ recoveryCodes: string[] }>> {
    return this.http.post<ApiResponse<{ recoveryCodes: string[] }>>(`${API_BASE}/appUser.json/security/mfa/confirm`, { code });
  }

  disableMfa(password: string, code: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/appUser.json/security/mfa/disable`, { password, code });
  }

  newRecoveryCodes(password: string): Observable<ApiResponse<{ recoveryCodes: string[] }>> {
    return this.http.post<ApiResponse<{ recoveryCodes: string[] }>>(`${API_BASE}/appUser.json/security/mfa/recoveryCodes`, { password });
  }

  resetMfa(appUserId: number): Observable<ApiResponse<{ appUserId: number; wasOn: boolean }>> {
    return this.http.post<ApiResponse<{ appUserId: number; wasOn: boolean }>>(`${API_BASE}/tenant.json/security/resetMfa`, { appUserId });
  }

  sessions(): Observable<ApiResponse<SessionRow[]>> {
    return this.http.get<ApiResponse<SessionRow[]>>(`${API_BASE}/appUser.json/security/sessions`);
  }

  endSession(sessionId: string): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/appUser.json/security/sessions/end`, { sessionId });
  }

  endOtherSessions(): Observable<ApiResponse<{ ended: number }>> {
    return this.http.post<ApiResponse<{ ended: number }>>(`${API_BASE}/appUser.json/security/sessions/endOthers`, {});
  }
}

/** A browser as people name it, from its user agent: "Chrome on macOS". Unknown parts are left out. */
export function deviceOf(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : /curl|python|java|okhttp|Playwright/i.test(ua) ? 'Script' : 'Browser';
  const system = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return system ? `${browser} on ${system}` : browser;
}
