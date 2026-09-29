import { describe, it, expect, afterEach } from 'vitest';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import {
  PairRow, VariableEdit, authSettingsFor, blankRequest, brunoFiles, effectiveAuthMode, fromPairs, literalSecrets,
  parseJsonField, reportRows, requestSaveOf, toPairs, variableEdits, variableSaves,
} from './api-collections.model';

/**
 * MIG-247: what the API Collections pages send and show, as plain functions. The field names are
 * integration-service's pinned contract (src/test/resources/contract/api-collections-console.json);
 * the one business rule -- no secret value ever reaches the browser -- is held here as much as in
 * the dialogs: a secret variable is edited as "configured, Replace", and its value is only ever sent.
 */
describe('API Collections -- headers and query parameters', () => {
  it('reads both shapes the service stores: a list of pairs, and an object', () => {
    expect(toPairs([{ key: 'Accept', value: 'application/json', enabled: false }])).toEqual([
      { key: 'Accept', value: 'application/json', enabled: false },
    ]);
    expect(toPairs({ limit: '50', page: 2 })).toEqual([
      { key: 'limit', value: '50', enabled: true },
      { key: 'page', value: '2', enabled: true },
    ]);
    expect(toPairs(null)).toEqual([]);
  });

  it('sends a list of pairs, dropping blank rows and keeping a disabled one as disabled', () => {
    const rows: PairRow[] = [
      { key: ' Accept ', value: 'application/json', enabled: true },
      { key: '', value: 'orphan', enabled: true },
      { key: 'X-Debug', value: '1', enabled: false },
    ];
    expect(fromPairs(rows)).toEqual([
      { key: 'Accept', value: 'application/json' },
      { key: 'X-Debug', value: '1', enabled: false },
    ]);
  });

  it('names a credential written in plain text, which the service would refuse', () => {
    expect(literalSecrets([
      { key: 'Authorization', value: 'Bearer abc123', enabled: true },
      { key: 'X-Api-Key', value: '{{apiKey}}', enabled: true },
      { key: 'Proxy-Authorization', value: 'Bearer {{proxyToken}}', enabled: true },
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'token', value: '', enabled: true },
    ])).toEqual(['Authorization']);
  });
});

describe('API Collections -- JSON fields', () => {
  it('reads blank as nothing, and valid JSON as its value', () => {
    expect(parseJsonField('', 'Extract rules')).toEqual({ value: null });
    expect(parseJsonField(' {"id":"$.id"} ', 'Extract rules')).toEqual({ value: { id: '$.id' } });
  });

  it('says which field is not JSON', () => {
    expect(parseJsonField('{id:', 'Params schema').error).toBe('Params schema is not valid JSON.');
  });

  it('refuses a scalar where an object or a list belongs', () => {
    expect(parseJsonField('42', 'Assert rules').error).toBe('Assert rules must be a JSON object or list.');
  });
});

describe('API Collections -- saving a request', () => {
  it('sends the contract\'s field names, with pairs as lists and JSON as JSON', () => {
    const edit = blankRequest(11);
    edit.name = ' List patients ';
    edit.urlTemplate = '{{baseUrl}}/patients';
    edit.headers = [{ key: 'Accept', value: 'application/json', enabled: true }];
    edit.queryParams = [{ key: 'limit', value: '50', enabled: true }];
    edit.extractRules = '{"first":"$.items[0].id"}';
    edit.retryAttempts = '2';
    edit.pagingType = 'PAGE';
    edit.pagingParam = 'page';
    edit.pagingItemsPath = '$.items';
    const out = requestSaveOf(edit);
    expect('error' in out).toBe(false);
    const body = (out as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort()).toEqual(['aiCallable', 'aiWriteAllowed', 'assertRules', 'authMode', 'bodyTemplate', 'bodyType',
      'collectionId', 'description', 'enabled', 'extractRules', 'folderId', 'headers', 'method', 'name', 'pagination', 'paramsSchema',
      'queryParams', 'requestId', 'retry', 'sortOrder', 'timeoutMs', 'urlTemplate'].sort());
    expect(body['name']).toBe('List patients');
    expect(body['headers']).toEqual([{ key: 'Accept', value: 'application/json' }]);
    expect(body['extractRules']).toEqual({ first: '$.items[0].id' });
    expect(body['retry']).toEqual({ maxAttempts: 2 });
    expect(body['pagination']).toEqual({ type: 'PAGE', param: 'page', itemsPath: '$.items' });
    expect(body['requestId']).toBeNull();
  });

  it('keeps what the editor does not show in retry and paging', () => {
    const edit = blankRequest(11);
    edit.name = 'x'; edit.urlTemplate = 'https://api.example.test';
    edit.retryExtra = { retryNonIdempotent: true, maxBackoffMs: 8000 };
    edit.retryAttempts = '3'; edit.retryBackoffMs = '500';
    const body = (requestSaveOf(edit) as { body: Record<string, unknown> }).body;
    expect(body['retry']).toEqual({ retryNonIdempotent: true, maxBackoffMs: 8000, maxAttempts: 3, backoffMs: 500 });
  });

  it('asks for a name and a URL before anything is sent', () => {
    expect((requestSaveOf(blankRequest(11)) as { error: string }).error).toBe('Give the API a name.');
    const edit = blankRequest(11); edit.name = 'x';
    expect((requestSaveOf(edit) as { error: string }).error).toBe('Give the API a URL.');
  });

  it('holds the timeout to what the service accepts', () => {
    const edit = blankRequest(11); edit.name = 'x'; edit.urlTemplate = 'https://a.test'; edit.timeoutSeconds = '400';
    expect((requestSaveOf(edit) as { error: string }).error).toBe('The timeout is between 1 and 300 seconds.');
  });

  it('refuses a plain-text credential before the service does, naming it', () => {
    const edit = blankRequest(11); edit.name = 'x'; edit.urlTemplate = 'https://a.test';
    edit.headers = [{ key: 'Authorization', value: 'Bearer abc', enabled: true }];
    expect((requestSaveOf(edit) as { error: string }).error)
      .toBe('Authorization holds a credential in plain text. Put it in an environment as a secret and write {{name}} here.');
  });

  it('lets the AI write only through a request it may call', () => {
    const edit = blankRequest(11); edit.name = 'x'; edit.urlTemplate = 'https://a.test'; edit.aiWriteAllowed = true;
    expect((requestSaveOf(edit) as { error: string }).error).toBe('The AI may write through an API only if it may call it.');
  });
});

describe('API Collections -- auth comes from the collection', () => {
  const defaultAuth = { type: 'BEARER', bearer: { token: '{{token}}' }, apikey: { key: 'X-Api-Key', value: '{{k}}', in: 'header' } };

  it('resolves Inherit to the collection\'s own scheme', () => {
    expect(effectiveAuthMode('INHERIT', defaultAuth)).toBe('BEARER');
    expect(effectiveAuthMode('INHERIT', null)).toBe('NONE');
    expect(effectiveAuthMode('APIKEY', defaultAuth)).toBe('APIKEY');
  });

  it('shows a scheme\'s settings from its own block', () => {
    expect(authSettingsFor('APIKEY', defaultAuth)).toEqual([['key', 'X-Api-Key'], ['value', '{{k}}'], ['in', 'header']]);
    expect(authSettingsFor('NONE', defaultAuth)).toEqual([]);
  });
});

describe('API Collections -- a secret never reaches the browser', () => {
  it('reads a secret as configured, never as a value, even if one were sent', () => {
    const edits = variableEdits([
      { key: 'baseUrl', secret: false, value: 'https://api.example.test', configured: true },
      { key: 'token', secret: true, value: 'LEAKED', configured: true } as never,
    ]);
    expect(edits[1]).toEqual({ key: 'token', secret: true, value: '', configured: true, replacing: false, wasSecret: true });
  });

  it('sends a kept secret without a value, and a replaced one with the new value only', () => {
    const rows: VariableEdit[] = [
      { key: 'baseUrl', secret: false, value: 'https://api.example.test', configured: true, replacing: false, wasSecret: false },
      { key: 'token', secret: true, value: '', configured: true, replacing: false, wasSecret: true },
      { key: 'clientSecret', secret: true, value: 'new-one', configured: true, replacing: true, wasSecret: true },
      { key: 'fresh', secret: true, value: 's3', configured: false, replacing: false, wasSecret: false },
      { key: '  ', secret: false, value: 'dropped', configured: false, replacing: false, wasSecret: false },
    ];
    expect(variableSaves(rows)).toEqual([
      { key: 'baseUrl', secret: false, value: 'https://api.example.test' },
      { key: 'token', secret: true },
      { key: 'clientSecret', secret: true, value: 'new-one' },
      { key: 'fresh', secret: true, value: 's3' },
    ]);
  });

  it('keeps a secret whose Replace was opened and left empty', () => {
    expect(variableSaves([{ key: 'token', secret: true, value: '', configured: true, replacing: true, wasSecret: true }]))
      .toEqual([{ key: 'token', secret: true }]);
  });
});

describe('API Collections -- the import report', () => {
  it('lists every entry under what happened to it, the ones needing a look first', () => {
    const rows = reportRows({
      counts: { imported: 1, converted: 1, review: 1, skipped: 1 },
      imported: [{ item: 'Patients/List', note: 'GET' }],
      converted: [{ item: 'Patients/List', note: 'test script → assert rule' }],
      review: [{ item: 'Auth', note: 'moved token into a secret variable' }],
      skipped: [{ item: 'Upload', note: 'file bodies are not imported' }],
    });
    expect(rows.map(r => `${r.kind}: ${r.item}`)).toEqual([
      'Review: Auth', 'Skipped: Upload', 'Converted: Patients/List', 'Imported: Patients/List',
    ]);
  });

  it('is empty for a report that is missing', () => {
    expect(reportRows(null)).toEqual([]);
  });
});

describe('API Collections -- reading a Bruno folder in the browser', () => {
  const file = (name: string, text: string, relative = '') =>
    Object.assign(new File([text], name), relative ? { webkitRelativePath: relative } : {});

  it('sends each file by its path inside the folder, the folder\'s own name dropped', async () => {
    const files = await brunoFiles([
      file('bruno.json', '{"name":"Clinic"}', 'Clinic/bruno.json'),
      file('list.bru', 'meta { name: List }', 'Clinic/patients/list.bru'),
      file('notes.txt', 'ignored', 'Clinic/notes.txt'),
    ]);
    expect(files).toEqual([
      { path: 'bruno.json', content: '{"name":"Clinic"}' },
      { path: 'patients/list.bru', content: 'meta { name: List }' },
    ]);
  });

  it('takes loose .bru files by their names', async () => {
    expect(await brunoFiles([file('get.bru', 'meta {}')])).toEqual([{ path: 'get.bru', content: 'meta {}' }]);
  });
});

describe('API Collections -- times from integration-service', () => {
  const env = (globalThis as any).process.env as Record<string, string | undefined>;
  const before = env['TZ'];
  afterEach(() => { if (before === undefined) delete env['TZ']; else env['TZ'] = before; });

  it('renders an ISO time with an offset at its own instant, in the console\'s 24-hour format', () => {
    env['TZ'] = 'America/Chicago';
    const pipe = new ServerTimePipe('en-US');
    // 02:26 UTC on the 29th is 21:26 on the 28th in Chicago: taken at its word, not read as Chicago wall-clock.
    expect(pipe.transform('2026-09-29T02:26:22.327+00:00', 'dateTime')).toBe('28 Sep 2026, 21:26');
    expect(pipe.transform('2026-09-29T02:26:22.327+00:00', 'date')).toBe('28 Sep 2026');
  });
});
