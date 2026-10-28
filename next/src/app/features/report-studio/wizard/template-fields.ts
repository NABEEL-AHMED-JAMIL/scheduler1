import { TemplateDefinition } from '../report-studio.model';
import { Block, componentsOf, primaryNames, templateOf } from '../designer/designer-model';

/**
 * The template's fields as a person reads them (Report data and mapping, owner 2026-10-27): each data field the report
 * needs, named by the template's own words -- the label it prints under, the table's title, the heading above it -- and
 * grouped by the part of the template it prints in (its sections and headings, the page header and footer). Nothing here
 * assumes one template's shape: a template with no sections is one group ("Fields"), a multi-page one with no headings is
 * grouped by page, and a field that only decides what shows (a condition) says so. The key stays beside the label, small.
 */
export interface TemplateField {
  /** The data contract's path (or, with no contract, the path the template binds). */
  path: string;
  type: string;
  required: boolean;
  /** The template's words for it. */
  label: string;
  /** The part of the template it prints in. */
  section: string;
  /** Where it first prints, in document order. */
  order: number;
  /** The components that print it (their ids on the canvas). */
  components: string[];
  /** A list the template repeats (a table, a list, an image grid, a repeat, a count). */
  list: boolean;
  /** For a list: the item fields the template reads from each row (a table's columns, "rows[0].x", a repeat's item.x). */
  columns: string[];
  /** For a list's column: the template's words for each (the table's column labels). */
  columnLabels: Record<string, string>;
  /** Read as a picture (an image or an image grid). */
  picture: boolean;
  /** Only decides whether a block shows (a condition), never printed. */
  conditionOnly: boolean;
  /** Its rows are the report's own rows: a table of the data itself (the template reads a list of records). */
  rootRow: boolean;
}

/** A field's whole template: whether it reads the data itself as rows ("one table of every row"). */
export interface TemplateFields {
  fields: TemplateField[];
  /** The template draws the data's own rows (a table or repeat of the primary dataset): its fields are each row's. */
  readsRows: boolean;
  /** Groups in document order, with how many fields each holds. */
  sections: string[];
}

const PLACEHOLDER = /\{\{\s*([^{}|]+?)\s*(?:\|[^}]*)?\}\}/g;
const QUALIFIED = /(?<![\w.\]])([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[0-9*]+\])+)/g;
const QUOTED = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;
/** Components that read a list from their binding. */
const LIST_BINDING = new Set(['list', 'imageGrid', 'chart']);
export const TOP = 'Top of the report';
export const MORE = 'More of the report';
export const CONTRACT_ONLY = 'Checked, not printed';
export const HEADER = 'Page header';
export const FOOTER = 'Page footer';
export const ALL = 'Fields';

/** A key as words: "patient_name" is "Patient name", "summary.totalRevenue" is "Total revenue", "ai_flags[0].type" is "Type". */
export function humanize(path: string): string {
  const last = path.replace(/\[[^\]]*\]/g, '').split('.').filter(Boolean).pop() ?? path;
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-\s]+/g, ' ').trim().toLowerCase();
  if (!words) return path;
  const fixed = words.replace(/\b(id|ai|dob|mrn|bmi|icd|npi|url|pdf|qr|er|icu|ssn|zip)\b/g, w => w.toUpperCase());
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}

/** A template's words without its placeholders: "Patient intake summary · {{primary.patient_name}}" is "Patient intake summary". */
export function plainWords(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(PLACEHOLDER, ' ').replace(/[*_`#]/g, '').replace(/\s*[·:|,–—-]\s*$/g, '').replace(/^\s*[·:|,–—-]\s*/g, '')
    .replace(/\s{2,}/g, ' ').replace(/\s*·\s*·\s*/g, ' · ').trim();
}

interface Read { inner: string; component: string; label: string; section: string; list: boolean; picture: boolean; condition: boolean;
  columns: string[]; columnLabels: Record<string, string>; rootRow: boolean; }

/**
 * The fields a template needs, with their labels and groups: its data contract (with its labels when it has them), or --
 * with none -- every path it binds (each required, since a bound value the data lacks is an error).
 */
export function templateFields(def: TemplateDefinition): TemplateFields {
  const t = templateOf(def) as { dataContract?: { fields?: { path: string; type?: string; required?: boolean; label?: string | null }[] } };
  const names = primaryNames(def);
  const reads = readsOf(componentsOf(def), names);
  const contract = t.dataContract?.fields?.filter(f => typeof f.path === 'string' && f.path.trim()) ?? [];
  const readsRows = reads.some(r => r.rootRow) || readsWholeData(componentsOf(def), names);
  const out = new Map<string, TemplateField>();
  const owner = (inner: string, keys: string[]) => {
    // The longest field the path starts with ("summary[0].images" belongs to "summary").
    let best: string | null = null;
    for (const k of keys) if ((inner === k || inner.startsWith(k + '.') || inner.startsWith(k + '[')) && (!best || k.length > best.length)) best = k;
    return best;
  };
  const fieldOf = (path: string, type: string, required: boolean, label: string | null | undefined, order: number): TemplateField => ({
    path, type, required, label: label?.trim() || '', section: '', order, components: [], list: type === 'array', columns: [], columnLabels: {},
    picture: false, conditionOnly: true, rootRow: false,
  });
  const itemOf = (path: string) => /^(.+?)\[\*?\]\.(.+)$/.exec(path);
  contract.forEach((f, i) => {
    // "woundList[*].stage" in a contract is a column of the woundList field, not a field of its own.
    if (!itemOf(f.path)) out.set(f.path, fieldOf(f.path, f.type ?? 'string', !!f.required, f.label, 10_000 + i));
  });
  contract.forEach((f, i) => {
    const m = itemOf(f.path);
    if (!m) return;
    if (!out.has(m[1])) out.set(m[1], fieldOf(m[1], 'array', false, null, 10_000 + i));
    const list = out.get(m[1])!;
    list.list = true;
    if (!list.columns.includes(m[2])) list.columns.push(m[2]);
    if (f.label?.trim() && !list.columnLabels[m[2]]) list.columnLabels[m[2]] = f.label.trim();
  });
  reads.forEach((r, i) => {
    let key = owner(r.inner, [...out.keys()]);
    if (!key) {
      // A read the contract does not name (or a template with no contract): a field of its own, required -- a bound value
      // the data lacks stops the report. A list's row read by its index ("results[0].value") belongs to the list.
      const at = r.inner.indexOf('[');
      key = at > 0 ? r.inner.slice(0, at) : r.inner;
      if (!key) return;
      if (!out.has(key)) out.set(key, fieldOf(key, r.list || at > 0 ? 'array' : 'string', true, null, i));
    }
    const f = out.get(key)!;
    if (!f.components.length) f.order = i;
    if (!f.components.includes(r.component)) f.components.push(r.component);
    // A field first met in a condition belongs where it prints, when it does.
    const onlyDecided = f.components.length > 1 && f.conditionOnly;
    if (!f.section || (onlyDecided && !r.condition)) f.section = r.section;
    if (!r.condition) f.conditionOnly = false;
    if (!f.label && r.label && !r.condition && (r.inner === key || r.list)) f.label = r.label;
    if (r.list || r.inner !== key) f.list = f.list || r.list || r.inner.startsWith(key + '[');
    if (r.picture && r.inner === key) f.picture = true;
    if (r.rootRow) f.rootRow = true;
    const rest = r.inner.slice(key.length);
    const indexed = /^\[[0-9*]+\]\.(.+)$/.exec(rest);
    const cols = indexed ? [indexed[1]] : r.inner === key ? r.columns : [];
    for (const c of cols) if (c && !f.columns.includes(c)) f.columns.push(c);
    for (const [c, l] of Object.entries(r.inner === key ? r.columnLabels : {})) if (!f.columnLabels[c]) f.columnLabels[c] = l;
  });
  const fields = [...out.values()].map(f => ({
    ...f,
    label: f.label || humanize(f.path),
    section: f.components.length ? f.section || TOP : CONTRACT_ONLY,
    // A field no component reads is still the contract's: it goes last.
    conditionOnly: f.components.length > 0 && f.conditionOnly,
    list: f.list || f.type === 'array',
  })).sort((a, b) => a.order - b.order);
  let sections = [...new Set(fields.map(f => f.section))];
  if (sections.length === 1) {
    fields.forEach(f => (f.section = ALL));
    sections = [ALL];
  }
  return { fields, readsRows, sections };
}

/**
 * Every read of the primary dataset, in document order, with the words and the part of the template around it: a named
 * section (its title, its first heading, or its first table's title), else the heading the flow is under, else the top
 * of the report (or, past a named section, "More of the report"); the page header and footer are their own; a template of
 * several pages with no headings is grouped by page.
 */
function readsOf(blocks: Block[], names: string[]): Read[] {
  const out: Read[] = [];
  const pageCount = blocks.filter(b => b.type === 'pageBreak').length + 1;
  let flow = '';
  let sawSection = false;
  let page = 1;
  let lastHeading = '';
  const named = (b: Block): string => {
    if (typeof b['title'] === 'string' && plainWords(b['title'])) return plainWords(b['title']);
    let heading = '';
    let titled = '';
    const look = (list: Block[] | undefined) => {
      for (const c of list ?? []) {
        if (heading) return;
        if (c.type === 'heading' && plainWords(c['content'])) { heading = plainWords(c['content']); return; }
        if (!titled && ['table', 'imageGrid', 'chart', 'list'].includes(c.type) && plainWords(c['title'])) titled = plainWords(c['title']);
        if (['row', 'column', 'conditional', 'section'].includes(c.type)) look(c.children);
      }
    };
    look(b.children);
    return heading || titled;
  };
  const visit = (list: Block[], aliases: Map<string, string>, within: string | null) => {
    for (const b of list) {
      if (b.type === 'pageBreak') { page++; flow = ''; continue; }
      const role = typeof b['role'] === 'string' ? b['role'] : '';
      let here = within;
      if (!here && b.type === 'section' && role === 'header') here = HEADER;
      else if (!here && b.type === 'section' && role === 'footer') here = FOOTER;
      else if (!here && b.type === 'section') { const name = named(b); if (name) { here = name; sawSection = true; lastHeading = name; } }
      // A heading in the flow (never the title, a level 1) names what follows it.
      if (!within && b.type === 'heading' && Number(b['level'] ?? 1) >= 2 && plainWords(b['content'])) flow = plainWords(b['content']);
      if (b.type === 'heading' && Number(b['level'] ?? 1) >= 2) lastHeading = plainWords(b['content']);
      const where = here ?? (flow || (pageCount > 1 ? `Page ${page}` : sawSection ? MORE : TOP));
      readsOfBlock(b, names, aliases, where, lastHeading).forEach(r => out.push(r));
      let inner = aliases;
      if (b.type === 'repeat' && typeof b['dataset'] === 'string') {
        const listPath = innerOf(b['dataset'] as string, names, aliases);
        if (listPath !== null) { inner = new Map(aliases); inner.set(String(b['as'] ?? 'item'), listPath); }
      }
      if (Array.isArray(b.children)) visit(b.children, inner, here ?? (b.type === 'section' ? where : null));
    }
  };
  visit(blocks, new Map(), null);
  return out;
}

/** Whether a component repeats the primary dataset itself (a table, repeat, list, grid or chart of the data's own rows). */
function readsWholeData(blocks: Block[], names: string[]): boolean {
  let found = false;
  const visit = (list: Block[]) => {
    for (const b of list) {
      if (found) return;
      const ds = b['dataset'];
      const bound = b['binding'];
      if ((typeof ds === 'string' && names.includes(ds)) || (typeof bound === 'string' && names.includes(bound) && LIST_BINDING.has(b.type))) found = true;
      if (Array.isArray(b.children)) visit(b.children);
    }
  };
  visit(blocks);
  return found;
}

/** The path inside the primary dataset a binding reads ("" for the dataset itself), a repeat's item as its list's row, or null. */
function innerOf(binding: string, names: string[], aliases: Map<string, string>): string | null {
  for (const n of names) {
    if (binding === n) return '';
    if (binding.startsWith(n + '.')) return binding.slice(n.length + 1);
  }
  for (const [alias, list] of aliases) {
    if (binding === alias) return list === '' ? null : `${list}[*]`;
    if (binding.startsWith(alias + '.')) return list === '' ? binding.slice(alias.length + 1) : `${list}[*].${binding.slice(alias.length + 1)}`;
  }
  return null;
}

/** What one block reads. */
function readsOfBlock(b: Block, names: string[], aliases: Map<string, string>, section: string, heading: string): Read[] {
  const out: Read[] = [];
  const add = (inner: string, extra: Partial<Read> = {}) => {
    if (inner === '') return;
    // An alias's row of the primary itself is a root field; a row of a list is that list's column.
    const each = /^(.+?)\[\*\]\.(.+)$/.exec(inner);
    if (each) { out.push({ ...base(each[1]), list: true, columns: [each[2]] }); return; }
    out.push({ ...base(inner), ...extra });
  };
  const ownLabel = plainWords(b['label']) || plainWords(b['title']) || plainWords(b['caption']) || '';
  const base = (inner: string): Read => ({ inner, component: b.id, label: '', section, list: false, picture: false, condition: false,
    columns: [], columnLabels: {}, rootRow: false });
  const listRead = (key: string) => {
    const v = b[key];
    if (typeof v !== 'string') return;
    const inner = innerOf(v, names, aliases);
    if (inner === null) return;
    const cols: string[] = [];
    const labels: Record<string, string> = {};
    for (const c of (Array.isArray(b['columns']) ? b['columns'] : []) as { field?: string; label?: string }[]) {
      if (c?.field) { cols.push(c.field); if (c.label) labels[c.field] = plainWords(c.label); }
    }
    for (const k of ['field', 'imageField', 'captionField']) if (typeof b[k] === 'string' && b[k]) cols.push(b[k] as string);
    if (Array.isArray(b['captionFields'])) for (const c of b['captionFields'] as unknown[]) if (typeof c === 'string') cols.push(c);
    const filter = b['filter'] as { field?: string } | undefined;
    if (filter?.field) cols.push(filter.field);
    const sort = b['sort'] as { field?: string } | undefined;
    if (sort?.field && !cols.includes(sort.field)) cols.push(sort.field);
    if (inner === '') {
      // The data's own rows: each column is a root field, labelled by its column.
      for (const c of cols) out.push({ ...base(c), label: labels[c] || '', rootRow: true });
      return;
    }
    out.push({ ...base(inner), label: ownLabel || heading, list: true, picture: b.type === 'imageGrid', columns: [...new Set(cols)], columnLabels: labels });
  };
  if (typeof b['dataset'] === 'string') listRead('dataset');
  if (typeof b['binding'] === 'string') {
    const counts = (b['format'] as { type?: string } | undefined)?.type === 'count';
    const readsList = LIST_BINDING.has(b.type) || (b.type === 'labelValue' && (!!b['field'] || !!b['filter'] || counts));
    if (readsList) listRead('binding');
    else {
      const inner = innerOf(b['binding'] as string, names, aliases);
      if (inner !== null) {
        const label = b.type === 'text' || b.type === 'list' ? heading : ownLabel || heading;
        add(inner, { label, picture: b.type === 'image' || b.type === 'signature' || b.type === 'stamp' });
      }
    }
  }
  for (const key of ['content', 'title', 'label', 'caption']) {
    const text = b[key];
    if (typeof text !== 'string') continue;
    for (const m of text.matchAll(PLACEHOLDER)) {
      const p = m[1].trim();
      if (p.startsWith('report.')) continue;
      const inner = innerOf(p, names, aliases);
      if (inner !== null) add(inner, { label: '' });
    }
  }
  const when = typeof b['when'] === 'string' ? b['when'] : (b['condition'] as { left?: string } | undefined)?.left;
  if (typeof when === 'string') {
    for (const m of when.replace(QUOTED, "''").matchAll(QUALIFIED)) {
      const inner = innerOf(m[1], names, aliases);
      if (inner !== null) add(inner, { condition: true });
    }
  }
  return out;
}
