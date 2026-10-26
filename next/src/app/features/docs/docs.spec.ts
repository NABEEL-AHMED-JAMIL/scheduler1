import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { Docs } from './docs';
import { AuthService } from '../../core/auth/auth.service';
import { NAV, NavViewer, entryVisible } from '../../core/nav/nav-tree';
import { NavAccess } from '../../core/nav/nav-access';

/**
 * The guide at an address: by default the whole guide on one page (/docs#all), which reads as the one-page guide did;
 * '' is the help centre's front, an article's id that article.
 */
let fixture: ComponentFixture<Docs>;

function mount(signedIn = false, viewer?: NavViewer, hash = 'all') {
  TestBed.resetTestingModule();
  history.replaceState(null, '', '/docs' + (hash ? '#' + hash : ''));
  const seen: NavViewer = viewer ?? { canOpen: () => true, isAdmin: true, isPlatform: false, showTeam: false };
  TestBed.configureTestingModule({ imports: [Docs], providers: [provideRouter([]),
    { provide: AuthService, useValue: { isLoggedIn: signal(signedIn) } },
    // The menu's own rule (nav-tree's entryVisible), for the reader the test names.
    { provide: NavAccess, useValue: { visible: (gate: Parameters<typeof entryVisible>[0]) => entryVisible(gate, seen) } },
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  fixture = TestBed.createComponent(Docs);
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

  it('shows the contents in a collapsible block below 1440', () => {
    const page = mount();
    const details = page.querySelector<HTMLElement>('details.toc-fold');
    expect(details).not.toBeNull();
    expect(details!.querySelectorAll('a[href^="/docs#"]').length).toBe(page.querySelectorAll('nav[aria-label="Contents"] a').length);
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

  // 2026-10-20: the map linked "Platform" for everyone, so a workspace administrator (4640) landed on Not available.
  describe('links an entry only where the menu would show it', () => {
    const row = (page: HTMLElement, entry: string) => Array.from(page.querySelectorAll<HTMLElement>('[data-test="doc-menu"] tbody tr'))
      .find(r => r.querySelectorAll('td')[1]?.textContent?.trim().startsWith(entry))!;
    const link = (page: HTMLElement, entry: string) => row(page, entry).querySelector('a')?.getAttribute('href') ?? null;

    it('a workspace administrator: no link to Platform, which says whom it is for; their own pages linked', () => {
      const page = mount(true, { canOpen: () => true, isAdmin: true, isPlatform: false, showTeam: false });
      expect(link(page, 'Platform')).toBeNull();
      expect(row(page, 'Platform').textContent).toContain('(for platform administrators)');
      expect(link(page, 'Review')).toBe('/review');
      expect(link(page, 'Administration')).toBe('/administration');
    });

    it('a platform administrator: Platform linked', () => {
      expect(link(mount(true, { canOpen: () => true, isAdmin: true, isPlatform: true, showTeam: false }), 'Platform')).toBe('/platform');
    });

    it('a member: no link to an administrator\'s entry, nor to a page their access does not open', () => {
      const page = mount(true, { canOpen: key => key !== 'document-review' && key !== 'task-inbox', isAdmin: false, isPlatform: false, showTeam: false });
      expect(link(page, 'Platform')).toBeNull();
      expect(link(page, 'Review')).toBeNull();
      expect(row(page, 'Review').textContent).toContain('(not in your page access)');
    });

    it('signed out: every entry but the role-only ones', () => {
      const page = mount(false);
      expect(link(page, 'Platform')).toBeNull();
      expect(link(page, 'Review')).toBe('/review');
    });
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
    expect(where(reports)).toEqual(['/reports/overview', '/reports/templates', '/reports/library', '/reports/data', '/reports/assets', '/reports/settings']);
    const hub = NAV.flatMap(i => i.children ?? []).find(c => c.label === 'Reports')!;
    for (const tab of hub.tabs!) expect(reports.textContent, tab.label).toContain(tab.label);
    for (const words of ['Approve and sign', 'Verify signature', 'Void', 'Mark this version as COPY', 'Archive', 'Delete', 'Superseded',
      'Brand profile'.toLowerCase(), 'Signatures and stamps', 'watermark', 'QR codes', 'KPI tiles', 'Create report',
      // Phase 7: reviews in the Task inbox, the settings, retention.
      'Ask for approval', 'Review › Approvals', 'Two approvals', 'Publishing needs a second person', 'Removed by retention']) {
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

/**
 * Owner 2026-10-26 ("/docs looks too simple"): a help centre -- a search over every article, topic cards with their article
 * counts, popular how-tos and what is new; an article in two columns with its own contents, tips, notes and warnings,
 * samples to copy and the previous and next article -- showing a signed-in reader only what their menu opens.
 */
describe('Docs as a help centre', () => {
  const topics = (page: HTMLElement) => Array.from(page.querySelectorAll<HTMLElement>('[data-topic]')).map(t => t.dataset['topic']);
  const member = (closed: string[]): NavViewer => ({ canOpen: key => !closed.includes(key), isAdmin: false, isPlatform: false, showTeam: false });

  it('opens on the front: a search, the thirteen topics with their article counts, how-tos and what is new', () => {
    const page = mount(false, undefined, '');
    expect(page.querySelector('[data-test="doc-search"]')).not.toBeNull();
    expect(page.querySelector('h1')!.textContent).toContain('How can we help?');
    expect(topics(page)).toEqual(['getting-started', 'pipelines', 'triggers', 'runs', 'documents', 'forms', 'ai', 'report-studio',
      'dashboards', 'approvals', 'developers', 'billing', 'administration']);
    const counts = Array.from(page.querySelectorAll('[data-topic] [data-test="topic-count"]')).map(c => c.textContent!.trim());
    expect(counts[0]).toBe('2 articles');
    expect(counts[1]).toBe('1 article');
    expect(page.querySelectorAll('[data-test="doc-howto"]').length).toBeGreaterThanOrEqual(6);
    expect(page.querySelectorAll('[data-test="doc-new"]').length).toBeGreaterThanOrEqual(3);
    // The front is no article: none of the task headings is on it.
    expect(page.querySelector('#review')).toBeNull();
  });

  it('searches every article, marks the words found, and opens the article at the part they are in', () => {
    const page = mount(false, undefined, '');
    const box = page.querySelector<HTMLInputElement>('[data-test="doc-search"]')!;
    box.value = 'retry failed items';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const hits = Array.from(page.querySelectorAll<HTMLAnchorElement>('[data-test="doc-hit"]'));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].textContent).toContain('Run and schedule it');
    expect(hits[0].getAttribute('href')).toBe('/docs#run--steps');
    const marked = Array.from(hits[0].querySelectorAll('mark')).map(m => m.textContent!.toLowerCase());
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every(m => ['retry', 'failed', 'items'].includes(m))).toBe(true);
    hits[0].click();
    fixture.detectChanges();
    expect(location.hash).toBe('#run--steps');
    expect(page.querySelector('h1#run')).not.toBeNull();
    expect(page.querySelector('[data-test="doc-results"]')).toBeNull();
  });

  it('says when nothing matches, and the search can be cleared', () => {
    const page = mount(false, undefined, '');
    const box = page.querySelector<HTMLInputElement>('[data-test="doc-search"]')!;
    box.value = 'zzqx nothing';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.querySelector('[data-test="doc-results"]')!.textContent).toContain('Nothing matches');
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.includes('Clear search'))!.click();
    fixture.detectChanges();
    expect(page.querySelector('[data-test="doc-results"]')).toBeNull();
    expect(page.querySelectorAll('[data-topic]').length).toBe(13);
  });

  it('shows a member only the topics, how-tos and search hits for pages their menu opens', () => {
    const closed = ['report-studio', 'report-library', 'report-templates', 'report-generate', 'report-data', 'report-assets'];
    const page = mount(true, member(closed), '');
    const shown = topics(page);
    expect(shown).not.toContain('report-studio');
    expect(shown).not.toContain('billing');          // every Billing tab is an administrator's
    expect(shown).not.toContain('administration');   // so is Administration's
    expect(shown).toContain('getting-started');
    expect(shown).toContain('runs');
    const howTos = Array.from(page.querySelectorAll('[data-test="doc-howto"]')).map(a => a.textContent!.trim());
    expect(howTos).not.toContain('Approve and sign a report');
    // The whole guide leaves the reports article out too, and the article list beside it.
    const all = mount(true, member(closed));
    expect(all.querySelector('#reports')).toBeNull();
    expect(Array.from(all.querySelectorAll('nav[aria-label="Articles"] a')).map(a => a.textContent)).not.toContain('Make signed reports');
  });

  it('a workspace administrator and a signed-out reader see every topic', () => {
    expect(topics(mount(true, undefined, '')).length).toBe(13);
    expect(topics(mount(false, member(['tasks', 'jobs']), '')).length).toBe(13);
  });

  it('opens an article from its old one-page address, with its own contents and the previous and next article', () => {
    const page = mount(false, undefined, 'review');
    expect(page.querySelector('h1#review')!.textContent).toContain('Review and approve');
    expect(page.querySelectorAll('[data-article]').length).toBe(1);
    const contents = Array.from(page.querySelectorAll('nav[aria-label="Contents"] a')).map(a => a.getAttribute('href'));
    expect(contents).toEqual(['/docs#review--where', '/docs#review--steps', '/docs#review--know']);
    expect(page.querySelector('nav[aria-label="Contents"] a[aria-current="location"]')).not.toBeNull();
    expect(page.querySelector('[data-test="doc-prev"]')!.textContent).toContain('Run and schedule it');
    expect(page.querySelector('[data-test="doc-next"]')!.textContent).toContain('Read the results');
    // The Articles list marks the one open.
    expect(page.querySelector('nav[aria-label="Articles"] a[aria-current="page"]')!.textContent).toContain('Review and approve');
  });

  it('opens a part of an article (start--steps), and the first and last articles have one neighbour', () => {
    const first = mount(false, undefined, 'start--steps');
    expect(first.querySelector('h1#start')).not.toBeNull();
    expect(first.querySelector('#start--steps')).not.toBeNull();
    expect(first.querySelector('[data-test="doc-prev"]')).toBeNull();
    expect(first.querySelector('[data-test="doc-next"]')!.textContent).toContain('Add people');
    const last = mount(false, undefined, 'reference');
    expect(last.querySelector('[data-test="doc-menu"]')).not.toBeNull();
    expect(last.querySelector('[data-test="doc-next"]')).toBeNull();
  });

  it('marks tips and warnings as callouts', () => {
    expect(mount(false, undefined, 'people').querySelector('[data-test="doc-tip"]')!.textContent).toContain('at least two administrators');
    const reports = mount(false, undefined, 'reports');
    expect(reports.querySelector('[data-test="doc-warn"]')!.textContent).toContain('not that its content is right');
    expect(reports.querySelector('[data-test="doc-tip"]')!.textContent).toContain('delete several reports at once');
  });

  it('copies a sample as it is written, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    TestBed.resetTestingModule();
    history.replaceState(null, '', '/docs#developers');
    TestBed.configureTestingModule({ imports: [Docs], providers: [provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: signal(false) } },
      { provide: NavAccess, useValue: { visible: () => true } },
      { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
    const fixture = TestBed.createComponent(Docs);
    fixture.detectChanges();
    const code = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-test="doc-code"]')!;
    expect(code.querySelector('pre')!.textContent).toBe('POST /v1/pipelines/{id}/runs?wait=30s');
    code.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('POST /v1/pipelines/{id}/runs?wait=30s');
    fixture.detectChanges();
    expect(code.querySelector('button')!.textContent).toContain('Copied');
  });

  it('goes from the front to a topic and to an article as a page of its own', () => {
    TestBed.resetTestingModule();
    history.replaceState(null, '', '/docs');
    TestBed.configureTestingModule({ imports: [Docs], providers: [provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: signal(false) } },
      { provide: NavAccess, useValue: { visible: () => true } },
      { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
    const fixture = TestBed.createComponent(Docs);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLAnchorElement>('[data-topic="forms"]')!.click();
    fixture.detectChanges();
    expect(location.hash).toBe('#topic-forms');
    expect(page.querySelector('h1')!.textContent).toContain('Forms');
    page.querySelector<HTMLAnchorElement>('[data-test="topic-articles"] a')!.click();
    fixture.detectChanges();
    expect(location.hash).toBe('#data-in');
    expect(page.querySelector('h1#data-in')).not.toBeNull();
  });
});
