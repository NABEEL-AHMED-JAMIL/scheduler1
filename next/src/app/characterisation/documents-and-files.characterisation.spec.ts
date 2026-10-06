import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { TU_PAGES, click, overlay, pin, restoreClock, surfaceOf, visit } from './harness';
import { LIVE_IDS } from './fixtures.live';
import { PINNED } from './pinned/documents-and-files';

/**
 * MIG-222 (Wave 4) and MIG-266 (Wave 5: extraction, conversion, FileChat) characterisation baseline: Document Converter, the Object browser, its previews and FileChat.
 *
 * Pins what these screens show and ask for TODAY, per role, so a Wave change that alters them
 * fails here by name instead of silently. Not a statement of what they should do: when a change
 * is meant, re-record (see harness.ts) and let the review read the diff in pinned/documents-and-files.ts.
 */
const FILE = 'documents-and-files';

/** A folder, a CSV and a PDF, so the file actions (preview, FileChat) have something to act on. */
const FILES = {
  'GET /storage.json/listObjects': { status: 'SUCCESS', message: 'Objects fetched successfully.', data: { objects: [
    { name: 'reports', key: 'reports/', folder: true },
    { name: 'customers.csv', key: 'customers.csv', folder: false, size: 1426, lastModified: '2026-09-25T03:40:35Z',
      etag: 'ee5d6a188652e441a5dd475505d26eb2', contentType: 'text/csv' },
    { name: 'notes.pdf', key: 'notes.pdf', folder: false, size: 20480, lastModified: '2026-09-25T03:41:00Z',
      etag: 'aa5d6a188652e441a5dd475505d26eb2', contentType: 'application/pdf' },
  ] } },
  'GET /storage.json/previewTable': { status: 'SUCCESS', message: 'Table read.', data: { columns: ['id', 'name', 'city', 'amount'],
    rows: [['1', 'Ada', 'Zürich', '10.5'], ['2', 'Lin', '東京', '7']], totalRows: 2, offset: 0, limit: 100, sheet: null, sheets: [],
    source: 'csv', note: null } },
  'GET /storage.json/objectMetadata': { status: 'SUCCESS', message: 'Object metadata fetched successfully.', data: {
    name: 'customers.csv', key: 'customers.csv', size: 1426, contentType: 'text/csv', etag: 'ee5d', lastModified: '2026-09-25T03:40:35Z',
    previewable: true } },
  'POST /fileChat.json/prepareContext': { status: 'SUCCESS', message: 'Context ready.', data: { truncated: false,
    usingRetrieval: false, charsUsed: 1426, totalChars: 1426 } },
  'POST /fileChat.json/sendMessage': { status: 'SUCCESS', message: 'Answered.', data: 'The file lists **2** customers.' },
};

describe("MIG-222 (Wave 4) and MIG-266 (Wave 5: extraction, conversion, FileChat): Document Converter, the Object browser, its previews and FileChat", () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it("the converter, as a workspace administrator", async () => {
    const v = await visit('/tools/converter', 'TENANT_ADMIN', null);
    pin(FILE, "the converter, as a workspace administrator", v.surface, PINNED);
  });

  it("the converter, as a tenant user without the page", async () => {
    const v = await visit('/tools/converter', 'TENANT_USER', TU_PAGES);
    pin(FILE, "the converter, as a tenant user without the page", v.surface, PINNED);
  });

  it("the object browser, no bucket chosen", async () => {
    const v = await visit('/objects/files', 'TENANT_ADMIN', null);
    pin(FILE, "the object browser, no bucket chosen", v.surface, PINNED);
  });

  it("the object browser, in a bucket", async () => {
    const v = await visit(`/objects/files?bucket=${LIVE_IDS.bucket}`, 'TENANT_ADMIN', null);
    pin(FILE, "the object browser, in a bucket", v.surface, PINNED);
  });

  it("the object browser, as a tenant user", async () => {
    const v = await visit(`/objects/files?bucket=${LIVE_IDS.bucket}`, 'TENANT_USER', TU_PAGES);
    pin(FILE, "the object browser, as a tenant user", v.surface, PINNED);
  });

  it("a file's row menu", async () => {
    const v = await visit(`/objects/files?bucket=${LIVE_IDS.bucket}`, 'TENANT_ADMIN', null, FILES);
    await click(v, 'Actions for customers.csv');
    pin(FILE, "a file's row menu", overlay(), PINNED);
  });

  it("previewing a CSV (media-service's table preview)", async () => {
    const v = await visit(`/objects/files?bucket=${LIVE_IDS.bucket}`, 'TENANT_ADMIN', null, FILES);
    await click(v, 'Actions for customers.csv');
    const requests = await click(v, 'View');
    pin(FILE, "previewing a CSV (media-service's table preview)", { requests, ...overlay() }, PINNED);
  });

  it("FileChat on a CSV: the panel and what it asks for", async () => {
    const v = await visit(`/objects/files?bucket=${LIVE_IDS.bucket}`, 'TENANT_ADMIN', null, FILES);
    await click(v, 'Actions for customers.csv');
    const requests = await click(v, 'Chat with this file');
    const panel = v.main.querySelector('[role="region"][aria-label^="Chat about"]') as HTMLElement;
    pin(FILE, "FileChat on a CSV: the panel and what it asks for", { requests, ...surfaceOf(panel ?? v.main) }, PINNED);
  });

  it("FileChat on a CSV: a question and its answer", async () => {
    const v = await visit(`/objects/files?bucket=${LIVE_IDS.bucket}`, 'TENANT_ADMIN', null, FILES);
    await click(v, 'Actions for customers.csv');
    await click(v, 'Chat with this file');
    const panel = v.main.querySelector('[role="region"][aria-label^="Chat about"]') as HTMLElement;
    const suggestion = panel.querySelector('button.chip, [data-suggestion], button[class*="suggest"]') as HTMLElement | null
      ?? Array.from(panel.querySelectorAll('button')).find(b => (b.textContent ?? '').trim().endsWith('?')) as HTMLElement | undefined ?? null;
    suggestion?.click();
    const requests = await v.settle();
    pin(FILE, "FileChat on a CSV: a question and its answer", { asked: !!suggestion, requests, ...surfaceOf(panel) }, PINNED);
  });
});
