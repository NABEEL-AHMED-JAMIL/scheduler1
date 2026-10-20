import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { Docs } from './docs';
import { AuthService } from '../../core/auth/auth.service';
import { NAV } from '../../core/nav/nav-tree';

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
    expect(titles).toEqual(['start', 'people', 'data-in', 'build', 'run', 'review', 'results', 'reports', 'monitor', 'billing', 'developers', 'health-data', 'reference']);
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

/**
 * 2026-10-20: the guide follows what shipped since -- Report Studio (phases 1 to 5), the pipeline's Generate report step,
 * Flow folding, the run's Outputs View, Forms' Rebuild dataset files, Cost & usage's parts, and the Developers pages --
 * in the console's own words, and every place it names is a menu entry, a tab, or a page beneath one.
 */
describe('Docs for what shipped by 2026-10-20', () => {
  const section = (page: HTMLElement, id: string) => page.querySelector(`#${id}`)!.closest('section')!;
  const where = (el: Element) => Array.from(el.querySelectorAll('[data-test="doc-where"] a')).map(a => a.getAttribute('href'));

  it('sends the reader to every tab of Reports, by the names the menu gives them', () => {
    const page = mount();
    const reports = section(page, 'reports');
    expect(where(reports)).toEqual(['/reports/overview', '/reports/templates', '/reports/library', '/reports/data', '/reports/assets']);
    const hub = NAV.flatMap(i => i.children ?? []).find(c => c.label === 'Reports')!;
    for (const tab of hub.tabs!) expect(reports.textContent, tab.label).toContain(tab.label);
    for (const words of ['Approve and sign', 'Verify signature', 'Void', 'Mark this version as COPY', 'Archive', 'Delete', 'Superseded',
      'Brand profile'.toLowerCase(), 'Signatures and stamps', 'watermark', 'QR codes', 'KPI tiles', 'Create report']) {
      expect(reports.textContent!.toLowerCase(), words).toContain(words.toLowerCase());
    }
  });

  it('names the pipeline\'s Generate report step, the Flow view\'s folding and the run\'s Outputs View', () => {
    const page = mount();
    const build = section(page, 'build').textContent!;
    expect(build).toContain('Generate report');
    expect(build).toContain('Design the report here');
    expect(build).toContain('Use a saved template');
    expect(build).toContain('Collapse all');
    expect(build).toContain('Work in this workspace');
    const run = section(page, 'run').textContent!;
    expect(run).toContain('Outputs');
    expect(run).toContain('View');
  });

  it('names the steps that work on files, and One file per row, by the names the step form gives them', () => {
    const build = section(mount(), 'build').textContent!;
    for (const words of ['Transcribe audio', 'Timestamps', 'Convert file', 'File key column', 'When a file fails', 'Save File',
      'Upload to bucket', 'One file per row', '{{file_stem}}-insight.json', 'JSON columns', 'Which objects', 'last_run',
      'The run\'s own files first', 'One report per row']) {
      expect(build, words).toContain(words);
    }
  });

  it('names Rebuild dataset files and Cost & usage\'s parts as the console does', () => {
    const page = mount();
    expect(section(page, 'data-in').textContent).toContain('Rebuild dataset files');
    const billing = section(page, 'billing').textContent!;
    for (const part of ['Cost by day', 'Cost by pipeline', 'By pipeline', 'By run', 'AI model calls', 'Line by line', 'Pricing rules']) {
      expect(billing, part).toContain(part);
    }
  });

  it('sends developers to API Clients and the Developer portal, and says the Reports library has no API yet', () => {
    const page = mount();
    const dev = section(page, 'developers');
    expect(where(dev)).toEqual(['/developers/api-clients', '/developers/portal']);
    expect(dev.textContent).toContain('600 calls a minute');
    expect(dev.textContent).toContain('no calls for the Reports library yet');
  });

  it('links only to places the menu has, or pages beneath them', () => {
    const paths = NAV.flatMap(i => [i.path, ...(i.tabs ?? []).map(t => t.path), ...(i.children ?? []).flatMap(c => [c.path, ...(c.tabs ?? []).map(t => t.path)])])
      .filter((p): p is string => !!p);
    const known = (href: string) => ['/request-workspace', '/account/security', '/notifications', '/pipelines/new'].includes(href)
      || paths.some(p => href === p || href.startsWith(p + '/'));
    const links = Array.from(mount().querySelectorAll('[data-test="doc-where"] a')).map(a => a.getAttribute('href')!);
    expect(links.filter(l => !known(l))).toEqual([]);
  });

  it('keeps its examples domain-neutral: no claims or reinsurance examples', () => {
    expect(mount().textContent).not.toMatch(/claims file|reinsurance/i);
  });
});
