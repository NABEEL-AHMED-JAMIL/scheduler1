/**
 * Wave 5 Forms (lite): a workspace's forms, as Core answers them (/form.json, /formSubmission.json), and the rules the
 * console checks as the person types. Core checks the same rules again (process.forms.FormFields) and its answer is the
 * one that counts: a refusal is shown word for word.
 *
 * Owner decision 2026-09-30: a form is shared inside its workspace only -- there are no public or expiring links yet.
 */

export type FieldType = 'text' | 'longText' | 'number' | 'date' | 'choice' | 'yesNo' | 'email' | 'table' | 'file' | 'signature' | 'lookup';
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
  help?: string | null;
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
  /** MIG-279: the request it started and its status now -- Pending, Overdue, Approved, Rejected ... -- or NotStarted. */
  workflowInstanceId?: number | null;
  workflowStatus?: string | null;
  workflowReason?: string | null;
  /** MIG-280: the step its request waits at now ("Manager approval"); none once it ended. */
  workflowStage?: string | null;
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

export type AnswerValue = string | boolean | null | TableRow[] | UploadRef[] | UploadRef;
export type Answers = Record<string, AnswerValue>;

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
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
  return { key: uniqueKey(label, taken), label, type, required: false, help: '', options: type === 'choice' ? ['Option 1'] : null,
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
    else if (f.type === 'choice' && !(f.options ?? []).filter(o => o.trim()).length) problem = 'A choice needs at least one option.';
    else if (f.type === 'choice' && new Set((f.options ?? []).map(o => o.trim().toLowerCase())).size !== (f.options ?? []).length) {
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
  for (const [rule, what] of [[f.showWhen, 'shown'], [f.requiredWhen, 'required']] as const) {
    if (!rule) continue;
    const on = earlier.find(e => e.key === rule.field);
    if (!on) return `It can be ${what} only by a field above it.`;
    const op = RULE_OPS.find(o => o.value === rule.op);
    if (!op) return 'Pick the rule\'s test.';
    if (op.needsValue && (on.type === 'table' || UPLOAD_TYPES.includes(on.type))) return `A ${on.type} field can only be tested for answered or not.`;
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

/** What POST form.json/save sends: trimmed, a non-choice without options, blank help dropped. */
export function draftForSave(draft: FormDraft): FormDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    workflowKey: draft.workflowKey?.trim() || null,
    fields: draft.fields.map(f => ({
      key: f.key.trim(), label: f.label.trim(), type: f.type, required: !!f.required,
      help: f.help?.trim() || null, options: f.type === 'choice' ? (f.options ?? []).map(o => o.trim()).filter(o => !!o) : null,
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
  return status === 'NotStarted' ? 'Not started' : status ?? '';
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
