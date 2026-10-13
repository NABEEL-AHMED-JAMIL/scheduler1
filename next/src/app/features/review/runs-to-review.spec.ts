import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { TaskCountService } from '../workflows/task-count.service';
import { RunsToReview } from './runs-to-review';
import { ReviewItemPanel } from './review-item-panel';
import { ReviewItem, uidOf } from './review-sources';

/** UX review DR2 (2026-10-13): Review › Runs -- every run waiting for review, not the newest five, and a plain empty state. */
function screen(runs: number) {
  const refresh = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RunsToReview],
    providers: [
      provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { isTenantAdmin: () => true, canOpen: () => true, user: signal({ appUserId: 4640, tenantId: 2960 }) } },
      { provide: TaskCountService, useValue: { refresh } },
    ],
  });
  const fixture = TestBed.createComponent(RunsToReview);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/sourceJob.json/review/waiting')).flush({ status: 'SUCCESS', data: {
    runs: Array.from({ length: runs }, (_, i) => ({ jobQueueId: 8300 + i, jobId: 2907, jobName: 'Synthetic claims (daily)', finishedAt: null,
      required: ['internal'], decisions: [] })), more: false } });
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, refresh, component: fixture.componentInstance };
}

describe('Review › Runs', () => {
  it('lists every run waiting, with no "Show all" step', () => {
    const { el } = screen(7);
    expect(el.querySelectorAll('[data-run]').length).toBe(7);
    expect(el.textContent).not.toContain('Show all');
  });

  it('says plainly when no run waits', () => {
    const { el } = screen(0);
    expect(el.querySelector('app-empty-state')?.textContent).toContain('No run is waiting for review');
  });

  it('reads the menu\'s count again after a decision', () => {
    const { component, refresh } = screen(1);
    component.counted();
    expect(refresh).toHaveBeenCalled();
  });
});

describe('Review: an item\'s side panel', () => {
  function panel(item: ReviewItem) {
    const close = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReviewItemPanel],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: DIALOG_DATA, useValue: { item } },
        { provide: DialogRef, useValue: { close, closed: of(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(ReviewItemPanel);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), close };
  }
  const base: ReviewItem = { uid: uidOf('document', 1133), kind: 'document', via: 'document', id: 1133, title: 'Document 1133', from: 'Invoice',
    since: '2026-10-13T03:10:47.871+00:00', due: null, overdue: false, waitsOn: 'Any reviewer', pickable: true, whyNot: '' };

  it('shows a document\'s least sure values, and offers Approve, Reject and the way to its page', () => {
    const p = panel(base);
    p.http.expectOne(r => r.url.endsWith('/documentReview.json/fetchById')).flush({ status: 'SUCCESS', data: {
      extractionId: 1133, ocrDocumentId: 1, status: 'Review', revision: 0, reviewCount: 1, fieldCount: 2, minConfidence: 0.41,
      fields: [{ fieldId: 1, fieldKey: 'total', label: 'Total', value: '41.00', confidence: 0.41 }, { fieldId: 2, fieldKey: 'vendor', value: 'Acme', confidence: 0.99 }] } });
    p.fixture.detectChanges();
    expect(p.el.querySelector('[data-test="panel-document"]')?.textContent).toContain('Total');
    expect(p.el.querySelector('[data-test="panel-document"]')?.textContent).not.toContain('Acme');
    expect(p.el.querySelector('[data-test="panel-document"]')?.textContent).toContain('1 of 2 values');
    expect(p.el.querySelector('[data-test="panel-document"]')?.textContent).toContain('least sure 41%');
    expect(p.el.querySelector('[data-test="panel-open"]')?.getAttribute('href')).toBe('/review/documents/1133');
    (p.el.querySelector('[data-test="panel-approve"]') as HTMLButtonElement).click();
    expect(p.close).toHaveBeenCalledWith({ act: 'approve' });
  });

  it('says why an item cannot be decided here instead of offering it', () => {
    const p = panel({ ...base, pickable: false, whyNot: 'Claimed by someone else: they decide it.' });
    p.http.expectOne(() => true).flush({ status: 'SUCCESS', data: { fields: [] } });
    p.fixture.detectChanges();
    expect(p.el.querySelector('[data-test="panel-approve"]')).toBeNull();
    expect(p.el.textContent).toContain('Claimed by someone else');
  });
});
