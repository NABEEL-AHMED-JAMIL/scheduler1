import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { TaskCountService } from '../workflows/task-count.service';
import type { ReviewCount } from '../review/review-sources';
import { WaitingForReview } from './waiting-for-review';

/**
 * UX review 2026-10-12 (D1) and DR2 (2026-10-13): Home says what waits for the reader's review -- one count over the
 * Review home's list, the same as the menu's badge, and what it is made of -- for reviewers and administrators.
 */
function card(opts: { admin: boolean; inbox: boolean; documents?: boolean; review: ReviewCount | null; tenantId?: number | null }) {
  const count = { review: signal(opts.review), refresh: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: TaskCountService, useValue: count },
      { provide: AuthService, useValue: {
        isTenantAdmin: () => opts.admin,
        canOpen: (p: string) => p === 'task-inbox' ? opts.inbox : p === 'document-review' ? !!opts.documents : true,
        user: () => ({ appUserId: 4641, tenantId: opts.tenantId === undefined ? 2960 : opts.tenantId }) } },
    ],
  });
  const fixture = TestBed.createComponent(WaitingForReview);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, count };
}

const counted = (approval: number, run: number, document: number, overdue = 0, more = false): ReviewCount =>
  ({ total: approval + run + document, overdue, more, kinds: { approval, run, document } });

describe('Home: waiting for your review', () => {
  it('tells a reviewer how much waits, what it is, and the way to Review', () => {
    const { el, count } = card({ admin: false, inbox: true, documents: true, review: counted(1, 1, 8) });
    const link = el.querySelector('[data-test="waiting-total"]') as HTMLAnchorElement;
    expect(link.textContent).toContain('10 waiting for your review');
    expect(link.getAttribute('href')).toBe('/review');
    expect(el.querySelector('[data-test="waiting-kinds"]')?.textContent).toBe('1 approval · 1 run · 8 documents');
    expect(count.refresh).toHaveBeenCalled();
  });

  it('leaves out the kinds with nothing waiting, and says "+" when more runs wait than Core lists', () => {
    const { el } = card({ admin: true, inbox: true, review: counted(0, 50, 0, 0, true) });
    expect(el.querySelector('[data-test="waiting-total"]')?.textContent).toContain('50+ waiting for your review');
    expect(el.querySelector('[data-test="waiting-kinds"]')?.textContent).toBe('50+ runs');
  });

  it('says how many are overdue', () => {
    const { el } = card({ admin: false, inbox: true, review: counted(3, 0, 0, 2) });
    expect(el.querySelector('[data-test="waiting-overdue"]')?.textContent).toContain('2 overdue');
  });

  it('says nothing waits when nothing does', () => {
    expect(card({ admin: false, inbox: true, review: counted(0, 0, 0) }).el.querySelector('[data-test="waiting-none"]')?.textContent)
      .toContain('Nothing is waiting for your review');
    expect(card({ admin: false, inbox: true, review: null }).el.querySelector('[data-test="waiting-none"]')).not.toBeNull();
  });

  it('is shown to a member holding only Document review', () => {
    expect(card({ admin: false, inbox: false, documents: true, review: counted(0, 0, 2) }).el.querySelector('[data-test="waiting-total"]')).not.toBeNull();
  });

  it('is not shown to a viewer, nor outside a workspace', () => {
    expect(card({ admin: false, inbox: false, review: null }).el.querySelector('[data-test="waiting-for-review"]')).toBeNull();
    expect(card({ admin: true, inbox: true, review: null, tenantId: null }).el.querySelector('[data-test="waiting-for-review"]')).toBeNull();
  });
});
