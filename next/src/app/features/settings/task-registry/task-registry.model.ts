import {
  FieldKind, JsonSchema, LEGACY_TASK, StepTaskEntry, TASK_KINDS, TaskState, fieldsOf, isMapSchema, mapValueKind, stateOf,
} from '../../tasks/steps/steps.model';
import { Pipeline } from '../pipelines/pipeline-dialog';

export { stateOf };
export type { TaskState };

/**
 * The Task Registry page (MIG-250): every task a pipeline's steps can run, from Core's registry (MIG-231), and every
 * existing pipeline as a Legacy task -- the pipelines the Configuration › Pipelines list showed, still edited in their
 * own dialog. Pure functions, so the page, its panel and their specs read the rows the same way.
 */

/** The kind chips, in the order the table lists them. */
export const REGISTRY_KINDS = [...TASK_KINDS, 'Legacy'] as const;

export const TASK_STATES: TaskState[] = ['On', 'Off', 'Unavailable'];

export interface RegistryRow {
  /** The task's code, or legacy:<pipelineKey> for a pipeline. */
  id: string;
  /** What the table prints under the name: the task's code, or the pipeline's id. */
  code: string;
  name: string;
  kind: string;
  description: string;
  service: string;
  input: string;
  output: string;
  state: TaskState;
  reason: string;
  overridden: boolean;
  legacy: boolean;
  /** The registry line: a task's own; for a pipeline, its legacy line (or the generic one). */
  task: StepTaskEntry;
  /** A Legacy row's pipeline, as pipeline.json/list gave it: what its dialog opens with. */
  pipeline?: Pipeline;
}

export const isLegacyEntry = (t: StepTaskEntry) => t.code === LEGACY_TASK || t.kind === 'Legacy';

/** A schema for the input -> output column: None, Rows, the named columns, or its type. */
export function schemaShape(schema: JsonSchema | null | undefined): string {
  if (!schema) return 'None';
  const type = Array.isArray(schema.type) ? schema.type.filter(t => t !== 'null')[0] : schema.type;
  if (type === 'array') {
    const named = Object.keys(schema.items?.properties ?? {});
    return named.length ? `Rows: ${named.join(', ')}` : 'Rows';
  }
  if (type === 'object') return 'Object';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Any';
}

const kindRank = (kind: string) => {
  const at = (REGISTRY_KINDS as readonly string[]).indexOf(kind);
  return at < 0 ? REGISTRY_KINDS.length : at;
};

/** The generic legacy line, for a pipeline Core sent none for (a platform administrator's list; a registry not read). */
const LEGACY_FALLBACK: StepTaskEntry = {
  code: LEGACY_TASK, name: 'Legacy pipeline', kind: 'Legacy', backingService: 'worker', runsInEngine: false,
  overridable: false, enabled: true, available: true,
  description: 'An existing pipeline, run by its worker exactly as before (the task\'s XML payload over Kafka).',
};

function taskRow(t: StepTaskEntry): RegistryRow {
  const { state, reason } = stateOf(t);
  return {
    id: t.code, code: t.code, name: t.name || t.code, kind: t.kind || 'Other', description: t.description || '',
    service: t.backingService || '', input: schemaShape(t.inputSchema), output: schemaShape(t.outputSchema),
    state, reason, overridden: !!t.overridden, legacy: false, task: t,
  };
}

function pipelineRow(p: Pipeline, line: StepTaskEntry): RegistryRow {
  const active = !p.status || p.status === 'Active';
  const fields = p.fields?.length ?? p.fieldCount ?? 0;
  return {
    id: `legacy:${p.pipelineKey}`, code: p.pipelineId, name: p.pipelineName, kind: 'Legacy',
    description: p.description || '', service: line.backingService || 'worker',
    input: `Payload: ${fields} field${fields === 1 ? '' : 's'}`, output: 'Worker',
    state: active ? 'On' : 'Off', reason: active ? '' : `The pipeline is ${p.status}.`,
    overridden: false, legacy: true, task: line, pipeline: p,
  };
}

/**
 * The table's rows: the step tasks by kind (Read, Process, Output; then any other), in the registry's order within a
 * kind; then one Legacy row per pipeline, in the list's order. A pipeline row carries the registry's line for it when
 * Core sent one, else the generic legacy line -- every pipeline is listed whatever the registry said.
 */
export function registryRows(tasks: StepTaskEntry[], pipelines: Pipeline[]): RegistryRow[] {
  const steps = tasks.filter(t => !isLegacyEntry(t))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => kindRank(a.t.kind || '') - kindRank(b.t.kind || '') || a.i - b.i)
    .map(({ t }) => taskRow(t));
  const generic = tasks.find(t => isLegacyEntry(t) && t.pipelineKey == null) ?? LEGACY_FALLBACK;
  const legacy = pipelines.map(p =>
    pipelineRow(p, tasks.find(t => isLegacyEntry(t) && t.pipelineKey != null && t.pipelineKey === p.pipelineKey) ?? generic));
  return [...steps, ...legacy];
}

export interface RegistryFilter { kind: string; state: string; search: string; }
export const EMPTY_FILTER: RegistryFilter = { kind: '', state: '', search: '' };

export function filterRows(rows: RegistryRow[], f: RegistryFilter): RegistryRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(r => (!f.kind || r.kind === f.kind) && (!f.state || r.state === f.state)
    && (!q || [r.name, r.code, r.description, r.service, r.pipeline?.topicName, r.pipeline?.kafkaTopic]
      .some(v => String(v ?? '').toLowerCase().includes(q))));
}

/** How many rows of each kind ('' for all): the kind chips' counts. */
export function kindCounts(rows: RegistryRow[]): Record<string, number> {
  const out: Record<string, number> = { '': rows.length };
  for (const kind of REGISTRY_KINDS) out[kind] = rows.filter(r => r.kind === kind).length;
  return out;
}

// ---------------------------------------------------------------------------------------------- the panel

export const permissionLabel = (p: string | null | undefined) => (p === 'TENANT_ADMIN' ? 'Workspace administrators' : 'Any member');

export function retryText(retry: StepTaskEntry['retry']): string {
  const tries = retry?.maxAttempts ?? 1;
  if (tries <= 1) return 'Once, no retry';
  return `Up to ${tries} tries, ${retry?.delaySeconds ?? 0} s apart`;
}

export function timeoutText(seconds: number | null | undefined): string {
  if (!seconds) return 'No limit';
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** A setting of a task's config, for reading rather than filling in. */
export interface ReadableField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
  /** Default, choices, bounds: one short line each. */
  notes: string[];
  /** A group's (or a repeatable group's rows') own settings. */
  children: ReadableField[];
}

const KIND_WORDS: Record<FieldKind, string> = {
  text: 'Text', textarea: 'Long text', number: 'Number', integer: 'Whole number', boolean: 'Yes or no', enum: 'One of',
  list: 'List', objects: 'Repeatable group', object: 'Group', json: 'JSON', scalar: 'Text, number or yes/no',
  column: 'Column', step: 'Earlier step', columns: 'Columns', prompt: 'AI prompt', bucket: 'Bucket',
};

/** The registry's widget hints that name what a value points at (FORMATS), as words. */
const FORMAT_WORDS: Record<string, string> = {
  sql: 'SQL', template: 'Text with placeholders', 'api-request': 'API request', 'api-environment': 'API environment',
  'data-contract': 'Data contract', 'db-connection': 'Database connection', bucket: 'Bucket', pipeline: 'Pipeline', user: 'People',
  prompt: 'AI prompt', expression: 'Formula',
};

const shown = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

function typeWords(kind: FieldKind, schema: JsonSchema): string {
  const format = schema.format ?? (kind === 'list' ? schema.items?.format : undefined);
  if (format && FORMAT_WORDS[format]) return FORMAT_WORDS[format];
  if (kind === 'object' && isMapSchema(schema)) return `Names and values (${KIND_WORDS[mapValueKind(schema)].toLowerCase()})`;
  return KIND_WORDS[kind];
}

function notesOf(kind: FieldKind, schema: JsonSchema): string[] {
  const notes: string[] = [];
  if (schema.default !== undefined && schema.default !== '') notes.push(`Default: ${shown(schema.default)}`);
  if (kind === 'enum') notes.push(`Choices: ${(schema.enum ?? []).map(shown).join(', ')}`);
  if (schema.minimum !== undefined || schema.maximum !== undefined) {
    notes.push(schema.maximum === undefined ? `At least ${schema.minimum}`
      : schema.minimum === undefined ? `At most ${schema.maximum}` : `${schema.minimum} to ${schema.maximum}`);
  }
  if (kind === 'objects' || kind === 'list' || kind === 'columns') {
    const noun = kind === 'objects' ? 'rows' : 'items';
    if (schema.minItems !== undefined && schema.maxItems !== undefined) notes.push(`${schema.minItems} to ${schema.maxItems} ${noun}`);
    else if (schema.maxItems !== undefined) notes.push(`At most ${schema.maxItems} ${noun}`);
  }
  if (schema.pattern) notes.push(`Pattern: ${schema.pattern}`);
  return notes;
}

/**
 * A config schema as a list of its settings -- the step builder's own reading of it (fieldsOf), so a setting is
 * called here what its box is called there. A group lists its settings; a repeatable group its rows' settings.
 */
export function readableSchema(schema: JsonSchema | null | undefined): ReadableField[] {
  return fieldsOf(schema).map(f => ({
    name: f.name, label: f.label, required: f.required, description: f.description,
    type: typeWords(f.kind, f.schema),
    notes: notesOf(f.kind, f.schema),
    children: f.kind === 'objects' ? readableSchema(f.schema.items) : f.kind === 'object' && !isMapSchema(f.schema) ? readableSchema(f.schema) : [],
  }));
}
