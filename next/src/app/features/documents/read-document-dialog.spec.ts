import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { StorageService } from '../objects/storage.service';
import { DocumentsApi } from './documents.service';
import { ReadDocumentData, ReadDocumentDialog } from './read-document-dialog';
import { DocumentType } from './documents.model';

/**
 * MIG-272: reading a document in. Upload (or pick) a file in one of the workspace's own storage connections, ask OCR to
 * read it, wait while it is Queued or Running, extract it as the type picked, wait again, and say where it landed. The
 * services' refusals -- 422, 429, 404 -- stop it with their own message.
 */
const TYPES: DocumentType[] = [
  { documentTypeId: 1000, builtIn: true, typeKey: 'invoice', name: 'Invoice', status: 'Active', currentVersion: 2 },
  { documentTypeId: 1001, builtIn: true, typeKey: 'purchase_order', name: 'Purchase order', status: 'Active', currentVersion: 2 },
  { documentTypeId: 2000, builtIn: false, typeKey: 'old', name: 'Old', status: 'Inactive', currentVersion: 1 },
];
const READ = { ocrDocumentId: 1010, sourceBucket: 'ui-review-s3', sourceKey: 'document-intelligence/scan.png', status: 'Queued' };
const ok = <T>(data: T, message = '') => of({ status: 'SUCCESS', message, data });

function dialogWith(data: Partial<ReadDocumentData> = {}, api: Partial<Record<string, unknown>> = {}, storage: Partial<Record<string, unknown>> = {}) {
  let readLooks = 0;
  let extractLooks = 0;
  const stub = {
    requestRead: vi.fn(() => ok(READ, 'The file is queued to be read.')),
    read: vi.fn(() => ok({ ...READ, status: ++readLooks < 2 ? 'Running' : 'Done', pageCount: 1 })),
    extract: vi.fn(() => ok({ extractionId: 1020, ocrDocumentId: 1010, status: 'Queued', revision: 0 })),
    extraction: vi.fn(() => ok(++extractLooks < 2 ? { extractionId: 1020, ocrDocumentId: 1010, status: 'Running', revision: 0 }
      : { extractionId: 1020, ocrDocumentId: 1010, status: 'Review', revision: 0, reviewCount: 4, fieldCount: 9, documentTypeName: 'Invoice' })),
    ...api,
  };
  const store = {
    buckets: vi.fn(() => ok([{ bucket: 'ui-review-s3', label: 'UI-REVIEW LocalStack S3', provider: 'S3' }])),
    upload: vi.fn(() => ok(null, 'Uploaded.')),
    ...storage,
  };
  const ref = { close: vi.fn() };
  const picker = { open: vi.fn(() => ({ closed: of({ bucket: 'ui-review-s3', key: 'ocr-live-check/ocr-live-check.png', name: 'ocr-live-check.png' }) })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { types: TYPES, ...data } },
      { provide: DialogRef, useValue: ref },
      { provide: Dialog, useValue: picker },
      { provide: DocumentsApi, useValue: stub },
      { provide: StorageService, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(ReadDocumentDialog);
  fixture.componentInstance.pollMs = 0;
  return { fixture, dialog: fixture.componentInstance, api: stub, storage: store, ref, picker };
}

describe('ReadDocumentDialog', () => {
  it('offers the workspace\'s storage connections and its active types only', async () => {
    const { fixture, dialog, storage } = dialogWith();
    await fixture.whenStable();
    expect(storage.buckets).toHaveBeenCalled();
    expect(dialog.bucket()).toBe('ui-review-s3');
    expect(dialog.activeTypes().map(t => t.typeKey)).toEqual(['invoice', 'purchase_order']);
    expect(dialog.ready()).toBe(false);
  });

  it('uploads, reads, extracts -- waiting on each -- and ends in review', async () => {
    const { fixture, dialog, api, storage, ref } = dialogWith();
    await fixture.whenStable();
    dialog.file.set(new File(['png'], 'scan.png', { type: 'image/png' }));
    dialog.folder.set('document-intelligence');
    dialog.typeId.set('1000');
    await dialog.run();
    expect(storage.upload).toHaveBeenCalledWith('ui-review-s3', 'document-intelligence/', expect.any(File));
    expect(api.requestRead).toHaveBeenCalledWith('ui-review-s3', 'document-intelligence/scan.png', false);
    expect(api.read).toHaveBeenCalledTimes(2);
    expect(api.extract).toHaveBeenCalledWith(1010, 1000);
    expect(api.extraction).toHaveBeenCalledTimes(2);
    expect(dialog.stage()).toBe('done');
    expect(dialog.note()).toBe('In review: 4 of 9 values to check, as Invoice.');
    expect(dialog.confirmLabel()).toBe('Open review');
    dialog.confirm();
    expect(ref.close).toHaveBeenCalledWith({ changed: true, openExtractionId: 1020 });
  });

  it('reads a stored file, forced, and lets the page decide the type', async () => {
    const { fixture, dialog, api, storage } = dialogWith();
    await fixture.whenStable();
    dialog.source.set('stored');
    await dialog.pickStored();
    dialog.force.set(true);
    await dialog.run();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(api.requestRead).toHaveBeenCalledWith('ui-review-s3', 'ocr-live-check/ocr-live-check.png', true);
    expect(api.extract).toHaveBeenCalledWith(1010, null);
  });

  it('extracts a read already done, without asking for a file', async () => {
    const { fixture, dialog, api, storage } = dialogWith({ read: { ...READ, status: 'Done' }, documentTypeId: 1001 });
    await fixture.whenStable();
    expect(storage.buckets).not.toHaveBeenCalled();
    expect(dialog.ready()).toBe(true);
    expect(dialog.steps().map(s => s.id)).toEqual(['extract']);
    await dialog.run();
    expect(api.requestRead).not.toHaveBeenCalled();
    expect(api.extract).toHaveBeenCalledWith(1010, 1001);
  });

  it('stops on the service\'s refusal and says it as it is', async () => {
    const refusals: [number, string][] = [
      [422, 'No model connection to extract with: set a workspace default.'],
      [429, 'Document Intelligence is busy with other documents. Try again in a few minutes.'],
      [404, 'No active document type 1001 in this workspace.'],
    ];
    for (const [status, message] of refusals) {
      const { dialog } = dialogWith({ read: { ...READ, status: 'Done' } },
        { extract: vi.fn(() => throwError(() => new HttpErrorResponse({ status, error: { status: 'ERROR', message } }))) });
      await dialog.run();
      expect(dialog.stage()).toBe('failed');
      expect(dialog.note()).toBe(message);
      expect(dialog.confirmLabel()).toBe('Try again');
    }
  });

  it('says why an extraction did not land in review', async () => {
    const { dialog } = dialogWith({ read: { ...READ, status: 'Done' } }, {
      extraction: vi.fn(() => ok({ extractionId: 1020, ocrDocumentId: 1010, status: 'Failed', revision: 0,
        error: 'The model\'s answer was not an extraction: a row of table "line_items" is not an object of column keys. Nothing was kept.' })),
    });
    await dialog.run();
    expect(dialog.note()).toBe('The extraction failed: The model\'s answer was not an extraction: a row of table "line_items" is not an object of column keys. Nothing was kept.');
  });

  it('says so when OCR could not read the pages', async () => {
    const { fixture, dialog } = dialogWith({}, { read: vi.fn(() => ok({ ...READ, status: 'Failed', error: 'The file is not an image.' })) });
    await fixture.whenStable();
    dialog.file.set(new File(['x'], 'scan.png'));
    await dialog.run();
    expect(dialog.note()).toBe('The pages could not be read: The file is not an image.');
  });

  it('stops waiting when it is closed, and tells the overview something changed', async () => {
    const { fixture, dialog, ref, api } = dialogWith({}, { read: vi.fn(() => ok({ ...READ, status: 'Running' })) });
    await fixture.whenStable();
    dialog.file.set(new File(['x'], 'scan.png'));
    const running = dialog.run();
    await vi.waitFor(() => expect(api.read).toHaveBeenCalled());
    dialog.close();
    await running;
    expect(ref.close).toHaveBeenCalledWith({ changed: true });
    expect(api.extract).not.toHaveBeenCalled();
  });
});
