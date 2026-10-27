import { plural } from '../run-steps/run-page.model';

/**
 * A schedule's Items tab (MIG-421): every run that processed an item -- found by its name or key, or by a value such as
 * "risk = High" -- newest first, and two of them compared step by step. The shapes are Core's sourceJob.json/itemRuns
 * answers; the functions are the screen's readings of them, pure, for the specs.
 */

export type AcrossStatus = 'all' | 'done' | 'failed' | 'check';

/** The list's question (POST sourceJob.json/itemRuns). */
export interface AcrossQuery {
  jobId: number;
  search?: string;
  /** An exact item key: "All runs of this item". */
  key?: string;
  status?: AcrossStatus;
  from?: string;
  to?: string;
  page: number;
  size: number;
  fields?: string[];
}

/** One item in one run. */
export interface AcrossRow {
  jobQueueId: number;
  ref: string;
  key: string;
  label: string;
  startedAt?: string | null;
  endedAt?: string | null;
  trigger?: string | null;
  triggerLabel?: string | null;
  runAttempt?: number | null;
  runStatus?: string | null;
  pipelineVersion?: number | null;
  status: 'running' | 'done' | 'failed';
  flag?: 'check' | null;
  attempt?: number | null;
  failedStep?: { index: number; key: string; name: string } | null;
  children?: { total: number; failed: number } | null;
  durationMs?: number | null;
  fields?: Record<string, unknown> | null;
  report?: {
    /** ZT-I24: a Report Studio report's number ("RPT-0019"); null for a plain file. */
    number?: string | null;
    label?: string | null; version?: number | null; fileName?: string | null; fileRef?: number | null; madeAttempt?: number | null;
  } | null;
}

export interface AcrossPage {
  jobId: number;
  jobName?: string | null;
  total: number;
  capped?: boolean | null;
  page: number;
  size: number;
  keys: { key: string; label: string; runs: number }[];
  distinctKeys: number;
  fields: string[];
  masked: string[];
  items: AcrossRow[];
  note?: string | null;
}

export interface Change {
  path: string; kind: 'changed' | 'added' | 'removed'; before?: string | null; after?: string | null;
  /** ZT-I23: the same value under other names (a JSON column's field and its flattened copy): said once, by `path`. */
  alsoAt?: string[] | null;
  /** ZT-I23: only the letter case changed ("Synthetic" to "synthetic"). */
  caseOnly?: boolean | null;
}

export interface CompareSide { status?: string | null; rows?: number | null; hasData?: boolean | null; reusedFromAttempt?: number | null; }

export interface CompareStep {
  key: string; name: string; task?: string | null; a?: CompareSide | null; b?: CompareSide | null; same: boolean; changes: Change[];
  truncated?: boolean | null; note?: string | null;
  /** ZT-I23: changes an earlier step made that this one only carried on: said there, counted here. */
  carried?: number | null;
}

export interface CompareRun { jobQueueId: number; attempt?: number | null; pipelineVersion?: number | null; startedAt?: string | null; status?: string | null; }

export interface Comparison {
  jobId: number;
  key: string;
  label: string;
  /** The newer run. */
  a: CompareRun;
  /** The older run. */
  b: CompareRun;
  pipeline: { from?: number | null; to?: number | null; same: boolean; changes: string[]; note: string };
  steps: CompareStep[];
  changed: number;
  masked: string[];
  /** ZT-I22: the same file from another folder -- its two keys, said once. */
  keyNote?: string | null;
}

/** The list's question for a search: an exact key when "All runs of this item" asked for one. */
export function acrossQuery(jobId: number, f: { search?: string; key?: string; status?: AcrossStatus; from?: string | null; to?: string | null;
  page?: number; size?: number; fields?: string[] }): AcrossQuery {
  const q: AcrossQuery = { jobId, page: f.page ?? 0, size: f.size ?? 25 };
  const key = (f.key ?? '').trim();
  const search = (f.search ?? '').trim();
  if (key) q.key = key; else if (search) q.search = search;
  if (f.status && f.status !== 'all') q.status = f.status;
  if (f.from) q.from = f.from;
  if (f.to) q.to = f.to;
  if (f.fields?.length) q.fields = [...f.fields];
  return q;
}

/** "call-a.m4a · processed 4 times · latest result first"; when a search finds several items, how many. */
export function headline(page: AcrossPage | null | undefined): { title: string; sub: string } | null {
  if (!page || !page.total) return null;
  // ZT-I22: one file name across folders (an inbox's dated folders) is one item to the reader.
  const labels = new Set(page.keys.map(k => k.label));
  if (page.keys.length && labels.size === 1 && page.distinctKeys === page.keys.length) {
    const runs = page.keys.reduce((n, k) => n + k.runs, 0);
    return { title: page.keys[0].label, sub: `processed ${runs === 1 ? 'once' : `${runs.toLocaleString('en-GB')} times`} · latest result first` };
  }
  return { title: `${plural(page.distinctKeys, 'item')}`, sub: `${plural(page.total, 'run')} in all · latest first${page.capped ? ' · the newest 2,000 looked at' : ''}` };
}

/** The status pill of an item in a run. */
export function rowLook(row: Pick<AcrossRow, 'status' | 'failedStep' | 'flag' | 'children'>): { label: string; tone: 'ok' | 'warn' | 'crit' | 'brand' } {
  if (row.status === 'failed') return { label: row.failedStep?.name ? `Failed at ${row.failedStep.name}` : 'Failed', tone: 'crit' };
  if (row.status === 'running') return { label: 'Running', tone: 'brand' };
  if ((row.children?.failed ?? 0) > 0) return { label: `${plural(row.children!.failed, 'page')} failed`, tone: 'warn' };
  if (row.flag === 'check') return { label: 'Check by hand', tone: 'warn' };
  return { label: 'Done', tone: 'ok' };
}

/** "v5"; a dash when the version is not known. */
export function versionText(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `v${v}`;
}

/**
 * The row's report (ZT-I24): a Report Studio report is its number and version in every run ("RPT-0019 v1"); only a plain
 * file is its file's name; nothing, a dash.
 */
export function reportText(row: Pick<AcrossRow, 'report'>): string {
  const r = row.report;
  if (!r) return '—';
  if (r.number) return r.version ? `${r.number} v${r.version}` : r.number;
  return r.fileName || r.label || '—';
}

/** The two runs ticked to compare, kept to two: a third tick drops the oldest tick. */
export function ticked(current: number[], run: number): number[] {
  if (current.includes(run)) return current.filter(r => r !== run);
  return [...current, run].slice(-2);
}

/** "Compare #8814 with #8701 · Insight JSON · 3 fields changed". */
export function compareTitle(c: Comparison): { title: string; sub: string } {
  const changedSteps = c.steps.filter(s => s.changes.length);
  const where = changedSteps.length === 1 ? `${changedSteps[0].name} · ` : changedSteps.length > 1 ? `${plural(changedSteps.length, 'step')} · ` : '';
  return {
    title: `Compare #${c.a.jobQueueId} with #${c.b.jobQueueId}`,
    sub: c.changed ? `${where}${plural(c.changed, 'field')} changed` : 'Nothing changed in the data both runs kept',
  };
}

/** A change's "after" as the diff writes it: a removed value says so. */
export function afterText(ch: Change): string {
  return ch.kind === 'removed' ? '(removed)' : ch.after ?? 'null';
}

export function beforeText(ch: Change): string {
  return ch.kind === 'added' ? '(not there)' : ch.before ?? 'null';
}

/** ZT-I23: the steps that only carried on changes said at an earlier step, with how many ("Save file: 3 carried on"). */
export function carriedSteps(c: Comparison): { name: string; carried: number }[] {
  return c.steps.filter(s => !s.changes.length && (s.carried ?? 0) > 0).map(s => ({ name: s.name, carried: s.carried ?? 0 }));
}

/** The unchanged steps, by name, for the note under the diff ("The transcript is the same word for word"). */
export function sameSteps(c: Comparison): string[] {
  return c.steps.filter(s => s.same).map(s => s.name);
}
