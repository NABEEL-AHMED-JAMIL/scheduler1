import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { CopyButton } from '../../../shared/ui/copy-button';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AccountSecurityApi, SecurityPolicy, SecuritySettings } from '../../account/account-security.api';
import { SignInHistory } from '../../account/sign-in-history';
import { AccessProfile, AccessProfilesService } from '../access-profiles/access-profiles.service';
import { FlagChoice, RANGES, RulesDraft, draftOf, draftProblem, platformText, settingsOf } from './security-settings.model';
import { SsoStarted, rememberFlow } from '../../login/sign-in.api';

/** A workspace's single sign-on, as the server answers it (never the secret). */
export interface SsoSettings {
  tenantId: number;
  configured: boolean;
  redirectUri: string;
  displayName?: string | null;
  issuer?: string;
  clientId?: string;
  clientSecretSet?: boolean;
  allowedDomains?: string[];
  userCreation?: 'EXISTING' | 'JIT';
  defaultProfileId?: number | null;
  enabled?: boolean;
  loginKey?: string;
  loginUrl?: string;
  updatedAt?: string | null;
  /** MIG-353 part 6: SAML 2.0 -- the provider's side as saved, and ours to register with it. */
  protocol?: SsoProtocol;
  spEntityId?: string;
  acsUrl?: string;
  spMetadataUrl?: string;
  idpEntityId?: string | null;
  idpSsoUrl?: string | null;
  idpCertificates?: string | null;
  certificates?: SamlCertificate[];
  nameIdFormat?: string | null;
  emailAttribute?: string | null;
  nameAttribute?: string | null;
}

export type SsoProtocol = 'OIDC' | 'SAML';

/** A provider's signing certificate, as the server describes it. */
export interface SamlCertificate {
  subject: string;
  notAfter: string;
  expired: boolean;
  sha256: string;
}

/** What an identity provider's metadata says, read by the server for the form. */
interface SamlMetadataRead {
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificates: string;
  certificates: SamlCertificate[];
}

interface SsoDraft {
  protocol: SsoProtocol;
  displayName: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  allowedDomains: string;
  userCreation: 'EXISTING' | 'JIT';
  defaultProfileId: string;
  enabled: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificates: string;
  nameIdFormat: string;
  emailAttribute: string;
  nameAttribute: string;
}

/** The name ID formats an administrator may ask for; "unspecified" asks for none in particular. */
export const NAME_ID_FORMATS: { value: string; label: string }[] = [
  { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified', label: 'Unspecified (the provider decides)' },
  { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', label: 'Email address' },
  { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', label: 'Persistent' },
  { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient', label: 'Transient' },
];

function ssoDraftOf(s: SsoSettings | null): SsoDraft {
  return {
    protocol: s?.protocol ?? 'OIDC',
    displayName: s?.displayName ?? '', issuer: s?.issuer ?? '', clientId: s?.clientId ?? '', clientSecret: '',
    allowedDomains: (s?.allowedDomains ?? []).join(', '), userCreation: s?.userCreation ?? 'EXISTING',
    defaultProfileId: s?.defaultProfileId ? String(s.defaultProfileId) : '', enabled: !!s?.enabled,
    idpEntityId: s?.idpEntityId ?? '', idpSsoUrl: s?.idpSsoUrl ?? '', idpCertificates: s?.idpCertificates ?? '',
    nameIdFormat: s?.nameIdFormat ?? NAME_ID_FORMATS[0].value, emailAttribute: s?.emailAttribute ?? '',
    nameAttribute: s?.nameAttribute ?? '',
  };
}

/** The settings a person reads per field, in the form's order. */
const RULE_FIELDS: { key: keyof RulesDraft; label: string; hint: string; flag?: boolean; group: string }[] = [
  { key: 'passwordMinLength', label: 'Minimum length', hint: 'Characters (8–128).', group: 'Passwords' },
  { key: 'passwordRequireUpper', label: 'Upper-case letter', hint: '', flag: true, group: 'Passwords' },
  { key: 'passwordRequireLower', label: 'Lower-case letter', hint: '', flag: true, group: 'Passwords' },
  { key: 'passwordRequireDigit', label: 'Digit', hint: '', flag: true, group: 'Passwords' },
  { key: 'passwordRequireSymbol', label: 'Symbol', hint: '', flag: true, group: 'Passwords' },
  { key: 'passwordHistory', label: 'Remember earlier passwords', hint: 'A new password may not be any of the last N (0–24; 0: off).',
    group: 'Passwords' },
  { key: 'passwordMaxAgeDays', label: 'Maximum age', hint: 'Days before a change is owed (0: never).', group: 'Passwords' },
  { key: 'lockoutThreshold', label: 'Lock after', hint: 'Failed attempts in a row (3–20), passwords and codes alike.',
    group: 'Lockout' },
  { key: 'lockoutMinutes', label: 'Lock for', hint: 'Minutes (1–1440). Administrators are told, and can unlock under Users.',
    group: 'Lockout' },
  { key: 'idleMinutes', label: 'Sign out after', hint: 'Minutes without activity (5–720). Warned a minute before.', group: 'Sessions' },
  { key: 'requireMfa', label: 'Require two-factor login', hint: 'Everyone signing in with a password sets up an authenticator app.',
    flag: true, group: 'Sessions' },
];

/**
 * MIG-353: Administration › Security -- a workspace's sign-in rules (passwords, lockout, idle sign-out, two-factor), its
 * single sign-on, and its sign-in history. A workspace administrator works in their own workspace; a platform
 * administrator picks one, or with none picked sets the platform's defaults and reads every workspace's history.
 */
@Component({
  selector: 'app-workspace-security',
  imports: [Icon, Combobox, CopyButton, ServerTimePipe, SignInHistory],
  templateUrl: './workspace-security.html',
})
export class WorkspaceSecurity implements OnInit {
  private readonly api = inject(AccountSecurityApi);
  private readonly http = inject(HttpClient);
  private readonly profilesApi = inject(AccessProfilesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly tenantId = signal<number | null>(null);
  readonly tenants = signal<ComboboxOption[]>([]);
  /** A platform administrator with no workspace picked edits the platform's defaults. */
  readonly platformMode = computed(() => this.isPlatformAdmin() && this.tenantId() === null);

  readonly fields = RULE_FIELDS;
  readonly groups = ['Passwords', 'Lockout', 'Sessions'];
  readonly policy = signal<SecurityPolicy | null>(null);
  readonly platform = signal<SecuritySettings | null>(null);
  readonly draft = signal<RulesDraft>(draftOf(null));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly problem = computed(() => draftProblem(this.draft()));

  readonly sso = signal<SsoSettings | null>(null);
  readonly ssoDraft = signal<SsoDraft>(ssoDraftOf(null));
  readonly ssoSaving = signal(false);
  readonly ssoError = signal('');
  readonly ssoTest = signal('');
  readonly profiles = signal<AccessProfile[]>([]);
  readonly copied = signal('');
  readonly nameIdFormats = NAME_ID_FORMATS;
  /** SAML: the metadata an administrator pastes, and the certificates the last read found. */
  readonly metadataXml = signal('');
  readonly metadataCertificates = signal<SamlCertificate[] | null>(null);
  readonly samlBusy = signal(false);

  ngOnInit(): void {
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<{ tenantId: number; tenantName: string }[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set((r.data ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName }))); },
        error: () => {},
      });
    }
    this.load();
  }

  pickWorkspace(value: string): void {
    const id = Number(value);
    this.tenantId.set(value && Number.isFinite(id) ? id : null);
    this.load();
  }

  groupFields(group: string) {
    return this.fields.filter(f => f.group === group);
  }

  /** What an empty field means: the platform's value (a workspace), or nothing (the platform's own form fills every field). */
  placeholder(key: keyof RulesDraft): string {
    if (this.platformMode()) return '';
    const value = platformText(this.platform(), key as keyof SecuritySettings);
    return value ? `Platform default: ${value}` : 'Platform default';
  }

  flagDefaultLabel(key: keyof RulesDraft): string {
    const value = platformText(this.platform(), key as keyof SecuritySettings);
    return `Platform default (${value === 'yes' ? 'yes' : 'no'})`;
  }

  range(key: keyof RulesDraft): [number, number] | null {
    return (RANGES as Record<string, [number, number]>)[key] ?? null;
  }

  set(key: keyof RulesDraft, value: string): void {
    this.saveError.set('');
    this.draft.update(d => ({ ...d, [key]: value as FlagChoice }));
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    if (this.platformMode()) {
      this.api.platformPolicy().subscribe({
        next: r => {
          this.loading.set(false);
          if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The rules could not be read.'); return; }
          this.platform.set(r.data);
          this.policy.set(null);
          this.draft.set(draftOf(r.data));
        },
        error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The rules could not be read.'); },
      });
      this.sso.set(null);
      return;
    }
    this.api.policy(this.tenantId()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The rules could not be read.'); return; }
        this.policy.set(r.data);
        this.platform.set(r.data.platform);
        this.draft.set(draftOf(r.data.workspace));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The rules could not be read.'); },
    });
    this.loadSso();
    this.profilesApi.list(this.tenantId()).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.profiles.set(r.data ?? []); },
      error: () => {},
    });
  }

  save(): void {
    const problem = this.problem();
    if (problem) { this.saveError.set(`Check ${this.fields.find(f => f.key === problem.field)?.label}: ${problem.message}`); return; }
    this.saving.set(true);
    this.saveError.set('');
    const body = settingsOf(this.draft());
    const call: Observable<ApiResponse<unknown>> = this.platformMode()
      ? this.api.savePlatformPolicy(body) : this.api.savePolicy({ ...body, tenantId: this.tenantId() });
    call.subscribe({
      next: (r: ApiResponse<unknown>) => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.saveError.set(r.message); return; }
        this.toast.success(this.platformMode() ? 'The platform\'s default rules are saved.' : r.message);
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message || 'The rules could not be saved.');
      },
    });
  }

  useDefaults(): void {
    this.draft.set(draftOf(null));
    this.saveError.set('');
  }

  // ---- single sign-on ---------------------------------------------------------------------------------------

  loadSso(): void {
    this.ssoError.set('');
    this.ssoTest.set('');
    const params = this.tenantId() ? `?tenantId=${this.tenantId()}` : '';
    this.http.get<ApiResponse<SsoSettings>>(`${API_BASE}/tenant.json/security/sso${params}`).subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data) {
          this.sso.set(r.data);
          this.ssoDraft.set(ssoDraftOf(r.data));
        } else {
          this.ssoError.set(r.message);
        }
      },
      error: err => this.ssoError.set(err?.error?.message || 'Single sign-on could not be read.'),
    });
  }

  setSso<K extends keyof SsoDraft>(key: K, value: SsoDraft[K]): void {
    this.ssoError.set('');
    this.ssoDraft.update(d => ({ ...d, [key]: value }));
  }

  saveSso(): void {
    const d = this.ssoDraft();
    this.ssoSaving.set(true);
    this.ssoError.set('');
    const common = {
      tenantId: this.tenantId(), protocol: d.protocol, displayName: d.displayName, allowedDomains: d.allowedDomains,
      userCreation: d.userCreation, defaultProfileId: d.userCreation === 'JIT' && d.defaultProfileId ? Number(d.defaultProfileId) : null,
      enabled: d.enabled,
    };
    const body = d.protocol === 'SAML'
      ? { ...common, idpEntityId: d.idpEntityId, idpSsoUrl: d.idpSsoUrl, idpCertificates: d.idpCertificates, nameIdFormat: d.nameIdFormat,
        emailAttribute: d.emailAttribute, nameAttribute: d.nameAttribute }
      : { ...common, issuer: d.issuer, clientId: d.clientId, clientSecret: d.clientSecret };
    this.http.post<ApiResponse<SsoSettings>>(`${API_BASE}/tenant.json/security/sso`, body).subscribe({
      next: r => {
        this.ssoSaving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.ssoError.set(r.message); return; }
        this.toast.success(r.message);
        this.sso.set(r.data);
        this.ssoDraft.set(ssoDraftOf(r.data));
        this.metadataCertificates.set(null);
      },
      error: err => { this.ssoSaving.set(false); this.ssoError.set(err?.error?.message || 'Single sign-on could not be saved.'); },
    });
  }

  testSso(): void {
    this.ssoTest.set('');
    this.ssoError.set('');
    this.http.post<ApiResponse<{ issuer: string }>>(`${API_BASE}/tenant.json/security/sso/test`, { issuer: this.ssoDraft().issuer })
      .subscribe({
        next: r => r.status === API_SUCCESS ? this.ssoTest.set(`The provider answers at ${r.data?.issuer}.`) : this.ssoError.set(r.message),
        error: err => this.ssoError.set(err?.error?.message || 'The provider could not be reached.'),
      });
  }

  removeSso(): void {
    this.http.post<ApiResponse>(`${API_BASE}/tenant.json/security/sso/remove`, { tenantId: this.tenantId() }).subscribe({
      next: r => { if (r.status === API_SUCCESS) { this.toast.success(r.message); this.loadSso(); } else this.ssoError.set(r.message); },
      error: err => this.ssoError.set(err?.error?.message || 'Single sign-on could not be removed.'),
    });
  }

  // ---- SAML 2.0 (MIG-353 part 6) ------------------------------------------------------------------------------

  /** The provider's metadata (pasted or uploaded), read by the server into the form; nothing is saved until Save. */
  readMetadata(xml: string): void {
    if (!xml.trim()) { this.ssoError.set('Paste or upload the identity provider\'s metadata XML.'); return; }
    this.samlBusy.set(true);
    this.ssoError.set('');
    this.http.post<ApiResponse<SamlMetadataRead>>(`${API_BASE}/tenant.json/security/sso/saml/metadata`, { xml }).subscribe({
      next: r => {
        this.samlBusy.set(false);
        if (r.data) {
          this.ssoDraft.update(d => ({ ...d, idpEntityId: r.data!.idpEntityId, idpSsoUrl: r.data!.idpSsoUrl,
            idpCertificates: r.data!.idpCertificates }));
          this.metadataCertificates.set(r.data.certificates ?? null);
        }
        if (r.status === API_SUCCESS) { this.ssoTest.set(r.message); this.metadataXml.set(''); } else this.ssoError.set(r.message);
      },
      error: err => { this.samlBusy.set(false); this.ssoError.set(err?.error?.message || 'The metadata could not be read.'); },
    });
  }

  /** An uploaded metadata file: read here as text (at most 512 KB), then as pasted. */
  metadataFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 512 * 1024) { this.ssoError.set('That file is larger than 512 KB; metadata is much smaller.'); return; }
    void file.text().then(text => this.readMetadata(text), () => this.ssoError.set('The file could not be read.'));
  }

  /** Our service-provider metadata, saved as a file for the identity provider's import. */
  downloadSpMetadata(): void {
    const url = this.sso()?.spMetadataUrl;
    if (!url) return;
    this.http.get(url, { responseType: 'text' }).subscribe({
      next: xml => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([xml], { type: 'application/samlmetadata+xml' }));
        link.download = 'etl-console-sp-metadata.xml';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      },
      error: () => this.ssoError.set('Our metadata could not be read. Save the settings first.'),
    });
  }

  /** A sign-in through the saved SAML settings (on or off) that ends on a page saying what would happen; nobody is signed in. */
  testSamlSignIn(): void {
    this.ssoError.set('');
    this.ssoTest.set('');
    this.http.post<ApiResponse<SsoStarted>>(`${API_BASE}/tenant.json/security/sso/saml/test`, { tenantId: this.tenantId() }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data?.authorizationUrl) { this.ssoError.set(r.message); return; }
        rememberFlow(r.data.flow);
        window.location.assign(r.data.authorizationUrl);
      },
      error: err => this.ssoError.set(err?.error?.message || 'The test sign-in could not start.'),
    });
  }

  copy(what: 'redirect' | 'link' | 'entity' | 'acs', value: string | undefined | null): void {
    if (!value) return;
    void copyText(value).then(ok => {
      this.copied.set(ok ? what : '');
      if (ok) setTimeout(() => this.copied.set(''), 2000);
    });
  }
}
