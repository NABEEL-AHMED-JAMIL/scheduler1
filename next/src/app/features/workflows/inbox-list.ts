import { instantOf } from '../../core/instant';
import { dayNumber, daysIntoWeek } from './history';

/**
 * The Task inbox's list for hundreds of rows (owner, 2026-10-06): rows under day headers, a search over what a person
 * remembers about a task, and filters built from the rows themselves.
 */

/** The tone of a row's status dot: the status pill's families. */
export type RowTone = 'ok' | 'crit' | 'warn' | 'brand' | 'neutral';

export interface ListItem {
  id: number;
  kind: 'task' | 'request';
  /** What tells rows apart: the request's title -- whole, and split into its name and a trailing reference (splitRef). */
  title: string;
  name: string;
  ref: string;
  /** Step · workflow, muted. */
  sub: string;
  status: string;
  tone: RowTone;
  /** The row's time, compact ("21:34", "Yesterday", "7 Oct"), and the exact time for its tooltip. */
  time: string;
  timeTitle: string;
  /** Overdue: the row's time takes the crit accent. */
  crit: boolean;
  workflow: string;
  group: string;
  /** Everything the search looks in, lower case. */
  haystack: string;
}

export interface DayGroup<T> { label: string; rows: T[]; }

/** Past days, newest first: what was acted on, or asked for. */
export const PAST_GROUPS = ['Today', 'Yesterday', 'Earlier this week', 'Older'] as const;

/**
 * The day group of a past moment: Today, Yesterday, Earlier this week (since Monday) or Older. A moment without a time
 * is Older; one a little in the future (a clock ahead of ours) is Today.
 */
export function pastGroup(iso: string | null | undefined, now: number, timeZone?: string): string {
  const at = instantOf(iso);
  if (!at) return 'Older';
  const today = new Date(now);
  const days = dayNumber(today, timeZone) - dayNumber(at, timeZone);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= daysIntoWeek(today, timeZone)) return 'Earlier this week';
  return 'Older';
}

/**
 * The group of a task still open, by when it is due -- the order the service lists them in, soonest first, so the
 * headers never break that order: Overdue, Due today, Due tomorrow, Later this week, Later, No due time.
 */
export function dueGroup(dueAt: string | null | undefined, overdue: boolean | undefined, now: number, timeZone?: string): string {
  const at = instantOf(dueAt);
  if (!at) return 'No due time';
  if (overdue || at.getTime() < now) return 'Overdue';
  const today = new Date(now);
  const days = dayNumber(at, timeZone) - dayNumber(today, timeZone);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 6 - daysIntoWeek(today, timeZone)) return 'Later this week';
  return 'Later';
}

/** Rows under their group's header, in the order the groups first appear: the list's own order is kept. */
export function groupRows<T extends { group: string }>(rows: T[]): DayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.group);
    if (list) list.push(row); else groups.set(row.group, [row]);
  }
  return [...groups].map(([label, list]) => ({ label, rows: list }));
}

/** Every word of the query is somewhere in the row, in any order and any case. */
export function matchesSearch(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every(w => haystack.includes(w));
}

/** A filter's choices from the rows themselves, each with how many rows it holds, in the order first seen. */
export function choicesOf(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }));
}

/** The row a step away from the open one in the shown list, staying at the ends; the first when none is open. */
export function stepFrom(ids: number[], current: number | null, delta: number): number | null {
  if (!ids.length) return null;
  const at = current == null ? -1 : ids.indexOf(current);
  if (at < 0) return ids[delta < 0 ? ids.length - 1 : 0];
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
}

/** The row to open once this one leaves the list: the one after it, else the one before, else none. */
export function nextAfter(ids: number[], current: number): number | null {
  const at = ids.indexOf(current);
  if (at < 0) return ids[0] ?? null;
  return ids[at + 1] ?? ids[at - 1] ?? null;
}

/**
 * A title's trailing reference -- a last word of # and letters or digits, "#1016" -- apart from the name before it, so a
 * narrow list cuts the name and never the reference, often the one thing that tells rows apart. No reference: all name.
 */
export function splitRef(title: string): { name: string; ref: string } {
  const m = /^(.*\S)\s+(#[A-Za-z0-9]+)$/.exec(title.trim());
  return m ? { name: m[1], ref: m[2] } : { name: title, ref: '' };
}

/**
 * A name's trailing reference -- a #reference as splitRef finds, or a last word with a digit in it ("E2E purchase
 * 1006022333", "Claims v2") -- apart from the name before it, so a narrow list cuts the name in the middle and keeps the
 * part that tells near-identical names apart. A one-word name, or one whose last word has no digit, is all name.
 */
export function splitTail(title: string): { name: string; ref: string } {
  const m = /^(.*\S)\s+(#?[A-Za-z0-9._-]*\d[A-Za-z0-9._-]*)$/.exec(title.trim());
  return m ? { name: m[1], ref: m[2] } : { name: title, ref: '' };
}

/** The one value every row shares (two rows at least), or '' when they differ. */
export function commonOf(values: string[]): string {
  if (values.length < 2) return '';
  const first = values[0];
  return first && values.every(v => v === first) ? first : '';
}

/**
 * A fresh first page laid over the rows already loaded, so the pages a person loaded stay: the fresh page is the truth
 * up to its last row (a loaded row in that stretch it no longer holds has left the list), and the loaded rows after that
 * point follow it -- without the one that left (a task acted on). A fresh page that is the whole list is all of it.
 */
export function mergeHead<T extends { id: number }>(head: T[], loaded: T[], gone: number | null, headIsAll: boolean): T[] {
  if (headIsAll) return head.filter(r => r.id !== gone);
  const position = new Map(loaded.map((r, i) => [r.id, i]));
  let cut = -1;
  for (let i = head.length - 1; i >= 0 && cut < 0; i--) cut = position.get(head[i].id) ?? -1;
  const fresh = new Set(head.map(r => r.id));
  return [...head, ...loaded.slice(cut + 1).filter(r => !fresh.has(r.id))].filter(r => r.id !== gone);
}

/** The next page under the rows loaded (Load more); a row already there is not drawn twice. */
export function appendPage<T extends { id: number }>(loaded: T[], page: T[]): T[] {
  const have = new Set(loaded.map(r => r.id));
  return [...loaded, ...page.filter(r => !have.has(r.id))];
}
