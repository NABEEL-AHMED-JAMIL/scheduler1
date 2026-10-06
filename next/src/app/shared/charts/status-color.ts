/**
 * One status-to-colour mapping for every chart, matching the pills in the tables.
 *
 * It lived on the dashboard while the Queue and Job History screens had none, so the same
 * status would have been a different colour on each screen once they gained charts.
 *
 * Each of the eight run states gets its own value, from the --series-* tokens rather than the
 * raw palette. That indirection is what makes a chart legible in both themes: the tokens carry
 * a different step per theme, where the fixed -500 values these used to return measured under
 * 4.0 on a dark card for every single status. Statuses in the same family stay neighbouring
 * shades, so a chart still reads as "mostly good" or "mostly bad" at a glance.
 */
/**
 * How many categorical slots --chart-N actually defines in styles.css.
 *
 * This number was written as a bare `% 6` in six places -- two dashboard templates, the donut,
 * the analytics board, this file, and a hand-listed array in ranked-bar. When the palette grew
 * past six, five of those six would have kept wrapping early and the new colours would simply
 * never have been drawn, with nothing failing to say so. It is defined once here so that the
 * palette and the code that indexes it cannot disagree.
 */
export const CHART_SLOTS = 8;

/**
 * The categorical colour for the nth distinct thing in a chart.
 *
 * Wraps, so a chart with more categories than slots repeats rather than drawing nothing -- the
 * caller is responsible for deciding whether that many categories can be told apart at all
 * (see DONUT_SLICES). The double modulo keeps a negative index in range instead of producing
 * `var(--chart--2)`, which is not a token and silently paints nothing.
 */
export const chartColor = (index: number): string =>
  `var(--chart-${((Math.trunc(index) % CHART_SLOTS) + CHART_SLOTS) % CHART_SLOTS})`;

export const statusColor = (name: string, index = 0): string => {
  switch ((name ?? '').toLowerCase()) {
    // Waiting, not working -- grey rather than the in-progress indigo it used to share.
    case 'queue':     return 'var(--series-muted)';
    case 'start':     return 'var(--series-brand-soft)';
    case 'running':   return 'var(--series-brand)';

    case 'completed':
    case 'success':
    case 'ok':        return 'var(--series-ok)';
    case 'active':    return 'var(--series-ok-soft)';

    case 'failed':    return 'var(--series-crit)';
    // Stopped part-way rather than having run and errored.
    case 'interrupt': return 'var(--series-crit-soft)';

    // Deliberately not run.
    case 'skip':      return 'var(--series-warn-soft)';
    // The scheduler never ran it, which is a failure of ours rather than a choice.
    case 'missed':    return 'var(--series-warn)';
    case 'inactive':
    case 'suspended': return 'var(--series-warn-soft)';

    // Anything with no status meaning falls through to the categorical series.
    default:          return chartColor(index);
  }
};
