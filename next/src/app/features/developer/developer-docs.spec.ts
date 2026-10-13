import { describe, it, expect } from 'vitest';
import { DOCS } from './developer-docs';
import { operationsOf } from './openapi';

/**
 * MIG-336: the developer portal's content is a copy of etl-platform docs/api, made by scripts/sync-developer-docs.mjs.
 * When the contract changes and the copy does not, this fails and says how to fix it. The etl-platform checkout is read
 * at ../../etl-platform (or $ETL_PLATFORM); where it is not there, as in a build of the console alone, that half passes
 * with a note.
 */
interface Fs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
}
interface Crypto { createHash(algorithm: string): { update(text: string): { digest(encoding: 'hex'): string } } }

const nodeModule = async <T>(name: string) => (await import(/* @vite-ignore */ ['node', name].join(':'))) as T;
const env = () => (globalThis as unknown as { process: { cwd(): string; env: Record<string, string | undefined> } }).process;

/** The files the portal is made from, as the sync script lists them. */
function sourceFiles(fs: Fs, api: string): string[] {
  const files = ['openapi-v1.yaml', 'CHANGELOG.md'];
  if (fs.existsSync(`${api}/event-types`)) {
    files.push(...fs.readdirSync(`${api}/event-types`).filter(f => f.endsWith('.json')).sort().map(f => `event-types/${f}`));
  }
  if (fs.existsSync(`${api}/guides/index.json`)) {
    files.push('guides/index.json', ...fs.readdirSync(`${api}/guides`).filter(f => f.endsWith('.md')).sort().map(f => `guides/${f}`));
  }
  return files;
}

describe('MIG-336: the developer portal\'s copy of the API contract', () => {
  it('matches etl-platform docs/api (else: run node scripts/sync-developer-docs.mjs)', async () => {
    const fs = await nodeModule<Fs>('fs');
    const crypto = await nodeModule<Crypto>('crypto');
    const proc = env();
    const platform = proc.env['ETL_PLATFORM'] || `${proc.cwd()}/../../etl-platform`;
    const api = `${platform.replace(/^(?!\/)/, `${proc.cwd()}/`)}/docs/api`;
    if (!fs.existsSync(`${api}/openapi-v1.yaml`)) {
      expect(DOCS.sources['openapi-v1.yaml'], 'no etl-platform checkout here: only the copy is checked').toMatch(/^[0-9a-f]{64}$/);
      return;
    }
    const now = Object.fromEntries(sourceFiles(fs, api).map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(`${api}/${f}`, 'utf8')).digest('hex')]));
    const stale = [...new Set([...Object.keys(now), ...Object.keys(DOCS.sources)])].filter(f => now[f] !== DOCS.sources[f]);
    expect(stale, `docs/api changed (${stale.join(', ')}): run node scripts/sync-developer-docs.mjs`).toEqual([]);
  });

  it('has one Postman request per operation of the spec', async () => {
    const fs = await nodeModule<Fs>('fs');
    const collection = JSON.parse(fs.readFileSync(`${env().cwd()}/public/developer/postman-collection-v1.json`, 'utf8'));
    const requests: { name: string; request: { method: string; description: string; auth?: { type: string }; url: { raw: string } };
      event?: { listen: string; script: { exec: string[] } }[] }[] = collection.item.flatMap((folder: { item: unknown[] }) => folder.item);
    const ids = requests.map(r => /operationId: (\S+)/.exec(r.request.description)?.[1]);
    const ops = operationsOf(DOCS.spec);
    expect(ids.sort()).toEqual(ops.map(o => o.id).sort());
    expect(collection.item.map((f: { name: string }) => f.name)).toEqual((DOCS.spec.tags ?? []).map(t => t.name)
      .filter(tag => ops.some(o => o.tag === tag)));
    expect(collection.variable.map((v: { key: string }) => v.key).sort()).toEqual(['accessToken', 'baseUrl', 'clientId', 'clientSecret']);
    expect(collection.variable.find((v: { key: string }) => v.key === 'baseUrl').value).toBe('http://localhost:9098/v1');
    expect(collection.auth.bearer[0].value).toBe('{{accessToken}}');
    const token = requests.find(r => r.request.description.includes('operationId: createToken'))!;
    expect(token.request.auth?.type).toBe('noauth');
    expect(token.event?.[0].script.exec.join('\n')).toContain("pm.collectionVariables.set('accessToken', body.access_token)");
    const start = requests.find(r => r.request.description.includes('operationId: startRun'))!;
    expect(start.request.url.raw).toBe('{{baseUrl}}/pipelines/:pipelineId/runs');
    expect(JSON.stringify(start.request)).toContain('{{$guid}}');
  });
});
