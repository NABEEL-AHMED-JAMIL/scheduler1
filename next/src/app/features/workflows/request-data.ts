import { OUTCOME_FIELDS } from './designer.model';
import { dateTime, exactTime } from './history';
import { ValueView, labelOf, valueKind } from './value-kind';
import type { PageKey } from '../../core/auth/page-keys';
import { Colleague, HistoryEvent, SubjectField } from './workflows.api';

/**
 * A workflow request's data as a person reads it (owner, 2026-10-27, task 2904): what the engine keeps on a request's
 * subject next to the form's own values, by shape and never by a field's name --
 *
 *  - a Run pipeline step's outcome ({runId, status, ok, ended, message, giveUpAt, ...} with the pipeline's result fields
 *    at the same level) is one line -- the step, a status chip, the run -- with the results under it; the envelope is the
 *    engine's bookkeeping and never a row, and a message shows only when something went wrong;
 *  - an approval or task decision kept at its step's "Keep the decision as" ({decision, by, byName, at, comment}) reads
 *    "Approved by <name> · 27 Oct 2026, 00:52" with the comment as a quote: a name, never an id;
 *  - any other record is its own fields, each read as its shape (value-kind.ts): a long text a paragraph, a masked value
 *    hidden, a list of records a table.
 *
 * The Approvals task, My requests' request and Review's side panel all show a request through this.
 */
export type RequestEntry = ValueEntry | GroupEntry | OutcomeEntry | DecisionEntry | HeadingEntry;

/** ZT-I34 polish: a form's section title over the answers under it. */
export interface HeadingEntry { kind: 'heading'; key: string; label: string; }

export interface ValueEntry {
  kind: 'value'; key: string; label: string;
  /** The value as one line of text (Yes/No, a person's name for a username): what a plain list says. */
  value: string;
  view: ValueView;
  /** Written by a model for a person to check: the record it is in says DRAFT. */
  draft: boolean;
  /** ZT-I34: the form marks it personal data (shown to the reader, or masked: the view says which). */
  personal?: boolean;
}

export interface GroupEntry { kind: 'group'; key: string; label: string; fields: RequestEntry[]; }

export interface OutcomeEntry {
  kind: 'outcome'; key: string; label: string;
  /** The step that started the run, by its name in the request's history; null when the history does not say. */
  step: string | null;
  status: string;
  runId: number | null;
  /** The run's page, for someone who can open runs. */
  link: (string | number)[] | null;
  /** What went wrong: the run's message when it did not complete, or why its results could not be read. */
  problem: string | null;
  /** The pipeline's results: the data. */
  fields: RequestEntry[];
}

export interface DecisionEntry {
  kind: 'decision'; key: string; label: string;
  decision: string;
  tone: 'ok' | 'crit' | 'warn' | 'neutral';
  /** "Approved by Riverside Health reviewer" (and "for <name>" when decided for someone). */
  line: string;
  /** When, on the console's 24-hour clock; its exact form is atTitle. */
  at: string;
  atTitle: string;
  /** As kept, for <time datetime>. */
  atIso: string;
  comment: string | null;
}

export interface RequestDataContext {
  /** A person's name from the colleague directory, by id; null when not there. */
  personName?: (id: number) => string | null;
  /** A person's name for a username a form kept (Submitted by); null when not one. */
  personByUsername?: (username: string) => string | null;
  /** The name of the step that started a run (runStepOf). */
  runStep?: (runId: number) => string | null;
  /** The reader may open a run's page (Schedules or the Queue). */
  canOpenRuns?: boolean;
  /**
   * ZT-I34: what each key of the subject is (a form's fields in the form's order: label, section, personal), as
   * workflow-service answers it; without it a key's label is the key in words and the order the subject's.
   */
  fields?: SubjectField[] | null;
}

/**
 * The context every screen reads a request's data with: the colleague directory for a person's name (a username the form
 * kept, a decision with no name kept), the signed-in person's own name, the history for a run's step, and whether the
 * reader may open runs (Schedules or the Queue).
 */
export function requestContext(colleagues: Colleague[], auth: { user(): { username?: string | null; fullName?: string | null } | null;
  canOpen?(page: PageKey): boolean }, history: HistoryEvent[] | null | undefined): RequestDataContext {
  const me = auth.user();
  return {
    personName: id => colleagues.find(c => c.userId === id)?.fullName || null,
    // The colleague list first: it carries the directory's full name, where the session may hold only the username.
    personByUsername: text => colleagues.find(c => c.username === text)?.fullName
      || (me?.username && text === me.username && me.fullName ? me.fullName : null),
    runStep: runStepOf(history),
    canOpenRuns: !!(auth.canOpen?.('jobs') || auth.canOpen?.('queue')),
  };
}

/** The platform's DRAFT mark (run-review-card): made by a model for a person to check. */
export const DRAFT_TITLE = 'Made by a model for a person to check; not a decision';

/** The outcome's own keys: everything else at saveAs is a result field. A result's rows and count are data. */
const ENVELOPE = new Set(OUTCOME_FIELDS.filter(f => f !== 'rows' && f !== 'count'));
const DECISION_KEYS = new Set(['decision', 'by', 'byName', 'at', 'comment', 'onBehalfOf']);
const DECISIONS: Record<string, { word: string; tone: DecisionEntry['tone'] }> = {
  approved: { word: 'Approved', tone: 'ok' },
  rejected: { word: 'Rejected', tone: 'crit' },
  changes_requested: { word: 'Changes asked', tone: 'warn' },
  done: { word: 'Done', tone: 'ok' },
};
/** A run's status in words where the engine's is not one. */
const STATUS_WORD: Record<string, string> = { TimedOut: 'Timed out' };
/** A record inside a record inside the subject is read as one value (value-kind's table): deeper nesting says nothing more. */
const MAX_DEPTH = 2;

export function requestData(subject: Record<string, unknown> | null | undefined, ctx: RequestDataContext = {}): RequestEntry[] {
  if (!subject) return [];
  const entries = entriesOf(Object.entries(subject).filter(([, v]) => !isAssignee(v)), ctx, 0, new Set(), false);
  return ordered(entries, ctx.fields ?? null);
}

/**
 * ZT-I34 polish (owner 2026-10-27): what the steps kept first -- the decisions and the pipelines' outcomes -- then the form's
 * answers in the form's own order, labels and sections, then anything else the subject holds. Without fields the answers
 * keep the subject's order and their keys in words.
 */
function ordered(entries: RequestEntry[], fields: SubjectField[] | null): RequestEntry[] {
  const kept = entries.filter(e => e.kind === 'decision' || e.kind === 'outcome');
  const rest = entries.filter(e => e.kind !== 'decision' && e.kind !== 'outcome');
  if (!fields?.length) return [...kept, ...rest];
  const byKey = new Map(rest.map(e => [e.key, e]));
  const answers: RequestEntry[] = [];
  let section: string | null = null;
  let sectioned = false;
  for (const f of fields) {
    const e = byKey.get(f.key);
    if (!e) continue;
    byKey.delete(f.key);
    const label = f.label?.trim() || e.label;
    const own = f.section?.trim() || null;
    if (own !== section && (own || sectioned)) {
      answers.push({ kind: 'heading', key: `heading:${answers.length}:${own ?? ''}`, label: own ?? 'Other details' });
    }
    section = own;
    sectioned ||= !!own;
    answers.push(e.kind === 'value' ? { ...e, label, personal: !!f.personal } : { ...e, label });
  }
  return [...kept, ...answers, ...rest.filter(e => byKey.has(e.key))];
}

/** An entry as one line of text, for a plain list. */
export function entryText(e: RequestEntry): string {
  switch (e.kind) {
    case 'value': return e.value;
    case 'decision': return `${e.line} · ${e.at}`;
    case 'outcome': return [e.step, STATUS_WORD[e.status] ?? e.status, e.runId != null ? `Run #${e.runId}` : ''].filter(Boolean).join(' · ');
    case 'group': return e.fields.map(f => `${f.label}: ${entryText(f)}`).join(', ');
    case 'heading': return e.label;
  }
}

/** Each step's name as the engine entered it (StepEntered), by its key. */
export function stepNamesOf(history: HistoryEvent[] | null | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const e of history ?? []) {
    if (e.type !== 'StepEntered' || !e.stepKey) continue;
    const name = detailOf(e.detail)['name'];
    if (typeof name === 'string' && name.trim()) names.set(e.stepKey, name.trim());
  }
  return names;
}

/** The name of the step behind a run: the step whose PipelineStarted or PipelineEnded names that run. */
export function runStepOf(history: HistoryEvent[] | null | undefined): (runId: number) => string | null {
  const names = stepNamesOf(history);
  const steps = new Map<number, string>();
  for (const e of history ?? []) {
    if (!e.stepKey || !/^Pipeline/.test(e.type)) continue;
    const run = Number(detailOf(e.detail)['runId']);
    if (Number.isFinite(run) && run > 0 && !steps.has(run)) steps.set(run, names.get(e.stepKey) ?? '');
  }
  return runId => steps.get(runId) || null;
}

function entriesOf(pairs: [string, unknown][], ctx: RequestDataContext, depth: number, masked: Set<string>, draft: boolean): RequestEntry[] {
  return pairs
    .filter(([, v]) => present(v))
    .map(([key, v]) => entryOf(key, v, ctx, depth, masked.has(key), draft));
}

function entryOf(key: string, value: unknown, ctx: RequestDataContext, depth: number, masked: boolean, draft: boolean): RequestEntry {
  const label = labelOf(key);
  const record = recordOf(value);
  if (record && depth < MAX_DEPTH) {
    if (isOutcome(record)) return outcomeOf(key, label, record, ctx, depth);
    if (isDecision(record)) return decisionOf(key, label, record, ctx);
    return { kind: 'group', key, label, fields: entriesOf(Object.entries(record), ctx, depth + 1, new Set(), draft || saysDraft(record)) };
  }
  const text = textOf(value, ctx);
  // A username read as its person's name reads as that name; every other value by its own shape.
  const view: ValueView = masked && !Array.isArray(value) && !record ? { kind: 'masked', text: String(value) }
    : valueKind(typeof value === 'string' && text !== value ? text : value);
  return { kind: 'value', key, label, value: text, view, draft: draft && view.kind === 'long' };
}

function outcomeOf(key: string, label: string, o: Record<string, unknown>, ctx: RequestDataContext, depth: number): OutcomeEntry {
  const runId = positive(o['runId']);
  const jobId = positive(o['jobId']);
  const status = String(o['status'] ?? (o['ended'] === false ? 'Running' : o['ok'] === false ? 'Failed' : 'Completed'));
  const failed = o['ok'] === false || (o['ended'] === true && status !== 'Completed');
  const message = typeof o['message'] === 'string' && o['message'].trim() ? o['message'].trim() : null;
  const resultsProblem = typeof o['resultsProblem'] === 'string' && o['resultsProblem'].trim() ? o['resultsProblem'].trim() : null;
  const masked = new Set(Array.isArray(o['masked']) ? (o['masked'] as unknown[]).map(String) : []);
  const results = Object.entries(o).filter(([k]) => !ENVELOPE.has(k));
  return {
    kind: 'outcome', key, label,
    step: runId != null ? ctx.runStep?.(runId) ?? null : null,
    status: STATUS_WORD[status] ?? status,
    runId,
    link: ctx.canOpenRuns && runId != null && jobId != null ? ['/pipelines/schedules', jobId, 'runs', runId] : null,
    problem: failed ? message ?? resultsProblem ?? 'The run did not complete.' : resultsProblem,
    fields: entriesOf(results, ctx, depth + 1, masked, saysDraft(Object.fromEntries(results))),
  };
}

function decisionOf(key: string, label: string, d: Record<string, unknown>, ctx: RequestDataContext): DecisionEntry {
  const raw = String(d['decision']);
  const known = DECISIONS[raw.toLowerCase()] ?? { word: raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' '), tone: 'neutral' as const };
  const by = personOf(d['byName'], d['by'], ctx);
  const forWhom = d['onBehalfOf'] != null ? ` for ${personOf(null, d['onBehalfOf'], ctx)}` : '';
  const at = typeof d['at'] === 'string' ? d['at'] : '';
  const comment = typeof d['comment'] === 'string' && d['comment'].trim() ? d['comment'].trim() : null;
  return { kind: 'decision', key, label, decision: known.word, tone: known.tone, line: `${known.word} by ${by}${forWhom}`,
    at: at ? dateTime(at) : '', atTitle: at ? exactTime(at) : '', atIso: at, comment };
}

/** The kept name, else the colleague directory's, else "a member": never the id. */
function personOf(name: unknown, id: unknown, ctx: RequestDataContext): string {
  if (typeof name === 'string' && name.trim()) return name.trim();
  const n = positive(id);
  return (n != null ? ctx.personName?.(n) : null) || 'a member';
}

/** A run's outcome: its runId, and the status or another of the outcome's own keys beside it. */
function isOutcome(r: Record<string, unknown>): boolean {
  return 'runId' in r && Object.keys(r).some(k => k !== 'runId' && ENVELOPE.has(k));
}

/** A kept decision: a decision word, who made it, and nothing but a decision's keys. */
function isDecision(r: Record<string, unknown>): boolean {
  return typeof r['decision'] === 'string' && ('by' in r || 'byName' in r) && Object.keys(r).every(k => DECISION_KEYS.has(k));
}

/** A result a model drafted says so in one of its values (run-review-card reads it the same way). */
function saysDraft(r: Record<string, unknown>): boolean {
  return Object.values(r).some(v => typeof v === 'string' && v.trim().toUpperCase() === 'DRAFT');
}

function textOf(v: unknown, ctx: RequestDataContext): string {
  if (typeof v === 'boolean' || v === 'true' || v === 'false') return v === true || v === 'true' ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  const text = String(v);
  return ctx.personByUsername?.(text) || text;
}

function present(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  const r = recordOf(v);
  return !r || Object.values(r).some(present);
}

function recordOf(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function positive(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function detailOf(detail: string | null | undefined): Record<string, unknown> {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** A step's assignee as a subject names it: {kind: team | role | user | subject, value} and nothing else. */
export function isAssignee(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v as object);
  const kind = (v as { kind?: unknown }).kind;
  return keys.length === 2 && keys.includes('kind') && keys.includes('value') && ['team', 'role', 'user', 'subject'].includes(String(kind));
}
