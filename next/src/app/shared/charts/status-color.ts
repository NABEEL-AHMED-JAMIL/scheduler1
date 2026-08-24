/**
 * One status-to-colour mapping for every chart, matching the pills in the tables.
 *
 * It lived on the dashboard while the Queue and Job History screens had none, so the same
 * status would have been a different colour on each screen once they gained charts.
 *
 * Each of the eight run states gets its own value. They used to share four between them, so a
 * donut of an hour's outcomes could not show you that a run was queued rather than working,
 * or skipped rather than missed. Statuses in the same family stay neighbouring shades, so the
 * chart still reads as "mostly good" or "mostly bad" at a glance.
 */
export const statusColor = (name: string, index = 0): string => {
  switch ((name ?? '').toLowerCase()) {
    // Waiting, not working -- grey rather than the in-progress indigo it used to share.
    case 'queue':     return 'var(--color-ink-400)';
    case 'start':     return 'var(--color-brand-400)';
    case 'running':   return 'var(--color-brand-500)';

    case 'completed':
    case 'success':
    case 'ok':        return 'var(--color-ok-500)';
    case 'active':    return 'var(--color-ok-400)';

    case 'failed':    return 'var(--color-crit-500)';
    // Stopped part-way rather than having run and errored.
    case 'interrupt': return 'var(--color-crit-400)';

    // Deliberately not run.
    case 'skip':      return 'var(--color-warn-400)';
    // The scheduler never ran it, which is a failure of ours rather than a choice.
    case 'missed':    return 'var(--color-warn-600)';
    case 'inactive':
    case 'suspended': return 'var(--color-warn-500)';

    default:          return `var(--chart-${index % 6})`;
  }
};
