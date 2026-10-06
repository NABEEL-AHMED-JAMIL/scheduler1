import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/sources';

/**
 * MIG-248 characterisation baseline: Sources (the sources, the database connections, the data contracts).
 *
 * Pins what these screens show and ask for, per role, so a later change to them fails here by name. The answers are
 * integration-service's, as it gave them on 2026-09-28 for workspace A (2924): source 1000 "LIVE-CHECK 0928
 * customers CSV" and source 1001 (a refused platform-bucket probe), contract 1001 wound_intake v1 beside the shared
 * system contract result_manifest, and one database connection added to show a password as the service sends it:
 * `passwordSet` only, never a value.
 */
const FILE = 'sources';

const SOURCE_1000 = {
  id: 1000, uuid: 'cedebb76-99bd-41c1-a1e9-4819e0b93574', tenantId: 2924, name: 'LIVE-CHECK 0928 customers CSV', kind: 'FILE', format: 'CSV',
  status: 'Active', lastTestOk: null, lastTestedAt: null, dateCreated: '2026-09-29T03:31:47.916+00:00',
};
const ANSWERS: Record<string, unknown> = {
  'GET /dataSource.json/list': { status: 'SUCCESS', message: 'Sources fetched.', data: [
    { id: 1001, uuid: '3d437a06-a25e-48ea-8bc4-4b4522af6934', tenantId: 2924, name: 'LIVE-CHECK platform bucket probe', kind: 'FILE', format: 'JSON',
      status: 'Active', lastTestOk: null, lastTestedAt: null, dateCreated: '2026-09-29T03:31:57.073+00:00' },
    SOURCE_1000,
  ], paging: { totalRecord: 2, pageSize: 50, currentPage: 1 } },
  'GET /dataSource.json/get': { status: 'SUCCESS', message: 'Source fetched.', data: {
    ...SOURCE_1000, description: null, requestId: null, version: null, environmentId: null, rowsPath: null, storageAlias: 'ui-review-s3',
    path: 'sources-live-check/live-customers.csv', connectionId: null, query: null, options: {}, schema: null, fields: null,
    lastTestMessage: null, createdBy: 4537, updatedBy: null, dateUpdated: null,
  } },
  'GET /storage.json/buckets': { status: 'SUCCESS', message: 'Buckets fetched successfully.', data: [
    { label: 'UI-REVIEW LocalStack S3 (fake keys)', bucket: 'ui-review-s3', provider: 'S3', bucketName: 'ui-review-2924', region: 'us-east-1',
      connectionStatus: 'SUCCESS', dateCreated: '2026-09-24T22:39:41.53' },
  ] },
  'GET /dataSource.json/connection/list': { status: 'SUCCESS', message: 'Database connections fetched.', data: [
    { id: 1000, tenantId: 2924, name: 'UI-CHECK warehouse', engine: 'POSTGRES', host: 'db.internal', port: 5432, database: 'dw', username: 'reader',
      passwordSet: true, sslMode: 'REQUIRE', status: 'Active', dateCreated: '2026-09-29T03:40:00.000+00:00', dateUpdated: null },
  ] },
  'GET /dataContract.json/list': { status: 'SUCCESS', message: 'Data contracts fetched.', data: [
    { id: 1001, tenantId: 2924, name: 'wound_intake', direction: 'IN', currentVersion: 1, activeVersion: 1, sensitivity: null, system: false,
      dateCreated: '2026-09-29T03:32:13.857+00:00' },
    { id: 1000, tenantId: 0, name: 'result_manifest', direction: 'OUT', currentVersion: 1, activeVersion: 1, sensitivity: 'INTERNAL', system: true,
      dateCreated: '2026-09-29T03:30:32.035+00:00' },
  ] },
  'GET /dataContract.json/get': { status: 'SUCCESS', message: 'Data contract fetched.', data: {
    contract: { id: 1001, tenantId: 2924, name: 'wound_intake', direction: 'IN', currentVersion: 1, activeVersion: 1, sensitivity: null, system: false,
      dateCreated: '2026-09-29T03:32:13.857+00:00' },
    versions: [{ version: 1, status: 'ACTIVE', createdBy: 4537, dateCreated: '2026-09-29T03:32:13.868+00:00' }],
  } },
  'GET /dataContract.json/version': { status: 'SUCCESS', message: 'Data contract version fetched.', data: {
    contractId: 1001, name: 'wound_intake', version: 1, status: 'ACTIVE', dateCreated: '2026-09-29T03:32:13.868+00:00',
    schema: { type: 'object', required: ['case_id', 'patient'], properties: { case_id: { type: 'string' },
      patient: { type: 'object', required: ['mrn'], properties: { mrn: { type: 'string' } } }, notes: { type: ['string', 'null'] } } },
    fields: [
      { path: 'case_id', type: 'string', nullable: false, required: true }, { path: 'patient', type: 'object', nullable: false, required: true },
      { path: 'patient.mrn', type: 'string', nullable: false, required: true }, { path: 'notes', type: 'string', nullable: true, required: false },
    ],
    sample: { case_id: 'WC-1001', patient: { mrn: 'M-77' }, notes: null },
  } },
};

describe('MIG-248: Sources', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the sources, as a workspace administrator', async () => {
    const v = await visit('/integration/sources', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the sources, as a workspace administrator', v.surface, PINNED);
  });

  it('the sources, as a platform administrator', async () => {
    const v = await visit('/integration/sources', 'PLATFORM_ADMIN', null, ANSWERS);
    pin(FILE, 'the sources, as a platform administrator', v.surface, PINNED);
  });

  it('the sources, as a tenant user with the page', async () => {
    const v = await visit('/integration/sources', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'the sources, as a tenant user with the page', v.surface, PINNED);
  });

  it('the sources, as a tenant user without the page', async () => {
    const v = await visit('/integration/sources', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'the sources, as a tenant user without the page', v.surface, PINNED);
  });

  it('a source\'s row menu', async () => {
    const v = await visit('/integration/sources', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, /^Actions for LIVE-CHECK 0928/);
    pin(FILE, 'a source\'s row menu', overlay(), PINNED);
  });

  it('a file source opened in the side panel', async () => {
    const v = await visit('/integration/sources', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, 'LIVE-CHECK 0928 customers CSV');
    pin(FILE, 'a file source opened in the side panel', overlay(), PINNED);
  });

  it('the database connections, as a workspace administrator', async () => {
    const v = await visit('/integration/sources?tab=connections', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the database connections, as a workspace administrator', v.surface, PINNED);
  });

  it('the data contracts, as a workspace administrator', async () => {
    const v = await visit('/integration/sources?tab=contracts', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the data contracts, as a workspace administrator', v.surface, PINNED);
  });

  it('the data contracts, as a tenant user with the page', async () => {
    const v = await visit('/integration/sources?tab=contracts', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'the data contracts, as a tenant user with the page', v.surface, PINNED);
  });

  it('a contract opened in the side panel', async () => {
    const v = await visit('/integration/sources?tab=contracts', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, 'wound_intake');
    pin(FILE, 'a contract opened in the side panel', overlay(), PINNED);
  });
});
