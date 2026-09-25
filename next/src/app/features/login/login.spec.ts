import { describe, it, expect } from 'vitest';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../core/auth/auth.service';

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
