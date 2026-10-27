import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { NeedsAttention, retryWord } from './needs-attention';

/**
 * MIG-420: Home names the recent runs whose items failed, with the way to the failed items and Retry -- and shows
 * nothing at all to a reader Core refuses, or when nothing failed.
 */
const RUN = { jobQueueId: 8814, jobId: 2808, jobName: 'Voice call insight', endedAt: '2026-10-21T15:38:00Z', failed: 2, items: 50,
  labels: ['call-b.m4a', 'call-f.m4a'], failedAt: ['AI prompt'] };

function card(opts: { jobs?: boolean; queue?: boolean; tenantId?: number | null } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [NeedsAttention], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } },
    { provide: AuthService, useValue: {
      canOpen: (p: string) => p === 'jobs' ? opts.jobs ?? true : p === 'queue' ? !!opts.queue : false,
      user: () => ({ appUserId: 4690, tenantId: opts.tenantId === undefined ? 2960 : opts.tenantId }) } }] });
  const fixture = TestBed.createComponent(NeedsAttention);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, http, el };
}

describe('Home: needs attention', () => {
  it('names each run with failed items, how many and where, with See failed items and Retry both', async () => {
    const { fixture, http, el } = card();
    const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/attention'));
    expect(ask.request.params.get('limit')).toBe('5');
    ask.flush({ status: API_SUCCESS, data: [RUN] });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="attention-line"]')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('2 items failed at AI prompt: call-b.m4a, call-f.m4a');
    expect(el.querySelector('a.btn')?.getAttribute('href')).toBe('/pipelines/schedules/2808/runs/8814?tab=items&status=failed');
    const retry = el.querySelector('[data-test="attention-retry"]') as HTMLButtonElement;
    expect(retry.textContent?.trim()).toBe('Retry both');
    retry.click();
    await new Promise(r => setTimeout(r));
    expect(http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRunItems')).request.body)
      .toEqual({ jobQueueId: 8814, failed: true, from: 'failed_step' });
    expect(retryWord(5)).toBe('Retry 5');
  });

  it('is hidden on a 403 and when nothing failed', () => {
    const refused = card();
    refused.http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/attention'))
      .flush({ status: 'ERROR', message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    refused.fixture.detectChanges();
    expect(refused.el.querySelector('[data-test="needs-attention"]')).toBeNull();
    const none = card();
    none.http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/attention')).flush({ status: API_SUCCESS, data: [] });
    none.fixture.detectChanges();
    expect(none.el.querySelector('[data-test="needs-attention"]')).toBeNull();
  });

  it('asks nothing outside a workspace or without the run pages, and gives a reviewer no Retry', () => {
    card({ tenantId: null }).http.expectNone(r => r.url.includes('runItems'));
    card({ jobs: false, queue: false }).http.expectNone(r => r.url.includes('runItems'));
    const reviewer = card({ jobs: false, queue: true });
    reviewer.http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/attention')).flush({ status: API_SUCCESS, data: [RUN] });
    reviewer.fixture.detectChanges();
    expect(reviewer.el.querySelector('[data-test="needs-attention"]')).not.toBeNull();
    expect(reviewer.el.querySelector('[data-test="attention-retry"]')).toBeNull();
  });
});
