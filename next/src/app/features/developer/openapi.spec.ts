import { describe, it, expect } from 'vitest';
import {
  EXAMPLE_TIME, EXAMPLE_ULID, EXAMPLE_URI, OpenApiDoc, Response, accessOf, deref, exampleFor, fieldTree, groupByTag, headersOf, matchesFilter,
  operationsOf, problemsFor, problemTypesOf, rateLimitHeaders, resolvePointer,
} from './openapi';
import { curlFor, referenceModel } from './reference-model';
import { DOCS } from './developer-docs';

/** A small contract shaped like the customer API's, so each rule is seen on its own. */
const DOC = {
  openapi: '3.1.0',
  info: { title: 'Fixture API', version: '1.0.0' },
  security: [{ clientCredentials: [] }],
  tags: [{ name: 'auth', description: 'Getting a token.' }, { name: 'runs', description: 'Runs.' }, { name: 'files' }],
  paths: {
    '/runs/{runId}': {
      parameters: [{ $ref: '#/components/parameters/RunId' }],
      get: {
        tags: ['runs'], operationId: 'getRun', summary: 'One run.', security: [{ clientCredentials: ['runs:read'] }],
        responses: {
          '200': { description: 'The run.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Run' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    '/pipelines/{pipelineId}/runs': {
      post: {
        tags: ['runs'], operationId: 'startRun', summary: 'Start a run.', security: [{ clientCredentials: ['runs:write'] }],
        parameters: [
          { name: 'pipelineId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{8,128}$' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['record'],
          properties: { record: { type: 'object', additionalProperties: true }, files: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { '202': { description: 'Queued.' }, '409': { $ref: '#/components/responses/Conflict' } },
      },
    },
    '/oauth/token': {
      post: {
        tags: ['auth'], operationId: 'createToken', summary: 'A token.', security: [],
        requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object',
          properties: { grant_type: { type: 'string', const: 'client_credentials' }, client_id: { type: 'string' }, client_secret: { type: 'string' } } } } } },
        responses: { '200': { description: 'The token.' } },
      },
    },
    '/files/{fileId}/content': {
      get: {
        tags: ['files'], operationId: 'readFileContent', summary: 'Bytes.', security: [], 'x-signed-link': true,
        parameters: [{ name: 'fileId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' } }],
        responses: { '410': { description: 'Gone.' } },
      },
    },
    '/orphans': { get: { tags: ['misc'], operationId: 'listOrphans', responses: { '200': { description: 'ok' } } } },
  },
  components: {
    parameters: { RunId: { name: 'runId', in: 'path', required: true, schema: { type: 'string' } } },
    responses: {
      NotFound: { description: 'Not found.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Conflict: { description: 'Conflict.' },
      TooManyRequests: { description: 'Past a limit.', headers: { 'Retry-After': { $ref: '#/components/headers/Retry-After' },
        'RateLimit-Limit': { $ref: '#/components/headers/RateLimit-Limit' } } },
    },
    headers: {
      'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer', minimum: 1 } },
      'RateLimit-Limit': { description: 'The bucket.', schema: { type: 'integer' } },
      'Quota-Limit': { description: 'The quota.', schema: { type: 'integer' } },
    },
    schemas: {
      Problem: { type: 'object', required: ['type', 'status'], properties: { type: { type: 'string', format: 'uri-reference' }, status: { type: 'integer' } } },
      RunStatus: { type: 'string', enum: ['queued', 'running'] },
      Run: {
        type: 'object', required: ['id', 'status', 'createdAt'],
        properties: {
          id: { type: 'string' },
          status: { $ref: '#/components/schemas/RunStatus' },
          createdAt: { type: 'string', format: 'date-time' },
          endedAt: { type: ['string', 'null'], format: 'date-time' },
          attempt: { type: 'integer', description: 'From 1.' },
          download: { oneOf: [{ $ref: '#/components/schemas/Link' }, { type: 'null' }] },
          parent: { $ref: '#/components/schemas/Run' },
        },
      },
      Link: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' }, expiresInSeconds: { type: 'integer', minimum: 60, maximum: 900, default: 900 } } },
      ManifestFile: { allOf: [{ $ref: '#/components/schemas/Link' }, { type: 'object', required: ['expired'], properties: { expired: { type: 'boolean' } } }] },
      Either: { oneOf: [{ $ref: '#/components/schemas/Link' }, { $ref: '#/components/schemas/Problem' }] },
    },
    'x-problem-types': {
      'run-in-flight': { status: 409, title: 'A run is in flight', operations: ['startRun'] },
      'not-found': { status: 404, title: 'Not found' },
      'rate-limited': { status: 429, title: 'Rate limited' },
      'link-expired': { status: 410, title: 'Link expired', operations: ['someOtherOp'] },
    },
  },
} as unknown as OpenApiDoc;

describe('MIG-336: reading the OpenAPI document', () => {
  it('resolves local $refs, through chains, and gives up on a loop', () => {
    expect(resolvePointer(DOC, '#/components/schemas/RunStatus')).toEqual({ type: 'string', enum: ['queued', 'running'] });
    expect(resolvePointer(DOC, '#/components/headers/Retry-After')).toBeDefined();
    expect(resolvePointer(DOC, '#/nothing/here')).toBeUndefined();
    expect(resolvePointer(DOC, 'other.yaml#/x')).toBeUndefined();
    const looped = { a: { $ref: '#/b' }, b: { $ref: '#/a' } };
    expect(deref(looped, { $ref: '#/a' })).toBeUndefined();
    expect(deref<Response>(DOC, { $ref: '#/components/responses/NotFound' })?.description).toBe('Not found.');
  });

  it('lists the operations with their path parameters merged and $refs resolved', () => {
    const ops = operationsOf(DOC);
    expect(ops.map(o => o.id)).toEqual(['getRun', 'startRun', 'createToken', 'readFileContent', 'listOrphans']);
    const getRun = ops[0];
    expect(getRun.parameters.map(p => `${p.in}:${p.name}`)).toEqual(['path:runId']);
    expect(getRun.responses.find(r => r.status === '404')!.response.description).toBe('Not found.');
  });

  it('groups by first tag in the spec\'s tag order, an undeclared tag after, empty tags dropped', () => {
    const groups = groupByTag(DOC, operationsOf(DOC));
    expect(groups.map(g => g.name)).toEqual(['auth', 'runs', 'files', 'misc']);
    expect(groups[1].operations.map(o => o.id)).toEqual(['getRun', 'startRun']);
    expect(groups[0].description).toBe('Getting a token.');
  });

  it('says which scopes an operation needs, or that it needs no token', () => {
    const ops = operationsOf(DOC);
    expect(ops[0].access).toEqual({ kind: 'scopes', scopes: ['runs:read'] });
    expect(ops[2].access).toEqual({ kind: 'none' });
    expect(ops[3].access).toEqual({ kind: 'signed' });
    expect(accessOf(DOC, {})).toEqual({ kind: 'scopes', scopes: [] });
  });

  it('matches the filter on path, summary and operationId', () => {
    const [getRun] = operationsOf(DOC);
    expect(matchesFilter(getRun, 'GETRUN')).toBe(true);
    expect(matchesFilter(getRun, '/v1/runs')).toBe(true);
    expect(matchesFilter(getRun, 'one run')).toBe(true);
    expect(matchesFilter(getRun, 'webhook')).toBe(false);
    expect(matchesFilter(getRun, '  ')).toBe(true);
  });

  it('matches problem types to an operation by error status, and by the operations a type names', () => {
    const ops = operationsOf(DOC);
    const kinds = (id: string) => problemsFor(DOC, ops.find(o => o.id === id)!).map(p => p.kind);
    expect(kinds('getRun')).toEqual(['not-found', 'rate-limited']);
    expect(kinds('startRun')).toEqual(['run-in-flight']);
    // 410 is one of its statuses, but link-expired names other operations only.
    expect(kinds('readFileContent')).toEqual([]);
    expect(problemTypesOf(DOC).find(p => p.kind === 'not-found')!.operations).toBeNull();
    expect(problemTypesOf({ ...DOC, components: {} })).toEqual([]);
  });

  it('resolves $ref headers, and finds the rate-limit headers', () => {
    const tooMany = deref<Response>(DOC, { $ref: '#/components/responses/TooManyRequests' })!;
    expect(headersOf(DOC, tooMany)).toEqual([
      { name: 'Retry-After', description: 'Seconds to wait.', type: 'integer' },
      { name: 'RateLimit-Limit', description: 'The bucket.', type: 'integer' },
    ]);
    expect(rateLimitHeaders(DOC).map(h => h.name)).toEqual(['RateLimit-Limit']);
  });
});

describe('MIG-336: the example generator', () => {
  const ex = (schema: object, name = '') => exampleFor(DOC, schema, name);

  it('prefers example, then examples, then const, then the first enum value, then default', () => {
    expect(ex({ type: 'integer', example: 900, default: 5 })).toBe(900);
    expect(ex({ type: 'string', examples: ['run.completed', 'x'] })).toBe('run.completed');
    expect(ex({ type: 'string', const: 'Bearer', enum: ['x'] })).toBe('Bearer');
    expect(ex({ type: ['string', 'null'], enum: [null, 'internal', 'customer'] })).toBe('internal');
    expect(ex({ type: 'boolean', default: false })).toBe(false);
  });

  it('fills placeholders by format, by ULID pattern and by property name', () => {
    expect(ex({ type: 'string', format: 'date-time' })).toBe(EXAMPLE_TIME);
    expect(ex({ type: 'string', format: 'uri' })).toBe(EXAMPLE_URI);
    expect(ex({ type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' })).toBe(EXAMPLE_ULID);
    expect(EXAMPLE_ULID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(ex({ type: 'string' }, 'id')).toBe('123');
    expect(ex({ type: 'string' }, 'pipelineId')).toBe('123');
    expect(ex({ type: 'string' }, 'name')).toBe('string');
  });

  it('makes integers 1 (within their minimum), arrays one item, objects every property', () => {
    expect(ex({ type: 'integer' })).toBe(1);
    expect(ex({ type: 'integer', minimum: 60, maximum: 900 })).toBe(60);
    expect(ex({ type: 'array', items: { type: 'string' } }, 'tags')).toEqual(['string']);
    expect(exampleFor(DOC, { $ref: '#/components/schemas/Link' })).toEqual({ url: EXAMPLE_URI, expiresInSeconds: 900 });
  });

  it('resolves $refs, merges allOf, takes the non-null oneOf branch, and stops at a cycle', () => {
    expect(exampleFor(DOC, { $ref: '#/components/schemas/ManifestFile' })).toEqual({ url: EXAMPLE_URI, expiresInSeconds: 900, expired: true });
    const run = exampleFor(DOC, { $ref: '#/components/schemas/Run' }) as Record<string, unknown>;
    expect(run).toEqual({
      id: '123', status: 'queued', createdAt: EXAMPLE_TIME, endedAt: EXAMPLE_TIME, attempt: 1,
      download: { url: EXAMPLE_URI, expiresInSeconds: 900 }, parent: {},
    });
  });

  it('writes a curl call with the token, the required headers and the body', () => {
    const ops = operationsOf(DOC);
    const curl = curlFor(DOC, ops.find(o => o.id === 'startRun')!, 'https://api.example.com/v1');
    expect(curl).toContain('curl -X POST "https://api.example.com/v1/pipelines/123/runs"');
    expect(curl).toContain('-H "Authorization: Bearer $TOKEN"');
    expect(curl).toContain('-H "Idempotency-Key: $(uuidgen)"');
    expect(curl).toContain(`-d '{"record":{},"files":["string"]}'`);
    const token = curlFor(DOC, ops.find(o => o.id === 'createToken')!, 'https://api.example.com/v1');
    expect(token).not.toContain('Authorization');
    expect(token).toContain('--data-urlencode "client_secret=$CLIENT_SECRET"');
  });
});

describe('MIG-336: a schema as a field tree', () => {
  it('resolves refs, marks required and nullable, lists enums, and stops at a cycle with a link', () => {
    const tree = fieldTree(DOC, { $ref: '#/components/schemas/Run' });
    expect(tree.ref).toBe('Run');
    const by = (name: string) => tree.children.find(c => c.name === name)!;
    expect(by('id')).toMatchObject({ type: 'string', required: true, nullable: false });
    expect(by('status')).toMatchObject({ ref: 'RunStatus', enumValues: ['queued', 'running'] });
    expect(by('endedAt')).toMatchObject({ type: 'string', nullable: true, format: 'date-time', required: false });
    expect(by('attempt').description).toBe('From 1.');
    // A nullable oneOf is its one real branch, nullable.
    expect(by('download')).toMatchObject({ ref: 'Link', nullable: true, type: 'object' });
    expect(by('download').children.map(c => c.name)).toEqual(['url', 'expiresInSeconds']);
    expect(by('download').children[1]).toMatchObject({ defaultValue: '900', range: '60 to 900' });
    // Run inside Run: named, not expanded again.
    expect(by('parent')).toMatchObject({ ref: 'Run', children: [] });
  });

  it('merges allOf, and lists each branch of a real oneOf', () => {
    const merged = fieldTree(DOC, { $ref: '#/components/schemas/ManifestFile' });
    expect(merged.children.map(c => `${c.name}${c.required ? '*' : ''}`)).toEqual(['url*', 'expiresInSeconds', 'expired*']);
    const either = fieldTree(DOC, { $ref: '#/components/schemas/Either' });
    expect(either.variants.map(v => v.label)).toEqual(['Link', 'Problem']);
    expect(either.variants[1].children.map(c => c.name)).toEqual(['type', 'status']);
  });

  it('describes an array by its items', () => {
    const tree = fieldTree(DOC, { type: 'object', properties: { runs: { type: 'array', items: { $ref: '#/components/schemas/Link' } } } });
    expect(tree.children[0]).toMatchObject({ type: 'array of Link', ref: 'Link' });
    expect(tree.children[0].children.map(c => c.name)).toEqual(['url', 'expiresInSeconds']);
  });
});

describe('MIG-336: the bundled contract renders', () => {
  it('builds the reference for every operation, schema and event type without a dangling ref', () => {
    const model = referenceModel(DOCS.spec, DOCS.eventTypes, 'https://api.example.com/v1');
    const ops = model.tags.flatMap(t => t.operations);
    expect(ops.length).toBe(operationsOf(DOCS.spec).length);
    expect(ops.length).toBeGreaterThan(20);
    expect(model.tags.map(t => t.name)).toEqual((DOCS.spec.tags ?? []).map(t => t.name).filter(n => ops.some(o => o.op.tag === n)));
    expect(model.schemas.length).toBe(Object.keys(DOCS.spec.components?.schemas ?? {}).length);
    expect(model.events.length).toBe(DOCS.eventTypes.length);
    // Every event's data resolves into the spec's schemas (the sync made its refs local).
    for (const e of model.events) expect(e.tree.children.length + e.tree.variants.length, e.type).toBeGreaterThan(0);
    const token = ops.find(o => o.op.id === 'createToken');
    expect(token?.rateLimited).toBe(false);
    expect(ops.filter(o => o.access.kind === 'signed').length).toBeGreaterThan(0);
    expect(model.rateLimitHeaders.map(h => h.name)).toEqual(['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'RateLimit-Policy']);
  });
});
