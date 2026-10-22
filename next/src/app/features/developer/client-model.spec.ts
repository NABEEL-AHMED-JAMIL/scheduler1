import { describe, it, expect } from 'vitest';
import { DOCS } from './developer-docs';
import { operationsOf } from './openapi';
import { contractScopes, coverageOf, quickStart } from './client-model';

/** Owner #28: the portal from the API clients -- what a client's scopes allow, a quick start, and the contract's scopes. */
const ops = operationsOf(DOCS.spec);

describe('a client\'s coverage of the contract', () => {
  it('allows the open and signed calls to everyone, and a scoped call only with its scope', () => {
    const none = coverageOf(ops, []);
    expect(none.allowed.every(op => op.access.kind !== 'scopes')).toBe(true);
    expect(none.allowed.some(op => op.path === '/oauth/token')).toBe(true);
    expect(none.denied.length).toBe(ops.filter(op => op.access.kind === 'scopes').length);

    const reader = coverageOf(ops, ['runs:read', 'not:a-scope']);
    expect(reader.allowed.some(op => op.method === 'get' && op.path === '/runs')).toBe(true);
    expect(reader.denied.find(op => op.op.method === 'post' && op.op.path === '/runs/{runId}/retry')?.missing).toEqual(['runs:write']);
    expect(reader.unused).toEqual(['not:a-scope']);
  });

  it('starts with a token for its client id, then its first read', () => {
    const start = quickStart(DOCS.spec, ops, coverageOf(ops, ['runs:read']), 'cli_123', 'https://api.example/v1');
    expect(start).toContain('export CLIENT_ID="cli_123"');
    expect(start).toContain('/v1/oauth/token');
    expect(start).toMatch(/# 2\. .*\ncurl -X GET "https:\/\/api\.example\/v1\//);
    expect(start).not.toMatch(/CLIENT_SECRET="[^…]/);
    expect(quickStart(DOCS.spec, ops, coverageOf(ops, []), 'c', 'b')).toContain('holds no scope');
  });

  it('takes for its first call a read that needs no id, when the client may make one (ZT-X6)', () => {
    // A client with runs:read beside runs:write showed "GET /v1/backfills/123": an id the reader does not have.
    const start = quickStart(DOCS.spec, ops, coverageOf(ops, ['runs:read', 'runs:write', 'files:write']), 'c', 'https://api.example/v1');
    const second = start.split('# 2. ')[1] ?? '';
    expect(second).toContain('curl -X GET "https://api.example/v1/runs"');
    expect(second).not.toMatch(/\/\d+"/);
    // Only calls that name an id: the first such read still stands, with its placeholder.
    const files = quickStart(DOCS.spec, ops, coverageOf(ops, ['files:read']), 'c', 'https://api.example/v1');
    expect(files).toMatch(/# 2\. .*\ncurl -X GET "https:\/\/api\.example\/v1\/files\//);
  });
});

describe('the contract\'s scopes', () => {
  it('are a short, stable list every scoped call names one of (Identity\'s list must match: ScopeCatalogueDriftTest in identity)', () => {
    const scopes = contractScopes(ops);
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.every(s => /^[a-z]+:(read|write|manage)$/.test(s))).toBe(true);
    for (const op of ops) if (op.access.kind === 'scopes') expect(op.access.scopes.length).toBeGreaterThan(0);
  });
});
