import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { StorageService } from '../objects/storage.service';
import { DocumentsApi } from './documents.service';
import { DocumentIntelligence } from './intelligence';
import { ReadDocumentDialog } from './read-document-dialog';
import { TypePanel } from './type-panel';
import { DocumentType } from './documents.model';
import { PO_DEFINITION } from './documents.fixtures';

/**
 * MIG-272: Document Intelligence's page. The overview's numbers come from the stats, its types from the type list, and
 * its recent documents from the OCR reads joined with their newest extraction; Read a document and the type editor
 * open over it; the dataset tab lists a type's approved rows and downloads them. Workspace 2924's answers, 2026-09-29.
 */
const TYPES: DocumentType[] = [
  { documentTypeId: 1000, builtIn: true, typeKey: 'invoice', name: 'Invoice', status: 'Active', currentVersion: 2, fieldCount: 9, tableCount: 1,
    autoApproveThreshold: 0.9 },
  { documentTypeId: 1001, builtIn: true, typeKey: 'purchase_order', name: 'Purchase order', status: 'Active', currentVersion: 2, fieldCount: 6,
    tableCount: 1, autoApproveThreshold: 0.9, definition: PO_DEFINITION },
  { documentTypeId: 2001, builtIn: false, tenantId: 2924, typeKey: 'ui_check_old', name: 'UI-CHECK old', status: 'Inactive', currentVersion: 1 },
];
const STATS = [{ documentTypeId: 1001, typeKey: 'purchase_order', name: 'Purchase order', documents: 5, autoApproved: 1, approvedByReviewer: 1,
  rejected: 0, inReview: 2, failed: 1, reviewedFields: 11, correctedFields: 6 }];
const READS = [
  { ocrDocumentId: 1003, sourceBucket: 'ui-review-s3', sourceKey: 'ocr-live-check/second.png', status: 'Done', pageCount: 1, dateCreated: '2026-09-29T03:07:04.627+00:00' },
  { ocrDocumentId: 1001, sourceBucket: 'ui-review-s3', sourceKey: 'ocr-live-check/ocr-live-check.png', status: 'Done', pageCount: 1 },
];
const EXTRACTIONS = [
  { extractionId: 1005, ocrDocumentId: 1001, status: 'Review', revision: 0, documentTypeKey: 'invoice', documentTypeName: 'Invoice', documentTypeId: 1000,
    fieldCount: 9, reviewCount: 4, minConfidence: 0, autoApproveThreshold: 0.9, dateCreated: '2026-09-29T05:12:10.000+00:00' },
  { extractionId: 1000, ocrDocumentId: 1001, status: 'Approved', revision: 1, documentTypeKey: 'purchase_order' },
];
const DATASET = { total: 1, page: 0, size: 50, rows: [{ datasetRowId: 1000, extractionId: 1000, documentTypeId: 1001, documentTypeVersion: 1,
  typeKey: 'purchase_order', approval: 'reviewer', approvedBy: 4537, dateCreated: '2026-09-29T05:04:08.939+00:00',
  row: { fields: { po_number: '77104', total: 9820.0, supplier_name: 'Dock Supplies Ltd (LIVE-CHECK)', delivery_date: null },
    tables: { line_items: [{ description: 'Pallets', quantity: 40, amount: 9820.0 }] } } }] };
const ok = <T>(data: T, message = '') => of({ status: 'SUCCESS', message, data });

function screenWith(opts: { admin?: boolean; tab?: string; closed?: unknown } = {}) {
  const api = {
    stats: vi.fn(() => ok(STATS)),
    types: vi.fn(() => ok(TYPES)),
    reads: vi.fn(() => ok(READS)),
    extractions: vi.fn(() => ok(EXTRACTIONS)),
    dataset: vi.fn(() => ok(DATASET)),
    datasetExport: vi.fn(() => of(new HttpResponse({ body: new Blob(['a,b']),
      headers: new HttpHeaders({ 'content-disposition': 'attachment; filename="purchase_order-dataset.csv"' }) }))),
  };
  const opened: { component: unknown; data: unknown }[] = [];
  const dialog = { open: vi.fn((component: unknown, config: { data?: unknown }) => {
    opened.push({ component, data: config?.data });
    return { closed: of(opts.closed) };
  }) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(opts.tab ? { tab: opts.tab } : {}) } } },
      { provide: DocumentsApi, useValue: api },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin ?? true, canBuild: () => opts.admin ?? true, builderLocked: () => false, user: signal({ appUserId: 4537 }) } },
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(DocumentIntelligence);
  return { fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api, dialog, opened, router };
}

describe('DocumentIntelligence -- overview', () => {
  it('adds up the numbers of the last 30 days', async () => {
    const { fixture, screen, api } = screenWith();
    await fixture.whenStable();
    expect(api.stats).toHaveBeenCalledWith(30);
    expect(Object.fromEntries(screen.kpis().map(k => [k.label, k.value]))).toEqual({
      Documents: 5, 'Auto-approved': '50%', 'In review': 2, 'Field accuracy': '45%',
    });
    expect(screen.kpis().find(k => k.label === 'In review')?.link).toBe('/documents/review');
  });

  it('shows the active types with their documents, and a custom type for an administrator', async () => {
    const { fixture, el } = screenWith();
    await fixture.whenStable();
    const cards = el.querySelector('[data-test="type-cards"]')!;
    expect(cards.textContent).toContain('Purchase order');
    expect(cards.textContent).toContain('6 fields · 5 docs');
    expect(cards.textContent).not.toContain('UI-CHECK old');
    expect(cards.textContent).toContain('Custom type');
  });

  it('offers no type change to anyone but an administrator', async () => {
    const { fixture, el } = screenWith({ admin: false });
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Custom type');
    expect(el.textContent).not.toContain('New document type');
    expect(el.textContent).toContain('Read a document');
  });

  it('lists every extraction, linked to its review, then the reads not yet extracted', async () => {
    const { fixture, el, screen } = screenWith();
    await fixture.whenStable();
    expect(screen.recent().map(r => [r.name, r.status])).toEqual([
      ['ocr-live-check.png', 'In review'], ['ocr-live-check.png', 'Approved'], ['second.png', 'Read'],
    ]);
    const recent = el.querySelector('[data-test="recent"]')!;
    expect(recent.querySelector('a')?.getAttribute('href')).toBe('/documents/review/1005');
    expect(recent.textContent).toContain('4 to check');
    expect(recent.textContent).toContain('Not extracted');
  });

  it('narrows the recent documents by type, state and name', async () => {
    const { fixture, screen } = screenWith();
    await fixture.whenStable();
    screen.stateFilter.set('Read');
    expect(screen.filtered().map(r => r.name)).toEqual(['second.png']);
    screen.clearFilters();
    screen.typeFilter.set('invoice');
    expect(screen.filtered().map(r => r.key)).toEqual(['e1005']);
    screen.clearFilters();
    screen.search.set('SECOND');
    expect(screen.filtered().map(r => r.name)).toEqual(['second.png']);
  });

  it('reads a document in, and opens its review when the dialog asks', async () => {
    const { fixture, screen, opened, api, router } = screenWith({ closed: { changed: true, openExtractionId: 1020 } });
    await fixture.whenStable();
    screen.readDocument();
    expect(opened[0].component).toBe(ReadDocumentDialog);
    expect((opened[0].data as { types: DocumentType[] }).types).toHaveLength(3);
    expect(api.extractions).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledWith(['/documents/review', 1020]);
  });

  it('extracts a read again as the type it was', async () => {
    const { fixture, screen, opened } = screenWith();
    await fixture.whenStable();
    screen.extractAgain(screen.recent()[0]);
    expect(opened[0].data).toEqual(expect.objectContaining({ read: READS[1], documentTypeId: 1000 }));
  });
});

describe('DocumentIntelligence -- types', () => {
  it('lists every type, built-in and the workspace\'s, and opens one in the editor', async () => {
    const { fixture, el, screen, opened, api } = screenWith({ tab: 'types' });
    await fixture.whenStable();
    const table = el.querySelector('[data-test="types"]')!;
    expect(table.textContent).toContain('ui_check_old');
    expect(table.textContent).toContain('This workspace');
    screen.openType(TYPES[1]);
    expect(opened[0].component).toBe(TypePanel);
    expect(opened[0].data).toEqual(expect.objectContaining({ documentTypeId: 1001, canManage: true }));
    expect(api.types).toHaveBeenCalledTimes(2);
  });
});

describe('DocumentIntelligence -- dataset', () => {
  it('opens on the type with approved documents and shows their values as stored', async () => {
    const { fixture, el, api, screen } = screenWith({ tab: 'dataset' });
    await fixture.whenStable();
    expect(screen.datasetType()).toBe('1001');
    expect(api.dataset).toHaveBeenCalledWith(1001, 0, 50);
    const table = el.querySelector('[data-test="dataset"]')!;
    expect(table.textContent).toContain('Dock Supplies Ltd (LIVE-CHECK)');
    expect(table.textContent).toContain('By a reviewer');
    expect(table.textContent).toContain('1 row');
    expect(screen.cell(DATASET.rows[0] as never, 'total')).toBe('9820');
    expect(screen.cell(DATASET.rows[0] as never, 'delivery_date')).toBe('');
  });

  it('downloads the dataset under the name the service gave it', async () => {
    const saved = vi.spyOn(StorageService, 'saveBlob').mockImplementation(() => {});
    const { fixture, screen, api } = screenWith({ tab: 'dataset' });
    await fixture.whenStable();
    screen.download('csv');
    expect(api.datasetExport).toHaveBeenCalledWith(1001, 'csv');
    expect(saved).toHaveBeenCalledWith(expect.any(Blob), 'purchase_order-dataset.csv');
    saved.mockRestore();
  });
});
