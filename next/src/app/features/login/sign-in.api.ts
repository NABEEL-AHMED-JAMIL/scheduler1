import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { AuthUser } from '../../core/auth/auth.models';
import { MfaEnrolment } from '../account/account-security.api';

/** MIG-353: a sign-in's answer when a second step is owed instead of a session. */
export interface SignInStep {
  mfaRequired?: boolean;
  mfaEnrolmentRequired?: boolean;
  mfaToken?: string;
  username?: string;
}

/** A sign-in that finished: the session, plus what only a two-factor sign-in carries. */
export type SignedIn = AuthUser & { recoveryCodesLeft?: number; recoveryCodes?: string[] };

/** MIG-353 part 5: a workspace's single sign-on, as the login page finds it. */
export interface SsoProviderHint {
  sso: boolean;
  loginKey?: string;
  displayName?: string;
  /** MIG-353 part 6: which protocol the workspace's provider speaks; the login page needs nothing different for either. */
  protocol?: 'OIDC' | 'SAML';
}

/** Where to go next: the provider's sign-in page; SAML adds the flow secret this tab keeps until it comes back. */
export interface SsoStarted {
  authorizationUrl: string;
  flow?: string;
  protocol?: 'OIDC' | 'SAML';
}

/** MIG-353 part 6: an administrator's SAML test sign-in -- what would happen; nobody is signed in. */
export interface SamlTestResult {
  test: true;
  email: string;
  name?: string | null;
  nameId?: string | null;
  attributes?: string | null;
  outcome: 'EXISTING' | 'JIT' | 'REFUSED';
  explanation: string;
}

/** The tab's SAML flow secret (sessionStorage): only the tab that started a SAML sign-in can finish it. */
export const SSO_FLOW_KEY = 'etl_sso_flow';

/** Keeps (or forgets) this tab's SAML flow secret; storage refused only means the callback cannot finish. */
export function rememberFlow(flow: string | undefined | null): void {
  try {
    if (flow) sessionStorage.setItem(SSO_FLOW_KEY, flow);
    else sessionStorage.removeItem(SSO_FLOW_KEY);
  } catch {
    // Storage refused.
  }
}

/**
 * MIG-353: the sign-in steps after the password -- the two-factor code, a required enrolment -- and single sign-on. Every
 * call that finishes a sign-in hands its session to AuthService, which keeps it exactly as a password sign-in's. Used only
 * by the login and SSO callback pages, so it rides in their lazy chunks.
 */
@Injectable({ providedIn: 'root' })
export class SignInApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  verifyMfa(mfaToken: string, code: string | null, recoveryCode: string | null): Observable<ApiResponse<SignedIn>> {
    return this.http.post<ApiResponse<SignedIn>>(`${API_BASE}/auth.json/mfa/verify`, { mfaToken, code, recoveryCode })
      .pipe(tap(r => this.auth.signedIn(r)));
  }

  startEnrolment(mfaToken: string): Observable<ApiResponse<MfaEnrolment>> {
    return this.http.post<ApiResponse<MfaEnrolment>>(`${API_BASE}/auth.json/mfa/enrol/start`, { mfaToken });
  }

  /** Not kept until the person has seen their recovery codes: the caller hands it to AuthService when they continue. */
  confirmEnrolment(mfaToken: string, code: string): Observable<ApiResponse<SignedIn>> {
    return this.http.post<ApiResponse<SignedIn>>(`${API_BASE}/auth.json/mfa/enrol/confirm`, { mfaToken, code });
  }

  ssoDiscover(body: { email?: string; loginKey?: string }): Observable<ApiResponse<SsoProviderHint>> {
    return this.http.post<ApiResponse<SsoProviderHint>>(`${API_BASE}/auth.json/sso/discover`, body);
  }

  ssoStart(body: { email?: string; loginKey?: string }): Observable<ApiResponse<SsoStarted>> {
    return this.http.post<ApiResponse<SsoStarted>>(`${API_BASE}/auth.json/sso/start`, body);
  }

  /** MIG-353 part 6: the SAML handoff the consumer service sent the browser back with, and this tab's flow secret. */
  samlFinish(handoff: string, flow: string): Observable<ApiResponse<SignedIn | SamlTestResult>> {
    return this.http.post<ApiResponse<SignedIn | SamlTestResult>>(`${API_BASE}/auth.json/sso/saml/finish`, { handoff, flow })
      .pipe(tap(r => this.auth.signedIn(r as ApiResponse<SignedIn>)));
  }

  ssoCallback(code: string, state: string): Observable<ApiResponse<SignedIn>> {
    return this.http.post<ApiResponse<SignedIn>>(`${API_BASE}/auth.json/sso/callback`, { code, state })
      .pipe(tap(r => this.auth.signedIn(r)));
  }
}
