import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, overlay, pin, restoreClock, surfaceOf, visit } from './harness';
import { LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/documents-generated';

/**
 * MIG-253 characterisation baseline: Documents' generated outputs -- the converter's Dataset → PDF and
 * From an execution modes, Documents › Reports, and Storage's file details panel.
 *
 * Pins what these screens show and ask for, per role, so a later change to them fails here by name.
 * When a change is meant, re-record (see harness.ts) and let the review read pinned/documents-generated.ts.
 */
const FILE = 'documents-generated';

const ok = (data: unknown, message = '') => ({ status: 'SUCCESS', message, data });
const KEY = 'registry-live-check/customers-clean.json';

/** Run 7405 of schedule 2849: a dataset it kept (1051) and the upload it made -- the live shapes of 2026-09-29. */
const RUNS = {
  'GET /sourceJob.json/listSourceJob': ok([{ jobId: 2849, jobName: 'UI-CHECK registry chain job 0929',
    lastJobRun: '2026-09-29T07:06:55.568592', createdByName: 'Claude Demo Admin',
    taskDetail: { taskName: 'UI-CHECK registry chain task 0929' } }]),
  'GET /sourceJob.json/fetchSourceJobQueueListWithJobId': ok({ jobQueues: [{ jobQueueId: 7405, jobId: 2849,
    jobStatus: 'Completed', startTime: '2026-09-29T07:06:55.568592', endTime: '2026-09-29T07:07:05.872364' }] }),
  'GET /sourceJob.json/runOutputs': ok({ jobQueueId: 7405, jobId: 2849, outputs: [
    { runOutputId: 1000, stepIndex: 3, stepKey: 'out', task: 'save_file', kind: 'file', name: 'customers-clean.json',
      format: 'json', rowCount: 3, byteCount: 169, recordedAt: '2026-09-29T07:07:05.699379', runDatasetId: 1051,
      expiresAt: '2026-09-30T07:07:05.698', expired: false },
    { runOutputId: 1001, stepIndex: 4, stepKey: 'publish', task: 'upload_bucket', kind: 'bucket', name: 'customers-clean.json',
      format: 'json', rowCount: 3, byteCount: 169, recordedAt: '2026-09-29T07:07:05.863214', bucket: LIVE_IDS.bucket, key: KEY },
  ] }),
};
const RENDER = {
  'GET /documentConverter.json/renderFormats': ok({ formats: [
    { format: 'json', contentType: 'application/json', usesTemplate: false, maxRows: 100000 },
    { format: 'csv', contentType: 'text/csv', usesTemplate: false, maxRows: 100000 },
    { format: 'pdf', contentType: 'application/pdf', usesTemplate: true, maxRows: 5000 },
    { format: 'docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', usesTemplate: true, maxRows: 5000 },
  ], placeholders: [], limits: {} }),
  'GET /documentConverter.json/fetchAllTemplates': ok([]),
};
const REPORTS_FOLDER = {
  'GET /storage.json/listObjects': ok({ objects: [
    { name: 'UI-CHECK Q3.pdf', key: 'reports/UI-CHECK Q3.pdf', folder: false, size: 13841, lastModified: '2026-09-28T12:00:00Z',
      contentType: 'application/pdf' },
  ] }),
  'GET /storage.json/objectMetadata': ok({ name: 'customers-clean.json', key: KEY, size: 169,
    lastModified: '2026-09-29T12:07:05Z', etag: '"fe024a56757e160ef30003d892316850"', contentType: 'application/json', previewable: true }),
};

describe('MIG-253: Documents -- the converter\'s render modes, Reports, and a file\'s details', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the converter, Dataset → PDF', async () => {
    const v = await visit('/documents/converter', 'TENANT_ADMIN', null, RENDER);
    const requests = await click(v, 'Dataset → PDF');
    pin(FILE, 'the converter, Dataset → PDF', { requests, ...surfaceOf(v.main) }, PINNED);
  });

  it('the converter, From an execution', async () => {
    const v = await visit('/documents/converter', 'TENANT_ADMIN', null, { ...RENDER, ...RUNS });
    const requests = await click(v, 'From an execution');
    pin(FILE, 'the converter, From an execution', { requests, ...surfaceOf(v.main) }, PINNED);
  });

  it('Reports, as a workspace administrator', async () => {
    const v = await visit('/documents/reports', 'TENANT_ADMIN', null, { ...RUNS, ...REPORTS_FOLDER });
    pin(FILE, 'Reports, as a workspace administrator', v.surface, PINNED);
  });

  it('Reports, as a tenant user without the page', async () => {
    const v = await visit('/documents/reports', 'TENANT_USER', TU_PAGES);
    pin(FILE, 'Reports, as a tenant user without the page', v.surface, PINNED);
  });

  it('a file\'s details, written by a recent run', async () => {
    const v = await visit(`/documents/files?bucket=${LIVE_IDS.bucket}&prefix=registry-live-check/`, 'TENANT_ADMIN', null, {
      ...RUNS, ...REPORTS_FOLDER,
      'GET /storage.json/listObjects': ok({ objects: [{ name: 'customers-clean.json', key: KEY, folder: false, size: 169,
        lastModified: '2026-09-29T12:07:05Z', contentType: 'application/json' }] }),
    });
    await click(v, 'Actions for customers-clean.json');
    const requests = await click(v, 'Details');
    pin(FILE, 'a file\'s details, written by a recent run', { requests, ...overlay() }, PINNED);
  });
});
