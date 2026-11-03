import { TemplateDefinition } from '../report-studio.model';
import { Block, innerPath, pathsOf, templateOf, valueAt, walk } from './designer-model';

/**
 * Reports redesign (features 11 and 12): what the designer's Privacy and archiving settings read and write -- the data
 * contract's personal fields (tagged, never guessed from a name), how a copy without names treats them and the dates, the
 * PDF's archive format and tagging.
 */

export interface ContractField {
  path: string; type: string; required?: boolean; label?: string; description?: string; personal?: boolean; deidentify?: string;
}

/** One field the Personal data list shows: from the contract, or read by a block. */
export interface PersonalRow { path: string; label: string; type: string; inContract: boolean; personal: boolean; rule: string; }

export type DeidentifyRule = '' | 'pseudonym' | 'mask' | 'year' | 'remove';
export const RULE_WORDS: Record<Exclude<DeidentifyRule, ''>, string> = {
  pseudonym: 'A pseudonym (Patient 3)', mask: 'Masked (•••)', year: 'The year only', remove: 'Left out',
};

const PLAIN_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'date', 'datetime']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** The contract's fields (a copy, never the definition's own array). */
export function contractFields(def: TemplateDefinition | null): ContractField[] {
  const t = def ? (templateOf(def) as { dataContract?: { fields?: ContractField[] } }) : null;
  return [...(t?.dataContract?.fields ?? [])];
}

/** A value's contract type from the test data: date, datetime, number, boolean or string. */
export function typeOf(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string' && ISO_DATE.test(value.trim())) return value.trim().length > 10 ? 'datetime' : 'date';
  return 'string';
}

/**
 * The fields a person may tag personal: the contract's plain fields, then every other field a block reads (a table's
 * columns as list[*].field), each with its label and whether it is tagged and how.
 */
export function personalRows(def: TemplateDefinition | null, blocks: Block[], names: string[], sample: unknown): PersonalRow[] {
  const out: PersonalRow[] = [];
  const seen = new Set<string>();
  for (const f of contractFields(def)) {
    if (!f.path || seen.has(f.path) || (!PLAIN_TYPES.has(f.type) && !f.personal)) continue;
    seen.add(f.path);
    out.push({ path: f.path, label: f.label || f.path, type: f.type, inContract: true, personal: f.personal === true, rule: f.deidentify ?? '' });
  }
  const read = new Set<string>();
  walk(blocks, b => pathsOf(b).forEach(p => read.add(p)));
  const lists = new Set<string>();
  walk(blocks, b => { if (typeof b['dataset'] === 'string') lists.add(b['dataset'] as string); });
  for (const raw of [...read].sort()) {
    if (lists.has(raw)) continue;
    const inner = innerPath(raw, names);
    const path = inner === null ? raw : inner;
    if (!path || seen.has(path) || !/^[A-Za-z_][A-Za-z0-9_]*((\.[A-Za-z_][A-Za-z0-9_]*)|(\[\*\]))*$/.test(path)) continue;
    seen.add(path);
    const value = valueAt(sample, path.replace(/\[\*\]/g, '[]'));
    if (value !== null && typeof value === 'object') continue;
    out.push({ path, label: path, type: typeOf(value), inContract: false, personal: false, rule: '' });
  }
  return out;
}

/**
 * The definition with {@code path} tagged personal (with its rule) or not: a field not in the contract yet is added to it
 * (its type read from the test data, never required); untagging keeps the field, without the tag and the rule.
 */
export function setPersonal(def: TemplateDefinition, row: PersonalRow, personal: boolean, rule: DeidentifyRule = ''): void {
  const t = templateOf(def) as Record<string, unknown>;
  const contract = { ...((t['dataContract'] ?? {}) as Record<string, unknown>) };
  const fields = [...((contract['fields'] ?? []) as ContractField[])].map(f => ({ ...f }));
  let f = fields.find(x => x.path === row.path);
  if (!f) {
    if (!personal) return;
    f = { path: row.path, type: row.type || 'string' };
    fields.push(f);
  }
  if (personal) {
    f.personal = true;
    if (rule) f.deidentify = rule; else delete f.deidentify;
  } else {
    delete f.personal;
    delete f.deidentify;
  }
  contract['fields'] = fields;
  t['dataContract'] = contract;
}

/** A copy without names' other rules (output.deidentify): the dates (shift, year, keep) and whether free text is searched. */
export function deidentifyRules(def: TemplateDefinition | null): { dates: string; freeText: boolean } {
  const o = def ? ((templateOf(def) as Record<string, unknown>)['output'] ?? {}) as Record<string, unknown> : {};
  const d = (o['deidentify'] ?? {}) as Record<string, unknown>;
  return { dates: typeof d['dates'] === 'string' ? d['dates'] as string : 'shift', freeText: d['freeText'] !== false };
}

export function setDeidentifyRule(def: TemplateDefinition, key: 'dates' | 'freeText', value: string | boolean): void {
  const t = templateOf(def) as Record<string, unknown>;
  const output = { ...((t['output'] ?? {}) as Record<string, unknown>) };
  const d = { ...((output['deidentify'] ?? {}) as Record<string, unknown>) };
  if ((key === 'dates' && value === 'shift') || (key === 'freeText' && value === true)) delete d[key]; else d[key] = value;
  if (Object.keys(d).length) output['deidentify'] = d; else delete output['deidentify'];
  t['output'] = output;
}

/** Feature 11: the PDF's archive format ("PDF/A-2b", "none", or "" when the brand decides) and tagging (true, false or undefined). */
export function pdfConformance(def: TemplateDefinition | null): { archive: string; tagged: boolean | undefined } {
  const o = def ? ((templateOf(def) as Record<string, unknown>)['output'] ?? {}) as Record<string, unknown> : {};
  const pdf = (o['pdf'] ?? {}) as Record<string, unknown>;
  return { archive: typeof pdf['archive'] === 'string' ? pdf['archive'] as string : '',
    tagged: typeof pdf['tagged'] === 'boolean' ? pdf['tagged'] as boolean : undefined };
}

/** Sets output.pdf.archive or output.pdf.tagged; "" (or undefined) leaves the choice to the brand profile. */
export function setPdfConformance(def: TemplateDefinition, key: 'archive' | 'tagged', value: string | boolean | undefined): void {
  const t = templateOf(def) as Record<string, unknown>;
  const output = { ...((t['output'] ?? {}) as Record<string, unknown>) };
  const pdf = { ...((output['pdf'] ?? {}) as Record<string, unknown>) };
  if (value === '' || value === undefined) delete pdf[key]; else pdf[key] = value;
  if (Object.keys(pdf).length) output['pdf'] = pdf; else delete output['pdf'];
  t['output'] = output;
}
