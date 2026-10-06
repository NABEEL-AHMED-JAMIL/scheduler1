import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { RunReview } from './run-review';

/**
 * MIG-237, the console half: a run whose pipeline requires review shows its review on the run page -- who must review,
 * what has been decided -- and a reviewer who may decide approves, or rejects with a reason and optionally runs it
 * again. A run that needs no review shows nothing.
 */
const PENDING = { jobQueueId: 7447, jobId: 2853, attempt: 1, runStatus: 'Completed', reviewStatus: 'PENDING', required: ['internal'],
  decisions: [], decidedAt: null, rerunJobQueueId: null, you: { party: 'internal', canDecide: true, refusal: null } };

function mount(review: unknown) {
  const toasts: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('ERR ' + m), info: () => {} } }] });
  const fixture = TestBed.createComponent(RunReview);
  fixture.componentRef.setInput('jobQueueId', '7447');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url.endsWith('/sourceJob.json/review') && r.params.get('jobQueueId') === '7447')
    .flush({ status: API_SUCCESS, message: '', data: review });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim() === name);
  return { fixture, http, el, button, toasts };
}

describe('RunReview', () => {
  it('shows nothing for a run that needs no review', () => {
    const { el } = mount({ ...PENDING, reviewStatus: 'NOT_REQUIRED', required: [] });
    expect(el.querySelector('[data-review]')).toBeNull();
  });

  it('shows a pending review, who must review, and lets a reviewer approve', () => {
    const { el, http, button, fixture, toasts } = mount(PENDING);
    expect(el.querySelector('[data-review]')!.textContent).toContain('Waiting for review');
    expect(el.textContent).toContain('Our team');
    button('Approve')!.click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/review/decide'));
    expect(req.request.body).toEqual({ jobQueueId: 7447, decision: 'APPROVED', comment: '', party: 'internal' });
    req.flush({ status: API_SUCCESS, message: "The internal review is recorded: the run's results are APPROVED.", data: {} });
    // The review is read again after a decision, so the panel shows what the server recorded.
    http.expectOne(r => r.url.endsWith('/sourceJob.json/review')).flush({ status: API_SUCCESS, message: '',
      data: { ...PENDING, reviewStatus: 'APPROVED', decisions: [{ runReviewDecisionId: 1, party: 'internal', decision: 'APPROVED',
        comment: '', reason: null, reviewer: 'Casey Admin', decidedAt: '2026-09-29 21:00:00' }], you: { party: 'internal', canDecide: false } } });
    fixture.detectChanges();
    expect(el.querySelector('[data-review]')!.textContent).toContain('Approved');
    expect(el.textContent).toContain('Casey Admin');
    expect(button('Approve')).toBeUndefined();
    expect(toasts[0]).toContain('APPROVED');
  });

  it('asks a reason before rejecting, and can run it again', () => {
    const { el, http, button, fixture } = mount(PENDING);
    button('Reject')!.click();
    fixture.detectChanges();
    expect(button('Reject results')!.disabled).toBe(true);
    const reason = el.querySelector<HTMLTextAreaElement>('#reviewReason')!;
    reason.value = 'Wound WC-0002 measured without its ruler in frame.';
    reason.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('#reviewRerun')!.click();
    fixture.detectChanges();
    button('Reject results')!.click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/review/decide'));
    expect(req.request.body).toEqual({ jobQueueId: 7447, decision: 'REJECTED', comment: '', reason: 'Wound WC-0002 measured without its ruler in frame.',
      rerun: true, party: 'internal' });
  });

  it('says why a person cannot decide', () => {
    const { el, button } = mount({ ...PENDING, you: { party: 'internal', canDecide: false, refusal: 'Only a workspace administrator decides a review.' } });
    expect(button('Approve')).toBeUndefined();
    expect(el.textContent).toContain('Only a workspace administrator decides a review.');
  });
});
