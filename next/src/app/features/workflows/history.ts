import { instantOf } from '../../core/instant';
import { HistoryEvent } from './workflows.api';

/**
 * A request's history in words (MIG-276): task_event rows as the inbox and the request view show them. Each line names
 * people -- a decision made for someone else says both -- and says what the step did. The engine's bookkeeping
 * (StepEntered) is left out: the step that followed says it better.
 */
export interface HistoryLine {
  id: number;
  at: string;
  text: string;
  tone: 'ok' | 'bad' | 'warn' | 'now' | 'plain';
  comment?: string;
  /** Who acted, when a person did: the timeline's byline. */
  actor?: string;
}

type Names = (id: number | null | undefined) => string;

export function historyLines(events: HistoryEvent[], name: Names, stepName: (key: string | null | undefined) => string): HistoryLine[] {
  const lines: HistoryLine[] = [];
  for (const e of events) {
    const d = detailOf(e.detail);
    const step = stepName(e.stepKey);
    const who = e.onBehalfOf ? `${name(e.actor)} (for ${name(e.onBehalfOf)})` : name(e.actor);
    const line = (text: string, tone: HistoryLine['tone'] = 'plain', comment?: string) =>
      lines.push({ id: e.id, at: e.at, text, tone, comment, actor: e.actor != null ? who : undefined });
    switch (e.type) {
      case 'Started': line(e.actor ? `Requested by ${name(e.actor)}` : 'Started', 'ok'); break;
      case 'TaskOpened': line(`${step}: waiting for ${assignee(d, name)}${d['due'] ? ' · due ' + shortTime(String(d['due'])) : ''}`, 'now'); break;
      case 'Approved': line(`${step}: approved by ${who}`, 'ok', str(d['comment'])); break;
      case 'Rejected': line(`${step}: rejected by ${who}`, 'bad', str(d['comment'])); break;
      case 'ChangesRequested': line(`${step}: ${who} asked for changes`, 'warn', str(d['comment'])); break;
      case 'Done': line(`${step}: done by ${who}`, 'ok', str(d['comment'])); break;
      case 'Reassigned': line(`${step}: passed by ${who} to ${name(num(d['toUserId']))}`, 'plain', str(d['comment'])); break;
      case 'Escalated': line(`${step}: overdue, escalated to ${target(String(d['to'] ?? ''), name)}`, 'warn', str(d['note'])); break;
      case 'Reminded': line(`${step}: reminder sent`, 'plain'); break;
      case 'AssignedToAdministrators': line(`${step}: went to the administrators`, 'plain', str(d['reason'])); break;
      case 'ConditionTrue': line(`${step}: yes`, 'plain'); break;
      case 'ConditionFalse': line(`${step}: no`, 'plain'); break;
      case 'PipelineStarted': line(`${step}: started run #${d['runId']}`, 'ok'); break;
      case 'PipelineFailed': line(`${step}: the pipeline could not start`, 'bad', str(d['error'])); break;
      case 'DatasetSaved': line(`${step}: saved to dataset ${d['dataset']}`, 'ok'); break;
      case 'Notified': line(`${step}: notified ${String(d['to'] ?? '').replace(':', ' ')}`, 'plain'); break;
      case 'Waiting': line(`${step}: waiting until ${shortTime(String(d['until'] ?? ''))}`, 'now'); break;
      case 'Resumed': line(`${step}: resumed`, 'plain'); break;
      case 'TaskCancelled': line(`${step}: no longer needed`, 'plain'); break;
      case 'Cancelled': line(`Cancelled by ${who}`, 'bad', str(d['reason'])); break;
      case 'Failed': line('Stopped', 'bad', str(d['reason'])); break;
      case 'Ended': line(`Request ${String(d['state'] ?? '').toLowerCase()}`, endTone(String(d['state'] ?? ''))); break;
      default: break;
    }
  }
  return lines;
}

/**
 * The task's own lines without its name (owner, 2026-10-06): under "Alex approves the visit", "Alex approves the visit:
 * went to the administrators" says the name twice. Only a line that starts with exactly that name and a colon loses
 * it; the rest of the request's history keeps its step names.
 */
export function dropOwnStep(lines: HistoryLine[], step: string | null | undefined): HistoryLine[] {
  if (!step) return lines;
  const prefix = `${step}: `;
  return lines.map(l => {
    if (!l.text.startsWith(prefix)) return l;
    const rest = l.text.slice(prefix.length);
    return { ...l, text: rest.charAt(0).toUpperCase() + rest.slice(1) };
  });
}

function detailOf(detail: string | null | undefined): Record<string, unknown> {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function assignee(d: Record<string, unknown>, name: Names): string {
  if (d['userId'] != null) return name(num(d['userId']));
  if (d['assignee'] === 'role') return d['value'] === 'TENANT_ADMIN' ? 'the administrators' : 'any member';
  if (d['assignee'] === 'group') return 'the group';
  return 'someone';
}

function target(to: string, name: Names): string {
  const [kind, value] = to.split(':');
  if (kind === 'user' || kind === 'manager') return name(Number(value));
  if (kind === 'role') return value === 'TENANT_ADMIN' ? 'the administrators' : 'any member';
  return kind === 'group' ? 'the group' : to;
}

function endTone(state: string): HistoryLine['tone'] {
  return state === 'Approved' || state === 'Completed' ? 'ok' : state === 'Cancelled' ? 'plain' : 'bad';
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : value == null ? null : Number(value);
}

function str(value: unknown): string | undefined {
  return value == null || value === '' ? undefined : String(value);
}

/**
 * "1 Oct, 16:00" in the viewer's zone (or the one named), 24-hour. The service's times arrive either naive (Chicago
 * wall-clock) or with an offset; instantOf reads both as the moment they are.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortTime(iso: string | null | undefined, timeZone?: string): string {
  const at = instantOf(iso);
  if (!at) return iso ?? '';
  const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    .formatToParts(at);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${Number(part('day'))} ${MONTHS[Number(part('month')) - 1]}, ${part('hour')}:${part('minute')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The calendar day an instant falls on, in the viewer's zone (or the one named), as days since 1970. */
export function dayNumber(at: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(at);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return Math.round(Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000);
}

/** Days since Monday (0 on a Monday), in the viewer's zone: where "this week" starts. */
export function daysIntoWeek(at: Date, timeZone?: string): number {
  return (dayNumber(at, timeZone) + 3) % 7; // 1 Jan 1970 was a Thursday
}

function clock(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(at);
  return `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`;
}

/**
 * The exact moment, for a tooltip: "Tue 6 Oct 2026, 14:05", 24-hour, in the viewer's zone.
 */
export function exactTime(iso: string | null | undefined, timeZone?: string): string {
  const at = instantOf(iso);
  if (!at) return iso ?? '';
  const parts = new Intl.DateTimeFormat('en-GB', { year: 'numeric', day: 'numeric', month: 'numeric', timeZone }).formatToParts(at);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${WEEKDAYS[(dayNumber(at, timeZone) + 4) % 7]} ${Number(part('day'))} ${MONTHS[Number(part('month')) - 1]} ${part('year')}, ${clock(at, timeZone)}`;
}

/**
 * A moment as a person says it, next to now: "just now", "5 min ago", "3 h ago", "Yesterday, 14:05", "in 2 h", or the
 * day and time when it is further off. The exact time goes in a tooltip (exactTime).
 */
export function relativeTime(iso: string | null | undefined, now: number = Date.now(), timeZone?: string): string {
  const at = instantOf(iso);
  if (!at) return iso ?? '';
  const diff = now - at.getTime();
  const minutes = Math.round(Math.abs(diff) / 60_000);
  const days = dayNumber(new Date(now), timeZone) - dayNumber(at, timeZone);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return diff > 0 ? `${minutes} min ago` : `in ${minutes} min`;
  if (days === 0) return diff > 0 ? `${Math.floor(minutes / 60)} h ago` : `in ${Math.floor(minutes / 60)} h`;
  if (days === 1) return `Yesterday, ${clock(at, timeZone)}`;
  if (days === -1) return `Tomorrow, ${clock(at, timeZone)}`;
  return shortTime(iso, timeZone);
}

/**
 * A list row's time, as a mail client puts it: the time today, "Yesterday" or "Tomorrow", the weekday within a week
 * either way, else the day and month.
 */
export function compactTime(iso: string | null | undefined, now: number = Date.now(), timeZone?: string): string {
  const at = instantOf(iso);
  if (!at) return '';
  const days = dayNumber(new Date(now), timeZone) - dayNumber(at, timeZone);
  if (days === 0) return clock(at, timeZone);
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  if (Math.abs(days) < 7) return WEEKDAYS[(dayNumber(at, timeZone) + 4) % 7];
  return shortTime(iso, timeZone).replace(/,.*$/, '');
}
