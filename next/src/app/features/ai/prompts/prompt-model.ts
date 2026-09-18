/** A prompt's declared placeholder; `sample` is what Try it runs with. */
export interface PromptVariable {
  name: string;
  type: 'text' | 'number' | 'url' | 'file';
  required: boolean;
  sample?: string | null;
  description?: string | null;
}

/** A prompt as aiPrompt.json returns it. */
export interface Prompt {
  promptId?: number;
  promptUuid?: string;
  tenantId?: number | null;
  tenantName?: string | null;
  name: string;
  description?: string | null;
  connectionId?: number | null;
  connectionName?: string | null;
  provider?: string | null;
  model?: string | null;
  effectiveModel?: string | null;
  systemInstructions?: string | null;
  userTemplate: string;
  variables: PromptVariable[];
  outputMode: 'text' | 'json';
  outputSchema?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  tags?: string | null;
  version?: number;
  status?: string;
  runCount?: number;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  dateCreated?: string;
  createdBy?: number;
  createdByName?: string | null;
  updatedByName?: string | null;
}

/** One call, as aiPrompt.json/try and /runs return it. */
export interface PromptRun {
  runId: number;
  promptId?: number;
  promptVersion?: number;
  kind: 'try' | 'run';
  jobQueueId?: number | null;
  stepTag?: string | null;
  renderedInput?: string | null;
  output?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  attempts?: number;
  status: 'ok' | 'failed';
  error?: string | null;
  dateCreated: string;
}

/** The {{placeholders}} a template names, in order of first appearance. */
export function placeholdersOf(template: string): string[] {
  const names: string[] = [];
  for (const m of (template ?? '').matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}
