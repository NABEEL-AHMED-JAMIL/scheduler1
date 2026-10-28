/**
 * Wave 5 Forms (lite): a workspace's forms, as Core answers them (/form.json, /formSubmission.json), and the rules the
 * console checks as the person types. Core checks the same rules again (process.forms.FormFields) and its answer is the
 * one that counts: a refusal is shown word for word.
 *
 * Owner decision 2026-09-30: a form is shared inside its workspace only -- there are no public or expiring links yet.
 */

import { codeWords } from '../../shared/ui/plain-words';

export type FieldType = 'text' | 'longText' | 'number' | 'date' | 'choice' | 'yesNo' | 'email' | 'table' | 'file' | 'signature' | 'lookup'
  | 'checkboxes';
export type ColumnType = 'text' | 'number' | 'date' | 'choice' | 'yesNo' | 'email';
export type RuleOp = 'eq' | 'ne' | 'in' | 'gt' | 'lt' | 'filled' | 'empty';

/** MIG-277: a condition on an earlier field's answer (FormFields.holds on the server). */
export interface FieldRule {
  field: string;
  op: RuleOp;
  value?: unknown;
}

/** A file or drawn signature, uploaded before the form is sent; the answer names it by uploadId. */
export interface UploadRef {
  uploadId: number;
  name: string;
  contentType?: string;
  size?: number;
  /** Where Core kept it: the workspace bucket and key (a sent submission's files carry them). */
  bucket?: string;
  key?: string;
}

export type TableRow = Record<string, string | boolean | null>;
export type FormStatus = 'Draft' | 'Active' | 'Archived';
export type SubmissionStatus = 'Received' | 'RunStarted' | 'RunNotStarted';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** A short hint under the field (at most 500 characters), linked to its control by aria-describedby. */
  help?: string | null;
  /**
   * Example text inside the empty control (at most 120, one line; FormFields.PLACEHOLDER_TYPES): text, long text, number,
   * date, e-mail, choice and lookup. Display text only -- never the field's only label, and shown as text, not markup.
   */
  placeholder?: string | null;
  options?: string[] | null;
  /** MIG-277: shown only when this holds; required (as well as when `required`) when that holds. */
  showWhen?: FieldRule | null;
  requiredWhen?: FieldRule | null;
  /** A table's columns (plain types) and how many rows it takes. */
  columns?: FormField[] | null;
  maxRows?: number | null;
  /** A file field's accepted extensions, size and count. */
  accept?: string[] | null;
  maxSizeMb?: number | null;
  maxFiles?: number | null;
  /** MIG-271: a file field whose files also become documents in Document Intelligence, one each. */
  toDocuments?: boolean | null;
  /** A lookup's source: another form of the workspace, and the field whose answers it offers. */
  lookup?: { formId: number | null; field: string } | null;
  /**
   * 2026-10-26: the title of the group the field belongs to (one line, at most 80). A field whose section differs from the
   * one above it starts a new group under that heading; fields with none stay ungrouped.
   */
  section?: string | null;
  /**
   * ZT-I34 (owner 2026-10-27): the answer is personal data (a name, a date of birth, a phone, an address, a member id). A
   * request the submission starts shows it masked, and masks it in the request's free text, to everyone but the submitter and
   * people holding See personal data. Absent is no.
   */
  personal?: boolean | null;
  /** 2026-10-26, checkboxes: the least and most options ticked (each optional; the least applies once anything is ticked). */
  minSelected?: number | null;
  maxSelected?: number | null;
}

/** A form as listed; `fields` only when one form is fetched. The job behind it is an administrator's to see. */
export interface FormSummary {
  formId: number;
  name: string;
  description?: string | null;
  status: FormStatus;
  version: number;
  fieldCount: number;
  startsJob: boolean;
  jobId?: number | null;
  jobName?: string | null;
  submissions?: number;
  dateCreated?: string | null;
  dateUpdated?: string | null;
  fields?: FormField[];
  /** A lookup field's values now, by its key (fetch only). */
  lookupValues?: Record<string, string[]>;
  /** MIG-279: the workflow a submission starts, and where its rows are as an Analytics dataset. */
  workflowKey?: string | null;
  dataset?: { analyticsDatasetId?: number | null; name: string; connection: string; path: string } | null;
}

/** What rebuilding a dataset form's files did: the submissions taken (its newest 1000 at most) and the files written. */
export interface DatasetRebuild {
  formId: number;
  bucket: string;
  path: string;
  submissions: number;
  taken: number;
  written: number;
}

export interface LinkableJob {
  jobId: number;
  jobName: string;
  jobStatus: string;
}

export interface Submission {
  submissionId: number;
  formId: number;
  formVersion: number;
  status: SubmissionStatus;
  jobId?: number | null;
  jobQueueId?: number | null;
  reason?: string | null;
  submittedBy?: number | null;
  submittedByName?: string | null;
  submittedAt?: string | null;
  bucket?: string | null;
  storageKey?: string | null;
  answers: Record<string, unknown>;
  /** The fields of the version it answered, when that is not the form's current one (MIG-277). */
  fields?: FormField[];
  /** ZT-I34: its answers marked personal data are masked for the reader (they do not hold See personal data). */
  personalMasked?: boolean | null;
  /** MIG-279: the request it started and its status now -- Pending, Overdue, Approved, Rejected ... -- or NotStarted. */
  workflowInstanceId?: number | null;
  workflowStatus?: string | null;
  workflowReason?: string | null;
  /** MIG-280: the step its request waits at now ("Manager approval"); none once it ended. */
  workflowStage?: string | null;
}

/** MIG-278: whether this workspace lets its forms be shared by link. */
export interface SharePolicy {
  enabled: boolean;
  canChange: boolean;
}

export type ShareLinkStatus = 'Active' | 'Expired' | 'Used' | 'Revoked';

export interface ShareLink {
  linkId: number;
  formId: number;
  label?: string | null;
  status: ShareLinkStatus;
  expiresAt: string;
  maxSubmissions?: number | null;
  usedCount: number;
  requireSignIn: boolean;
  createdAt?: string | null;
  lastUsedAt?: string | null;
  /** Only in the answer that made it. */
  token?: string;
}

export interface ShareLinks {
  enabled: boolean;
  shareable: boolean;
  whyNot?: string | null;
  links: ShareLink[];
}

export interface ShareLinkDraft {
  formId: number;
  label: string;
  days: number;
  maxSubmissions: number | null;
  requireSignIn: boolean;
}

/** A share link's form, as its visitor sees it: the form and a ticket for this visit, nothing of the workspace. */
export interface PublicFormView {
  name: string;
  description?: string | null;
  version: number;
  fields: FormField[];
  requireSignIn: boolean;
  expiresAt: string;
  ticket: string;
}

/** The address a share link opens at, built from its token. */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/f/${token}`;
}

/** What POST form.json/save takes. */
export interface FormDraft {
  formId?: number | null;
  name: string;
  description: string;
  status: FormStatus;
  jobId: number | null;
  fields: FormField[];
  /** MIG-279: the workflow a submission starts (its key), or none. */
  workflowKey?: string | null;
}

export type AnswerValue = string | boolean | null | string[] | TableRow[] | UploadRef[] | UploadRef;
export type Answers = Record<string, AnswerValue>;

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
  { value: 'checkboxes', label: 'Checkboxes (tick all that apply)' },
  { value: 'yesNo', label: 'Yes / no' },
  { value: 'email', label: 'E-mail' },
  { value: 'table', label: 'Table' },
  { value: 'file', label: 'File upload' },
  { value: 'signature', label: 'Signature' },
  { value: 'lookup', label: 'Lookup' },
];

export const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
  { value: 'yesNo', label: 'Yes / no' },
  { value: 'email', label: 'E-mail' },
];

export const RULE_OPS: { value: RuleOp; label: string; needsValue: boolean }[] = [
  { value: 'eq', label: 'is', needsValue: true },
  { value: 'ne', label: 'is not', needsValue: true },
  { value: 'in', label: 'is one of', needsValue: true },
  { value: 'gt', label: 'is more than', needsValue: true },
  { value: 'lt', label: 'is less than', needsValue: true },
  { value: 'filled', label: 'is answered', needsValue: false },
  { value: 'empty', label: 'is not answered', needsValue: false },
];

/** FormFields.ALLOWED_EXTENSIONS and DEFAULT_ACCEPT. */
export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff', 'heic', 'csv', 'txt', 'json', 'xml', 'xlsx', 'xls',
  'docx', 'doc', 'pptx', 'odt', 'ods', 'mp3', 'wav', 'm4a', 'mp4', 'mov', 'zip'];
export const DEFAULT_ACCEPT = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'txt', 'xlsx', 'docx'];
const UPLOAD_TYPES: FieldType[] = ['file', 'signature'];
const PLAIN_SOURCES: FieldType[] = ['text', 'number', 'date', 'choice', 'email', 'lookup'];

export const FORM_STATUSES: FormStatus[] = ['Draft', 'Active', 'Archived'];

/** The names the submission file gives its own values (FormFields.RESERVED); no field may take one. */
export const RESERVED_KEYS = ['submission_id', 'form_id', 'form_name', 'form_version', 'submitted_by', 'submitted_at'];

export const MAX_FIELDS = 50;
/** FormFields.MAX_PLACEHOLDER and MAX_HELP. */
export const MAX_PLACEHOLDER = 120;
export const MAX_HELP = 500;
/** FormFields.MAX_SECTION. */
export const MAX_SECTION = 80;

/** Fields with an options list: a choice and checkboxes. */
export function hasOptions(type: FieldType | string): boolean {
  return type === 'choice' || type === 'checkboxes';
}

/** A run of consecutive fields under one section title (null: fields with no section). */
export interface FieldGroup {
  section: string | null;
  fields: FormField[];
}

/** The fields in order, grouped: a field whose section differs from the one above starts a group (sections never reorder). */
export function sectionGroups(fields: FormField[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const f of fields) {
    const section = f.section?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.fields.push(f);
    else groups.push({ section, fields: [f] });
  }
  return groups;
}

/** The options ticked in a checkboxes answer. */
export function tickedOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' && value ? [value] : [];
}

/** A checkboxes field's limits in words: "Tick 1 to 3", "Tick at least 2", "Tick up to 3"; empty when it has none. */
export function selectionText(f: Pick<FormField, 'minSelected' | 'maxSelected'>): string {
  const min = f.minSelected ?? null;
  const max = f.maxSelected ?? null;
  if (min && max) return min === max ? `Tick ${min}` : `Tick ${min} to ${max}`;
  if (min) return `Tick at least ${min}`;
  if (max) return `Tick up to ${max}`;
  return '';
}
/** The types whose empty control shows a placeholder (FormFields.PLACEHOLDER_TYPES). */
export const PLACEHOLDER_TYPES: FieldType[] = ['text', 'longText', 'number', 'date', 'choice', 'email', 'lookup'];

export function takesPlaceholder(type: FieldType | string): boolean {
  return (PLACEHOLDER_TYPES as string[]).includes(type);
}

/** A bracketed part of a label: "(synthetic, SYN-nnn)", "[YYYY-MM-DD]". */
const BRACKETED = /\(([^()]*)\)|\[([^[\]]*)\]/g;
/** A number field's range written in its label: "(1-10)", "(0 to 100)". */
const RANGE = /^(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)$/i;
/** "e.g.", "eg", "example:", "like", "format:" in front of a hint -- as words, so "eggs" is not one. */
const EXAMPLE_PREFIX = /^(?:e\.\s?g\.?|eg|example|like|format)(?=[\s.:]|$)[.:]?\s*/i;
/** Words that read as a phone number field (a text field; forms have no phone type of their own). */
const PHONE_WORDS = /\b(?:phone|telephone|tel|mobile|cell)\b/i;

/**
 * UX2 (owner 2026-10-26, "need a placeholder"): what an empty control shows when its field has no placeholder of its
 * own. Text, e-mail and a phone number take the format hint in the label's brackets as an example ("Patient ID (synthetic,
 * SYN-nnn)" gives "e.g. SYN-nnn"); without one, an e-mail "name@example.com", a phone "e.g. +1 555 0100" and other text
 * "Enter <label>". Long text "Write <label>…"; a number "0", or its range ("1–10") from min and max or the label;
 * a choice or lookup "Choose…" and a date "Pick a date", as before. (Core keeps no number bounds on a field yet, so
 * a form's range comes from its label today; min and max are read when a field carries them.) The label stays the field's name: this is an example,
 * never instead of it. Null for the types with no empty box (yes/no, table, file, signature).
 */
export function defaultPlaceholder(f: Pick<FormField, 'label' | 'type' | 'key'> & { min?: number | null; max?: number | null }): string | null {
  switch (f.type) {
    case 'choice': case 'lookup': return 'Choose…';
    case 'date': return 'Pick a date';
    case 'number': return numberRange(f) ?? '0';
    case 'longText': return `Write ${spokenLabel(f.label) || 'your answer'}…`;
    case 'text': case 'email': {
      const hint = formatHint(f.label);
      if (hint) return `e.g. ${hint}`;
      if (f.type === 'email') return 'name@example.com';
      if (PHONE_WORDS.test(f.label) || PHONE_WORDS.test(f.key.replace(/_/g, ' '))) return 'e.g. +1 555 0100';
      return `Enter ${spokenLabel(f.label) || 'your answer'}`;
    }
    default: return null;
  }
}

/** What an empty control shows: the field's own placeholder when it has one, else the default for its type. */
export function placeholderOf(f: FormField): string | null {
  return f.placeholder?.trim() || defaultPlaceholder(f);
}

/**
 * The format in a label's brackets, if it has one: the part that looks like a format ("SYN-nnn", "YYYY-MM-DD", "#123")
 * or that the author marked as an example ("e.g. AB 12 34"). A unit ("cm") or a remark ("synthetic", "optional") is not.
 */
export function formatHint(label: string): string | null {
  for (const m of (label ?? '').matchAll(BRACKETED)) {
    for (const raw of (m[1] ?? m[2] ?? '').split(/[,;]/)) {
      const part = raw.trim();
      const marked = EXAMPLE_PREFIX.test(part) && part.replace(EXAMPLE_PREFIX, '').trim().length > 0;
      const text = part.replace(EXAMPLE_PREFIX, '').trim();
      if (!text || text.length > 40) continue;
      if (marked || (!/\s/.test(text) && /[-/.:#]|\d/.test(text) && !RANGE.test(text))) return text;
    }
  }
  return null;
}

function numberRange(f: { label: string; min?: number | null; max?: number | null }): string | null {
  if (f.min != null && f.max != null) return `${f.min}–${f.max}`;
  for (const m of (f.label ?? '').matchAll(BRACKETED)) {
    const range = RANGE.exec((m[1] ?? m[2] ?? '').trim());
    if (range) return `${range[1]}–${range[2]}`;
  }
  return null;
}

/**
 * A label as it reads inside a sentence: brackets and a trailing colon, question mark or asterisk dropped, in lower case;
 * in a label written in mixed case, an acronym keeps its capitals ("Patient ID" reads "patient ID", "PATIENT ID" "patient id").
 */
function spokenLabel(label: string): string {
  const plain = (label ?? '').replace(BRACKETED, ' ').replace(/[\s:?*.]+$/, '').replace(/\s+/g, ' ').trim();
  const mixed = /[a-z]/.test(plain);
  return plain.split(' ').map(w => mixed && /^[A-Z0-9]{2,}$/.test(w) && /[A-Z]/.test(w) ? w : w.toLowerCase()).join(' ');
}
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function typeLabel(type: string): string {
  return FIELD_TYPES.find(t => t.value === type)?.label ?? type;
}

/** A key from a label: "Wound location (cm)" -> "wound_location_cm", starting with a letter, at most 40. */
export function keyFromLabel(label: string): string {
  let key = (label || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(key)) key = key ? `f_${key}` : '';
  key = key.slice(0, 40).replace(/_+$/, '');
  return RESERVED_KEYS.includes(key) ? `${key}_1` : key;
}

/** A key no other field has: the label's, numbered when taken. */
export function uniqueKey(label: string, taken: string[]): string {
  const base = keyFromLabel(label) || 'field';
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, 36)}_${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

export function blankField(taken: string[], type: FieldType = 'text'): FormField {
  const label = `Question ${taken.length + 1}`;
  return { key: uniqueKey(label, taken), label, type, required: false, help: '', options: hasOptions(type) ? ['Option 1'] : null,
    ...typeDefaults(type) };
}

/** What a field of a type starts with: a table's first column, a file's accepted types, a lookup's empty source. */
export function typeDefaults(type: FieldType): Partial<FormField> {
  switch (type) {
    case 'table': return { columns: [{ key: 'item', label: 'Item', type: 'text', required: false }], maxRows: 20 };
    case 'file': return { accept: [...DEFAULT_ACCEPT], maxSizeMb: 10, maxFiles: 1 };
    case 'lookup': return { lookup: { formId: null, field: '' } };
    default: return {};
  }
}

// ---- rules (MIG-277) -----------------------------------------------------------------------------------------------

function isEmptyAnswer(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function same(answer: unknown, value: unknown): boolean {
  const a = num(answer);
  const b = num(value);
  if (a !== null && b !== null) return a === b;
  return String(answer).trim().toLowerCase() === String(value).trim().toLowerCase();
}

function order(answer: unknown, value: unknown): number {
  const a = num(answer);
  const b = num(value);
  if (a !== null && b !== null) return a - b;
  if (a !== null || b !== null) return 0;
  return String(answer).trim() < String(value).trim() ? -1 : String(answer).trim() > String(value).trim() ? 1 : 0;
}

/** Whether a rule holds on the answers (FormFields.holds): an unanswered field is empty. */
export function holds(rule: FieldRule, answers: Record<string, unknown>): boolean {
  const answer = answers[rule.field];
  const empty = isEmptyAnswer(answer);
  if (!empty && Array.isArray(answer) && rule.op !== 'filled' && rule.op !== 'empty') {
    // Checkboxes: eq is "this option is ticked", ne "it is not", in "one of these is" (FormFields.holds).
    const ticked = answer.filter(a => typeof a !== 'object');
    switch (rule.op) {
      case 'eq': return ticked.some(t => same(t, rule.value));
      case 'ne': return !ticked.some(t => same(t, rule.value));
      case 'in': return Array.isArray(rule.value) && ticked.some(t => (rule.value as unknown[]).some(v => same(t, v)));
      default: return false;
    }
  }
  switch (rule.op) {
    case 'filled': return !empty;
    case 'empty': return empty;
    case 'eq': return !empty && same(answer, rule.value);
    case 'ne': return empty || !same(answer, rule.value);
    case 'in': return !empty && Array.isArray(rule.value) && rule.value.some(v => same(answer, v));
    case 'gt': return !empty && order(answer, rule.value) > 0;
    case 'lt': return !empty && order(answer, rule.value) < 0;
    default: return false;
  }
}

/**
 * The fields the person is asked now, in order: a field whose showWhen does not hold is left out, and its answer does not
 * count for the fields below it -- exactly as Core reads them.
 */
export function visibleFields(fields: FormField[], answers: Answers): FormField[] {
  const counted: Record<string, unknown> = {};
  const shown: FormField[] = [];
  for (const f of fields) {
    if (f.showWhen && !holds(f.showWhen, counted)) continue;
    shown.push(f);
    counted[f.key] = answers[f.key];
  }
  return shown;
}

/** Whether a shown field must be answered now: required, or its requiredWhen holds. */
export function requiredNow(field: FormField, answers: Answers): boolean {
  return field.required || (!!field.requiredWhen && holds(field.requiredWhen, answers));
}

/** A rule in words: "Infected is Yes", "Amount is more than 1000". */
export function ruleText(rule: FieldRule | null | undefined, fields: FormField[]): string {
  if (!rule) return '';
  const on = fields.find(f => f.key === rule.field);
  const op = RULE_OPS.find(o => o.value === rule.op);
  const value = Array.isArray(rule.value) ? rule.value.join(', ') : rule.value === true || rule.value === 'true' ? 'Yes'
    : rule.value === false || rule.value === 'false' ? 'No' : rule.value;
  return `${on?.label ?? rule.field} ${op?.label ?? rule.op}${op?.needsValue ? ' ' + value : ''}`;
}

/** A table's rows that hold anything. */
export function filledRows(rows: unknown): TableRow[] {
  return Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object' && Object.values(r).some(v => !isEmptyAnswer(v))) : [];
}

/** Options typed one per line: blank lines dropped, each trimmed. */
export function optionsFromText(text: string): string[] {
  return (text || '').split('\n').map(o => o.trim()).filter(o => !!o);
}

/**
 * What is wrong with a draft, by field index ('form' for the form itself), as the builder shows it before saving.
 * The same rules FormFields applies on the server.
 */
export function definitionProblems(draft: FormDraft): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!draft.name.trim()) problems['form'] = 'Give the form a name.';
  else if (draft.name.trim().length > 120) problems['form'] = 'A form\'s name is at most 120 characters.';
  if (draft.fields.length > MAX_FIELDS) problems['form'] = `A form has at most ${MAX_FIELDS} fields.`;
  if (draft.status === 'Active' && !draft.fields.length) problems['form'] = 'Add at least one field before the form takes submissions.';
  const seen = new Set<string>();
  draft.fields.forEach((f, i) => {
    const key = (f.key || '').trim();
    let problem = '';
    if (!f.label.trim()) problem = 'Give it a label.';
    else if (f.label.trim().length > 120) problem = 'Its label is longer than 120 characters.';
    else if (!KEY.test(key)) problem = 'Its key must start with a lower-case letter and use only a-z, 0-9 and _ (at most 40).';
    else if (RESERVED_KEYS.includes(key)) problem = `The key '${key}' is used by the submission itself.`;
    else if (seen.has(key)) problem = `Another field already has the key '${key}'.`;
    else if ((f.help ?? '').trim().length > MAX_HELP) problem = `Its help text is longer than ${MAX_HELP} characters.`;
    else if ((f.section ?? '').trim().length > MAX_SECTION) problem = `Its section is longer than ${MAX_SECTION} characters.`;
    else if (/[\u0000-\u001f\u007f]/.test((f.section ?? '').trim())) problem = 'Its section is one line of text, with no line breaks or tabs.';
    else if (takesPlaceholder(f.type) && (f.placeholder ?? '').trim().length > MAX_PLACEHOLDER) {
      problem = `Its placeholder is longer than ${MAX_PLACEHOLDER} characters.`;
    } else if (takesPlaceholder(f.type) && /[\u0000-\u001f\u007f]/.test((f.placeholder ?? '').trim())) {
      problem = 'Its placeholder is one line of text, with no line breaks or tabs.';
    } else if (hasOptions(f.type) && !(f.options ?? []).filter(o => o.trim()).length) problem = 'A choice needs at least one option.';
    else if (hasOptions(f.type) && new Set((f.options ?? []).map(o => o.trim().toLowerCase())).size !== (f.options ?? []).length) {
      problem = 'An option is listed twice.';
    } else problem = extendedProblem(f, draft.fields.slice(0, i));
    seen.add(key);
    if (problem) problems[String(i)] = problem;
  });
  return problems;
}

/** MIG-277: what is wrong with a table, file or lookup field, or with a rule, in the words FormFields uses. */
function extendedProblem(f: FormField, earlier: FormField[]): string {
  if (f.type === 'table') {
    const columns = f.columns ?? [];
    if (!columns.length) return 'A table needs at least one column.';
    if (columns.length > 20) return 'A table has at most 20 columns.';
    const keys = new Set<string>();
    for (const [n, c] of columns.entries()) {
      if (!c.label.trim()) return `Column ${n + 1}: give it a label.`;
      if (!KEY.test(c.key)) return `Column ${n + 1}: its key must start with a lower-case letter and use only a-z, 0-9 and _.`;
      if (keys.has(c.key)) return `Column ${n + 1}: another column already has the key '${c.key}'.`;
      if (c.type === 'choice' && !(c.options ?? []).length) return `Column ${n + 1}: a choice needs at least one option.`;
      keys.add(c.key);
    }
    if (f.maxRows != null && (f.maxRows < 1 || f.maxRows > 200)) return 'Rows are from 1 to 200.';
  }
  if (f.type === 'file') {
    const bad = (f.accept ?? []).find(a => !ALLOWED_EXTENSIONS.includes(a));
    if (bad) return `'${bad}' files cannot be accepted.`;
    if (f.maxSizeMb != null && (f.maxSizeMb < 1 || f.maxSizeMb > 25)) return 'The largest file is from 1 to 25 MB.';
    if (f.maxFiles != null && (f.maxFiles < 1 || f.maxFiles > 10)) return 'A field takes 1 to 10 files.';
  }
  if (f.type === 'lookup' && (!f.lookup?.formId || !f.lookup.field)) return 'Pick the form and the field whose answers it offers.';
  if (f.type === 'checkboxes') {
    const count = (f.options ?? []).filter(o => o.trim()).length;
    const min = f.minSelected ?? null;
    const max = f.maxSelected ?? null;
    if (min != null && (min < 0 || min > count)) return `The least to tick is from 0 to ${count} (its options).`;
    if (max != null && (max < 1 || max > count)) return `The most to tick is from 1 to ${count} (its options).`;
    if (min != null && max != null && min > max) return 'The least to tick is more than the most.';
  }
  for (const [rule, what] of [[f.showWhen, 'shown'], [f.requiredWhen, 'required']] as const) {
    if (!rule) continue;
    const on = earlier.find(e => e.key === rule.field);
    if (!on) return `It can be ${what} only by a field above it.`;
    const op = RULE_OPS.find(o => o.value === rule.op);
    if (!op) return 'Pick the rule\'s test.';
    if (op.needsValue && (on.type === 'table' || UPLOAD_TYPES.includes(on.type))) return `A ${on.type} field can only be tested for answered or not.`;
    if (on.type === 'checkboxes' && (rule.op === 'gt' || rule.op === 'lt')) return 'A checkboxes field is tested for an option ticked (is, is not, is one of) or answered.';
    if (op.needsValue && isEmptyAnswer(rule.value)) return `Say what '${on.label}' is compared with.`;
  }
  return '';
}

/** A rule as saved: its value only when the test needs one, 'in' as a list, yes/no as a boolean. */
function ruleForSave(rule: FieldRule | null | undefined, fields: FormField[]): FieldRule | null {
  if (!rule || !rule.field) return null;
  const op = RULE_OPS.find(o => o.value === rule.op);
  if (!op?.needsValue) return { field: rule.field, op: rule.op };
  const on = fields.find(f => f.key === rule.field);
  let value = rule.value;
  if (rule.op === 'in') value = Array.isArray(value) ? value : String(value ?? '').split(',').map(v => v.trim()).filter(v => !!v);
  else if (on?.type === 'yesNo') value = value === true || value === 'true';
  return { field: rule.field, op: rule.op, value };
}

/** What POST form.json/save sends: trimmed, a non-choice without options, blank help and placeholder dropped (and a placeholder
 * where no control shows one). */
export function draftForSave(draft: FormDraft): FormDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    workflowKey: draft.workflowKey?.trim() || null,
    fields: draft.fields.map(f => ({
      key: f.key.trim(), label: f.label.trim(), type: f.type, required: !!f.required,
      help: f.help?.trim() || null,
      ...(takesPlaceholder(f.type) && f.placeholder?.trim() ? { placeholder: f.placeholder.trim() } : {}),
      ...(f.section?.trim() ? { section: f.section.trim() } : {}),
      ...(f.personal ? { personal: true } : {}),
      options: hasOptions(f.type) ? (f.options ?? []).map(o => o.trim()).filter(o => !!o) : null,
      ...(f.type === 'checkboxes' && f.minSelected ? { minSelected: f.minSelected } : {}),
      ...(f.type === 'checkboxes' && f.maxSelected ? { maxSelected: f.maxSelected } : {}),
      ...(ruleForSave(f.showWhen, draft.fields) ? { showWhen: ruleForSave(f.showWhen, draft.fields) } : {}),
      ...(ruleForSave(f.requiredWhen, draft.fields) ? { requiredWhen: ruleForSave(f.requiredWhen, draft.fields) } : {}),
      ...(f.type === 'table' ? {
        columns: (f.columns ?? []).map(c => ({ key: c.key.trim(), label: c.label.trim(), type: c.type, required: !!c.required,
          options: c.type === 'choice' ? (c.options ?? []).map(o => o.trim()).filter(o => !!o) : null })),
        maxRows: f.maxRows ?? 20,
      } : {}),
      ...(f.type === 'file' ? { accept: f.accept ?? [...DEFAULT_ACCEPT], maxSizeMb: f.maxSizeMb ?? 10, maxFiles: f.maxFiles ?? 1,
        ...(f.toDocuments ? { toDocuments: true } : {}) } : {}),
      ...(f.type === 'lookup' ? { lookup: f.lookup ?? null } : {}),
    })),
  };
}

/**
 * What is wrong with the answers, by field key -- the same checks Core makes, so the person sees them before sending.
 * Only answered fields and required ones are looked at.
 */
export function answerProblems(fields: FormField[], answers: Answers, lookupValues: Record<string, string[]> = {}): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const f of visibleFields(fields, answers)) {
    const raw = answers[f.key];
    const value = f.type === 'table' ? filledRows(raw) : raw;
    if (isEmptyAnswer(value)) {
      if (requiredNow(f, answers)) problems[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.type === 'table') {
      const wrong = tableProblems(f, value as TableRow[]);
      if (wrong) problems[f.key] = wrong;
      continue;
    }
    if (f.type === 'file') {
      const most = f.maxFiles ?? 1;
      if (Array.isArray(value) && value.length > most) problems[f.key] = most === 1 ? 'Attach one file.' : `Attach at most ${most} files.`;
      continue;
    }
    if (f.type === 'signature') continue;
    if (f.type === 'checkboxes') {
      const ticked = tickedOf(value);
      const unknown = ticked.find(t => !(f.options ?? []).includes(t));
      if (unknown) problems[f.key] = `'${unknown}' is not an option.`;
      else if (f.minSelected && ticked.length < f.minSelected) problems[f.key] = `Tick at least ${f.minSelected} (this has ${ticked.length}).`;
      else if (f.maxSelected && ticked.length > f.maxSelected) problems[f.key] = `Tick at most ${f.maxSelected} (this has ${ticked.length}).`;
      continue;
    }
    if (f.type === 'lookup') {
      const text = String(value).trim().toLowerCase();
      if (!(lookupValues[f.key] ?? []).some(v => v.toLowerCase() === text)) problems[f.key] = 'Choose one of the listed values.';
      continue;
    }
    const wrong = scalarProblem(f, value);
    if (wrong) problems[f.key] = wrong;
  }
  return problems;
}

/** A table's rows against its columns: "Row 2: Dose: enter a number." */
function tableProblems(table: FormField, rows: TableRow[]): string {
  const most = table.maxRows ?? 20;
  if (rows.length > most) return `At most ${most} rows (this has ${rows.length}).`;
  for (const [n, row] of rows.entries()) {
    for (const c of table.columns ?? []) {
      const cell = row[c.key];
      if (isEmptyAnswer(cell)) {
        if (c.required) return `Row ${n + 1}: ${c.label} is required.`;
        continue;
      }
      const wrong = scalarProblem(c, cell);
      if (wrong) return `Row ${n + 1}: ${c.label}: ${wrong.charAt(0).toLowerCase()}${wrong.slice(1)}`;
    }
  }
  return '';
}

function scalarProblem(f: FormField, value: unknown): string {
  const problems: Record<string, string> = {};
  {
    const text = typeof value === 'string' ? value.trim() : '';
    switch (f.type) {
      case 'text': if (text.length > 500) problems[f.key] = `At most 500 characters (this is ${text.length}).`; break;
      case 'longText': if (text.length > 5000) problems[f.key] = `At most 5000 characters (this is ${text.length}).`; break;
      case 'email': if (!EMAIL.test(text)) problems[f.key] = 'Enter an e-mail address, like name@example.com.'; break;
      case 'number': if (!/^-?\d+(\.\d+)?$/.test(text)) problems[f.key] = 'Enter a number.'; break;
      case 'date': if (!DATE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) problems[f.key] = 'Enter a date.'; break;
      case 'choice': if (!(f.options ?? []).includes(text)) problems[f.key] = `Choose one of ${(f.options ?? []).join(', ')}.`; break;
      case 'yesNo': if (typeof value !== 'boolean') problems[f.key] = 'Answer yes or no.'; break;
    }
  }
  return problems[f.key] ?? '';
}

/** The answers as sent: blank ones left out, text trimmed, numbers as numbers. */
export function answersForSubmit(fields: FormField[], answers: Answers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of visibleFields(fields, answers)) {
    const value = answers[f.key];
    if (isEmptyAnswer(value)) continue;
    switch (f.type) {
      case 'table': {
        const rows = filledRows(value).map(row => {
          const kept: Record<string, unknown> = {};
          for (const c of f.columns ?? []) {
            const cell = row[c.key];
            if (isEmptyAnswer(cell)) continue;
            kept[c.key] = c.type === 'number' && typeof cell === 'string' ? Number(cell.trim()) : typeof cell === 'string' ? cell.trim() : cell;
          }
          return kept;
        });
        if (rows.length) out[f.key] = rows;
        break;
      }
      case 'file': out[f.key] = (value as UploadRef[]).map(u => u.uploadId); break;
      case 'signature': out[f.key] = (value as UploadRef).uploadId; break;
      case 'checkboxes': out[f.key] = (f.options ?? []).filter(o => tickedOf(value).includes(o)); break;
      default:
        out[f.key] = f.type === 'number' && typeof value === 'string' ? Number(value.trim()) : typeof value === 'string' ? value.trim() : value;
    }
  }
  return out;
}

/** The types a lookup may take its values from (FormService.LOOKUP_SOURCES). */
export function lookupSources(fields: FormField[] | undefined): FormField[] {
  return (fields ?? []).filter(f => PLAIN_SOURCES.includes(f.type));
}

/** A submission's outcome in words: Received, Run started #id, Run not started. */
export function submissionStatusText(s: Pick<Submission, 'status' | 'jobQueueId'>): string {
  if (s.status === 'RunStarted') return s.jobQueueId ? `Run started #${s.jobQueueId}` : 'Run started';
  if (s.status === 'RunNotStarted') return 'Run not started';
  return 'Received';
}

export function submissionTone(status: string): 'ok' | 'crit' | 'neutral' {
  return status === 'RunStarted' ? 'ok' : status === 'RunNotStarted' ? 'crit' : 'neutral';
}

/** An approval status's colour: approved green, rejected or failed red, overdue amber, the rest neutral. */
export function approvalTone(status: string | null | undefined): 'ok' | 'crit' | 'warn' | 'neutral' {
  if (status === 'Approved' || status === 'Completed') return 'ok';
  if (status === 'Rejected' || status === 'Failed' || status === 'NotStarted') return 'crit';
  if (status === 'Overdue') return 'warn';
  return 'neutral';
}

export function approvalText(status: string | null | undefined): string {
  // Owner 2026-10-27: a status with no words of its own ("ChangesRequested") reads as words, never its code.
  return status === 'NotStarted' ? 'Not started' : codeWords(status ?? '');
}

export function formTone(status: string): 'ok' | 'warn' | 'neutral' {
  return status === 'Active' ? 'ok' : status === 'Draft' ? 'warn' : 'neutral';
}

/** An answer as a person reads it. */
export function answerText(field: FormField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.type === 'signature' || (value && typeof value === 'object' && !Array.isArray(value) && 'uploadId' in value)) {
    return field?.type === 'signature' ? 'Signed' : String((value as UploadRef).name);
  }
  if (Array.isArray(value)) {
    if (field?.type === 'table' || value.every(v => v && typeof v === 'object' && !('uploadId' in v))) {
      return `${value.length} row${value.length === 1 ? '' : 's'}`;
    }
    return value.map(v => (v as UploadRef).name ?? String(v)).join(', ');
  }
  if (typeof value === 'boolean' || field?.type === 'yesNo') return value === true || value === 'true' ? 'Yes' : 'No';
  return String(value);
}

/** Only the rows that are forms, and only the submissions that are submissions: anything else is dropped. */
export function formsOf(data: unknown): FormSummary[] {
  return Array.isArray(data) ? data.filter(f => f && typeof f === 'object' && typeof f.formId === 'number') : [];
}

export function submissionsOf(data: unknown): Submission[] {
  return Array.isArray(data)
    ? data.filter(s => s && typeof s === 'object' && typeof s.submissionId === 'number').map(s => ({ ...s, answers: s.answers ?? {} }))
    : [];
}
