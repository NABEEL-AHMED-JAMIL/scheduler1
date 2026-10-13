import { instantMs } from '../../../core/instant';
import { StepLogLine } from '../run-steps/run-steps.model';

/**
 * The run page's Log (UX review 2026-10-12, run page fix): the run's own entries and, for a step, that step's own lines
 * (what the Console showed), as one stream with a level and a step each, filtered by level, step and text. Pure, for
 * the specs.
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
export const LOG_LEVELS: readonly LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

/** A run audit entry as findSourceJobAuditLog answers it. */
export interface AuditEntry {
  jobAuditLogId?: number;
  jobQueueId?: number;
  jobId?: number;
  logsDetail?: string;
  dateCreated?: string;
}

export interface LogLine {
  /** Stable within one build of the stream, for tracking and jump-to. */
  id: string;
  at: string | null;
  level: LogLevel;
  /** The step the line is about: a step's own line, or a run entry that names it ("Step 3/13 <manifest> ..."). */
  step: string | null;
  source: 'run' | 'step';
  message: string;
  /** The run entry the line came from (its paths link to their folders). */
  entry?: AuditEntry;
}

/** A line's level as written, in one of four words; anything unknown is INFO. */
export function levelWord(level: string | null | undefined): LogLevel {
  const l = (level ?? '').toUpperCase();
  if (l === 'ERROR' || l === 'FATAL' || l === 'SEVERE') return 'ERROR';
  if (l === 'WARN' || l === 'WARNING') return 'WARN';
  if (l === 'DEBUG' || l === 'TRACE') return 'DEBUG';
  return 'INFO';
}

/** The colour class of a level's word, in the log's own palette (light and dark). */
export function levelClass(level: LogLevel): string {
  return `run-log-level-${level.toLowerCase()}`;
}

/**
 * A run entry's level, from its wording -- workers prefix nothing. Matched with their endings ("Failed:", "failed"),
 * failure before warning so "Attempt 1 of 3 failed ... Queued for attempt 2" is an error. "rejected" is left out on
 * purpose: "40 accepted, 0 rejected" is a good run.
 */
export function levelOfText(text: string | null | undefined): LogLevel {
  const t = (text ?? '').toLowerCase();
  if (/\b(fail\w*|errors?|exceptions?|could not|unable|interrupt\w*)\b/.test(t) && !/\b0 (errors?|failed)\b/.test(t)) return 'ERROR';
  if (/\b(warn\w*|skip\w*|missed|retr(y|ying|ied|ies))\b/.test(t)) return 'WARN';
  return 'INFO';
}

/** The step a run entry names: the engine writes "Step 3/13 <manifest> (read_file) ...". */
export function stepOfText(text: string | null | undefined): string | null {
  return /^Step \d+\/\d+ <([a-z][a-z0-9_]*)>/.exec(text ?? '')?.[1] ?? null;
}

export function auditLines(entries: AuditEntry[]): LogLine[] {
  return entries.map((entry, i) => ({
    id: `r${entry.jobAuditLogId ?? i}-${i}`,
    at: entry.dateCreated ?? null,
    level: levelOfText(entry.logsDetail),
    step: stepOfText(entry.logsDetail),
    source: 'run' as const,
    message: entry.logsDetail ?? '',
    entry,
  }));
}

export function stepLines(stepKey: string, lines: StepLogLine[]): LogLine[] {
  return lines.map(line => ({
    id: `s${stepKey}-${line.lineNo}`,
    at: line.loggedAt ?? null,
    level: levelWord(line.level),
    step: stepKey,
    source: 'step' as const,
    message: line.message ?? '',
  }));
}

/** Lines from several sources in time order; a line with no time keeps its place after the timed ones before it. */
export function mergeLines(...sources: LogLine[][]): LogLine[] {
  const all = sources.flat().map((line, order) => ({ line, order, at: instantMs(line.at) }));
  return all.sort((a, b) => {
    if (a.at !== null && b.at !== null && a.at !== b.at) return a.at - b.at;
    return a.order - b.order;
  }).map(x => x.line);
}

export interface LogFilter {
  term: string;
  /** The levels shown; empty shows all. */
  levels: ReadonlySet<LogLevel>;
  /** One step's lines, or null for every line. */
  step: string | null;
}

export function filterLines(lines: LogLine[], filter: LogFilter): LogLine[] {
  const term = filter.term.trim().toLowerCase();
  return lines.filter(line =>
    (!filter.levels.size || filter.levels.has(line.level))
    && (!filter.step || line.step === filter.step)
    && (!term || line.message.toLowerCase().includes(term)));
}

export function levelCounts(lines: LogLine[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
  for (const line of lines) counts[line.level]++;
  return counts;
}

/** The lines as plain text, for Copy and Download: "09:06:46  INFO  [manifest] message". */
export function logText(lines: LogLine[], time: (at: string | null) => string): string {
  return lines.map(line => `${time(line.at)}  ${line.level.padEnd(5)}  ${line.step ? `[${line.step}] ` : ''}${line.message}`).join('\n') + '\n';
}

/** The index of the next error after `from` (wrapping), or -1 when there is none. */
export function nextError(lines: LogLine[], from: number, direction: 1 | -1 = 1): number {
  const n = lines.length;
  if (!n) return -1;
  for (let step = 1; step <= n; step++) {
    const i = ((from + direction * step) % n + n) % n;
    if (lines[i].level === 'ERROR') return i;
  }
  return -1;
}

/**
 * The log's look, for the Log tab and the step log panel: monospaced on the console's dark ground in both themes (that
 * is what a log looks like everywhere people read one), the time muted, each level in its colour, the step as a tag.
 */
export const RUN_LOG_STYLES = `
  .run-log-lines { background: var(--color-ink-900); color: var(--color-ink-100); font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px; line-height: 20px; }
  .run-log-lines.is-wrap { padding: 0.375rem 0; }
  .run-log-spacer { position: relative; }
  .run-log-scroll { overflow: auto; max-height: 40rem; }
  .run-log-line { display: flex; gap: 0.625rem; padding: 0 1rem; height: 20px; white-space: pre; }
  .run-log-lines.is-wrap .run-log-line { height: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .run-log-line.is-current { background: color-mix(in srgb, var(--color-crit-500) 28%, transparent); }
  .run-log-line[data-level="ERROR"] { background: color-mix(in srgb, var(--color-crit-500) 14%, transparent); }
  .run-log-line[data-level="WARN"] { background: color-mix(in srgb, var(--color-warn-500) 10%, transparent); }
  .run-log-time { color: var(--color-ink-400); flex: none; }
  .run-log-level { flex: none; width: 3rem; font-weight: 600; }
  .run-log-level-error { color: var(--color-crit-400); }
  .run-log-level-warn { color: var(--color-warn-400); }
  .run-log-level-info { color: var(--color-info-300); }
  .run-log-level-debug { color: var(--color-ink-400); }
  .run-log-dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: currentColor; margin-right: 0.25rem; }
  .run-log-dot.run-log-level-error { color: var(--color-crit-500); }
  .run-log-dot.run-log-level-warn { color: var(--color-warn-500); }
  .run-log-dot.run-log-level-info { color: var(--accent-mark); }
  .run-log-step { flex: none; color: var(--color-ink-300); width: 7.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run-log-msg { min-width: 0; }
  .run-log-lines:not(.is-wrap) .run-log-msg { overflow: hidden; text-overflow: ellipsis; }
  .run-log-lines .log-path { color: var(--color-ink-50); text-decoration: underline; text-decoration-color: var(--color-ink-400); }
  .run-log-lines .log-ref { color: var(--color-info-300); text-decoration: underline; text-decoration-color: var(--color-info-300); text-underline-offset: 2px; }
  .run-log-lines .log-ref:hover { color: var(--color-ink-50); }
  .run-log-level-on { border-color: var(--accent-mark); }
`;
