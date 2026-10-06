import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { PublicForm, refusalOf } from './public-form';
import { PublicFormsApi } from './forms.service';
import { FormField, PublicFormView } from './forms.model';

/**
 * MIG-278, a form shared by link at /f/:token: the visitor sees the form and nothing of the workspace, sends it with the
 * visit's ticket and an empty honeypot, and a refused link is one plain sentence in place of the form.
 */
const FIELDS: FormField[] = [
  { key: 'visitor', label: 'Your name', type: 'text', required: true },
  { key: 'host', label: 'Who are you visiting', type: 'text', required: false },
];
const VIEW: PublicFormView = { name: 'Visitor check-in', description: 'Sign in at the front desk', version: 1, fields: FIELDS,
  requireSignIn: false, expiresAt: '2026-10-19T15:00:00Z', ticket: '1001.1700000000000.abc.sig' };

function render(opts: { open?: unknown; openFails?: { status: number; message?: string }; submit?: unknown;
  submitFails?: { status: number; message?: string }; signedIn?: boolean } = {}) {
  const api = {
    open: vi.fn(() => opts.openFails
      ? throwError(() => ({ status: opts.openFails!.status, error: { status: 'ERROR', message: opts.openFails!.message } }))
      : of(opts.open ?? { status: 'SUCCESS', message: 'Form fetched.', data: VIEW })),
    submit: vi.fn(() => opts.submitFails
      ? throwError(() => ({ status: opts.submitFails!.status, error: { status: 'ERROR', message: opts.submitFails!.message } }))
      : of(opts.submit ?? { status: 'SUCCESS', message: 'Thank you: your submission was received.' })),
    upload: vi.fn(() => of({ status: 'SUCCESS', message: 'Uploaded.', data: { uploadId: 9, name: 'a.pdf' } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: PublicFormsApi, useValue: api },
      { provide: ThemeService, useValue: { theme: signal('light'), toggle: vi.fn() } },
      { provide: AuthService, useValue: { user: signal(opts.signedIn ? { appUserId: 4597 } : null) } },
    ],
  });
  const fixture = TestBed.createComponent(PublicForm);
  fixture.componentRef.setInput('token', 'tok_abc');
  fixture.detectChanges();
  return { api, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Public form (share link)', () => {
  it('opens the link\'s form by its token and draws its fields, with when the link stops working', () => {
    const { api, el } = render();
    expect(api.open).toHaveBeenCalledWith('tok_abc');
    expect(el.querySelector('h1')?.textContent).toContain('Visitor check-in');
    const keys = Array.from(el.querySelectorAll('[data-field]')).map(e => e.getAttribute('data-field'));
    expect(keys).toEqual(['visitor', 'host']);
    expect(el.textContent).toContain('This link works until');
    expect(el.textContent).not.toContain('2026-10-19T');
  });

  it('marks what is missing and sends nothing', () => {
    const { api, screen } = render();
    screen.send();
    expect(api.submit).not.toHaveBeenCalled();
    expect(screen.problems()).toEqual({ visitor: 'Your name is required.' });
  });

  it('sends the answers with the visit\'s ticket and an empty honeypot, then thanks the visitor', () => {
    const { api, screen, fixture, el } = render();
    screen.change({ key: 'visitor', value: 'Pat Doe' });
    screen.send();
    expect(api.submit).toHaveBeenCalledWith('tok_abc', VIEW.ticket, { visitor: 'Pat Doe' }, '');
    fixture.detectChanges();
    expect(el.querySelector('[data-submitted]')?.textContent).toContain('Thank you: your submission was received.');
  });

  it('keeps the honeypot out of sight and out of the tab order', () => {
    const { el } = render();
    const trap = el.querySelector<HTMLInputElement>('#pub-website')!;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows Core\'s refusal at each field', () => {
    const { screen } = render({ submit: { status: 'ERROR', message: 'One answer needs attention.', data: { problems: { visitor: 'Too long.' } } } });
    screen.change({ key: 'visitor', value: 'Pat' });
    screen.send();
    expect(screen.problems()).toEqual({ visitor: 'Too long.' });
    expect(screen.message()).toBe('One answer needs attention.');
  });

  it('puts an expired link\'s sentence in place of the form', () => {
    const { el } = render({ openFails: { status: 410, message: 'This link has expired. Ask whoever sent it for a new one.' } });
    expect(el.querySelector('[data-refused] h1')?.textContent).toContain('This link no longer works');
    expect(el.textContent).toContain('This link has expired.');
    expect(el.querySelector('form')).toBeNull();
  });

  it('offers to sign in when the link needs it and nobody is signed in', () => {
    const { el } = render({ openFails: { status: 401, message: 'Sign in to the workspace that shared this form to fill it in.' } });
    const signIn = el.querySelector<HTMLAnchorElement>('[data-refused] a');
    expect(signIn?.textContent).toContain('Sign in');
    expect(signIn?.getAttribute('href')).toContain('returnUrl=%2Ff%2Ftok_abc');
  });

  it('a link that stops working while the page is open replaces the form', () => {
    const { screen, fixture, el } = render({ submitFails: { status: 410, message: 'This link has already been used.' } });
    screen.change({ key: 'visitor', value: 'Pat' });
    screen.send();
    fixture.detectChanges();
    expect(el.querySelector('[data-refused]')?.textContent).toContain('This link has already been used.');
  });

  it('turns each refusal status into a heading, with a sentence of its own when Core sent none', () => {
    expect(refusalOf(404, '').title).toBe('This link is not valid');
    expect(refusalOf(410, null).text).toContain('expired');
    expect(refusalOf(401, '').signIn).toBe(true);
    expect(refusalOf(403, '').signIn).toBe(true);
    expect(refusalOf(429, '').title).toBe('Too many tries');
    expect(refusalOf(0, '').title).toBe('Could not reach the server');
    expect(refusalOf(503, 'Try again in a minute.').text).toBe('Try again in a minute.');
  });
});
