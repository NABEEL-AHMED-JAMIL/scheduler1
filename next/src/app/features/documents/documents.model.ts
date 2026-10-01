/**
 * MIG-272: Document Intelligence's shapes and the pure rules the overview, the review screen and the type editor share.
 *
 * Field names are the services' own: media-service's /documentOcr.json (MIG-268) and ai-service's /documentType.json,
 * /documentExtraction.json (MIG-269, MIG-270) and /documentReview.json. The services have the last word on every rule;
 * these only decide what the console shows and what it asks for.
 *
 * Owner decision: a value read from a customer's document is shown exactly as it is stored -- never reformatted as a
 * number, a money amount or a date -- so a reviewer compares the page with what was really kept.
 */
import { HttpErrorResponse } from '@angular/common/http';

// ---------------------------------------------------------------------------------------------- vocabularies

/** What an extraction goes through: Queued and Running while the model works, then one of the rest. */
export const EXTRACTION_STATUSES = ['Queued', 'Running', 'Unclassified', 'Failed', 'Review', 'Approved', 'Rejected'] as const;
/** What the review queue lists. */
export const QUEUE_STATUSES = ['Review', 'Approved', 'Rejected'] as const;
export const CLAIM_FILTERS = [
  { value: '', label: 'Anyone\'s' }, { value: 'mine', label: 'Claimed by me' },
  { value: 'unclaimed', label: 'Not claimed' }, { value: 'others', label: 'Claimed by others' },
] as const;
export const CONFIDENCE_FILTERS = [
  { value: '', label: 'Any confidence' }, { value: '0.5', label: 'Least sure under 50%' },
  { value: '0.8', label: 'Least sure under 80%' }, { value: '0.9', label: 'Least sure under 90%' },
] as const;
export const AGE_FILTERS = [
  { value: '', label: 'Any age' }, { value: '15', label: 'Waiting 15 min or more' },
  { value: '60', label: 'Waiting an hour or more' }, { value: '1440', label: 'Waiting a day or more' },
] as const;

/** The field types a document type may declare (DocumentTypeDefinition). */
export const FIELD_TYPES = ['text', 'number', 'integer', 'money', 'date', 'boolean', 'choice'] as const;
/** The rules a document type may keep (DocumentTypes.RULES), each with what it needs. */
export const RULE_KINDS = ['sumEquals', 'sumOf', 'rowProduct', 'notAfter', 'matches', 'checkDigit'] as const;
export type RuleKind = typeof RULE_KINDS[number];
export const RULE_LABELS: Record<RuleKind, string> = {
  sumEquals: 'A table column adds up to a field',
  sumOf: 'Fields add up to a field',
  rowProduct: 'In every row, two columns multiply to a third',
  notAfter: 'One date is on or before another',
  matches: 'Every value has a form (a pattern)',
  checkDigit: 'An ID\'s check digit holds',
};
/** What OCR reads (media's OcrReader): anything else is refused before it is queued. */
export const OCR_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp'];

/** A confidence under this, without a type's own threshold, is flagged for a reviewer (the prototype's line). */
export const DEFAULT_LOW_CONFIDENCE = 0.8;

// ---------------------------------------------------------------------------------------------- shapes

/** One OCR read, as /documentOcr.json lists it. */
export interface OcrDocument {
  ocrDocumentId: number;
  tenantId?: number | null;
  sourceBucket: string;
  sourceKey: string;
  sourceContentType?: string | null;
  sourceSize?: number | null;
  status: string;
  pageCount?: number | null;
  pagesRead?: number | null;
  wordCount?: number | null;
  meanConfidence?: number | null;
  truncated?: boolean | null;
  error?: string | null;
  requestedBy?: number | null;
  dateCreated?: string | null;
  dateStarted?: string | null;
  dateFinished?: string | null;
  /** MIG-271: how the file arrived (upload, email, form, connector); absent for a read of a stored file. */
  intakeChannel?: string | null;
  /** MIG-271: where it came from, as a person reads it ("Email from ...: subject"). */
  intakeLabel?: string | null;
  /** MIG-271: the file's own name as it arrived. */
  originalName?: string | null;
}

/** MIG-271: what became of one file offered to Document Intelligence (/documentOcr.json/upload's answer, per file). */
export interface IntakeAnswer {
  intakeId: number;
  fileName: string;
  outcome: 'Accepted' | 'Duplicate' | 'Refused';
  reason?: string | null;
  ocrDocumentId?: number | null;
}

/** MIG-271: one file offered by any channel, as /documentOcr.json/intakes lists it. */
export interface IntakeRow extends IntakeAnswer {
  channel: string;
  sourceLabel?: string | null;
  contentType?: string | null;
  sizeBytes: number;
  extractionId?: number | null;
  extractionNote?: string | null;
  createdBy?: number | null;
  dateCreated?: string | null;
}

/** MIG-271: the workspace's email-in address (/documentOcr.json/mailbox). */
export interface Mailbox {
  configured: boolean;
  active: boolean;
  address: string | null;
  domain: string;
  /** False when the platform has no inbound mail domain: email-in cannot be turned on. */
  enabled: boolean;
  maxFiles: number;
  maxFileSizeMb: number;
}

/** MIG-271: how a channel is named on the screen. */
export const CHANNEL_LABELS: Record<string, string> = { upload: 'Upload', email: 'Email', form: 'Form', connector: 'Connector' };

export interface Box { left: number; top: number; width: number; height: number; }

/** A rule's outcome on a document: `index` is the rule's place (from 1) in the type version's rules. */
export interface RuleOutcome {
  index: number;
  rule: string;
  status: 'passed' | 'failed' | 'skipped' | string;
  message?: string | null;
  fields?: string[];
}

/** One extraction, as fetchAll, the queue and fetchById share it. */
export interface Extraction {
  extractionId: number;
  tenantId?: number | null;
  ocrDocumentId: number;
  status: string;
  documentTypeId?: number | null;
  documentTypeVersion?: number | null;
  documentTypeKey?: string | null;
  documentTypeName?: string | null;
  classifiedBy?: string | null;
  classificationConfidence?: number | null;
  model?: string | null;
  /** The least sure value's confidence, 0 to 1; null before the model has answered. */
  minConfidence?: number | null;
  fieldCount?: number | null;
  /** How many values a reviewer should look at. */
  reviewCount?: number | null;
  autoApproved?: boolean | null;
  problems?: string[] | null;
  error?: string | null;
  requestedBy?: number | null;
  requestedByName?: string | null;
  dateCreated?: string | null;
  dateStarted?: string | null;
  dateFinished?: string | null;
  /** Sent back with every decision: the service refuses one made on a document that has changed since. */
  revision: number;
  claimedBy?: number | null;
  claimedByName?: string | null;
  claimedAt?: string | null;
  /** Whether the claim is still held (claims lapse). */
  claimActive?: boolean | null;
  reviewedBy?: number | null;
  reviewedByName?: string | null;
  dateReviewed?: string | null;
  rejectReason?: string | null;
  ruleOverride?: boolean | null;
  ruleResults?: RuleOutcome[] | null;
  autoApproveThreshold?: number | null;
}

/** One value on the review screen: a document field, or a cell of a table's row. */
export interface ExtractedField {
  fieldId: number;
  fieldKey: string;
  tableKey?: string | null;
  rowIndex?: number | null;
  /** As stored: shown as is. */
  value: string | null;
  confidence?: number | null;
  /** From 1; null when the value is not on a page (a correction, or nothing found). */
  page?: number | null;
  /** In the page image's own pixels. */
  box?: Box | null;
  sourceText?: string | null;
  /** What is wrong with it now. */
  problems?: string[];
  sourceProblems?: string[];
  corrected?: boolean;
  label?: string | null;
  type?: string | null;
  required?: boolean | null;
}

export interface Checks {
  rules: RuleOutcome[];
  documentProblems: string[];
  anyRuleFailed: boolean;
  canApprove: boolean;
  blockingProblems: string[];
}

export interface CorrectionRow {
  correctionId: number;
  fieldId?: number | null;
  fieldKey: string;
  tableKey?: string | null;
  rowIndex?: number | null;
  oldValue?: string | null;
  newValue?: string | null;
  oldConfidence?: number | null;
  correctedBy?: number | null;
  correctedByName?: string | null;
  dateCreated?: string | null;
}

export interface TypeField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  description?: string | null;
  aliases?: string[] | null;
  options?: string[] | null;
}

export interface TypeTable {
  key: string;
  label: string;
  description?: string | null;
  required?: boolean;
  columns: TypeField[];
}

export interface TypeRule {
  rule: string;
  table?: string | null;
  column?: string | null;
  field?: string | null;
  fields?: string[] | null;
  columns?: string[] | null;
  tolerance?: number | null;
  pattern?: string | null;
  algorithm?: string | null;
  before?: string | null;
  after?: string | null;
  message?: string | null;
}

export interface TypeDefinition {
  description?: string | null;
  keywords?: string[] | null;
  instructions?: string | null;
  autoApproveThreshold?: number | null;
  fields: TypeField[];
  tables: TypeTable[];
  rules: TypeRule[];
}

/** /documentReview.json/fetchById: the document as the review screen shows it. */
export interface ReviewDetail extends Extraction {
  definition?: TypeDefinition | null;
  fields: ExtractedField[];
  checks?: Checks | null;
  corrections?: CorrectionRow[];
  corrected?: number;
}

export interface TypeVersionRow { version: number; name?: string | null; createdBy?: number | null; dateCreated?: string | null; }

/** A document type, as /documentType.json lists it (fetchById adds its versions). */
export interface DocumentType {
  documentTypeId: number;
  tenantId?: number | null;
  builtIn: boolean;
  typeKey: string;
  name: string;
  description?: string | null;
  status: string;
  currentVersion: number;
  fieldCount?: number | null;
  tableCount?: number | null;
  autoApproveThreshold?: number | null;
  definition?: TypeDefinition | null;
  dateCreated?: string | null;
  dateUpdated?: string | null;
  versions?: TypeVersionRow[];
}

/** /documentType.json/version: one version exactly as saved. */
export interface TypeVersion {
  documentTypeId: number;
  typeKey: string;
  version: number;
  current: boolean;
  name: string;
  autoApproveThreshold?: number | null;
  definition: TypeDefinition;
  dateCreated?: string | null;
}

/** /documentExtraction.json/stats: one type's numbers over `days`. */
export interface TypeStats {
  documentTypeId: number;
  typeKey: string;
  name: string;
  builtIn?: boolean;
  documents: number;
  autoApproved: number;
  approvedByReviewer: number;
  rejected: number;
  inReview: number;
  failed: number;
  autoApproveRate?: number | null;
  reviewedFields: number;
  correctedFields: number;
  fieldAccuracy?: number | null;
  days?: number;
}

export interface QueuePage { total: number; page: number; size: number; items: Extraction[]; }

export interface DatasetRow {
  datasetRowId: number;
  extractionId: number;
  documentTypeId: number;
  documentTypeVersion: number;
  typeKey: string;
  approval: string;
  approvedBy?: number | null;
  dateCreated?: string | null;
  row: { fields: Record<string, unknown>; tables: Record<string, Record<string, unknown>[]> };
}

export interface DatasetPage { total: number; page: number; size: number; rows: DatasetRow[]; }

/** One change a reviewer sends: by fieldId, or a cell of a new row by table, row and column. */
export interface CorrectionSent {
  fieldId?: number;
  tableKey?: string;
  rowIndex?: number;
  fieldKey?: string;
  value: string | null;
}

// ---------------------------------------------------------------------------------------------- confidence

/** 0.867 -> 87; null stays null (nothing measured). */
export function percent(confidence: number | null | undefined): number | null {
  return confidence == null || Number.isNaN(confidence) ? null : Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/** The line under which a value is flagged: the type's auto-approve threshold, else the default. */
export function lowLine(threshold: number | null | undefined): number {
  return threshold != null && threshold > 0 && threshold <= 1 ? threshold : DEFAULT_LOW_CONFIDENCE;
}

/** A value a reviewer should look at: something wrong with it, or less sure than the line. A corrected value is a person's. */
export function isLow(field: Pick<ExtractedField, 'confidence' | 'problems' | 'corrected'>, line: number): boolean {
  if ((field.problems ?? []).length) return true;
  if (field.corrected) return false;
  return field.confidence == null || field.confidence < line;
}

// ---------------------------------------------------------------------------------------------- labels

/** The status a person reads: Review is "In review"; an approval the document made on its own says so. */
export function statusLabel(e: Pick<Extraction, 'status' | 'autoApproved'>): string {
  if (e.status === 'Review') return 'In review';
  if (e.status === 'Approved' && e.autoApproved) return 'Auto-approved';
  return e.status || '—';
}

/** Whether the model is still at work on it. */
export function isWorking(status: string | null | undefined): boolean {
  return status === 'Queued' || status === 'Running';
}

/** The file's own name: the key's last segment. */
export function fileName(key: string | null | undefined): string {
  if (!key) return '—';
  const cut = key.lastIndexOf('/');
  return cut >= 0 ? key.slice(cut + 1) : key;
}

/** "Invoice v2", or the key when the name is unknown, or "Not classified". */
export function typeLabel(e: Pick<Extraction, 'documentTypeName' | 'documentTypeKey' | 'documentTypeVersion'>): string {
  const name = e.documentTypeName || e.documentTypeKey;
  if (!name) return 'Not classified';
  return e.documentTypeVersion ? `${name} v${e.documentTypeVersion}` : name;
}

/** A field's name on the review screen: its label, and for a table cell the table and the row too. */
export function fieldName(field: ExtractedField, definition?: TypeDefinition | null): string {
  const label = field.label || field.fieldKey;
  if (!field.tableKey) return label;
  const table = definition?.tables?.find(t => t.key === field.tableKey);
  return `${table?.label || field.tableKey} row ${(field.rowIndex ?? 0) + 1} · ${label}`;
}

// ---------------------------------------------------------------------------------------------- the review screen

/** The document's own fields (not table cells), in the type's order; a field the type no longer names goes last. */
export function documentFields(fields: ExtractedField[], definition?: TypeDefinition | null): ExtractedField[] {
  const order = new Map((definition?.fields ?? []).map((f, i) => [f.key, i]));
  return fields.filter(f => !f.tableKey)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (order.get(a.f.fieldKey) ?? 1000 + a.i) - (order.get(b.f.fieldKey) ?? 1000 + b.i))
    .map(x => x.f);
}

export interface TableView {
  key: string;
  label: string;
  required: boolean;
  columns: { key: string; label: string; type: string }[];
  /** One entry per row index, a cell per column (null when the row has no value for it). */
  rows: { index: number; cells: (ExtractedField | null)[] }[];
}

/** The type's tables with the rows the document has, in row and column order. */
export function tableViews(fields: ExtractedField[], definition?: TypeDefinition | null): TableView[] {
  const tables = definition?.tables ?? [];
  const known = new Set(tables.map(t => t.key));
  const extra = [...new Set(fields.filter(f => f.tableKey && !known.has(f.tableKey)).map(f => f.tableKey as string))];
  const all: TypeTable[] = [...tables, ...extra.map(key => ({
    key, label: key, columns: [...new Set(fields.filter(f => f.tableKey === key).map(f => f.fieldKey))]
      .map(c => ({ key: c, label: fields.find(f => f.tableKey === key && f.fieldKey === c)?.label || c, type: 'text' })),
  }))];
  return all.map(t => {
    const cells = fields.filter(f => f.tableKey === t.key);
    const indexes = [...new Set(cells.map(c => c.rowIndex ?? 0))].sort((a, b) => a - b);
    return {
      key: t.key, label: t.label || t.key, required: !!t.required,
      columns: t.columns.map(c => ({ key: c.key, label: c.label || c.key, type: c.type })),
      rows: indexes.map(index => ({
        index, cells: t.columns.map(c => cells.find(x => (x.rowIndex ?? 0) === index && x.fieldKey === c.key) ?? null),
      })),
    };
  });
}

/** The row index a new row of this table is added as: after the last one. */
export function nextRowIndex(fields: ExtractedField[], tableKey: string): number {
  const rows = fields.filter(f => f.tableKey === tableKey).map(f => f.rowIndex ?? 0);
  return rows.length ? Math.max(...rows) + 1 : 0;
}

/**
 * What a save sends: every edited value that differs from what is stored, by fieldId, then the new row's cells by
 * table, row and column (a new row with nothing typed is left out). Blank is sent as null: the field is emptied.
 */
export function correctionsOf(fields: ExtractedField[], edits: Record<number, string>,
                              newRow: { tableKey: string; rowIndex: number; values: Record<string, string> } | null): CorrectionSent[] {
  const out: CorrectionSent[] = [];
  for (const f of fields) {
    if (!(f.fieldId in edits)) continue;
    const typed = edits[f.fieldId];
    const now = typed.trim() === '' ? null : typed;
    if (now !== (f.value ?? null)) out.push({ fieldId: f.fieldId, value: now });
  }
  if (newRow && Object.values(newRow.values).some(v => v.trim() !== '')) {
    for (const [fieldKey, value] of Object.entries(newRow.values)) {
      out.push({ tableKey: newRow.tableKey, rowIndex: newRow.rowIndex, fieldKey, value: value.trim() === '' ? null : value });
    }
  }
  return out;
}

/** Where ↑/↓ moves the selection, staying inside the list. -1 means nothing selected yet. */
export function stepIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + delta));
}

export type Shortcut = 'approve' | 'reject' | 'next' | 'previous';

/**
 * The review screen's keys: A approves, R rejects, ↓ and ↑ move between fields. None fires while a person is typing
 * -- in an input, a text area, a select or anything editable -- or with a modifier held (Ctrl+R is the browser's).
 */
export function shortcutOf(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): Shortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target as (HTMLElement & { isContentEditable?: boolean }) | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return null;
  switch (event.key) {
    case 'a': case 'A': return 'approve';
    case 'r': case 'R': return 'reject';
    case 'ArrowDown': return 'next';
    case 'ArrowUp': return 'previous';
    default: return null;
  }
}

/** The box's place on the rendered page, in percent of the page image: it scales with the image at any width. */
export function boxPercent(box: Box, natural: { width: number; height: number }): { left: string; top: string; width: string; height: string } {
  const pct = (v: number, of: number) => `${of > 0 ? Math.round((v / of) * 100_000) / 1000 : 0}%`;
  return { left: pct(box.left, natural.width), top: pct(box.top, natural.height), width: pct(box.width, natural.width), height: pct(box.height, natural.height) };
}

/** What the rule checks, in words, from the type version's rule (by its 1-based index). */
export function ruleText(outcome: RuleOutcome, definition?: TypeDefinition | null): string {
  const rule = definition?.rules?.[outcome.index - 1];
  const label = (key: string | null | undefined) => {
    if (!key) return '?';
    return definition?.fields?.find(f => f.key === key)?.label ?? key;
  };
  const table = (key: string | null | undefined) => definition?.tables?.find(t => t.key === key);
  const column = (t: string | null | undefined, key: string | null | undefined) =>
    table(t)?.columns?.find(c => c.key === key)?.label ?? key ?? '?';
  if (!rule) return outcome.rule;
  switch (rule.rule) {
    case 'sumEquals': return `${table(rule.table)?.label ?? rule.table} ${column(rule.table, rule.column).toLowerCase()} adds up to ${label(rule.field).toLowerCase()}`;
    case 'sumOf': return `${(rule.fields ?? []).map(label).join(' + ')} = ${label(rule.field)}`;
    case 'rowProduct': return `${(rule.columns ?? []).map(c => column(rule.table, c)).join(' × ')} = ${column(rule.table, rule.column)} in every row`;
    case 'notAfter': return `${label(rule.before)} is on or before ${label(rule.after).toLowerCase()}`;
    case 'matches': return `${rule.field ? label(rule.field) : column(rule.table, rule.column)} has the expected form`;
    case 'checkDigit': return `${rule.field ? label(rule.field) : column(rule.table, rule.column)} check digit (${rule.algorithm ?? 'luhn'})`;
    default: return rule.rule;
  }
}

/** The next document to review after this one: the first queue item that is not it. */
export function nextInQueue(items: Pick<Extraction, 'extractionId'>[], current: number): number | null {
  return items.find(i => i.extractionId !== current)?.extractionId ?? null;
}

// ---------------------------------------------------------------------------------------------- the overview

export interface Totals { documents: number; autoApproved: number; inReview: number; autoRate: number | null; accuracy: number | null; }

/** The KPI strip's numbers, over every type the stats name. */
export function totalsOf(stats: TypeStats[]): Totals {
  const sum = (pick: (s: TypeStats) => number) => stats.reduce((n, s) => n + (pick(s) || 0), 0);
  const documents = sum(s => s.documents);
  const decided = sum(s => s.autoApproved + s.approvedByReviewer + s.rejected);
  const reviewed = sum(s => s.reviewedFields);
  return {
    documents,
    autoApproved: sum(s => s.autoApproved),
    inReview: sum(s => s.inReview),
    autoRate: decided ? sum(s => s.autoApproved) / decided : null,
    accuracy: reviewed ? 1 - sum(s => s.correctedFields) / reviewed : null,
  };
}

/** A row of the overview's recent documents: a read, with its newest extraction when it has one. */
export interface RecentRow {
  key: string;
  ocr: OcrDocument | null;
  extraction: Extraction | null;
  name: string;
  where: string;
  status: string;
  received: string | null;
}

/**
 * Every extraction, newest first -- a read extracted again (as another type, or after a failure) is a document of its
 * own, with its own state -- then the reads nothing has been extracted from yet (their state is the read's own: Done
 * is "Read"). An extraction whose read is not in the list (older than its page) still shows, by the read's number.
 */
export function recentRows(reads: OcrDocument[], extractions: Extraction[]): RecentRow[] {
  const byRead = new Map(reads.map(r => [r.ocrDocumentId, r]));
  const extracted = new Set(extractions.map(e => e.ocrDocumentId));
  const rows: RecentRow[] = [...extractions].sort((a, b) => b.extractionId - a.extractionId).map(e => {
    const ocr = byRead.get(e.ocrDocumentId) ?? null;
    return {
      key: `e${e.extractionId}`, ocr, extraction: e,
      name: ocr ? nameOf(ocr) : `OCR document ${e.ocrDocumentId}`,
      where: ocr ? whereOf(ocr) : '',
      status: statusLabel(e), received: e.dateCreated ?? null,
    };
  });
  const unread: RecentRow[] = reads.filter(r => !extracted.has(r.ocrDocumentId)).map(r => ({
    key: `o${r.ocrDocumentId}`, ocr: r, extraction: null, name: nameOf(r), where: whereOf(r),
    status: r.status === 'Done' ? 'Read' : r.status, received: r.dateCreated ?? null,
  }));
  return [...rows, ...unread];
}

/** A document's name: the file's own as it arrived (MIG-271), else the last part of its key. */
function nameOf(r: OcrDocument): string { return r.originalName || fileName(r.sourceKey); }

/** Where a document came from: the channel's sentence for one that arrived (MIG-271), else its storage connection. */
function whereOf(r: OcrDocument): string {
  const pages = r.pageCount ?? r.pagesRead;
  return `${r.intakeLabel || r.sourceBucket}${pages ? ` · ${pages} page${pages === 1 ? '' : 's'}` : ''}`;
}

// ---------------------------------------------------------------------------------------------- the type editor

const KEY = /^[a-z][a-z0-9_]{0,63}$/;

export function blankField(): TypeField { return { key: '', label: '', type: 'text', required: false, aliases: [] }; }
export function blankTable(): TypeTable { return { key: '', label: '', required: false, columns: [blankField()] }; }
export function blankRule(): TypeRule { return { rule: 'sumOf', fields: [], field: null, tolerance: 0.01 }; }
export function blankDefinition(): TypeDefinition {
  return { description: '', keywords: [], instructions: '', autoApproveThreshold: 0.9, fields: [blankField()], tables: [], rules: [] };
}

/** A deep copy, with every list present, so the editor never writes into what the service sent. */
export function editableDefinition(d: TypeDefinition | null | undefined): TypeDefinition {
  const copy = JSON.parse(JSON.stringify(d ?? blankDefinition())) as TypeDefinition;
  copy.keywords = copy.keywords ?? [];
  copy.fields = (copy.fields ?? []).map(f => ({ ...f, aliases: f.aliases ?? [] }));
  copy.tables = (copy.tables ?? []).map(t => ({ ...t, columns: (t.columns ?? []).map(c => ({ ...c, aliases: c.aliases ?? [] })) }));
  copy.rules = copy.rules ?? [];
  return copy;
}

/** A comma-separated list as the editor's box holds it, and back. */
export function listText(list: string[] | null | undefined): string { return (list ?? []).join(', '); }
export function textList(text: string): string[] { return text.split(',').map(s => s.trim()).filter(Boolean); }

/**
 * What the service would refuse in a definition, found before it is asked: keys in lower_snake_case and unique, a
 * label on each, a choice's options, a threshold from 0 (exclusive) to 1, and every rule naming what exists.
 */
export function definitionProblems(name: string, typeKey: string, d: TypeDefinition): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push('Name the document type.');
  if (!KEY.test(typeKey.trim())) out.push('The key is lower_snake_case: a letter, then letters, digits or _.');
  const t = d.autoApproveThreshold;
  if (t != null && !(t > 0 && t <= 1)) out.push('The auto-approve threshold is more than 0% and at most 100%.');
  if (!d.fields.length && !d.tables.length) out.push('Add a field or a table.');
  const checkFields = (list: TypeField[], where: string) => {
    const seen = new Set<string>();
    list.forEach((f, i) => {
      const at = `${where} ${i + 1}`;
      if (!KEY.test(f.key)) out.push(`${at}: the key is lower_snake_case.`);
      else if (seen.has(f.key)) out.push(`${at}: "${f.key}" is used twice.`);
      seen.add(f.key);
      if (!f.label?.trim()) out.push(`${at}: add a label.`);
      if (!(FIELD_TYPES as readonly string[]).includes(f.type)) out.push(`${at}: pick a type.`);
      if (f.type === 'choice' && !(f.options ?? []).length) out.push(`${at}: a choice needs its options.`);
    });
  };
  checkFields(d.fields, 'Field');
  const tableKeys = new Set<string>();
  d.tables.forEach((tb, i) => {
    if (!KEY.test(tb.key)) out.push(`Table ${i + 1}: the key is lower_snake_case.`);
    else if (tableKeys.has(tb.key) || d.fields.some(f => f.key === tb.key)) out.push(`Table ${i + 1}: "${tb.key}" is used twice.`);
    tableKeys.add(tb.key);
    if (!tb.label?.trim()) out.push(`Table ${i + 1}: add a label.`);
    if (!tb.columns.length) out.push(`Table ${i + 1}: add a column.`);
    checkFields(tb.columns, `Table ${i + 1} column`);
  });
  const fieldKeys = new Set(d.fields.map(f => f.key));
  const columnOf = (table: string | null | undefined, column: string | null | undefined) =>
    !!d.tables.find(x => x.key === table)?.columns.some(c => c.key === column);
  d.rules.forEach((r, i) => {
    const at = `Rule ${i + 1}`;
    const field = (k: string | null | undefined) => !!k && fieldKeys.has(k);
    switch (r.rule) {
      case 'sumEquals':
        if (!columnOf(r.table, r.column)) out.push(`${at}: pick a table and its column.`);
        if (!field(r.field)) out.push(`${at}: pick the total field.`);
        break;
      case 'sumOf':
        if (!(r.fields ?? []).length || !(r.fields ?? []).every(field)) out.push(`${at}: name the fields that add up (their keys).`);
        if (!field(r.field)) out.push(`${at}: pick the total field.`);
        break;
      case 'rowProduct':
        if ((r.columns ?? []).length !== 2 || !(r.columns ?? []).every(c => columnOf(r.table, c))) out.push(`${at}: name the two columns that multiply.`);
        if (!columnOf(r.table, r.column)) out.push(`${at}: pick the column they multiply to.`);
        break;
      case 'notAfter':
        if (!field(r.before) || !field(r.after)) out.push(`${at}: pick both dates.`);
        break;
      case 'matches':
        if (!field(r.field) && !columnOf(r.table, r.column)) out.push(`${at}: pick a field, or a table and its column.`);
        if (!r.pattern?.trim()) out.push(`${at}: write the pattern.`);
        break;
      case 'checkDigit':
        if (!field(r.field) && !columnOf(r.table, r.column)) out.push(`${at}: pick a field, or a table and its column.`);
        if (r.algorithm !== 'luhn' && r.algorithm !== 'iban') out.push(`${at}: pick luhn or iban.`);
        break;
      default:
        out.push(`${at}: pick a rule.`);
    }
  });
  return out;
}

/** The definition as the service takes it: blanks dropped, only what the rule kind uses. */
export function definitionToSave(d: TypeDefinition): TypeDefinition {
  const field = (f: TypeField): TypeField => ({
    key: f.key.trim(), label: f.label.trim(), type: f.type, required: !!f.required,
    ...(f.description?.trim() ? { description: f.description.trim() } : {}),
    ...((f.aliases ?? []).length ? { aliases: f.aliases } : {}),
    ...(f.type === 'choice' ? { options: f.options ?? [] } : {}),
  });
  const USES: Record<string, (keyof TypeRule)[]> = {
    sumEquals: ['table', 'column', 'field', 'tolerance'], sumOf: ['fields', 'field', 'tolerance'],
    rowProduct: ['table', 'columns', 'column', 'tolerance'], notAfter: ['before', 'after'],
    matches: ['field', 'table', 'column', 'pattern'], checkDigit: ['field', 'table', 'column', 'algorithm'],
  };
  return {
    ...(d.description?.trim() ? { description: d.description.trim() } : {}),
    keywords: d.keywords ?? [],
    ...(d.instructions?.trim() ? { instructions: d.instructions.trim() } : {}),
    autoApproveThreshold: d.autoApproveThreshold ?? null,
    fields: d.fields.map(field),
    tables: d.tables.map(t => ({ key: t.key.trim(), label: t.label.trim(), required: !!t.required,
      ...(t.description?.trim() ? { description: t.description.trim() } : {}), columns: t.columns.map(field) })),
    rules: d.rules.map(r => {
      const kept: TypeRule = { rule: r.rule };
      for (const k of USES[r.rule] ?? []) {
        const v = r[k];
        if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) (kept as unknown as Record<string, unknown>)[k] = v;
      }
      if (r.message?.trim()) kept.message = r.message.trim();
      return kept;
    }),
  };
}

// ---------------------------------------------------------------------------------------------- refusals

/**
 * What to tell a person when a call is refused. The services answer a refusal with its HTTP status (404, 409, 422,
 * 429 ...) and the {status: ERROR, message} envelope; the message is theirs and says what to do. A status with no
 * message gets a sentence of ours.
 */
export function refusalText(err: unknown, fallback: string): string {
  const e = err as HttpErrorResponse | null;
  const message = (e?.error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  switch (e?.status) {
    case 404: return 'It is not there any more: it may have been removed.';
    case 409: return 'It changed while you were working on it. It has been read again.';
    case 422: return 'The service cannot do this as things stand.';
    case 429: return 'Document Intelligence is busy. Try again in a few minutes.';
    default: return fallback;
  }
}

/** The HTTP status of a refused call, or 0. */
export function statusOf(err: unknown): number {
  return (err as HttpErrorResponse | null)?.status ?? 0;
}
