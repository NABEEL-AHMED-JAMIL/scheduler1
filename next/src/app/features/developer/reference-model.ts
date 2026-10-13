import { GuideBlock, parseGuide } from './guide-markdown';
import {
  Access, FieldNode, HeaderRow, OpenApiDoc, Operation, ProblemType, Schema, TagGroup, deref, exampleFor, fieldTree, groupByTag, headersOf,
  operationsOf, problemTypesOf, problemsFor, rateLimitHeaders, schemaName,
} from './openapi';

/**
 * MIG-336: what the API reference page draws, worked out once from the bundled spec: per operation its parameters,
 * body, responses with their headers, the problem types it can answer and a curl call with a JSON answer to copy.
 */

export interface ParamRow { name: string; in: string; required: boolean; type: string; pattern: string | null; defaultValue: string | null; description: string }

export interface BodyView { contentType: string; required: boolean; tree: FieldNode; example: string | null; exampleLang: string }

export interface ResponseView {
  status: string;
  tone: string;
  description: string;
  headers: HeaderRow[];
  contentType: string | null;
  /** The named schema of an answer (Problem, Run), to link to. */
  schema: string | null;
  tree: FieldNode | null;
  example: string | null;
}

export interface OperationView {
  op: Operation;
  anchor: string;
  methodClass: string;
  description: GuideBlock[];
  access: Access;
  params: ParamRow[];
  body: BodyView | null;
  responses: ResponseView[];
  errors: { status: string; description: string; problems: ProblemType[] }[];
  problems: ProblemType[];
  /** The call counts against the rate limits, so its answers carry the RateLimit-* headers. */
  rateLimited: boolean;
  curl: string;
}

export interface TagView { name: string; description: string; operations: OperationView[] }

export interface SchemaView { name: string; description: string; tree: FieldNode; example: string }

export interface EventView { type: string; description: string; tree: FieldNode; example: string }

export interface ReferenceModel {
  title: string;
  version: string;
  tags: TagView[];
  schemas: SchemaView[];
  events: EventView[];
  receiver: { summary: string; description: GuideBlock[]; headers: ParamRow[] } | null;
  problems: ProblemType[];
  rateLimitHeaders: HeaderRow[];
  /** Every header components.headers names (RateLimit-*, Quota-*, Retry-After). */
  limitHeaders: HeaderRow[];
}

export function methodClass(method: string): string {
  switch (method.toLowerCase()) {
    case 'get': return 'pill pill-info mono';
    case 'post': return 'pill pill-ok mono';
    case 'delete': return 'pill pill-crit mono';
    default: return 'pill pill-warn mono';
  }
}

export function statusClass(status: string): string {
  const n = Number(status);
  return n >= 500 ? 'pill pill-crit mono' : n >= 400 ? 'pill pill-warn mono' : n >= 300 ? 'pill pill-info mono' : 'pill pill-ok mono';
}

const shortType = (doc: unknown, schema: Schema | undefined): string => {
  const s = deref(doc, schema) ?? {};
  const name = schemaName(schema?.$ref);
  if (name) return name;
  const t = s.type === undefined ? '' : Array.isArray(s.type) ? s.type.filter(x => x !== 'null').join(' or ') : s.type;
  return [t || 'string', s.format].filter(Boolean).join(' · ');
};

const show = (v: unknown) => v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);

function exampleText(doc: unknown, contentType: string, schema: Schema | undefined, given: unknown): string | null {
  const value = given !== undefined ? given : exampleFor(doc, schema);
  if (/json/.test(contentType)) return JSON.stringify(value, null, 2);
  if (contentType === 'application/x-www-form-urlencoded' && value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  }
  if (contentType === 'multipart/form-data' && value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).map(k => `${k}: (a file or a value)`).join('\n');
  }
  return null;
}

/** A curl call of the operation against `base` (the API's /v1 address), with placeholders a reader replaces. */
export function curlFor(doc: OpenApiDoc, op: Operation, base: string): string {
  let path = op.path;
  for (const p of op.parameters.filter(p => p.in === 'path')) {
    path = path.replace(`{${p.name}}`, String(exampleFor(doc, p.schema, p.name)));
  }
  const query = op.parameters.filter(p => p.in === 'query' && p.required)
    .map(p => `${p.name}=${encodeURIComponent(String(exampleFor(doc, p.schema, p.name)))}`);
  const url = `${base}${path}${query.length ? '?' + query.join('&') : ''}`;
  const lines = [`curl -X ${op.method.toUpperCase()} "${url}"`];
  if (op.access.kind === 'scopes') lines.push('-H "Authorization: Bearer $TOKEN"');
  for (const p of op.parameters.filter(p => p.in === 'header' && p.required)) {
    lines.push(`-H "${p.name}: ${p.name === 'Idempotency-Key' ? '$(uuidgen)' : String(exampleFor(doc, p.schema, p.name))}"`);
  }
  const content = op.requestBody?.content ?? {};
  const [type] = Object.keys(content);
  if (type === 'application/json') {
    lines.push('-H "Content-Type: application/json"');
    lines.push(`-d '${JSON.stringify(exampleFor(doc, content[type].schema))}'`);
  } else if (type === 'application/x-www-form-urlencoded') {
    const fields = deref(doc, content[type].schema)?.properties ?? {};
    for (const key of Object.keys(fields)) {
      const value = key === 'client_id' ? '$CLIENT_ID' : key === 'client_secret' ? '$CLIENT_SECRET' : String(exampleFor(doc, fields[key], key));
      if (key !== 'scope') lines.push(`--data-urlencode "${key}=${value}"`);
    }
  } else if (type === 'multipart/form-data') {
    const fields = deref(doc, content[type].schema)?.properties ?? {};
    for (const [key, prop] of Object.entries(fields)) {
      lines.push(prop.format === 'binary' ? `-F "${key}=@./report.pdf"` : `-F "${key}=${String(exampleFor(doc, prop, key))}"`);
    }
  }
  return lines.join(' \\\n  ');
}

export function paramRows(doc: unknown, params: Operation['parameters']): ParamRow[] {
  return params.map(p => {
    const s = deref(doc, p.schema) ?? {};
    return {
      name: p.name, in: p.in, required: !!p.required, type: shortType(doc, p.schema),
      pattern: s.pattern ?? null, defaultValue: show(s.default), description: (p.description ?? s.description ?? '').trim(),
    };
  });
}

function operationView(doc: OpenApiDoc, op: Operation, base: string): OperationView {
  const content = op.requestBody?.content ?? {};
  const [bodyType] = Object.keys(content);
  const body: BodyView | null = bodyType ? {
    contentType: bodyType,
    required: !!op.requestBody?.required,
    tree: fieldTree(doc, content[bodyType].schema),
    example: exampleText(doc, bodyType, content[bodyType].schema, content[bodyType].example),
    exampleLang: /json/.test(bodyType) ? 'JSON' : bodyType,
  } : null;
  const responses: ResponseView[] = op.responses.map(({ status, response }) => {
    const [type] = Object.keys(response.content ?? {});
    const media = type ? response.content![type] : undefined;
    const ok = Number(status) < 400;
    return {
      status,
      tone: statusClass(status),
      description: (response.description ?? '').trim(),
      headers: headersOf(doc, response),
      contentType: type ?? null,
      schema: schemaName(media?.schema?.$ref),
      tree: ok && media?.schema ? fieldTree(doc, media.schema) : null,
      example: ok && type && media ? exampleText(doc, type, media.schema, media.example) : null,
    };
  });
  const problems = problemsFor(doc, op);
  return {
    op,
    anchor: `op-${op.id}`,
    methodClass: methodClass(op.method),
    description: op.description ? parseGuide(op.description) : [],
    access: op.access,
    params: paramRows(doc, op.parameters),
    body,
    responses,
    errors: responses.filter(r => Number(r.status) >= 400).map(r => ({
      status: r.status, description: r.description, problems: problems.filter(p => String(p.status) === r.status),
    })),
    problems,
    rateLimited: op.access.kind === 'scopes',
    curl: curlFor(doc, op, base),
  };
}

/** Everything the reference draws; `base` is the API's address with its /v1 (CUSTOMER_API_BASE). */
export function referenceModel(doc: OpenApiDoc, eventTypes: Schema[], base: string): ReferenceModel {
  const tags: TagView[] = groupByTag(doc, operationsOf(doc)).map((g: TagGroup) => ({
    name: g.name, description: g.description, operations: g.operations.map(op => operationView(doc, op, base)),
  }));
  const schemas = Object.entries(doc.components?.schemas ?? {}).map(([name, schema]) => ({
    name,
    description: (schema.description ?? '').trim(),
    tree: fieldTree(doc, { $ref: `#/components/schemas/${name}` }, 3),
    example: JSON.stringify(exampleFor(doc, schema, name), null, 2),
  }));
  const events = eventTypes.map(schema => {
    const typeProp = schema.properties?.['type'];
    return {
      type: schema.title ?? show(typeProp?.const) ?? 'event',
      description: (schema.description ?? '').trim(),
      tree: fieldTree(doc, schema.properties?.['data'] ?? {}, 3),
      example: JSON.stringify(exampleFor(doc, schema), null, 2),
    };
  });
  const post = doc.webhooks?.['event']?.post;
  const receiver = post ? {
    summary: post.summary ?? '',
    description: post.description ? parseGuide(post.description) : [],
    headers: paramRows(doc, (post.parameters ?? []).filter(p => p.in === 'header')),
  } : null;
  const limitHeaders = Object.entries(doc.components?.headers ?? {}).map(([name, h]) => ({
    name, description: (h.description ?? '').trim(), type: shortType(doc, h.schema),
  }));
  return {
    title: doc.info.title,
    version: doc.info.version,
    tags,
    schemas,
    events,
    receiver,
    problems: problemTypesOf(doc),
    rateLimitHeaders: rateLimitHeaders(doc),
    limitHeaders,
  };
}
