import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Login } from './login';
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
    expect(page.querySelector('a[href="/docs"]')?.textContent).toContain('Setup guide');
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
