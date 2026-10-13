import { formatSize } from '../../../shared/ui/format-size';

/** MIG-354: the classes of a workspace's data a retention policy keeps for a number of days. */
export type DataClassKey = 'RUN_OUTPUTS' | 'RUN_LOGS' | 'FILES' | 'DOCUMENTS' | 'FORM_SUBMISSIONS' | 'AI_CONVERSATIONS' | 'NOTIFICATIONS'
  | 'ANALYTICS' | 'AUDIT';

/** Days per class; null keeps it forever. */
export type ClassDays = Partial<Record<DataClassKey, number | null>>;

export interface ClassResult {
  dataClass: DataClassKey;
  state: string | null;
  keepDays: number | null;
  cutoff: string | null;
  eligible: number;
  total: number;
  deleted: number;
  bytes: number | null;
  oldest: string | null;
  note: string | null;
  finishedAt: string | null;
  label?: string;
}

export interface RetentionClass {
  dataClass: DataClassKey;
  label: string;
  covers: string;
  owner: string;
  configurable: boolean;
  holds: string;
  keepDays: number | null;
  minDays: number | null;
  confirmedCount: number | null;
  confirmedAt: string | null;
  last: ClassResult | null;
}

export interface RetentionHold {
  id: number;
  scope: 'WORKSPACE' | 'PIPELINE' | 'RUN';
  jobId: number | null;
  runId: number | null;
  reason: string;
  placedBy: number | null;
  placedAt: string | null;
  active: boolean;
  releasedBy: number | null;
  releasedAt: string | null;
  releaseReason: string | null;
}

export interface RetentionPass {
  passId: number;
  startedHow: 'SCHEDULE' | 'MANUAL' | 'RESUME';
  state: string;
  startedBy: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  deleted: number;
  bytes: number;
  note: string | null;
  classes?: ClassResult[];
}

export interface RetentionPlatform {
  auditFloorDays: number;
  maxSharePct: number;
  updatedAt?: string | null;
}

export interface RetentionView {
  tenantId: number;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
  platform: RetentionPlatform;
  classes: RetentionClass[];
  holds: RetentionHold[];
  lastPass: RetentionPass | null;
  running: boolean;
  changes?: string[];
}

export interface RetentionPreview {
  tenantId: number;
  enabled: boolean;
  at: string;
  classes: ClassResult[];
  items: number;
  bytes: number;
  workspaceHold: boolean;
  pipelineHolds: number;
  runHolds: number;
}

export interface RetentionConfirmation {
  dataClass: DataClassKey;
  confirmedCount: number;
  total: number;
  message: string;
}

export interface RetentionAuditLine {
  id: number;
  at: string | null;
  actorUserId: number | null;
  action: string;
  dataClass: string | null;
  passId: number | null;
  detail: string;
}

export const MAX_DAYS = 36500;

/** "90 days", "1 day", "Forever"; a class the platform bounds says so. */
export function keepText(c: Pick<RetentionClass, 'configurable' | 'keepDays'>): string {
  if (!c.configurable) return 'Bounded by the platform';
  return c.keepDays == null ? 'Forever' : daysText(c.keepDays);
}

export function daysText(days: number): string {
  if (days % 365 === 0 && days >= 365) return days === 365 ? '1 year' : `${days / 365} years`;
  return days === 1 ? '1 day' : `${days.toLocaleString('en-US')} days`;
}

/** A pass's or a class's state, in the console's words and its pill's tone. */
export function stateOf(state: string | null | undefined): { label: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' } {
  switch (state) {
    case 'DONE': return { label: 'Done', tone: 'ok' };
    case 'NOTHING': return { label: 'Nothing to remove', tone: 'ok' };
    case 'READY': return { label: 'Would remove', tone: 'neutral' };
    case 'PARTIAL': return { label: 'Continues next hour', tone: 'neutral' };
    case 'RUNNING': return { label: 'Running', tone: 'neutral' };
    case 'HELD': return { label: 'On legal hold', tone: 'warn' };
    case 'PAUSED': return { label: 'Needs confirmation', tone: 'warn' };
    case 'NEEDS_CONFIRMATION': return { label: 'Will need confirmation', tone: 'warn' };
    case 'FAILED': return { label: 'Failed', tone: 'crit' };
    case 'INTERRUPTED': return { label: 'Interrupted', tone: 'warn' };
    case 'UNAVAILABLE': return { label: 'Not available yet', tone: 'neutral' };
    case 'OFF': return { label: 'Kept forever', tone: 'neutral' };
    default: return { label: 'Not run yet', tone: 'neutral' };
  }
}

/** The days field's problem, or ''. Empty is forever; the audit class has the platform's minimum. */
export function daysProblem(c: Pick<RetentionClass, 'dataClass' | 'label' | 'minDays'>, value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (!/^\d+$/.test(text)) return 'A whole number of days, or empty to keep forever.';
  const days = Number(text);
  if (days < 1 || days > MAX_DAYS) return `1 to ${MAX_DAYS.toLocaleString('en-US')} days, or empty to keep forever.`;
  if (c.minDays != null && days < c.minDays) return `At least ${c.minDays.toLocaleString('en-US')} days (the platform's minimum for audit records).`;
  return '';
}

/** The days a draft names: a number, or null for forever. */
export function draftDays(value: string): number | null {
  const text = value.trim();
  return text ? Number(text) : null;
}

/** What a preview says of one class, in one line. */
export function previewLine(r: ClassResult): string {
  if (r.state === 'OFF') return 'Kept forever';
  if (r.state === 'UNAVAILABLE') return 'Its service cannot count it yet';
  if (r.state === 'FAILED') return r.note || 'Could not be counted';
  if (!r.eligible) return 'Nothing older';
  const size = r.bytes != null && r.bytes > 0 ? `, ${formatSize(r.bytes)}` : '';
  return `${r.eligible.toLocaleString('en-US')} of ${r.total.toLocaleString('en-US')}${size}`;
}

export function holdTarget(h: Pick<RetentionHold, 'scope' | 'jobId' | 'runId'>, pipelineName?: string | null): string {
  if (h.scope === 'WORKSPACE') return 'The whole workspace';
  if (h.scope === 'PIPELINE') return `Pipeline ${pipelineName ? `"${pipelineName}"` : `#${h.jobId}`}`;
  return `Run #${h.runId}`;
}

/** The service writes its dashes as "--" and its arrows as "->"; the console shows them typeset. */
export function readable(text: string | null | undefined): string {
  return (text ?? '').replace(/\s--\s/g, ' — ').replace(/\s->\s/g, ' → ');
}
