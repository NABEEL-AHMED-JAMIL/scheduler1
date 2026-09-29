/**
 * MIG-248: the Sources page's shapes and the pure rules behind them -- sources (MIG-229), the database connections
 * a source queries, and data contracts (MIG-233), which sit on the same page key.
 *
 * Field names are integration-service's (SourceDtos, ContractDtos, PreviewResult). The service has the last word
 * on every rule here; these catch what it would refuse before it is asked.
 *
 * The business rule the page is built around: a database password is write-only. The service answers
 * `passwordSet` and never the value; the console shows "••• configured" and offers Replace, a box whose value is
 * sent once and nothing else. A connection saved without a typed password keeps the one stored.
 */

// ---------------------------------------------------------------------------------------------- vocabularies

export const SOURCE_KINDS = ['API', 'FILE', 'BUCKET', 'DATABASE'] as const;
export type SourceKind = typeof SOURCE_KINDS[number];

/** What the service reads: JSONL is JSON Lines; Parquet is accepted and not read yet (the preview says so). */
export const FORMATS = ['CSV', 'JSON', 'JSONL', 'PARQUET'] as const;
export const SSL_MODES = ['REQUIRE', 'PREFER', 'DISABLE'] as const;
export const DIRECTIONS = ['IN', 'OUT'] as const;
/** Free text on the service; the levels the data policies are written for. */
export const SENSITIVITIES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PHI'] as const;

const KIND_LABELS: Record<string, string> = { API: 'API', FILE: 'File', BUCKET: 'Bucket folder', DATABASE: 'Database' };
const KIND_ICONS: Record<string, string> = { API: 'plug', FILE: 'file', BUCKET: 'folder', DATABASE: 'database' };
const FORMAT_LABELS: Record<string, string> = { CSV: 'CSV', JSON: 'JSON', JSONL: 'JSON Lines', PARQUET: 'Parquet' };
const SSL_LABELS: Record<string, string> = { REQUIRE: 'Required', PREFER: 'Preferred', DISABLE: 'Off' };
const DIRECTION_LABELS: Record<string, string> = { IN: 'In: a customer\'s payload', OUT: 'Out: our result' };

export const kindLabel = (kind: string | null | undefined) => KIND_LABELS[String(kind ?? '')] ?? String(kind ?? '—');
export const kindIcon = (kind: string | null | undefined) => KIND_ICONS[String(kind ?? '')] ?? 'database';
export const formatLabel = (format: string | null | undefined) => format ? (FORMAT_LABELS[format] ?? format) : '—';
export const sslLabel = (mode: string | null | undefined) => SSL_LABELS[String(mode ?? '')] ?? String(mode ?? '—');
export const directionLabel = (d: string | null | undefined) => DIRECTION_LABELS[String(d ?? '')] ?? String(d ?? '—');

// ---------------------------------------------------------------------------------------------- reads

/** One line of /dataSource.json/list. */
export interface SourceRow {
  id: number;
  uuid?: string;
  tenantId?: number | null;
  /** Filled in by the console for a platform administrator, from the workspace list; the service sends ids only. */
  tenantName?: string | null;
  name: string;
  kind: string;
  format?: string | null;
  status?: string | null;
  lastTestOk?: boolean | null;
  lastTestedAt?: string | null;
  dateCreated?: string | null;
}

/** One inferred field: a dotted path ("images[].file_key"), its type, and whether it may be null or left out. */
export interface SchemaField { path: string; type: string; nullable: boolean; required: boolean; }

/** /dataSource.json/get: one source, whole. Never a credential. */
export interface SourceDetail {
  id: number;
  uuid?: string;
  tenantId?: number | null;
  name: string;
  description?: string | null;
  kind: string;
  format?: string | null;
  requestId?: number | null;
  version?: number | null;
  environmentId?: number | null;
  rowsPath?: string | null;
  storageAlias?: string | null;
  path?: string | null;
  connectionId?: number | null;
  query?: string | null;
  options?: Record<string, unknown> | null;
  schema?: unknown;
  fields?: SchemaField[] | null;
  lastTestOk?: boolean | null;
  lastTestMessage?: string | null;
  lastTestedAt?: string | null;
  status?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  dateCreated?: string | null;
  dateUpdated?: string | null;
}

/**
 * What a test, a preview or a schema answers: the first rows, capped and masked by the service; how many; whether
 * there were more; the schema they suggest. A test's `ok` says whether the source answered at all.
 */
export interface PreviewResult {
  ok: boolean;
  message?: string | null;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  bytes?: number;
  schema?: unknown;
  fields?: SchemaField[];
}

/** A connection as the console reads it: `passwordSet` says whether one is kept -- the value never leaves the service. */
export interface ConnectionRow {
  id: number;
  tenantId?: number | null;
  tenantName?: string | null;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  passwordSet: boolean;
  sslMode: string;
  status?: string | null;
  dateCreated?: string | null;
  dateUpdated?: string | null;
}

/** One of the workspace's Storage Connections, as /storage.json/buckets lists it. A source names it by `bucket`, its alias. */
export interface BucketRow {
  label?: string | null;
  bucket: string;
  provider?: string | null;
  bucketName?: string | null;
  region?: string | null;
  description?: string | null;
  connectionStatus?: string | null;
}

export interface Saved { id: number; uuid?: string; }

// ---------------------------------------------------------------------------------------------- contracts

export interface ContractRow {
  id: number;
  tenantId?: number | null;
  tenantName?: string | null;
  name: string;
  direction: string;
  currentVersion?: number | null;
  activeVersion?: number | null;
  sensitivity?: string | null;
  /** A shared system contract (result_manifest): read and validated against by everyone, changed by no one. */
  system: boolean;
  dateCreated?: string | null;
}

export interface ContractVersionRow { version: number; status: string; createdBy?: number | null; dateCreated?: string | null; }
export interface ContractDetail { contract: ContractRow; versions: ContractVersionRow[]; }

export interface ContractVersionDetail {
  contractId: number;
  name: string;
  version: number;
  status: string;
  schema: unknown;
  fields?: SchemaField[] | null;
  /** Masked by the service. */
  sample?: unknown;
  dateCreated?: string | null;
}

/** A schema proposed from a sample; nothing is saved until the contract is. */
export interface Proposal { schema: unknown; fields: SchemaField[]; sample?: unknown; }

export interface ContractSaved { contractId: number; version: number; status: string; }

/** One reason a payload does not hold: where, which rule, and what -- never the value. */
export interface FieldError { path: string; keyword: string; message: string; }

export interface ValidationResult {
  contractId: number;
  name: string;
  version: number;
  valid: boolean;
  errorCount: number;
  errors: FieldError[];
  validationId?: number | null;
}

export interface TemplateRow { code: string; direction: string; description?: string | null; schema?: unknown; example?: unknown; }

export const isSchemaReadOnly = (c: Pick<ContractRow, 'system'>) => !!c.system;

// ---------------------------------------------------------------------------------------------- the source editor

/** A source as the side panel edits it: every kind's fields, of which the save sends the chosen kind's. */
export interface SourceEdit {
  sourceId: number | null;
  /** A platform administrator's new source names its workspace. */
  tenantId: number | null;
  name: string;
  description: string;
  kind: SourceKind;
  status: string;
  // API
  collectionId: number | null;
  requestId: number | null;
  version: number | null;
  environmentId: number | null;
  rowsPath: string;
  // FILE and BUCKET
  storageAlias: string;
  path: string;
  format: string;
  delimiter: string;
  header: boolean;
  fileRowsPath: string;
  // DATABASE
  connectionId: number | null;
  query: string;
}

export function blankSource(kind: SourceKind = 'FILE'): SourceEdit {
  return {
    sourceId: null, tenantId: null, name: '', description: '', kind, status: 'Active',
    collectionId: null, requestId: null, version: null, environmentId: null, rowsPath: '',
    storageAlias: '', path: '', format: 'CSV', delimiter: '', header: true, fileRowsPath: '',
    connectionId: null, query: '',
  };
}

const text = (v: unknown) => v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);

/** A saved source, opened for editing. An API source's collection is not on it: the panel reads it from the request. */
export function sourceEditOf(d: SourceDetail, collectionId: number | null = null): SourceEdit {
  const kind = ((SOURCE_KINDS as readonly string[]).includes(d.kind) ? d.kind : 'FILE') as SourceKind;
  const options = d.options && typeof d.options === 'object' ? d.options : {};
  return {
    ...blankSource(kind),
    sourceId: d.id, tenantId: d.tenantId ?? null, name: d.name ?? '', description: d.description ?? '', status: d.status || 'Active',
    collectionId, requestId: d.requestId ?? null, version: d.version ?? null, environmentId: d.environmentId ?? null, rowsPath: d.rowsPath ?? '',
    storageAlias: d.storageAlias ?? '', path: d.path ?? '', format: d.format || 'CSV',
    delimiter: text(options['delimiter']), header: options['header'] !== false, fileRowsPath: text(options['rowsPath']),
    connectionId: d.connectionId ?? null, query: d.query ?? '',
  };
}

const READS = /^\s*(select|with|values|table)\b/i;

/** The editor's source as /dataSource.json/save takes it -- only the chosen kind's fields -- or what to fix first. */
export function sourceSaveOf(e: SourceEdit): { body: Record<string, unknown> } | { error: string } {
  const name = e.name.trim();
  if (!name) return { error: 'Give the source a name.' };
  const body: Record<string, unknown> = {
    sourceId: e.sourceId, name, description: e.description.trim() || null, kind: e.kind, status: e.status || 'Active',
  };
  if (e.sourceId == null && e.tenantId != null) body['tenantId'] = e.tenantId;
  const options: Record<string, unknown> = {};
  switch (e.kind) {
    case 'API':
      if (!e.requestId) return { error: 'Pick the API the source calls.' };
      if (!e.version) return { error: 'Pick the collection version the source runs.' };
      Object.assign(body, { requestId: e.requestId, version: e.version, environmentId: e.environmentId, rowsPath: e.rowsPath.trim() || null });
      break;
    case 'FILE':
    case 'BUCKET': {
      const alias = e.storageAlias.trim();
      if (!alias) return { error: 'Pick a storage connection.' };
      const path = e.path.trim();
      if (path.startsWith('/') || path.includes('..') || path.includes('\\')) return { error: 'The path is inside the connection: no leading "/", no "..".' };
      if (e.kind === 'FILE' && (!path || path.endsWith('/'))) return { error: 'A file source names one file; a folder is a Bucket source.' };
      if (!e.format) return { error: 'Pick the files\' format.' };
      if (e.format === 'CSV') {
        if (e.delimiter && !(e.delimiter.length === 1 || e.delimiter === '\\t')) return { error: 'The delimiter is one character (or \\t for a tab).' };
        if (e.delimiter) options['delimiter'] = e.delimiter;
        if (!e.header) options['header'] = false;
      }
      if (e.format === 'JSON' && e.fileRowsPath.trim()) options['rowsPath'] = e.fileRowsPath.trim();
      Object.assign(body, { storageAlias: alias, path, format: e.format });
      break;
    }
    case 'DATABASE':
    default: {
      if (!e.connectionId) return { error: 'Pick a database connection.' };
      const query = e.query.trim();
      if (!query) return { error: 'Write the query the source runs.' };
      if (!READS.test(query)) return { error: 'A source\'s query only reads: start it with SELECT, WITH, VALUES or TABLE.' };
      Object.assign(body, { connectionId: e.connectionId, query });
    }
  }
  body['options'] = options;
  return { body };
}

/** What a source points at, in one line: the storage and path, or the query. An API source's request is named by the page. */
export function sourceTarget(d: Pick<SourceDetail, 'kind' | 'storageAlias' | 'path' | 'query'>): string {
  if (d.kind === 'FILE' || d.kind === 'BUCKET') return [d.storageAlias, d.path || (d.kind === 'BUCKET' ? '(every file)' : '')].filter(Boolean).join(' · ');
  if (d.kind === 'DATABASE') return d.query ?? '';
  return '';
}

// ---------------------------------------------------------------------------------------------- connections

/** A connection as its dialog edits it. `password` is only ever what a person typed, to set or replace one. */
export interface ConnectionEdit {
  connectionId: number | null;
  tenantId: number | null;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  sslMode: string;
  password: string;
  /** Whether the service keeps a password for it (never the value). */
  passwordSet: boolean;
  /** Replace was pressed: what is typed replaces the stored password. */
  replacing: boolean;
}

export function blankConnection(): ConnectionEdit {
  return { connectionId: null, tenantId: null, name: '', host: '', port: '5432', database: '', username: '', sslMode: 'REQUIRE',
    password: '', passwordSet: false, replacing: false };
}

/** A connection from the service, opened for editing: the password box starts empty whatever came back. */
export function connectionEditOf(c: ConnectionRow): ConnectionEdit {
  return { connectionId: c.id, tenantId: c.tenantId ?? null, name: c.name ?? '', host: c.host ?? '', port: String(c.port ?? 5432),
    database: c.database ?? '', username: c.username ?? '', sslMode: c.sslMode || 'REQUIRE', password: '', passwordSet: !!c.passwordSet,
    replacing: false };
}

/** The connection as /dataSource.json/connection/save takes it. The password goes only when one was typed. */
export function connectionSaveOf(e: ConnectionEdit): { body: Record<string, unknown> } | { error: string } {
  if (!e.name.trim()) return { error: 'Give the connection a name.' };
  if (!e.host.trim()) return { error: 'Give the database\'s host.' };
  if (!e.database.trim()) return { error: 'Give the database\'s name.' };
  if (!e.username.trim()) return { error: 'Give the user it signs in as.' };
  const port = Number((e.port || '5432').trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'The port is between 1 and 65535.' };
  const body: Record<string, unknown> = { connectionId: e.connectionId };
  if (e.connectionId == null && e.tenantId != null) body['tenantId'] = e.tenantId;
  Object.assign(body, { name: e.name.trim(), engine: 'POSTGRES', host: e.host.trim(), port, database: e.database.trim(),
    username: e.username.trim(), sslMode: e.sslMode || 'REQUIRE' });
  if (e.password) body['password'] = e.password;
  return { body };
}

// ---------------------------------------------------------------------------------------------- schemas

const typeOf = (node: Record<string, unknown>): { type: string; nullable: boolean } => {
  const t = node['type'];
  if (Array.isArray(t)) {
    const kinds = t.map(String);
    const nullable = kinds.includes('null');
    return { type: kinds.filter(k => k !== 'null').join(' | ') || 'null', nullable };
  }
  if (typeof t === 'string') return { type: t, nullable: false };
  if (Array.isArray(node['enum'])) return { type: 'enum', nullable: false };
  return { type: 'any', nullable: false };
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A schema as a field list: the service's own fields when it sent them, otherwise read from the JSON Schema --
 * properties in order, nested objects as dotted paths, an array's items as "name[].field", required from each level.
 */
export function schemaRows(schema: unknown, fields: SchemaField[] | null | undefined): SchemaField[] {
  if (fields?.length) return fields.map(f => ({ path: f.path, type: f.type, nullable: !!f.nullable, required: !!f.required }));
  if (!isObject(schema)) return [];
  const out: SchemaField[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    const props = isObject(node['properties']) ? node['properties'] : {};
    const required = new Set(Array.isArray(node['required']) ? node['required'].map(String) : []);
    for (const [key, child] of Object.entries(props)) {
      if (!isObject(child)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      out.push({ path, ...typeOf(child), required: required.has(key) });
      if (isObject(child['properties'])) walk(child, path);
      if (isObject(child['items']) && isObject(child['items']['properties'])) walk(child['items'], `${path}[]`);
    }
  };
  walk(schema, '');
  return out;
}

// ---------------------------------------------------------------------------------------------- contract samples

/** A pasted sample: an object, or a list of them. */
export function parseSample(value: string): { value: unknown; error?: undefined } | { value?: undefined; error: string } {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { error: 'Paste a JSON sample first.' };
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return { error: 'The sample is not valid JSON.' }; }
  if (parsed === null || typeof parsed !== 'object') return { error: 'The sample is a JSON object or a list of them.' };
  return { value: parsed };
}

/** A pasted payload to validate: any JSON value (the contract says whether it holds). */
export function parsePayload(value: string): { value: unknown; error?: undefined } | { value?: undefined; error: string } {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { error: 'Paste a JSON payload first.' };
  try { return { value: JSON.parse(trimmed) }; } catch { return { error: 'The payload is not valid JSON.' }; }
}

export const requiredPaths = (fields: readonly SchemaField[]) => fields.filter(f => f.required).map(f => f.path);

/** A contract as its editor holds it before the save. */
export interface ContractEdit {
  contractId: number | null;
  name: string;
  direction: string;
  sensitivity: string;
  schema: unknown;
  required: string[];
  sample: unknown;
  /** Whether the saved version becomes the active one (the service's default: yes). */
  activate?: boolean;
  tenantId?: number | null;
}

const CONTRACT_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,127}$/;

/** v1 of a new contract, or a new version of one, as /dataContract.json/save takes it. */
export function contractSaveOf(e: ContractEdit): { body: Record<string, unknown> } | { error: string } {
  if (!isObject(e.schema)) return { error: 'Propose a schema from a sample first.' };
  const tail = { schema: e.schema, required: e.required, sample: e.sample ?? null, activate: e.activate ?? true };
  if (e.contractId != null) return { body: { contractId: e.contractId, ...tail } };
  const name = e.name.trim();
  if (!CONTRACT_NAME.test(name)) return { error: 'A contract\'s name starts with a letter or digit and holds letters, digits, spaces, "_", "." and "-".' };
  if (!e.direction) return { error: 'Say whether the contract is for what comes in or what goes out.' };
  const body: Record<string, unknown> = { contractId: null };
  if (e.tenantId != null) body['tenantId'] = e.tenantId;
  Object.assign(body, { name, direction: e.direction, sensitivity: e.sensitivity || null, ...tail });
  return { body };
}
