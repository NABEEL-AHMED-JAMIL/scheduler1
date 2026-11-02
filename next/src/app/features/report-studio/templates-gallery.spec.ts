import { describe, it, expect } from 'vitest';
import type { TemplateFeatures } from './report-library.api';
import { StarterRow, TemplateRow } from './report-studio.model';
import {
  GalleryFilters, NO_FILTERS, facetCounts, featureChips, groupByCategory, inStatus, qrWord, sortTemplates, visibleStarters, visibleTemplates,
  withTestTag,
} from './templates-gallery';

/**
 * Reports redesign (owner 2026-11-02): the templates gallery's facets with counts, its grouping by category, its three
 * orders and "Mark as test" -- worked out in the browser from every template of the workspace.
 */
const NONE: TemplateFeatures = { approvals: 0, qr: false, charts: 0, images: 0, conditional: false, repeat: false, signature: false, stamp: false,
  confidentiality: false, components: 4 };
let n = 0;
const tpl = (over: Partial<TemplateRow> & { f?: Partial<TemplateFeatures> } = {}): TemplateRow => {
  const { f, ...rest } = over;
  n++;
  return { templateId: `T${n}`, tenantId: 1, name: `Template ${n}`, status: 'PUBLISHED', currentPublishedVersion: 1, hasDraft: false, origin: 'BLANK',
    tags: [], rowVersion: 1, updatedAt: '2026-10-20T10:00:00Z', reportCount: 0, lastReportAt: null, test: false, category: 'Clinical quality',
    features: { ...NONE, ...f }, ...rest } as TemplateRow;
};
const f = (over: Partial<GalleryFilters> = {}): GalleryFilters => ({ ...NO_FILTERS, ...over });
const starter = (key: string, category: string | null): StarterRow => ({ key, name: `Starter ${key}`, category, components: 5 });

describe('Templates gallery -- status', () => {
  it('an archived template is only Archived; Has a draft is a published one with a draft; Draft only was never published', () => {
    const archived = tpl({ status: 'ARCHIVED', currentPublishedVersion: 2 });
    const both = tpl({ hasDraft: true });
    const draftOnly = tpl({ status: 'DRAFT', currentPublishedVersion: null, hasDraft: true });
    expect(['published', 'draftOnly', 'hasDraft', 'archived'].filter(s => inStatus(archived, s as never))).toEqual(['archived']);
    expect(['published', 'draftOnly', 'hasDraft', 'archived'].filter(s => inStatus(both, s as never))).toEqual(['published', 'hasDraft']);
    expect(['published', 'draftOnly', 'hasDraft', 'archived'].filter(s => inStatus(draftOnly, s as never))).toEqual(['draftOnly']);
  });

  it('nothing ticked shows every template but the archived and the test ones', () => {
    const rows = [tpl(), tpl({ status: 'ARCHIVED' }), tpl({ test: true, tags: ['test'] })];
    expect(visibleTemplates(rows, f()).map(t => t.templateId)).toEqual([rows[0].templateId]);
    expect(visibleTemplates(rows, f({ status: ['archived'] })).map(t => t.templateId)).toEqual([rows[1].templateId]);
    expect(visibleTemplates(rows, f({ tests: true })).map(t => t.templateId)).toEqual([rows[0].templateId, rows[2].templateId]);
  });
});

describe('Templates gallery -- facet counts', () => {
  const qr = tpl({ name: 'Wound assessment', category: 'Clinical quality', f: { qr: true, approvals: 2 }, hasDraft: true });
  const charts = tpl({ name: 'Readmissions', category: 'Clinical quality', f: { charts: 3 } });
  const lab = tpl({ name: 'Lab panel', category: 'Laboratory', f: { signature: true }, tags: ['laboratory'] });
  const none = tpl({ name: 'Untitled', category: null, status: 'DRAFT', currentPublishedVersion: null, hasDraft: true });
  const old = tpl({ name: 'Old discharge', category: 'Laboratory', status: 'ARCHIVED' });
  const eval1 = tpl({ name: 'AI eval 1', category: null, test: true, tags: ['test'], f: { qr: true } });
  const rows = [qr, charts, lab, none, old, eval1];
  const starters = [starter('a', 'Data quality'), starter('b', 'Laboratory')];

  it('counts each option with the other groups applied and its own group left out', () => {
    const c = facetCounts(rows, starters, f());
    expect(c.status.map(s => [s.value, s.count])).toEqual([['published', 3], ['draftOnly', 1], ['hasDraft', 1], ['archived', 1]]);
    expect(c.category.map(x => [x.label, x.count])).toEqual([['Clinical quality', 2], ['Laboratory', 1], ['No category', 1]]);
    expect(c.has.map(h => [h.value, h.count])).toEqual([['approval', 2], ['qr', 1], ['charts', 1]]);
    expect(c.tests).toBe(1);
    expect(c.starters).toBe(2);

    // Ticking Laboratory narrows Status and Has, not Category itself; ticking Published narrows Category.
    const lab1 = facetCounts(rows, starters, f({ category: ['Laboratory'] }));
    expect(lab1.status.map(s => s.count)).toEqual([1, 0, 0, 1]);
    expect(lab1.has.map(h => h.count)).toEqual([1, 0, 0]);
    expect(lab1.category.map(x => x.count)).toEqual([2, 1, 1]);
    const pub = facetCounts(rows, starters, f({ status: ['published'], has: ['qr'] }));
    expect(pub.category.map(x => [x.label, x.count])).toEqual([['Clinical quality', 1]]);
    // A test template matching the rest is counted under Hidden even while hidden.
    expect(facetCounts(rows, starters, f({ has: ['qr'] })).tests).toBe(1);
  });

  it('options in one group are either-or; groups combine; the search reads name, description, category and tags', () => {
    expect(visibleTemplates(rows, f({ has: ['qr', 'charts'] })).map(t => t.name)).toEqual(['Wound assessment', 'Readmissions']);
    expect(visibleTemplates(rows, f({ has: ['approval'], category: ['Laboratory'] })).map(t => t.name)).toEqual(['Lab panel']);
    expect(visibleTemplates(rows, f({ q: 'LABORATORY' })).map(t => t.name)).toEqual(['Lab panel']);
    expect(visibleTemplates(rows, f({ category: [''] })).map(t => t.name)).toEqual(['Untitled']);
  });

  it('starters show only when ticked, follow the search and category, and step aside for a status or "has" pick', () => {
    expect(visibleStarters(starters, f())).toEqual([]);
    expect(visibleStarters(starters, f({ starters: true })).map(s => s.key)).toEqual(['a', 'b']);
    expect(visibleStarters(starters, f({ starters: true, category: ['Laboratory'] })).map(s => s.key)).toEqual(['b']);
    expect(visibleStarters(starters, f({ starters: true, status: ['published'] }))).toEqual([]);
    const c = facetCounts(rows, starters, f({ starters: true }));
    expect(c.category.find(x => x.value === 'Laboratory')!.count).toBe(2);
    expect(c.category.find(x => x.value === 'Data quality')!.count).toBe(1);
  });

  it('a ticked category stays listed even when nothing matches it any more', () => {
    const c = facetCounts(rows, starters, f({ category: ['Pharmacy'] }));
    expect(c.category.find(x => x.value === 'Pharmacy')).toEqual({ value: 'Pharmacy', label: 'Pharmacy', count: 0 });
  });
});

describe('Templates gallery -- grouping and order', () => {
  it('groups by category, the biggest first, then A to Z, "No category" last; the order inside is kept', () => {
    const rows = [tpl({ name: 'b', category: 'Imaging' }), tpl({ name: 'a', category: null }), tpl({ name: 'c', category: 'Clinical quality' }),
      tpl({ name: 'd', category: 'Imaging' }), tpl({ name: 'e', category: 'Anatomy' })];
    const groups = groupByCategory(rows);
    expect(groups.map(g => [g.label, g.templates.map(t => t.name)])).toEqual([
      ['Imaging', ['b', 'd']], ['Anatomy', ['e']], ['Clinical quality', ['c']], ['No category', ['a']]]);
  });

  it('Name A to Z; Most used by reports then the newest report; Recently changed newest first; ties by name', () => {
    const a = tpl({ name: 'Alpha', reportCount: 3, lastReportAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z' });
    const b = tpl({ name: 'beta', reportCount: 3, lastReportAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' });
    const c = tpl({ name: 'Gamma', reportCount: 12, lastReportAt: null, updatedAt: '2026-10-05T00:00:00Z' });
    const d = tpl({ name: 'Delta 10', reportCount: 0, updatedAt: null });
    const e = tpl({ name: 'Delta 9', reportCount: 0, updatedAt: null });
    const names = (r: TemplateRow[]) => r.map(t => t.name);
    expect(names(sortTemplates([c, b, a, d, e], 'name'))).toEqual(['Alpha', 'beta', 'Delta 9', 'Delta 10', 'Gamma']);
    expect(names(sortTemplates([a, b, c, d, e], 'name', 'desc'))).toEqual(['Gamma', 'Delta 10', 'Delta 9', 'beta', 'Alpha']);
    expect(names(sortTemplates([a, d, b, e, c], 'used'))).toEqual(['Gamma', 'beta', 'Alpha', 'Delta 9', 'Delta 10']);
    expect(names(sortTemplates([b, d, a, c, e], 'changed'))).toEqual(['Alpha', 'Gamma', 'beta', 'Delta 9', 'Delta 10']);
  });
});

describe('Templates gallery -- chips and tags', () => {
  it('says what a template has, approvers before a lone signature', () => {
    expect(featureChips({ ...NONE, approvals: 2, signature: true, qr: true, charts: 1, images: 3, conditional: true, repeat: true, stamp: true })
      .map(c => c.label)).toEqual(['2 approvers', 'QR', 'chart', '3 images', 'conditional', 'repeats', 'stamp']);
    expect(featureChips({ ...NONE, approvals: 1 }).map(c => c.label)).toEqual(['1 approver']);
    expect(featureChips({ ...NONE, signature: true, charts: 3 }).map(c => c.label)).toEqual(['signature', '3 charts']);
    expect(featureChips(null)).toEqual([]);
    expect(qrWord('verifyLink')).toBe('verify link');
    expect(qrWord('binding')).toBe('a value from the data');
  });

  it('Mark as test adds the tag once and keeps the others; Not a test takes only it away', () => {
    expect(withTestTag(['wound', 'QA'], true)).toEqual(['wound', 'QA', 'test']);
    expect(withTestTag(['test', 'wound'], true)).toEqual(['wound', 'test']);
    expect(withTestTag(['wound', 'test', 'QA'], false)).toEqual(['wound', 'QA']);
    expect(withTestTag(null, false)).toEqual([]);
  });
});
