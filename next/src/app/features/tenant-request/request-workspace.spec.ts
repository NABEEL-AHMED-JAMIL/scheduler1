import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RequestWorkspace } from './request-workspace';
import { ThemeService } from '../../core/theme.service';

/**
 * The success card said "Thank you -- your request has been recorded" over a server message that
 * says the same, and an over-long field went to the server and came back as a generic 500.
 */
function mount() {
  const post = vi.fn(() => of({ status: 'SUCCESS', message: 'Thank you. We have recorded your request.' }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RequestWorkspace], providers: [provideRouter([]),
    { provide: HttpClient, useValue: { post } },
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  const fixture = TestBed.createComponent(RequestWorkspace);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, post };
}

describe('RequestWorkspace', () => {
  it('heads the acknowledgement plainly instead of repeating it', () => {
    const { fixture, component, el } = mount();
    component.form.setValue({ organisationName: 'Northwind', contactName: 'Ada', contactEmail: 'ada@example.com', purpose: '' });
    component.submit();
    fixture.detectChanges();
    expect(el.querySelector('h1')!.textContent!.trim()).toBe('Request received');
    expect(el.textContent).toContain('We have recorded your request.');
  });

  it('refuses a field over 255 characters before sending, and says so', () => {
    const { fixture, component, el, post } = mount();
    component.form.setValue({ organisationName: 'N'.repeat(256), contactName: 'Ada', contactEmail: 'ada@example.com', purpose: '' });
    component.submit();
    fixture.detectChanges();
    expect(post).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Keep this under 255 characters.');
    expect(el.querySelector('#organisationName')!.getAttribute('maxlength')).toBe('255');
    expect(el.querySelector('#contactName')!.getAttribute('maxlength')).toBe('255');
    expect(el.querySelector('#contactEmail')!.getAttribute('maxlength')).toBe('255');
  });

  it('UX2: sits on the front door\'s hero, the form raised on a card beside a short value line, with a proper footer', () => {
    const { el } = mount();
    const hero = el.querySelector('.hero.request-hero')!;
    expect(hero).not.toBeNull();
    expect(hero.querySelector('app-brand-mark')).not.toBeNull();
    expect(hero.querySelector('h1')!.textContent!.trim()).toBe('Request a workspace');
    const card = hero.querySelector('.card.request-card')!;
    expect([...card.querySelectorAll('input, textarea')].map(c => c.id)).toEqual(['organisationName', 'contactName', 'contactEmail', 'purpose']);
    expect(card.querySelector('button[type="submit"]')!.textContent).toContain('Send request');
    expect(hero.querySelectorAll('ul li').length).toBe(3);
    const footer = [...el.querySelectorAll('footer a')].map(a => a.getAttribute('href'));
    expect(footer).toEqual(['/', '/docs', '/login']);
  });

  it('UX2: keeps the rules as they were -- required fields marked and nothing sent while one is empty', () => {
    const { fixture, component, el, post } = mount();
    component.submit();
    fixture.detectChanges();
    expect(post).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Check the highlighted fields.');
    expect(el.textContent).toContain('Organisation is required');
    expect(el.textContent).toContain('Your email is required');
  });

  it('UX2: gives every box an example placeholder, keeping its label and the note it is described by', () => {
    const { el } = mount();
    const shown = Object.fromEntries([...el.querySelectorAll<HTMLInputElement>('input, textarea')].map(c => [c.id, c.getAttribute('placeholder')]));
    expect(shown).toEqual({
      organisationName: 'e.g. Summit Valley Health System',
      contactName: 'e.g. Jordan Lee',
      contactEmail: 'name@yourcompany.com',
      purpose: 'e.g. Read referral faxes and send summaries to our EHR',
    });
    expect(el.querySelector('label[for="organisationName"]')!.textContent).toContain('Organisation');
    expect(el.querySelector('label[for="contactName"]')!.textContent).toContain('Your name');
    expect(el.querySelector('label[for="contactEmail"]')!.textContent).toContain('Your email');
    expect(el.querySelector('label[for="purpose"]')!.textContent).toContain('What do you need it for?');
    for (const id of ['organisationName', 'contactEmail', 'purpose']) {
      const note = el.querySelector('#' + el.querySelector('#' + id)!.getAttribute('aria-describedby'))!;
      expect(note.classList.contains('field-note')).toBe(true);
    }
  });
});
