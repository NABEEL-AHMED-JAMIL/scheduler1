import { describe, it, expect, vi } from 'vitest';
import { WritableSignal, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { DocumentsApi } from './documents.service';
import { ReviewQueue } from './review-queue';

/**
 * MIG-272: the review queue. The service pages it (from 0) and filters it; the screen names each document by its file,
 * shows how many values need a look and the least sure one, who holds a claim, and starts on the first document nobody
 * else holds.
 */
const ITEMS = [
  { extractionId: 1006, ocrDocumentId: 1001, status: 'Review', revision: 0, documentTypeName: 'Contract', documentTypeVersion: 1, fieldCount: 8,
    reviewCount: 8, minConfidence: 0.5, claimActive: true, claimedBy: 99, dateFinished: '2026-09-29T05:12:30.000+00:00' },
  { extractionId: 1005, ocrDocumentId: 1001, status: 'Review', revision: 0, documentTypeName: 'Invoice', documentTypeVersion: 2, fieldCount: 9,
    reviewCount: 4, minConfidence: 0, claimActive: true, claimedBy: 4537, autoApproveThreshold: 0.9 },
];
const ok = <T>(data: T) => of({ status: 'SUCCESS', message: '', data });

function screenWith(queue = vi.fn(() => ok({ total: 2, page: 0, size: 50, items: ITEMS }))) {
  const api = {
    queue,
    types: vi.fn(() => ok([{ documentTypeId: 1000, builtIn: true, typeKey: 'invoice', name: 'Invoice', status: 'Active', currentVersion: 2 }])),
    reads: vi.fn(() => ok([{ ocrDocumentId: 1001, sourceBucket: 'ui-review-s3', sourceKey: 'ocr-live-check/ocr-live-check.png', status: 'Done' }])),
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: DocumentsApi, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { user: signal({ appUserId: 4537, tenantId: 2924 }) } },
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ReviewQueue);
  return { fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api, router, toast };
}

describe('ReviewQueue', () => {
  it('asks for the first page of documents in review, and names each by its file', async () => {
    const { fixture, el, api } = screenWith();
    await fixture.whenStable();
    expect(api.queue).toHaveBeenCalledWith({ status: 'Review', documentTypeId: null, claimed: '', maxConfidence: null, olderThanMinutes: null, page: 0, size: 50 });
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('ocr-live-check.png');
    expect(rows[1].textContent).toContain('4 of 9');
    expect(rows[1].querySelector('a')?.getAttribute('href')).toBe('/review/documents/1005');
  });

  it('ZT-D1: names an uploaded document by the file it arrived as, not its stored key ("original.pdf")', async () => {
    const { fixture, el, api } = screenWith();
    api.reads.mockReturnValue(ok([{ ocrDocumentId: 1001, sourceBucket: 'etl-documents', sourceKey: 'ocr/2960/1061/original.pdf',
      originalName: 'medication-list-TEST-M7001.pdf', status: 'Done' }]) as never);
    await fixture.whenStable();
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows[1].textContent).toContain('medication-list-TEST-M7001.pdf');
    expect(el.textContent).not.toContain('original.pdf');
  });

  it('ZT-D11: a platform administrator\'s own sign-in (no workspace) gets the needs-workspace card and no queue call', async () => {
    const queue = vi.fn(() => ok({ total: 2, page: 0, size: 50, items: ITEMS }));
    const { fixture, el, api } = screenWith(queue);
    (TestBed.inject(AuthService).user as unknown as WritableSignal<unknown>).set({ appUserId: 4639, tenantId: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Documents are a workspace\'s, and this sign-in has none.');
    expect(queue).not.toHaveBeenCalled();
    expect(api.reads).not.toHaveBeenCalled();
  });

  it('shows whose claim a document is under', async () => {
    const { fixture, el } = screenWith();
    await fixture.whenStable();
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows[0].textContent).toContain('User 99');
    expect(rows[1].textContent).toContain('You');
  });

  it('names whose claim it is when Identity knows them', async () => {
    const { fixture, el } = screenWith(vi.fn(() => ok({ total: 1, page: 0, size: 50, items: [{ ...ITEMS[0], claimedByName: 'Sam Reviewer' }] })));
    await fixture.whenStable();
    expect(el.querySelector('tbody tr')!.textContent).toContain('Sam Reviewer');
  });

  it('sends every filter to the service, from the first page again', async () => {
    const { fixture, screen, api } = screenWith();
    await fixture.whenStable();
    screen.goTo(2);
    screen.set(screen.typeId, '1000');
    screen.set(screen.claimed, 'unclaimed');
    screen.set(screen.confidence, '0.8');
    screen.set(screen.age, '60');
    screen.set(screen.status, 'Approved');
    expect(api.queue).toHaveBeenLastCalledWith({ status: 'Approved', documentTypeId: 1000, claimed: 'unclaimed', maxConfidence: 0.8,
      olderThanMinutes: 60, page: 0, size: 50 });
    expect(screen.hasFilters()).toBe(true);
    screen.clear();
    expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Review', claimed: '', page: 0 }));
  });

  it('starts on the first document nobody else holds', async () => {
    const { fixture, screen, router } = screenWith();
    await fixture.whenStable();
    screen.start();
    expect(router.navigate).toHaveBeenCalledWith(['/review/documents', 1005]);
  });

  it('says so when nothing is waiting', async () => {
    const { fixture, el, screen } = screenWith(vi.fn(() => ok({ total: 0, page: 0, size: 50, items: [] })));
    await fixture.whenStable();
    expect(el.textContent).toContain('Nothing is waiting for review.');
    expect(screen.firstFree()).toBeNull();
  });

  it('shows the service\'s refusal', async () => {
    const refused = new HttpErrorResponse({ status: 400, error: { status: 'ERROR', message: 'claimed is mine, unclaimed or others.' } });
    const { fixture, el } = screenWith(vi.fn(() => throwError(() => refused)));
    await fixture.whenStable();
    expect(el.textContent).toContain('claimed is mine, unclaimed or others.');
  });
});

describe('ReviewQueue -- sorted on the server (owner 2026-10-27)', () => {
  it('sends no sort before a heading is picked, then the column and direction from page 1, and pages on in it', async () => {
    try { localStorage.clear(); } catch { /* none */ }
    const { fixture, el, screen, api } = screenWith();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.queue.mock.calls[0]).toEqual([{ status: 'Review', documentTypeId: null, claimed: '', maxConfidence: null, olderThanMinutes: null, page: 0, size: 50 }]);
    const sortable = [...el.querySelectorAll('thead th')].filter(th => th.querySelector('button.th-sort')).map(th => th.textContent?.trim());
    expect(sortable).toEqual(['Document', 'Type', 'To check', 'Least sure', 'Waiting since', 'Claimed', 'State']);
    screen.goTo(2);
    screen.sort.toggle('leastSure');
    expect(screen.page()).toBe(1);
    expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, sort: 'leastSure', dir: 'asc' }));
    screen.sort.toggle('toCheck');
    expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, sort: 'toCheck', dir: 'desc' }));
    screen.goTo(2);
    expect(api.queue).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, sort: 'toCheck', dir: 'desc' }));
    try { localStorage.clear(); } catch { /* none */ }
  });

  it('Start reviewing keeps to the queue\'s own order, oldest first, whatever the list is sorted by', async () => {
    try { localStorage.clear(); } catch { /* none */ }
    // The viewer's order puts 1005 (theirs) first; the queue's own order has 1007, free and oldest, first.
    const OWN = [{ ...ITEMS[0], extractionId: 1007, claimActive: false, claimedBy: null }, ITEMS[1]];
    const queue = vi.fn((f: { sort?: string }) => ok({ total: 2, page: 0, size: 50, items: f.sort ? [ITEMS[1], ITEMS[0]] : OWN }));
    const { fixture, screen, api, router } = screenWith(queue as never);
    await fixture.whenStable();
    screen.sort.toggle('document');
    expect(screen.startable()).toBe(true);
    screen.start();
    expect(api.queue).toHaveBeenLastCalledWith({ status: 'Review', documentTypeId: null, claimed: '', maxConfidence: null, olderThanMinutes: null, page: 0, size: 50 });
    expect(router.navigate).toHaveBeenCalledWith(['/review/documents', 1007]);
    try { localStorage.clear(); } catch { /* none */ }
  });
});
