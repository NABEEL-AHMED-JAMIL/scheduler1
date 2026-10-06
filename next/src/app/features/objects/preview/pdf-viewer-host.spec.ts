import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PdfViewer } from './pdf-viewer';

/**
 * <app-pdf-viewer> sits in fixed-height boxes (a 72vh dialog body, a preview pane). As an unknown tag it
 * was inline, so its inner `h-full` had no height to take: the page scroller grew to the whole PDF and the
 * dialog's overflow-hidden clipped it -- a billing document could not be scrolled. The host is now a
 * shrinkable flex column that fills whatever box it is put in.
 */
describe('app-pdf-viewer host', () => {
  it('is a flex column that fills its box and may shrink, so its pages scroll inside it', () => {
    const fixture = TestBed.createComponent(PdfViewer);
    const host = fixture.nativeElement as HTMLElement;
    for (const cls of ['flex', 'flex-col', 'flex-1', 'min-h-0', 'h-full']) {
      expect(host.classList.contains(cls), cls).toBe(true);
    }
  });
});
