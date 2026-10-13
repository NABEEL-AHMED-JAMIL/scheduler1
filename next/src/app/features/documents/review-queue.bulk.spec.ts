import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { DocumentsApi } from './documents.service';
import { ReviewQueue } from './review-queue';

/**
 * Bulk review (2026-10-12) on the Document review queue: whoever may open the queue picks the documents in review that
 * nobody else holds; Select all matching asks the service with the same filters; each document goes at the revision it
 * was listed at; a filter changed starts the selection again; a viewer sees no checkboxes.
 */
const ME = 4537;
const doc = (id: number, extra: object = {}) => ({ extractionId: id, ocrDocumentId: 1001, status: 'Review', revision: id % 7, documentTypeName: 'Invoice',
  fieldCount: 8, reviewCount: 2, minConfidence: 0.6, ...extra });
const ITEMS = [doc(1006), doc(1005, { claimActive: true, claimedBy: 99 }), doc(1004, { claimActive: true, claimedBy: ME })];
const ok = <T>(data: T) => of({ status: 'SUCCESS', message: '', data });

function screen(opts: { canOpen?: boolean; total?: number } = {}) {
  const api = {
    queue: vi.fn((f: { size: number }) => ok({ total: opts.total ?? 340, page: 0, size: f.size,
      items: f.size === 100 ? Array.from({ length: 100 }, (_, i) => doc(2000 + i)) : ITEMS })),
    types: vi.fn(() => ok([{ documentTypeId: 1000, typeKey: 'invoice', name: 'Invoice', status: 'Active', currentVersion: 2 }])),
    reads: vi.fn(() => ok([])),
  };
  const bulk = { documents: vi.fn(() => ok(null)) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: DocumentsApi, useValue: api },
      { provide: BulkReviewApi, useValue: bulk },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AuthService, useValue: { user: signal({ appUserId: ME, tenantId: 2945 }), canOpen: (p: string) => opts.canOpen !== false && p === 'document-review' } },
    ],
  });
  const fixture = TestBed.createComponent(ReviewQueue);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, queue: fixture.componentInstance, api, bulk, refresh: () => fixture.detectChanges() };
}

describe('Document review queue: bulk', () => {
  it('shows no checkboxes to a viewer', () => {
    const { el } = screen({ canOpen: false });
    expect(el.querySelector('[data-bulk-pick]')).toBeNull();
    expect(el.querySelector('[data-bulk-page]')).toBeNull();
  });

  it('picks the documents in review nobody else holds; one claimed by someone else stays out', () => {
    const { el, queue, refresh } = screen();
    const other = el.querySelector<HTMLInputElement>('[data-bulk-pick="1005"]')!;
    expect(other.disabled).toBe(true);
    expect(other.title).toContain('Claimed by someone else');
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    refresh();
    expect(queue.bulk.ids()).toEqual([1006, 1004]);
    expect(el.querySelector('[data-bulk-count]')!.textContent!.trim()).toBe('2 selected');
  });

  it('selects the first 100 of every match, asking the service with the same filters', () => {
    const { el, queue, api, refresh } = screen();
    queue.set(queue.typeId, '1000');
    refresh();
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    refresh();
    const link = el.querySelector<HTMLButtonElement>('[data-bulk-matching]')!;
    expect(link.textContent!.trim()).toBe('Select the first 100 of 340 matching');
    link.click();
    refresh();
    expect(api.queue).toHaveBeenLastCalledWith({ status: 'Review', documentTypeId: 1000, claimed: '', maxConfidence: null, olderThanMinutes: null, page: 0, size: 100 });
    expect(queue.bulk.count()).toBe(100);
    expect(el.querySelector('[data-bulk-matched]')!.textContent!.trim()).toBe('The first 100 of 340 matching are selected.');
  });

  it('starts the selection again when a filter changes', () => {
    const { el, queue, refresh } = screen();
    el.querySelector<HTMLInputElement>('[data-bulk-pick="1006"]')!.click();
    refresh();
    expect(queue.bulk.count()).toBe(1);
    queue.set(queue.confidence, '0.5');
    expect(queue.bulk.count()).toBe(0);
    el.querySelector<HTMLInputElement>('[data-bulk-pick="1006"]')!.click();
    queue.clear();
    expect(queue.bulk.count()).toBe(0);
  });

  it('sends each document with the revision it was listed at', () => {
    const { el, queue, bulk, refresh } = screen();
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    refresh();
    const request = { action: 'reject' as const, comment: 'Blurred scans', bulkId: 'bulk-0002', dryRun: true };
    queue.bulk.source.send(queue.bulk.rows(), request).subscribe();
    expect(bulk.documents).toHaveBeenCalledWith([1006, 1004], { '1006': 1006 % 7, '1004': 1004 % 7 }, request);
  });
});
