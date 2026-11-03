/**
 * MIG-451: Build JSON's shape as the console edits it -- the same keys Core reads (process-main BuildJsonStepTask): each a
 * dot path ("patient.id" nests) filled from a column, a fixed value, a formula, a list of a column's values, or a list of
 * objects (one per row) of its own keys.
 */

export type JsonFrom = 'column' | 'value' | 'expression' | 'list' | 'rows';
export type JsonType = 'auto' | 'text' | 'number' | 'boolean' | 'date';

export interface JsonKey {
  key: string;
  from?: JsonFrom;
  column?: string;
  value?: string | number | boolean | null;
  expression?: string;
  type?: JsonType;
  distinct?: boolean;
  /** from rows: each item's own keys. */
  fields?: JsonKey[];
}

export const FROM_OPTIONS: { id: JsonFrom; label: string; hint: string }[] = [
  { id: 'column', label: 'Column', hint: "A column's value" },
  { id: 'value', label: 'Fixed value', hint: 'The same value in every document' },
  { id: 'expression', label: 'Formula', hint: "Compute's formulas, on the row" },
  { id: 'list', label: 'List of a column', hint: "A column's values over the rows" },
  { id: 'rows', label: 'List of objects', hint: 'One object per row, of its own keys' },
];

export const TYPE_OPTIONS: { id: JsonType; label: string }[] = [
  { id: 'auto', label: 'As it is' }, { id: 'text', label: 'Text' }, { id: 'number', label: 'Number' },
  { id: 'boolean', label: 'True / false' }, { id: 'date', label: 'Date (ISO)' },
];

export const MODE_WORDS: Record<string, string> = { row: 'one per row', group: 'one per group', all: 'one for the run' };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The step's keys as the editor holds them (anything that is not a key object is dropped). */
export function keysOf(config: Record<string, unknown> | null | undefined): JsonKey[] {
  const fields = config?.['fields'];
  return Array.isArray(fields) ? fields.filter(isMap).map(f => ({ ...f, key: String(f['key'] ?? '') }) as JsonKey) : [];
}

/** A key as the definition writes it: only what its From uses, defaults left out. */
export function cleanKey(k: JsonKey, top = true): JsonKey {
  const from = k.from ?? 'column';
  const out: JsonKey = { key: k.key.trim() };
  if (from !== 'column') out.from = from;
  if (from === 'column' || from === 'list') out.column = (k.column ?? '').trim();
  if (from === 'value') out.value = k.value ?? null;
  if (from === 'expression') out.expression = k.expression ?? '';
  if (from !== 'rows' && k.type && k.type !== 'auto') out.type = k.type;
  if (top && (from === 'list' || from === 'rows') && k.distinct) out.distinct = true;
  if (top && from === 'rows') out.fields = (k.fields ?? []).map(f => cleanKey(f, false));
  return out;
}

/** The top-level names a document has, in order ("patient", "findings", "source"). */
export function topKeys(keys: JsonKey[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const first = k.key.split('.')[0];
    if (first && !out.includes(first)) out.push(first);
  }
  return out;
}

/** What one key says it holds, for the outline: "patient_id", "'etl-console'", "[code]", "[{code, text}]". */
export function keySource(k: JsonKey): string {
  switch (k.from ?? 'column') {
    case 'value': return JSON.stringify(k.value ?? null);
    case 'expression': return `= ${k.expression ?? ''}`;
    case 'list': return `[${k.column ?? ''}]`;
    case 'rows': return `[{${(k.fields ?? []).map(f => f.key).join(', ')}}]`;
    default: return k.column ?? '';
  }
}

/** Why a key cannot be where it is (named twice, or nested in a value); '' when it can -- as Core's check says it. */
export function keyClash(keys: JsonKey[], index: number): string {
  const key = keys[index]?.key.trim() ?? '';
  if (!key) return 'Name the key.';
  if (!/^[^.]{1,64}(\.[^.]{1,64}){0,7}$/.test(key)) return 'Up to 8 parts of at most 64 characters, joined by dots.';
  for (let i = 0; i < index; i++) {
    const other = keys[i].key.trim();
    if (other === key) return `'${key}' is named twice.`;
    if (key.startsWith(other + '.')) return `'${other}' is a value, so '${key}' cannot nest in it.`;
    if (other.startsWith(key + '.')) return `'${key}' already holds '${other}', so it cannot be a value too.`;
  }
  return '';
}

/** A column for a key's last part: the column of that name, else one ending in it (patient.id → patient_id), its singular, else ''. */
export function guessColumn(path: string, columns: string[]): string {
  const parts = path.split('.');
  const last = parts[parts.length - 1].toLowerCase();
  const joined = parts.join('_').toLowerCase();
  // A list's key is often the plural of its column (codes, of code).
  const one = last.length > 3 && last.endsWith('s') ? last.slice(0, -1) : last;
  return columns.find(c => c.toLowerCase() === joined) ?? columns.find(c => c.toLowerCase() === last)
    ?? columns.find(c => c.toLowerCase().endsWith('_' + last)) ?? columns.find(c => c.toLowerCase() === one) ?? '';
}

/**
 * A shape drawn from an example of the JSON wanted: each value a key -- a column when one matches its name, else the
 * example's value as a fixed value; a list of objects a list of objects (its first item's keys); a list of values a list
 * of a column. Nested objects become dotted keys.
 */
export function shapeFromExample(example: unknown, columns: string[]): JsonKey[] {
  if (!isMap(example)) throw new Error('The example is one JSON object: { "patient": { "id": … }, … }.');
  const out: JsonKey[] = [];
  const walk = (value: Record<string, unknown>, prefix: string, into: JsonKey[], depth: number) => {
    for (const [name, v] of Object.entries(value)) {
      const key = prefix ? `${prefix}.${name}` : name;
      if (isMap(v) && depth < 7 && Object.keys(v).length) {
        walk(v, key, into, depth + 1);
      } else if (Array.isArray(v) && into === out) {
        const first = v[0];
        if (isMap(first)) {
          const fields: JsonKey[] = [];
          walk(first, '', fields, depth + 1);
          into.push({ key, from: 'rows', fields });
        } else {
          into.push({ key, from: 'list', column: guessColumn(key, columns) });
        }
      } else {
        const column = guessColumn(key, columns);
        const plain = v === null || typeof v !== 'object' ? v as string | number | boolean | null : JSON.stringify(v);
        into.push(column ? { key, column, ...(typeof v === 'number' ? { type: 'number' as JsonType } : typeof v === 'boolean' ? { type: 'boolean' as JsonType } : {}) }
          : { key, from: 'value', value: plain });
      }
    }
  };
  walk(example, '', out, 0);
  return out;
}

/** The columns a Build JSON step's rows have, as the definition tells them (null when its input's are not known). */
export function buildJsonColumns(config: Record<string, unknown>, input: () => string[] | null): string[] | null {
  const output = String(config['output'] ?? 'column');
  const mode = String(config['mode'] ?? 'row');
  if (output === 'rows') return topKeys(keysOf(config));
  const column = typeof config['column'] === 'string' && config['column'] ? config['column'] as string : 'json';
  const beside = mode === 'row' ? input() : mode === 'group'
    ? (Array.isArray(config['groupBy']) ? (config['groupBy'] as unknown[]).filter(c => typeof c === 'string') as string[] : [])
    : [];
  return beside === null ? null : [...beside.filter(c => c !== column), column];
}
