import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/api-collections';

/**
 * MIG-247 characterisation baseline: API Collections (the list and one collection).
 *
 * Pins what these screens show and ask for, per role, so a later change to them fails here by name. The
 * answers are integration-service's, as it gave them on 2026-09-28 for workspace A's collection 1000
 * ("LIVE-CHECK 0928 httpbin"), with one environment added to show a secret as the service sends it: no value,
 * `configured` only.
 */
const FILE = 'api-collections';

const COLLECTION = {
  collectionId: 1000, collectionUuid: 'a07ab588-3b8f-45df-889e-d0db7c7ad9d8', tenantId: 2924, name: 'LIVE-CHECK 0928 httpbin',
  description: 'MIG-227 live check', sourceFormat: 'MANUAL', sensitivity: 'INTERNAL', currentVersion: 3, status: 'Active',
  folderCount: 0, requestCount: 2, createdBy: 4537, updatedBy: 4537,
  dateCreated: '2026-09-29T02:26:22.327+00:00', dateUpdated: '2026-09-29T02:26:32.018+00:00',
};
const ANSWERS: Record<string, unknown> = {
  'GET /apiCollection.json/list': { status: 'SUCCESS', message: 'API collections fetched.', data: [COLLECTION],
    paging: { totalRecord: 1, pageSize: 50, currentPage: 1 } },
  'GET /apiCollection.json/get': { status: 'SUCCESS', message: 'API collection fetched.', data: {
    collection: COLLECTION, folders: [],
    requests: [
      { requestId: 1000, requestUuid: '28afcce6-fe2c-4782-bbe8-b21c8136d017', folderId: null, name: 'Get status', method: 'GET',
        urlTemplate: 'https://example.com/', authMode: 'NONE', bodyType: 'NONE', timeoutMs: 30000, aiCallable: false, aiWriteAllowed: false,
        enabled: true, sortOrder: 0 },
      { requestId: 1001, requestUuid: '4438fe97-6c83-4c57-9b8a-59affaa601c0', folderId: null, name: 'Metadata probe', method: 'GET',
        urlTemplate: 'http://169.254.169.254/latest/meta-data/', authMode: 'NONE', bodyType: 'NONE', timeoutMs: 30000, aiCallable: false,
        aiWriteAllowed: false, enabled: true, sortOrder: 0 },
    ],
    environments: [{ environmentId: 41, name: 'Prod', isDefault: true, variables: [
      { key: 'baseUrl', secret: false, value: 'https://example.com', configured: true },
      { key: 'token', secret: true, value: null, configured: true },
    ] }],
    versions: [
      { version: 3, createdBy: 4537, dateCreated: '2026-09-29T02:26:32.017+00:00' },
      { version: 2, createdBy: 4537, dateCreated: '2026-09-29T02:26:22.486+00:00' },
      { version: 1, createdBy: 4537, dateCreated: '2026-09-29T02:26:22.381+00:00' },
    ],
    access: [], imports: [],
  } },
  'GET /apiCollection.json/version': { status: 'SUCCESS', message: 'API collection version fetched.', data: {
    collectionId: 1000, version: 3, createdBy: 4537, dateCreated: '2026-09-29T02:26:32.017+00:00',
    snapshot: { collection: { name: 'LIVE-CHECK 0928 httpbin', defaultAuth: null } } } },
  'GET /apiCollection.json/usage': { status: 'SUCCESS', message: 'API collection usage fetched.', data: [] },
};

describe('MIG-247: API Collections', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the list, as a workspace administrator', async () => {
    const v = await visit('/integration/api-collections', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the list, as a workspace administrator', v.surface, PINNED);
  });

  it('the list, as a platform administrator', async () => {
    const v = await visit('/integration/api-collections', 'PLATFORM_ADMIN', null, ANSWERS);
    pin(FILE, 'the list, as a platform administrator', v.surface, PINNED);
  });

  it('the list, as a tenant user with the page', async () => {
    const v = await visit('/integration/api-collections', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'the list, as a tenant user with the page', v.surface, PINNED);
  });

  it('the list, as a tenant user without the page', async () => {
    const v = await visit('/integration/api-collections', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'the list, as a tenant user without the page', v.surface, PINNED);
  });

  it('a collection\'s row menu', async () => {
    const v = await visit('/integration/api-collections', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, /^Actions for /);
    pin(FILE, 'a collection\'s row menu', overlay(), PINNED);
  });

  it('one collection, as a workspace administrator', async () => {
    const v = await visit('/integration/api-collections/1000', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'one collection, as a workspace administrator', v.surface, PINNED);
  });

  it('one collection, as a tenant user with the page', async () => {
    const v = await visit('/integration/api-collections/1000', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'one collection, as a tenant user with the page', v.surface, PINNED);
  });

  it('an API opened in the side panel', async () => {
    const v = await visit('/integration/api-collections/1000', 'TENANT_ADMIN', null, {
      ...ANSWERS,
      'GET /apiCollection.json/request/get': { status: 'SUCCESS', message: 'API request fetched.', data: {
        requestId: 1000, requestUuid: '28afcce6-fe2c-4782-bbe8-b21c8136d017', collectionId: 1000, folderId: null, name: 'Get status',
        description: null, method: 'GET', urlTemplate: 'https://example.com/', headers: [], queryParams: [], bodyType: 'NONE',
        bodyTemplate: null, authMode: 'NONE', paramsSchema: null, extractRules: null, assertRules: null, pagination: null, timeoutMs: 30000,
        retry: null, aiCallable: false, aiWriteAllowed: false, enabled: true, sortOrder: 0, collectionVersion: 3, createdBy: 4537,
        updatedBy: null, dateCreated: '2026-09-29T02:26:22.474+00:00', dateUpdated: null } },
    });
    await click(v, 'Get status');
    pin(FILE, 'an API opened in the side panel', overlay(), PINNED);
  });
});
