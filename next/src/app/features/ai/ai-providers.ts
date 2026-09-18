/** The providers a model connection can name, and what each needs. */
export interface AiProvider {
  key: string;
  label: string;
  /** Whether a key is needed at all (Ollama runs locally). */
  needsKey: boolean;
  /** Whether the endpoint is built in (blank means the provider's own). */
  builtInEndpoint: boolean;
  endpointHint: string;
  modelHint: string;
}

export const AI_PROVIDERS: AiProvider[] = [
  { key: 'OpenAI', label: 'OpenAI', needsKey: true, builtInEndpoint: true, endpointHint: 'api.openai.com — leave blank', modelHint: 'gpt-4.1-mini' },
  { key: 'Anthropic', label: 'Anthropic', needsKey: true, builtInEndpoint: true, endpointHint: 'api.anthropic.com — leave blank', modelHint: 'claude-sonnet-5' },
  { key: 'Ollama', label: 'Ollama (local)', needsKey: false, builtInEndpoint: true, endpointHint: 'http://host.docker.internal:11434 — leave blank for the local box', modelHint: 'gemma3:4b' },
  { key: 'AzureOpenAI', label: 'Azure OpenAI', needsKey: true, builtInEndpoint: false, endpointHint: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=…', modelHint: 'the deployment name' },
  { key: 'OpenAI-compatible', label: 'OpenAI-compatible (Groq, vLLM, LM Studio…)', needsKey: true, builtInEndpoint: false, endpointHint: 'https://…/v1/chat/completions', modelHint: 'as the server names it' },
];

export function providerOf(key: string | null | undefined): AiProvider {
  return AI_PROVIDERS.find(p => p.key === key) ?? AI_PROVIDERS[AI_PROVIDERS.length - 1];
}

/** A model connection as aiConnection.json/list returns it. */
export interface ModelConnection {
  connectionId: number;
  tenantId?: number | null;
  tenantName?: string | null;
  name: string;
  provider: string;
  apiEndpoint?: string | null;
  apiKeyConfigured?: boolean;
  defaultModel: string;
  isDefault?: boolean;
  maxConcurrency?: number;
  dailyTokenBudget?: number | null;
  status?: string;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestMessage?: string | null;
  models?: string[] | null;
  promptCount?: number;
  runs30d?: number;
  tokensIn30d?: number;
  tokensOut30d?: number;
  tokensToday?: number;
  dateCreated?: string;
  createdBy?: number;
  createdByName?: string | null;
  updatedByName?: string | null;
}
