/**
 * One status-to-colour mapping for every chart, matching the pills in the tables.
 *
 * It lived on the dashboard while the Queue and Job History screens had none, so the same
 * status would have been a different colour on each screen once they gained charts.
 */
export const statusColor = (name: string, index = 0): string => {
  switch ((name ?? '').toLowerCase()) {
    case 'completed':
    case 'success':
    case 'ok':        return 'var(--color-ok-500)';
    case 'failed':
    case 'interrupt': return 'var(--color-crit-500)';
    case 'missed':
    case 'skip':      return 'var(--color-warn-500)';
    case 'running':
    case 'start':
    case 'queue':     return 'var(--color-brand-500)';
    default:          return `var(--chart-${index % 6})`;
  }
};
