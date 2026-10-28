import { ActivityRow } from './report-studio.model';
import { codeWords } from '../../shared/ui/plain-words';

/**
 * A report's Activity in words (owner 2026-10-27, RPT-0070: "report.approved.signed" and "report.version.voided" showed as
 * codes). Every action media-service audits on a report has its words (report-audit-actions.fixture.ts lists them, and
 * report-activity.spec.ts holds this list to it); one it adds later reads its code in words ("report.foo.bar": "Foo bar"),
 * never the code. The detail reads in words too ("Version 2 · PDF · Template v8"); a reason, a note or why a version was not
 * signed is the line's quote; who acted is their name where the entry or the directory has it.
 */
export const REPORT_ACTIVITY: Record<string, string> = {
  'report.created': 'Report created',
  'report.requested': 'Generation requested',
  'report.generated': 'Version made',
  'report.failed': 'Generation failed',
  'report.downloaded': 'Downloaded',
  'report.delivered': 'Delivered',
  'report.archived': 'Archived',
  'report.deleted': 'Deleted',
  'report.files.left': 'Files kept for an operator to remove',
  'report.approval.requested': 'Approval asked',
  'report.approval.first': 'First approval given',
  'report.approval.rejected': 'Approval rejected',
  'report.approved': 'Approved (not signed)',
  'report.approved.signed': 'Approved and signed',
  'report.version.voided': 'Version voided',
};

/** The actions whose words name who did it ("Approved and signed by Alex Morgan, RN"). */
const BY_SOMEONE = new Set(['report.approval.first', 'report.approval.rejected', 'report.approved', 'report.approved.signed',
  'report.version.voided', 'report.approval.requested', 'report.deleted', 'report.archived']);

/** A report action's code in words, its "report." left off: "report.foo_bar.baz" reads "Foo bar baz" (plain-words codeWords). */
export function codeInWords(code: string): string {
  return codeWords(code.replace(/^report\./, '')) || code;
}

const FORMATS: Record<string, string> = { pdf: 'PDF', html: 'HTML', md: 'Markdown', markdown: 'Markdown', json: 'JSON', csv: 'CSV' };

/** One line of the Activity: what happened (and who), the facts in words, and a quote when the entry says why. */
export interface ActivityLine { text: string; detail: string; note: string | null }

export function activityLine(a: ActivityRow, nameOf: (id: number) => string | null = () => null): ActivityLine {
  const d = a.detail ?? {};
  const word = REPORT_ACTIVITY[a.action] ?? codeInWords(a.action);
  const named = typeof d['byName'] === 'string' && d['byName'].trim() ? d['byName'].trim() : a.actor != null ? nameOf(a.actor) : null;
  const text = BY_SOMEONE.has(a.action) && named ? `${word} by ${named}` : word;
  return { text, detail: activityDetail(d), note: noteOf(d) };
}

/** The entry's facts in words: "Version 2 · PDF · Template v8 · via API · marked VOID · 3 files". */
export function activityDetail(d: Record<string, unknown>): string {
  const out: string[] = [];
  const n = (k: string) => (typeof d[k] === 'number' || (typeof d[k] === 'string' && /^\d+$/.test(d[k] as string)) ? Number(d[k]) : null);
  if (n('version') != null) out.push(`Version ${n('version')}`);
  if (typeof d['format'] === 'string' && d['format']) out.push(FORMATS[(d['format'] as string).toLowerCase()] ?? (d['format'] as string).toUpperCase());
  if (n('templateVersion') != null) out.push(`Template v${n('templateVersion')}`);
  if (typeof d['via'] === 'string' && d['via']) out.push(`via ${d['via'] === 'api' ? 'API' : codeInWords(d['via'] as string).toLowerCase()}`);
  if (typeof d['served'] === 'string' && d['served']) out.push(`marked ${d['served']}`);
  if (d['secondApprover'] === true) out.push('a second approver too');
  if (n('versions') != null) out.push(`${n('versions')} version${n('versions') === 1 ? '' : 's'}`);
  if (n('files') != null) out.push(`${n('files')} file${n('files') === 1 ? '' : 's'}`);
  if (typeof d['code'] === 'string' && d['code']) out.push(codeInWords((d['code'] as string).toLowerCase()));
  return out.join(' · ');
}

/** Why, in the entry's own words: a voiding's reason, an approval's note, why a version was not signed. */
function noteOf(d: Record<string, unknown>): string | null {
  for (const k of ['reason', 'note', 'why']) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
