import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, click, overlay, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/document-intelligence';

/**
 * MIG-272 characterisation baseline: Document Intelligence (the overview, the document types, the dataset) and the
 * review queue with one document under review.
 *
 * Pins what these screens show and ask for, per role, so a later change to them fails here by name. The answers are
 * the services', as they gave them on 2026-09-29 for workspace 2924: OCR 1001 (the live-check purchase order scan),
 * extraction 1000 (a purchase order, approved by a reviewer) and extraction 1005 (the same page read as an invoice, in
 * Review: its vendor and total not found). Identity serves both page keys; ALL_PAGES predates them, so the tenant user
 * who holds them is given them here.
 */
const FILE = 'document-intelligence';
const DOC_PAGES = [...ALL_PAGES, 'document-intelligence', 'document-review'];

const PO_DEFINITION = {
  description: 'A buyer\'s order to a supplier.', keywords: ['purchase order'], autoApproveThreshold: 0.9,
  fields: [
    { key: 'po_number', label: 'PO number', type: 'text', required: true, aliases: ['PO Number', 'PO #'] },
    { key: 'order_date', label: 'Order date', type: 'date', required: true },
    { key: 'supplier_name', label: 'Supplier', type: 'text', required: true },
    { key: 'total', label: 'Order total', type: 'money', required: true },
  ],
  tables: [{ key: 'line_items', label: 'Ordered items', required: true, columns: [
    { key: 'description', label: 'Description', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'money', required: false },
  ] }],
  rules: [{ rule: 'sumEquals', table: 'line_items', column: 'amount', field: 'total', tolerance: 0.01 }],
};
const INVOICE_DEFINITION = {
  autoApproveThreshold: 0.9,
  fields: [
    { key: 'invoice_number', label: 'Invoice number', type: 'text', required: true },
    { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
    { key: 'vendor_name', label: 'Vendor', type: 'text', required: true },
    { key: 'total', label: 'Total', type: 'money', required: true },
  ],
  tables: [], rules: [],
};
const TYPES = [
  { documentTypeId: 1000, tenantId: null, builtIn: true, typeKey: 'invoice', name: 'Invoice', status: 'Active', currentVersion: 2, fieldCount: 4,
    tableCount: 0, autoApproveThreshold: 0.9, definition: INVOICE_DEFINITION, dateCreated: '2026-09-29T04:23:08.650+00:00' },
  { documentTypeId: 1001, tenantId: null, builtIn: true, typeKey: 'purchase_order', name: 'Purchase order', status: 'Active', currentVersion: 2,
    fieldCount: 4, tableCount: 1, autoApproveThreshold: 0.9, definition: PO_DEFINITION, dateCreated: '2026-09-29T04:23:08.669+00:00' },
];
const READ = { ocrDocumentId: 1001, tenantId: 2924, sourceBucket: 'ui-review-s3', sourceKey: 'ocr-live-check/ocr-live-check.png', status: 'Done',
  pageCount: 1, pagesRead: 1, wordCount: 17, meanConfidence: 95.95, dateCreated: '2026-09-29T02:58:09.782+00:00' };
const APPROVED = { extractionId: 1000, tenantId: 2924, ocrDocumentId: 1001, status: 'Approved', documentTypeId: 1001, documentTypeVersion: 1,
  documentTypeKey: 'purchase_order', documentTypeName: 'Purchase order', minConfidence: 0.25, fieldCount: 6, reviewCount: 0, autoApproved: false,
  revision: 1, claimedBy: null, claimActive: false, reviewedBy: 4537, dateReviewed: '2026-09-29T05:04:08.939+00:00', autoApproveThreshold: 0.9,
  dateCreated: '2026-09-29T04:24:19.424+00:00' };
const IN_REVIEW = { extractionId: 1005, tenantId: 2924, ocrDocumentId: 1001, status: 'Review', documentTypeId: 1000, documentTypeVersion: 2,
  documentTypeKey: 'invoice', documentTypeName: 'Invoice', minConfidence: 0, fieldCount: 4, reviewCount: 3, autoApproved: false, revision: 0,
  claimedBy: null, claimActive: false, autoApproveThreshold: 0.9, dateCreated: '2026-09-29T05:12:10.000+00:00',
  dateFinished: '2026-09-29T05:12:14.000+00:00' };
const REVIEW_1005 = {
  ...IN_REVIEW, definition: INVOICE_DEFINITION,
  fields: [
    { fieldId: 1011, fieldKey: 'invoice_number', value: '77104', confidence: 0.95, page: 1, box: { left: 464, top: 289, width: 128, height: 35 },
      problems: [], corrected: false, label: 'Invoice number', type: 'text', required: true },
    { fieldId: 1012, fieldKey: 'issue_date', value: '2026-09-28', confidence: 0.823, page: 1, box: { left: 540, top: 149, width: 243, height: 35 },
      problems: [], corrected: false, label: 'Issue date', type: 'date', required: true },
    { fieldId: 1014, fieldKey: 'vendor_name', value: null, confidence: 0, page: null, problems: ['Required, and not found on the document.'],
      corrected: false, label: 'Vendor', type: 'text', required: true },
    { fieldId: 1019, fieldKey: 'total', value: null, confidence: 0, page: null, problems: ['Required, and not found on the document.'],
      corrected: false, label: 'Total', type: 'money', required: true },
  ],
  checks: { rules: [], documentProblems: [], anyRuleFailed: false, canApprove: false,
    blockingProblems: ['Vendor: Required, and not found on the document.', 'Total: Required, and not found on the document.'] },
  corrections: [],
};

const ANSWERS: Record<string, unknown> = {
  'GET /documentExtraction.json/stats': { status: 'SUCCESS', message: '1 document type(s).', data: [
    { documentTypeId: 1001, typeKey: 'purchase_order', name: 'Purchase order', builtIn: true, documents: 1, autoApproved: 0, approvedByReviewer: 1,
      rejected: 0, inReview: 0, failed: 0, autoApproveRate: 0, reviewedFields: 11, correctedFields: 6, fieldAccuracy: 0.455, fields: [], days: 30 },
  ] },
  'GET /documentType.json/fetchAll': { status: 'SUCCESS', message: '2 document type(s).', data: TYPES },
  'GET /documentType.json/fetchById': { status: 'SUCCESS', message: 'Data found.', data: { ...TYPES[1], versions: [
    { version: 2, name: 'Purchase order', createdBy: null, dateCreated: '2026-09-29T05:02:51.700+00:00' },
    { version: 1, name: 'Purchase order', createdBy: null, dateCreated: '2026-09-29T04:23:08.669+00:00' },
  ] } },
  'GET /documentOcr.json/fetchAll': { status: 'SUCCESS', message: 'Data fetched successfully.', data: [READ] },
  'GET /documentOcr.json/fetchById': { status: 'SUCCESS', message: 'Data fetched successfully.', data: READ },
  'GET /documentExtraction.json/fetchAll': { status: 'SUCCESS', message: '2 extraction(s).', data: [IN_REVIEW, APPROVED] },
  'GET /documentExtraction.json/dataset': { status: 'SUCCESS', message: '1 row(s).', data: { total: 1, page: 0, size: 50, rows: [
    { datasetRowId: 1000, tenantId: 2924, extractionId: 1000, documentTypeId: 1001, documentTypeVersion: 1, typeKey: 'purchase_order',
      approval: 'reviewer', approvedBy: 4537, dateCreated: '2026-09-29T05:04:08.939+00:00',
      row: { fields: { total: 9820.0, po_number: '77104', order_date: '2026-09-28', supplier_name: 'Dock Supplies Ltd (LIVE-CHECK)' },
        tables: { line_items: [{ amount: 9820.0, description: 'Pallets' }] } } },
  ] } },
  'GET /documentReview.json/queue': { status: 'SUCCESS', message: '1 document(s).', data: { total: 1, page: 0, size: 50, items: [IN_REVIEW] } },
  'GET /documentReview.json/fetchById': { status: 'SUCCESS', message: 'Data found.', data: REVIEW_1005 },
  'GET /storage.json/buckets': { status: 'SUCCESS', message: 'Buckets fetched successfully.', data: [
    { label: 'UI-REVIEW LocalStack S3 (fake keys)', bucket: 'ui-review-s3', provider: 'S3', bucketName: 'ui-review-2924', region: 'us-east-1',
      connectionStatus: 'SUCCESS', dateCreated: '2026-09-24T22:39:41.53' },
  ] },
};
const VIEW_ONLY: Record<string, unknown> = {
  ...ANSWERS,
  'GET /documentReview.json/fetchById': { status: 'SUCCESS', message: 'Data found.', data: {
    ...APPROVED, definition: PO_DEFINITION, checks: { rules: [{ index: 1, rule: 'sumEquals', status: 'passed', message: null, fields: [] }],
      documentProblems: [], anyRuleFailed: false, canApprove: true, blockingProblems: [] },
    fields: [
      { fieldId: 1000, fieldKey: 'po_number', value: '77104', confidence: 0.867, page: 1, box: { left: 464, top: 289, width: 128, height: 35 },
        problems: [], corrected: false, label: 'PO number', type: 'text', required: true },
      { fieldId: 1003, fieldKey: 'supplier_name', value: 'Dock Supplies Ltd (LIVE-CHECK)', confidence: 1, page: null, problems: [], corrected: true,
        label: 'Supplier', type: 'text', required: true },
      { fieldId: 1007, fieldKey: 'description', tableKey: 'line_items', rowIndex: 0, value: 'Pallets', confidence: 1, page: null, problems: [],
        corrected: true, label: 'Description', type: 'text', required: true },
    ],
    corrections: [{ correctionId: 1000, fieldId: 1003, fieldKey: 'supplier_name', tableKey: null, rowIndex: null, oldValue: null,
      newValue: 'Dock Supplies Ltd (LIVE-CHECK)', oldConfidence: 0, correctedBy: 4537, dateCreated: '2026-09-29T05:04:08.841+00:00' }],
  } },
};

describe('MIG-272: Document Intelligence', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the overview, as a workspace administrator', async () => {
    const v = await visit('/documents/intelligence', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the overview, as a workspace administrator', v.surface, PINNED);
  });

  it('the overview, as a tenant user with the page', async () => {
    const v = await visit('/documents/intelligence', 'TENANT_USER', DOC_PAGES, ANSWERS);
    pin(FILE, 'the overview, as a tenant user with the page', v.surface, PINNED);
  });

  it('the overview, as a tenant user without the page', async () => {
    const v = await visit('/documents/intelligence', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'the overview, as a tenant user without the page', v.surface, PINNED);
  });

  it('the document types, as a workspace administrator', async () => {
    const v = await visit('/documents/intelligence?tab=types', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the document types, as a workspace administrator', v.surface, PINNED);
  });

  it('a built-in type opened in the side panel', async () => {
    const v = await visit('/documents/intelligence?tab=types', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, 'Purchase order');
    pin(FILE, 'a built-in type opened in the side panel', overlay(), PINNED);
  });

  it('the dataset, as a workspace administrator', async () => {
    const v = await visit('/documents/intelligence?tab=dataset', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the dataset, as a workspace administrator', v.surface, PINNED);
  });

  it('read a document', async () => {
    const v = await visit('/documents/intelligence', 'TENANT_ADMIN', null, ANSWERS);
    await click(v, 'Read a document');
    pin(FILE, 'read a document', overlay(), PINNED);
  });

  it('the review queue, as a workspace administrator', async () => {
    const v = await visit('/documents/review', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the review queue, as a workspace administrator', v.surface, PINNED);
  });

  it('the review queue, as a tenant user without the page', async () => {
    const v = await visit('/documents/review', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'the review queue, as a tenant user without the page', v.surface, PINNED);
  });

  it('a document in review', async () => {
    const v = await visit('/documents/review/1005', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'a document in review', v.surface, PINNED);
  });

  it('a document in review, as a tenant user with the page', async () => {
    const v = await visit('/documents/review/1005', 'TENANT_USER', DOC_PAGES, ANSWERS);
    pin(FILE, 'a document in review, as a tenant user with the page', v.surface, PINNED);
  });

  it('an approved document, read-only', async () => {
    const v = await visit('/documents/review/1000', 'TENANT_ADMIN', null, VIEW_ONLY);
    pin(FILE, 'an approved document, read-only', v.surface, PINNED);
  });
});
