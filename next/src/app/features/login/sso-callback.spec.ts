import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SsoCallback } from './sso-callback';
import { SSO_FLOW_KEY, SignInApi, rememberFlow } from './sign-in.api';
import { SSO_RETURN_KEY } from './login';

/**
 * MIG-353 part 6: Identity's SAML consumer service sends the browser to /sso/callback?saml=<handoff>. The page redeems it
 * with the flow secret this tab kept at the start (and forgets it), then goes where the person was headed -- or, for an
 * administrator's test sign-in, shows what would happen and signs nobody in.
 */
function render(query: Record<string, string>, api: Partial<SignInApi>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SsoCallback],
    providers: [
      provideRouter([]),
      { provide: SignInApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SsoCallback);
  fixture.detectChanges();
  return { fixture, page: fixture.nativeElement as HTMLElement, navigate };
}

beforeEach(() => {
  let store: Record<string, string> = {};
  vi.stubGlobal('sessionStorage', {
    get length() { return Object.keys(store).length; },
    clear: () => { store = {}; },
    getItem: (key: string) => (key in store ? store[key] : null),
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => { delete store[key]; },
    setItem: (key: string, value: string) => { store[key] = String(value); },
  });
});

describe('SsoCallback (SAML)', () => {
  it('redeems the handoff with this tab\'s flow secret, forgets it, and goes where the person was headed', () => {
    rememberFlow('flow-secret');
    sessionStorage.setItem(SSO_RETURN_KEY, '/jobs');
    const samlFinish = vi.fn(() => of({ status: 'SUCCESS', message: 'Login successful.', data: { accessToken: 'token' } }));
    const { navigate } = render({ saml: 'handoff-1' }, { samlFinish } as unknown as Partial<SignInApi>);
    expect(samlFinish).toHaveBeenCalledWith('handoff-1', 'flow-secret');
    expect(sessionStorage.getItem(SSO_FLOW_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/jobs', { replaceUrl: true });
  });

  it('shows an administrator\'s test result and signs nobody in', () => {
    rememberFlow('flow-secret');
    const samlFinish = vi.fn(() => of({ status: 'SUCCESS', message: 'The test sign-in worked.', data: {
      test: true, email: 'dana@hospital.example', name: 'Dana Reyes', outcome: 'EXISTING',
      explanation: 'dana@hospital.example would sign in as Dana Reyes.', attributes: 'emailaddress, displayname',
    } }));
    const { page, navigate } = render({ saml: 'handoff-2' }, { samlFinish } as unknown as Partial<SignInApi>);
    expect(page.querySelector('[data-test="saml-test-result"]')?.textContent).toContain('dana@hospital.example');
    expect(page.querySelector('[data-test="saml-test-outcome"]')?.textContent).toContain('would sign in as Dana Reyes');
    expect(page.textContent).toContain('Back to Security');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says why a refused answer was refused, with the attributes a test sign-in saw', () => {
    const samlFinish = vi.fn(() => of({ status: 'ERROR', message: 'That sign-in answer was already used.', data: { attributes: 'mail' } }));
    const { page, navigate } = render({ saml: 'handoff-3' }, { samlFinish } as unknown as Partial<SignInApi>);
    expect(samlFinish).toHaveBeenCalledWith('handoff-3', '');
    expect(page.querySelector('[data-test="sso-error"]')?.textContent).toContain('already used');
    expect(page.textContent).toContain('mail');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still finishes an OpenID Connect sign-in by its code and state', () => {
    const ssoCallback = vi.fn(() => of({ status: 'SUCCESS', message: 'Login successful.', data: { accessToken: 'token' } }));
    const samlFinish = vi.fn();
    const { navigate } = render({ code: 'c', state: 's' }, { ssoCallback, samlFinish } as unknown as Partial<SignInApi>);
    expect(ssoCallback).toHaveBeenCalledWith('c', 's');
    expect(samlFinish).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('says plainly when the server could not park the answer', () => {
    const { page } = render({ error: 'server_error' }, {});
    expect(page.querySelector('[data-test="sso-error"]')?.textContent).toContain('unavailable right now');
  });
});
