import { FlowEdge, FlowNode, FlowNodeKind, FlowTone } from '../../../shared/flow-graph/flow-graph.model';

/**
 * AI workflow review (2026-10-12): a pipeline the assistant designed, as ai-service's design_pipeline / edit_pipeline
 * answer it (the message's artifact, kind "pipeline-flow") -- a structured flow checked against the Task Registry, never
 * free text the console parses -- and the pure readings the flow panel and the Create pipeline dialog make of it.
 */

export interface FlowProblem { step?: string | null; path?: string | null; message: string; kind: 'error' | 'setting' | string; }

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

export interface FlowTrigger { type: 'manual' | 'schedule' | 'inbox' | string; every?: string | null; at?: string | null; }

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
  notes?: string[];
  valid: boolean;
  settingsToFill?: number;
  coreChecked?: boolean;
  saved: boolean;
  changes?: string[];
  spec?: unknown;
}

export function isFlow(artifact: unknown): artifact is PipelineFlowArtifact {
  return !!artifact && typeof artifact === 'object' && (artifact as { kind?: string }).kind === 'pipeline-flow'
    && !!(artifact as PipelineFlowArtifact).flow && Array.isArray((artifact as PipelineFlowArtifact).flow.nodes);
}

const KINDS: FlowNodeKind[] = ['trigger', 'read', 'process', 'ai', 'output', 'review', 'legacy', 'other'];

/**
 * The flow as the graph draws it: a step with an error is crit, one with a setting to fill is warn, the trigger and
 * review gate keep their kind's look; each step's badges say what is wrong or missing, in a few words.
 */
export function graphOf(artifact: PipelineFlowArtifact): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = artifact.flow.nodes.map(n => {
    const problems = n.problems ?? [];
    const errors = problems.filter(p => p.kind === 'error');
    const settings = problems.filter(p => p.kind === 'setting');
    const tone: FlowTone | null = errors.length ? 'crit' : settings.length ? 'warn' : null;
    const badges: string[] = [];
    if (errors.length) badges.push(errors.length === 1 ? '1 error' : `${errors.length} errors`);
    if (settings.length) badges.push(settings.length === 1 ? 'needs 1 setting' : `needs ${settings.length} settings`);
    const kind = (KINDS as string[]).includes(n.kind) ? n.kind as FlowNodeKind : 'other';
    return { id: n.id, label: n.label, sub: n.task ?? n.sub ?? null, kind, tone, badges };
  });
  const edges: FlowEdge[] = artifact.flow.edges.map(e => ({ from: e.from, to: e.to, label: e.label ?? null, dashed: !!e.dashed }));
  return { nodes, edges };
}

/** One line on the flow: how many steps, and whether it can be created as it is. */
export function flowVerdict(a: PipelineFlowArtifact): { label: string; tone: 'ok' | 'warn' | 'crit' } {
  const errors = a.problems.filter(p => p.kind === 'error').length;
  const settings = a.problems.filter(p => p.kind === 'setting').length;
  if (errors) return { label: errors === 1 ? '1 error' : `${errors} errors`, tone: 'crit' };
  if (settings) return { label: settings === 1 ? '1 setting to fill' : `${settings} settings to fill`, tone: 'warn' };
  return { label: 'Ready to create', tone: 'ok' };
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
