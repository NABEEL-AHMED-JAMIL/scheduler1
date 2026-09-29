/**
 * MIG-249: the step builder's shapes and the pure rules behind them.
 *
 * A pipeline's definition as ordered steps is MIG-230's (process: pipeline/PipelineDefinition.java): where its input
 * comes from (`source`), the steps that run on it in order, and the settings that apply to all of them. It is stored
 * as JSON; YAML is a view of the same definition, never a second source of truth. The builder, the YAML tab and the
 * JSON tab here are three views of one object -- this file keeps them saying the same thing:
 *
 *  - `canonical` writes a definition the way the server stores it: its fields in the server's order, and nothing a
 *    person left blank. A builder edit and a YAML edit of the same pipeline then save the same text.
 *  - `toYaml` is the YAML view when the server cannot give one (it renders YAML only for a definition that reads
 *    and validates). Converting YAML back is the server's job -- the console has no YAML parser.
 *
 * The server has the last word on every rule (DefinitionValidator); these catch nothing it would not.
 */

// ---------------------------------------------------------------------------------------------- the definition

export interface Retry { maxAttempts?: number | null; delaySeconds?: number | null; }

export interface Step {
  /** Unique, [a-z][a-z0-9_]*: what the step's rows and datasets are named by. */
  key: string;
  name?: string;
  /** A registered step task's code (pipeline.json/steps/tasks). */
  task: string;
  /** An earlier step's key; absent: the latest output before this step. */
  input?: string;
  /** The task's own settings, checked by the task. */
  config?: Record<string, unknown>;
  retry?: Retry;
  timeoutSeconds?: number | null;
  /** fail | continue | skip_rest; absent: the settings' default (fail). */
  onError?: string;
}

export interface Settings {
  datasetRetentionHours?: number | null;
  defaultTimeoutSeconds?: number | null;
  defaultOnError?: string;
}

export interface Source { type?: string; config?: Record<string, unknown>; }

export interface Definition {
  version?: number;
  source?: Source;
  steps: Step[];
  settings?: Settings;
}

export const ON_ERRORS = ['fail', 'continue', 'skip_rest'] as const;
export const SOURCE_TYPES = ['none', 'task'] as const;
export const LEGACY_TASK = 'legacy';

const ON_ERROR_LABELS: Record<string, string> = {
  fail: 'Fail the run', continue: 'Continue with the next step', skip_rest: 'Skip the rest and complete',
};
const SOURCE_LABELS: Record<string, string> = {
  none: 'None: the first step makes its own rows', task: 'The task payload: one row, a column per tag',
};
export const onErrorLabel = (value: string | null | undefined) => ON_ERROR_LABELS[String(value ?? '')] ?? String(value ?? '');
export const sourceLabel = (value: string | null | undefined) => SOURCE_LABELS[String(value ?? '')] ?? String(value ?? '');

/** Limits the server checks (DefinitionValidator), for the inputs' min and max. */
export const LIMITS = { maxTries: 10, maxDelaySeconds: 3600, maxTimeoutSeconds: 86400, maxRetentionHours: 720, maxSteps: 50 } as const;

// ---------------------------------------------------------------------------------------------- the server's answers

export interface VersionRow { version: number; pipelineDefinitionId: number; createdBy?: number | null; dateCreated?: string | null; }

/** GET pipeline.json/steps/definition: the latest saved version, or the legacy step every pipeline without one runs as. */
export interface DefinitionView {
  legacy: boolean;
  definition: Definition;
  json: string;
  yaml: string;
  pipelineKey: number;
  pipelineId: string;
  /** Whether a version is saved; false: the definition is the legacy wrap, made on the fly. */
  stored: boolean;
  version: number | null;
  versions: VersionRow[];
}

export interface Problem { path: string; message: string; }

/** POST pipeline.json/steps/validate (and save): its problems, and -- when it reads -- the definition, its JSON and YAML. */
export interface ValidateResult {
  valid?: boolean;
  legacy?: boolean;
  problems?: Problem[];
  definition?: Definition;
  json?: string;
  yaml?: string;
  version?: number | null;
  pipelineDefinitionId?: number;
}

/**
 * A JSON Schema, the subset the Task Registry's configSchema uses (MIG-231): a root object with additionalProperties
 * false, its properties in display order, `required`; type (one, or a list that may include null), title (always),
 * description, default, enum, minLength/maxLength/pattern, minimum/maximum, items/minItems/maxItems (a list of objects
 * is a repeatable group), and additionalProperties:<schema> for a map. `format` is a widget hint (FORMATS).
 */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
  [key: string]: unknown;
}

/** A task's kind, which Add step groups by, in this order. */
export const TASK_KINDS = ['Read', 'Process', 'Output'] as const;

/**
 * One line of GET pipeline.json/steps/tasks: the Task Registry as the caller's workspace sees it (MIG-231). The
 * per-pipeline Legacy lines also carry the pipeline (pipelineKey, pipelineId, name "Legacy: <name>", config).
 */
export interface StepTaskEntry {
  code: string;
  name?: string | null;
  kind?: string | null;
  description?: string | null;
  inputSchema?: JsonSchema | null;
  outputSchema?: JsonSchema | null;
  configSchema?: JsonSchema | null;
  backingService?: string | null;
  /** The task's own defaults for a step that says nothing. */
  retry?: { maxAttempts?: number | null; delaySeconds?: number | null } | null;
  timeoutSeconds?: number | null;
  requiredPermission?: 'TENANT_USER' | 'TENANT_ADMIN' | string | null;
  enabledByDefault?: boolean;
  /** Whether a workspace admin may switch it (legacy never: existing pipelines always stay runnable). */
  overridable?: boolean;
  aiToolName?: string | null;
  runsInEngine?: boolean;
  /** On in this workspace: its default, or the workspace's switch. */
  enabled?: boolean;
  overridden?: boolean;
  /** Whether the platform can run it at all (a backing service may not be there yet). */
  available?: boolean;
  disabledReason?: string | null;
  pipelineKey?: number | null;
  pipelineId?: string | null;
  config?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------------------------- runs

export interface StepDataset { runDatasetId: number; name: string; rowCount: number | null; columns: string[]; expiresAt?: string | null; }

export interface TimelineStep {
  stepExecutionId: number | null;
  index: number;
  key: string;
  task: string;
  status: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  recordsIn?: number | null;
  recordsOut?: number | null;
  tries?: number | null;
  onError?: string | null;
  statusMessage?: string | null;
  error?: unknown;
  datasets?: StepDataset[];
  /** 'step': its own log (stepLogs); 'run': a legacy run, whose log is the run's. */
  log?: string;
}

/** GET sourceJob.json/stepExecutions: one attempt of a run. */
export interface Timeline {
  jobQueueId: number;
  jobId: number;
  runStatus: string | null;
  attempt: number;
  attempts: number[];
  legacy: boolean;
  pipelineDefinitionId?: number | null;
  steps: TimelineStep[];
}

export interface StepLogLine { level?: string | null; message?: string | null; loggedAt?: string | null; [key: string]: unknown; }

export interface StepLog { stepExecutionId: number; stepKey: string; attempt: number; lines: StepLogLine[]; }

/** One of the task's schedules (sourceTask.json/fetchAllLinkJobsWithSourceTaskId). */
export interface LinkedJob { jobId: number; jobName: string; jobStatus?: string | null; execution?: string | null; }

/** One run of a job (sourceJob.json/fetchSourceJobQueueListWithJobId). */
export interface RunRow { jobQueueId: number; jobStatus?: string | null; startTime?: string | null; endTime?: string | null; jobStatusMessage?: string | null; }

const FINAL = new Set(['Completed', 'Failed', 'Interrupt', 'Skip', 'Missed']);

/** Whether a run (or a step) has stopped: nothing more will happen to it. */
export function runFinished(status: string | null | undefined): boolean {
  return FINAL.has(String(status ?? ''));
}

// ---------------------------------------------------------------------------------------------- canonical form

const DEFINITION_ORDER = ['version', 'source', 'steps', 'settings'];
const STEP_ORDER = ['key', 'name', 'task', 'input', 'config', 'retry', 'timeoutSeconds', 'onError'];
const RETRY_ORDER = ['maxAttempts', 'delaySeconds'];
const SETTINGS_ORDER = ['datasetRetentionHours', 'defaultTimeoutSeconds', 'defaultOnError'];
const SOURCE_ORDER = ['type', 'config'];

const blank = (value: unknown) => value === undefined || value === null || value === '';

/** The object's fields in `order` first, then any others as they came; blank ones dropped. */
function ordered<T extends object>(value: T, order: string[], keep: (key: string, v: unknown) => boolean = (_, v) => !blank(v)): T {
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of [...order, ...Object.keys(source).filter(k => !order.includes(k))]) {
    if (key in source && keep(key, source[key])) out[key] = source[key];
  }
  return out as T;
}

const emptyObject = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length;

/** A step as the server writes it: its fields in order, blank ones left out. */
export function canonicalStep(step: Step): Step {
  const out = ordered(step, STEP_ORDER);
  if (out.retry) {
    const retry = ordered(out.retry, RETRY_ORDER);
    if (emptyObject(retry)) delete out.retry; else out.retry = retry;
  }
  return out;
}

/**
 * The definition as the server writes it: every level in its field order (PipelineDefinition's @JsonPropertyOrder),
 * with what a person left blank -- an empty name, a cleared timeout, an on-error set back to the default, a retry or
 * settings with nothing in them -- left out rather than sent as empty.
 */
export function canonical(definition: Definition): Definition {
  const out = ordered(definition, DEFINITION_ORDER);
  out.steps = (definition.steps ?? []).map(canonicalStep);
  if (out.source) {
    const source = ordered(out.source, SOURCE_ORDER, (key, v) => !blank(v) && !(key === 'config' && emptyObject(v)));
    if (emptyObject(source)) delete out.source; else out.source = source;
  }
  if (out.settings) {
    const settings = ordered(out.settings, SETTINGS_ORDER);
    if (emptyObject(settings)) delete out.settings; else out.settings = settings;
  }
  return out;
}

/** The JSON tab's text, and what a builder save sends. */
export function definitionJson(definition: Definition): string {
  return JSON.stringify(canonical(definition), null, 2);
}

/** Whether two definitions would save as the same text. */
export function sameDefinition(a: Definition | null | undefined, b: Definition | null | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** The legacy wrap: exactly one `legacy` step, which runs today's path (the worker) unchanged. */
export function isLegacyDefinition(definition: Definition | null | undefined): boolean {
  return !!definition && definition.steps?.length === 1 && definition.steps[0].task === LEGACY_TASK;
}

// ---------------------------------------------------------------------------------------------- YAML, written

const RESERVED = /^(true|false|yes|no|on|off|y|n|null|~)$/i;
const PLAIN = /^[A-Za-z_][A-Za-z0-9_ .\/-]*$/;

/** A string YAML reads back as the same string: bare when it is a plain word, else double-quoted (JSON's escapes are YAML's). */
function yamlString(text: string): string {
  return PLAIN.test(text) && !RESERVED.test(text) && !text.endsWith(' ') ? text : JSON.stringify(text);
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return yamlString(String(value));
}

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isEmptyNode = (v: unknown) => (Array.isArray(v) && !v.length) || (isMap(v) && !Object.keys(v).length);
const emptyNode = (v: unknown) => (Array.isArray(v) ? '[]' : '{}');

function yamlMap(map: Record<string, unknown>, indent: number, lines: string[]): void {
  const pad = ' '.repeat(indent);
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    const name = yamlString(key);
    if (isEmptyNode(value)) lines.push(`${pad}${name}: ${emptyNode(value)}`);
    else if (Array.isArray(value)) { lines.push(`${pad}${name}:`); yamlList(value, indent, lines); }
    else if (isMap(value)) { lines.push(`${pad}${name}:`); yamlMap(value, indent + 2, lines); }
    else lines.push(`${pad}${name}: ${yamlScalar(value)}`);
  }
}

function yamlList(list: unknown[], indent: number, lines: string[]): void {
  const pad = ' '.repeat(indent);
  for (const item of list) {
    if (isEmptyNode(item)) lines.push(`${pad}- ${emptyNode(item)}`);
    else if (Array.isArray(item)) { lines.push(`${pad}-`); yamlList(item, indent + 2, lines); }
    else if (isMap(item)) {
      const inner: string[] = [];
      yamlMap(item, indent + 2, inner);
      inner[0] = `${pad}- ${inner[0].slice(indent + 2)}`;
      lines.push(...inner);
    } else lines.push(`${pad}- ${yamlScalar(item)}`);
  }
}

/**
 * The definition as block YAML, laid out as the server's own YAML view (Jackson's, list items level with their key).
 * Only for showing a draft the server would not render -- one with problems; the server's YAML is used whenever it
 * gives one, and reading YAML is always the server's.
 */
export function toYaml(definition: Definition): string {
  const lines: string[] = [];
  yamlMap(canonical(definition) as unknown as Record<string, unknown>, 0, lines);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------- the step cards

const KEY = /^[a-z][a-z0-9_]{0,63}$/;
export const validKey = (key: string | null | undefined) => KEY.test(String(key ?? ''));

/** A key the server accepts, made from `base` (a task code), that no other step has. */
export function nextKey(base: string, taken: string[]): string {
  let key = String(base ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) key = 'step';
  if (!/^[a-z]/.test(key)) key = `step_${key}`;
  key = key.slice(0, 58);
  if (!taken.includes(key)) return key;
  for (let n = 2; ; n++) if (!taken.includes(`${key}_${n}`)) return `${key}_${n}`;
}

/** A new step's config: each property's default, and an empty list or object for a required one without. */
export function seedConfig(schema: JsonSchema | null | undefined): Record<string, unknown> | undefined {
  if (!schema?.properties) return undefined;
  const out: Record<string, unknown> = {};
  const required = schema.required ?? [];
  for (const [name, property] of Object.entries(schema.properties)) {
    if ('default' in property) out[name] = structuredClone(property.default);
    else if (required.includes(name)) {
      const type = typeOf(property);
      if (type === 'array') out[name] = [];
      else if (type === 'object') out[name] = seedConfig(property) ?? {};
    }
  }
  return out;
}

/**
 * A step's task in the registry. The registry lists `legacy` once per pipeline; a legacy step's own is the one for
 * the pipeline its config names.
 */
export function taskEntry(tasks: StepTaskEntry[], code: string | null | undefined, step?: Step): StepTaskEntry | undefined {
  if (code === LEGACY_TASK && step?.config?.['pipelineId']) {
    const own = tasks.find(t => t.code === code && t.pipelineId === step.config!['pipelineId']);
    if (own) return own;
  }
  return tasks.find(t => t.code === code && t.pipelineKey == null) ?? tasks.find(t => t.code === code);
}

export const taskLabel = (task: StepTaskEntry | undefined, code?: string) => task?.name || task?.code || code || '';

/** A task's state in a workspace: Unavailable (the platform cannot run it), Off (switched off, or off by default), On. */
export type TaskState = 'On' | 'Off' | 'Unavailable';

export function stateOf(t: StepTaskEntry): { state: TaskState; reason: string } {
  if (t.available === false) return { state: 'Unavailable', reason: t.disabledReason || 'The platform cannot run it yet.' };
  if (t.enabled === false) {
    return { state: 'Off', reason: t.disabledReason || (t.overridden ? 'Switched off in this workspace.' : 'Off by default.') };
  }
  return { state: 'On', reason: '' };
}

/** The registry with a switched task's new line (the answer of POST steps/tasks/enabled) in place of its old one. */
export function withSwitchedLine(tasks: StepTaskEntry[], line: StepTaskEntry): StepTaskEntry[] {
  return tasks.map(t => (t.code === line.code && t.pipelineKey == null ? { ...t, ...line } : t));
}

/** Why a task cannot be added here, or '' when it can. */
export function refusalOf(task: StepTaskEntry | undefined, isAdmin: boolean): string {
  if (!task) return 'Not in the Task Registry.';
  if (task.available === false || task.enabled === false) return task.disabledReason || 'Switched off in this workspace.';
  if (task.requiredPermission === 'TENANT_ADMIN' && !isAdmin) return 'Only a workspace administrator can add this task.';
  return '';
}

/** A step for `task` at the end; a legacy wrap is replaced, since a legacy step must be the only step. */
export function addStep(definition: Definition, task: StepTaskEntry): Definition {
  const kept = isLegacyDefinition(definition) ? [] : definition.steps;
  const step: Step = { key: nextKey(task.code, kept.map(s => s.key)), task: task.code };
  const config = seedConfig(task.configSchema);
  if (config) step.config = config;
  return { ...definition, version: definition.version ?? 1, steps: [...kept, step] };
}

/** Moves step `from` by `delta` places (a drop moves it by the distance dragged); a move past either end is no move. */
export function moveStep(definition: Definition, from: number, delta: number): Definition {
  const to = from + delta;
  if (delta === 0 || from < 0 || from >= definition.steps.length || to < 0 || to >= definition.steps.length) return definition;
  const steps = [...definition.steps];
  const [step] = steps.splice(from, 1);
  steps.splice(to, 0, step);
  return { ...definition, steps };
}

/** Deletes a step; a later step that read its output reads the latest output before it instead. */
export function removeStep(definition: Definition, index: number): Definition {
  const gone = definition.steps[index]?.key;
  const steps = definition.steps.filter((_, i) => i !== index).map(s => {
    if (!gone || s.input !== gone) return s;
    const { input: _input, ...rest } = s;
    return rest;
  });
  return { ...definition, steps };
}

/** Puts an edited step back; when its key changed, a later step that read it follows the new key. */
export function replaceStep(definition: Definition, index: number, step: Step): Definition {
  const before = definition.steps[index]?.key;
  const steps = definition.steps.map((s, i) => {
    if (i === index) return step;
    return before && before !== step.key && s.input === before ? { ...s, input: step.key } : s;
  });
  return { ...definition, steps };
}

export function updateSettings(definition: Definition, patch: Partial<Settings>): Definition {
  const settings = ordered({ ...(definition.settings ?? {}), ...patch }, SETTINGS_ORDER);
  const next: Definition = { ...definition, settings };
  if (emptyObject(settings)) delete next.settings;
  return next;
}

export function updateSource(definition: Definition, type: string): Definition {
  const next: Definition = { ...definition };
  if (type) next.source = { ...(definition.source ?? {}), type };
  else delete next.source;
  return next;
}

// ---------------------------------------------------------------------------------------------- Test with sample

export const SAMPLE_TASK = 'sample';

/** The rows of the first step when it is a sample: what Test with sample starts from. */
export function sampleRowsOf(definition: Definition): Record<string, unknown>[] {
  const first = definition.steps[0];
  const rows = first?.task === SAMPLE_TASK ? first.config?.['rows'] : undefined;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * The steps run on sample rows (MIG-230's `sample` task, written for this): the rows go into the first step when it
 * is a sample, or a sample step goes in front. Run now then runs the steps on them. A legacy step is replaced -- the
 * worker's path takes no rows.
 */
export function withSample(definition: Definition, rows: Record<string, unknown>[]): Definition {
  const first = definition.steps[0];
  if (first?.task === SAMPLE_TASK) {
    return { ...definition, steps: [{ ...first, config: { ...(first.config ?? {}), rows } }, ...definition.steps.slice(1)] };
  }
  const kept = isLegacyDefinition(definition) ? [] : definition.steps;
  const step: Step = { key: nextKey(SAMPLE_TASK, kept.map(s => s.key)), task: SAMPLE_TASK, config: { rows } };
  return { ...definition, version: definition.version ?? 1, steps: [step, ...kept] };
}

const scalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Sample rows from the dialog's text, by the sample task's own rule: a list of objects of plain values. */
export function parseSampleRows(text: string): { rows?: Record<string, unknown>[]; error?: string } {
  const parsed = parseJson(text);
  if (parsed.error) return { error: `Not JSON: ${parsed.error}` };
  if (!Array.isArray(parsed.value)) return { error: 'A list of rows: [{ "column": value }, …].' };
  if (!parsed.value.length) return { error: 'At least one row.' };
  for (let i = 0; i < parsed.value.length; i++) {
    const row = parsed.value[i];
    if (!isMap(row)) return { error: `Row ${i + 1} is not an object of column: value.` };
    const bad = Object.entries(row).find(([, v]) => !scalar(v));
    if (bad) return { error: `Row ${i + 1}, ${bad[0]}: a value is text, a number, true/false or null.` };
  }
  return { rows: parsed.value as Record<string, unknown>[] };
}

// ---------------------------------------------------------------------------------------------- problems

export interface StepProblem { field: string; message: string; }

/**
 * The server's problems, each under the step its path names (`steps[2].retry.maxAttempts` is step 3's
 * retry.maxAttempts), so the card and the step's panel can say what is wrong; the rest (settings, source, a parse
 * problem at `$`) are the definition's own.
 */
export function problemsByStep(problems: Problem[] | null | undefined): { steps: Record<number, StepProblem[]>; other: Problem[] } {
  const steps: Record<number, StepProblem[]> = {};
  const other: Problem[] = [];
  for (const problem of problems ?? []) {
    const match = /^steps\[(\d+)\](.*)$/.exec(problem.path ?? '');
    if (!match) { other.push(problem); continue; }
    const index = Number(match[1]);
    (steps[index] ??= []).push({ field: match[2].replace(/^\./, ''), message: problem.message });
  }
  return { steps, other };
}

/** The problems at one field of a step (and below it). */
export function problemsAt(problems: StepProblem[] | undefined, field: string): string[] {
  return (problems ?? []).filter(p => p.field === field || p.field.startsWith(`${field}.`) || p.field.startsWith(`${field}[`))
    .map(p => (p.field === field ? p.message : `${p.field.slice(field.length).replace(/^\./, '')}: ${p.message}`));
}

// ---------------------------------------------------------------------------------------------- Add step

export interface TaskOption { value: string; label: string; hint: string; disabled: boolean; group: string; }

const kindRank = (kind: string | null | undefined) => {
  const at = (TASK_KINDS as readonly string[]).indexOf(String(kind ?? ''));
  return at < 0 ? TASK_KINDS.length : at;
};

/**
 * What Add step offers, grouped by kind (Read, Process, Output), the tasks that can be added first in each: every registered task but the legacy ones (the whole
 * of an existing pipeline; never added, only replaced). A task that is off here -- unavailable, switched off, or
 * needing a workspace administrator the person is not -- is listed, says why, and cannot be picked.
 */
export function taskOptions(tasks: StepTaskEntry[], isAdmin = true): TaskOption[] {
  return tasks
    .filter(t => t.runsInEngine !== false && t.code !== LEGACY_TASK && t.kind !== 'Legacy')
    .map((t, i) => ({ t, i, why: refusalOf(t, isAdmin) }))
    // By kind; within a kind, what can be added before what cannot; then the registry's order.
    .sort((a, b) => kindRank(a.t.kind) - kindRank(b.t.kind) || Number(!!a.why) - Number(!!b.why) || a.i - b.i)
    .map(({ t, why }) => {
      return {
        value: t.code,
        label: `${taskLabel(t)}${why ? ' (disabled)' : ''}`,
        hint: why || t.description || '',
        disabled: !!why,
        group: t.kind || 'Other',
      };
    });
}

// ---------------------------------------------------------------------------------------------- columns

const rowsKeys = (rows: unknown): string[] => {
  const out: string[] = [];
  if (Array.isArray(rows)) for (const row of rows) if (isMap(row)) for (const key of Object.keys(row)) if (!out.includes(key)) out.push(key);
  return out;
};
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter(v => typeof v === 'string' && v) as string[] : []);
const union = (...lists: (string[] | null)[]): string[] | null => {
  if (lists.some(l => l === null)) return null;
  const out: string[] = [];
  for (const list of lists) for (const c of list!) if (!out.includes(c)) out.push(c);
  return out;
};

/**
 * The columns a step writes, as far as the definition says: its task's outputSchema when that names them, else what
 * the built-in tasks are known to do with their config. null when it cannot be told (a source, an API, a file).
 */
export function outputColumns(definition: Definition, index: number, tasks: StepTaskEntry[] = []): string[] | null {
  const step = definition.steps[index];
  if (!step) return null;
  const named = taskEntry(tasks, step.task, step)?.outputSchema?.items?.properties;
  if (named && Object.keys(named).length) return Object.keys(named);
  const config = step.config ?? {};
  const input = () => inputColumns(definition, index, tasks);
  switch (step.task) {
    case 'sample': return rowsKeys(config['rows']);
    case 'select': {
      const columns = config['columns'];
      if (Array.isArray(columns)) return strings(columns);
      return isMap(columns) ? Object.values(columns).filter(v => typeof v === 'string') as string[] : null;
    }
    case 'transform': {
      const targets = Array.isArray(config['mappings']) ? (config['mappings'] as unknown[]).map(m => (isMap(m) ? m['target'] : null)).filter(t => typeof t === 'string') as string[] : [];
      return config['keepUnmapped'] === true ? union(input(), targets) : targets;
    }
    case 'aggregate': {
      const as = Array.isArray(config['aggregations']) ? (config['aggregations'] as unknown[]).map(a => (isMap(a) ? a['as'] : null)).filter(t => typeof t === 'string') as string[] : [];
      return union(strings(config['groupBy']), as);
    }
    case 'join': {
      const right = definition.steps.findIndex(s => s.key === config['with']);
      return union(input(), right >= 0 && right < index ? outputColumns(definition, right, tasks) : null);
    }
    case 'filter': case 'save_file': case 'send_notification': case 'validate':
      return input();
    default:
      return null;
  }
}

/** The columns a step reads: the output of the step it names, else of the step before it. */
export function inputColumns(definition: Definition, index: number, tasks: StepTaskEntry[] = []): string[] | null {
  const step = definition.steps[index];
  if (!step) return null;
  const from = step.input ? definition.steps.findIndex(s => s.key === step.input) : index - 1;
  return from >= 0 && from < index ? outputColumns(definition, from, tasks) : null;
}

// ---------------------------------------------------------------------------------------------- a config form

export type FieldKind = 'text' | 'textarea' | 'number' | 'integer' | 'boolean' | 'enum' | 'list' | 'objects' | 'object' | 'json'
  | 'scalar' | 'column' | 'step' | 'columns';

/**
 * The registry's widget hints (configSchema `format`). column, step, sql, template and multiline have widgets here;
 * the rest are text until their pickers exist.
 * TODO(MIG-249): pickers for api-request, api-environment, data-contract, db-connection, bucket, pipeline and user.
 */
export const FORMATS = ['column', 'step', 'sql', 'template', 'multiline', 'api-request', 'api-environment', 'data-contract',
  'db-connection', 'bucket', 'pipeline', 'user'] as const;
const LONG_TEXT_FORMATS = ['sql', 'template', 'multiline', 'textarea'];

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  description: string;
  options: unknown[];
  /** For a list: its items' kind (text, number, integer or scalar). */
  itemKind?: FieldKind;
  schema: JsonSchema;
}

function types(schema: JsonSchema | undefined): string[] {
  const type = schema?.type;
  return (Array.isArray(type) ? type : type ? [type] : []).filter(t => t !== 'null');
}

function typeOf(schema: JsonSchema | undefined): string {
  const list = types(schema);
  return list.length === 1 ? list[0] : list.length ? 'mixed' : '';
}

const SCALARS = ['string', 'number', 'integer', 'boolean'];
/** A value that may be text, a number or true/false: typed as one box, read as JSON's literals where they fit. */
const isScalarMix = (schema: JsonSchema | undefined) => types(schema).length > 1 && types(schema).every(t => SCALARS.includes(t));

/** A map: an object with no fixed settings, each value to the schema additionalProperties gives. */
export function isMapSchema(schema: JsonSchema | undefined): boolean {
  return !!schema && (!schema.properties || !Object.keys(schema.properties).length)
    && !!schema.additionalProperties && typeof schema.additionalProperties === 'object';
}

const isObjectSchema = (schema: JsonSchema | undefined) =>
  typeOf(schema) === 'object' && ((!!schema?.properties && Object.keys(schema.properties).length > 0) || isMapSchema(schema));

function kindOf(schema: JsonSchema): FieldKind {
  if (Array.isArray(schema.enum) && schema.enum.length) return 'enum';
  if (isScalarMix(schema)) return 'scalar';
  switch (typeOf(schema)) {
    case 'string':
      if (schema.format === 'column') return 'column';
      if (schema.format === 'step') return 'step';
      return (schema.maxLength ?? 0) > 200 || LONG_TEXT_FORMATS.includes(schema.format ?? '') ? 'textarea' : 'text';
    case 'integer': return 'integer';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': {
      const items = schema.items;
      if (!items || items.enum) return 'json';
      if (typeOf(items) === 'string' && items.format === 'column') return 'columns';
      if (['string', 'number', 'integer'].includes(typeOf(items)) || isScalarMix(items)) return 'list';
      if (isObjectSchema(items)) return 'objects';
      return 'json';
    }
    case 'object': return isObjectSchema(schema) ? 'object' : 'json';
    default: return 'json';
  }
}

/** A schema's properties as the fields of a form; anything a form cannot express is a raw-JSON field. */
export function fieldsOf(schema: JsonSchema | null | undefined): FieldSpec[] {
  const required = schema?.required ?? [];
  return Object.entries(schema?.properties ?? {}).map(([name, property]) => {
    const kind = kindOf(property);
    const spec: FieldSpec = {
      name, kind, schema: property,
      label: property.title || name,
      required: required.includes(name),
      description: property.description ?? '',
      options: kind === 'enum' ? [...(property.enum ?? [])] : [],
    };
    if (kind === 'list') {
      const item = property.items;
      spec.itemKind = isScalarMix(item) ? 'scalar' : typeOf(item) === 'string' ? 'text' : (typeOf(item) as FieldKind);
    }
    return spec;
  });
}

/** Whether a form can draw every setting in the schema: an object with properties (or a map), none of them raw JSON. */
export function schemaSupported(schema: JsonSchema | null | undefined): boolean {
  if (!schema || typeOf(schema) !== 'object') return false;
  if (isMapSchema(schema)) return kindOf(schema.additionalProperties as JsonSchema) !== 'json';
  if (!schema.properties || !Object.keys(schema.properties).length) return false;
  return fieldsOf(schema).every(f => f.kind !== 'json'
    && (f.kind !== 'object' || schemaSupported(f.schema))
    && (f.kind !== 'objects' || schemaSupported(f.schema.items)));
}

/** The kind of box a map's values get. */
export function mapValueKind(schema: JsonSchema | undefined): FieldKind {
  const value = schema?.additionalProperties;
  return value && typeof value === 'object' ? kindOf(value) : 'json';
}

/** A typed value from what a box holds: a number box's text as a number, blank as absent. */
export function coerce(kind: FieldKind | undefined, raw: string): unknown {
  if (kind === 'scalar') {
    const text = raw.trim();
    if (text === '') return undefined;
    if (text === 'true' || text === 'false') return text === 'true';
    if (text === 'null') return null;
    if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(text)) return Number(text);
    return raw;
  }
  if (kind === 'number' || kind === 'integer') {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? (kind === 'integer' ? Math.trunc(n) : n) : raw;
  }
  return raw === '' ? undefined : raw;
}

/** The object with `name` set, or removed when the value is absent. */
export function withValue(object: Record<string, unknown> | null | undefined, name: string, value: unknown): Record<string, unknown> {
  const out = { ...(object ?? {}) };
  if (value === undefined) delete out[name];
  else out[name] = value;
  return out;
}

/** Parses a raw-JSON box: the value, or why it is not JSON. */
export function parseJson(text: string): { value?: unknown; error?: string } {
  if (!text.trim()) return { value: undefined };
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not JSON.' };
  }
}

/** "1.2 s", "340 ms", "2 min 5 s": how long a step took. */
export function durationText(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

/** A step error's words: the engine stores {message, ...}; anything else as text. */
export function errorText(error: unknown): string {
  if (error === null || error === undefined || error === '') return '';
  if (typeof error === 'string') return error;
  if (isMap(error) && typeof error['message'] === 'string') return error['message'] as string;
  return JSON.stringify(error);
}
