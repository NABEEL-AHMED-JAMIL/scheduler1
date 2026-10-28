import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccountSecurityApi } from '../../account/account-security.api';
import { AccessProfilesService } from '../access-profiles/access-profiles.service';
import { WorkspaceSecurity } from './workspace-security';

/**
 * Owner 2026-10-27: Administration > Security says its rules are loading (it drew empty fields with "Platform default"
 * as if they were the rules), says a failed read with Try again, and its single sign-on never sits on "Loading…" for ever.
 */
const FAILED = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

function screen(answers: { policy?: () => Observable<unknown>; sso?: () => Observable<unknown>; profiles?: () => Observable<unknown> }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AccountSecurityApi, useValue: { policy: answers.policy ?? (() => NEVER), platformPolicy: () => NEVER } },
      { provide: HttpClient, useValue: { get: answers.sso ?? (() => NEVER) } },
      { provide: AccessProfilesService, useValue: { list: answers.profiles ?? (() => of({ status: 'SUCCESS', message: '', data: [] })) } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, user: () => ({ tenantId: 2924 }) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: WorkspaceDirectory, useValue: { remembered: () => null } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new WorkspaceSecurity());
  page.ngOnInit();
  return page;
}

describe('Administration > Security -- loading, error', () => {
  it('is loading, not a form of empty rules, until the rules answer', () => {
    const page = screen({});
    expect(page.loading()).toBe(true);
    expect(page.rulesLoaded()).toBe(false);
    expect(page.error()).toBe('');
  });

  it('says the rules could not be read, in plain words', () => {
    const page = screen({ policy: FAILED });
    expect(page.loading()).toBe(false);
    expect(page.rulesLoaded()).toBe(false);
    expect(page.error()).toBe('The rules could not be read.');
  });

  it('says single sign-on could not be read instead of "Loading…" for ever, and reads it again', () => {
    let sso: () => Observable<unknown> = FAILED;
    const page = screen({ sso: () => sso() });
    expect(page.sso()).toBeNull();
    expect(page.ssoError()).toBe('Single sign-on could not be read.');
    sso = () => NEVER;
    page.loadSso();
    expect(page.ssoError()).toBe('');
  });

  it('says the access profiles for SSO could not be read, instead of offering only the default', () => {
    const page = screen({ profiles: FAILED });
    expect(page.profilesState.error()).toBe('The access profiles could not be read.');
    expect(page.profilesState.loading()).toBe(false);
  });
});
