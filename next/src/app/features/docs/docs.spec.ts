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
 * "Reports" menu that is Operations → Reports -- since MIG-246 / MIG-253, Pipelines → Run analytics.
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

  it('names where Run analytics lives today', () => {
    expect(mount().textContent).toContain('Run & review › Runs');
    expect(mount().textContent).not.toContain('→ Reports');
  });
});

/**
 * Owner 2026-10-13: the guide is rewritten for the current product -- the menu groups and tab hubs, the main flow from
 * getting data in to billing, the Review home, roles -- with healthcare-safe wording and links into the console.
 */
describe('Docs for the current product', () => {
  it('follows the main flow, in the menu\'s order', () => {
    const titles = Array.from(mount().querySelectorAll('main h2[id]')).map(h => h.id);
    expect(titles).toEqual(['start', 'people', 'data-in', 'build', 'run', 'review', 'results', 'monitor', 'billing', 'health-data', 'reference']);
  });

  it('never names the old menus or calls a pipeline a task or a schedule a job', () => {
    const text = mount().textContent ?? '';
    for (const gone of ['Operations', 'Source Jobs', 'Source Tasks', 'Configuration →', 'Assistants →', 'Review inbox', 'Task inbox']) {
      expect(text, gone).not.toContain(gone);
    }
    expect(text).not.toMatch(/\b(a|the|each) (job|task)\b/i);
  });

  it('sends the reader to Review, its tabs and bulk review', () => {
    const page = mount();
    const review = page.querySelector('#review')!.closest('section')!;
    const links = Array.from(review.querySelectorAll('[data-test="doc-where"] a')).map(a => a.getAttribute('href'));
    expect(links).toEqual(['/review', '/review/approvals', '/review/runs', '/review/documents']);
    expect(review.textContent).toContain('decide several at once');
  });

  it('maps the menu from its own tree, the Review hub and its tabs included', () => {
    const rows = Array.from(mount().querySelectorAll('[data-test="doc-menu"] tbody tr'))
      .map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent!.trim()).join(' | '));
    expect(rows).toContain('Run & review | Review | All waiting, Approvals, Runs, Documents');
    expect(rows.some(r => r.includes('My requests'))).toBe(false);
  });

  it('keeps healthcare wording safe: synthetic examples, and no claim of compliance', () => {
    const text = mount().textContent ?? '';
    expect(text).toContain('synthetic');
    expect(text).not.toMatch(/HIPAA[- ]compliant|compliant with HIPAA/i);
    expect(text).toContain('does not by itself make a workspace compliant');
  });
});
