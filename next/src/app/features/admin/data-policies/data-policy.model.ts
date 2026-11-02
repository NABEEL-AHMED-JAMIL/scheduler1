import { ModelConnection } from '../../ai/ai-providers';
import { CatalogModel, catalogEntry, isCloudName, modelsFor } from '../../ai/model-catalog/model-catalog';
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
    explain: 'Local models, and hosted models only on a connection a workspace administrator has marked as covered by a signed Business Associate Agreement (BAA). A hosted connection without the mark is refused.' },
  { value: 'local', label: 'Local only', short: 'Local only',
    explain: 'Only models that run on your own machines: an Ollama connection at your own network\'s address, with a model the platform\'s list calls local. Never a hosted provider, and never an Ollama cloud model.' },
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
  connectionName: string;
  model: string | null;
  /** The model's name on the platform's list (its display name); the connection's for "any listed model". */
  label: string;
  local: boolean;
  baa: boolean;
}

/**
 * A connection runs on your own machines when it is Ollama at this network's address (none, a name without dots, a
 * local name or a private IP) -- ai-service's own test (TenantDataPolicy.isLocal). Any other is hosted.
 */
export function isLocalConnection(c: Pick<ModelConnection, 'provider'> & { apiEndpoint?: string | null }): boolean {
  if (c.provider !== 'Ollama') return false;
  const endpoint = (c.apiEndpoint ?? '').trim();
  if (!endpoint) return true;
  let host: string;
  try { host = new URL(endpoint).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (!host) return false;
  if (host === 'localhost' || host === 'host.docker.internal' || /\.(internal|local|localhost)$/.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.includes(':')) return host === '::1' || /^f[cd]/.test(host) || host.startsWith('fe80');
  return !host.includes('.');
}

/**
 * Owner 2026-11-02: each connection of the workspace whole ("any listed model"), then each model on the platform's list
 * that its provider runs and that is switched on. Choosing is not installing: the list is the platform administrator's,
 * and the backend team installs a model. A model the list calls hosted, or an Ollama cloud model, is hosted.
 */
export function modelChoices(connections: ModelConnection[], tenantId: number | null, catalog: CatalogModel[] = []): ModelChoice[] {
  const mine = connections.filter(c => tenantId == null || c.tenantId == null || c.tenantId === tenantId);
  return mine.flatMap(c => {
    const local = isLocalConnection(c);
    const baa = !!c.baaSigned;
    return [
      { value: String(c.connectionId), connectionId: c.connectionId, connectionName: c.name, model: null, label: 'Any listed model', local, baa },
      ...modelsFor(catalog, c.provider).map(m => ({
        value: `${c.connectionId}|${m.modelName}`, connectionId: c.connectionId, connectionName: c.name, model: m.modelName,
        label: m.displayName, local: local && m.local && !isCloudName(m.modelName), baa,
      })),
    ];
  });
}

/** Why a rule keeps a choice from ever being used, or null when it does not. */
export function ruleBlocks(rule: ModelRule, choice: ModelChoice): string | null {
  if (rule === 'local' && !choice.local) return 'Not local';
  if (rule === 'baa' && !choice.local && !choice.baa) return 'No BAA';
  return null;
}

/** A saved entry as a person reads it: by its connection's name and the model's name on the list, when they could be read. */
export function allowedText(entry: string, connections: ModelConnection[], catalog: CatalogModel[] = []): string {
  const [id, ...rest] = entry.split('|');
  const model = rest.length ? rest.join('|') : null;
  const connection = connections.find(c => String(c.connectionId) === id.trim());
  const name = connection?.name ?? `Connection ${id.trim()}`;
  if (!model) return `${name} — any listed model`;
  const listed = connection ? catalogEntry(catalog, connection.provider, model) : null;
  return `${name} · ${listed && listed.displayName !== model ? `${listed.displayName} (${model})` : model}`;
}

/** One line for a level: its rule, its write tools, its retention. */
export function levelSummary(l: PolicyLevel): string {
  const models = l.allowedModels.length ? `, ${l.allowedModels.length} model${l.allowedModels.length === 1 ? '' : 's'}` : '';
  const retention = l.retentionDays == null ? 'pipeline retention' : `${l.retentionDays} day${l.retentionDays === 1 ? '' : 's'}`;
  return `${ruleOf(l.modelRule).short}${models} · write tools ${l.aiWriteTools ? 'on' : 'off'} · ${retention}`;
}
