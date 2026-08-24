import { Intent } from './job-assistant.intents';

export interface JobRun {
  jobQueueId: number;
  jobStatus: string;
  startTime?: string;
  endTime?: string;
  jobStatusMessage?: string;
  dateCreated?: string;
}

export interface JobFacts {
  jobId: number;
  jobName: string;
  jobStatus: string;
  execution?: string;
  priority?: number;
  lastJobRun?: string;
  assignedUsername?: string;
  taskName?: string;
  taskType?: string;
  topic?: string;
  pipelineId?: string;
  bucket?: string;
  inputFolder?: string;
  outputFolder?: string;
  homePageId?: string;
  schedule?: {
    frequency?: string;
    intervalValue?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    nextRunAt?: string;
    expired?: boolean;
  } | null;
}

export interface RunStats {
  total: number;
  byStatus: Record<string, number>;
  successRate: number | null;
  averageSeconds: number | null;
  longestSeconds: number | null;
  firstRun?: string;
  lastRun?: string;
}

/** One block of an answer. The component decides how each is drawn. */
export type AnswerBlock =
  | { kind: 'text'; text: string }
  | { kind: 'facts'; rows: { label: string; value: string }[] }
  | { kind: 'stats' }
  | { kind: 'chart' }
  | { kind: 'runs'; runs: JobRun[] };

export interface Answer {
  blocks: AnswerBlock[];
  /** Shown when the assistant declines, so the reason is never a mystery. */
  refused?: boolean;
}

const HUMAN_STATUS: Record<string, string> = {
  Completed: 'completed', Failed: 'failed', Skip: 'skipped',
  Interrupt: 'interrupted', Missed: 'missed', Queue: 'queued',
  Start: 'starting', Running: 'running',
};

export function computeStats(runs: JobRun[]): RunStats {
  const byStatus: Record<string, number> = {};
  let durationTotal = 0, durationCount = 0, longest = 0;

  for (const run of runs) {
    byStatus[run.jobStatus] = (byStatus[run.jobStatus] ?? 0) + 1;
    if (run.startTime && run.endTime) {
      const seconds = (new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000;
      if (Number.isFinite(seconds) && seconds >= 0) {
        durationTotal += seconds;
        durationCount++;
        longest = Math.max(longest, seconds);
      }
    }
  }

  const finished = (byStatus['Completed'] ?? 0) + (byStatus['Failed'] ?? 0);
  const ordered = [...runs]
    .filter(r => r.startTime)
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

  return {
    total: runs.length,
    byStatus,
    // Of the runs that reached a verdict; queued and skipped runs are neither pass nor fail.
    successRate: finished ? Math.round(((byStatus['Completed'] ?? 0) / finished) * 100) : null,
    averageSeconds: durationCount ? Math.round((durationTotal / durationCount) * 10) / 10 : null,
    longestSeconds: durationCount ? Math.round(longest * 10) / 10 : null,
    firstRun: ordered[0]?.startTime,
    lastRun: ordered[ordered.length - 1]?.startTime,
  };
}

/**
 * A timestamp as a person would read it. The API returns a naive local stamp
 * ("2026-08-19T00:01:27.90799"), which was being printed verbatim next to dates the schedule
 * rows had already formatted -- so one row read "2026-08-17 at 00:01" and the next dumped its
 * microseconds. Anything unparseable is returned untouched rather than shown as "Invalid Date".
 */
export function humanMoment(value?: string): string {
  if (!value) return '—';
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return value;
  const date = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function humanDuration(seconds: number | null): string {
  if (seconds === null) return 'unknown';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function scheduleSentence(facts: JobFacts): string {
  const s = facts.schedule;
  if (!s) {
    return facts.execution === 'Manual'
      ? 'It runs only when someone triggers it — there is no schedule.'
      : 'No schedule is attached to this job.';
  }
  const every = s.intervalValue && s.intervalValue !== '1' ? `every ${s.intervalValue} ` : '';
  const unit = { Mint: 'minutes', Hr: 'hours', Daily: 'days', Weekly: 'weeks', Monthly: 'months' }[s.frequency ?? ''] ?? s.frequency;
  const at = s.startTime ? ` at ${String(s.startTime).slice(0, 5)}` : '';
  if (s.expired) return `The schedule has expired — it ran ${every}${unit}${at} and will not run again.`;
  return `It runs ${every}${unit}${at}.`;
}

/**
 * Builds the answer for one intent. Every number here comes from the job's own runs, so an
 * answer is either right or absent -- there is no path that produces a plausible invention.
 */
export function answerFor(intent: Intent, facts: JobFacts, runs: JobRun[],
                          mentionedJobId?: number): Answer {
  const stats = computeStats(runs);

  switch (intent) {
    case 'out-of-scope':
      return {
        refused: true,
        blocks: [{
          kind: 'text',
          text: mentionedJobId
            ? `I only know about job #${facts.jobId}. For job #${mentionedJobId}, open its own assistant.`
            : `I only know about job #${facts.jobId} — "${facts.jobName}". I cannot answer about other jobs, tenants or users from here.`,
        }],
      };

    case 'summary': {
      const rows = [
        { label: 'Job', value: `#${facts.jobId} · ${facts.jobName}` },
        { label: 'State', value: facts.jobStatus },
        { label: 'Runs how', value: facts.execution === 'Manual' ? 'On demand' : 'On a schedule' },
        { label: 'Task', value: facts.taskName ?? '—' },
        { label: 'Writes to', value: targetPath(facts) },
        { label: 'Runs recorded', value: String(stats.total) },
      ];
      if (facts.assignedUsername) rows.push({ label: 'Assigned to', value: facts.assignedUsername });
      return {
        blocks: [
          { kind: 'text', text: `${scheduleSentence(facts)} ${verdictSentence(stats)}`.trim() },
          { kind: 'facts', rows },
          { kind: 'stats' },
        ],
      };
    }

    case 'stats':
      if (!stats.total) return { blocks: [{ kind: 'text', text: 'This job has never run, so there is nothing to count yet.' }] };
      return {
        blocks: [
          { kind: 'text', text: verdictSentence(stats) },
          { kind: 'stats' },
          { kind: 'chart' },
        ],
      };

    case 'schedule': {
      const s = facts.schedule;
      const rows: { label: string; value: string }[] = [];
      if (s) {
        rows.push({ label: 'Frequency', value: `${s.frequency ?? '—'}${s.intervalValue ? ` · every ${s.intervalValue}` : ''}` });
        if (s.startDate) rows.push({ label: 'Starts', value: `${s.startDate}${s.startTime ? ` at ${String(s.startTime).slice(0, 5)}` : ''}` });
        if (s.endDate) rows.push({ label: 'Ends', value: s.endDate });
        rows.push({ label: 'Next run', value: s.expired ? 'Expired — no further runs' : (s.nextRunAt ?? 'Not scheduled') });
      }
      if (facts.lastJobRun) rows.push({ label: 'Last run', value: humanMoment(facts.lastJobRun) });
      return { blocks: [{ kind: 'text', text: scheduleSentence(facts) }, ...(rows.length ? [{ kind: 'facts' as const, rows }] : [])] };
    }

    case 'target': {
      const rows = [
        { label: 'Bucket', value: facts.bucket || 'Not configured' },
        { label: 'Reads from', value: facts.inputFolder || '—' },
        { label: 'Writes to', value: facts.outputFolder || '—' },
      ];
      if (facts.homePageId) rows.push({ label: 'Home page', value: facts.homePageId });
      return {
        blocks: [
          {
            kind: 'text',
            text: facts.bucket
              ? `Its task writes into ${targetPath(facts)}.`
              : 'Its task has no storage configured, so it writes nowhere the browser can show.',
          },
          { kind: 'facts', rows },
        ],
      };
    }

    case 'failures': {
      const failed = runs.filter(r => r.jobStatus === 'Failed');
      if (!failed.length) {
        return { blocks: [{ kind: 'text', text: `No run of this job has failed across ${stats.total} recorded ${stats.total === 1 ? 'run' : 'runs'}.` }] };
      }
      const messages = new Map<string, number>();
      for (const run of failed) {
        const message = (run.jobStatusMessage ?? 'No message recorded').trim();
        messages.set(message, (messages.get(message) ?? 0) + 1);
      }
      const ranked = [...messages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return {
        blocks: [
          { kind: 'text', text: `${failed.length} of ${stats.total} runs failed. The reasons given, most common first:` },
          { kind: 'facts', rows: ranked.map(([message, count]) => ({ label: `${count}×`, value: message })) },
          { kind: 'runs', runs: failed.slice(0, 10) },
        ],
      };
    }

    case 'history':
      if (!stats.total) return { blocks: [{ kind: 'text', text: 'This job has no recorded runs yet.' }] };
      return {
        blocks: [
          { kind: 'text', text: `${stats.total} runs recorded, most recent first.` },
          { kind: 'runs', runs: [...runs].slice(0, 15) },
        ],
      };

    case 'task':
      return {
        blocks: [
          { kind: 'text', text: facts.taskName ? `This job runs the task "${facts.taskName}".` : 'No task is attached to this job.' },
          {
            kind: 'facts',
            rows: [
              { label: 'Task', value: facts.taskName ?? '—' },
              { label: 'Type', value: facts.taskType ?? '—' },
              { label: 'Topic', value: facts.topic ?? '—' },
              { label: 'Pipeline', value: facts.pipelineId ?? '—' },
            ],
          },
        ],
      };

    default:
      return {
        blocks: [{
          kind: 'text',
          text: `I can answer about job #${facts.jobId} — its schedule, where it writes, its run history, failures and statistics. Try one of the buttons above.`,
        }],
      };
  }
}

function targetPath(facts: JobFacts): string {
  if (!facts.bucket) return 'no configured storage';
  return facts.outputFolder ? `${facts.bucket}/${facts.outputFolder}` : facts.bucket;
}

function verdictSentence(stats: RunStats): string {
  if (!stats.total) return 'It has never run.';
  const parts = Object.entries(stats.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${count} ${HUMAN_STATUS[status] ?? status.toLowerCase()}`);
  const rate = stats.successRate !== null ? ` That is a ${stats.successRate}% success rate.` : '';
  const avg = stats.averageSeconds !== null ? ` Runs take ${humanDuration(stats.averageSeconds)} on average.` : '';
  return `Across ${stats.total} recorded ${stats.total === 1 ? 'run' : 'runs'}: ${parts.join(', ')}.${rate}${avg}`;
}

/** The run history as CSV. The XLSX export is this, converted server-side. */
export function runsToCsv(facts: JobFacts, runs: JobRun[]): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['Run', 'Job', 'Status', 'Queued', 'Started', 'Ended', 'Duration (s)', 'Message'];
  const rows = runs.map(run => {
    const seconds = run.startTime && run.endTime
      ? Math.round(((new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000) * 10) / 10
      : '';
    return [run.jobQueueId, `#${facts.jobId} ${facts.jobName}`, run.jobStatus,
            run.dateCreated ?? '', run.startTime ?? '', run.endTime ?? '', seconds,
            run.jobStatusMessage ?? ''].map(escape).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}
