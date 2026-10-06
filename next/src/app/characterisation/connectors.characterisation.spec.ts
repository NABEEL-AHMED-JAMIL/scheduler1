import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/connectors';

/**
 * MIG-292 characterisation baseline: Connector Hub (the gallery, the connections with their sync health, a connection's
 * panel). The answers are integration-service's, as it gave them on 2026-10-01 for workspace A (2924): connection 1000
 * "Shop DB (demo)" (PostgreSQL, two streams, one schema change waiting) and the gallery with PostgreSQL connected, HubSpot's
 * app not registered and MySQL not available yet. A secret is answered by name only (secretsSet), never a value.
 */
const FILE = 'connectors';
const PAGES = [...ALL_PAGES, 'connector-hub'];

const SPEC = (key: string, label: string, category: string, summary: string, extra: Record<string, unknown> = {}) => ({
  key, label, category, summary, auth: 'SECRET', oauthProvider: null, sourceKind: 'table', modes: ['FULL', 'INCREMENTAL', 'CDC'], fields: [
    { name: 'host', label: 'Host', type: 'text', required: true, secret: false, help: null, options: [], placeholder: null },
    { name: 'password', label: 'Password', type: 'password', required: true, secret: true, help: 'Kept sealed; never shown again.', options: [],
      placeholder: null }],
  available: true, unavailableReason: null, ...extra,
});
const CONNECTION = {
  id: 1000, uuid: '7d1c', tenantId: 2924, name: 'Shop DB (demo)', connectorKey: 'postgres', connectorLabel: 'PostgreSQL', category: 'DATABASE',
  config: { host: 'demo-source-db', port: 5432, database: 'shop', username: 'demo_reader', sslMode: 'DISABLE' }, secretsSet: ['password'],
  authKind: 'SECRET', oauthProvider: null, oauthStatus: null, oauthConnectedAt: null, targetAlias: 'ui-review-s3', targetPrefix: null,
  folder: 'connectors/1000/', lastTestAt: '2026-09-30T23:50:21.1', lastTestOk: true, lastError: null, lastErrorFix: null, lastErrorAt: null,
  status: 'Active', health: { streams: 2, rows: 296, lastSyncAt: '2026-09-28T11:59:30', lastStatus: 'Succeeded', failed24h: 0, schemaPending: true,
    lagSeconds: 42, modes: 'CDC,INCREMENTAL', scheduleMinutes: 1 }, dateCreated: '2026-09-30T23:50:20.9', dateUpdated: null,
};
const ANSWERS: Record<string, unknown> = {
  'GET /connectorHub.json/connectors': { status: 'SUCCESS', message: 'Connectors fetched.', data: [
    { spec: SPEC('postgres', 'PostgreSQL', 'DATABASE', 'Database · incremental (CDC)'), oauthRegistered: true, connections: 1 },
    { spec: SPEC('mysql', 'MySQL', 'DATABASE', 'Database · incremental', { available: false, fields: [], modes: [],
      unavailableReason: 'the MySQL JDBC driver is not part of the platform yet (owner decision: add the driver and a test database).' }),
      oauthRegistered: true, connections: 0 },
    { spec: SPEC('hubspot', 'HubSpot', 'SAAS', 'SaaS · CRM objects', { auth: 'OAUTH', oauthProvider: 'hubspot', fields: [] }), oauthRegistered: false,
      connections: 0 },
    { spec: SPEC('files', 'Files in storage', 'FILES', 'Files · S3, MinIO, Azure, FTP/FTPS folders', { auth: 'NONE', sourceKind: 'file',
      modes: ['FULL', 'INCREMENTAL'], fields: [] }), oauthRegistered: true, connections: 0 },
    { spec: SPEC('rest', 'REST API', 'API', 'Uses API Collections', { auth: 'NONE', sourceKind: 'endpoint', modes: ['FULL', 'INCREMENTAL'],
      fields: [] }), oauthRegistered: true, connections: 0 },
  ] },
  'GET /connectorHub.json/connection/list': { status: 'SUCCESS', message: 'Connections fetched.', data: [CONNECTION] },
  'GET /connectorHub.json/connection/get': { status: 'SUCCESS', message: 'Connection fetched.', data: {
    connection: CONNECTION,
    streams: [
      { id: 1001, connectionId: 1000, name: 'public.customers', sourceKind: 'table', mode: 'INCREMENTAL', cursorColumn: 'updated_at',
        primaryKey: null, scheduleMinutes: 60, detectSensitive: true, registerCatalog: true, enabled: true, options: {},
        acceptedSchema: [{ name: 'id', type: 'integer' }, { name: 'email', type: 'string' }],
        pendingSchema: { added: [{ name: 'segment', type: 'string' }], dropped: [], changed: [], columns: [], summary: 'The source added segment.',
          detectedAt: '2026-09-28T11:51:00' },
        sensitiveColumns: [{ column: 'email', tag: 'email', level: 'Confidential' }], stateCursor: '2026-10-01 04:50:53.01709',
        stateUpdatedAt: '2026-09-28T11:51:00', caughtUpAt: '2026-09-28T11:51:00', lastSyncAt: '2026-09-28T11:51:00', nextRunAt: null,
        runRequested: false, rowsTotal: 42, lagSeconds: 77, sourceId: null, folder: 'connectors/1000/public.customers/' },
    ],
    runs: [
      { id: 1004, syncId: '03a6', streamId: 1001, stream: 'public.customers', mode: 'INCREMENTAL', trigger: 'MANUAL', status: 'Succeeded',
        startedAt: '2026-09-28T11:51:00', finishedAt: '2026-09-28T11:51:01', rows: 2, bytes: 230, parts: 1, cursorFrom: null, cursorTo: null,
        targetAlias: 'ui-review-s3', targetKey: 'connectors/1000/public.customers/incremental/', caughtUp: true, error: null,
        errorFix: 'The source added segment. Waiting for acceptance; the new columns are not read yet.', resumedCount: 0 },
    ],
  } },
};

describe('MIG-292: Connector Hub', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the gallery and connections, as a workspace administrator', async () => {
    const v = await visit('/integration/connectors', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the gallery and connections, as a workspace administrator', v.surface, PINNED);
  });

  it('the gallery and connections, as a tenant user with the page', async () => {
    const v = await visit('/integration/connectors', 'TENANT_USER', PAGES, ANSWERS);
    pin(FILE, 'the gallery and connections, as a tenant user with the page', v.surface, PINNED);
  });

  it('the page, as a tenant user without it', async () => {
    const v = await visit('/integration/connectors', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'the page, as a tenant user without it', v.surface, PINNED);
  });

  it('a connection, as a workspace administrator', async () => {
    const v = await visit('/integration/connectors', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, /Shop DB \(demo\)/);
    pin(FILE, 'a connection, as a workspace administrator', { ...v.surface, panel: overlay() }, PINNED);
  });
});
