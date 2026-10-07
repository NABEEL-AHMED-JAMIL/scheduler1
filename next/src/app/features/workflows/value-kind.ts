import { instantOf } from '../../core/instant';
import { shortTime } from './history';

/**
 * How a request's value reads in the Task inbox (owner, 2026-10-06: "I don't like the design for inbox"). Decided by the
 * value's shape and never by its field's name, so a workflow nobody has seen yet reads as well as the ones we know:
 * a list of records is a small table, a short list is chips, a yes/no is Yes or No, a file name is a file chip, a long
 * text wraps, an id or a technical key is set quietly so it does not read as the request's data, and a page of this
 * console ("/pipelines/schedules/2908/runs/8071/logs", MIG-361: the run a review task is about) opens it.
 */
export type ValueView =
  | { kind: 'text'; text: string }
  | { kind: 'long'; text: string }
  | { kind: 'bool'; text: 'Yes' | 'No' }
  | { kind: 'id'; text: string }
  | { kind: 'chips'; items: string[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'file'; name: string; image: boolean; href: string | null }
  | { kind: 'page'; path: string; query: Record<string, string> };

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif)$/i;
const DOCUMENT = /\.(pdf|docx?|xlsx?|pptx?|csv|tsv|txt|rtf|odt|ods|json|xml|zip|eml|msg|md|parquet)$/i;
/** A text this long, or with a line break, wraps under its label instead of sharing a column. */
const LONG = 80;
/** A list reads as chips while it is this short and each item fits on a chip. */
const CHIPS_MAX = 8;
const CHIP_TEXT_MAX = 40;

export function valueKind(value: unknown): ValueView {
  if (typeof value === 'boolean') return { kind: 'bool', text: value ? 'Yes' : 'No' };
  if (value === 'true' || value === 'false') return { kind: 'bool', text: value === 'true' ? 'Yes' : 'No' };
  if (Array.isArray(value)) return listView(value);
  if (value !== null && typeof value === 'object') return recordView(value as Record<string, unknown>);
  if (typeof value === 'number') return { kind: 'text', text: String(value) };
  const text = String(value ?? '').trim();
  const parsed = jsonOf(text);
  if (parsed !== undefined) return valueKind(parsed);
  const page = pageOf(text);
  if (page) return page;
  const file = fileOf(text);
  if (file) return file;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) && instantOf(text)) return { kind: 'text', text: shortTime(text) };
  if (looksLikeId(text)) return { kind: 'id', text };
  if (text.length > LONG || /\n/.test(text)) return { kind: 'long', text };
  return { kind: 'text', text };
}

/** A label for a key, in sentence case: "submittedBy" and "submitted_by" read "Submitted by", "submissionId" "Submission ID". */
export function labelOf(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase().replace(/\bid\b/g, 'ID');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function listView(items: unknown[]): ValueView {
  const present = items.filter(i => i !== null && i !== undefined && i !== '');
  const records = present.filter(i => i !== null && typeof i === 'object' && !Array.isArray(i)) as Record<string, unknown>[];
  if (records.length && records.length === present.length) {
    const columns = [...new Set(records.flatMap(r => Object.keys(r)))];
    // One key each: the list is really a list of values.
    if (columns.length === 1 && records.length <= CHIPS_MAX) return chipsOrText(records.map(r => cell(r[columns[0]])));
    return { kind: 'table', columns: columns.map(labelOf), rows: records.map(r => columns.map(c => cell(r[c]))) };
  }
  return chipsOrText(present.map(cell));
}

function recordView(record: Record<string, unknown>): ValueView {
  const entries = Object.entries(record).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!entries.length) return { kind: 'text', text: '—' };
  return { kind: 'table', columns: ['Field', 'Value'], rows: entries.map(([k, v]) => [labelOf(k), cell(v)]) };
}

function chipsOrText(items: string[]): ValueView {
  if (!items.length) return { kind: 'text', text: '—' };
  if (items.length <= CHIPS_MAX && items.every(i => i.length <= CHIP_TEXT_MAX)) return { kind: 'chips', items };
  return { kind: 'long', text: items.join(', ') };
}

/** A table cell or a chip: one line of text, a yes/no in words, a nested list joined. */
function cell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(cell).join(', ');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${labelOf(k)}: ${cell(v)}`).join(', ');
  return String(value);
}

/**
 * A page of this console: a path from its root, two segments or more, nothing but path characters (and a query) -- never
 * a web address, which is the file chip's, and never something with a scheme or "//" that could leave the console.
 */
function pageOf(text: string): ValueView | null {
  if (text.length > 300 || !/^\/[a-z][a-z0-9-]*(\/[A-Za-z0-9._~-]+)+(\?[A-Za-z0-9._~=&%-]*)?$/.test(text)) return null;
  const [path, search] = text.split('?');
  const query: Record<string, string> = {};
  new URLSearchParams(search ?? '').forEach((v, k) => (query[k] = v));
  return { kind: 'page', path, query };
}

/** A list or a record sent as text -- '[{"mg":500}]' -- is read as what it is. */
function jsonOf(text: string): unknown {
  if (!/^[[{]/.test(text)) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A file: a name or a key with an image or document extension and no spaces around a sentence. A web address is the
 * subject's own way to open it, so it becomes the chip's link; a bare name or a storage key gets only the chip.
 */
function fileOf(text: string): ValueView | null {
  if (!text || text.length > 512 || /\s{2,}|\n/.test(text)) return null;
  const path = text.split(/[?#]/)[0];
  const image = IMAGE.test(path);
  if (!image && !DOCUMENT.test(path)) return null;
  const href = /^https?:\/\/\S+$/i.test(text) ? text : null;
  // A sentence that happens to end in ".csv" is not a file.
  if (!href && /\s/.test(text) && text.split(/\s+/).length > 3) return null;
  return { kind: 'file', name: decodeURIComponent(path.split('/').pop() || path), image, href };
}

/**
 * An id or a technical key, by shape: a UUID, a long hex hash, a code such as SYN-001 or INV_2026_0042, or a
 * dotted/underscored key without spaces. A plain number is not one: it may as well be an amount.
 */
function looksLikeId(text: string): boolean {
  if (/\s/.test(text) || text.length < 3) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  if (/^[0-9a-f]{16,}$/i.test(text) && /\d/.test(text) && /[a-f]/i.test(text)) return true;
  if (/^[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)+$/.test(text) && /\d/.test(text)) return true;
  return /^[a-z][a-z0-9]*(?:[._:][a-z0-9]+)+$/.test(text) && /[._:]/.test(text) && !/^[a-z]+\.[a-z]{2,}$/.test(text);
}
