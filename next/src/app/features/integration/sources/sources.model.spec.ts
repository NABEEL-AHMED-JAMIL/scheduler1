import { describe, it, expect } from 'vitest';
import {
  blankConnection, blankSource, connectionEditOf, connectionSaveOf, contractSaveOf, isSchemaReadOnly, kindLabel, parseSample,
  requiredPaths, schemaRows, sourceEditOf, sourceSaveOf, sourceTarget, SourceDetail,
} from './sources.model';

/**
 * MIG-248: the Sources page's pure rules. The service (integration-service, MIG-229/MIG-233) has the last word on
 * every one of them; these catch what it would refuse before it is asked, and keep the business rule the page is
 * built around: a database password is write-only -- never read, never shown, sent only when a person types one.
 */
const FILE_DETAIL: SourceDetail = {
  id: 1000, uuid: 'cedebb76', tenantId: 2924, name: 'LIVE-CHECK 0928 customers CSV', description: null, kind: 'FILE', format: 'CSV',
  requestId: null, version: null, environmentId: null, rowsPath: null, storageAlias: 'ui-review-s3',
  path: 'sources-live-check/live-customers.csv', connectionId: null, query: null, options: {}, schema: null, fields: null,
  lastTestOk: null, lastTestMessage: null, lastTestedAt: null, status: 'Active',
};

describe('a source, opened and saved', () => {
  it('opens a saved file source with its storage, path, format and options', () => {
    const e = sourceEditOf({ ...FILE_DETAIL, options: { delimiter: ';', header: false } });
    expect(e).toMatchObject({ sourceId: 1000, kind: 'FILE', storageAlias: 'ui-review-s3', path: 'sources-live-check/live-customers.csv',
      format: 'CSV', delimiter: ';', header: false, status: 'Active' });
  });

  it('saves a file source as /dataSource.json/save takes it, with only the options its format reads', () => {
    const e = { ...blankSource('FILE'), name: ' UI-CHECK customers ', storageAlias: 'ui-review-s3', path: 'a/b.csv', format: 'CSV', delimiter: ';' };
    expect(sourceSaveOf(e)).toEqual({ body: {
      sourceId: null, name: 'UI-CHECK customers', description: null, kind: 'FILE', status: 'Active',
      storageAlias: 'ui-review-s3', path: 'a/b.csv', format: 'CSV', options: { delimiter: ';' },
    } });
    const json = { ...e, format: 'JSON', fileRowsPath: '$.items', header: false };
    expect((sourceSaveOf(json) as { body: Record<string, unknown> }).body['options']).toEqual({ rowsPath: '$.items' });
  });

  it('keeps the header option only when it is off (the service reads a header row by default)', () => {
    const e = { ...blankSource('FILE'), name: 'x', storageAlias: 'a', path: 'b.csv', format: 'CSV', header: false };
    expect((sourceSaveOf(e) as { body: Record<string, unknown> }).body['options']).toEqual({ header: false });
  });

  it('refuses what the service would: a folder for a FILE source, a leading slash, a missing storage', () => {
    const base = { ...blankSource('FILE'), name: 'x', storageAlias: 'ui-review-s3', format: 'CSV' };
    expect(sourceSaveOf({ ...base, path: 'folder/' })).toEqual({ error: 'A file source names one file; a folder is a Bucket source.' });
    expect(sourceSaveOf({ ...base, path: '/a.csv' })).toEqual({ error: 'The path is inside the connection: no leading "/", no "..".' });
    expect(sourceSaveOf({ ...base, path: '../a.csv' })).toEqual({ error: 'The path is inside the connection: no leading "/", no "..".' });
    expect(sourceSaveOf({ ...base, storageAlias: '', path: 'a.csv' })).toEqual({ error: 'Pick a storage connection.' });
    expect(sourceSaveOf({ ...base, name: ' ', path: 'a.csv' })).toEqual({ error: 'Give the source a name.' });
  });

  it('lets a Bucket source read a whole prefix, even an empty one', () => {
    const e = { ...blankSource('BUCKET'), name: 'x', storageAlias: 'ui-review-s3', path: '', format: 'JSONL' };
    expect(sourceSaveOf(e)).toMatchObject({ body: { kind: 'BUCKET', path: '', format: 'JSONL', options: {} } });
  });

  it('saves an API source with the request, the version it pins, and its environment', () => {
    const e = { ...blankSource('API'), name: 'Patients', collectionId: 7, requestId: 70, version: 3, environmentId: 41, rowsPath: '$.items' };
    expect(sourceSaveOf(e)).toEqual({ body: {
      sourceId: null, name: 'Patients', description: null, kind: 'API', status: 'Active',
      requestId: 70, version: 3, environmentId: 41, rowsPath: '$.items', options: {},
    } });
    expect(sourceSaveOf({ ...e, requestId: null })).toEqual({ error: 'Pick the API the source calls.' });
    expect(sourceSaveOf({ ...e, version: null })).toEqual({ error: 'Pick the collection version the source runs.' });
  });

  it('saves a database source with its connection and a query that only reads', () => {
    const e = { ...blankSource('DATABASE'), name: 'Orders', connectionId: 5, query: ' select * from orders; ' };
    expect(sourceSaveOf(e)).toEqual({ body: {
      sourceId: null, name: 'Orders', description: null, kind: 'DATABASE', status: 'Active', connectionId: 5, query: 'select * from orders;', options: {},
    } });
    expect(sourceSaveOf({ ...e, connectionId: null })).toEqual({ error: 'Pick a database connection.' });
    expect(sourceSaveOf({ ...e, query: 'delete from orders' })).toEqual({ error: 'A source\'s query only reads: start it with SELECT, WITH, VALUES or TABLE.' });
  });

  it('names a platform administrator\'s new source\'s workspace, and never an existing one\'s', () => {
    const e = { ...blankSource('DATABASE'), name: 'Orders', connectionId: 5, query: 'select 1', tenantId: 2924 };
    expect((sourceSaveOf(e) as { body: Record<string, unknown> }).body['tenantId']).toBe(2924);
    expect((sourceSaveOf({ ...e, sourceId: 9 }) as { body: Record<string, unknown> }).body['tenantId']).toBeUndefined();
  });

  it('says what a source points at, in a line', () => {
    expect(sourceTarget(FILE_DETAIL)).toBe('ui-review-s3 · sources-live-check/live-customers.csv');
    expect(sourceTarget({ ...FILE_DETAIL, kind: 'DATABASE', storageAlias: null, path: null, query: 'select 1' })).toBe('select 1');
    expect(kindLabel('BUCKET')).toBe('Bucket folder');
    expect(kindLabel('FILE')).toBe('File');
  });
});

describe('a database connection: the password is write-only', () => {
  const ROW = { id: 5, tenantId: 2924, name: 'Warehouse', engine: 'POSTGRES', host: 'db.internal', port: 5432, database: 'dw',
    username: 'reader', passwordSet: true, sslMode: 'REQUIRE', status: 'Active' };

  it('opens with the password box empty, whatever the service sent', () => {
    const e = connectionEditOf({ ...ROW, password: 'leaked' } as never);
    expect(e.password).toBe('');
    expect(e.passwordSet).toBe(true);
    expect(e.replacing).toBe(false);
  });

  it('keeps a stored password by leaving it out of the save', () => {
    const out = connectionSaveOf(connectionEditOf(ROW));
    expect('body' in out && 'password' in out.body).toBe(false);
    expect(out).toEqual({ body: { connectionId: 5, name: 'Warehouse', engine: 'POSTGRES', host: 'db.internal', port: 5432, database: 'dw',
      username: 'reader', sslMode: 'REQUIRE' } });
  });

  it('sends a replacement once it is typed, and nothing when Replace was pressed and left empty', () => {
    const replacing = { ...connectionEditOf(ROW), replacing: true };
    expect('password' in (connectionSaveOf(replacing) as { body: object }).body).toBe(false);
    expect((connectionSaveOf({ ...replacing, password: 'n3w' }) as { body: Record<string, unknown> }).body['password']).toBe('n3w');
  });

  it('asks a new connection for everything the service needs', () => {
    expect(connectionSaveOf({ ...blankConnection(), name: 'x', host: 'h', database: 'd', username: '' })).toEqual({ error: 'Give the user it signs in as.' });
    expect(connectionSaveOf({ ...blankConnection(), name: 'x', host: 'h', database: 'd', username: 'u', port: '70000' })).toEqual({ error: 'The port is between 1 and 65535.' });
    expect(connectionSaveOf({ ...blankConnection(), name: 'x', host: 'h', database: 'd', username: 'u', password: 'p', tenantId: 2924 })).toEqual({ body: {
      connectionId: null, tenantId: 2924, name: 'x', engine: 'POSTGRES', host: 'h', port: 5432, database: 'd', username: 'u', sslMode: 'REQUIRE', password: 'p' } });
  });
});

describe('a schema, read as fields', () => {
  it('lists the service\'s fields as they are, with a readable type', () => {
    const rows = schemaRows(null, [{ path: 'b.c', type: 'string', nullable: true, required: false }, { path: 'a', type: 'integer', nullable: false, required: true }]);
    expect(rows).toEqual([
      { path: 'b.c', type: 'string', nullable: true, required: false },
      { path: 'a', type: 'integer', nullable: false, required: true },
    ]);
  });

  it('walks a JSON Schema when no fields came with it: nested objects and array items, required from each level', () => {
    const schema = { type: 'object', required: ['id', 'items'], properties: {
      id: { type: 'integer' }, note: { type: ['string', 'null'] },
      items: { type: 'array', items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, qty: { type: 'number' } } } },
    } };
    expect(schemaRows(schema, null)).toEqual([
      { path: 'id', type: 'integer', nullable: false, required: true },
      { path: 'note', type: 'string', nullable: true, required: false },
      { path: 'items', type: 'array', nullable: false, required: true },
      { path: 'items[].sku', type: 'string', nullable: false, required: true },
      { path: 'items[].qty', type: 'number', nullable: false, required: false },
    ]);
  });

  it('reads nothing from something that is not a schema', () => {
    expect(schemaRows('nope', null)).toEqual([]);
    expect(schemaRows(null, null)).toEqual([]);
  });
});

describe('a contract, proposed from a sample', () => {
  it('takes pasted JSON, and says what is wrong with anything else', () => {
    expect(parseSample('{"a": 1}')).toEqual({ value: { a: 1 } });
    expect(parseSample('[{"a": 1}]')).toEqual({ value: [{ a: 1 }] });
    expect(parseSample('')).toEqual({ error: 'Paste a JSON sample first.' });
    expect(parseSample('{a: 1}')).toEqual({ error: 'The sample is not valid JSON.' });
    expect(parseSample('42')).toEqual({ error: 'The sample is a JSON object or a list of them.' });
  });

  it('starts with the fields the proposal marked required', () => {
    expect(requiredPaths([{ path: 'a', type: 'integer', nullable: false, required: true }, { path: 'b', type: 'string', nullable: true, required: false }]))
      .toEqual(['a']);
  });

  it('saves v1 of a new contract with its name, direction, the schema proposed and the fields marked required', () => {
    const schema = { type: 'object', properties: { a: { type: 'integer' } } };
    expect(contractSaveOf({ contractId: null, name: ' UI-CHECK orders ', direction: 'IN', sensitivity: '', schema, required: ['a'], sample: { a: 1 } }))
      .toEqual({ body: { contractId: null, name: 'UI-CHECK orders', direction: 'IN', sensitivity: null, schema, required: ['a'], sample: { a: 1 }, activate: true } });
  });

  it('saves a new version of an existing contract without renaming it', () => {
    const out = contractSaveOf({ contractId: 1001, name: 'wound_intake', direction: 'IN', sensitivity: '', schema: { type: 'object' }, required: [], sample: null, activate: false });
    expect(out).toEqual({ body: { contractId: 1001, schema: { type: 'object' }, required: [], sample: null, activate: false } });
  });

  it('refuses a name the service would refuse, and a contract with no schema', () => {
    expect(contractSaveOf({ contractId: null, name: '-x', direction: 'IN', sensitivity: '', schema: {}, required: [], sample: null }))
      .toEqual({ error: 'A contract\'s name starts with a letter or digit and holds letters, digits, spaces, "_", "." and "-".' });
    expect(contractSaveOf({ contractId: null, name: 'x', direction: 'IN', sensitivity: '', schema: null, required: [], sample: null }))
      .toEqual({ error: 'Propose a schema from a sample first.' });
  });

  it('knows the shared system contracts are read-only', () => {
    expect(isSchemaReadOnly({ system: true })).toBe(true);
    expect(isSchemaReadOnly({ system: false })).toBe(false);
  });
});
