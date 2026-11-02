import type { TemplateFeatures } from './report-library.api';
import { StarterRow, TemplateRow } from './report-studio.model';

/**
 * The templates gallery's rules (reports redesign, owner 2026-11-02), kept apart from the screen so they are tested on
 * their own: a workspace has tens of templates, so all of them are read once and the facets, their counts, the
 * grouping by category and the sort are worked out here.
 *
 * Facets: within a group the ticked options are either-or; groups combine. A count says how many templates the option
 * would show with every other group as it is (its own group left out), the way the library's facets count. Test
 * templates (tag "test") and the platform's starters are hidden until ticked under Hidden.
 */

export type StatusFacet = 'published' | 'draftOnly' | 'hasDraft' | 'archived';
export type HasFacet = 'approval' | 'qr' | 'charts';
export type GallerySort = 'name' | 'used' | 'changed';

export interface GalleryFilters {
  q: string;
  status: StatusFacet[];
  category: string[];
  has: HasFacet[];
  /** Show the test templates (tag "test"). */
  tests: boolean;
  /** Show the platform's starters, in a group of their own after the templates. */
  starters: boolean;
}

export const NO_FILTERS: GalleryFilters = { q: '', status: [], category: [], has: [], tests: false, starters: false };

export const STATUS_WORDS: Record<StatusFacet, string> = {
  published: 'Published', draftOnly: 'Draft only', hasDraft: 'Has a draft', archived: 'Archived',
};
export const HAS_WORDS: Record<HasFacet, string> = { approval: 'Approval and signature', qr: 'QR verify', charts: 'Charts' };
export const STATUS_ORDER: StatusFacet[] = ['published', 'draftOnly', 'hasDraft', 'archived'];
export const HAS_ORDER: HasFacet[] = ['approval', 'qr', 'charts'];
/** What a template without a category is filed under. */
export const NO_CATEGORY = 'No category';

export interface FacetCount<T extends string = string> { value: T; label: string; count: number; }
export interface GalleryCounts {
  status: FacetCount<StatusFacet>[];
  category: FacetCount[];
  has: FacetCount<HasFacet>[];
  tests: number;
  starters: number;
}

export interface CategoryGroup { category: string; label: string; templates: TemplateRow[]; }

/** Whether a template is in a status option. An archived template is only "Archived"; "Has a draft" is a published one with a draft. */
export function inStatus(t: TemplateRow, s: StatusFacet): boolean {
  const archived = t.status === 'ARCHIVED';
  switch (s) {
    case 'archived': return archived;
    case 'published': return !archived && !!t.currentPublishedVersion;
    case 'draftOnly': return !archived && !t.currentPublishedVersion;
    case 'hasDraft': return !archived && !!t.currentPublishedVersion && t.hasDraft;
  }
}

export function hasFeature(f: TemplateFeatures | null | undefined, h: HasFacet): boolean {
  if (!f) return false;
  switch (h) {
    case 'approval': return f.approvals > 0 || f.signature;
    case 'qr': return f.qr;
    case 'charts': return f.charts > 0;
  }
}

export function isTest(t: TemplateRow): boolean {
  return t.test === true || (t.tags ?? []).includes('test');
}

function text(q: string, values: (string | null | undefined)[]): boolean {
  const n = q.trim().toLowerCase();
  return !n || values.some(v => (v ?? '').toLowerCase().includes(n));
}

export function searchMatches(t: TemplateRow, q: string): boolean {
  return text(q, [t.name, t.description, t.category, ...(t.tags ?? [])]);
}

type Group = 'status' | 'category' | 'has' | 'tests';

/** Whether a template passes the filters, leaving one group out (for that group's counts). */
export function templateMatches(t: TemplateRow, f: GalleryFilters, skip?: Group): boolean {
  if (!searchMatches(t, f.q)) return false;
  if (skip !== 'tests' && !f.tests && isTest(t)) return false;
  if (skip !== 'status') {
    // Nothing ticked: everything but the archived ones.
    if (f.status.length ? !f.status.some(s => inStatus(t, s)) : t.status === 'ARCHIVED') return false;
  }
  if (skip !== 'category' && f.category.length && !f.category.includes(t.category ?? '')) return false;
  if (skip !== 'has' && f.has.length && !f.has.some(h => hasFeature(t.features, h))) return false;
  return true;
}

/** A starter shows when Starters is ticked, the search and the category let it through, and no status or "has" is picked. */
export function starterMatches(s: StarterRow, f: GalleryFilters, skip?: Group): boolean {
  if (skip !== 'status' && f.status.length) return false;
  if (skip !== 'has' && f.has.length) return false;
  if (skip !== 'category' && f.category.length && !f.category.includes(s.category ?? '')) return false;
  return text(f.q, [s.name, s.description, s.category]);
}

export function visibleTemplates(rows: TemplateRow[], f: GalleryFilters): TemplateRow[] {
  return rows.filter(t => templateMatches(t, f));
}

export function visibleStarters(starters: StarterRow[], f: GalleryFilters): StarterRow[] {
  return f.starters ? starters.filter(s => starterMatches(s, f)) : [];
}

/** Each option's count with the other groups applied (see the file's note). Categories come from the data, by count. */
export function facetCounts(rows: TemplateRow[], starters: StarterRow[], f: GalleryFilters): GalleryCounts {
  const byStatus = rows.filter(t => templateMatches(t, f, 'status'));
  const byCategory = rows.filter(t => templateMatches(t, f, 'category'));
  const byHas = rows.filter(t => templateMatches(t, f, 'has'));
  const categories = new Map<string, number>(f.category.map(c => [c, 0]));
  for (const t of byCategory) categories.set(t.category ?? '', (categories.get(t.category ?? '') ?? 0) + 1);
  if (f.starters) for (const s of starters) if (starterMatches(s, f, 'category')) categories.set(s.category ?? '', (categories.get(s.category ?? '') ?? 0) + 1);
  // A ticked category stays in the list even when nothing matches it any more, so it can be unticked.
  const category = [...categories.entries()]
    .filter(([c, n]) => n > 0 || f.category.includes(c))
    .map(([value, count]) => ({ value, label: value || NO_CATEGORY, count }))
    .sort((a, b) => b.count - a.count || categoryOrder(a.value, b.value));
  return {
    status: STATUS_ORDER.map(s => ({ value: s, label: STATUS_WORDS[s], count: byStatus.filter(t => inStatus(t, s)).length })),
    category,
    has: HAS_ORDER.map(h => ({ value: h, label: HAS_WORDS[h], count: byHas.filter(t => hasFeature(t.features, h)).length })),
    tests: rows.filter(t => isTest(t) && templateMatches(t, f, 'tests')).length,
    starters: starters.filter(s => starterMatches(s, f)).length,
  };
}

/** Category names A to Z, "no category" last. */
function categoryOrder(a: string, b: string): number {
  if (!a !== !b) return a ? -1 : 1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** The visible templates (already sorted) by category: the biggest group first, then A to Z, "No category" last. */
export function groupByCategory(sorted: TemplateRow[]): CategoryGroup[] {
  const groups = new Map<string, TemplateRow[]>();
  for (const t of sorted) {
    const c = t.category ?? '';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(t);
  }
  return [...groups.entries()]
    .map(([category, templates]) => ({ category, label: category || NO_CATEGORY, templates }))
    .sort((a, b) => (!a.category !== !b.category ? (a.category ? -1 : 1) : b.templates.length - a.templates.length
      || categoryOrder(a.category, b.category)));
}

function time(v: string | null | undefined): number {
  const n = v ? Date.parse(v) : NaN;
  return Number.isNaN(n) ? -Infinity : n;
}

/**
 * The gallery's three orders: Name A to Z; Most used (reports made, then the newest report, then name); Recently changed
 * (newest change first, then name). Stable, and the same in the cards and the table.
 */
export function sortTemplates(rows: TemplateRow[], by: GallerySort, direction: 'asc' | 'desc' = by === 'name' ? 'asc' : 'desc'): TemplateRow[] {
  const name = (a: TemplateRow, b: TemplateRow) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  const sign = direction === 'asc' ? 1 : -1;
  const cmp: (a: TemplateRow, b: TemplateRow) => number = by === 'name' ? (a, b) => sign * name(a, b)
    : by === 'used' ? (a, b) => sign * ((a.reportCount ?? 0) - (b.reportCount ?? 0) || time(a.lastReportAt) - time(b.lastReportAt)) || name(a, b)
    : (a, b) => sign * (time(a.updatedAt) - time(b.updatedAt)) || name(a, b);
  return [...rows].sort(cmp);
}

/** What a QR code encodes, in words. */
export function qrWord(content: string | null | undefined): string {
  switch (content) {
    case 'verifyLink': return 'verify link';
    case 'reportId': return 'the report id';
    case 'binding': return 'a value from the data';
    case 'text': return 'fixed text';
    default: return content ? content : 'yes';
  }
}

export interface FeatureChip { icon: string; label: string; }

/** What a template has, as the card's chips: approvers, a signature, QR, charts, images, conditional, repeated sections, a stamp. */
export function featureChips(f: TemplateFeatures | null | undefined): FeatureChip[] {
  if (!f) return [];
  const chips: FeatureChip[] = [];
  const n = (count: number, one: string, many: string) => `${count > 1 ? count + ' ' : ''}${count > 1 ? many : one}`;
  if (f.approvals > 0) chips.push({ icon: 'sign', label: `${f.approvals} approver${f.approvals === 1 ? '' : 's'}` });
  else if (f.signature) chips.push({ icon: 'sign', label: 'signature' });
  if (f.qr) chips.push({ icon: 'qr', label: 'QR' });
  if (f.charts > 0) chips.push({ icon: 'chart', label: n(f.charts, 'chart', 'charts') });
  if (f.images > 0) chips.push({ icon: 'image', label: n(f.images, 'image', 'images') });
  if (f.conditional) chips.push({ icon: 'filter', label: 'conditional' });
  if (f.repeat) chips.push({ icon: 'layers', label: 'repeats' });
  if (f.stamp) chips.push({ icon: 'checkCircle', label: 'stamp' });
  return chips;
}

/** The tags with "test" added or taken away, the others kept as they are. */
export function withTestTag(tags: string[] | null | undefined, on: boolean): string[] {
  const rest = (tags ?? []).filter(t => t !== 'test');
  return on ? [...rest, 'test'] : rest;
}
