import { FlowEdge, FlowMetric, FlowNode, FlowNodeKind, FlowTone } from './flow-graph.model';

/**
 * Every screen that draws a flow reads its own source -- a pipeline's steps, a workflow's steps, the AI Assistant's
 * designed flow, a run's step timeline -- and hands <app-flow-graph> the same nodes and edges. These are the adapters
 * that make them, one per source, so the four screens share one renderer and one look, and one derivation of where a
 * pipeline's rows go (the step builder's Flow view and the AI flow draw a join the same way).
 *
 * Pure, and typed by the few fields each reads (no feature imports): unit-tested on their own, and a screen that only
 * lists steps never loads them.
 */

export interface FlowGraphData { nodes: FlowNode[]; edges: FlowEdge[]; }

// ---------------------------------------------------------------------------------------------- pipeline steps

/** A pipeline step as the definition holds it (MIG-230): only what the drawing reads. */
export interface PipelineStepLike {
  key: string;
  name?: string | null;
  task: string;
  /** An earlier step's key; absent: the latest output before it. */
  input?: string | null;
  config?: Record<string, unknown> | null;
  onError?: string | null;
}

/** The JSON Schema subset the registry's configSchema uses; `format: "step"` names an earlier step. */
export interface SchemaLike {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  properties?: Record<string, SchemaLike>;
  items?: SchemaLike;
  [key: string]: unknown;
}

/** A Task Registry line (pipeline.json/steps/tasks): only what the drawing reads. */
export interface PipelineTaskLike {
  code: string;
  name?: string | null;
  kind?: string | null;
  backingService?: string | null;
  inputSchema?: SchemaLike | null;
  configSchema?: SchemaLike | null;
}

/** A setting of a step that names other steps: whose rows it reads besides (or instead of) its input. */
export interface StepRef { field: string; key: string; label: string; }

/** Ids of the drawing's own nodes; a step key is [a-z][a-z0-9_]*, so these never collide with one. */
export const FLOW_START = '@start';
export const FLOW_REVIEW = '@review';

/**
 * Settings the built-in tasks are known to read steps from, for a registry that has not answered yet. The registry's
 * configSchema (`format: "step"`) is the source of truth when it is there.
 */
const KNOWN_REFS: Record<string, { field: string; label: string }[]> = {
  join: [{ field: 'with', label: 'joined' }],
  append: [{ field: 'steps', label: 'stacked' }],
};
/** What an edge from a referenced step says, by task and setting; otherwise the setting's title. */
const REF_LABELS: Record<string, string> = { 'join.with': 'joined', 'append.steps': 'stacked' };
/** Tasks that read no input of their own (they make rows, or read only the steps they name). */
const NO_INPUT = new Set(['append', 'sample']);

/** A step's kind on a flow, from its task: where rows come from, what is done to them, where they go. */
export function stepKind(task: string, entry?: PipelineTaskLike | null): FlowNodeKind {
  if (task === 'legacy' || entry?.kind === 'Legacy') return 'legacy';
  if (task === 'approval') return 'review';
  if (entry) {
    if (entry.backingService === 'ai-service') return 'ai';
    const k = String(entry.kind ?? '').toLowerCase();
    if (k === 'read' || k === 'output') return k;
    if (k) return 'process';
  }
  if (task.startsWith('read_') || task === 'sample') return 'read';
  if (task === 'ai_prompt' || task === 'measure_image') return 'ai';
  if (['save_file', 'upload_bucket', 'render_pdf', 'send_notification', 'write_database', 'send_webhook'].includes(task)) return 'output';
  return 'process';
}

/** Each built-in task's glyph (a FLOW_ICONS name); a task not here gets its kind's. */
const TASK_ICONS: Record<string, string> = {
  read_file: 'file', read_database: 'database', read_api: 'globe', read_s3: 'cloud', read_documents: 'file', sample: 'table',
  filter: 'filter', select: 'table', transform: 'code', compute: 'code', aggregate: 'chart', join: 'link', append: 'layers',
  sort: 'sort', limit: 'filter', validate: 'check', enrich: 'plug', ai_prompt: 'sparkle', measure_image: 'image', approval: 'user',
  save_file: 'download', upload_bucket: 'upload', render_pdf: 'file', send_notification: 'mail', send_webhook: 'send',
  write_database: 'database', legacy: 'history',
  // Owner #16 (2026-10-19): the common tasks added to the registry.
  dedupe: 'layers', split_column: 'code', pivot: 'table', unpivot: 'list', fill_missing: 'check',
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && !!x);

/** The settings a schema marks as naming a step, at any depth (a list of sections may each name one). */
function refPaths(schema: SchemaLike | null | undefined, path: string[] = [], out: { path: string[]; title: string }[] = []) {
  if (!schema || typeof schema !== 'object') return out;
  if (schema.format === 'step' && path.length) out.push({ path, title: String(schema.title ?? '') });
  for (const [name, child] of Object.entries(schema.properties ?? {})) refPaths(child, [...path, name], out);
  if (schema.items) refPaths(schema.items.format === 'step' ? { ...schema.items, title: schema.items.title ?? schema.title } : schema.items, path, out);
  return out;
}

/** The values at a path, walking into lists on the way (sections[].input). */
function valuesAt(value: unknown, path: string[]): unknown[] {
  if (!path.length) return Array.isArray(value) ? value : [value];
  if (Array.isArray(value)) return value.flatMap(v => valuesAt(v, path));
  if (!value || typeof value !== 'object') return [];
  return valuesAt((value as Record<string, unknown>)[path[0]], path.slice(1));
}

/**
 * The steps a step's settings name (a join's "with", an append's "steps", a report section's rows), in order, each
 * once. From the task's configSchema when the registry gave it; from what the built-in tasks are known to read otherwise.
 */
export function stepRefs(step: PipelineStepLike, entry?: PipelineTaskLike | null): StepRef[] {
  const config = step.config ?? {};
  const out: StepRef[] = [];
  const add = (field: string, label: string, keys: string[]) => {
    for (const key of keys) if (key !== step.key && !out.some(r => r.key === key)) out.push({ field, key, label });
  };
  const paths = entry?.configSchema ? refPaths(entry.configSchema) : null;
  if (paths) {
    for (const p of paths) {
      const field = p.path.join('.');
      add(field, REF_LABELS[`${step.task}.${field}`] ?? (p.title || p.path[p.path.length - 1]).toLowerCase(), strings(valuesAt(config, p.path)));
    }
  } else {
    for (const r of KNOWN_REFS[step.task] ?? []) add(r.field, r.label, strings(config[r.field]));
  }
  return out;
}

/**
 * Whether a step reads the rows before it (or its `input`): a read step makes its own, and an append reads only the
 * steps it names. The registry says so -- a task with no input schema, or one whose input is "Not read" -- and the
 * built-in tasks are known otherwise.
 */
export function readsInput(step: PipelineStepLike, entry?: PipelineTaskLike | null): boolean {
  if (step.input) return true;
  if (entry) {
    if (String(entry.kind ?? '').toLowerCase() === 'read') return false;
    const input = entry.inputSchema;
    if (entry.inputSchema !== undefined && !input) return false;
    if (input && /^not read/i.test(String(input.description ?? ''))) return false;
    return !NO_INPUT.has(step.task);
  }
  return !(NO_INPUT.has(step.task) || step.task.startsWith('read_'));
}

export interface PipelineEdgeOptions {
  tasks?: readonly PipelineTaskLike[] | null;
  /** A node before the first step (the run's start), and what its edge says. */
  startId?: string | null;
  startLabel?: string | null;
}

/**
 * Where a pipeline's rows go, as edges: each step from the step it reads (its `input`, else the one before it), from
 * every step its settings name (a join's right side, an append's steps), and -- for a step that reads nothing before
 * it, a read in the middle -- a dashed "then" from the step before, so the run's order still reads. The engine's own
 * rule (PipelineDefinition: absent input is the latest output before the step); the AI flow is drawn by it too.
 */
export function pipelineEdges(steps: readonly PipelineStepLike[], opts: PipelineEdgeOptions = {}): FlowEdge[] {
  const tasks = opts.tasks ?? [];
  const byCode = new Map(tasks.map(t => [t.code, t] as const));
  const seen = new Set<string>();
  const edges: FlowEdge[] = [];
  const keys = new Set<string>();
  steps.forEach((step, i) => {
    const entry = byCode.get(step.task) ?? null;
    const previous = i > 0 ? steps[i - 1].key : null;
    const refs = stepRefs(step, entry).filter(r => keys.has(r.key));
    const linked = new Set<string>();
    const push = (from: string, edge: Omit<FlowEdge, 'from' | 'to'>) => {
      const id = from + '>' + step.key;
      if (seen.has(id)) return;
      seen.add(id); linked.add(from);
      edges.push({ from, to: step.key, ...edge });
    };
    if (readsInput(step, entry)) {
      // The step before needs no word; an input named from further back says it reads that step's rows.
      const named = !!step.input && keys.has(step.input) && step.input !== previous;
      const from = named ? step.input! : previous;
      if (from) push(from, { label: named ? 'rows' : null });
      else if (opts.startId) push(opts.startId, { label: opts.startLabel ?? 'starts' });
    }
    for (const r of refs) push(r.key, { label: r.label });
    if (!linked.size) {
      if (previous) push(previous, { label: 'then', dashed: true });
      else if (opts.startId) push(opts.startId, { label: opts.startLabel ?? 'starts' });
    }
    keys.add(step.key);
  });
  return edges;
}

/** A setting's value in a few characters, for a node's summary. */
function short(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const scalars = value.filter(v => ['string', 'number', 'boolean'].includes(typeof v));
    return scalars.length === value.length ? scalars.join(', ') : `${value.length} items`;
  }
  return null;
}

/**
 * UX review 2026-10-12: the setting formats whose value is the id of something with a name -- a saved API request, an
 * environment, a prompt, a webhook, a document type, a contract, a database connection, a pipeline. A node read
 * "reque… 1083" and "envir… 1072"; it names them now ("API request  Patients by ward").
 */
export const NAMED_FORMATS = new Set(['api-request', 'api-environment', 'prompt', 'webhook', 'document-type', 'data-contract',
  'db-connection', 'pipeline']);

/** The name of what a setting's id points at (by its schema format), or null while it is not known. */
export type StepNameLookup = (format: string, value: unknown, step: PipelineStepLike) => string | null;

/**
 * Up to two of a step's settings, in the order the step has them: the node's summary under its name. A setting is called
 * by its schema title ("Environment", not environmentId), and an id is shown as the name of what it points at -- or as
 * "#1072" until the name is read.
 */
export function stepSummary(step: PipelineStepLike, max = 2, schema?: SchemaLike | null, names?: StepNameLookup): FlowMetric[] {
  const out: FlowMetric[] = [];
  for (const [name, value] of Object.entries(step.config ?? {})) {
    const property = schema?.properties?.[name];
    const format = typeof property?.format === 'string' ? property.format : '';
    let text = short(value);
    if (text === null) continue;
    if (NAMED_FORMATS.has(format) && (typeof value === 'number' || typeof value === 'string')) {
      text = names?.(format, value, step) ?? `#${value}`;
    }
    out.push({ label: property?.title || name, value: text });
    if (out.length >= max) break;
  }
  return out;
}

export type StepChange = 'new' | 'changed' | null;

export interface PipelineGraphOptions extends PipelineEdgeOptions {
  /** The run's start, drawn before the first step: what it is ("Run starts"), and its input. */
  start?: { label: string; sub?: string | null } | null;
  /** Whose review the results wait for (settings.review.required): a review gate after the last step. */
  review?: readonly string[] | null;
  /** How many problems the server found on the step at an index. */
  problems?: (index: number) => number;
  /** Whether a step is not saved as it is shown: new, or changed. */
  change?: (step: PipelineStepLike, index: number) => StepChange;
  /** Settings shown on a node; 0 shows none. */
  summary?: number;
  /** UX review 2026-10-12: the names of what a step's ids point at (stepSummary). */
  names?: StepNameLookup;
}

/**
 * A pipeline's steps as a flow: each step a node with its task's icon, its name, its task and a short summary of its
 * settings; a step with problems is marked crit with how many, a step not saved yet is dashed and says so; edges as
 * pipelineEdges draws them, a start node before and a review gate after when the pipeline has them.
 */
export function pipelineGraph(steps: readonly PipelineStepLike[], opts: PipelineGraphOptions = {}): FlowGraphData {
  const byCode = new Map((opts.tasks ?? []).map(t => [t.code, t] as const));
  const nodes: FlowNode[] = [];
  if (opts.start) nodes.push({ id: FLOW_START, label: opts.start.label, sub: opts.start.sub ?? null, kind: 'trigger' });
  steps.forEach((step, i) => {
    const entry = byCode.get(step.task) ?? null;
    const problems = opts.problems?.(i) ?? 0;
    const change = opts.change?.(step, i) ?? null;
    const badges: string[] = [];
    if (problems) badges.push(problems === 1 ? '1 problem' : `${problems} problems`);
    if (change) badges.push(change === 'new' ? 'unsaved' : 'changed');
    const tone: FlowTone | null = problems ? 'crit' : change ? 'info' : null;
    nodes.push({
      id: step.key, label: step.name || step.key, sub: step.task, kind: stepKind(step.task, entry),
      icon: TASK_ICONS[step.task] ?? null, tone, badges, metrics: opts.summary === 0 ? [] : stepSummary(step, opts.summary ?? 2, entry?.configSchema, opts.names),
      pending: !!change, metricsPerRow: 1,
    });
  });
  const edges = pipelineEdges(steps, { ...opts, startId: opts.start ? FLOW_START : opts.startId });
  const review = (opts.review ?? []).filter(Boolean);
  if (review.length && steps.length) {
    nodes.push({ id: FLOW_REVIEW, label: `Review: ${review.join(' + ')}`, sub: 'results held until approved', kind: 'review' });
    edges.push({ from: steps[steps.length - 1].key, to: FLOW_REVIEW, label: 'results', dashed: true });
  }
  return { nodes, edges };
}

// ---------------------------------------------------------------------------------------------- the AI flow

/** The AI Assistant's designed flow (ai-service's "pipeline-flow" artifact): only what the drawing reads. */
export interface AiFlowLike {
  flow: {
    nodes: { id: string; kind: string; label: string; sub?: string | null; task?: string | null; problems?: { kind: string }[] }[];
    edges: { from: string; to: string; label?: string | null; dashed?: boolean }[];
  };
  definition?: { steps: PipelineStepLike[] } | null;
}

const KINDS: FlowNodeKind[] = ['trigger', 'read', 'process', 'ai', 'output', 'review', 'legacy', 'other'];

/**
 * The AI flow as the graph draws it: a step with an error is crit, one with a setting to fill is warn, the trigger and
 * review gate keep their kind's look; each step's badges say what is wrong or missing. Edges between steps are
 * pipelineEdges' (so a join or an append draws its other inputs, as the step builder's Flow view does); the edges to and
 * from the flow's own nodes (the trigger, the review gate) are the ones ai-service drew.
 */
export function aiFlowGraph(artifact: AiFlowLike, tasks?: readonly PipelineTaskLike[] | null): FlowGraphData {
  const nodes: FlowNode[] = artifact.flow.nodes.map(n => {
    const problems = n.problems ?? [];
    const errors = problems.filter(p => p.kind === 'error').length;
    const settings = problems.filter(p => p.kind === 'setting').length;
    const warnings = problems.filter(p => p.kind === 'warning').length;
    const tone: FlowTone | null = errors ? 'crit' : settings || warnings ? 'warn' : null;
    const badges: string[] = [];
    if (errors) badges.push(errors === 1 ? '1 error' : `${errors} errors`);
    if (settings) badges.push(settings === 1 ? 'needs 1 setting' : `needs ${settings} settings`);
    if (warnings) badges.push(warnings === 1 ? '1 warning' : `${warnings} warnings`);
    const kind = (KINDS as string[]).includes(n.kind) ? n.kind as FlowNodeKind : 'other';
    return { id: n.id, label: n.label, sub: n.task ?? n.sub ?? null, kind, icon: n.task ? TASK_ICONS[n.task] ?? null : null, tone, badges };
  });
  const steps = (artifact.definition?.steps ?? []).filter(s => nodes.some(n => n.id === s.key));
  const keys = new Set(steps.map(s => s.key));
  const own = artifact.flow.edges.filter(e => !(keys.has(e.from) && keys.has(e.to)))
    .map(e => ({ from: e.from, to: e.to, label: e.label ?? null, dashed: !!e.dashed }));
  if (!steps.length) {
    return { nodes, edges: artifact.flow.edges.map(e => ({ from: e.from, to: e.to, label: e.label ?? null, dashed: !!e.dashed })) };
  }
  // In the run's order: into the first step (from the trigger), between the steps, out of the last (to the review gate).
  const into = own.filter(e => keys.has(e.to));
  const out = own.filter(e => !keys.has(e.to));
  const between = pipelineEdges(steps, { tasks }).filter(e => !own.some(o => o.from === e.from && o.to === e.to));
  return { nodes, edges: [...into, ...between, ...out] };
}

// ---------------------------------------------------------------------------------------------- a run's steps

/** One step of a run's timeline (sourceJob.json/stepExecutions): only what the plan map reads. */
export interface RunStepLike {
  key: string;
  task: string;
  status: string | null;
  durationMs?: number | null;
  recordsIn?: number | null;
  recordsOut?: number | null;
  tries?: number | null;
  reusedFromAttempt?: number | null;
}

export type MapBasis = 'time' | 'rows';

/** A duration in the run's own words: ms under a second, then seconds, then minutes. */
export function durationText(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function countText(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US');
}

/**
 * A run's steps as a plan map (the "plan map" pattern from the design references): each step a node with its time and
 * rows in and out, a bar of its share of the run's time (or of the rows it wrote), the failed step marked and -- when
 * nothing failed -- the slowest one highlighted; edges carry the rows that passed.
 */
export function runGraph<S extends RunStepLike>(steps: readonly S[], basis: MapBasis): FlowGraphData & { hot: S | null } {
  const total = steps.reduce((sum, s) => sum + (basis === 'time' ? s.durationMs ?? 0 : s.recordsOut ?? 0), 0);
  const failed = steps.find(s => s.status === 'Failed') ?? null;
  const slowest = steps.filter(s => s.durationMs != null).sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0] ?? null;
  const hot = failed ?? (steps.length > 1 ? slowest : null);
  const nodes: FlowNode[] = steps.map(s => {
    const share = total ? (basis === 'time' ? s.durationMs ?? 0 : s.recordsOut ?? 0) / total : null;
    const badges: string[] = [];
    if (s.status && s.status !== 'Completed') badges.push(s.status);
    if (s === hot && !failed) badges.push('slowest');
    if (s.reusedFromAttempt != null) badges.push(`reused from attempt ${s.reusedFromAttempt}`);
    if ((s.tries ?? 1) > 1) badges.push(`${s.tries} tries`);
    return {
      id: s.key, label: s.key, sub: s.task, kind: stepKind(s.task), icon: TASK_ICONS[s.task] ?? null,
      tone: s.status === 'Failed' ? 'crit' : s.status === 'Running' ? 'info' : s.status === 'Completed' ? null : 'neutral',
      badges,
      metrics: [
        { label: 'time', value: durationText(s.durationMs) },
        { label: 'share', value: share == null ? '—' : `${Math.round(share * 1000) / 10}%` },
        { label: 'rows in', value: countText(s.recordsIn) },
        { label: 'rows out', value: countText(s.recordsOut) },
      ],
      share, hot: s === hot,
    };
  });
  const edges: FlowEdge[] = steps.slice(1).map((s, i) => ({ from: steps[i].key, to: s.key,
    label: steps[i].recordsOut != null ? `${countText(steps[i].recordsOut)} ${steps[i].recordsOut === 1 ? 'row' : 'rows'}` : null, tone: steps[i].status === 'Failed' ? 'crit' : null }));
  return { nodes, edges, hot };
}

// ---------------------------------------------------------------------------------------------- workflow steps

/** A workflow step as workflow-service's WorkflowSteps reads it (MIG-276): only what the drawing reads. */
export interface WorkflowStepLike {
  key: string;
  type: string;
  name?: string | null;
  next?: string | null;
  onReject?: string | null;
  whenTrue?: string | null;
  whenFalse?: string | null;
  hours?: number | null;
}

export const WORKFLOW_START = '@start';
export const WORKFLOW_END = '@end';
export const WORKFLOW_REJECTED = '@rejected';

/** Each step type's kind, glyph and accent; the glyph and accent are the designer's own (STEP_TYPES). */
const WORKFLOW_TYPES: Record<string, { kind: FlowNodeKind; icon: string; accent: FlowTone }> = {
  approval: { kind: 'review', icon: 'checkCircle', accent: 'ok' },
  task: { kind: 'review', icon: 'list', accent: 'info' },
  condition: { kind: 'other', icon: 'filter', accent: 'warn' },
  notify: { kind: 'output', icon: 'bell', accent: 'brand' },
  run_pipeline: { kind: 'process', icon: 'play', accent: 'info' },
  save_dataset: { kind: 'output', icon: 'database', accent: 'neutral' },
  wait: { kind: 'other', icon: 'clock', accent: 'neutral' },
};

/** What the edge out of a step says when it goes on: an approval was approved, a task was done. */
const GOES_ON: Record<string, string> = { approval: 'approved', task: 'done', run_pipeline: 'started' };

export interface WorkflowGraphOptions {
  /** The summary under a step's name (who, what, where). */
  summary?: (step: WorkflowStepLike, index: number) => string | null;
  /** The problems the server named on the step at an index. */
  problems?: (index: number) => number;
  /** The type's name, for a screen reader and the badge-less node. */
  typeLabel?: (type: string) => string;
}

/**
 * A workflow's steps as a flow, the way the engine walks them: a step goes to its `next` (absent: the step below; the
 * last one: the end); a condition goes two ways, "yes" and "no"; an approval that is rejected goes to its `onReject`, or
 * ends the request rejected. The request's start, its end and its rejected end are nodes of their own; an edge says the
 * outcome it follows (approved, rejected, done, yes, no).
 */
export function workflowGraph(steps: readonly WorkflowStepLike[], opts: WorkflowGraphOptions = {}): FlowGraphData {
  const keys = new Set(steps.map(s => s.key));
  const nodes: FlowNode[] = [{ id: WORKFLOW_START, label: 'Request starts', kind: 'trigger', icon: 'send' }];
  const edges: FlowEdge[] = [];
  let ends = false, rejected = false;
  const target = (key: string | null | undefined, fallback: string | null): string | null => {
    if (key === 'end') return WORKFLOW_END;
    if (key && keys.has(key)) return key;
    if (key) return null; // a step that is not there: the server names the problem, the drawing leaves the edge out
    return fallback ?? WORKFLOW_END;
  };
  const link = (from: string, to: string | null, label: string | null, tone: FlowTone | null = null, dashed = false) => {
    if (!to) return;
    if (to === WORKFLOW_END) ends = true;
    if (to === WORKFLOW_REJECTED) rejected = true;
    // Two ways to the same place (a condition whose yes and no both end it) are one edge that says both.
    const same = edges.find(e => e.from === from && e.to === to);
    if (same) { same.label = [same.label, label].filter(Boolean).join(' / ') || null; same.tone = null; same.dashed = same.dashed && dashed; return; }
    edges.push({ from, to, label, tone, dashed });
  };
  if (steps.length) link(WORKFLOW_START, steps[0].key, null);
  else link(WORKFLOW_START, WORKFLOW_END, null);
  steps.forEach((s, i) => {
    const type = WORKFLOW_TYPES[s.type] ?? { kind: 'other' as FlowNodeKind, icon: 'dots', accent: 'neutral' as FlowTone };
    const problems = opts.problems?.(i) ?? 0;
    const badges = problems ? [problems === 1 ? '1 problem' : `${problems} problems`] : [];
    const typeName = opts.typeLabel?.(s.type) ?? s.type;
    nodes.push({
      id: s.key, label: s.name || s.key, sub: opts.summary?.(s, i) || typeName, kind: type.kind, icon: type.icon, accent: type.accent,
      tone: problems ? 'crit' : null, badges,
    });
    const below = steps[i + 1]?.key ?? null;
    if (s.type === 'condition') {
      link(s.key, target(s.whenTrue || 'end', null), 'yes', 'ok');
      link(s.key, target(s.whenFalse || 'end', null), 'no', 'warn');
      return;
    }
    const label = s.type === 'wait' && s.hours ? `after ${s.hours % 24 === 0 ? `${s.hours / 24} d` : `${s.hours} h`}` : GOES_ON[s.type] ?? null;
    link(s.key, target(s.next, below), label, s.type === 'approval' ? 'ok' : null);
    if (s.type === 'approval') {
      const to = !s.onReject || s.onReject === 'end' ? WORKFLOW_REJECTED : target(s.onReject, null);
      link(s.key, to, 'rejected', 'crit', true);
    }
  });
  if (ends) nodes.push({ id: WORKFLOW_END, label: 'Request ends', kind: 'other', icon: 'checkCircle', accent: 'ok' });
  if (rejected) nodes.push({ id: WORKFLOW_REJECTED, label: 'Ends rejected', kind: 'other', icon: 'xCircle', accent: 'crit' });
  return { nodes, edges };
}
