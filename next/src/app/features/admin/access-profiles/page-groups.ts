import { EDIT_OF, PAGE_LABELS, PageCatalogueEntry, PageKey, isPageKey } from '../../../core/auth/page-keys';
import { NAV, NavGate, NavViewer, entryVisible, visibleTabs } from '../../../core/nav/nav-tree';

/**
 * The page catalogue arranged the way the menu is (core/nav/nav-tree.ts), for the access-profile editor and the "what
 * they can see" previews (owner 2026-10-19 #3, #31): menu groups ("Get data in"), within them the entries and hubs
 * ("Connections"), and the pages they hold -- with a read/edit pair as one row. Pure, so it is tested with a catalogue of
 * any size.
 */

/** One row of the editor: a page, or a page and its editing half. */
export interface PageRow {
  key: PageKey;
  label: string;
  /** Where the page is on the menu: "Connections › Databases", every place it opens. */
  places: string[];
  /** The editing half of a read/edit split, when there is one. */
  edit?: { key: PageKey; label: string };
}

/** A menu group's rows, under its hubs and entries. */
export interface PageGroup {
  label: string;
  hubs: { label: string; rows: PageRow[] }[];
}

interface Place { group: string; hub: string; label: string }

/** Every place on the menu a page key opens, in menu order. */
export function placesOf(key: PageKey): Place[] {
  const out: Place[] = [];
  const holds = (gate: NavGate) => gate.pageKey === key || !!gate.pageKeys?.includes(key);
  for (const item of NAV) {
    for (const child of item.children ?? []) {
      if (holds(child)) out.push({ group: item.label, hub: child.label, label: child.label });
      for (const tab of child.tabs ?? []) if (holds(tab)) out.push({ group: item.label, hub: child.label, label: tab.label });
    }
    for (const tab of item.tabs ?? []) if (holds(tab)) out.push({ group: item.label, hub: item.label, label: tab.label });
  }
  return out;
}

/** The name a page goes by: the console's current one (PAGE_LABELS), else the catalogue's. */
export function pageLabel(page: PageCatalogueEntry): string {
  return isPageKey(page.key) ? PAGE_LABELS[page.key] : page.label;
}

/** The page a key is the editing half of, if any. */
export function editOf(page: PageCatalogueEntry): PageKey | undefined {
  return page.editOf ?? EDIT_OF[page.key];
}

/** The catalogue as the editor shows it: grouped by the menu, read/edit pairs joined, menu order kept. */
export function groupPages(pages: readonly PageCatalogueEntry[]): PageGroup[] {
  const keys = new Set(pages.map(p => p.key));
  const editors = new Map<PageKey, PageCatalogueEntry>();
  for (const page of pages) {
    const base = editOf(page);
    if (base && keys.has(base)) editors.set(base, page);
  }
  const groups: PageGroup[] = [];
  const groupOf = (label: string) => groups.find(g => g.label === label) ?? (groups.push({ label, hubs: [] }), groups[groups.length - 1]);
  for (const page of pages) {
    const base = editOf(page);
    if (base && keys.has(base)) continue;
    const places = placesOf(page.key);
    const first = places[0];
    const group = groupOf(first?.group ?? (page.section || 'Other pages'));
    const hubLabel = first?.hub ?? (page.section || 'Other pages');
    let hub = group.hubs.find(h => h.label === hubLabel);
    if (!hub) group.hubs.push(hub = { label: hubLabel, rows: [] });
    const editor = editors.get(page.key);
    hub.rows.push({
      key: page.key,
      label: pageLabel(page),
      places: places.map(p => (p.hub === p.label ? p.label : `${p.hub} › ${p.label}`)),
      ...(editor ? { edit: { key: editor.key, label: pageLabel(editor) } } : {}),
    });
  }
  // Menu order: the groups as NAV has them, then anything the menu does not carry.
  const order = NAV.map(item => item.label);
  return groups.sort((a, b) => rank(order, a.label) - rank(order, b.label));
}

function rank(order: string[], label: string): number {
  const at = order.indexOf(label);
  return at < 0 ? order.length : at;
}

/** Every key a group's rows hold, editing halves included. */
export function keysOf(rows: readonly PageRow[]): PageKey[] {
  return rows.flatMap(row => (row.edit ? [row.key, row.edit.key] : [row.key]));
}

/** One entry of the previewed menu: its name and, for a hub, the tabs the person would see. */
export interface PreviewEntry { label: string; icon: string; tabs: string[] }
export interface PreviewGroup { label: string; entries: PreviewEntry[] }

/**
 * The menu a person would see (owner 2026-10-19: "what this person will see"): the console's own menu rules (nav-tree's
 * passes, entryVisible, visibleTabs) over the pages they would hold. An administrator sees every workspace page.
 */
export function menuPreview(canOpen: (key: PageKey) => boolean, admin = false): PreviewGroup[] {
  const viewer: NavViewer = { canOpen: key => admin || canOpen(key), isAdmin: admin, isPlatform: false, showTeam: false };
  const out: PreviewGroup[] = [];
  for (const item of NAV) {
    if (!item.children && !item.tabs) {
      if (item.path) out.push({ label: item.label, entries: [{ label: item.label, icon: item.icon ?? 'chart', tabs: [] }] });
      continue;
    }
    const entries: PreviewEntry[] = [];
    if (item.tabs && item.path) {
      const tabs = visibleTabs(item, viewer);
      if (tabs.length) entries.push({ label: item.label, icon: item.icon ?? 'globe', tabs: tabs.map(t => t.label) });
    }
    for (const child of item.children ?? []) {
      if (!entryVisible(child, viewer)) continue;
      entries.push({ label: child.label, icon: child.icon, tabs: child.tabs ? visibleTabs(child, viewer).map(t => t.label) : [] });
    }
    if (entries.length) out.push({ label: item.label, entries });
  }
  return out;
}

/** How many menu entries and tabs a preview shows: "12 places". */
export function previewSize(groups: readonly PreviewGroup[]): number {
  return groups.reduce((n, g) => n + g.entries.reduce((m, e) => m + Math.max(1, e.tabs.length), 0), 0);
}

