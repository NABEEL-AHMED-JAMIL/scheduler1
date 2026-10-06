import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/inbox';

/**
 * MIG-239 characterisation baseline: Documents › Inbox.
 *
 * Pins what the inbox page shows and asks for, per role, so a later change to it fails here by name. The answers are
 * storage-service's, as it gave them on 2026-09-29 for workspace 2924 (inbox on ui-review-s3, one arrival), and its
 * not-configured answer.
 */
const FILE = 'inbox';

const CONFIGURED: Record<string, unknown> = {
  'GET /storage.json/inbox': { status: 'SUCCESS', message: 'Inbox fetched successfully.', data: {
    configured: true, alias: 'ui-review-s3', connectionName: 'UI-REVIEW LocalStack S3 (fake keys)', connectionActive: true,
    maxBytes: 104857600, platformMaxBytes: 104857600 } },
  'GET /storage.json/inbox/files': { status: 'SUCCESS', message: 'Inbox files fetched successfully.', data: [{
    arrivalId: '778ed857-81ce-4915-821d-ea25b22ba764', alias: 'ui-review-s3',
    key: 'intake/2026/09/28/778ed857-81ce-4915-821d-ea25b22ba764-live-customers.csv', fileName: 'live-customers.csv', bytes: 115,
    contentType: 'text/csv', sha256: '4e847b8e719b2acad7fdd61ccb4f9328d3c305e9f9b09c30b0915fdb2602c6a5', uploadedBy: 4537,
    uploadedAt: '2026-09-28T23:41:23.054311' }] },
  'GET /appUser.json/listUsers': { status: 'SUCCESS', message: 'Users fetched successfully.', data: [
    { appUserId: 4537, fullName: 'Claude Demo Admin', username: 'ui-review-admin@demo.local' },
    { appUserId: 4597, fullName: 'Alex', username: 'ui-review-user@demo.local' }] },
  'GET /storage.json/buckets': { status: 'SUCCESS', message: 'Buckets fetched successfully.', data: [{
    label: 'UI-REVIEW LocalStack S3 (fake keys)', bucket: 'ui-review-s3', provider: 'S3', bucketName: 'ui-review-2924',
    region: 'us-east-1', connectionStatus: 'SUCCESS' }] },
};
const NOT_CONFIGURED: Record<string, unknown> = {
  ...CONFIGURED,
  'GET /storage.json/inbox': { status: 'SUCCESS', message: 'Inbox fetched successfully.', data: {
    configured: false, maxBytes: 104857600, platformMaxBytes: 104857600 } },
  'GET /storage.json/inbox/files': { status: 'SUCCESS', message: 'Inbox files fetched successfully.', data: [] },
};

describe('MIG-239: Inbox', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the inbox, as a workspace administrator', async () => {
    const v = await visit('/documents/inbox', 'TENANT_ADMIN', null, CONFIGURED);
    pin(FILE, 'the inbox, as a workspace administrator', v.surface, PINNED);
  });

  it('the inbox, as a tenant user with the page', async () => {
    const v = await visit('/documents/inbox', 'TENANT_USER', ALL_PAGES, CONFIGURED);
    pin(FILE, 'the inbox, as a tenant user with the page', v.surface, PINNED);
  });

  it('the inbox, as a tenant user without the page', async () => {
    const v = await visit('/documents/inbox', 'TENANT_USER', ['jobs', 'queue'], CONFIGURED);
    pin(FILE, 'the inbox, as a tenant user without the page', v.surface, PINNED);
  });

  it('no inbox yet, as a workspace administrator', async () => {
    const v = await visit('/documents/inbox', 'TENANT_ADMIN', null, NOT_CONFIGURED);
    pin(FILE, 'no inbox yet, as a workspace administrator', v.surface, PINNED);
  });

  it('no inbox yet, as a tenant user', async () => {
    const v = await visit('/documents/inbox', 'TENANT_USER', ALL_PAGES, NOT_CONFIGURED);
    pin(FILE, 'no inbox yet, as a tenant user', v.surface, PINNED);
  });

  it('the settings dialog', async () => {
    const v = await visit('/documents/inbox', 'TENANT_ADMIN', null, CONFIGURED);
    await click(v, 'Inbox settings');
    pin(FILE, 'the settings dialog', overlay(), PINNED);
  });
});
