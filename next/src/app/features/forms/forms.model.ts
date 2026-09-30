/**
 * Wave 5 Forms (lite): a workspace's forms, as Core answers them (/form.json, /formSubmission.json), and the rules the
 * console checks as the person types. Core checks the same rules again (process.forms.FormFields) and its answer is the
 * one that counts: a refusal is shown word for word.
 *
 * Owner decision 2026-09-30: a form is shared inside its workspace only -- there are no public or expiring links yet.
 */

export type FieldType = 'text' | 'longText' | 'number' | 'date' | 'choice' | 'yesNo' | 'email';
export type FormStatus = 'Draft' | 'Active' | 'Archived';
export type SubmissionStatus = 'Received' | 'RunStarted' | 'RunNotStarted';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help?: string | null;
  options?: string[] | null;
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
}

/** What POST form.json/save takes. */
export interface FormDraft {
  formId?: number | null;
  name: string;
  description: string;
  status: FormStatus;
  jobId: number | null;
  fields: FormField[];
}

export type Answers = Record<string, string | boolean | null>;

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'choice', label: 'Choice' },
  { value: 'yesNo', label: 'Yes / no' },
  { value: 'email', label: 'E-mail' },
];

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
  return { key: uniqueKey(label, taken), label, type, required: false, help: '', options: type === 'choice' ? ['Option 1'] : null };
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
    }
    seen.add(key);
    if (problem) problems[String(i)] = problem;
  });
  return problems;
}

/** What POST form.json/save sends: trimmed, a non-choice without options, blank help dropped. */
export function draftForSave(draft: FormDraft): FormDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    fields: draft.fields.map(f => ({
      key: f.key.trim(), label: f.label.trim(), type: f.type, required: !!f.required,
      help: f.help?.trim() || null, options: f.type === 'choice' ? (f.options ?? []).map(o => o.trim()).filter(o => !!o) : null,
    })),
  };
}

/**
 * What is wrong with the answers, by field key -- the same checks Core makes, so the person sees them before sending.
 * Only answered fields and required ones are looked at.
 */
export function answerProblems(fields: FormField[], answers: Answers): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const value = answers[f.key];
    const blank = value === null || value === undefined || (typeof value === 'string' && !value.trim());
    if (blank) {
      if (f.required) problems[f.key] = `${f.label} is required.`;
      continue;
    }
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
  return problems;
}

/** The answers as sent: blank ones left out, text trimmed, numbers as numbers. */
export function answersForSubmit(fields: FormField[], answers: Answers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = answers[f.key];
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) continue;
    out[f.key] = f.type === 'number' && typeof value === 'string' ? Number(value.trim()) : typeof value === 'string' ? value.trim() : value;
  }
  return out;
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

export function formTone(status: string): 'ok' | 'warn' | 'neutral' {
  return status === 'Active' ? 'ok' : status === 'Draft' ? 'warn' : 'neutral';
}

/** An answer as a person reads it. */
export function answerText(field: FormField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
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
