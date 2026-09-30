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
}

type Names = (id: number | null | undefined) => string;

export function historyLines(events: HistoryEvent[], name: Names, stepName: (key: string | null | undefined) => string): HistoryLine[] {
  const lines: HistoryLine[] = [];
  for (const e of events) {
    const d = detailOf(e.detail);
    const step = stepName(e.stepKey);
    const who = e.onBehalfOf ? `${name(e.actor)} (for ${name(e.onBehalfOf)})` : name(e.actor);
    const line = (text: string, tone: HistoryLine['tone'] = 'plain', comment?: string) =>
      lines.push({ id: e.id, at: e.at, text, tone, comment });
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

/** "1 Oct, 16:00" from an ISO local date-time. */
export function shortTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}, ${m[4]}:${m[5]}`;
}
