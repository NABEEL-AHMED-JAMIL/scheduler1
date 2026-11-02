import { ReportVersionRow } from './report-studio.model';
import { rsTime } from './rs-time.pipe';

/** One step of a report version's life cycle, as the strip over the viewer shows it. */
export interface Stage {
  key: 'generated' | 'checked' | 'first' | 'second' | 'approval' | 'delivered';
  label: string;
  detail: string;
  state: 'done' | 'now' | 'todo' | 'warn';
}

/** Days since an instant, in words: "today", "1 day ago", "9 days ago". */
export function daysAgo(at: string | null | undefined, now = Date.now()): string {
  if (!at) return '';
  const days = Math.floor((now - new Date(at).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Reports redesign (owner 2026-11-02; design report.html): the version's life cycle -- Generated, Checked, the approval
 * (one, or a first and a second when the workspace asks for two), Delivered -- with who and when, from what the report
 * already says about the version: its job, its warnings, its review and its approval.
 */
export function reportStages(v: ReportVersionRow, took: (ms: number) => string, now = Date.now()): Stage[] {
  const out: Stage[] = [];
  out.push({ key: 'generated', label: 'Generated', state: 'done',
    detail: [rsTime(v.createdAt, 'recent'), v.jobMs ? took(v.jobMs) : '', v.pages ? `${v.pages} page${v.pages === 1 ? '' : 's'}` : '']
      .filter(Boolean).join(' · ') });
  const warnings = v.diagnostics?.length ?? 0;
  out.push({ key: 'checked', label: 'Checked', state: warnings ? 'warn' : 'done',
    detail: warnings ? `${warnings} warning${warnings === 1 ? '' : 's'} when it was made` : 'no problems' });

  const a = v.approval;
  const q = v.review;
  const two = !!q?.needsSecond || (a?.signers?.length ?? 0) > 1;
  if (v.void) {
    out.push({ key: 'approval', label: 'Void', state: 'warn', detail: `${v.void.by ? v.void.by + ': ' : ''}${v.void.reason}` });
  } else if (two) {
    const first = q?.firstApproval;
    const firstSigner = a?.signers?.find(s => s.slot === 1);
    if (first || firstSigner) {
      out.push({ key: 'first', label: '1st approval', state: 'done',
        detail: [first?.byName ?? firstSigner?.name ?? '', rsTime(first?.at ?? firstSigner?.at, 'recent')].filter(Boolean).join(' · ') });
    } else {
      out.push({ key: 'first', label: '1st approval', state: q?.state === 'OPEN' ? 'now' : 'todo',
        detail: q?.state === 'OPEN' ? `asked ${daysAgo(q.requestedAt, now)}` : 'not asked yet' });
    }
    if (a) {
      out.push({ key: 'second', label: '2nd approval', state: 'done', detail: [a.approverName ?? '', rsTime(a.approvedAt, 'recent')].filter(Boolean).join(' · ') });
    } else {
      out.push({ key: 'second', label: '2nd approval', state: first ? 'now' : 'todo',
        detail: first ? `waiting · asked ${daysAgo(q?.requestedAt, now)}` : 'after the first' });
    }
  } else if (a) {
    out.push({ key: 'approval', label: a.signed ? 'Approved and signed' : 'Approved', state: 'done',
      detail: [a.approverName ?? '', rsTime(a.approvedAt, 'recent')].filter(Boolean).join(' · ') });
  } else if (q?.state === 'OPEN') {
    out.push({ key: 'approval', label: 'Approval', state: 'now', detail: `waiting · asked ${daysAgo(q.requestedAt, now)}` });
  } else if (q?.state === 'REJECTED') {
    out.push({ key: 'approval', label: 'Sent back', state: 'warn', detail: [q.decidedByName ?? '', q.decisionNote ?? ''].filter(Boolean).join(': ') });
  } else {
    out.push({ key: 'approval', label: 'Approval', state: 'todo', detail: 'not asked yet' });
  }
  out.push({ key: 'delivered', label: 'Delivered', state: 'todo', detail: 'no delivery set for this report' });
  return out;
}

/** The first QR code a template definition prints (anywhere: body, header or footer), with what it encodes. */
export function findQr(definition: unknown): { content: string; sizeMm?: number } | null {
  let found: { content: string; sizeMm?: number } | null = null;
  const walk = (n: unknown): void => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const o = n as Record<string, unknown>;
    if (o['type'] === 'qrCode' && typeof o['content'] === 'string') {
      found = { content: o['content'] as string, sizeMm: typeof o['sizeMm'] === 'number' ? o['sizeMm'] as number : undefined };
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(definition);
  return found;
}
