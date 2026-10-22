import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { NAV } from '../../core/nav/nav-tree';
import { Landing } from './landing';

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Landing], providers: [provideRouter([]),
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  const fixture = TestBed.createComponent(Landing);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * Owner 2026-10-12/20: sold as a healthcare ETL -- data in, an AI draft, a clinician's review, a signed report,
 * dashboards -- in wording the product backs today: the model drafts, a person decides, no compliance claim, synthetic
 * examples, and the preview domain-neutral (b97b1880).
 */
describe('The landing page', () => {
  it('leads with the flow from data to a signed report', () => {
    const page = mount();
    expect(page.querySelector('h1')!.textContent).toContain('signed');
    const steps = Array.from(page.querySelectorAll('[data-test="landing-flow"] h3')).map(h => h.textContent!.trim());
    expect(steps).toEqual(['Data in', 'AI draft', 'Clinician review', 'Signed report', 'Dashboards']);
  });

  it('keeps its claims safe: a draft for a person, synthetic examples, no compliance claim', () => {
    const text = mount().textContent ?? '';
    expect(text).not.toMatch(/HIPAA/i);
    expect(text).not.toMatch(/\bcompliant\b(?! with any law)/i);
    expect(text).toContain('does not by itself make a workspace compliant with any law or standard');
    expect(text).toContain('synthetic');
    expect(text).toContain('draft');
    expect(text).not.toMatch(/claims|reinsurance|catastrophe/i);
  });

  it('says it works for more than clinical data', () => {
    expect(mount().textContent).toContain('not only clinical data');
  });

  it('shows a preview whose tabs are the menu\'s own names, with neutral rows', () => {
    const page = mount();
    const preview = page.querySelector('app-console-preview')!;
    const tabs = Array.from(preview.querySelectorAll('button.tab')).map(b => b.textContent!.trim());
    expect(tabs).toEqual(['Home', 'Runs', 'Review', 'Reports']);
    const names = new Set(NAV.flatMap(i => [i.label, ...(i.children ?? []).map(c => c.label)]));
    for (const tab of tabs) expect(names.has(tab), tab).toBe(true);
    expect(preview.textContent).not.toMatch(/patient|clinic|wound|x-ray|claims/i);
  });

  it('links to the guide, signing in and asking for a workspace', () => {
    const hrefs = Array.from(mount().querySelectorAll('a')).map(a => a.getAttribute('href'));
    for (const href of ['/docs', '/login', '/request-workspace']) expect(hrefs, href).toContain(href);
  });
});
