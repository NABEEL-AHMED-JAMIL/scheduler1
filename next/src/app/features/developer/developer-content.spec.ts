import { describe, it, expect } from 'vitest';
import { DOCS } from './developer-docs';
import { PORTAL, linkTarget } from './guide-markdown';
import { NAV } from '../../core/nav/nav-tree';

/**
 * The portal's content as a reader meets it (2026-10-20): the changelog reads newest first, every link between the
 * guides lands on a page the portal has, and the console paths the guides name are the menu's own.
 */
const DATED = /^## .*\((\d{4}-\d{2}-\d{2})\)/;

function links(markdown: string): string[] {
  return Array.from(markdown.replace(/```[\s\S]*?```/g, '').matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g), m => m[1]);
}

describe('The developer portal\'s changelog', () => {
  const headings = DOCS.changelog.split('\n').filter(line => line.startsWith('## '));

  it('dates every entry', () => {
    expect(headings.length).toBeGreaterThan(5);
    expect(headings.filter(h => !DATED.test(h))).toEqual([]);
  });

  it('lists the entries newest first', () => {
    const dates = headings.map(h => DATED.exec(h)![1]);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('lists the Generate report and Spring Boot 4.1.1 entries among the 2026-10-20 ones (newer entries may sit above them)', () => {
    const day = headings.filter(h => h.includes('(2026-10-20)'));
    expect(day.length).toBeGreaterThanOrEqual(2);
    expect(day.join('\n')).toMatch(/Generate report/);
    expect(day.join('\n')).toMatch(/Spring Boot 4\.1\.1/);
  });
});

describe('Links inside the developer portal', () => {
  const pages = new Set([PORTAL, `${PORTAL}/reference`, `${PORTAL}/changelog`, ...DOCS.guides.map(g => `${PORTAL}/guides/${g.slug}`)]);
  const sources = [
    ...DOCS.guides.map(g => ({ name: `guide ${g.slug}`, markdown: g.markdown })),
    { name: 'the changelog', markdown: DOCS.changelog },
  ];

  it('resolves every link a guide or the changelog makes to another portal page', () => {
    const broken: string[] = [];
    for (const { name, markdown } of sources) {
      for (const url of links(markdown)) {
        const target = linkTarget(url);
        if (target?.route?.startsWith(PORTAL) && !pages.has(target.route)) broken.push(`${name}: ${url}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has the sandbox and Generate report guides, each with a title and a summary', () => {
    for (const slug of ['sandbox', 'reports']) {
      const guide = DOCS.guides.find(g => g.slug === slug);
      expect(guide, slug).toBeTruthy();
      expect(guide!.title.length).toBeGreaterThan(3);
      expect(guide!.summary.length).toBeGreaterThan(20);
    }
  });

  it('says plainly that the Reports library has no API yet, and invents no call for it', () => {
    const reports = DOCS.guides.find(g => g.slug === 'reports')!.markdown;
    expect(reports).toContain('Not in the API yet');
    const paths = Object.keys(DOCS.spec.paths ?? {});
    expect(paths.filter(p => /report/i.test(p))).toEqual([]);
    for (const call of reports.matchAll(/`(GET|POST|PATCH|DELETE) (\/[^`\s]*)`/g)) {
      const path = call[2].replace(/\?.*$/, '');
      expect(paths, `${call[1]} ${path}`).toContain(path);
    }
  });

  it('names the console\'s pages as its menu does (Developers › API Clients, not Integration)', () => {
    const developers = NAV.flatMap(i => i.children ?? []).find(c => c.label === 'Developers')!;
    expect(developers.tabs!.map(t => t.label)).toContain('API Clients');
    for (const { name, markdown } of DOCS.guides.map(g => ({ name: g.slug, markdown: g.markdown }))) {
      expect(markdown, name).not.toContain('Integration ›');
    }
    expect(DOCS.guides.map(g => g.markdown).join('\n')).toContain('Developers › API Clients');
  });
});
