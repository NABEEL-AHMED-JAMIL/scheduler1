import { formatDuration } from '../../../shared/ui/time-format';
import { formatSize } from '../../../shared/ui/format-size';
import { RunOutput, StepDataset, StepExecution, StepTimeline, errorText } from './run-steps.model';

/**
 * The run page's readings (UX review 2026-10-12, run page fix): which tab an address opens, the one status the header
 * says, the facts the summary strip adds to the header, and the steps table's rows. Pure, for the specs.
 */

/**
 * The run page's tabs: the steps as a table, the run map, the AI answers, the items of a pipeline that works item by
 * item (MIG-420), what the run put out, and its log.
 */
export type RunTab = 'steps' | 'map' | 'ai' | 'items' | 'outputs' | 'log';
export const RUN_TABS: readonly RunTab[] = ['steps', 'map', 'ai', 'items', 'outputs', 'log'];

/**
 * The tab an address opens. `?tab=` wins when it names one; otherwise `/runs/8134/logs` opens the Log and the bare
 * `/runs/8134` the Steps.
 */
export function runTabFromUrl(lastSegment: string | null | undefined, tab: string | null | undefined): RunTab {
  if (tab && (RUN_TABS as readonly string[]).includes(tab)) return tab as RunTab;
  return lastSegment === 'logs' ? 'log' : 'steps';
}

/**
 * Where a tab lives: the Log at `/logs`, the Steps at the bare run, any other at the bare run with `?tab=`. The Items
 * tab keeps a filter other than All as `&status=` (the run-finished mail links to `?tab=items&status=failed`).
 */
export function runTabUrl(jobId: string | number, jobQueueId: string | number, tab: RunTab, itemStatus?: string | null):
  { commands: (string | number)[]; queryParams: Record<string, string> } {
  const base: (string | number)[] = ['/pipelines/schedules', String(jobId).trim(), 'runs', String(jobQueueId).trim()];
  if (tab === 'log') return { commands: [...base, 'logs'], queryParams: {} };
  if (tab === 'items' && itemStatus && itemStatus !== 'all') return { commands: base, queryParams: { tab, status: itemStatus } };
  return { commands: base, queryParams: tab === 'steps' ? {} : { tab } };
}

/** "1 record", "40 records", "1,024 rows": a count with its noun, singular for one. */
export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? noun : many}`;
}

export type Tone = 'ok' | 'warn' | 'crit' | 'brand' | 'neutral';

/** The header's one pill: the run's status, and where the review stands when its results need one. */
export interface RunStatusLook { label: string; tone: Tone; icon: string; }

const RUN_LOOK: Record<string, { word: string; tone: Tone; icon: string }> = {
  queue: { word: 'Queued', tone: 'neutral', icon: 'inbox' },
  start: { word: 'Starting', tone: 'brand', icon: 'play' },
  running: { word: 'Running', tone: 'brand', icon: 'zap' },
  completed: { word: 'Completed', tone: 'ok', icon: 'checkCircle' },
  failed: { word: 'Failed', tone: 'crit', icon: 'xCircle' },
  interrupt: { word: 'Interrupted', tone: 'crit', icon: 'stop' },
  skip: { word: 'Skipped', tone: 'warn', icon: 'skip' },
  missed: { word: 'Missed', tone: 'warn', icon: 'alert' },
  stop: { word: 'Stopped', tone: 'neutral', icon: 'stop' },
};

export function runStatusLook(runStatus: string | null | undefined, reviewStatus?: string | null, waitingForApproval = false): RunStatusLook | null {
  if (!runStatus) return null;
  const look = RUN_LOOK[runStatus.toLowerCase()] ?? { word: runStatus, tone: 'neutral' as Tone, icon: '' };
  if (waitingForApproval) return { label: `${look.word} · waiting for approval`, tone: 'warn', icon: 'clock' };
  // AI hard-workflow test (2026-10-13): only a completed run's results wait for a review -- never "Failed · waiting for
  // review" (Core answers NOT_APPLICABLE for a run that ended without results; an older Core said PENDING).
  const completed = runStatus.toLowerCase() === 'completed';
  switch (reviewStatus) {
    case 'PENDING': return completed ? { label: `${look.word} · waiting for review`, tone: 'warn', icon: 'clock' }
      : { label: look.word, tone: look.tone, icon: look.icon };
    case 'APPROVED': return { label: `${look.word} · approved`, tone: 'ok', icon: 'checkCircle' };
    case 'REJECTED': return { label: `${look.word} · rejected`, tone: 'crit', icon: 'xCircle' };
    default: return { label: look.word, tone: look.tone, icon: look.icon };
  }
}

/** Who or what started the run: a person by hand, the schedule's timetable, or a trigger (an arrival, an API call). */
export function startedBy(run: { runManual?: boolean | null } | null, job: { execution?: string | null } | null): string {
  if (run?.runManual) return 'By hand';
  if (job?.execution === 'Auto') return 'Its timetable';
  return 'A trigger';
}

/** One fact of the summary strip. */
export interface RunFact { label: string; value: string; hint?: string; }

/**
 * The facts the header does not already say: when the run started and ended, how long it took, what started it, its
 * steps and the rows it read and put out. No status, schedule or pipeline -- the header says those once.
 */
export function runFacts(input: {
  start: string; end: string; duration: string; startedBy: string; timeline: StepTimeline | null;
  /** The full date and time, for the start's and end's tooltips (the strip says day, month and time). */
  startHint?: string; endHint?: string;
  /** What the run cost (Billing's runCost, an administrator's read), already in words; null when not known. */
  cost?: string | null;
}): RunFact[] {
  const facts: RunFact[] = [
    { label: 'Started', value: input.start, ...(input.startHint ? { hint: input.startHint } : {}) },
    { label: 'Ended', value: input.end, ...(input.endHint ? { hint: input.endHint } : {}) },
    { label: 'Duration', value: input.duration },
    { label: 'Started by', value: input.startedBy },
  ];
  const steps = input.timeline?.steps ?? [];
  if (steps.length) {
    const done = steps.filter(s => s.status === 'Completed').length;
    facts.push({ label: 'Steps', value: `${done}/${steps.length}`, hint: `${done} of ${steps.length} steps completed` });
    const rows = runRows(steps);
    if (rows) facts.push({ label: 'Rows in → out', value: rows.value, hint: rows.hint });
  }
  if (input.cost) facts.push({ label: 'Cost', value: input.cost, hint: 'This run\'s share of the month\'s priced usage, before allowances' });
  return facts;
}

/** What the run read (its first step's output) and what its last step that ran put out. */
export function runRows(steps: StepExecution[]): { value: string; hint: string } | null {
  const ran = steps.filter(s => s.recordsOut !== null && s.recordsOut !== undefined);
  if (!ran.length) return null;
  const first = ran[0].recordsOut!;
  const last = ran[ran.length - 1].recordsOut!;
  return { value: `${first.toLocaleString('en-GB')} → ${last.toLocaleString('en-GB')}`,
    hint: `${plural(first, 'record')} read, ${plural(last, 'record')} out of the last step` };
}

/**
 * A file the run put out, as people describe one: its type, then what it holds. A PDF is pages and bytes, never rows
 * ("PDF · 2 pages · 21.8 KB"); a table is rows and bytes ("CSV · 40 rows · 2.1 KB").
 */
export function outputLabel(o: Pick<RunOutput, 'name' | 'format' | 'rowCount' | 'byteCount' | 'pageCount'>): string {
  const format = (o.format || (/\.([a-z0-9]+)$/i.exec(o.name ?? '')?.[1] ?? '')).toUpperCase();
  const parts: string[] = format ? [format] : [];
  if (format === 'PDF') {
    if (o.pageCount) parts.push(plural(o.pageCount, 'page'));
  } else if (o.rowCount !== null && o.rowCount !== undefined) {
    parts.push(plural(o.rowCount, 'row'));
  }
  if (o.byteCount !== null && o.byteCount !== undefined) parts.push(formatSize(o.byteCount));
  return parts.join(' · ');
}

/** One thing a step put out, as the steps table's chip shows it. */
export interface OutputChip {
  name: string;
  detail: string;
  /** A dataset or kept file downloads through its dataset; an upload from storage. */
  kind: 'dataset' | 'file' | 'bucket';
  runDatasetId?: number | null;
  /** The formats a dataset downloads in: a PDF only as itself. */
  pdf: boolean;
  output?: RunOutput;
  dataset?: StepDataset;
}

/** A step's chips: its datasets (a kept file described by its run output), then its uploads. */
export function outputChips(step: StepExecution, outputs: RunOutput[]): OutputChip[] {
  const mine = outputs.filter(o => (o.stepExecutionId != null && o.stepExecutionId === step.stepExecutionId)
    || (o.stepExecutionId == null && o.stepKey === step.key));
  const byDataset = new Map(mine.filter(o => o.runDatasetId != null).map(o => [o.runDatasetId!, o]));
  const chips: OutputChip[] = (step.datasets ?? []).map(d => {
    const kept = byDataset.get(d.runDatasetId);
    const pdf = kept?.format === 'pdf' || /\.pdf$/i.test(d.name);
    return {
      name: d.name, kind: kept ? 'file' as const : 'dataset' as const, runDatasetId: d.runDatasetId, pdf, output: kept, dataset: d,
      detail: kept ? outputLabel(kept) : pdf ? outputLabel({ name: d.name, format: 'pdf' })
        : d.rowCount !== null && d.rowCount !== undefined ? plural(d.rowCount, 'row') : '',
    };
  });
  for (const o of mine) {
    if (o.kind === 'bucket') chips.push({ name: o.name, kind: 'bucket', pdf: o.format === 'pdf', output: o, detail: outputLabel(o) });
  }
  return chips;
}

/** One row of the steps table. */
export interface StepRow {
  step: StepExecution;
  no: number;
  /** The step's name from its pipeline, else its key. */
  name: string;
  named: boolean;
  duration: string;
  /** The step's share of the slowest step's time, 0..1, for the bar. */
  share: number;
  slowest: boolean;
  rows: string;
  rowsHint: string;
  /** A failed step's error, or a warning (skipped, missed, an on-error that continued). */
  problem: string;
  tone: 'crit' | 'warn' | null;
  outputs: OutputChip[];
  canLog: boolean;
}

/** The steps as table rows, the slowest marked (only when there is more than one step and it took any time). */
export function stepRows(timeline: StepTimeline | null, outputs: RunOutput[] | null | undefined): StepRow[] {
  const steps = timeline?.steps ?? [];
  const max = Math.max(0, ...steps.map(s => s.durationMs ?? 0));
  const slowestIndex = steps.length > 1 && max > 0 ? steps.findIndex(s => (s.durationMs ?? 0) === max) : -1;
  return steps.map((s, i) => {
    const error = errorText(s);
    const crit = s.status === 'Failed' || s.status === 'Interrupt' || !!error && s.status !== 'Completed';
    const warn = !crit && (s.status === 'Skip' || s.status === 'Missed' || (!!error && s.status === 'Completed'));
    const name = s.name?.trim();
    const inCount = s.recordsIn, outCount = s.recordsOut;
    const count = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-GB'));
    return {
      step: s,
      no: s.index + 1,
      name: name || s.key,
      named: !!name,
      duration: s.durationMs === null || s.durationMs === undefined ? '—' : formatDuration(s.durationMs / 1000),
      share: max > 0 ? (s.durationMs ?? 0) / max : 0,
      slowest: i === slowestIndex,
      rows: inCount == null && outCount == null ? '—' : `${count(inCount)} → ${count(outCount)}`,
      rowsHint: [inCount != null ? `${plural(inCount, 'record')} in` : '', outCount != null ? `${plural(outCount, 'record')} out` : '']
        .filter(Boolean).join(', '),
      problem: error || (warn || crit ? (s.statusMessage ?? '') : ''),
      tone: crit ? 'crit' : warn ? 'warn' : null,
      outputs: outputChips(s, outputs ?? []),
      canLog: s.log === 'step' && s.stepExecutionId !== null,
    };
  });
}
