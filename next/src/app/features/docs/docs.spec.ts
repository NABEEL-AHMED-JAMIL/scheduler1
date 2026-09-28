import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { Docs } from './docs';
import { AuthService } from '../../core/auth/auth.service';

function mount(signedIn = false) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Docs], providers: [provideRouter([]),
    { provide: AuthService, useValue: { isLoggedIn: signal(signedIn) } },
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  const fixture = TestBed.createComponent(Docs);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Docs contents', () => {
  /**
   * The links were bare href="#id". With <base href="/"> that resolves to "/#id", so every click
   * left the guide for the landing page.
   */
  it('scrolls to the section in place instead of leaving the guide', () => {
    const page = mount();
    const link = page.querySelector<HTMLAnchorElement>('nav[aria-label="Contents"] a')!;
    const id = link.getAttribute('href')!.replace(/^.*#/, '');
    const target = page.querySelector<HTMLElement>(`#${id}`)!;
    const scrolled = vi.fn();
    target.scrollIntoView = scrolled;

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(scrolled).toHaveBeenCalled();
  });

  it('says which section is being read, not only by colour', () => {
    const page = mount();
    expect(page.querySelector('nav[aria-label="Contents"] a[aria-current="location"]')).toBeTruthy();
  });
});

/**
 * The guide told signed-in people to sign in, showed no contents below 1024px, and sent them to a
 * "Reports" menu that is Operations → Reports.
 */
describe('Docs for someone already signed in, and on a narrow screen', () => {
  it('offers the way back to the console instead of Sign in', () => {
    const page = mount(true);
    expect(page.querySelector('a[href="/login"]')).toBeNull();
    expect(page.querySelectorAll('a[href="/dashboard"]').length).toBeGreaterThanOrEqual(2);
    expect(page.textContent).toContain('Back to console');
  });

  it('still offers Sign in to a visitor', () => {
    expect(mount(false).querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('shows the contents in a collapsible block below lg', () => {
    const page = mount();
    const details = page.querySelector<HTMLElement>('details.lg\\:hidden');
    expect(details).not.toBeNull();
    expect(details!.querySelectorAll('a[href^="#"]').length).toBe(page.querySelectorAll('nav[aria-label="Contents"] a').length);
  });

  it('names where Reports lives', () => {
    expect(mount().textContent).toContain('Operations → Reports');
  });
});
