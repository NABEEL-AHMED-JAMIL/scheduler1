import { ModelConnection } from '../../ai/ai-providers';
import { SENSITIVITY_LEVELS, SensitivityLevel } from '../../../shared/ui/sensitivity';

/**
 * A workspace's data policy (MIG-243, ai-service /aiPrompt.json/dataPolicy): for each level of data -- public, internal,
 * sensitive -- which models may see it, how long a run keeps it, and whether the AI Assistant's write tools may act on it.
 * A level the workspace never saved is the level's default (`saved: false`), and that default is what runs today.
 */
export type ModelRule = 'any' | 'baa' | 'local';

export interface PolicyLevel {
  sensitivity: SensitivityLevel;
  modelRule: ModelRule;
  /** "connectionId" (any of its models) or "connectionId|model"; empty: the rule alone decides. */
  allowedModels: string[];
  /** Days a run keeps this level's files; null: the pipeline's own retention. */
  retentionDays: number | null;
  /** Stored for Destinations (MIG-238, deferred): nothing reads it, the page neither shows nor sends it. */
  deliveryOptions?: Record<string, unknown>;
  aiWriteTools: boolean;
  minFieldsWarning: boolean;
  saved: boolean;
}

export interface DataPolicy {
  tenantId?: number;
  levels?: PolicyLevel[] | null;
  /** How a call's level is decided, in the service's words. */
  rule?: string | null;
}

/** One level as the save sends it: whole, but without the delivery options (the service then keeps what it has). */
export type SavedLevel = Omit<PolicyLevel, 'saved' | 'deliveryOptions'>;

export const MAX_RETENTION_DAYS = 3650;

export const MODEL_RULES: { value: ModelRule; label: string; short: string; explain: string }[] = [
  { value: 'any', label: 'Any model', short: 'Any model',
    explain: 'Any of the workspace\'s model connections may see this data, hosted or local.' },
  { value: 'baa', label: 'BAA-signed hosted, or local', short: 'BAA-signed or local',
    explain: 'Local models, and hosted models only on a connection marked as covered by a signed Business Associate Agreement (BAA).' },
  { value: 'local', label: 'Local only', short: 'Local only',
    explain: 'Only models running on your own machines (Ollama connections). The data never goes to a hosted provider.' },
];

export function ruleOf(rule: string | null | undefined) {
  return MODEL_RULES.find(r => r.value === rule) ?? MODEL_RULES[0];
}

/** The level's default, as ai-service's DataPolicyLevel.defaultFor has it -- the live behaviour until a save. */
export function defaultLevel(level: SensitivityLevel): PolicyLevel {
  const sensitive = level === 'sensitive';
  return { sensitivity: level, modelRule: sensitive ? 'local' : 'any', allowedModels: [], retentionDays: null,
    aiWriteTools: !sensitive, minFieldsWarning: true, saved: false };
}

/** The three levels in order, each as the service sent it or its default when it sent none. */
export function levelsOf(policy: DataPolicy | null | undefined): PolicyLevel[] {
  const sent = policy?.levels ?? [];
  return SENSITIVITY_LEVELS.map(level => {
    const l = sent.find(s => s?.sensitivity === level);
    if (!l) return defaultLevel(level);
    return { ...l, allowedModels: [...(l.allowedModels ?? [])], retentionDays: l.retentionDays ?? null,
      aiWriteTools: l.aiWriteTools !== false, minFieldsWarning: l.minFieldsWarning !== false, saved: !!l.saved };
  });
}

export type PolicyState = 'defaults' | 'partly' | 'saved';

export function policyState(levels: PolicyLevel[]): PolicyState {
  const savedCount = levels.filter(l => l.saved).length;
  return savedCount === 0 ? 'defaults' : savedCount === levels.length ? 'saved' : 'partly';
}

// ------------------------------------------------------------------------------------------------ editing

/** A level as the page edits it: the retention as typed, so a wrong value can be shown and named. */
export interface LevelDraft {
  sensitivity: SensitivityLevel;
  modelRule: ModelRule;
  allowedModels: string[];
  retention: string;
  aiWriteTools: boolean;
  minFieldsWarning: boolean;
}

export function draftOf(l: PolicyLevel): LevelDraft {
  return { sensitivity: l.sensitivity, modelRule: l.modelRule, allowedModels: [...l.allowedModels],
    retention: l.retentionDays == null ? '' : String(l.retentionDays), aiWriteTools: l.aiWriteTools, minFieldsWarning: l.minFieldsWarning };
}

/** What is wrong with a draft before it is sent (the service checks the same, and the rest). */
export function draftProblem(d: LevelDraft): string | null {
  const raw = d.retention.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Retention is a whole number of days, or blank.';
  if (n < 1 || n > MAX_RETENTION_DAYS) return `Retention is 1 to ${MAX_RETENTION_DAYS} days, or blank for the pipeline's own.`;
  return null;
}

export function savedLevelOf(d: LevelDraft): SavedLevel {
  const raw = d.retention.trim();
  return { sensitivity: d.sensitivity, modelRule: d.modelRule, allowedModels: [...d.allowedModels],
    retentionDays: raw ? Number(raw) : null, aiWriteTools: d.aiWriteTools, minFieldsWarning: d.minFieldsWarning };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** Whether the draft says anything the level does not. */
export function isChanged(d: LevelDraft, l: PolicyLevel): boolean {
  const next = savedLevelOf(d);
  return next.modelRule !== l.modelRule || !sameSet(next.allowedModels, l.allowedModels) || next.retentionDays !== l.retentionDays
    || next.aiWriteTools !== l.aiWriteTools || next.minFieldsWarning !== l.minFieldsWarning;
}

/**
 * The save: only the levels that changed (a level not sent is left as it is, and an unsaved default stays a default),
 * each whole. `tenantId` is a platform administrator's only -- anyone else's workspace is their own.
 */
export function saveBody(drafts: LevelDraft[], originals: PolicyLevel[], tenantId: number | null): { tenantId?: number; levels: SavedLevel[] } {
  const levels = drafts.filter(d => {
    const original = originals.find(o => o.sensitivity === d.sensitivity);
    return !original || isChanged(d, original);
  }).map(savedLevelOf);
  return tenantId == null ? { levels } : { tenantId, levels };
}

// ------------------------------------------------------------------------------------------------ allowed models

export interface ModelChoice {
  value: string;
  connectionId: number;
  model: string | null;
  label: string;
  local: boolean;
  baa: boolean;
}

/** A connection is local when its provider is Ollama -- ai-service's own test. */
export const isLocalConnection = (c: Pick<ModelConnection, 'provider'>) => c.provider === 'Ollama';

/** Each connection of the workspace whole ("any of its models"), then each model it names. */
export function modelChoices(connections: ModelConnection[], tenantId: number | null): ModelChoice[] {
  const mine = connections.filter(c => tenantId == null || c.tenantId == null || c.tenantId === tenantId);
  return mine.flatMap(c => {
    const local = isLocalConnection(c);
    const baa = !!c.baaSigned;
    const models = [...new Set([c.defaultModel, ...(c.models ?? [])].filter((m): m is string => !!m && !!m.trim()))];
    return [
      { value: String(c.connectionId), connectionId: c.connectionId, model: null, label: `${c.name} — any model`, local, baa },
      ...models.map(m => ({ value: `${c.connectionId}|${m}`, connectionId: c.connectionId, model: m, label: `${c.name} · ${m}`, local, baa })),
    ];
  });
}

/** Why a rule keeps a choice from ever being used, or null when it does not. */
export function ruleBlocks(rule: ModelRule, choice: ModelChoice): string | null {
  if (rule === 'local' && !choice.local) return 'Not local';
  if (rule === 'baa' && !choice.local && !choice.baa) return 'No BAA';
  return null;
}

/** A saved entry as a person reads it: by its connection's name when the connections could be read. */
export function allowedText(entry: string, connections: ModelConnection[]): string {
  const [id, ...rest] = entry.split('|');
  const model = rest.length ? rest.join('|') : null;
  const name = connections.find(c => String(c.connectionId) === id.trim())?.name ?? `Connection ${id.trim()}`;
  return model ? `${name} · ${model}` : `${name} — any model`;
}

/** One line for a level: its rule, its write tools, its retention. */
export function levelSummary(l: PolicyLevel): string {
  const models = l.allowedModels.length ? `, ${l.allowedModels.length} model${l.allowedModels.length === 1 ? '' : 's'}` : '';
  const retention = l.retentionDays == null ? 'pipeline retention' : `${l.retentionDays} day${l.retentionDays === 1 ? '' : 's'}`;
  return `${ruleOf(l.modelRule).short}${models} · write tools ${l.aiWriteTools ? 'on' : 'off'} · ${retention}`;
}
