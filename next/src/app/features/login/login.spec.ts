import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Login, safeReturn } from './login';
import { SignInApi } from './sign-in.api';
import { AuthService } from '../../core/auth/auth.service';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

/**
 * A session a password change signed out lands here, and the page says why -- otherwise the person
 * is simply looking at a sign-in form they did not ask for, with no idea their password is the
 * reason.
 */
function render(query: Record<string, string>, login: () => unknown = () => undefined): HTMLElement {
  return renderFixture(query, login).nativeElement as HTMLElement;
}

function renderFixture(query: Record<string, string>, login: () => unknown = () => undefined) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Login],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { login } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const fixture = TestBed.createComponent(Login);
  fixture.detectChanges();
  return fixture;
}

// ThemeService reads and writes the stored choice.
useMemoryStorage();

// The page carries a theme toggle, and ThemeService asks the OS for its preference; the test
// environment has no matchMedia.
beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})));

describe('Login', () => {
  it('says the password was changed when that is why the session ended', () => {
    const page = render({ reason: 'password-changed' });
    expect(page.textContent).toContain('Your password was changed. Please sign in with the new password.');
    expect(page.querySelector('[role="status"]')).not.toBeNull();
  });

  it('says nothing for an ordinary visit, or for a reason it did not send', () => {
    expect(render({}).querySelector('[role="status"]')).toBeNull();
    const crafted = render({ reason: '<b>call this number</b>' });
    expect(crafted.querySelector('[role="status"]')).toBeNull();
    expect(crafted.textContent).not.toContain('call this number');
  });
});

/**
 * A refused sign-in was a pink box with no live region, so a screen reader heard nothing after
 * Sign in; and the inputs were never marked invalid or tied to their messages.
 */
describe('Login -- telling a screen reader what went wrong', () => {
  it('announces a refused sign-in', () => {
    const fixture = renderFixture({}, () => of({ status: 'ERROR', message: 'Wrong username or password.' }));
    const page = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.form.setValue({ username: 'me', password: 'nope' });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    const alert = page.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Wrong username or password.');
  });

  it('marks an empty field invalid and names its error', () => {
    const fixture = renderFixture({});
    const page = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(page.querySelector('#username')!.getAttribute('aria-invalid')).toBe('true');
    const alerts = [...page.querySelectorAll('[role="alert"]')].map(el => el.textContent ?? '');
    expect(alerts.some(text => text.includes('Username is required'))).toBe(true);
  });
});

/**
 * The sign-in page was a dead end: no way back to the front page, to Request a workspace or to
 * the setup guide, and no theme toggle, though every other public page has them.
 */
describe('Login -- ways out', () => {
  it('links to the front page, Request a workspace and the setup guide', () => {
    const page = render({});
    expect(page.querySelector('a[href="/"]')).not.toBeNull();
    expect(page.querySelector('a[href="/request-workspace"]')?.textContent).toContain('Request a workspace');
    expect(page.querySelector('a[href="/docs"]')?.textContent).toContain('Help centre');
  });

  it('says who resets a forgotten password', () => {
    expect(render({}).textContent).toContain('Ask your workspace administrator');
  });

  it('offers the theme toggle', () => {
    const toggle = render({}).querySelector('button[aria-label^="Switch to"]');
    expect(toggle).not.toBeNull();
  });

  it('does not show bullets in the empty password field, as if one were already filled in', () => {
    expect(render({}).querySelector('#password')!.getAttribute('placeholder') ?? '').not.toContain('•');
  });
});

/**
 * MIG-353: the steps after the password -- a two-factor code (or a recovery code) when the account has it on, and the
 * company sign-in -- and the reason a session ended for inactivity.
 */
describe('Login -- two-factor and single sign-on (MIG-353)', () => {
  function withApi(login: () => unknown, api: Record<string, unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login, signedIn: () => {} } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: SignInApi, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  it('says the session ended for inactivity', () => {
    const page = render({ reason: 'idle' });
    expect(page.querySelector('[role="status"]')?.textContent).toContain('signed out because the console was not used');
  });

  it('asks for the code when the password answers a challenge, and sends it with the challenge', () => {
    const verifyMfa = vi.fn(() => of({ status: 'SUCCESS', message: '', data: { accessToken: 'a', refreshToken: 'r' } }));
    const fixture = withApi(
      () => of({ status: 'SUCCESS', message: '', data: { mfaRequired: true, mfaToken: 'challenge-1', username: 'me' } }),
      { verifyMfa });
    const login = fixture.componentInstance;
    login.form.setValue({ username: 'me', password: 'right' });
    login.submit();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(login.stage()).toBe('code');
    expect(page.querySelector('#mfa-code')).not.toBeNull();
    expect(login.form.controls.password.value).toBe('');
    login.code.set('123 456');
    login.submitCode();
    expect(verifyMfa).toHaveBeenCalledWith('challenge-1', '123456', null);
  });

  it('sends a recovery code as one, not as an app code', () => {
    const verifyMfa = vi.fn(() => of({ status: 'ERROR', message: 'That code did not work.' }));
    const fixture = withApi(
      () => of({ status: 'SUCCESS', message: '', data: { mfaRequired: true, mfaToken: 'challenge-2' } }), { verifyMfa });
    const login = fixture.componentInstance;
    login.form.setValue({ username: 'me', password: 'right' });
    login.submit();
    login.toggleRecovery();
    login.code.set('abcd-efgh');
    login.submitCode();
    fixture.detectChanges();
    expect(verifyMfa).toHaveBeenCalledWith('challenge-2', null, 'abcd-efgh');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('That code did not work.');
    expect(login.stage()).toBe('code');
  });

  it('goes back to the password when the challenge is spent', () => {
    const fixture = withApi(
      () => of({ status: 'SUCCESS', message: '', data: { mfaRequired: true, mfaToken: 'c' } }),
      { verifyMfa: () => of({ status: 'ERROR', message: 'This sign-in has expired. Please sign in again.' }) });
    const login = fixture.componentInstance;
    login.form.setValue({ username: 'me', password: 'right' });
    login.submit();
    login.code.set('123456');
    login.submitCode();
    expect(login.stage()).toBe('password');
    expect(login.error()).toContain('sign in again');
  });

  it('starts single sign-on by the work address and refuses one without a domain', () => {
    const ssoStart = vi.fn(() => of({ status: 'ERROR', message: 'Single sign-on is not set up for that address.' }));
    const fixture = withApi(() => undefined, { ssoStart });
    const login = fixture.componentInstance;
    login.showCompany();
    login.companyEmail.set('not-an-address');
    login.startSso(false);
    expect(ssoStart).not.toHaveBeenCalled();
    expect(login.error()).toBe('Type your work email address.');
    login.companyEmail.set('ana@example.org');
    login.startSso(false);
    expect(ssoStart).toHaveBeenCalledWith({ email: 'ana@example.org' });
    expect(login.error()).toBe('Single sign-on is not set up for that address.');
  });

  it('follows only a path of its own after signing in', () => {
    expect(safeReturn('/jobs')).toBe('/jobs');
    expect(safeReturn('//evil.example')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn(null)).toBe('/');
  });
});

/** Owner 2026-10-27: a sign-in link's company sign-in says it is being checked, and why it is not there. */
describe('Login -- the sign-in link\'s company sign-in', () => {
  function withSso(discover: () => Observable<unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login: () => undefined } },
        { provide: SignInApi, useValue: { ssoDiscover: discover } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ sso: 'acme' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('is checking until the link answers', () => {
    const { page } = withSso(() => NEVER);
    expect(page.ssoChecking()).toBe(true);
    expect(page.ssoNote()).toBe('');
  });

  it('says the link has no company sign-in', () => {
    const { page, fixture, el } = withSso(() => of({ status: 'SUCCESS', data: { sso: false } }));
    fixture.detectChanges();
    expect(page.ssoChecking()).toBe(false);
    expect(el.querySelector('[data-test=sso-note]')!.textContent).toContain('not available for this link');
  });

  it('says the check failed, in plain words', () => {
    const { page } = withSso(() => throwError(() => ({ status: 500 })));
    expect(page.ssoChecking()).toBe(false);
    expect(page.ssoNote()).toContain('could not be checked just now');
  });
});
