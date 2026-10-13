/**
 * MIG-336: reading the customer API's OpenAPI document (etl-platform docs/api/openapi-v1.yaml) for the developer portal:
 * `$ref`s, the operations grouped by tag, the scopes each needs, its problem types, a field tree of a schema and a JSON
 * example from one.
 *
 * No imports on purpose: scripts/sync-developer-docs.mjs loads this file too (Node strips the types), so the Postman
 * collection's bodies and the reference's examples come from the one generator below.
 */

export interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  pattern?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  example?: unknown;
  examples?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean | Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
}

export interface Parameter {
  $ref?: string;
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Schema;
}

export interface MediaType { schema?: Schema; example?: unknown }

export interface Header { $ref?: string; description?: string; schema?: Schema }

export interface Response {
  $ref?: string;
  description?: string;
  headers?: Record<string, Header>;
  content?: Record<string, MediaType>;
}

export interface RequestBody { $ref?: string; required?: boolean; description?: string; content?: Record<string, MediaType> }

export type SecurityRequirement = Record<string, string[]>;

export interface OperationObject {
  tags?: string[];
  operationId?: string;
  summary?: string;
  description?: string;
  security?: SecurityRequirement[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  deprecated?: boolean;
  'x-signed-link'?: boolean;
}

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type PathItem = Partial<Record<HttpMethod, OperationObject>> & { parameters?: Parameter[] };

/** components['x-problem-types'][kind]: one of the API's problem types, served at /problems/<kind>. */
export interface ProblemTypeObject { status: number; title?: string; description?: string; operations?: string[] }

export interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string; summary?: string; description?: string };
  servers?: { url: string }[];
  security?: SecurityRequirement[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, PathItem>;
  webhooks?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    parameters?: Record<string, Parameter>;
    responses?: Record<string, Response>;
    headers?: Record<string, Header>;
    securitySchemes?: Record<string, { flows?: { clientCredentials?: { tokenUrl?: string; scopes?: Record<string, string> } } }>;
    'x-problem-types'?: Record<string, ProblemTypeObject>;
  };
}

// ------------------------------------------------------------------------------------------------------------ $ref

/** The value a local JSON pointer (`#/components/schemas/Run`) names, or undefined. */
export function resolvePointer(doc: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let at: unknown = doc;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/** The object a `$ref` chain ends at (the value itself when it has none); undefined for a loop or a dangling ref. */
export function deref<T extends { $ref?: string }>(doc: unknown, value: T | undefined): T | undefined {
  let current = value;
  const seen = new Set<string>();
  while (current?.$ref) {
    if (seen.has(current.$ref)) return undefined;
    seen.add(current.$ref);
    current = resolvePointer(doc, current.$ref) as T | undefined;
  }
  return current;
}

/** "Run" for `#/components/schemas/Run`; null for any other ref. */
export function schemaName(ref: string | undefined): string | null {
  const prefix = '#/components/schemas/';
  return ref?.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

/** The types a schema allows, without "null", and whether null is one of them (3.1 `[x, 'null']` or 3.0 `nullable`). */
export function typesOf(schema: Schema): { types: string[]; nullable: boolean } {
  const raw = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const nullable = raw.includes('null') || schema.nullable === true || (schema.enum?.includes(null) ?? false);
  let types = raw.filter(t => t !== 'null');
  if (!types.length && schema.properties) types = ['object'];
  else if (!types.length && schema.items) types = ['array'];
  return { types, nullable };
}

/** Whether a schema is only `null` (one branch of a nullable oneOf). */
export function isNullOnly(doc: unknown, schema: Schema): boolean {
  const s = deref(doc, schema) ?? {};
  const raw = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  return raw.length > 0 && raw.every(t => t === 'null');
}

// --------------------------------------------------------------------------------------------------------- example

export const EXAMPLE_TIME = '2026-10-06T14:00:00Z';
export const EXAMPLE_URI = 'https://portal.example.com/hook';
export const EXAMPLE_ULID = '01JABCDEF0123456789ABCDEFG';

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A file id is a ULID: 26 characters of Crockford's base 32. */
const isUlidPattern = (pattern: string | undefined) => !!pattern && /\{26\}/.test(pattern) && /HJKMNP/.test(pattern);

function stringExample(schema: Schema, name: string): string {
  switch (schema.format) {
    case 'date-time': return EXAMPLE_TIME;
    case 'date': return EXAMPLE_TIME.slice(0, 10);
    case 'uri': case 'url': case 'uri-reference': case 'iri': return EXAMPLE_URI;
    case 'email': return 'someone@example.com';
    case 'uuid': return '6f1c2b8e-3a4d-4c5e-9f00-0a1b2c3d4e5f';
    case 'binary': return '(file)';
    case 'password': return 'secret';
  }
  if (isUlidPattern(schema.pattern) || /^fileId$/.test(name)) return EXAMPLE_ULID;
  if (/^id$|Id$/.test(name)) return '123';
  if (/^url$|Url$/.test(name)) return EXAMPLE_URI;
  if (/email/i.test(name)) return 'someone@example.com';
  return 'string';
}

function numberExample(schema: Schema): number {
  let value = Math.max(1, schema.minimum ?? 1);
  if (schema.maximum !== undefined && value > schema.maximum) value = schema.maximum;
  return value;
}

/**
 * A JSON example of a schema: its example (or first of examples), else its const, else its first enum value, else its
 * default, else a placeholder by format (date-time, uri, a ULID pattern) or by property name (an id is "123"); integers
 * are 1, booleans true, arrays one item, objects every property. allOf merges, oneOf/anyOf takes the first branch that
 * is not null. `name` is the property the schema sits under.
 */
export function exampleFor(doc: unknown, schema: Schema | undefined, name = '', depth = 0, seen: string[] = []): unknown {
  if (!schema || depth > 12) return null;
  if (schema.$ref) {
    if (seen.includes(schema.$ref)) return {};
    return exampleFor(doc, resolvePointer(doc, schema.$ref) as Schema | undefined, name, depth + 1, [...seen, schema.$ref]);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.examples?.length) return schema.examples[0];
  if (schema.const !== undefined) return schema.const;
  const firstEnum = schema.enum?.find(v => v !== null);
  if (firstEnum !== undefined) return firstEnum;
  if (schema.default !== undefined) return schema.default;
  if (schema.allOf?.length) {
    const parts = schema.allOf.map(part => exampleFor(doc, part, name, depth + 1, seen));
    return parts.every(isPlainObject) ? Object.assign({}, ...parts) : parts[0];
  }
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches?.length) {
    const branch = branches.find(b => !isNullOnly(doc, b)) ?? branches[0];
    return exampleFor(doc, branch, name, depth + 1, seen);
  }
  const { types, nullable } = typesOf(schema);
  switch (types[0]) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) out[key] = exampleFor(doc, prop, key, depth + 1, seen);
      return out;
    }
    case 'array': return schema.items ? [exampleFor(doc, schema.items, name, depth + 1, seen)] : [];
    case 'integer': case 'number': return numberExample(schema);
    case 'boolean': return true;
    case 'string': return stringExample(schema, name);
    default: return nullable ? null : {};
  }
}

// ------------------------------------------------------------------------------------------------------ field tree

/** One field of a schema as the reference lists it. */
export interface FieldNode {
  name: string;
  /** What it holds: "string", "integer", "array of Run", "object". */
  type: string;
  /** The components.schemas entry it is (or, for an array, its items are), to link to. */
  ref: string | null;
  required: boolean;
  nullable: boolean;
  description: string;
  format: string | null;
  pattern: string | null;
  enumValues: string[];
  constValue: string | null;
  defaultValue: string | null;
  /** "60 to 900", "at most 128 characters". */
  range: string | null;
  children: FieldNode[];
  /** oneOf/anyOf with more than one branch that is not null: each branch's fields. */
  variants: { label: string; children: FieldNode[] }[];
}

/** A schema with its allOf parts merged into one (properties, required, the first type and description). */
export function mergeAllOf(doc: unknown, schema: Schema, seen: string[] = []): Schema {
  if (!schema.allOf?.length) return schema;
  const merged: Schema = { ...schema, allOf: undefined, properties: { ...(schema.properties ?? {}) }, required: [...(schema.required ?? [])] };
  for (const raw of schema.allOf) {
    if (raw.$ref && seen.includes(raw.$ref)) continue;
    const part = mergeAllOf(doc, deref(doc, raw) ?? {}, raw.$ref ? [...seen, raw.$ref] : seen);
    Object.assign(merged.properties!, part.properties ?? {});
    merged.required!.push(...(part.required ?? []));
    merged.type ??= part.type ?? (part.properties ? 'object' : undefined);
    merged.description ??= part.description;
  }
  return merged;
}

const show = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v);

function rangeOf(schema: Schema): string | null {
  const parts: string[] = [];
  if (schema.minimum !== undefined && schema.maximum !== undefined) parts.push(`${schema.minimum} to ${schema.maximum}`);
  else if (schema.minimum !== undefined) parts.push(`at least ${schema.minimum}`);
  else if (schema.maximum !== undefined) parts.push(`at most ${schema.maximum}`);
  if (schema.maxLength !== undefined) parts.push(`at most ${schema.maxLength} characters`);
  if (schema.minLength !== undefined) parts.push(`at least ${schema.minLength} characters`);
  if (schema.minItems !== undefined) parts.push(`at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : null;
}

function typeLabel(doc: unknown, schema: Schema): string {
  const { types } = typesOf(schema);
  if (types[0] === 'array' && schema.items) {
    const name = schemaName(schema.items.$ref);
    const items = deref(doc, schema.items) ?? {};
    const inner = name ?? (typesOf(mergeAllOf(doc, items)).types.join(' or ') || 'any');
    return `array of ${inner}`;
  }
  if (types.length) return types.join(' or ');
  if (schema.oneOf || schema.anyOf) return 'one of';
  return 'any';
}

/**
 * The fields of a schema, nested: `$ref`s resolved (and named, to link to), allOf merged, a nullable oneOf folded into
 * its one real branch, an array's items' fields under it. A schema already being expanded higher up (a cycle) or deeper
 * than maxDepth is listed without its fields; its link still leads to them.
 */
export function fieldTree(doc: unknown, schema: Schema | undefined, maxDepth = 6): FieldNode {
  return fieldNode(doc, '', schema ?? {}, false, 0, maxDepth, []);
}

function fieldNode(doc: unknown, name: string, raw: Schema, required: boolean, depth: number, maxDepth: number, seen: string[]): FieldNode {
  let ref = schemaName(raw.$ref);
  const nextSeen = raw.$ref ? [...seen, raw.$ref] : seen;
  const cyclic = !!raw.$ref && seen.includes(raw.$ref);
  const target = mergeAllOf(doc, deref(doc, raw) ?? {}, nextSeen);
  const { nullable: typeNullable } = typesOf(target);
  const description = (raw.description ?? target.description ?? '').trim();
  const branches = target.oneOf ?? target.anyOf;
  if (branches?.length && !cyclic) {
    const real = branches.filter(b => !isNullOnly(doc, b));
    const nullable = typeNullable || real.length < branches.length;
    if (real.length === 1) {
      const inner = fieldNode(doc, name, real[0], required, depth, maxDepth, nextSeen);
      return { ...inner, nullable: inner.nullable || nullable, description: description || inner.description };
    }
    const base = leaf(name, 'one of', ref, required, nullable, description, target);
    base.variants = real.map((branch, i) => {
      const node = fieldNode(doc, '', branch, false, depth + 1, maxDepth, nextSeen);
      return { label: node.ref ?? `Option ${i + 1}: ${node.type}`, children: node.children };
    });
    return base;
  }
  const { types } = typesOf(target);
  if (types[0] === 'array' && target.items && !ref) ref = schemaName(target.items.$ref);
  const node = leaf(name, typeLabel(doc, target), ref, required, typeNullable, description, target);
  if (cyclic || depth >= maxDepth) return node;
  if (types[0] === 'object' || target.properties) {
    const req = new Set(target.required ?? []);
    node.children = Object.entries(target.properties ?? {})
      .map(([key, prop]) => fieldNode(doc, key, prop, req.has(key), depth + 1, maxDepth, nextSeen));
  } else if (types[0] === 'array' && target.items) {
    const items = fieldNode(doc, '', target.items, false, depth + 1, maxDepth, nextSeen);
    node.children = items.children;
    node.variants = items.variants;
  }
  return node;
}

function leaf(name: string, type: string, ref: string | null, required: boolean, nullable: boolean, description: string,
              schema: Schema): FieldNode {
  return {
    name, type, ref, required, nullable, description,
    format: schema.format ?? null,
    pattern: schema.pattern ?? null,
    enumValues: (schema.enum ?? []).filter(v => v !== null).map(show),
    constValue: schema.const !== undefined ? show(schema.const) : null,
    defaultValue: schema.default !== undefined ? show(schema.default) : null,
    range: rangeOf(schema),
    children: [],
    variants: [],
  };
}

// ------------------------------------------------------------------------------------------------------ operations

/** Who may call an operation: a token with these scopes, a signed link's own token, or nothing at all. */
export type Access = { kind: 'scopes'; scopes: string[] } | { kind: 'signed' } | { kind: 'none' };

export interface Operation {
  id: string;
  method: HttpMethod;
  /** As the spec writes it, without the /v1 its server adds. */
  path: string;
  tag: string;
  summary: string;
  description: string;
  access: Access;
  parameters: Parameter[];
  requestBody: RequestBody | null;
  responses: { status: string; response: Response }[];
}

export function accessOf(doc: OpenApiDoc, op: OperationObject): Access {
  if (op['x-signed-link']) return { kind: 'signed' };
  const requirements = op.security ?? doc.security ?? [];
  const scopes = requirements.flatMap(r => Object.values(r).flat());
  if (!requirements.length) return { kind: 'none' };
  return { kind: 'scopes', scopes: [...new Set(scopes)] };
}

/** Every operation under `paths`, in the document's order; parameters merged with their path's and `$ref`s resolved. */
export function operationsOf(doc: OpenApiDoc): Operation[] {
  const out: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const own = (op.parameters ?? []).map(p => deref(doc, p)).filter((p): p is Parameter => !!p);
      const inherited = (item.parameters ?? []).map(p => deref(doc, p)).filter((p): p is Parameter => !!p)
        .filter(p => !own.some(o => o.name === p.name && o.in === p.in));
      out.push({
        id: op.operationId ?? `${method} ${path}`,
        method,
        path,
        tag: op.tags?.[0] ?? 'other',
        summary: op.summary ?? '',
        description: (op.description ?? '').trim(),
        access: accessOf(doc, op),
        parameters: [...inherited, ...own],
        requestBody: deref(doc, op.requestBody) ?? null,
        responses: Object.entries(op.responses ?? {})
          .map(([status, r]) => ({ status, response: deref(doc, r) ?? {} }))
          .sort((a, b) => a.status.localeCompare(b.status)),
      });
    }
  }
  return out;
}

export interface TagGroup { name: string; description: string; operations: Operation[] }

/** Operations by their first tag, in the spec's tag order; a tag the list does not declare comes after, as met. */
export function groupByTag(doc: OpenApiDoc, operations: Operation[]): TagGroup[] {
  const groups = (doc.tags ?? []).map(t => ({ name: t.name, description: t.description ?? '', operations: [] as Operation[] }));
  for (const op of operations) {
    let group = groups.find(g => g.name === op.tag);
    if (!group) groups.push(group = { name: op.tag, description: '', operations: [] });
    group.operations.push(op);
  }
  return groups.filter(g => g.operations.length);
}

/** Whether an operation matches the reference's filter: its path, summary or operationId (case-insensitive). */
export function matchesFilter(op: Operation, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return [op.path, `/v1${op.path}`, op.summary, op.id, op.method].some(s => s.toLowerCase().includes(t));
}

export interface HeaderRow { name: string; description: string; type: string }

/** A response's headers, `$ref`s resolved. */
export function headersOf(doc: unknown, response: Response): HeaderRow[] {
  return Object.entries(response.headers ?? {}).map(([name, raw]) => {
    const header = deref(doc, raw) ?? {};
    const schema = deref(doc, header.schema) ?? {};
    return { name, description: (header.description ?? '').trim(), type: typeLabel(doc, schema) };
  });
}

/** The RateLimit-* headers every counted call answers, from components.headers. */
export function rateLimitHeaders(doc: OpenApiDoc): HeaderRow[] {
  return Object.entries(doc.components?.headers ?? {})
    .filter(([name]) => /^RateLimit-/.test(name))
    .map(([name, header]) => ({ name, description: (header.description ?? '').trim(), type: typeLabel(doc, deref(doc, header.schema) ?? {}) }));
}

// --------------------------------------------------------------------------------------------------- problem types

export interface ProblemType { kind: string; status: number; title: string; description: string; operations: string[] | null }

export function problemTypesOf(doc: OpenApiDoc): ProblemType[] {
  return Object.entries(doc.components?.['x-problem-types'] ?? {}).map(([kind, p]) => ({
    kind,
    status: Number(p.status),
    title: p.title ?? kind,
    description: (p.description ?? '').trim(),
    operations: p.operations?.length ? p.operations : null,
  }));
}

/** The problem types an operation can answer: one of its error statuses, and it is named or the type names none. */
export function problemsFor(doc: OpenApiDoc, op: Operation): ProblemType[] {
  const statuses = new Set(op.responses.map(r => Number(r.status)).filter(s => s >= 400));
  return problemTypesOf(doc).filter(p => statuses.has(p.status) && (!p.operations || p.operations.includes(op.id)));
}
