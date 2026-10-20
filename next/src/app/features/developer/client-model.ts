import { OpenApiDoc, Operation } from './openapi';
import { curlFor } from './reference-model';

/** What one API client may call (owner #28): every operation of the contract, sorted into allowed and the scopes it lacks. */
export interface ClientCoverage {
  allowed: Operation[];
  denied: { op: Operation; missing: string[] }[];
  /** Scopes the client holds that no operation of the contract asks for (a typo, or one the contract dropped). */
  unused: string[];
}

/** An operation needs every scope its security names; a signed link or an open one (the token request) needs none. */
export function coverageOf(operations: Operation[], scopes: string[]): ClientCoverage {
  const held = new Set(scopes);
  const allowed: Operation[] = [];
  const denied: { op: Operation; missing: string[] }[] = [];
  const asked = new Set<string>();
  for (const op of operations) {
    if (op.access.kind !== 'scopes') { allowed.push(op); continue; }
    op.access.scopes.forEach(s => asked.add(s));
    const missing = op.access.scopes.filter(s => !held.has(s));
    if (missing.length) denied.push({ op, missing }); else allowed.push(op);
  }
  return { allowed, denied, unused: scopes.filter(s => !asked.has(s)) };
}

/** Every scope the contract's operations ask for, sorted: what the portal and Identity's scope list must agree on. */
export function contractScopes(operations: Operation[]): string[] {
  return [...new Set(operations.flatMap(op => op.access.kind === 'scopes' ? op.access.scopes : []))].sort();
}

/**
 * The quick start for one client: ask for a token with its client id (the secret is the reader's, never shown here), then
 * make the first call it may -- a read where there is one.
 */
export function quickStart(doc: OpenApiDoc, operations: Operation[], coverage: ClientCoverage, clientId: string, base: string): string {
  const token = operations.find(op => op.method === 'post' && op.path === '/oauth/token');
  const first = coverage.allowed.find(op => op.access.kind === 'scopes' && op.method === 'get')
    ?? coverage.allowed.find(op => op.access.kind === 'scopes');
  const lines = [`export CLIENT_ID="${clientId}"`, 'export CLIENT_SECRET="…"   # shown once, when the client was made or its secret rotated', ''];
  if (token) {
    lines.push('# 1. A token (it lasts minutes; ask again when it ends)', `TOKEN=$(${curlFor(doc, token, base)} | jq -r .access_token)`, '');
  }
  if (first) lines.push(`# 2. ${first.summary || first.id}`, curlFor(doc, first, base));
  else lines.push('# This client holds no scope any call asks for: give it one under Developers › API Clients.');
  return lines.join('\n');
}
