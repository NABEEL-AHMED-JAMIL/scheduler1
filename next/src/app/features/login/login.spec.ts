import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../core/auth/auth.service';

/**
 * A session a password change signed out lands here, and the page says why -- otherwise the person
 * is simply looking at a sign-in form they did not ask for, with no idea their password is the
 * reason.
 */
function render(query: Record<string, string>): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Login],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { login: () => undefined } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const fixture = TestBed.createComponent(Login);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
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
