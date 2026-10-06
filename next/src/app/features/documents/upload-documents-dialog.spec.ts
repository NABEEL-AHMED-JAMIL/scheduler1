import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { DocumentsApi } from './documents.service';
import { UPLOAD_MAX_FILES, UploadDocumentsDialog } from './upload-documents-dialog';

/** MIG-271: many files into Document Intelligence at once, and what became of each one. */
function dialogWith(answers: unknown[] = []) {
  const api = { upload: vi.fn(() => of({ status: 'SUCCESS', message: '', data: answers })) };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(), { provide: DocumentsApi, useValue: api }, { provide: DialogRef, useValue: ref },
  ] });
  const fixture = TestBed.createComponent(UploadDocumentsDialog);
  return { fixture, dialog: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api, ref };
}

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

describe('UploadDocumentsDialog', () => {
  it('lists the picked files once each, and removes one', () => {
    const { dialog } = dialogWith();
    dialog.add([file('a.pdf'), file('b.pdf')]);
    dialog.add([file('a.pdf'), file('c.png', 20)]);
    expect(dialog.files().map(f => f.name)).toEqual(['a.pdf', 'b.pdf', 'c.png']);
    dialog.remove(1);
    expect(dialog.files().map(f => f.name)).toEqual(['a.pdf', 'c.png']);
    expect(dialog.count()).toBe('2 files');
  });

  it('refuses more files than one upload takes before sending any', () => {
    const { dialog, api } = dialogWith();
    dialog.add(Array.from({ length: UPLOAD_MAX_FILES + 1 }, (_, i) => file(`f${i}.pdf`)));
    expect(dialog.tooMany()).toBe(true);
    dialog.confirm();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('says what became of each file and closes as changed when a document was made', () => {
    const { fixture, dialog, el, api, ref } = dialogWith([
      { intakeId: 1, fileName: 'a.pdf', outcome: 'Accepted', ocrDocumentId: 1010 },
      { intakeId: 2, fileName: 'b.pdf', outcome: 'Duplicate', ocrDocumentId: 1004, reason: 'The same file as document 1004; no second document was made.' },
      { intakeId: 3, fileName: 'c.exe', outcome: 'Refused', reason: 'Document Intelligence reads PDF, PNG, JPEG, TIFF and BMP files.' },
    ]);
    dialog.add([file('a.pdf'), file('b.pdf'), file('c.exe')]);
    dialog.confirm();
    expect(api.upload).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(dialog.summary()).toContain('1 document made · 1 already here · 1 refused.');
    expect(el.textContent).toContain('Document 1010');
    expect(el.textContent).toContain('Already here (1004)');
    expect(el.textContent).toContain('Document Intelligence reads PDF');
    dialog.confirm();
    expect(ref.close).toHaveBeenCalledWith({ changed: true });
  });
});
