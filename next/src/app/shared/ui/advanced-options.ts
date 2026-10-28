import { AdvancedOption, AdvancedTone } from './advanced-select';

/**
 * Shapes the console's common lists into advanced-select options (shared/ui/advanced-select.ts), so a run, a bucket or a
 * person reads the same in every picker: a name, a line of what it is, and a mark of its state.
 */

/** A run's or a step's outcome as a pill tone: done is ok, failed is crit, in progress is info, skipped or missed is warn. */
export function runStatusTone(status: string | null | undefined): AdvancedTone {
  switch (String(status ?? '')) {
    case 'Completed': return 'ok';
    case 'Failed': case 'Interrupt': case 'Cancelled': return 'crit';
    case 'Running': case 'Queued': case 'Start': case 'Retrying': return 'info';
    case 'Skip': case 'Missed': return 'warn';
    default: return 'neutral';
  }
}

/** A run: "Run #3021", when it started on the second line, its outcome as a badge; found by its number too. */
export function runOption(run: { jobQueueId: number; jobStatus?: string | null }, started: string | null, extra = ''): AdvancedOption {
  return {
    value: String(run.jobQueueId),
    label: `Run #${run.jobQueueId}`,
    description: [started ? `Started ${started}` : 'Not started yet', extra].filter(Boolean).join(' · '),
    badge: run.jobStatus || undefined,
    badgeTone: runStatusTone(run.jobStatus),
    keywords: String(run.jobQueueId),
  };
}

/** A storage bucket: its name, the bucket (and provider) under it when the name is not the bucket. */
export function bucketOption(b: { bucket: string; label?: string | null; provider?: string | null; description?: string | null }): AdvancedOption {
  const label = b.label || b.bucket;
  return {
    value: b.bucket,
    label,
    description: [label !== b.bucket ? b.bucket : '', b.provider ?? '', b.description ?? ''].filter(Boolean).join(' · ') || undefined,
    keywords: [b.bucket, b.provider].filter(Boolean).join(' '),
  };
}

/** A person: the name, the email (or sign-in name) and role under it. */
export function personOption(value: string | number, p: { fullName?: string | null; name?: string | null; username?: string | null;
  email?: string | null; role?: string | null }, extra = ''): AdvancedOption {
  const label = p.fullName || p.name || p.username || p.email || `Person ${value}`;
  const contact = p.email || (p.username && p.username !== label ? p.username : '');
  return {
    value: String(value),
    label,
    description: [contact, p.role ?? '', extra].filter(Boolean).join(' · ') || undefined,
    keywords: [p.username, p.email].filter(Boolean).join(' '),
  };
}

/** The value an advanced select holds for an id that may be unset ('' for none). */
export function idValue(id: number | string | null | undefined): string {
  return id === null || id === undefined ? '' : String(id);
}

/** The id an advanced select's value stands for (null for none). */
export function idOf(value: string | null | undefined): number | null {
  return value ? Number(value) : null;
}
