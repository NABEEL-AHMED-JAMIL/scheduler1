import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ThemeService } from '../../core/theme.service';
import { Docs, roleOnly } from './docs';
import { AuthService } from '../../core/auth/auth.service';
import { NAV, NavViewer, entryVisible } from '../../core/nav/nav-tree';
import { NavAccess } from '../../core/nav/nav-access';
import { HelpContent, HelpData, search } from './help-content';

/**
 * The help centre (owner 2026-10-26: "a nice shell around almost no content"), against a small content of its own so
 * each behaviour is pinned: the front grouped by the book's parts, a topic page with Start here, what you can do and its
 * questions, an article with its who and where, a whole chapter, search over the body, the tab's title, older addresses,
 * and a member offered only the topics their menu opens. help-content.spec.ts checks the real content.
 */
const DATA: HelpData = {
  figures: { 'rs-shot': [960, 540] },
  whatsNew: [{ date: '2026-10-26', title: 'Report designer', article: 'rs-designer', text: 'New.' }],
  topics: [
    { id: 'getting-started', title: 'Getting started', chapter: 1, part: 'Part I · Start here', icon: 'zap', blurb: 'Sign in.', paths: [],
      sections: ['Start here'], summary: 'Where everyone starts.', start: [], faq: [], related: [], articles: ['gs-sign-in', 'sec-managed'] },
    { id: 'report-studio', title: 'Report Studio', chapter: 13, part: 'Part VI · See results', icon: 'template', blurb: 'Reports.',
      paths: ['/reports/overview'], sections: ['Get started', 'Design'], summary: 'Design **once**, sign every version.',
      start: [{ title: 'Lay it out', article: 'rs-designer', text: 'Use the designer.', figure: 'rs-shot' }],
      faq: [{ q: 'Why can\'t I approve my own report?', md: 'Someone else approves it. See [the designer](#rs-designer).' }],
      related: ['getting-started'], articles: ['rs-overview', 'rs-designer'] },
    { id: 'billing', title: 'Billing', chapter: 16, part: 'Part VII · Administer', icon: 'card', blurb: 'Bills.', paths: ['/billing'],
      sections: ['Usage'], summary: 'Costs.', start: [], faq: [], related: [], articles: ['bill-usage'] },
  ],
  articles: [
    { id: 'gs-sign-in', topic: 'getting-started', section: 'Start here', title: 'Sign in', summary: 'Your first sign-in.', minutes: 1,
      aliases: ['start'], popular: 'Sign in for the first time', md: 'Sign in with the password that works once.\n\n## Steps\n1. Open **Sign in**.\n\n## The menu\n<!-- widget: menu-map -->\n' },
    { id: 'sec-managed', topic: 'getting-started', section: 'Start here', title: 'The managed service', summary: 'Our team builds for you.', minutes: 1,
      where: [{ label: 'Administration › Activity', path: '/administration/team-activity' }], md: 'What changes.\n' },
    { id: 'rs-overview', topic: 'report-studio', section: 'Get started', title: 'Report Studio at a glance', summary: 'The tabs.', minutes: 2,
      aliases: ['reports'], where: [{ label: 'Reports › Overview', path: '/reports/overview' }], related: ['rs-designer'],
      md: 'Report Studio turns data into reports.\n\n## The workflow\n1. Make a template.\n\n> **Tip:** Keep a test sample.\n\n```A placeholder\n{{report.period}}\n```\n' },
    { id: 'rs-designer', topic: 'report-studio', section: 'Design', title: 'The designer', summary: 'Lay out a template.', minutes: 3,
      who: 'Anyone with Report templates', md: 'Drag components.\n\n## Watermarks\nA CONFIDENTIAL watermark prints under the content.\n\n![The designer](rs-shot "The designer")\n\n![Not taken](missing-shot)\n' },
    { id: 'bill-usage', topic: 'billing', section: 'Usage', title: 'How usage is counted', summary: 'Meters.', minutes: 1,
      where: [{ label: 'Billing', path: '/billing/usage' }], md: 'Every meter.\n' },
  ],
};

let fixture: ComponentFixture<Docs>;

async function mount(hash = '', signedIn = false, viewer?: NavViewer) {
  TestBed.resetTestingModule();
  history.replaceState(null, '', '/docs' + (hash ? '#' + hash : ''));
  const seen: NavViewer = viewer ?? { canOpen: () => true, isAdmin: true, isPlatform: false, showTeam: false };
  TestBed.configureTestingModule({ imports: [Docs], providers: [provideRouter([]),
    { provide: AuthService, useValue: { isLoggedIn: signal(signedIn) } },
    { provide: NavAccess, useValue: { visible: (gate: Parameters<typeof entryVisible>[0]) => entryVisible(gate, seen) } },
    { provide: HelpContent, useValue: { load: () => Promise.resolve(DATA) } },
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  fixture = TestBed.createComponent(Docs);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise(r => setTimeout(r));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const click = (el: Element) => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); fixture.detectChanges(); };

describe('The help centre\'s front', () => {
  it('lists the topics in the book\'s order, each with its chapter, its first articles and its count', async () => {
    const page = await mount();
    expect([...page.querySelectorAll('[data-topic]')].map(h => h.getAttribute('data-topic'))).toEqual(['getting-started', 'report-studio', 'billing']);
    expect(page.querySelector('[data-topic="report-studio"]')!.textContent).toContain('Chapter 13 · See results');
    const rs = page.querySelector('[data-topic="report-studio"]')!;
    expect(rs.textContent).toContain('Report Studio at a glance');
    expect(rs.querySelector('[data-test="topic-count"]')!.textContent).toContain('All 2 articles');
    expect(page.querySelector('[data-test="doc-howto"]')!.textContent).toContain('Sign in for the first time');
    expect(TestBed.inject(Title).getTitle()).toBe('Help · ETL Console');
  });

  it('offers a member only the topics for pages their menu opens; a visitor sees them all', async () => {
    const member: NavViewer = { canOpen: k => k === 'report-studio', isAdmin: false, isPlatform: false, showTeam: false };
    const page = await mount('', true, member);
    expect(page.querySelector('[data-topic="report-studio"]')).not.toBeNull();
    expect(page.querySelector('[data-topic="billing"]')).toBeNull();
    expect((await mount('')).querySelector('[data-topic="billing"]')).not.toBeNull();
  });
});

describe('The front\'s counts and lists', () => {
  it('counts every article the topics hold for this reader -- a managed-service article too, though Activity is in the menu only while managed', async () => {
    const admin: NavViewer = { canOpen: () => true, isAdmin: true, isPlatform: false, showTeam: false };
    const page = await mount('', true, admin);
    expect(page.querySelector('[data-test="doc-stats"] div:nth-child(2) dd')!.textContent!.trim()).toBe('5');
    expect(page.querySelector('[data-topic="getting-started"] [data-test="topic-count"]')!.textContent).toContain('All 2 articles');
  });

  it('never cuts a title mid-word: no truncated article links on the front', async () => {
    const page = await mount();
    expect(page.querySelectorAll('[data-topic] .truncate, [data-test="doc-build-list"] .truncate').length).toBe(0);
  });
});

describe('A topic page', () => {
  it('has its hero, Start here with pictures, what you can do by section, and its questions', async () => {
    const page = await mount('topic-report-studio');
    expect(page.querySelector('h1')!.textContent).toContain('Report Studio');
    expect(page.querySelector('[data-test="topic-hero"]')!.textContent).toContain('Chapter 13');
    expect(page.querySelector('[data-test="topic-hero"] strong')!.textContent).toBe('once');
    expect(page.querySelector('[data-test="topic-start"] img')!.getAttribute('src')).toBe('/help/img/rs-shot.sm.webp');
    expect([...page.querySelectorAll('[data-section]')].map(s => s.getAttribute('data-section'))).toEqual(['Get started', 'Design']);
    expect(page.querySelector('[data-test="topic-faq"] summary')!.textContent).toContain('approve my own report');
    expect(page.querySelector('[data-test="doc-chapter-link"]')!.getAttribute('href')).toBe('/docs#chapter-report-studio');
    expect(TestBed.inject(Title).getTitle()).toBe('Report Studio · Help · ETL Console');
  });

  it('reads the whole chapter on one page, in order, its articles as the contents', async () => {
    const page = await mount('chapter-report-studio');
    expect([...page.querySelectorAll('article[data-article]')].map(a => a.getAttribute('data-article'))).toEqual(['rs-overview', 'rs-designer']);
    expect([...page.querySelectorAll('nav[aria-label="Contents"] a')].map(a => a.textContent!.trim())).toEqual(['Report Studio at a glance', 'The designer']);
    // The articles' own parts go one level down.
    expect(page.querySelector('[id="rs-overview--the-workflow"]')!.tagName).toBe('H3');
  });
});

describe('An article', () => {
  it('names who and where, draws callouts, code to copy, figures at their size, and skips a figure not taken', async () => {
    let page = await mount('rs-overview');
    expect(page.querySelector('h1')!.textContent).toContain('Report Studio at a glance');
    expect(page.querySelector('[data-test="doc-where"] a')!.getAttribute('href')).toBe('/reports/overview');
    expect(page.querySelector('[data-test="doc-tip"]')!.textContent).toContain('Keep a test sample');
    expect(page.querySelector('[data-test="doc-code"] pre')!.textContent).toBe('{{report.period}}');
    expect(page.querySelector('[data-test="doc-related"]')!.textContent).toContain('The designer');
    expect(TestBed.inject(Title).getTitle()).toBe('Report Studio at a glance · Help · ETL Console');
    page = await mount('rs-designer');
    const img = page.querySelector<HTMLImageElement>('figure[data-figure="rs-shot"] img')!;
    expect([img.getAttribute('width'), img.getAttribute('height'), img.getAttribute('loading')]).toEqual(['960', '540', 'lazy']);
    expect(page.querySelector('figure[data-figure="missing-shot"]')).toBeNull();
    expect(page.querySelector('[data-test="doc-meta"]')!.textContent).toContain('Anyone with Report templates');
  });

  it('opens from an older address (the one-page guide\'s #reports, #start--steps) and lists the topic\'s sections on the left', async () => {
    let page = await mount('reports');
    expect(page.querySelector('h1')!.textContent).toContain('Report Studio at a glance');
    expect([...page.querySelectorAll('nav[aria-label="Articles"] a.nav-link')].map(a => a.textContent!.trim())).toContain('The designer');
    page = await mount('start--steps');
    expect(page.querySelector('h1')!.textContent).toContain('Sign in');
  });

  it('goes to the next article in the book\'s order, across topics, as a page of its own', async () => {
    const page = await mount('sec-managed');
    const next = page.querySelector('[data-test="doc-next"]')!;
    expect(next.textContent).toContain('Report Studio at a glance');
    click(next);
    expect(location.hash).toBe('#rs-overview');
    expect(page.querySelector('h1')!.textContent).toContain('Report Studio at a glance');
  });

  it('follows a link in the text to another article without leaving the help', async () => {
    const page = await mount('topic-report-studio');
    const link = page.querySelector<HTMLAnchorElement>('[data-test="topic-faq"] a[href="/docs#rs-designer"]')!;
    click(link);
    expect(location.hash).toBe('#rs-designer');
  });

  it('scrolls to a part in place and says which one is being read', async () => {
    const page = await mount('rs-overview');
    const link = page.querySelector<HTMLAnchorElement>('nav[aria-label="Contents"] a')!;
    const target = page.querySelector<HTMLElement>('[id="rs-overview--the-workflow"]')!;
    target.scrollIntoView = vi.fn();
    click(link);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(page.querySelector('nav[aria-label="Contents"] a[aria-current="location"]')).toBeTruthy();
  });
});

describe('Search', () => {
  it('finds an article by a word only its body has, marks it, and opens it at that part', async () => {
    const page = await mount();
    const input = page.querySelector<HTMLInputElement>('[data-test="doc-search"]')!;
    input.value = 'confidential watermark';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const hit = page.querySelector<HTMLAnchorElement>('[data-test="doc-hit"]')!;
    expect(hit.textContent).toContain('The designer');
    expect(hit.textContent).toContain('Watermarks');
    expect(hit.querySelector('mark.hit')!.textContent!.toLowerCase()).toBe('confidential');
    expect(hit.getAttribute('href')).toBe('/docs#rs-designer--watermarks');
    expect(TestBed.inject(Title).getTitle()).toBe('Search: confidential watermark · Help · ETL Console');
  });

  it('ranks a title match first and finds nothing for words no article has', () => {
    const hits = search(DATA.articles, 'designer');
    expect(hits[0].article.id).toBe('rs-designer');
    expect(search(DATA.articles, 'zzzz qqqq')).toEqual([]);
  });
});

describe('The live menu map (the Reference article\'s widget)', () => {
  it('maps the menu from its own tree, and links an entry only where the menu would show it', async () => {
    const page = await mount('gs-sign-in');
    const rows = [...page.querySelectorAll('[data-test="doc-menu"] tbody tr')];
    expect(rows.length).toBeGreaterThan(15);
    const workspaces = rows.find(r => r.textContent!.includes('Workspaces'))!;
    expect(workspaces.querySelector('[data-test="doc-menu-unlinked"]')).not.toBeNull();
    expect(workspaces.textContent).toContain('for platform administrators');
    expect(rows.find(r => r.textContent!.includes('Pipelines'))!.querySelector('a')).not.toBeNull();
    expect(roleOnly(NAV.find(n => n.label === 'Platform')!)).toBe('platform administrators');
  });
});

describe('The help\'s Markdown', () => {
  it('keeps a numbered list\'s numbers when it goes on after a table', async () => {
    const { parseHelp } = await import('./help-markdown');
    const lists = parseHelp('1. One\n2. Two\n\n| A |\n|---|\n| x |\n\n3. Three\n4. Four\n').filter(b => b.kind === 'ol');
    expect(lists.map(l => (l as { start?: number }).start ?? 1)).toEqual([1, 3]);
  });
});
