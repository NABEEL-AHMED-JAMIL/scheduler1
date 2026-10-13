import { Definition, LEGACY_TASK, LinkedJob, Step, StepTaskEntry, taskEntry, taskLabel } from './steps.model';

/**
 * UX review 2026-10-12 (B2, P5): the pipeline editor's flow, made visible. Pure functions, so the page, the step list
 * and their specs read a pipeline the same way.
 *
 * - The stage a step belongs to (read, check, transform, AI, review, write), from the Task Registry's line for its task
 *   -- its kind (Read, Process, Output) and its backing service -- so a task registered tomorrow lands in a stage
 *   without a change here.
 * - The steps as consecutive stage groups: a pipeline runs in order, so a group is a run of steps of one stage, and a
 *   stage can come back later (an aggregate after the outputs). Moving and dragging keep working on the order.
 * - The overview strip: Source -> Steps -> Review -> Outputs -> Schedule & triggers, each with its state and where on
 *   the page it is set.
 */

export type Stage = 'read' | 'check' | 'transform' | 'ai' | 'review' | 'write';

export interface StageInfo { id: Stage; label: string; hint: string; icon: string; }

export const STAGES: Record<Stage, StageInfo> = {
  read: { id: 'read', label: 'Read', hint: 'Where the rows come from', icon: 'download' },
  check: { id: 'check', label: 'Check', hint: 'Rows checked against a contract or rules', icon: 'shield' },
  transform: { id: 'transform', label: 'Transform', hint: 'Rows shaped, joined, filtered or worked out', icon: 'layers' },
  ai: { id: 'ai', label: 'AI', hint: 'A model reads or labels each row', icon: 'sparkle' },
  review: { id: 'review', label: 'Review', hint: 'The run waits for a person', icon: 'checkCircle' },
  write: { id: 'write', label: 'Write', hint: 'Where the results go', icon: 'upload' },
};

/** The registry's word for a step that waits for people, and for one that checks rows against a contract. */
const REVIEW_TASKS = new Set(['approval']);
const CHECK_TASKS = new Set(['validate']);

/** The stage of a step, from its task's registry line (or its code when the registry has not been read). */
export function stageOf(step: Pick<Step, 'task'>, task?: StepTaskEntry | null): Stage {
  const code = step.task;
  const kind = (task?.kind ?? '').toLowerCase();
  if (kind === 'read' || code.startsWith('read_') || code === 'sample') return 'read';
  if (kind === 'output') return 'write';
  if (REVIEW_TASKS.has(code) || task?.aiToolName === 'request_approval') return 'review';
  if (CHECK_TASKS.has(code)) return 'check';
  if ((task?.backingService ?? '') === 'ai-service' || code.startsWith('ai_')) return 'ai';
  if (!task && /^(save_|upload_|render_|send_|write_)/.test(code)) return 'write';
  return 'transform';
}

export interface StageGroup {
  stage: StageInfo;
  /** The first step's place (0-based) in the pipeline. */
  start: number;
  steps: { step: Step; index: number }[];
}

/** The steps as runs of one stage, in order. */
export function stageGroups(steps: Step[], tasks: StepTaskEntry[]): StageGroup[] {
  const groups: StageGroup[] = [];
  steps.forEach((step, index) => {
    const stage = stageOf(step, taskEntry(tasks, step.task, step));
    const last = groups[groups.length - 1];
    if (last && last.stage.id === stage) last.steps.push({ step, index });
    else groups.push({ stage: STAGES[stage], start: index, steps: [{ step, index }] });
  });
  return groups;
}

/** Where a part of the overview is set on the page: a tab, and a place on it. */
export interface OverviewTarget { tab: 'details' | 'steps' | 'settings' | 'schedules'; anchor?: string; }

export type PartState = 'done' | 'missing' | 'optional';

export interface OverviewPart {
  id: 'source' | 'steps' | 'review' | 'outputs' | 'schedule';
  label: string;
  state: PartState;
  /** One short line: what is set, or what to do. */
  detail: string;
  target: OverviewTarget;
}

export interface OverviewInput {
  definition: Definition | null | undefined;
  tasks: StepTaskEntry[];
  jobs: LinkedJob[];
  /** Whether the schedules have been read: until then the part says so rather than "not scheduled". */
  jobsLoaded: boolean;
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** A short, readable list: "A, B and 2 more". */
function listOf(names: string[], max = 2): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= max) return unique.join(', ');
  return `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`;
}

function stepLabel(step: Step, tasks: StepTaskEntry[]): string {
  return step.name?.trim() || taskLabel(taskEntry(tasks, step.task, step), step.task);
}

/** Source -> Steps -> Review -> Outputs -> Schedule & triggers, each with its state. */
export function pipelineOverview(input: OverviewInput): OverviewPart[] {
  const steps = input.definition?.steps ?? [];
  const legacy = steps.length === 1 && steps[0].task === LEGACY_TASK;
  const engine = legacy ? [] : steps;
  const staged = engine.map(step => ({ step, stage: stageOf(step, taskEntry(input.tasks, step.task, step)) }));
  const reads = staged.filter(s => s.stage === 'read').map(s => s.step);
  const writes = staged.filter(s => s.stage === 'write').map(s => s.step);
  const approvals = staged.filter(s => s.stage === 'review').length;
  const settings = input.definition?.settings;

  const source: OverviewPart = legacy
    ? { id: 'source', label: 'Source', state: 'done', detail: 'Its worker reads the topic (legacy step)', target: { tab: 'details' } }
    : reads.length
      ? { id: 'source', label: 'Source', state: 'done', detail: listOf(reads.map(s => stepLabel(s, input.tasks)), 1), target: { tab: 'steps', anchor: 'stage-read' } }
      : input.definition?.source?.type === 'task'
        ? { id: 'source', label: 'Source', state: 'done', detail: 'The schedule’s task payload', target: { tab: 'settings', anchor: 'pipeline-source' } }
        : { id: 'source', label: 'Source', state: 'missing', detail: 'Add a Read step: a file, an API, a database or documents', target: { tab: 'steps' } };

  const stages = new Set(staged.map(s => s.stage)).size;
  const stepsPart: OverviewPart = engine.length
    ? { id: 'steps', label: 'Steps', state: 'done', detail: `${plural(engine.length, 'step')} in ${plural(stages, 'stage')}`, target: { tab: 'steps' } }
    : { id: 'steps', label: 'Steps', state: 'missing', detail: legacy ? 'None yet: it runs as its legacy step' : 'None yet', target: { tab: 'steps' } };

  const parties = settings?.review?.required ?? [];
  const who = [parties.includes('internal') ? 'Our team' : '', parties.includes('customer') ? 'the customer (API)' : ''].filter(Boolean);
  const reviewWords = [who.length ? who.join(' and ') : '', approvals ? plural(approvals, 'approval step') : ''].filter(Boolean);
  const review: OverviewPart = reviewWords.length
    ? { id: 'review', label: 'Review', state: 'done', detail: reviewWords.join(' · '), target: { tab: 'settings', anchor: 'pipeline-review' } }
    : { id: 'review', label: 'Review', state: 'optional', detail: 'Not required: results are final when the run ends', target: { tab: 'settings', anchor: 'pipeline-review' } };

  const outputs: OverviewPart = legacy
    ? { id: 'outputs', label: 'Outputs', state: 'optional', detail: 'Written by its worker', target: { tab: 'details' } }
    : writes.length
      ? { id: 'outputs', label: 'Outputs', state: 'done', detail: `${writes.length}: ${listOf(writes.map(s => taskLabel(taskEntry(input.tasks, s.task, s), s.task)))}`, target: { tab: 'steps', anchor: 'stage-write' } }
      : { id: 'outputs', label: 'Outputs', state: 'missing', detail: 'Add a Write step: a file, a bucket, a PDF or a webhook', target: { tab: 'steps' } };

  const active = input.jobs.filter(j => (j.jobStatus ?? 'Active') === 'Active').length;
  const schedule: OverviewPart = !input.jobsLoaded
    ? { id: 'schedule', label: 'Schedule & triggers', state: 'optional', detail: 'Reading the schedules…', target: { tab: 'schedules' } }
    : input.jobs.length
      ? { id: 'schedule', label: 'Schedule & triggers', state: 'done', detail: `${plural(input.jobs.length, 'schedule')} · ${active} active`, target: { tab: 'schedules' } }
      : { id: 'schedule', label: 'Schedule & triggers', state: 'missing', detail: 'Not scheduled: add one to run it', target: { tab: 'schedules' } };

  return [source, stepsPart, review, outputs, schedule];
}
