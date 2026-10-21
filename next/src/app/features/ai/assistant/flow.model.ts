import { FlowEdge, FlowNode } from '../../../shared/flow-graph/flow-graph.model';
import { PipelineTaskLike, aiFlowGraph } from '../../../shared/flow-graph/flow-adapters';

/**
 * AI workflow review (2026-10-12): a pipeline the assistant designed, as ai-service's design_pipeline / edit_pipeline
 * answer it (the message's artifact, kind "pipeline-flow") -- a structured flow checked against the Task Registry, never
 * free text the console parses -- and the pure readings the flow panel and the Create pipeline dialog make of it.
 */

/** error: the definition is wrong; setting: a required setting to fill; warning: it can be created, but does not do what it reads as. */
export interface FlowProblem { step?: string | null; path?: string | null; message: string; kind: 'error' | 'setting' | 'warning' | string; }

/** The pipeline Create pipeline made from this conversation's flow (recorded on the flow by ai-service). */
export interface CreatedFlow { pipelineKey: number; pipelineId?: string | null; taskDetailId?: number | null; jobId?: number | null; name?: string | null;
  version?: number | null; }

export interface FlowNodeSpec {
  id: string;
  kind: string;
  label: string;
  sub?: string | null;
  task?: string | null;
  service?: string | null;
  /** What the step does, from the Task Registry. */
  does?: string | null;
  /** Its settings in one line. */
  settings?: string | null;
  config?: Record<string, unknown> | null;
  onError?: string | null;
  problems?: FlowProblem[];
}

/** What starts a designed pipeline's runs; document (ZT-I1): an approved document of the type, as a job's document trigger (MIG-364). */
export interface FlowTrigger { type: 'manual' | 'schedule' | 'inbox' | 'document' | string; every?: string | null; at?: string | null; documentTypeId?: number | null; }

export interface FlowDefinitionStep {
  key: string;
  name?: string;
  task: string;
  input?: string;
  config?: Record<string, unknown>;
  onError?: string;
}

export interface FlowDefinition {
  version: number;
  source?: { type: string };
  steps: FlowDefinitionStep[];
  settings?: { review?: { required: string[] } } & Record<string, unknown>;
}

export interface PipelineFlowArtifact {
  kind: 'pipeline-flow';
  name: string;
  description?: string | null;
  pipelineKey?: number | null;
  taskDetailId?: number | null;
  trigger: FlowTrigger;
  flow: { nodes: FlowNodeSpec[]; edges: { from: string; to: string; label?: string | null; dashed?: boolean }[]; direction?: string };
  definition: FlowDefinition;
  problems: FlowProblem[];
  /** What the check moved or left out, worked out again on every edit: shown under the flow. */
  notes?: string[];
  valid: boolean;
  settingsToFill?: number;
  warnings?: number;
  /** Created from this conversation: an edit is an update of that pipeline (a new version), never a second pipeline. */
  created?: CreatedFlow | null;
  coreChecked?: boolean;
  saved: boolean;
  changes?: string[];
  spec?: unknown;
}

export function isFlow(artifact: unknown): artifact is PipelineFlowArtifact {
  return !!artifact && typeof artifact === 'object' && (artifact as { kind?: string }).kind === 'pipeline-flow'
    && !!(artifact as PipelineFlowArtifact).flow && Array.isArray((artifact as PipelineFlowArtifact).flow.nodes);
}

/**
 * The flow as the graph draws it: the shared AI-flow adapter (shared/flow-graph), so the step builder's Flow view, the
 * Workflow designer, the run map and this panel draw one way. A step with an error is crit, one with a setting to fill
 * is warn; edges between steps follow the engine's own rule, so a join or an append draws its other inputs.
 */
export function graphOf(artifact: PipelineFlowArtifact, tasks?: readonly PipelineTaskLike[] | null): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return aiFlowGraph(artifact, tasks);
}

/**
 * One line on the flow: how many steps, and whether it can be created as it is. A warning (an aggregate with no groupBy
 * collapses every row into one; two reviews) is never "Ready to create": it says so, in the flow's own words, below.
 */
export function flowVerdict(a: PipelineFlowArtifact): { label: string; tone: 'ok' | 'warn' | 'crit' } {
  const errors = a.problems.filter(p => p.kind === 'error').length;
  const settings = a.problems.filter(p => p.kind === 'setting').length;
  const warnings = a.problems.filter(p => p.kind === 'warning').length;
  if (errors) return { label: errors === 1 ? '1 error' : `${errors} errors`, tone: 'crit' };
  if (settings) return { label: settings === 1 ? '1 setting to fill' : `${settings} settings to fill`, tone: 'warn' };
  if (warnings) return { label: warnings === 1 ? 'Check 1 warning' : `Check ${warnings} warnings`, tone: 'warn' };
  return { label: a.created && a.saved ? 'Created' : 'Ready to create', tone: 'ok' };
}

/** What starts the pipeline, in words for the Create dialog: when it really runs once created. */
export function triggerWhen(t: FlowTrigger, startDate: string): string {
  if (t.type === 'schedule') {
    const at = t.at ? ` at ${t.at}` : '';
    const every = t.every === 'hour' ? 'every hour' : t.every === 'week' ? 'every week (Mondays)' : t.every === 'month' ? 'every month (on the 1st)'
      : 'every day';
    return `It runs ${every}${at} (America/Chicago), from ${startDate}.`;
  }
  if (t.type === 'inbox') return 'It runs when a file lands in its inbox.';
  if (t.type === 'document') return 'It runs when a document of its type is approved, once per document.';
  return 'Nothing runs until you press Run now.';
}

/** The required settings the design left empty: what the Create dialog asks for, per step. */
export function settingsToFill(a: PipelineFlowArtifact): { step: string; name: string }[] {
  const out: { step: string; name: string }[] = [];
  for (const p of a.problems) {
    if (p.kind !== 'setting' || !p.step) continue;
    const name = /needs a setting: ([A-Za-z0-9_]+)/.exec(p.message)?.[1] ?? '';
    if (name && !out.some(o => o.step === p.step && o.name === name)) out.push({ step: p.step, name });
  }
  return out;
}

/** The definition with a step's settings replaced: what the inspector and the Create dialog edit, never the artifact itself. */
export function withStepConfig(definition: FlowDefinition, key: string, config: Record<string, unknown>): FlowDefinition {
  return { ...definition, steps: definition.steps.map(s => (s.key === key ? { ...s, config: { ...config } } : s)) };
}

/** A pipeline id Core accepts (upper snake case, at most 40), from the flow's name. */
export function pipelineIdOf(name: string, suffix = ''): string {
  const base = (name || 'AI pipeline').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'AI_PIPELINE';
  return suffix ? `${base}_${suffix}`.slice(0, 40) : base;
}

/** The newest flow in a conversation's messages: what the panel shows unless the person picked another. */
export function newestFlow(messages: readonly { messageId: number; artifact?: unknown }[]): { messageId: number; flow: PipelineFlowArtifact } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const a = messages[i].artifact;
    if (isFlow(a)) return { messageId: messages[i].messageId, flow: a };
  }
  return null;
}
