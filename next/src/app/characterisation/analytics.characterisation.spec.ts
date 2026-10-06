import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, pin, restoreClock, surfaceOf, visit } from './harness';
import { PINNED } from './pinned/analytics';

/**
 * MIG-266 (Wave 5) characterisation baseline: Analytics datasets, saved queries and dashboards.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/analytics.ts.
 */
const FILE = 'analytics';

/** One CSV in the bucket, and analytics-service's answers for it, shaped as api-check/characterisation.tsv pins them. */
const COLUMNS = [{ name: 'id', type: 'BIGINT' }, { name: 'name', type: 'VARCHAR' }, { name: 'city', type: 'VARCHAR' },
  { name: 'amount', type: 'DOUBLE' }];
const DATASET = {
  'GET /storage.json/listObjects': { status: 'SUCCESS', message: 'Objects fetched successfully.', data: { objects: [
    { name: 'customers.csv', key: 'customers.csv', folder: false, size: 1426, lastModified: '2026-09-25T03:40:35Z',
      etag: 'ee5d', contentType: 'text/csv' },
  ] } },
  'GET /analytics.json/schema': { status: 'SUCCESS', message: 'Schema read.', data: { bucket: 'ui-review-s3', path: 'customers.csv',
    format: 'CSV', multiFile: false, columns: COLUMNS } },
  'GET /analytics.json/preview': { status: 'SUCCESS', message: 'Dataset read.', data: { columns: ['id', 'name', 'city', 'amount'],
    rows: [[1, 'Ada', 'Zürich', 10.5], [2, 'Lin', '東京', 7]], totalRows: 2, page: 1, pageSize: 50, filtered: false, multiFile: false } },
  'GET /analytics.json/overview': { status: 'SUCCESS', message: 'Dataset overview.', data: { charts: [], profile: { totalRows: 2, columns: [] } } },
  'GET /analytics.json/profile': { status: 'SUCCESS', message: 'Dataset profiled.', data: { bucket: 'ui-review-s3', totalRows: 2,
    columns: [] } },
};

describe("MIG-266 (Wave 5): Analytics datasets, saved queries and dashboards", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("Analytics Studio, as a workspace administrator", async () => {
    const v = await visit('/objects/analytics', 'TENANT_ADMIN', null);
    pin(FILE, "Analytics Studio, as a workspace administrator", v.surface, PINNED);
  });

  it("Analytics Studio, as a tenant user with every page", async () => {
    const v = await visit('/objects/analytics', 'TENANT_USER', ALL_PAGES);
    pin(FILE, "Analytics Studio, as a tenant user with every page", v.surface, PINNED);
  });

  it("saved analyses and dashboards", async () => {
    const v = await visit('/objects/analytics/dashboards', 'TENANT_ADMIN', null);
    pin(FILE, "saved analyses and dashboards", v.surface, PINNED);
  });

  it("saved analyses, as a tenant user without the page", async () => {
    const v = await visit('/objects/analytics/dashboards', 'TENANT_USER', TU_PAGES);
    pin(FILE, "saved analyses, as a tenant user without the page", v.surface, PINNED);
  });

  it("a dashboard, opened", async () => {
    const v = await visit('/objects/analytics/dashboards?board=1378', 'TENANT_ADMIN', null);
    pin(FILE, "a dashboard, opened", v.surface, PINNED);
  });

  it("Analytics Studio, a CSV chosen: what it reads and shows", async () => {
    const v = await visit('/objects/analytics', 'TENANT_ADMIN', null, DATASET);
    const requests = await click(v, 'customers.csv');
    pin(FILE, "Analytics Studio, a CSV chosen: what it reads and shows", { requests, ...surfaceOf(v.main) }, PINNED);
  });
});
