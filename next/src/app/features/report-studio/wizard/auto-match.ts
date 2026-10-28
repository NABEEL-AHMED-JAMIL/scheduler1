import { SchemaField } from '../report-studio.model';
import { collections, itemFields, sampleText, scalars, valueAt } from '../designer/designer-model';
import { TemplateField } from './template-fields';

/**
 * Auto-match (Report data and mapping, owner 2026-10-27): every template field is matched to the data by the key itself,
 * by the template's label, by names written differently (case, _ and spaces, camelCase) and by common synonyms (dob and
 * date_of_birth), with the type as a tie-breaker; a list's columns are matched the same way. A match that is sure is
 * made; two that could fit, or a required field with nothing sure, go to "Needs you" with a suggestion -- including a
 * name combined from its parts (first_name + last_name). Nothing is guessed silently: every choice says how it was made.
 */

/** How a field is filled: a column, columns combined, a fixed value, blank on purpose, or nothing yet. */
export type Choice =
  | { kind: 'column'; path: string }
  | { kind: 'combine'; parts: Part[] }
  | { kind: 'fixed'; value: string }
  | { kind: 'blank' }
  | { kind: 'none' };
export type Part = { path: string } | { text: string };

/** How a choice was made, in the words a row shows. */
export type How = 'kept' | 'yours' | 'exact' | 'written' | 'synonym' | 'label' | 'similar' | 'combined' | 'none';
export const HOW_WORDS: Record<How, string> = {
  kept: 'Kept', yours: 'Your choice', exact: 'Same name', written: 'Same name, written differently', synonym: 'Same meaning',
  label: "Matches the template's label", similar: 'Similar name', combined: 'Combined', none: '',
};

/** A column the data offers a field, ranked. */
export interface Candidate { path: string; type: string; score: number; how: How; sample: string; }

/** One column of a list field: the item field the template reads, and the data's item field it is read from. */
export interface ColumnMatch { column: string; label: string; source: string | null; how: How; sample: string; }

export interface FieldMatch {
  field: TemplateField;
  choice: Choice;
  how: How;
  /** matched: filled; needs: a person must look (a required gap, or two columns that fit); empty: optional, prints empty. */
  state: 'matched' | 'needs' | 'empty';
  /** Why it needs a person. */
  why: string;
  suggestion: Choice | null;
  suggestionText: string;
  suggestionSample: string;
  /** What the choice gives on the first row. */
  sample: string;
  candidates: Candidate[];
  columns: ColumnMatch[];
}

/** Synonyms, each set written in its normal form (lower case, words joined by _). */
const SYNONYMS: string[][] = [
  ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday', 'born', 'born_on'],
  ['sex', 'gender'],
  ['phone', 'telephone', 'phone_number', 'tel', 'mobile', 'cell', 'contact_number'],
  ['email', 'e_mail', 'email_address', 'mail'],
  ['zip', 'zip_code', 'postal_code', 'postcode'],
  ['mrn', 'medical_record_number', 'record_number', 'chart_number'],
  ['first_name', 'given_name', 'forename', 'fname', 'firstname'],
  ['last_name', 'family_name', 'surname', 'lname', 'lastname'],
  ['name', 'full_name', 'fullname', 'display_name'],
  ['id', 'identifier', 'key', 'uid'],
  ['qty', 'quantity', 'count', 'number_of'],
  ['amt', 'amount', 'total', 'sum'],
  ['desc', 'description', 'details', 'detail'],
  ['dept', 'department', 'unit', 'ward'],
  ['addr', 'address', 'street_address'],
  ['meds', 'medications', 'medicines', 'drugs', 'prescriptions'],
  ['med', 'medication', 'medicine', 'drug'],
  ['dx', 'diagnosis', 'diagnoses'],
  ['temp', 'temperature'],
  ['bp', 'blood_pressure'],
  ['hr', 'heart_rate', 'pulse'],
  ['ht', 'height'],
  ['wt', 'weight'],
  ['pct', 'percent', 'percentage', 'rate'],
  ['avg', 'average', 'mean'],
  ['dt', 'date', 'day'],
  ['ts', 'timestamp', 'datetime', 'date_time'],
  ['dose', 'dosage', 'strength'],
  ['freq', 'frequency', 'how_often'],
  ['doc', 'doctor', 'physician', 'provider', 'clinician'],
  ['pcp', 'primary_care_physician', 'primary_care_provider', 'gp'],
  ['dos', 'date_of_service', 'service_date', 'visit_date'],
  ['ins', 'insurance', 'payer', 'insurer'],
  ['org', 'organisation', 'organization', 'company'],
  ['notes', 'note', 'comments', 'comment', 'remarks'],
  ['img', 'image', 'picture', 'photo'],
  ['url', 'link', 'href'],
  ['no', 'num', 'number', 'nbr'],
  ['status', 'state'],
];
const SYNONYM_OF = new Map<string, number>();
SYNONYMS.forEach((set, i) => set.forEach(w => SYNONYM_OF.set(w, i)));

/** A name in its normal form: "dateOfBirth", "Date of birth" and "date-of-birth" are all "date_of_birth". */
export function normal(name: string): string {
  return name.replace(/\[[^\]]*\]/g, '').split('.').pop()!.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** A name's meaning: its synonym set's index when it has one, else itself. */
function meaning(n: string): string {
  const s = SYNONYM_OF.get(n);
  return s === undefined ? n : `~${s}`;
}

/** A name's words, each by its meaning (so "patient_dob" and "date_of_birth_patient" share their words). */
function words(n: string): string[] {
  const parts = n.split('_').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    // The longest run of words that is a synonym counts as one ("date_of_birth").
    let taken = false;
    for (let j = parts.length; j > i + 1; j--) {
      const run = parts.slice(i, j).join('_');
      if (SYNONYM_OF.has(run)) { out.push(meaning(run)); i = j - 1; taken = true; break; }
    }
    if (!taken) out.push(meaning(parts[i]));
  }
  return out;
}

/** The types that can stand for each other: a contract says "string" for most fields, and a date is text in JSON. */
function typeFits(want: string, have: string): number {
  const w = want.toLowerCase();
  const h = have.toLowerCase();
  if (h === 'null') return 0;
  if (w === h) return 3;
  const num = (t: string) => ['integer', 'number', 'decimal'].includes(t);
  const time = (t: string) => ['date', 'datetime', 'time'].includes(t);
  if (num(w) && num(h)) return 2;
  if (time(w) && time(h)) return 2;
  if (w === 'string' || w === 'any' || w === '') return 0;
  if (num(w) && h === 'string') return -5;
  if (time(w) && h === 'string') return -3;
  if (w === 'boolean' && h !== 'boolean') return -10;
  if ((num(w) || time(w)) && h !== 'string') return -15;
  return -5;
}

/** How well a data column fits a field, 0 to 100, and why. */
export function score(field: { path: string; label: string; type: string }, column: { path: string; type: string }): { score: number; how: How } {
  const key = field.path.replace(/\[[^\]]*\]/g, '');
  const col = column.path;
  const t = typeFits(field.type, column.type);
  if (col === key) return { score: 100 + t, how: 'exact' };
  const nf = normal(key);
  const nc = normal(col);
  const nl = normal(field.label);
  if (!nc) return { score: 0, how: 'none' };
  // Only the last step of a dotted key counts when the column is at the top ("summary.rate" and "rate").
  if (nc === nf && col.split('.').length === key.split('.').length) return { score: 95 + t, how: 'written' };
  if (meaning(nc) === meaning(nf) && SYNONYM_OF.has(nc)) return { score: 90 + t, how: 'synonym' };
  if (nl && nc === nl) return { score: 88 + t, how: 'label' };
  if (nl && meaning(nc) === meaning(nl) && SYNONYM_OF.has(nc)) return { score: 86 + t, how: 'label' };
  const a = words(nf);
  const b = words(nc);
  if (a.length && b.length) {
    const same = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join() === [...y].sort().join();
    if (same(a, b)) return { score: 87 + t, how: 'synonym' };
    const al = nl ? words(nl) : [];
    if (al.length && same(al, b)) return { score: 86 + t, how: 'label' };
    // Only a word that says what it is counts: "guardian_name" and "payer_name" share only "name".
    const telling = (x: string[]) => x.filter(w => !GENERIC.has(w));
    const shared = telling(a).filter(w => b.includes(w)).length;
    const shareL = telling(al).filter(w => b.includes(w)).length;
    const best = Math.max(shared / Math.max(a.length, b.length), al.length ? shareL / Math.max(al.length, b.length) : 0);
    if (best >= 0.5) return { score: Math.round(55 + best * 25) + t, how: 'similar' };
  }
  return { score: 0, how: 'none' };
}

/** Words that say what kind of value, not what it is about. */
const GENERIC = new Set(['name', 'id', 'date', 'number', 'code', 'type', 'value', 'text', 'status', 'line', 'info', 'data', 'list',
  'at', 'of', 'the', 'by', 'on', 'is', 'flag', 'flags'].map(meaning));

/** Sure enough to match without asking. */
export const SURE = 85;
/** Likely enough to offer for an optional field. */
const LIKELY = 75;
/** Two candidates within this many points of each other are both possible. */
const CLOSE = 4;

/** Whose record it is: their name is the record's own first and last name. */
const SUBJECTS = new Set(['patient', 'person', 'client', 'member', 'customer', 'resident', 'student', 'employee', 'user', 'contact']);

const NAME_PARTS: { first: string[]; last: string[]; middle: string[] } = {
  first: ['first_name', 'given_name', 'forename', 'fname', 'firstname', 'first'],
  last: ['last_name', 'family_name', 'surname', 'lname', 'lastname', 'last'],
  middle: ['middle_name', 'middle_initial', 'middle'],
};

/**
 * A name a field could be combined from ("patient_name" from patient_first_name + patient_last_name, or first_name +
 * last_name): the parts in order with a space between, or null when the data has no such pair.
 */
export function nameParts(field: string, columns: SchemaField[]): Part[] | null {
  const n = normal(field);
  if (!/(^|_)name$/.test(n) && !['patient', 'person', 'who', 'subscriber', 'member', 'client'].includes(n)) return null;
  const prefix = n.replace(/(^|_)(full_)?name$/, '').replace(/^_+|_+$/g, '');
  // Another person's name (a guardian's, a subscriber's) is combined only from their own parts, never the record's own.
  const own = !prefix || SUBJECTS.has(prefix);
  const find = (kinds: string[]) => {
    const names = scalars(columns).filter(c => c.type !== 'null');
    const prefixed = prefix ? names.find(c => kinds.some(k => normal(c.path) === `${prefix}_${k}`)) : undefined;
    return prefixed ?? (own ? names.find(c => kinds.includes(normal(c.path))) : undefined);
  };
  const first = find(NAME_PARTS.first);
  const last = find(NAME_PARTS.last);
  if (!first || !last) return null;
  const middle = find(NAME_PARTS.middle);
  return [{ path: first.path }, { text: ' ' }, ...(middle ? [{ path: middle.path }, { text: ' ' }] : []), { path: last.path }];
}

/** What a choice gives on the first row. */
export function sampleOf(choice: Choice, record: unknown, rows: (path: string) => number | null = () => null): string {
  switch (choice.kind) {
    case 'column': {
      const v = valueAt(record, choice.path);
      const n = rows(choice.path) ?? (Array.isArray(v) ? v.length : null);
      if (n !== null) return `${n} row${n === 1 ? '' : 's'}`;
      return sampleText(v);
    }
    case 'combine': return combined(choice.parts, record);
    case 'fixed': return choice.value;
    case 'blank': return 'Left blank';
    default: return '';
  }
}

/** The parts joined as the report joins them: a missing part left out, outer spaces trimmed. */
export function combined(parts: Part[], record: unknown): string {
  return parts.map(p => ('path' in p ? (() => { const v = valueAt(record, p.path); return v == null || typeof v === 'object' ? '' : String(v); })() : p.text))
    .join('').replace(/\s{2,}/g, ' ').trim();
}

/** The data columns a field can read: a list's lists, or the single values, each ranked. */
export function candidatesFor(field: TemplateField, schema: SchemaField[], record: unknown): Candidate[] {
  const pool = field.list && !field.rootRow ? collections(schema) : scalars(schema);
  const out: Candidate[] = [];
  for (const c of pool) {
    let { score: s, how } = score(field, c);
    if (field.list && !field.rootRow && field.columns.length) {
      // A list is matched by its columns too: a list that holds the template's columns fits better.
      const items = new Set(itemFields(schema, c.path).map(i => normal(i.path)));
      const have = field.columns.filter(col => items.has(normal(col))).length / field.columns.length;
      if (s < SURE && have >= 0.75) { s = 70 + Math.round(have * 15); how = 'similar'; }
      else if (s > 0) s += Math.round(have * 4) - 2;
    }
    if (s > 0) {
      const v = valueAt(record, c.path);
      out.push({ path: c.path, type: c.type, score: s, how, sample: Array.isArray(v) ? `${v.length} row${v.length === 1 ? '' : 's'}` : sampleText(v) });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** Whether a choice can be read from this data (each column it names is there). */
export function fits(choice: Choice, schema: SchemaField[]): boolean {
  const has = new Set(schema.map(f => f.path));
  switch (choice.kind) {
    case 'column': return has.has(choice.path);
    case 'combine': return choice.parts.some(p => 'path' in p) && choice.parts.every(p => !('path' in p) || has.has(p.path));
    case 'fixed': case 'blank': return true;
    default: return false;
  }
}

/** A list's columns, each matched to an item field of the chosen list (kept choices first, if they still fit). */
export function matchColumns(field: TemplateField, list: string | null, schema: SchemaField[], record: unknown,
  kept: Record<string, string> = {}): ColumnMatch[] {
  if (!field.list || field.rootRow || !field.columns.length) return [];
  const items = list ? itemFields(schema, list) : [];
  const first = list ? (() => { const v = valueAt(record, list); return Array.isArray(v) ? v[0] : undefined; })() : undefined;
  return field.columns.map(column => {
    const label = field.columnLabels[column] || column;
    const keep = kept[column];
    if (keep && items.some(i => i.path === keep)) {
      return { column, label, source: keep, how: 'kept' as How, sample: sampleText(valueAt(first, keep)) };
    }
    const ranked = items.map(i => ({ i, ...score({ path: column, label, type: 'string' }, i) })).filter(x => x.score >= SURE)
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const sure = best && (ranked.length < 2 || ranked[1].score < best.score - CLOSE || best.how === 'exact');
    return best && sure
      ? { column, label, source: best.i.path, how: best.how, sample: sampleText(valueAt(first, best.i.path)) }
      : { column, label, source: null, how: 'none' as How, sample: '' };
  });
}

export interface Prior {
  /** The choice kept with the version (or made by the person on this page). */
  choice: Choice;
  /** Kept with a version (vN), or the person's own on this page. */
  from: 'kept' | 'yours';
  /** A list's columns, kept the same way: {column: item field}. */
  columns?: Record<string, string>;
}

/**
 * Matches every field to the data: a prior choice that still fits stays; otherwise the best sure candidate, unless two
 * are as sure, which a person settles. A required field with nothing sure needs a person, with the best guess (or a
 * combined name) as the suggestion; an optional one prints empty.
 */
export function autoMatch(fields: TemplateField[], schema: SchemaField[], record: unknown, prior: Record<string, Prior> = {},
  rows: (path: string) => number | null = () => null): FieldMatch[] {
  return fields.map(field => {
    const candidates = candidatesFor(field, schema, record);
    const had = prior[field.path];
    const base = (choice: Choice, how: How, state: FieldMatch['state'], why = ''): FieldMatch => {
      const list = choice.kind === 'column' ? choice.path : null;
      return {
        field, choice, how, state, why, suggestion: null, suggestionText: '', suggestionSample: '',
        sample: sampleOf(choice, record, rows), candidates,
        columns: matchColumns(field, list, schema, record, had?.columns ?? {}),
      };
    };
    if (had && had.choice.kind !== 'none' && fits(had.choice, schema)) return base(had.choice, had.from, 'matched');
    const best = candidates[0];
    const second = candidates[1];
    const sure = best && best.score >= SURE;
    const tie = sure && second && second.score >= SURE && second.score >= best.score - CLOSE && best.how !== 'exact';
    if (sure && !tie) return base({ kind: 'column', path: best.path }, best.how, 'matched');
    const combine = !field.list ? nameParts(field.path, schema) : null;
    const lost = had && had.choice.kind !== 'none' ? describe(had.choice) : '';
    let out: FieldMatch;
    if (tie) {
      out = base({ kind: 'none' }, 'none', 'needs', `${field.required ? 'Required. ' : ''}${countWord(candidates.filter(c => c.score >= SURE).length)} columns could fit.`);
      out.suggestion = { kind: 'column', path: best.path };
    } else if (field.required) {
      const why = lost
        ? `Required. The kept choice (${lost}) is not in this data.`
        : field.picture ? 'Required. A picture the data does not name yet.' : 'Required, and nothing in the data is named like it.';
      out = base({ kind: 'none' }, 'none', 'needs', why);
      if (combine) out.suggestion = { kind: 'combine', parts: combine };
      else if (best) out.suggestion = { kind: 'column', path: best.path };
    } else {
      // An optional field prints empty; only a likely column is offered (a weak guess would read as a fact).
      out = base({ kind: 'none' }, 'none', 'empty');
      if (best && best.score >= LIKELY) out.suggestion = { kind: 'column', path: best.path };
      else if (combine) out.suggestion = { kind: 'combine', parts: combine };
    }
    if (out.suggestion) {
      out.suggestionText = describe(out.suggestion);
      out.suggestionSample = sampleOf(out.suggestion, record, rows);
    }
    return out;
  });
}

function countWord(n: number): string {
  return ['No', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n);
}

/** A choice in words: "first_name + last_name", "the fixed value “Riverside”", "dob". */
export function describe(choice: Choice): string {
  switch (choice.kind) {
    case 'column': return choice.path;
    case 'combine': return 'combine ' + choice.parts.filter(p => 'path' in p).map(p => (p as { path: string }).path).join(' + ');
    case 'fixed': return `the fixed value “${choice.value}”`;
    case 'blank': return 'left blank';
    default: return 'nothing';
  }
}

/** Two choices are the same (so "Changed from vN" can tell). */
export function sameChoice(a: Choice, b: Choice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ------------------------------------------------------------------ the mapping as media-service takes and keeps it

/** One field's mapping value, or undefined when the field is read at its own path (no mapping needed). */
function valueOfChoice(field: string, choice: Choice): unknown {
  switch (choice.kind) {
    case 'column': return choice.path === field ? undefined : choice.path;
    case 'combine': return { combine: choice.parts };
    case 'fixed': return { value: choice.value };
    case 'blank': return { blank: true };
    default: return undefined;
  }
}

/**
 * The mapping media-service applies and keeps with the version: {field: path | {combine} | {value} | {blank}} and
 * {"list[*].column": item field} for a list's columns read under another name. A field read at its own path is left out.
 */
export function mappingBody(matches: FieldMatch[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of matches) {
    const v = valueOfChoice(m.field.path, m.choice);
    if (v !== undefined) out[m.field.path] = v;
    for (const c of m.columns) if (c.source && c.source !== c.column) out[`${m.field.path}[*].${c.column}`] = c.source;
  }
  return out;
}

/**
 * The choices a version was made with, from its kept mapping: each field it names, and -- for a field it does not -- its
 * own path (the field was read as it is). The page starts from these on Generate again.
 */
export function priorFrom(mapping: Record<string, unknown> | null | undefined, fields: TemplateField[]): Record<string, Prior> {
  const out: Record<string, Prior> = {};
  const m = mapping ?? {};
  for (const f of fields) {
    const v = m[f.path];
    let choice: Choice = { kind: 'column', path: f.path };
    if (typeof v === 'string' && v.trim()) choice = { kind: 'column', path: v.trim() };
    else if (v && typeof v === 'object') {
      const o = v as { combine?: Part[]; value?: unknown; blank?: boolean };
      if (Array.isArray(o.combine)) choice = { kind: 'combine', parts: o.combine.filter(p => p && ('path' in p || 'text' in p)) };
      else if (o.value !== undefined) choice = { kind: 'fixed', value: String(o.value) };
      else if (o.blank) choice = { kind: 'blank' };
    }
    const columns: Record<string, string> = {};
    for (const [k, val] of Object.entries(m)) {
      const prefix = `${f.path}[*].`;
      if (k.startsWith(prefix) && typeof val === 'string') columns[k.slice(prefix.length)] = val;
    }
    out[f.path] = { choice, from: 'kept', columns };
  }
  return out;
}

/** How many fields a source fits ("Fits 79 of 83"): matched without a person. */
export function fitCount(fields: TemplateField[], schema: SchemaField[], record: unknown): number {
  return autoMatch(fields, schema, record).filter(m => m.state === 'matched').length;
}
