#!/usr/bin/env node
// MIG-336: copies the customer API's contract into the console's developer portal. Run it by hand when the contract
// changes (developer-docs.spec.ts fails until you do):
//
//   node scripts/sync-developer-docs.mjs                 # reads ../../etl-platform/docs/api
//   ETL_PLATFORM=/path/to/etl-platform node scripts/sync-developer-docs.mjs
//
// Reads docs/api/: openapi-v1.yaml, CHANGELOG.md, event-types/*.json, guides/index.json and the guides it names (no
// guides folder: no guides). Writes:
//   src/app/features/developer/content/developer-docs.generated.json  the portal's content (bundled in its lazy chunk)
//   public/developer/openapi-v1.yaml, openapi-v1.json                  the contract, to download
//   public/developer/postman-collection-v1.json                        a Postman v2.1 collection made from it
//
// YAML is read with js-yaml through npx (`npx --yes js-yaml@4`), so the console takes no dependency for it. Needs a Node
// that strips TypeScript types (22.18+ or 23.6+): the examples come from src/app/features/developer/openapi.ts, the
// same generator the reference page uses.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = resolve(root, process.env.ETL_PLATFORM || '../../etl-platform');
const api = join(platform, 'docs/api');

// Node warns that the console's package.json names no module type when it loads openapi.ts as ESM; that is expected here.
process.removeAllListeners('warning');
process.on('warning', w => { if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON') process.stderr.write(`${w.name}: ${w.message}\n`); });
const { exampleFor, operationsOf, groupByTag } = await import('../src/app/features/developer/openapi.ts');

if (!existsSync(join(api, 'openapi-v1.yaml'))) {
  process.stderr.write(`No ${join(api, 'openapi-v1.yaml')}: set ETL_PLATFORM to the etl-platform checkout.\n`);
  process.exit(1);
}

/** The files the portal is made from, relative to docs/api, in a stable order. developer-docs.spec.ts lists the same. */
function sourceFiles() {
  const files = ['openapi-v1.yaml', 'CHANGELOG.md'];
  const events = join(api, 'event-types');
  if (existsSync(events)) files.push(...readdirSync(events).filter(f => f.endsWith('.json')).sort().map(f => `event-types/${f}`));
  const guides = join(api, 'guides');
  if (existsSync(join(guides, 'index.json'))) {
    files.push('guides/index.json');
    files.push(...readdirSync(guides).filter(f => f.endsWith('.md')).sort().map(f => `guides/${f}`));
  }
  return files;
}

const sha256 = text => createHash('sha256').update(text).digest('hex');
const read = rel => readFileSync(join(api, rel), 'utf8');

const yamlText = read('openapi-v1.yaml');
const spec = JSON.parse(execFileSync('npx', ['--yes', 'js-yaml@4', join(api, 'openapi-v1.yaml')], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
}));

/** An event type's `$ref`s into the OpenAPI document (`../openapi-v1.yaml#/...`) as local ones the portal resolves. */
function localRefs(value) {
  if (Array.isArray(value)) return value.map(localRefs);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, k === '$ref' && typeof v === 'string' ? v.replace(/^(\.\.\/)?openapi-v1\.yaml#/, '#') : localRefs(v)]));
  }
  return value;
}

const files = sourceFiles();
const eventTypes = files.filter(f => f.startsWith('event-types/')).map(f => localRefs(JSON.parse(read(f))));

const guides = [];
if (files.includes('guides/index.json')) {
  for (const entry of JSON.parse(read('guides/index.json'))) {
    const rel = `guides/${entry.file}`;
    if (!existsSync(join(api, rel))) throw new Error(`guides/index.json names ${entry.file}, which is not there`);
    guides.push({ slug: entry.slug, title: entry.title, summary: entry.summary ?? '', markdown: read(rel) });
  }
}

const sources = Object.fromEntries(files.map(f => [f, sha256(read(f))]));
const content = { spec, eventTypes, guides, changelog: read('CHANGELOG.md'), sources };

// ------------------------------------------------------------------------------------------------ Postman (v2.1)

const BASE_URL = 'http://localhost:9098/v1';

function postmanRequest(op) {
  const header = [];
  const query = [];
  const variable = [];
  for (const p of op.parameters) {
    const example = exampleFor(spec, p.schema, p.name);
    const value = p.schema?.default !== undefined ? String(p.schema.default) : typeof example === 'string' ? example : JSON.stringify(example);
    if (p.in === 'header') {
      header.push({ key: p.name, value: p.name === 'Idempotency-Key' ? '{{$guid}}' : value, ...(p.required ? {} : { disabled: true }),
        ...(p.description ? { description: p.description } : {}) });
    } else if (p.in === 'query') {
      query.push({ key: p.name, value, ...(p.required ? {} : { disabled: true }), ...(p.description ? { description: p.description } : {}) });
    } else if (p.in === 'path') {
      variable.push({ key: p.name, value, ...(p.description ? { description: p.description } : {}) });
    }
  }
  const segments = op.path.split('/').filter(Boolean).map(s => s.replace(/^\{(.+)\}$/, ':$1'));
  const raw = `{{baseUrl}}/${segments.join('/')}` + (query.some(q => !q.disabled)
    ? '?' + query.filter(q => !q.disabled).map(q => `${q.key}=${q.value}`).join('&') : '');
  const request = {
    method: op.method.toUpperCase(),
    header,
    url: { raw, host: ['{{baseUrl}}'], path: segments, ...(query.length ? { query } : {}), ...(variable.length ? { variable } : {}) },
    description: [op.summary, op.description, `operationId: ${op.id}`].filter(Boolean).join('\n\n'),
  };
  if (op.access.kind !== 'scopes') request.auth = { type: 'noauth' };
  const content = op.requestBody?.content ?? {};
  const [type] = Object.keys(content);
  let event;
  if (type === 'application/json') {
    header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(exampleFor(spec, content[type].schema), null, 2), options: { raw: { language: 'json' } } };
  } else if (type === 'application/x-www-form-urlencoded') {
    const schema = content[type].schema ?? {};
    const tokenRequest = !!schema.properties?.grant_type;
    const fields = Object.entries(schema.properties ?? {}).map(([key, prop]) => {
      const fixed = { client_id: '{{clientId}}', client_secret: '{{clientSecret}}' }[key];
      const value = tokenRequest && fixed ? fixed : String(exampleFor(spec, prop, key) ?? '');
      return { key, value, ...((schema.required ?? []).includes(key) ? {} : { disabled: true }) };
    });
    request.body = { mode: 'urlencoded', urlencoded: fields };
    if (tokenRequest) {
      event = [{ listen: 'test', script: { type: 'text/javascript', exec: [
        '// Keeps the token for the other requests (collection variable accessToken).',
        'const body = pm.response.json();',
        "if (body.access_token) { pm.collectionVariables.set('accessToken', body.access_token); }",
      ] } }];
    }
  } else if (type === 'multipart/form-data') {
    const schema = content[type].schema ?? {};
    request.body = { mode: 'formdata', formdata: Object.entries(schema.properties ?? {}).map(([key, prop]) =>
      prop.format === 'binary' ? { key, type: 'file', src: [] } : { key, type: 'text', value: String(exampleFor(spec, prop, key) ?? '') }) };
  }
  return { name: op.summary || op.id, request, ...(event ? { event } : {}), response: [] };
}

const operations = operationsOf(spec);
const collection = {
  info: {
    name: `${spec.info.title} v${spec.info.version}`,
    description: `${spec.info.summary ?? ''}\n\nGet a token first (auth › the token request): it stores accessToken for every other request.`,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: BASE_URL },
    { key: 'clientId', value: '' },
    { key: 'clientSecret', value: '' },
    { key: 'accessToken', value: '' },
  ],
  item: groupByTag(spec, operations).map(group => ({
    name: group.name,
    ...(group.description ? { description: group.description } : {}),
    item: group.operations.map(postmanRequest),
  })),
};

// ------------------------------------------------------------------------------------------------------- writing

const out = (rel, text) => {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  process.stdout.write(`wrote ${rel} (${Buffer.byteLength(text).toLocaleString()} bytes)\n`);
};

out('src/app/features/developer/content/developer-docs.generated.json', JSON.stringify(content, null, 1) + '\n');
out('public/developer/openapi-v1.yaml', yamlText);
out('public/developer/openapi-v1.json', JSON.stringify(spec, null, 2) + '\n');
out('public/developer/postman-collection-v1.json', JSON.stringify(collection, null, 2) + '\n');
process.stdout.write(`${operations.length} operations, ${eventTypes.length} event types, ${guides.length} guides\n`);
