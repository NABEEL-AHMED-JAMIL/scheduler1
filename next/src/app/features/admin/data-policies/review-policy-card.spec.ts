import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReviewPolicyCard } from './review-policy-card';

/**
 * Bulk review (2026-10-12): the workspace's review policy on Data policies -- runs (Core) and documents (ai-service) may be
 * approved in bulk, and whether a bulk approve takes documents whose rules fail. An administrator changes it; any other
 * member reads it with the lock note.
 */
function render(opts: { admin: boolean; tenantId?: number | null }) {
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin, user: signal({ appUserId: 4639, tenantId: opts.tenantId === undefined ? 2945 : opts.tenantId }) } }],
  });
  const fixture = TestBed.createComponent(ReviewPolicyCard);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const answer = () => {
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/sourceJob.json/review/policy'))
      .flush({ status: 'SUCCESS', message: '', data: { bulkApproveRuns: true, saved: false } });
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/documentReview.json/policy'))
      .flush({ status: 'SUCCESS', message: '', data: { bulkApprove: true, bulkApproveRuleFailures: false, saved: true, updatedAt: '2026-10-12T21:05:00' } });
    fixture.detectChanges();
  };
  return { fixture, el, http, toast, answer, refresh: () => fixture.detectChanges() };
}

describe('ReviewPolicyCard', () => {
  it('lets an administrator change it, and saves only the service whose part changed', () => {
    const { el, http, toast, answer, refresh } = render({ admin: true });
    answer();
    const runs = el.querySelector<HTMLInputElement>('[data-policy-runs]')!;
    expect(runs.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('[data-policy-rule-failures]')!.checked).toBe(false);
    expect(el.querySelector<HTMLButtonElement>('[data-review-policy-save]')!.disabled).toBe(true);
    runs.click();
    refresh();
    el.querySelector<HTMLButtonElement>('[data-review-policy-save]')!.click();
    const save = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/sourceJob.json/review/policy'));
    expect(save.request.body).toEqual({ bulkApproveRuns: false });
    http.expectNone(r => r.method === 'POST' && r.url.endsWith('/documentReview.json/policy'));
    save.flush({ status: 'SUCCESS', message: '', data: { bulkApproveRuns: false, saved: true, updatedAt: '2026-10-12T22:10:00' } });
    refresh();
    expect(toast.success).toHaveBeenCalledWith('Review policy saved.');
    expect(el.querySelector<HTMLButtonElement>('[data-review-policy-save]')!.disabled).toBe(true);
  });

  it('saves the documents\' part with both of its switches', () => {
    const { el, http, answer, refresh } = render({ admin: true });
    answer();
    el.querySelector<HTMLInputElement>('[data-policy-rule-failures]')!.click();
    refresh();
    el.querySelector<HTMLButtonElement>('[data-review-policy-save]')!.click();
    expect(http.expectOne(r => r.method === 'POST' && r.url.endsWith('/documentReview.json/policy')).request.body)
      .toEqual({ bulkApprove: true, bulkApproveRuleFailures: true });
  });

  it('shows a refused save\'s own sentence (a 4xx) and keeps the other part\'s save', () => {
    const { el, http, toast, answer, refresh } = render({ admin: true });
    answer();
    el.querySelector<HTMLInputElement>('[data-policy-runs]')!.click();
    el.querySelector<HTMLInputElement>('[data-policy-rule-failures]')!.click();
    refresh();
    el.querySelector<HTMLButtonElement>('[data-review-policy-save]')!.click();
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/sourceJob.json/review/policy'))
      .flush({ status: 'ERROR', message: 'bulkApproveRuns is true or false.' }, { status: 400, statusText: 'Bad Request' });
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/documentReview.json/policy'))
      .flush({ status: 'SUCCESS', message: '', data: { bulkApprove: true, bulkApproveRuleFailures: true, saved: true } });
    refresh();
    expect(toast.error).toHaveBeenCalledWith('bulkApproveRuns is true or false.');
    expect(toast.success).not.toHaveBeenCalled();
    // The documents' part is saved; only the runs' change is still waiting.
    expect(el.querySelector<HTMLInputElement>('[data-policy-rule-failures]')!.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('[data-policy-runs]')!.checked).toBe(false);
    expect(el.querySelector<HTMLButtonElement>('[data-review-policy-save]')!.disabled).toBe(false);
  });

  it('shows a refused read\'s own sentence', () => {
    const { el, http, refresh } = render({ admin: true });
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/sourceJob.json/review/policy'))
      .flush({ status: 'ERROR', message: 'The review policy belongs to a workspace; this account is not attached to one.' },
        { status: 400, statusText: 'Bad Request' });
    http.match(r => r.method === 'GET' && r.url.endsWith('/documentReview.json/policy'));
    refresh();
    expect(el.textContent).toContain('The review policy belongs to a workspace; this account is not attached to one.');
  });

  it('is read-only, with the lock note, for any other member', () => {
    const { el, answer } = render({ admin: false });
    answer();
    expect(el.querySelector('[data-policy-runs]')).toBeNull();
    expect(el.querySelector('[data-review-policy-save]')).toBeNull();
    expect(el.textContent).toContain('Bulk approve of runs: On');
    expect(el.textContent).toContain('Documents whose rules fail: left out');
    expect(el.querySelector('[data-read-only]')!.textContent).toContain('Only a workspace administrator can change the review policy.');
  });

  it('is not shown, nor read, without a workspace', () => {
    const { el, http } = render({ admin: true, tenantId: null });
    expect(el.querySelector('[data-review-policy]')).toBeNull();
    http.expectNone(() => true);
  });
});
