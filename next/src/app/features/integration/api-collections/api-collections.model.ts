/**
 * MIG-247: the API Collections pages' shapes and the pure rules behind them.
 *
 * Field names are integration-service's, pinned by its contract test
 * (src/test/resources/contract/api-collections-console.json): a rename there breaks this file, and
 * the two are changed together.
 *
 * The business rule the pages are built around: no secret value ever reaches the browser. A secret
 * environment variable comes back as `configured` with no value; the console shows "••• configured"
 * and offers Replace, which sends a new value and nothing else. Credentials in headers, query
 * parameters and a collection's default auth are always {{variable}} references -- the service
 * refuses a literal, and the editor says so before it is asked.
 */

// ---------------------------------------------------------------------------------------------- reads

/** One row of /apiCollection.json/list (and the head of /get). */
export interface CollectionRow {
  collectionId: number;
  collectionUuid?: string;
  tenantId?: number | null;
  /** Filled in by the console for a platform administrator, from the workspace list; the service sends ids only. */
  tenantName?: string | null;
  name: string;
  description?: string | null;
  sourceFormat?: string | null;
  /** MIG-243: the level the service reads it as -- public, internal or sensitive (internal when nothing was given). */
  sensitivity?: string | null;
  /** MIG-243: the word it was given (PHI, CONFIDENTIAL...), kept beside the level; null when none was. */
  sensitivityLabel?: string | null;
  currentVersion?: number | null;
  status?: string | null;
  folderCount?: number;
  requestCount?: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  dateCreated?: string | null;
  dateUpdated?: string | null;
  /**
   * MIG-310: the default auth its APIs inherit, as saved -- secret fields only ever {{variable}} references. Absent when
   * it has none. A save that leaves it out keeps it.
   */
  defaultAuth?: unknown;
}

export interface FolderRow { folderId: number; parentFolderId: number | null; name: string; sortOrder?: number | null; }

/** A request as the collection lists it; the whole definition is RequestDetail. */
export interface RequestRow {
  requestId: number;
  requestUuid?: string;
  folderId: number | null;
  name: string;
  method: string;
  urlTemplate: string;
  authMode: string;
  bodyType?: string;
  timeoutMs?: number | null;
  aiCallable?: boolean;
  aiWriteAllowed?: boolean;
  enabled: boolean;
  sortOrder?: number | null;
}

/** A secret's value is never sent: `value` is null and `configured` says whether one is set. */
export interface VariableRow { key: string; secret: boolean; value: string | null; configured: boolean; }

export interface EnvironmentRow { environmentId: number; name: string; isDefault: boolean; variables: VariableRow[]; }
export interface VersionRow { version: number; createdBy?: number | null; dateCreated?: string | null; }
export interface AccessRow { groupId: number; permission: string; }
export interface ImportRow { importId: number; sourceFormat: string; status: string; dateCreated?: string | null; }

export interface CollectionDetail {
  collection: CollectionRow;
  folders: FolderRow[];
  requests: RequestRow[];
  environments: EnvironmentRow[];
  versions: VersionRow[];
  access: AccessRow[];
  imports: ImportRow[];
}

/** /request/get: the whole definition, as the editor opens it. */
export interface RequestDetail {
  requestId: number;
  requestUuid?: string;
  collectionId: number;
  folderId: number | null;
  name: string;
  description?: string | null;
  method: string;
  urlTemplate: string;
  headers?: unknown;
  queryParams?: unknown;
  bodyType?: string | null;
  bodyTemplate?: string | null;
  authMode?: string | null;
  paramsSchema?: unknown;
  extractRules?: unknown;
  assertRules?: unknown;
  pagination?: unknown;
  timeoutMs?: number | null;
  retry?: unknown;
  aiCallable?: boolean;
  aiWriteAllowed?: boolean;
  enabled?: boolean;
  sortOrder?: number | null;
  collectionVersion?: number | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  dateCreated?: string | null;
  dateUpdated?: string | null;
}

/** Who uses a request: a pipeline, a source or an AI tool, and the version it pinned. */
export interface UsageRow {
  userType: string;
  userRef: string;
  userName?: string | null;
  requestId?: number | null;
  requestName?: string | null;
  pinnedVersion?: number | null;
  currentVersion?: number | null;
  behind?: boolean;
  dateCreated?: string | null;
}

/** /version: one version and its snapshot (never a secret value). */
export interface VersionDetail {
  collectionId: number;
  version: number;
  createdBy?: number | null;
  dateCreated?: string | null;
  snapshot?: { collection?: { defaultAuth?: unknown } | null } | null;
}

export interface Assertion { rule: string; passed: boolean; actual?: string | null; }

/** What one test answered -- masked by the service: nothing here holds a secret the run knew. */
export interface RunResult {
  outcome: 'OK' | 'FAILED' | 'BLOCKED';
  message?: string | null;
  statusCode?: number | null;
  durationMs: number;
  pages: number;
  attempts: number;
  truncated: boolean;
  headers?: Record<string, string>;
  body?: unknown;
  items?: unknown[] | null;
  responseBytes: number;
  extracted?: Record<string, unknown>;
  assertions?: Assertion[];
  callLogIds?: number[];
}

export interface ReportEntry { item: string; note: string; }
export interface ImportReport {
  counts?: { imported?: number; converted?: number; review?: number; skipped?: number };
  imported?: ReportEntry[];
  converted?: ReportEntry[];
  review?: ReportEntry[];
  skipped?: ReportEntry[];
}

/** An import: the collection it made, IMPORTED or REVIEW, and its report. */
export interface ImportResult {
  importId: number;
  collectionId: number;
  version?: number | null;
  sourceFormat: string;
  status: string;
  report?: ImportReport | null;
  createdBy?: number | null;
  dateCreated?: string | null;
}

/** What a save answers. */
export interface Saved { id: number; collectionId: number; version?: number | null; }

// ---------------------------------------------------------------------------------------------- vocabularies

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export const BODY_TYPES = ['NONE', 'JSON', 'TEXT', 'XML', 'FORM_URLENCODED', 'MULTIPART', 'BINARY', 'GRAPHQL'] as const;
export const AUTH_MODES = ['INHERIT', 'NONE', 'BEARER', 'BASIC', 'APIKEY', 'OAUTH2'] as const;
export const PAGING_TYPES = ['NONE', 'PAGE', 'CURSOR', 'LINK'] as const;
/** Free text on the service (32 characters); these are the levels the data policies are written for. */
export const SENSITIVITIES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PHI'] as const;

const AUTH_LABELS: Record<string, string> = {
  INHERIT: 'From the collection', NONE: 'None', BEARER: 'Bearer token', BASIC: 'Basic', APIKEY: 'API key', OAUTH2: 'OAuth2 client credentials',
};
const BODY_LABELS: Record<string, string> = {
  NONE: 'None', JSON: 'JSON', TEXT: 'Text', XML: 'XML', FORM_URLENCODED: 'Form (URL-encoded)', MULTIPART: 'Multipart', BINARY: 'Binary', GRAPHQL: 'GraphQL',
};
const SOURCE_LABELS: Record<string, string> = { MANUAL: 'Made here', POSTMAN: 'Postman', BRUNO: 'Bruno', OPENAPI: 'OpenAPI' };
const SENSITIVITY_LABELS: Record<string, string> = { PUBLIC: 'Public', INTERNAL: 'Internal', CONFIDENTIAL: 'Confidential', PHI: 'PHI' };

export const authLabel = (mode: string | null | undefined) => AUTH_LABELS[String(mode ?? '')] ?? String(mode ?? '—');
export const bodyLabel = (type: string | null | undefined) => BODY_LABELS[String(type ?? '')] ?? String(type ?? '—');
export const sourceLabel = (format: string | null | undefined) => SOURCE_LABELS[String(format ?? '')] ?? String(format ?? '—');
/**
 * The word a collection was given, which is what its save sends (the service reads the level from it again). Since
 * MIG-243 `sensitivity` is the level and `sensitivityLabel` the word -- left out of the answer when none was given, so a
 * missing label is none, never the level (sending the level back would turn "not set" into "internal").
 */
export function sensitivityWord(row: { sensitivityLabel?: string | null }): string | null {
  return row.sensitivityLabel ?? null;
}

export const sensitivityLabel = (level: string | null | undefined) =>
  level ? (SENSITIVITY_LABELS[level.toUpperCase()] ?? level) : 'Not set';

/** The settings each auth scheme reads from the collection's default auth; the secret one is always a {{variable}}. */
export const AUTH_FIELDS: Record<string, { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
  BEARER: [{ key: 'token', label: 'Token', secret: true, placeholder: '{{token}}' }],
  BASIC: [{ key: 'username', label: 'Username', placeholder: '{{username}}' }, { key: 'password', label: 'Password', secret: true, placeholder: '{{password}}' }],
  APIKEY: [{ key: 'key', label: 'Header or parameter name', placeholder: 'X-Api-Key' }, { key: 'value', label: 'Value', secret: true, placeholder: '{{apiKey}}' },
    { key: 'in', label: 'Sent in', placeholder: 'header' }],
  OAUTH2: [{ key: 'tokenUrl', label: 'Token URL', placeholder: 'https://auth.example.com/token' }, { key: 'clientId', label: 'Client id', placeholder: '{{clientId}}' },
    { key: 'clientSecret', label: 'Client secret', secret: true, placeholder: '{{clientSecret}}' }, { key: 'scope', label: 'Scope' }, { key: 'audience', label: 'Audience' }],
};

// ---------------------------------------------------------------------------------------------- pairs

/** A header or query parameter as the editor holds it. */
export interface PairRow { key: string; value: string; enabled: boolean; }

const text = (v: unknown) => v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);

/** Either shape the service stores -- [{key, value, enabled}] or {"Accept": "…"} -- as rows. */
export function toPairs(json: unknown): PairRow[] {
  if (Array.isArray(json)) {
    return json.filter(item => item && typeof item === 'object').map(item => {
      const o = item as Record<string, unknown>;
      return { key: text(o['key'] ?? o['name']), value: text(o['value']), enabled: o['enabled'] !== false };
    });
  }
  if (json && typeof json === 'object') {
    return Object.entries(json as Record<string, unknown>).map(([key, value]) => ({ key, value: text(value), enabled: true }));
  }
  return [];
}

/** Rows as the service takes them: a list of pairs, blank keys dropped, a disabled row kept as disabled. */
export function fromPairs(rows: readonly PairRow[]): { key: string; value: string; enabled?: boolean }[] {
  return rows.filter(r => r.key.trim()).map(r => r.enabled ? { key: r.key.trim(), value: r.value } : { key: r.key.trim(), value: r.value, enabled: false });
}

/** The service's own test (SecretLiterals): a header or parameter whose name says it carries a credential. */
const SECRET_NAME = /(authorization|token|secret|password|passwd|api[-_]?key|cookie|credential|session|signature)/i;
const REFERENCE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/;

/** Whether a value holds a {{variable}} -- "Bearer {{token}}" does -- as the service's own check reads it. */
export const holdsReference = (value: string) => REFERENCE.test(value);

/** The first {{variable}} a value names, or null. */
export function referenceName(value: string): string | null {
  return REFERENCE.exec(value)?.[1] ?? null;
}

/** Pairs whose credential is written in plain text rather than through a {{variable}}. */
export function literalSecrets(rows: readonly PairRow[]): string[] {
  return rows.filter(r => r.key.trim() && SECRET_NAME.test(r.key) && r.value.trim() && !REFERENCE.test(r.value)).map(r => r.key.trim());
}

// ---------------------------------------------------------------------------------------------- JSON fields

/** A JSON field typed by a person: blank is nothing, otherwise an object or a list. */
export function parseJsonField(textValue: string, label: string): { value: unknown; error?: undefined } | { value?: undefined; error: string } {
  const trimmed = (textValue ?? '').trim();
  if (!trimmed) return { value: null };
  let value: unknown;
  try { value = JSON.parse(trimmed); } catch { return { error: `${label} is not valid JSON.` }; }
  if (value === null || typeof value !== 'object') return { error: `${label} must be a JSON object or list.` };
  return { value };
}

const pretty = (json: unknown) => json === null || json === undefined ? '' : JSON.stringify(json, null, 2);

// ---------------------------------------------------------------------------------------------- the request editor

/** A request as the side panel edits it: strings in the inputs, turned back into the contract on save. */
export interface RequestEdit {
  requestId: number | null;
  collectionId: number;
  folderId: number | null;
  name: string;
  description: string;
  method: string;
  urlTemplate: string;
  headers: PairRow[];
  queryParams: PairRow[];
  bodyType: string;
  bodyTemplate: string;
  authMode: string;
  paramsSchema: string;
  extractRules: string;
  assertRules: string;
  timeoutSeconds: string;
  retryAttempts: string;
  retryBackoffMs: string;
  /** Retry settings the editor has no control for, kept as they were. */
  retryExtra: Record<string, unknown>;
  pagingType: string;
  pagingParam: string;
  pagingSizeParam: string;
  pagingSize: string;
  pagingNextPath: string;
  pagingItemsPath: string;
  pagingMaxPages: string;
  /** Paging settings the editor has no control for (start, nextHeader…), kept as they were. */
  pagingExtra: Record<string, unknown>;
  aiCallable: boolean;
  aiWriteAllowed: boolean;
  enabled: boolean;
  sortOrder: number;
}

export function blankRequest(collectionId: number, folderId: number | null = null): RequestEdit {
  return {
    requestId: null, collectionId, folderId, name: '', description: '', method: 'GET', urlTemplate: '',
    headers: [], queryParams: [], bodyType: 'NONE', bodyTemplate: '', authMode: 'INHERIT',
    paramsSchema: '', extractRules: '', assertRules: '', timeoutSeconds: '30',
    retryAttempts: '', retryBackoffMs: '', retryExtra: {},
    pagingType: 'NONE', pagingParam: '', pagingSizeParam: '', pagingSize: '', pagingNextPath: '', pagingItemsPath: '', pagingMaxPages: '',
    pagingExtra: {}, aiCallable: false, aiWriteAllowed: false, enabled: true, sortOrder: 0,
  };
}

const objectOf = (json: unknown): Record<string, unknown> => json && typeof json === 'object' && !Array.isArray(json) ? { ...(json as Record<string, unknown>) } : {};
const take = (o: Record<string, unknown>, key: string): string => { const v = o[key]; delete o[key]; return text(v); };

/** A saved request, opened in the editor. */
export function requestEditOf(d: RequestDetail): RequestEdit {
  const retry = objectOf(d.retry);
  const paging = objectOf(d.pagination);
  const pagingType = take(paging, 'type').toUpperCase() || 'NONE';
  return {
    requestId: d.requestId, collectionId: d.collectionId, folderId: d.folderId ?? null, name: d.name ?? '', description: d.description ?? '',
    method: d.method || 'GET', urlTemplate: d.urlTemplate ?? '', headers: toPairs(d.headers), queryParams: toPairs(d.queryParams),
    bodyType: d.bodyType || 'NONE', bodyTemplate: d.bodyTemplate ?? '', authMode: d.authMode || 'INHERIT',
    paramsSchema: pretty(d.paramsSchema), extractRules: pretty(d.extractRules), assertRules: pretty(d.assertRules),
    timeoutSeconds: d.timeoutMs ? String(d.timeoutMs / 1000) : '30',
    retryAttempts: take(retry, 'maxAttempts'), retryBackoffMs: take(retry, 'backoffMs'), retryExtra: retry,
    pagingType: (PAGING_TYPES as readonly string[]).includes(pagingType) ? pagingType : 'NONE',
    pagingParam: take(paging, 'param'), pagingSizeParam: take(paging, 'sizeParam'), pagingSize: take(paging, 'size'),
    pagingNextPath: take(paging, 'nextPath'), pagingItemsPath: take(paging, 'itemsPath'), pagingMaxPages: take(paging, 'maxPages'),
    pagingExtra: paging, aiCallable: !!d.aiCallable, aiWriteAllowed: !!d.aiWriteAllowed, enabled: d.enabled !== false, sortOrder: d.sortOrder ?? 0,
  };
}

const whole = (s: string): number | null => { const n = Number(s.trim()); return s.trim() && Number.isFinite(n) ? n : null; };

/** The editor's request as /request/save takes it, or what to fix first. */
export function requestSaveOf(e: RequestEdit): { body: Record<string, unknown> } | { error: string } {
  if (!e.name.trim()) return { error: 'Give the API a name.' };
  if (!e.urlTemplate.trim()) return { error: 'Give the API a URL.' };
  const seconds = whole(e.timeoutSeconds || '30');
  if (seconds === null || seconds < 1 || seconds > 300) return { error: 'The timeout is between 1 and 300 seconds.' };
  const literal = [...literalSecrets(e.headers), ...literalSecrets(e.queryParams)];
  if (literal.length) {
    return { error: `${literal.join(', ')} ${literal.length === 1 ? 'holds a credential' : 'hold credentials'} in plain text. Put it in an environment as a secret and write {{name}} here.` };
  }
  if (e.aiWriteAllowed && !e.aiCallable) return { error: 'The AI may write through an API only if it may call it.' };
  const json: Record<string, unknown> = {};
  for (const [key, label] of [['paramsSchema', 'Params schema'], ['extractRules', 'Extract rules'], ['assertRules', 'Assert rules']] as const) {
    const parsed = parseJsonField(e[key], label);
    if (parsed.error) return { error: parsed.error };
    json[key] = parsed.value;
  }
  const retry: Record<string, unknown> = { ...e.retryExtra };
  const attempts = whole(e.retryAttempts), backoff = whole(e.retryBackoffMs);
  if (attempts !== null) retry['maxAttempts'] = attempts;
  if (backoff !== null) retry['backoffMs'] = backoff;
  let pagination: Record<string, unknown> | null = null;
  if (e.pagingType && e.pagingType !== 'NONE') {
    pagination = { type: e.pagingType, ...e.pagingExtra };
    const put = (key: string, value: string, numeric = false) => {
      if (!value.trim()) return;
      pagination![key] = numeric ? (whole(value) ?? value.trim()) : value.trim();
    };
    put('param', e.pagingParam); put('sizeParam', e.pagingSizeParam); put('size', e.pagingSize, true);
    put('nextPath', e.pagingNextPath); put('itemsPath', e.pagingItemsPath); put('maxPages', e.pagingMaxPages, true);
  }
  return {
    body: {
      requestId: e.requestId, collectionId: e.collectionId, folderId: e.folderId, name: e.name.trim(),
      description: e.description.trim() || null, method: e.method, urlTemplate: e.urlTemplate.trim(),
      headers: fromPairs(e.headers), queryParams: fromPairs(e.queryParams),
      bodyType: e.bodyType, bodyTemplate: e.bodyType === 'NONE' ? null : (e.bodyTemplate || null), authMode: e.authMode,
      paramsSchema: json['paramsSchema'], extractRules: json['extractRules'], assertRules: json['assertRules'],
      pagination, timeoutMs: Math.round(seconds * 1000), retry: Object.keys(retry).length ? retry : null,
      aiCallable: e.aiCallable, aiWriteAllowed: e.aiWriteAllowed, enabled: e.enabled, sortOrder: e.sortOrder,
    },
  };
}

// ---------------------------------------------------------------------------------------------- auth

/** A request's scheme against its collection: Inherit is the collection's own (None when it has none). */
export function effectiveAuthMode(mode: string | null | undefined, defaultAuth: unknown): string {
  if (mode && mode !== 'INHERIT') return mode;
  const type = text(objectOf(defaultAuth)['type']).toUpperCase();
  return type && type !== 'INHERIT' && (AUTH_MODES as readonly string[]).includes(type) ? type : 'NONE';
}

/** A scheme's settings from the default auth: its own block ("bearer", …), else the top level. */
export function authSettingsFor(mode: string, defaultAuth: unknown): [string, string][] {
  if (!mode || mode === 'NONE' || mode === 'INHERIT') return [];
  const auth = objectOf(defaultAuth);
  const block = objectOf(auth[mode.toLowerCase()]);
  const source = Object.keys(block).length ? block : auth;
  return Object.entries(source).filter(([k, v]) => k !== 'type' && (v === null || typeof v !== 'object')).map(([k, v]) => [k, text(v)]);
}

// ---------------------------------------------------------------------------------------------- environments

/** A variable as the environment dialog edits it. A secret's `value` is only ever what a person typed to replace it. */
export interface VariableEdit {
  key: string;
  secret: boolean;
  value: string;
  configured: boolean;
  /** Replace was pressed on a stored secret: whatever is typed replaces it. */
  replacing: boolean;
  /** Stored as a secret: turning Secret off discards the sealed value rather than revealing it. */
  wasSecret: boolean;
}

/** Variables from the service, opened for editing -- a secret's value is dropped even if one were ever sent. */
export function variableEdits(rows: readonly VariableRow[]): VariableEdit[] {
  return (rows ?? []).map(r => r.secret
    ? { key: r.key, secret: true, value: '', configured: !!r.configured, replacing: false, wasSecret: true }
    : { key: r.key, secret: false, value: r.value ?? '', configured: !!r.configured, replacing: false, wasSecret: false });
}

/**
 * Variables as /environment/save takes them. A secret goes without a value unless one was typed: the service then
 * keeps the sealed value (or seals the plain one a variable had before it was marked Secret). A typed value -- a
 * replacement, or a new secret's first -- is sent once and nothing else is.
 */
export function variableSaves(rows: readonly VariableEdit[]): { key: string; secret: boolean; value?: string }[] {
  return rows.filter(r => r.key.trim()).map(r => {
    const key = r.key.trim();
    if (!r.secret) return { key, secret: false, value: r.value };
    return r.value ? { key, secret: true, value: r.value } : { key, secret: true };
  });
}

// ---------------------------------------------------------------------------------------------- import

export interface ReportRow { kind: 'Review' | 'Skipped' | 'Converted' | 'Imported'; item: string; note: string; }

/** The report as one table: what needs a person first, then what was left out, then what came across. */
export function reportRows(report: ImportReport | null | undefined): ReportRow[] {
  if (!report) return [];
  const rows = (kind: ReportRow['kind'], list: ReportEntry[] | undefined) => (list ?? []).map(e => ({ kind, item: e.item ?? '', note: e.note ?? '' }));
  return [...rows('Review', report.review), ...rows('Skipped', report.skipped), ...rows('Converted', report.converted), ...rows('Imported', report.imported)];
}

/** Files a Bruno import reads: requests, environments, the collection's own settings. */
const BRUNO_FILE = /\.(bru|json)$/i;

/**
 * A Bruno folder (or loose .bru files) read in the browser, each by its path inside the folder: a picked
 * folder's own name is dropped, since the service reads paths relative to the collection's root.
 */
export async function brunoFiles(files: readonly File[]): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const path = relative.includes('/') ? relative.slice(relative.indexOf('/') + 1) : (relative || file.name);
    if (!BRUNO_FILE.test(path)) continue;
    out.push({ path, content: await file.text() });
  }
  return out;
}
