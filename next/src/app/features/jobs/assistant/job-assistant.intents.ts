/**
 * What the assistant was asked, decided from the question alone.
 *
 * Answers are composed from the job's own data rather than generated, so the assistant cannot
 * invent a run that did not happen or a folder that does not exist -- which is the whole point
 * of scoping it to one job. This file is the part worth testing: everything else is rendering.
 */
export type Intent =
  | 'summary'
  | 'stats'
  | 'schedule'
  | 'target'
  | 'failures'
  | 'history'
  | 'task'
  | 'out-of-scope'
  | 'unknown';

/**
 * Asking about a different job by id, or about anything fleet-wide, is out of scope by design.
 *
 * The id pattern deliberately has no leading \b: '#' is not a word character, so a boundary
 * before it never matches and a bare "#999" slipped through as an ordinary question.
 */
const OTHER_JOB_ID = /(?:job\s*#?|#)(\d{3,})\b/i;
const FLEET_WORDS = /\b(all|other|every|another|each)\s+(jobs?|tasks?|tenants?|users?)\b/i;
/** Users and tenants are never this assistant's business, qualified or not. */
const OTHER_SUBJECT = /\b(users?|tenants?|organisations?|organizations?|accounts?)\b/i;

const PATTERNS: [Intent, RegExp][] = [
  ['stats',     /\b(stat|statistic|metric|number|count|how many|success rate|failure rate|breakdown)/i],
  ['failures',  /\b(fail|failure|error|broke|broken|problem|why.*(fail|not work))/i],
  ['schedule',  /\b(schedul|cron|next run|when.*(run|next)|frequency|how often|interval|expire)/i],
  // 'write' on its own, not only after 'where' -- "what does it write" is the same question.
  ['target',    /\b(target|folder|bucket|output|writes?|saves?|destination|file|storage)\b|where.*(put|go)/i],
  ['history',   /\b(histor|past run|previous|last run|recent run|timeline|log)/i],
  ['task',      /\b(task|pipeline|topic|payload|what.*(does|do)|purpose|config)/i],
  ['summary',   /\b(summar|overview|tell me about|describe|explain|what is this|brief)/i],
];

export interface Scoped {
  intent: Intent;
  /** Set when the question named a job that is not the one in view. */
  mentionedJobId?: number;
}

/**
 * `jobId` is the job the assistant is bound to. A question naming a different id is refused
 * rather than answered about the wrong job, which is the failure mode that would make this
 * untrustworthy.
 */
export function classify(question: string, jobId: number): Scoped {
  const text = (question ?? '').trim();
  if (!text) return { intent: 'unknown' };

  const idMatch = OTHER_JOB_ID.exec(text);
  if (idMatch) {
    const asked = Number(idMatch[1]);
    if (Number.isFinite(asked) && asked !== jobId) {
      return { intent: 'out-of-scope', mentionedJobId: asked };
    }
  }

  if (FLEET_WORDS.test(text) || OTHER_SUBJECT.test(text)) {
    return { intent: 'out-of-scope' };
  }

  for (const [intent, pattern] of PATTERNS) {
    if (pattern.test(text)) return { intent };
  }
  return { intent: 'unknown' };
}

export interface PresetPrompt {
  id: Intent;
  label: string;
  question: string;
  icon: string;
}

/** The questions worth a single click, in the order someone tends to want them. */
export const PRESETS: PresetPrompt[] = [
  { id: 'summary',  label: 'Summary',      question: 'Summarise this job',            icon: 'file' },
  { id: 'stats',    label: 'Quick stats',  question: 'Show the run statistics',       icon: 'chart' },
  { id: 'schedule', label: 'Schedule',     question: 'When does it run next?',        icon: 'clock' },
  { id: 'target',   label: 'Where it writes', question: 'Where does it write files?', icon: 'folder' },
  { id: 'failures', label: 'Failures',     question: 'What has been failing?',        icon: 'alert' },
  { id: 'history',  label: 'Recent runs',  question: 'Show the recent run history',   icon: 'history' },
];
