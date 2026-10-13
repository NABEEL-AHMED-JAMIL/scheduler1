import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { AccountSecurityApi, PasswordRules } from '../../account/account-security.api';
import { ResetPasswordData, ResetPasswordDialog } from './reset-password-dialog';
import { ResetPasswordNotice } from './reset-password-notice';

const RULES: PasswordRules = {
  passwordMinLength: 12, passwordRequireUpper: true, passwordRequireLower: true, passwordRequireDigit: true,
  passwordRequireSymbol: false, passwordHistory: 5, passwordMaxAgeDays: 0, lockoutThreshold: 5, lockoutMinutes: 15,
  idleMinutes: 30, requireMfa: false, rules: [],
};
const GOOD = 'Granite-Owl-7310';
const REUSED = 'You have used that password before. Choose one you have not used recently.';

function setUp(data: Partial<ResetPasswordData> = {}) {
  const answers = new Subject<any>();
  const put = vi.fn(() => answers);
  const ref = { close: vi.fn(), disableClose: false };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { appUserId: 4684, name: 'Pat Reset', tenantId: 2960, own: false, ...data } },
      { provide: DialogRef, useValue: ref },
      { provide: HttpClient, useValue: { put } },
      { provide: AccountSecurityApi, useValue: { rulesFor: () => of({ status: 'SUCCESS', message: '', data: RULES }) } },
    ],
  });
  const fixture = TestBed.createComponent(ResetPasswordDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (value: string) => {
    const input = el.querySelector<HTMLInputElement>('[data-test="reset-password-input"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, dialog: fixture.componentInstance, el, put, ref, answers, type };
}

/**
 * The administrator's reset dialog makes the call itself and stays open until the server accepts the password
 * (2026-10-13: a refused reset closed the dialog and looked done; the account never had the password passed on).
 */
describe('ResetPasswordDialog', () => {
  it('stays open on a refusal and shows the server\'s reason under the field, with the password kept', () => {
    const { fixture, dialog, el, put, ref, answers, type } = setUp();
    type(GOOD);
    dialog.submit();
    expect(put).toHaveBeenCalledWith(expect.stringContaining('/appUser.json/resetPassword'), { appUserId: 4684, password: GOOD });

    answers.error(new HttpErrorResponse({ status: 400, error: { status: 'ERROR', message: REUSED } }));
    fixture.detectChanges();

    expect(ref.close).not.toHaveBeenCalled();
    expect(dialog.saving()).toBe(false);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(REUSED);
    expect(dialog.form.getRawValue().password).toBe(GOOD);
    expect(ref.disableClose).toBe(false);
  });

  it('treats a 200 with status ERROR (a server from before refusals were 4xx) as the same refusal', () => {
    const { fixture, dialog, el, ref, answers, type } = setUp();
    type(GOOD);
    dialog.submit();
    answers.next({ status: 'ERROR', message: 'Choose a password that is not one of the most commonly used passwords.' });
    fixture.detectChanges();
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('most commonly used passwords');
  });

  it('clears the server\'s reason as soon as the password is edited', () => {
    const { fixture, dialog, el, answers, type } = setUp();
    type(GOOD);
    dialog.submit();
    answers.error(new HttpErrorResponse({ status: 400, error: { status: 'ERROR', message: REUSED } }));
    fixture.detectChanges();
    type(GOOD + '!');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('closes on success with whose it was and the password for "Copy password" -- somebody else\'s only', () => {
    const { dialog, ref, answers, type } = setUp();
    type(GOOD);
    dialog.submit();
    answers.next({ status: 'SUCCESS', message: 'Password reset for "pat".' });
    expect(ref.close).toHaveBeenCalledWith({ name: 'Pat Reset', own: false, password: GOOD });

    const own = setUp({ own: true });
    own.type(GOOD);
    own.dialog.submit();
    own.answers.next({ status: 'SUCCESS', message: 'Password reset.' });
    expect(own.ref.close).toHaveBeenCalledWith({ name: 'Pat Reset', own: true, password: null });
  });

  it('blocks a second submit while the first is in flight, and shows it is busy', () => {
    const { fixture, dialog, el, put, ref, type } = setUp();
    type(GOOD);
    dialog.submit();
    dialog.submit();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(put).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(el.textContent).toContain('Resetting…');
    expect(ref.disableClose).toBe(true);
    dialog.cancel();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('checks what it can before sending: too short or missing a character class never reaches the server', () => {
    const { fixture, dialog, el, put, ref, type } = setUp();
    type('short');
    dialog.submit();
    type('longbutlowercaseonly');
    dialog.submit();
    fixture.detectChanges();
    expect(put).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Still needs an upper-case letter.');
  });

  it('says that the common and recent-password rules are checked on save, in their words', () => {
    const { el } = setUp();
    expect(el.querySelector('[data-test="server-checked-note"]')?.textContent)
      .toContain('Not a common password, and not one of their recent ones');
    expect(el.querySelector('[data-test="server-checked-note"]')?.textContent).toContain('checked when you reset');
  });
});

describe('ResetPasswordNotice', () => {
  function notice(result: any) {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ResetPasswordNotice);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    return fixture;
  }

  it('says whose password was reset and that they choose a new one, without ever showing it', () => {
    const fixture = notice({ name: 'Pat Reset', own: false, password: GOOD });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Password reset for Pat Reset.');
    expect(text).toContain('They\'ll be asked to choose a new one at their next sign-in.');
    expect(text).not.toContain(GOOD);
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain(GOOD);
  });

  it('copies the password to the clipboard only', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = notice({ name: 'Pat Reset', own: false, password: GOOD });
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-test="copy-reset-password"]')!;
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(GOOD);
    expect(button.textContent).toContain('Copied');
  });

  it('offers no copy for the administrator\'s own reset', () => {
    const fixture = notice({ name: 'Me', own: true, password: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Your password has been reset.');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="copy-reset-password"]')).toBeNull();
  });
});
