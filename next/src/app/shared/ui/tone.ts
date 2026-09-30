/**
 * A tone as a class rather than an inline style (MIG-257).
 *
 * Several screens pick a colour per row -- a run step's dot, a log line's level, a request's
 * status bar, a toast's edge -- and bound it with [style.background]="...". The helpers that make
 * that choice return a token reference ("var(--color-crit-500)") and have specs that pin it, so
 * they stay as they are; this turns the reference into the class that sets the same token as
 * --tone. A rule then paints --tone where it belongs: .tone-fill, .tone-text, .tone-ring or
 * .tone-edge (styles.css). The dark theme needs nothing extra: every token already flips.
 */
const TONE_CLASSES: Readonly<Record<string, string>> = {
  'var(--color-ok-500)':   'tone-ok',
  'var(--color-warn-500)': 'tone-warn',
  'var(--color-crit-500)': 'tone-crit',
  'var(--accent-mark)':    'tone-brand',
  'var(--series-warn)':    'tone-pending',
  'var(--color-ink-400)':  'tone-log',
  'var(--text-muted)':     'tone-muted',
  'var(--border-strong)':  'tone-strong',
  'var(--border-subtle)':  'tone-quiet',
};

/** The tone class for a token reference; an unknown one is the quietest tone, never unstyled. */
export function toneClass(token: string | null | undefined): string {
  return TONE_CLASSES[token ?? ''] ?? 'tone-quiet';
}
