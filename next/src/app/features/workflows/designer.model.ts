/**
 * A workflow's steps as the designer edits them (MIG-276): the same JSON workflow-service's WorkflowSteps reads and
 * checks, so what is published is what the engine walks. Only the fields a step's type uses are sent.
 */
export type StepType = 'approval' | 'task' | 'condition' | 'notify' | 'run_pipeline' | 'call_api' | 'save_dataset' | 'wait';
export type WhoKind = 'user' | 'role' | 'group' | 'manager' | 'requester' | 'subject';

/**
 * UX review 2026-10-12: who a "subject" assignee is -- workflow-service's AssigneeKind.SUBJECT, a field of the request's
 * subject that names a role, a group or a person (the built-in run review and step approval: "reviewers", set by the
 * pipeline). The designer said "someone" and showed a blank "Who approves".
 */
export function subjectWho(value: string | null | undefined): string {
  const field = (value ?? '').trim();
  if (!field || field === 'reviewers') return 'The reviewers named on the request';
  const words = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return `Whoever the request names as its ${words}`;
}

export interface Who { kind: WhoKind; value?: string | null; }

export interface DraftStep {
  key: string;
  type: StepType;
  name?: string;
  next?: string | null;
  // approval, task
  assignee?: Who;
  slaHours?: number | null;
  reminderHours?: number | null;
  escalateTo?: Who | null;
  rejectNeedsComment?: boolean;
  onReject?: string | null;
  // condition
  condition?: { field: string; op: string; value?: unknown };
  whenTrue?: string | null;
  whenFalse?: string | null;
  // notify
  to?: Who;
  message?: string;
  // run_pipeline
  jobId?: number | null;
  onError?: 'fail' | 'continue';
  /** 2026-10-21: wait until the run ends (its approvals included), keep its outcome at saveAs, give up after waitHours. */
  waitFor?: boolean;
  waitHours?: number | null;
  // call_api (owner #25): a saved API request, its environment, variables from the request's fields, where the answer goes
  requestId?: number | null;
  environmentId?: number | null;
  variables?: Record<string, string>;
  saveAs?: string;
  // save_dataset
  dataset?: string;
  // wait
  hours?: number | null;
}

/**
 * A step type's tone: the pill family its badge on the canvas is drawn in, so an approval reads apart from a notice at a
 * glance. People's steps (approval, task) and the fork (condition) each have their own; the rest share quieter ones.
 */
export type StepTone = 'ok' | 'info' | 'warn' | 'brand' | 'neutral';

export const STEP_TYPES: { type: StepType; label: string; icon: string; hint: string; tone: StepTone }[] = [
  { type: 'approval', label: 'Approval', icon: 'checkCircle', hint: 'Someone approves, rejects or asks for changes', tone: 'ok' },
  { type: 'task', label: 'Task', icon: 'list', hint: 'Someone does a piece of work and marks it done', tone: 'info' },
  { type: 'condition', label: 'Condition', icon: 'filter', hint: 'Goes one of two ways on the request\'s fields', tone: 'warn' },
  { type: 'notify', label: 'Notify', icon: 'bell', hint: 'Tells someone, and goes on', tone: 'brand' },
  { type: 'run_pipeline', label: 'Run pipeline', icon: 'play', hint: 'Starts a schedule\'s run', tone: 'info' },
  { type: 'call_api', label: 'Call API', icon: 'send', hint: 'Sends a saved API request and keeps its answer to branch on', tone: 'info' },
  { type: 'save_dataset', label: 'Save to dataset', icon: 'database', hint: 'Keeps the request as a row', tone: 'neutral' },
  { type: 'wait', label: 'Wait', icon: 'clock', hint: 'Pauses for some hours', tone: 'neutral' },
];

export const OPERATORS: { op: string; label: string; needsValue: boolean }[] = [
  { op: 'eq', label: 'is', needsValue: true },
  { op: 'ne', label: 'is not', needsValue: true },
  { op: 'gt', label: 'is more than', needsValue: true },
  { op: 'gte', label: 'is at least', needsValue: true },
  { op: 'lt', label: 'is less than', needsValue: true },
  { op: 'lte', label: 'is at most', needsValue: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'in', label: 'is one of', needsValue: true },
  { op: 'exists', label: 'is filled in', needsValue: false },
  { op: 'empty', label: 'is empty', needsValue: false },
];

/** A new step of a type, with the defaults a person would pick first. */
export function newStep(type: StepType, taken: string[]): DraftStep {
  const base = type.replace('_', '-');
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  const label = STEP_TYPES.find(t => t.type === type)!.label;
  switch (type) {
    case 'approval': return { key, type, name: label, assignee: { kind: 'manager' }, slaHours: 48, rejectNeedsComment: true, onReject: 'end' };
    case 'task': return { key, type, name: label, assignee: { kind: 'requester' } };
    case 'condition': return { key, type, name: label, condition: { field: 'amount', op: 'gt', value: 1000 }, whenTrue: 'end', whenFalse: 'end' };
    case 'notify': return { key, type, name: label, to: { kind: 'requester' }, message: 'Your request has moved on.' };
    case 'run_pipeline': return { key, type, name: label, jobId: null, onError: 'fail' };
    case 'call_api': return { key, type, name: label, requestId: null, variables: {}, saveAs: key.replace(/-/g, '_'), onError: 'continue' };
    case 'save_dataset': return { key, type, name: label, dataset: 'requests' };
    case 'wait': return { key, type, name: label, hours: 24 };
  }
}

/** The steps as the engine reads them: each with its type's fields only, empty ones left out. */
export function toJson(steps: DraftStep[]): { steps: Record<string, unknown>[] } {
  return {
    steps: steps.map(s => {
      const out: Record<string, unknown> = { key: s.key, type: s.type };
      if (s.name) out['name'] = s.name;
      if (s.next) out['next'] = s.next;
      switch (s.type) {
        case 'approval':
        case 'task':
          out['assignee'] = who(s.assignee);
          if (s.slaHours) out['slaHours'] = s.slaHours;
          if (s.slaHours && s.reminderHours) out['reminderHours'] = s.reminderHours;
          if (s.slaHours && s.escalateTo && s.escalateTo.kind !== 'manager') out['escalateTo'] = who(s.escalateTo);
          if (s.type === 'approval') {
            out['rejectNeedsComment'] = !!s.rejectNeedsComment;
            if (s.onReject && s.onReject !== 'end') out['onReject'] = s.onReject;
          }
          break;
        case 'condition':
          out['condition'] = s.condition;
          out['whenTrue'] = s.whenTrue || 'end';
          out['whenFalse'] = s.whenFalse || 'end';
          break;
        case 'notify':
          out['to'] = who(s.to);
          out['message'] = s.message;
          break;
        case 'run_pipeline':
          out['jobId'] = s.jobId;
          if (s.onError === 'continue') out['onError'] = 'continue';
          if (s.waitFor) {
            out['waitFor'] = true;
            out['saveAs'] = s.saveAs || runSaveAs(s.key);
            out['waitHours'] = s.waitHours ?? 24;
          }
          break;
        case 'call_api':
          out['requestId'] = s.requestId;
          if (s.environmentId) out['environmentId'] = s.environmentId;
          if (s.variables && Object.keys(s.variables).length) out['variables'] = s.variables;
          if (s.saveAs) out['saveAs'] = s.saveAs;
          if (s.onError === 'continue') out['onError'] = 'continue';
          break;
        case 'save_dataset':
          out['dataset'] = s.dataset;
          break;
        case 'wait':
          out['hours'] = s.hours;
          break;
      }
      return out;
    }),
  };
}

/** The steps a published version holds, for editing. */
export function fromJson(json: string | null | undefined): DraftStep[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed?.steps) ? parsed.steps as DraftStep[] : [];
  } catch {
    return [];
  }
}

/** Where a waiting Run pipeline step keeps its run's outcome by default: "run_" and its key ("run_lab_check"). */
export function runSaveAs(key: string): string {
  return 'run_' + key.replace(/-/g, '_');
}

/** Which step a problem ("steps[2].whenTrue: ...") is about, or null for the workflow as a whole. */
export function problemStep(problem: string): number | null {
  const m = /^steps\[(\d+)\]/.exec(problem);
  return m ? Number(m[1]) : null;
}

function who(value: Who | null | undefined): Who {
  const kind = value?.kind ?? 'requester';
  // A subject assignee keeps its field ("reviewers"): without it workflow-service refuses the step (WorkflowSteps).
  return kind === 'user' || kind === 'role' || kind === 'group' || kind === 'subject' ? { kind, value: value?.value ?? '' } : { kind };
}
