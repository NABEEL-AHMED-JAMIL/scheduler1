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

/** A JSON Schema, the subset a step task's configSchema uses (MIG-231). */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  items?: JsonSchema;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: string;
  [key: string]: unknown;
}

/**
 * One line of GET pipeline.json/steps/tasks. Today (MIG-230) a line is code, description and runsInEngine; the Task
 * Registry (MIG-231) adds a title, a category, enabled and the config's JSON Schema. Every addition is optional here.
 */
export interface StepTaskEntry {
  code: string;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  runsInEngine?: boolean;
  enabled?: boolean;
  configSchema?: JsonSchema | null;
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

export function taskEntry(tasks: StepTaskEntry[], code: string | null | undefined): StepTaskEntry | undefined {
  return tasks.find(t => t.code === code);
}

export const taskLabel = (task: StepTaskEntry | undefined, code?: string) => task?.title || task?.name || task?.code || code || '';

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

export interface TaskOption { value: string; label: string; hint: string; disabled: boolean; }

/**
 * What Add step offers: every registered task but `legacy` (the whole of an existing pipeline; it is never added,
 * only replaced). A task the registry has turned off is listed, marked, and cannot be picked.
 */
export function taskOptions(tasks: StepTaskEntry[]): TaskOption[] {
  return tasks.filter(t => t.runsInEngine !== false && t.code !== LEGACY_TASK).map(t => {
    const disabled = t.enabled === false;
    return {
      value: t.code,
      label: `${taskLabel(t)}${disabled ? ' (disabled)' : ''}`,
      hint: [t.category, t.description].filter(Boolean).join(' · '),
      disabled,
    };
  });
}

// ---------------------------------------------------------------------------------------------- a config form

export type FieldKind = 'text' | 'textarea' | 'number' | 'integer' | 'boolean' | 'enum' | 'list' | 'objects' | 'object' | 'json';

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  description: string;
  options: unknown[];
  /** For a list: its items' kind (text, number or integer). */
  itemKind?: FieldKind;
  schema: JsonSchema;
}

function typeOf(schema: JsonSchema | undefined): string {
  const type = schema?.type;
  if (Array.isArray(type)) return type.find(t => t !== 'null') ?? '';
  return type ?? '';
}

function kindOf(schema: JsonSchema): FieldKind {
  if (Array.isArray(schema.enum) && schema.enum.length) return 'enum';
  switch (typeOf(schema)) {
    case 'string': return (schema.maxLength ?? 0) > 200 || schema.format === 'textarea' || schema.format === 'multiline' ? 'textarea' : 'text';
    case 'integer': return 'integer';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': {
      const item = schema.items ? typeOf(schema.items) : '';
      if (['string', 'number', 'integer'].includes(item) && !schema.items?.enum) return 'list';
      if (item === 'object' && schema.items?.properties) return 'objects';
      return 'json';
    }
    case 'object': return schema.properties && Object.keys(schema.properties).length ? 'object' : 'json';
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
    if (kind === 'list') spec.itemKind = typeOf(property.items) === 'string' ? 'text' : (typeOf(property.items) as FieldKind);
    return spec;
  });
}

/** Whether a form can draw every setting in the schema: an object with properties, none of them raw JSON. */
export function schemaSupported(schema: JsonSchema | null | undefined): boolean {
  if (!schema || typeOf(schema) !== 'object' || !schema.properties || !Object.keys(schema.properties).length) return false;
  return fieldsOf(schema).every(f => f.kind !== 'json'
    && (f.kind !== 'object' || schemaSupported(f.schema))
    && (f.kind !== 'objects' || schemaSupported(f.schema.items)));
}

/** A typed value from what a box holds: a number box's text as a number, blank as absent. */
export function coerce(kind: FieldKind | undefined, raw: string): unknown {
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
