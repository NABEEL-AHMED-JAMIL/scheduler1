import { instantOf } from '../../../core/instant';

/** Connector Hub (MIG-289..292): what integration-service's /connectorHub.json answers. Never a secret or a token. */

export type Category = 'DATABASE' | 'SAAS' | 'FILES' | 'API';
export type AuthKind = 'NONE' | 'SECRET' | 'OAUTH';
export type SyncMode = 'FULL' | 'INCREMENTAL' | 'CDC';

export interface ConnectorField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'select' | 'boolean';
  required: boolean;
  secret: boolean;
  help: string | null;
  options: string[];
  placeholder: string | null;
}

export interface ConnectorSpec {
  key: string;
  label: string;
  category: Category;
  summary: string;
  auth: AuthKind;
  oauthProvider: string | null;
  sourceKind: 'table' | 'file' | 'endpoint';
  modes: SyncMode[];
  fields: ConnectorField[];
  available: boolean;
  unavailableReason: string | null;
}

/** One gallery card. */
export interface ConnectorCard {
  spec: ConnectorSpec;
  oauthRegistered: boolean;
  connections: number;
}

export interface Health {
  streams: number;
  rows: number;
  lastSyncAt: string | null;
  lastStatus: string | null;
  failed24h: number;
  schemaPending: boolean;
  lagSeconds: number | null;
  modes: string | null;
  scheduleMinutes: number | null;
}

export interface Connection {
  id: number;
  uuid: string;
  tenantId: number;
  name: string;
  connectorKey: string;
  connectorLabel: string;
  category: Category | null;
  config: Record<string, string | number>;
  secretsSet: string[];
  authKind: AuthKind;
  oauthProvider: string | null;
  oauthStatus: 'PENDING' | 'CONNECTED' | 'REVOKED' | 'DISCONNECTED' | null;
  oauthConnectedAt: string | null;
  targetAlias: string;
  targetPrefix: string | null;
  folder: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  lastErrorFix: string | null;
  lastErrorAt: string | null;
  status: 'Active' | 'Inactive' | 'Delete';
  health: Health | null;
  dateCreated: string;
  dateUpdated: string | null;
}

export interface Column { name: string; type: string | null; }

export interface SchemaChange {
  added: Column[];
  dropped: Column[];
  changed: { name: string; from: string; to: string }[];
  columns: Column[];
  summary: string;
  detectedAt: string;
}

export interface SensitiveColumn { column: string; tag: string; level: string; }

export interface Stream {
  id: number;
  connectionId: number;
  name: string;
  sourceKind: string;
  mode: SyncMode;
  cursorColumn: string | null;
  primaryKey: string | null;
  scheduleMinutes: number | null;
  detectSensitive: boolean;
  registerCatalog: boolean;
  enabled: boolean;
  options: Record<string, unknown>;
  acceptedSchema: Column[] | null;
  pendingSchema: SchemaChange | null;
  sensitiveColumns: SensitiveColumn[] | null;
  stateCursor: string | null;
  stateUpdatedAt: string | null;
  caughtUpAt: string | null;
  lastSyncAt: string | null;
  nextRunAt: string | null;
  runRequested: boolean;
  rowsTotal: number;
  lagSeconds: number | null;
  sourceId: number | null;
  folder: string;
}

export interface SyncRun {
  id: number;
  syncId: string;
  streamId: number;
  stream: string;
  mode: SyncMode;
  trigger: 'MANUAL' | 'SCHEDULE' | 'RESUME';
  status: 'Running' | 'Succeeded' | 'Failed' | 'Interrupted';
  startedAt: string;
  finishedAt: string | null;
  rows: number;
  bytes: number;
  parts: number;
  cursorFrom: string | null;
  cursorTo: string | null;
  targetAlias: string | null;
  targetKey: string | null;
  caughtUp: boolean | null;
  error: string | null;
  errorFix: string | null;
  resumedCount: number;
}

export interface ConnectionDetail {
  connection: Connection;
  streams: Stream[];
  runs: SyncRun[];
}

export interface Dataset {
  name: string;
  kind: string;
  ref: string;
  columns: Column[];
  primaryKey: string[];
  cursorCandidates: string[];
  rowEstimate: number | null;
}

export interface TestResult { ok: boolean; message: string; fix: string | null; }

/** POST /connection/save. secrets: only the ones typed now; left out, the kept one stays. */
export interface ConnectionSave {
  connectionId?: number;
  name: string;
  connectorKey?: string;
  config: Record<string, string | number>;
  secrets?: Record<string, string>;
  targetAlias: string;
  targetPrefix?: string | null;
  status?: string;
}

export interface StreamSave {
  streamId?: number;
  connectionId: number;
  name: string;
  mode: SyncMode;
  cursorColumn?: string | null;
  primaryKey?: string | null;
  scheduleMinutes?: number | null;
  detectSensitive?: boolean;
  registerCatalog?: boolean;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export const CATEGORIES: { id: '' | Category | 'connected'; label: string }[] = [
  { id: '', label: 'All' }, { id: 'DATABASE', label: 'Databases' }, { id: 'SAAS', label: 'SaaS apps' }, { id: 'FILES', label: 'Files' },
  { id: 'API', label: 'APIs' }, { id: 'connected', label: 'Connected' },
];

export function categoryText(category: Category | null | undefined): string {
  switch (category) {
    case 'DATABASE': return 'Database';
    case 'SAAS': return 'SaaS';
    case 'FILES': return 'Files';
    case 'API': return 'API';
    default: return '—';
  }
}

export function categoryIcon(category: Category | null | undefined): string {
  switch (category) {
    case 'DATABASE': return 'database';
    case 'SAAS': return 'cloud';
    case 'FILES': return 'folder';
    case 'API': return 'code';
    default: return 'plug';
  }
}

export function modeText(mode: SyncMode | string | null | undefined): string {
  switch (mode) {
    case 'FULL': return 'Full refresh';
    case 'INCREMENTAL': return 'Incremental';
    case 'CDC': return 'Change capture (CDC)';
    default: return '—';
  }
}

/** "Every 15 min", "Hourly", "Every 6 h", "Daily", "On demand". */
export function scheduleText(minutes: number | null | undefined): string {
  if (!minutes) return 'On demand';
  if (minutes === 1) return 'Every minute';
  if (minutes < 60) return `Every ${minutes} min`;
  if (minutes === 60) return 'Hourly';
  if (minutes < 1440) return minutes % 60 === 0 ? `Every ${minutes / 60} h` : `Every ${minutes} min`;
  if (minutes === 1440) return 'Daily';
  return minutes % 1440 === 0 ? `Every ${minutes / 1440} days` : `Every ${minutes} min`;
}

export const SCHEDULES: { minutes: number | null; label: string }[] = [
  { minutes: null, label: 'On demand' }, { minutes: 1, label: 'Every minute' }, { minutes: 15, label: 'Every 15 min' },
  { minutes: 60, label: 'Hourly' }, { minutes: 360, label: 'Every 6 h' }, { minutes: 1440, label: 'Daily' },
];

/** A lag as people read it: "4 s", "12 min", "3 h", "2 days"; "—" when never caught up. */
export function lagText(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

/** "12 s ago", "5 min ago", "3 h ago", "2 days ago", against now; "—" for never. Times via instantOf (naive = Chicago). */
export function agoText(at: string | null | undefined, now = Date.now()): string {
  const when = instantOf(at);
  if (!when) return '—';
  const seconds = Math.max(0, Math.round((now - when.getTime()) / 1000));
  return seconds < 5 ? 'just now' : `${lagText(seconds)} ago`;
}

/** What a connection's status chip says: Error, Needs you (a revoked or missing grant), Syncing, Paused, Active. */
export type ConnectionState = 'Error' | 'Needs you' | 'Syncing' | 'Paused' | 'Active' | 'Not connected';

export function connectionState(c: Connection): ConnectionState {
  if (c.status === 'Inactive') return 'Paused';
  if (c.authKind === 'OAUTH' && c.oauthStatus !== 'CONNECTED') return c.oauthStatus === 'REVOKED' ? 'Needs you' : 'Not connected';
  if (c.health?.lastStatus === 'Running') return 'Syncing';
  if (c.lastError || c.health?.lastStatus === 'Failed') return 'Error';
  return 'Active';
}

export function stateTone(state: ConnectionState): 'ok' | 'crit' | 'warn' | 'brand' | 'neutral' {
  switch (state) {
    case 'Active': return 'ok';
    case 'Syncing': return 'brand';
    case 'Error': return 'crit';
    case 'Needs you': return 'crit';
    case 'Paused': return 'warn';
    default: return 'neutral';
  }
}

export function stateIcon(state: ConnectionState): string {
  switch (state) {
    case 'Active': return 'checkCircle';
    case 'Syncing': return 'refresh';
    case 'Error': return 'alert';
    case 'Needs you': return 'key';
    case 'Paused': return 'pause';
    default: return 'plug';
  }
}

/** The rows a connection holds, or files for a file connector: "48,210", "1.2M". */
export function countText(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  return n.toLocaleString('en-US');
}

export function runTone(status: SyncRun['status']): 'ok' | 'crit' | 'warn' | 'brand' {
  switch (status) {
    case 'Succeeded': return 'ok';
    case 'Failed': return 'crit';
    case 'Interrupted': return 'warn';
    default: return 'brand';
  }
}

/** The settings a connector's form shows: every non-secret field, then the secret ones. */
export function settingsFields(spec: ConnectorSpec): ConnectorField[] {
  return [...spec.fields.filter(f => !f.secret), ...spec.fields.filter(f => f.secret)];
}

/** Whether a stream's mode needs a cursor column. */
export function needsCursor(mode: SyncMode): boolean {
  return mode !== 'FULL';
}

/** The best cursor for a dataset: what discover suggested first, "modified" for files. */
export function suggestedCursor(dataset: Dataset | undefined, sourceKind: string): string | null {
  if (sourceKind === 'file') return 'modified';
  return dataset?.cursorCandidates?.[0] ?? null;
}

/** The default mode for a new stream: incremental when the connector can and the dataset has a cursor. */
export function suggestedMode(spec: ConnectorSpec, dataset: Dataset | undefined): SyncMode {
  const cursor = suggestedCursor(dataset, spec.sourceKind);
  if (spec.modes.includes('INCREMENTAL') && cursor) return 'INCREMENTAL';
  return 'FULL';
}
