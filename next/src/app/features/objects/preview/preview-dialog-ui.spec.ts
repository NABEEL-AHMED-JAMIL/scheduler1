import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, of } from 'rxjs';
import { PreviewDialog } from './preview-dialog';
import { StorageService } from '../storage.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/** Audit 09-22, the preview as drawn: a header that fits a phone, named controls, the shared blur. */
function render(name: string, storage: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: StorageService, useValue: { previewText: () => of('plain text'), previewBlob: () => of(new Blob(['x'])), ...storage } },
    { provide: DialogRef, useValue: { close: () => {}, keydownEvents: NEVER, backdropClick: NEVER, disableClose: false } },
    { provide: DIALOG_DATA, useValue: { bucket: 'b', key: 'folder/' + name, name } },
  ] });
  (URL as any).createObjectURL ??= () => 'blob:x';
  (URL as any).revokeObjectURL ??= () => {};
  const fixture = TestBed.createComponent(PreviewDialog);
  fixture.detectChanges();
  return { fixture, dialog: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('PreviewDialog header and controls', () => {
  it('wraps its header, so Close is never clipped off a phone-width card', () => {
    const { el } = render('notes.txt');
    const header = el.querySelector('.card > div')!;
    expect(header.classList).toContain('flex-wrap');
    const close = el.querySelector('button[aria-label="Close"]')!;
    expect(close.classList).toContain('shrink-0');
  });

  it('names the zoom buttons, keeps them neutral, and makes click-to-zoom a real button', () => {
    const { el } = render('photo.png');
    expect(el.querySelector('button[aria-label="Zoom out"]')).not.toBeNull();
    const zoomIn = el.querySelector('button[aria-label="Zoom in"]')!;
    expect(zoomIn.querySelector('.icon-ok')).toBeNull();
    const surface = el.querySelector<HTMLButtonElement>('button[aria-label="Zoom to 200%"]')!;
    expect(surface.querySelector('img')).not.toBeNull();
  });

  it('labels the edit box with the file it edits', () => {
    const { el, dialog, fixture } = render('notes.txt');
    dialog.startEdit();
    fixture.detectChanges();
    expect(el.querySelector('textarea')!.getAttribute('aria-label')).toBe('Contents of notes.txt');
  });

  it('letterboxes a video on the code surface, not a raw black', () => {
    const { el } = render('clip.mp4');
    expect(el.querySelector('video')!.classList).not.toContain('bg-black');
  });

  it('blurs the table under the shared loader while the next page loads', () => {
    let calls = 0;
    const previewTable = () => (calls++ === 0 ? of({ status: API_SUCCESS, data: {
      source: 'csv', columns: ['id'], rows: [['1']], offset: 0, limit: 1, totalRows: 5, sheets: [] } }) : NEVER);
    const { el, dialog, fixture } = render('orders.csv', { previewTable });
    dialog.tablePage(1);
    fixture.detectChanges();
    expect(el.querySelector('.opacity-60')).toBeNull();
    expect(el.querySelector('app-blur-loader .blur-loader.is-loading table')).not.toBeNull();
  });
});
