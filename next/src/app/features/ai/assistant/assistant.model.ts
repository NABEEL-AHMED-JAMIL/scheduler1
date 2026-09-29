import { instantMs } from '../../../core/instant';
import { roleLabel } from '../../../core/auth/auth.models';

/**
 * MIG-252: what ai-service's assistant (MIG-241, aiPrompt.json/assistant/*) and its tool registry
 * (aiPrompt.json/tools/*) answer, and the pure readings the AI Assistant and Tool Registry pages
 * make of it. Nothing here renders: the pages draw these, and the specs pin them.
 */

export type MessageRole = 'user' | 'assistant' | 'tool-summary';
export type CardState = 'pending' | 'confirmed' | 'declined' | 'expired';
export type Tone = 'ok' | 'warn' | 'crit' | 'neutral';

export interface Conversation {
  conversationId: number;
  tenantId?: number | null;
  title: string;
  status?: string;
  messageCount?: number;
  createdBy?: number;
  dateCreated?: string;
  dateUpdated?: string;
}

/** A write the assistant wants to make: nothing runs until the person decides. */
export interface ConfirmCard {
  actionId: string;
  tool: string;
  arguments: Record<string, unknown> | null;
  summary: string;
  /** Naive: Chicago wall-clock, like every naive timestamp on the platform. */
  expiresAt: string | null;
  state: CardState;
}

export interface AssistantLink {
  kind: 'execution' | 'output' | 'file' | 'dataset' | string;
  jobId?: number;
  jobName?: string;
  jobQueueId?: number;
  status?: string;
  startTime?: string;
  bucket?: string;
  folder?: string;
  note?: string;
  tool?: string;
  key?: string;
  fileName?: string;
  format?: string;
  size?: number;
  datasetRef?: string;
}

/** A pipeline the assistant drafted: shown, copied or opened in the step builder -- never saved from here. */
export interface PipelineDraft {
  kind: 'pipeline-draft' | string;
  name?: string;
  format?: 'yaml' | 'json' | string;
  text: string;
  pipelineKey?: number | null;
  valid?: boolean;
  problems?: (string | { message?: string; path?: string })[] | null;
  saved?: boolean;
}

export interface AssistantMessage {
  messageId: number;
  conversationId: number;
  seq: number;
  role: MessageRole;
  content: string | null;
  toolRunId: number | null;
  runStatus: string | null;
  card: ConfirmCard | null;
  links: AssistantLink[];
  artifact: PipelineDraft | null;
  dateCreated?: string;
}

/** send and decide both answer this: the conversation, the messages they added, and the run. */
export interface AssistantAnswer {
  conversation: Conversation;
  messages: AssistantMessage[];
  run?: { toolRunId: number | null; status: string } | null;
}

export interface ToolCall {
  callId: number;
  toolRunId: number;
  seq: number;
  toolName: string;
  toolKind: 'read' | 'write' | string;
  /** Masked by the server: a secret never comes back. */
  arguments: string | null;
  outcome: string;
  reason?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  resultBytes?: number | null;
  resultRows?: number | null;
  summary?: string | null;
  dateCreated?: string;
}

export interface ToolRun {
  toolRunId: number;
  connectionId?: number | null;
  model?: string | null;
  question?: string | null;
  status: string;
  error?: string | null;
  toolCallCount?: number;
  dateCreated?: string;
}

export interface ToolTrace {
  run: ToolRun;
  calls: ToolCall[];
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  kind: 'read' | 'write' | string;
  requiresConfirmation: boolean;
  requiredRole: string;
  page: string | null;
  coreTask: string | null;
  returnsDatasetReference: boolean;
  parameters: { type?: string; required?: string[]; properties?: Record<string, { type?: string | string[] }> } | null;
  available: boolean;
  unavailableReason: string | null;
  enabledInWorkspace: boolean;
  switchedInWorkspace: boolean;
  youMayUse: boolean;
}

// ------------------------------------------------------------------------------------------ content

export type ContentBlock = { kind: 'text'; text: string } | { kind: 'code'; lang: string; text: string };

/**
 * A model's answer as text and fenced code. Nothing is parsed as markup: the page prints text as
 * text and code in a <pre>, so whatever the model writes can never become HTML on the page.
 */
export function contentBlocks(content: string | null | undefined): ContentBlock[] {
  const text = content ?? '';
  if (!text.trim()) return [];
  const blocks: ContentBlock[] = [];
  const lines = text.split('\n');
  let buffer: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    const body = buffer.join('\n');
    if (fence !== null) blocks.push({ kind: 'code', lang: fence, text: body });
    else if (body.trim()) blocks.push({ kind: 'text', text: body.trim() });
    buffer = [];
  };
  for (const line of lines) {
    const open = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (open) {
      if (fence === null) { flush(); fence = open[1] ?? ''; }
      else { flush(); fence = null; }
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

// ------------------------------------------------------------------------------------- conversation

/** The thread with `added` merged in: one message per id, in the server's order. */
export function mergeMessages(current: readonly AssistantMessage[], added: readonly AssistantMessage[]): AssistantMessage[] {
  const byId = new Map<number, AssistantMessage>();
  for (const m of current) byId.set(m.messageId, m);
  for (const m of added) byId.set(m.messageId, m);
  return [...byId.values()].sort((a, b) => a.seq - b.seq || a.messageId - b.messageId);
}

/** The card the person just decided, marked on the message that asked (decide adds new messages; it does not resend that one). */
export function withDecision(list: readonly AssistantMessage[], actionId: string, approve: boolean): AssistantMessage[] {
  return list.map(m => m.card?.actionId === actionId
    ? { ...m, card: { ...m.card, state: approve ? 'confirmed' : 'declined' } }
    : m);
}

/** The messages that show a run's tool calls: the last assistant message of each run, so a trace appears once. */
export function traceOwners(list: readonly AssistantMessage[]): Set<number> {
  const last = new Map<number, number>();
  for (const m of list) if (m.role === 'assistant' && m.toolRunId != null) last.set(m.toolRunId, m.messageId);
  return new Set(last.values());
}

// ---------------------------------------------------------------------------------------- the card

export interface CardView {
  /** Still waiting for a decision, and not past its expiry: the buttons show. */
  open: boolean;
  state: string;
  tone: Tone;
  args: [string, string][];
}

const CARD_STATES: Record<CardState, { state: string; tone: Tone }> = {
  pending: { state: 'Waiting for you', tone: 'warn' },
  confirmed: { state: 'Confirmed', tone: 'ok' },
  declined: { state: 'Declined', tone: 'neutral' },
  expired: { state: 'Expired', tone: 'neutral' },
};

export function cardView(card: ConfirmCard, now = Date.now()): CardView {
  const expires = instantMs(card.expiresAt);
  const lapsed = card.state === 'pending' && expires != null && expires <= now;
  const look = CARD_STATES[lapsed ? 'expired' : card.state] ?? { state: sentence(card.state), tone: 'neutral' as Tone };
  const args = Object.entries(card.arguments ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string]);
  return { open: card.state === 'pending' && !lapsed, state: look.state, tone: look.tone, args };
}

const CONFIRM_LABELS: Record<string, string> = {
  run_pipeline: 'Run pipeline', save_file: 'Save file', delete_file: 'Delete file', create_pdf: 'Create PDF',
};

export function confirmLabel(tool: string): string {
  return CONFIRM_LABELS[tool] ?? 'Confirm';
}

// ------------------------------------------------------------------------------------------- links

/** An execution's run page (MIG-251), or the schedule's executions when the run is not known yet. */
export function runLink(link: AssistantLink): (string | number)[] | null {
  if (link.jobId == null) return null;
  return link.jobQueueId != null
    ? ['/pipelines/schedules', link.jobId, 'runs', link.jobQueueId, 'logs']
    : ['/pipelines/schedules', link.jobId, 'executions'];
}

/** Browse files at an output's folder, or at the folder a file sits in. */
export function filesLink(link: AssistantLink): { bucket: string; prefix: string } | null {
  if (!link.bucket) return null;
  if (link.kind === 'file') {
    if (!link.key) return null;
    const cut = link.key.lastIndexOf('/');
    return { bucket: link.bucket, prefix: cut < 0 ? '' : link.key.slice(0, cut + 1) };
  }
  return { bucket: link.bucket, prefix: link.folder ?? '' };
}

// ------------------------------------------------------------------------------------------- trace

const OUTCOMES: Record<string, { label: string; tone: Tone }> = {
  allowed: { label: 'Allowed', tone: 'ok' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  pending: { label: 'Waiting for you', tone: 'warn' },
  refused: { label: 'Refused', tone: 'crit' },
  blocked: { label: 'Blocked', tone: 'crit' },
  failed: { label: 'Failed', tone: 'crit' },
  declined: { label: 'Declined', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
};

export function outcomeLook(outcome: string | null | undefined): { label: string; tone: Tone } {
  return OUTCOMES[(outcome ?? '').toLowerCase()] ?? { label: sentence(outcome ?? ''), tone: 'neutral' };
}

/** Each tool's newest call among the traces read: the registry's "Last used". */
export function lastUsedByTool(traces: readonly (readonly ToolCall[])[]): Record<string, string> {
  const last: Record<string, string> = {};
  for (const calls of traces) {
    for (const call of calls) {
      if (!call.dateCreated) continue;
      const seen = last[call.toolName];
      if (!seen || (instantMs(call.dateCreated) ?? 0) > (instantMs(seen) ?? 0)) last[call.toolName] = call.dateCreated;
    }
  }
  return last;
}

// ---------------------------------------------------------------------------------------- registry

/**
 * Whether a tool can be called here, and why not: the platform first (no service behind it), then
 * the workspace's switch, then the person (role or access profile). Blocked is what the assistant
 * would be refused with; Off is an administrator's choice.
 */
export function toolState(t: ToolDef): { label: string; tone: Tone; reason: string } {
  if (!t.available) return { label: 'Blocked', tone: 'crit', reason: t.unavailableReason || 'Not available on this platform yet.' };
  if (!t.enabledInWorkspace) return { label: 'Off', tone: 'neutral', reason: 'Switched off in this workspace.' };
  if (!t.youMayUse) {
    const role = t.requiredRole && t.requiredRole !== 'TENANT_USER' ? `Needs the ${roleLabel(t.requiredRole)} role.` : 'Your access profile does not include its page.';
    return { label: 'Blocked', tone: 'crit', reason: role };
  }
  return { label: 'Enabled', tone: 'ok', reason: '' };
}

/** The tools the assistant may call for this person, here. */
export function allowedTools(tools: readonly ToolDef[]): ToolDef[] {
  return tools.filter(t => t.available && t.enabledInWorkspace && t.youMayUse);
}

/** The allowed tools that ask before they act. */
export function askFirstNames(tools: readonly ToolDef[]): string[] {
  return allowedTools(tools).filter(t => t.requiresConfirmation).map(t => t.name);
}

const SERVICES: Record<string, string> = {
  sources: 'Sources', 'api-collections': 'API collections', objects: 'Storage', jobs: 'Pipelines',
  reports: 'Reports', 'tools-converter': 'Document converter',
};

/** The service a tool calls, as the console names its pages; a step task with no page runs in the pipeline engine. */
export function serviceOf(t: ToolDef): string {
  if (t.page) return SERVICES[t.page] ?? t.page;
  return t.coreTask ? 'Pipeline engine' : '—';
}

/** Input → output: its parameters (required first, an optional one marked ?) and what comes back. */
export function ioOf(t: ToolDef): { input: string; output: string } {
  const props = Object.keys(t.parameters?.properties ?? {});
  const required = new Set(t.parameters?.required ?? []);
  const names = [...props.filter(p => required.has(p)), ...props.filter(p => !required.has(p)).map(p => `${p}?`)];
  const output = t.returnsDatasetReference ? 'dataset ref' : t.kind === 'write' ? 'result' : 'list';
  return { input: names.length ? names.join(', ') : 'none', output };
}

function sentence(text: string): string {
  const words = text.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '—';
}
