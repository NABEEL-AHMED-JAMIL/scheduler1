/**
 * What the assistant was asked, decided from the question alone.
 *
 * Answers are composed from the job's own data rather than generated, so the assistant cannot
 * invent a run that did not happen or a folder that does not exist -- which is the whole point
 * of scoping it to one job. This file is the part worth testing: everything else is rendering.
 *
 * `unknown` is not a neutral outcome. When an AI agent is configured the component hands every
 * unknown question to it, so a question this table fails to recognise stops being answered from
 * the record and starts being answered by a model -- about a job whose real figures were sitting
 * one match away. That is why the table below covers plain phrasings ("how long does it take",
 * "list the runs", "what state is it in") that it used to miss.
 */
export type Intent =
  | 'summary'
  | 'stats'
  | 'schedule'
  | 'target'
  | 'failures'
  | 'history'
  | 'task'
  /** A greeting or "what can you do" -- answered here rather than spent on a model round-trip. */
  | 'capability'
  /** Asking it to run, pause, edit or delete the job. It reads; it does not act. */
  | 'action'
  | 'out-of-scope'
  | 'unknown';

/**
 * Asking about a different job by id, or about anything fleet-wide, is out of scope by design.
 *
 * Two forms, and they take different digit floors on purpose. Where the word "job" is present
 * the number is unambiguously a job id, so any length counts: "what about job 12" was reaching
 * the model with THIS job's facts attached, and "tell me about job 99" was answered with a
 * summary of job #2395 -- the precise failure the scope rule exists to prevent. A bare "#12"
 * has no such word to lean on and reads as ordinary prose ("the #1 failure reason"), so the
 * hash form still requires three digits.
 *
 * The bare-hash pattern deliberately has no leading \b: '#' is not a word character, so a
 * boundary before it never matches and "#999" slipped through as an ordinary question.
 */
const OTHER_JOB_ID = /\bjob\s*#?(\d+)\b|#(\d{3,})\b/i;
/** The plural alone counts: a question about "jobs" is a question about more than this one. */
const FLEET_WORDS = /\b(all|other|every|another|each)\s+(jobs?|tasks?|tenants?|users?)\b|\bjobs\b/i;
/** Users and tenants are never this assistant's business, qualified or not. */
const OTHER_SUBJECT = /\b(users?|tenants?|organisations?|organizations?|accounts?)\b/i;

/**
 * A greeting, or a question about the assistant itself. Anchored to the whole message so that
 * "help me read the failures" stays a failures question rather than becoming a menu.
 */
const CAPABILITY = /^\s*(hi|hiya|hello|hey|yo|thanks|thank you|help|help me|what can you do|what do you do|what can i ask|who are you|what are you)\s*[!.?]*\s*$/i;

/**
 * Asking it to change something.
 *
 * Every verb here needs an object ("delete this", "run it now") rather than standing alone,
 * because these are ordinary words in a question ABOUT an ETL job: "does it remove the header
 * row" and "what does it delete from the bucket" are descriptions of the pipeline's work, not
 * instructions to this assistant. `trigger` and `rerun` are the exceptions -- neither describes
 * what a task does to a file.
 */
const ACTION = new RegExp([
  '\\b(?:trigger|re-?run)\\b',
  '\\b(?:run|start|stop|kill)\\s+(?:it|this|that|the\\s+job|now|again)\\b',
  '\\b(?:delete|remove|disable|enable|rename|edit|modify|pause|resume|restart|cancel|abort)\\s+(?:it|this|that|the\\s+job)\\b',
].join('|'), 'i');

/**
 * First match wins, so the order is the ranking.
 *
 * Schedule leads because "what time does it run" and "how long until the next run" are timetable
 * questions that later rows would otherwise claim on the word "run" or "how long". Failures sits
 * above stats so that "how many runs failed" returns the reasons rather than a tile of counts.
 * History sits above target because "show me the log file" is a request for runs, and target owns
 * the word "file".
 */
const PATTERNS: [Intent, RegExp][] = [
  ['schedule',  /\b(schedul|cron|next run|frequency|how often|interval|expire|recurr)|when.*(run|next|execute|start)|what time|\bevery\s+(day|week|month|hour|minute|night)\b/i],
  ['failures',  /\b(fail|error|broke|broken|crash|problem|issue|went wrong|wrong|stuck)|why.*(not work)/i],
  // The stat words are bounded on both sides; nothing else here is. Unbounded, \bstat matched
  // "state" and "status", so "what state is it in" answered with a block of run counts.
  ['stats',     /\b(stats?|statistics?|metrics?)\b|\b(number|count|how many|success rate|breakdown|average|mean|median|duration|how long|slowest|fastest|longest|chart|graph|outcome|percent)/i],
  ['history',   /\b(histor|past run|last run|previous|recent|timeline|log)|\b(list|show|give me)\b.*\bruns?\b/i],
  // 'write' on its own, not only after 'where' -- "what does it write" is the same question.
  ['target',    /\b(target|folder|bucket|output|writes?|saves?|destination|file|storage|path|directory)\b|where.*(put|go)/i],
  ['task',      /\b(task|pipeline|topic|payload|purpose|config|kafka)\b|what.*(does|do)/i],
  // Only the ambiguous short words are bounded on both sides: 'who' unbounded matches
  // "whole", while 'summar' bounded matches nothing at all -- "summarise" does not end there.
  ['summary',   /\b(summar|overview|tell me about|describe|explain|what is this|brief|health|working|priority|enabled|owner|owns|assigned|status)|\b(who|ok|okay|active|state)\b/i],
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
    const asked = Number(idMatch[1] ?? idMatch[2]);
    if (Number.isFinite(asked) && asked !== jobId) {
      return { intent: 'out-of-scope', mentionedJobId: asked };
    }
  }

  if (FLEET_WORDS.test(text) || OTHER_SUBJECT.test(text)) {
    return { intent: 'out-of-scope' };
  }

  if (CAPABILITY.test(text)) return { intent: 'capability' };
  if (ACTION.test(text)) return { intent: 'action' };

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
