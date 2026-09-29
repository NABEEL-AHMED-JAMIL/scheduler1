import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/managed-service';

/**
 * MIG-254 characterisation baseline: the managed-service pages (Administration › Managed service, Staff activity,
 * Work in a workspace for a platform administrator; Our team's activity for a workspace administrator), and a
 * MANAGED workspace's build screen under its banner. The answers are made up here, in the shapes identity-service
 * gives (MIG-244): the platform's only administrator is the owner's account, which is not used to capture them.
 */
const FILE = 'managed-service';

const GRANT = { tenantId: 2924, tenantName: 'Claude Demo', managementMode: 'MANAGED', appUserId: 5001, fullName: 'Sam Staff',
  username: 'staff@example.com', grantedBy: 1, grantedAt: '2026-09-28 10:00:00', revokedBy: null, revokedAt: null };
const GRANTS = { status: 'SUCCESS', message: 'Grants.', data: [{ ...GRANT, grantId: 11 },
  { ...GRANT, grantId: 10, tenantId: 3001, tenantName: 'Workspace B', managementMode: 'SELF', revokedBy: 1, revokedAt: '2026-09-28 11:00:00' }] };
const ACTION = { tenantId: 2924, tenantName: 'Claude Demo', appUserId: 5001, username: 'staff@example.com', fullName: 'Sam Staff',
  service: 'process', method: 'POST', builderAction: true, correlationId: null, createdAt: '2026-09-28 10:05:00' };
const ACTIONS = { status: 'SUCCESS', message: 'Managed-service actions.', paging: { limit: 50, nextBeforeId: 41 }, data: [
  { ...ACTION, id: 42, path: '/sourceTask.json/updateSourceTask', target: 'sourceTaskId=1854', action: 'SourceTaskRestApi.updateSourceTask' },
  { ...ACTION, id: 41, service: 'identity', path: '/managedService.json/openSession', target: 'tenantId=2924', builderAction: false,
    action: 'ManagedServiceRestApi.openSession' },
] };
const USERS = { status: 'SUCCESS', message: 'Users.', data: [
  { appUserId: 5001, username: 'staff@example.com', fullName: 'Sam Staff', userRole: 'PLATFORM_ADMIN', status: 'Active', tenantId: null },
  { appUserId: 4537, username: 'admin@example.com', fullName: 'Casey Baseline', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 2924 },
] };
const TENANTS = { status: 'SUCCESS', message: 'Tenants.', data: [
  { tenantId: 2924, tenantName: 'Claude Demo', status: 'Active', managementMode: 'MANAGED' },
  { tenantId: 3001, tenantName: 'Workspace B', status: 'Active', managementMode: 'SELF' }] };

const ANSWERS: Record<string, unknown> = {
  'GET /managedService.json/listGrants': GRANTS,
  'GET /managedService.json/myWorkspaces': { ...GRANTS, data: [GRANTS.data[0]] },
  'GET /managedService.json/actions': ACTIONS,
  'GET /appUser.json/listUsers': USERS,
  'GET /tenant.json/listTenants': TENANTS,
};

describe('MIG-254: the managed-service pages', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  const platform: [string, string][] = [
    ['managed service, as a platform administrator', '/administration/managed-service'],
    ['staff activity, as a platform administrator', '/administration/staff-activity'],
    ['work in a workspace, as a platform administrator', '/administration/work-in-workspace'],
  ];
  for (const [name, url] of platform) {
    it(name, async () => {
      const v = await visit(url, 'PLATFORM_ADMIN', null, ANSWERS);
      pin(FILE, name, v.surface, PINNED);
    });
  }

  it("our team's activity, as a MANAGED workspace's administrator", async () => {
    const v = await visit('/administration/team-activity', 'TENANT_ADMIN', null, ANSWERS, { mgmt: 'MANAGED' });
    pin(FILE, "our team's activity, as a MANAGED workspace's administrator", v.surface, PINNED);
  });

  it('the pages refuse a workspace administrator', async () => {
    const v = await visit('/administration/managed-service', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the pages refuse a workspace administrator', v.surface.url, PINNED);
  });

  it('pipelines, in a MANAGED workspace', async () => {
    const v = await visit('/pipelines', 'TENANT_ADMIN', null, {}, { mgmt: 'MANAGED' });
    pin(FILE, 'pipelines, in a MANAGED workspace', v.surface, PINNED);
  });
});
