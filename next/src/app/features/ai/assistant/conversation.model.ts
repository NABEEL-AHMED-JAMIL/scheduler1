import { instantOf } from '../../../core/instant';
import { Conversation } from './assistant.model';

/**
 * The AI Assistant's conversation list (owner 2026-10-12: "Conversations list not look good so need a view") -- what
 * ai-service's aiPrompt.json/assistant/conversationList answers, and the pure readings the side list and the All
 * conversations page make of it: the day groups, the kind's icon, the outcome's badge, the relative time. Nothing here
 * renders; the specs pin it.
 */

export type ConversationKind = 'pipeline' | 'question' | 'run';
export type ConversationOutcome = 'pipeline_saved' | 'pipeline_draft' | 'run_completed' | 'run_failed' | 'run_running' | 'run_not_started'
  | 'waiting' | 'answered' | 'failed' | 'working';

/** A conversation as the list reads it: the row, plus what ai-service derived from its messages (ConversationSummary). */
export interface ConversationRow extends Conversation {
  shortTitle?: string | null;
  renamed?: boolean;
  kind?: ConversationKind | null;
  outcome?: ConversationOutcome | null;
  pinned?: boolean;
  firstQuestion?: string | null;
  pipelineName?: string | null;
  pipelineErrors?: number | null;
  pipelineKey?: number | null;
  pipelineId?: string | null;
  taskDetailId?: number | null;
  jobId?: number | null;
  runJobId?: number | null;
  runJobQueueId?: number | null;
  runStatus?: string | null;
}

export interface ConversationPage {
  rows: ConversationRow[];
  total: number;
  offset?: number;
  limit?: number;
  /** Each facet's counts; a facet's own filter is left out of its counts. */
  facets?: { kind?: Record<string, number>; outcome?: Record<string, number>; updated?: Record<string, number>; pinned?: Record<string, number> };
  /** What the search looks in, as the server says it. */
  search?: string;
}

export interface ListFilter {
  q?: string;
  kind?: ConversationKind[];
  outcome?: ConversationOutcome[];
  updated?: DayGroup | null;
  pinned?: boolean;
  offset?: number;
  limit?: number;
}

/** The side list's chips: all, or one kind. */
export type Chip = 'all' | 'pipeline' | 'question' | 'run';
export const CHIPS: { id: Chip; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'pipeline', label: 'Pipelines' }, { id: 'question', label: 'Questions' }, { id: 'run', label: 'Runs' },
];

export const KIND_LABEL: Record<ConversationKind, string> = { pipeline: 'Pipeline design', question: 'Question', run: 'Pipeline run' };
const KIND_ICON: Record<ConversationKind, string> = { pipeline: 'layers', question: 'chat', run: 'play' };

export function kindOf(c: ConversationRow): ConversationKind {
  return c.kind === 'pipeline' || c.kind === 'run' ? c.kind : 'question';
}

export function kindIcon(c: ConversationRow): string {
  return KIND_ICON[kindOf(c)];
}

/** The title the list shows: the derived short one, else the stored one. */
export function titleOf(c: ConversationRow): string {
  return (c.shortTitle || c.title || 'Untitled conversation').trim();
}

// ------------------------------------------------------------------------------------------------------- badges

export type BadgeTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';
export interface Badge {
  label: string;
  tone: BadgeTone;
  /** Where it leads (the created pipeline, the run's logs); null when there is nothing to open. */
  link: (string | number)[] | null;
}

/**
 * What the conversation came to, in a few words: Pipeline created (to the pipeline), Not saved with its errors, a run's
 * end (to its logs), Answered, Waiting for you, No answer. Nothing for a conversation still being worked on.
 */
export function badgeOf(c: ConversationRow): Badge | null {
  const runLink = (): (string | number)[] | null => {
    const job = c.runJobId ?? c.jobId;
    if (job == null) return null;
    return c.runJobQueueId != null ? ['/pipelines/schedules', job, 'runs', c.runJobQueueId, 'logs'] : ['/pipelines/schedules', job, 'executions'];
  };
  switch (c.outcome) {
    case 'pipeline_saved':
      return { label: 'Pipeline created', tone: 'ok', link: c.taskDetailId != null ? ['/pipelines', c.taskDetailId, 'edit'] : null };
    case 'pipeline_draft': {
      const n = c.pipelineErrors ?? 0;
      return n > 0
        ? { label: `Not saved · ${n === 1 ? '1 error' : `${n} errors`}`, tone: 'crit', link: null }
        : { label: 'Not saved', tone: 'warn', link: null };
    }
    case 'run_completed': return { label: 'Run completed', tone: 'ok', link: runLink() };
    case 'run_failed': return { label: 'Run failed', tone: 'crit', link: runLink() };
    case 'run_running': return { label: 'Running', tone: 'info', link: runLink() };
    case 'run_not_started': return { label: 'Not run', tone: 'neutral', link: null };
    case 'waiting': return { label: 'Waiting for you', tone: 'warn', link: null };
    case 'answered': return { label: 'Answered', tone: 'neutral', link: null };
    case 'failed': return { label: 'No answer', tone: 'crit', link: null };
    default: return null;
  }
}

/** The status facet's words, in the order the page lists them. */
export const OUTCOME_LABEL: Record<ConversationOutcome, string> = {
  pipeline_saved: 'Pipeline created', pipeline_draft: 'Not saved', run_completed: 'Run completed', run_failed: 'Run failed',
  run_running: 'Running', run_not_started: 'Not run', waiting: 'Waiting for you', answered: 'Answered', failed: 'No answer', working: 'Working',
};

// ------------------------------------------------------------------------------------------------------- days

export type DayGroup = 'today' | 'yesterday' | 'week' | 'older';
export const DAY_LABEL: Record<DayGroup, string> = { today: 'Today', yesterday: 'Yesterday', week: 'This week', older: 'Older' };
const DAY_ORDER: DayGroup[] = ['today', 'yesterday', 'week', 'older'];

/** The viewer's own zone: the times the list prints are theirs, so its days are too. */
export function viewerZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/** The calendar day an instant falls on in a zone, as a day number (days since 1970-01-01 of that zone's calendar). */
function dayNumber(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000);
}

/**
 * Which day group a timestamp from the API falls in, against now, by the calendar of `timeZone`: a naive timestamp is
 * Chicago wall-clock and one with an offset is taken at its word (instantOf) -- never its text cut at the T.
 */
export function dayGroupOf(text: string | null | undefined, now: Date, timeZone: string): DayGroup {
  const at = instantOf(text);
  if (!at) return 'older';
  const ago = dayNumber(now, timeZone) - dayNumber(at, timeZone);
  if (ago <= 0) return 'today';
  if (ago === 1) return 'yesterday';
  if (ago < 7) return 'week';
  return 'older';
}

export interface ListGroup { id: 'pinned' | DayGroup; label: string; rows: ConversationRow[]; }

/**
 * The side list's sections: Pinned first, then Today, Yesterday, This week, Older -- each newest first, empty ones left
 * out. A pinned conversation is under Pinned only.
 */
export function groupRows(rows: readonly ConversationRow[], now: Date, timeZone: string): ListGroup[] {
  const newest = (a: ConversationRow, b: ConversationRow) =>
    (instantOf(b.dateUpdated)?.getTime() ?? 0) - (instantOf(a.dateUpdated)?.getTime() ?? 0) || b.conversationId - a.conversationId;
  const pinned = rows.filter(r => r.pinned).sort(newest);
  const groups: ListGroup[] = pinned.length ? [{ id: 'pinned', label: 'Pinned', rows: pinned }] : [];
  const byDay = new Map<DayGroup, ConversationRow[]>();
  for (const r of rows) {
    if (r.pinned) continue;
    const g = dayGroupOf(r.dateUpdated, now, timeZone);
    byDay.set(g, [...(byDay.get(g) ?? []), r]);
  }
  for (const id of DAY_ORDER) {
    const list = byDay.get(id);
    if (list?.length) groups.push({ id, label: DAY_LABEL[id], rows: list.sort(newest) });
  }
  return groups;
}

/** Whether a row belongs under a chip (the side list also asks the server for the chip's kind; this keeps a merged row honest). */
export function matchesChip(c: ConversationRow, chip: Chip): boolean {
  return chip === 'all' || kindOf(c) === chip;
}

/**
 * The list with conversations the page has just touched laid over it: a new one joins, and a copy used more recently
 * than the list's replaces its fields (an older or equally old copy -- the page's list read before a pin -- changes
 * nothing).
 */
export function mergeRecent(list: readonly ConversationRow[], recent: readonly ConversationRow[]): ConversationRow[] {
  const byId = new Map(list.map(r => [r.conversationId, r]));
  for (const r of recent) {
    const had = byId.get(r.conversationId);
    if (!had) byId.set(r.conversationId, r);
    else if ((instantOf(r.dateUpdated)?.getTime() ?? 0) > (instantOf(had.dateUpdated)?.getTime() ?? 0)) byId.set(r.conversationId, { ...had, ...definedOnly(r) });
  }
  return [...byId.values()];
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ------------------------------------------------------------------------------------------------------- time

/**
 * A row's time, next to now, on a 24-hour clock: "now", "5 min", "14:05" today, "Yesterday", the weekday this week, then
 * "3 Oct". The instant comes from instantOf (naive = Chicago); the words are the viewer's calendar.
 */
export function relativeTime(text: string | null | undefined, now: Date, timeZone: string): string {
  const at = instantOf(text);
  if (!at) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  const group = dayGroupOf(text, now, timeZone);
  if (minutes < 1 && minutes > -2) return 'now';
  if (minutes < 60 && minutes >= 0) return `${minutes} min`;
  if (group === 'today') return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  if (group === 'yesterday') return 'Yesterday';
  if (group === 'week') return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(at);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, month: 'numeric', day: 'numeric' }).formatToParts(at);
  const day = parts.find(p => p.type === 'day')?.value ?? '';
  const month = MONTHS[Number(parts.find(p => p.type === 'month')?.value) - 1] ?? '';
  return `${Number(day)} ${month}`;
}

/** The console's month names (time-format.ts writes "24 Sep 2026"; ICU's en-GB now says "Sept"). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ------------------------------------------------------------------------------------------------------- per viewer

const RAIL_KEY = 'ai.conversations.rail';

/** Whether this viewer folded the list to its icon rail; false when storage is not there to say. */
export function readRail(storage: Pick<Storage, 'getItem'> | null): boolean {
  try { return storage?.getItem(RAIL_KEY) === '1'; } catch { return false; }
}

export function writeRail(storage: Pick<Storage, 'setItem'> | null, rail: boolean): void {
  try { storage?.setItem(RAIL_KEY, rail ? '1' : '0'); } catch { /* private window: it is remembered for this page only */ }
}

export function browserStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
