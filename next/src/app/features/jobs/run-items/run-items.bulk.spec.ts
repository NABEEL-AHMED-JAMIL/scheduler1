import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { RunItems } from './run-items';
import { ItemsPage, RunItem } from './run-items.model';
import { RunItemsReview } from './run-items-review';

/**
 * MIG-421, bulk select on the Items tab (the design's screen 6): ticked rows and "Select all N matching" (by the filter and
 * search, across pages, less the unticked) as Core's selection; the bar's Retry N failed retries only the failed ones,
 * Download zip asks for one link to the selected items, Export CSV the selected rows, and Send to review a team's task.
 */
const item = (n: number, status: RunItem['status'] = 'done'): RunItem => ({
  ref: String(n), key: `voice-intake/call-${n}.m4a`, label: `call-${n}.m4a`, position: n, status,
  failedStep: status === 'failed' ? { index: 2, key: 'ai', name: 'AI prompt' } : null, cells: {},
});

const PAGE = (over: Partial<ItemsPage> = {}): ItemsPage => ({
  jobQueueId: 8814, itemRun: true,
  summary: { items: 50, done: 48, failed: 2, running: 0, failedItems: 2, files: 50, failedAt: [{ step: 'AI prompt', count: 2 }],
    runStatus: 'Completed', retryable: true },
  steps: [{ index: 0, key: 'read', name: 'Read S3', task: 'read_s3', role: 'source' }, { index: 2, key: 'ai', name: 'AI prompt', task: 'ai_prompt', role: 'each' }],
  fields: ['risk'], masked: [], total: 9, page: 0, size: 50, items: [item(4), item(6, 'failed'), item(10), item(13)], ...over,
});

function mount(choice: unknown = true) {
  const toasts: string[] = [];
  const opened: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItems], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: Dialog, useValue: { open: (c: unknown, config: unknown) => { opened.push({ c, config }); return { closed: of(choice) }; } } },
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), info: () => {}, error: (m: string) => toasts.push(`error: ${m}`) } }] });
  const fixture = TestBed.createComponent(RunItems);
  fixture.componentRef.setInput('jobQueueId', '8814');
  fixture.componentRef.setInput('first', PAGE());
  fixture.componentRef.setInput('canRetry', true);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const tick = (ref: string) => { (el.querySelector(`tr[data-ref="${ref}"] [data-test="item-pick"]`) as HTMLInputElement).click(); fixture.detectChanges(); };
  return { fixture, http, el, toasts, opened, tick };
}

const answer = (items: number, failed: number) => ({ status: API_SUCCESS, data: { jobQueueId: 8814, items, failed, refs: [], failedRefs: [], labels: ['call-4.m4a'] } });

describe('Run items: bulk select', () => {
  it('counts the rows ticked with Core, offers every matching item, and clears', () => {
    const { http, el, fixture, tick } = mount();
    expect(el.querySelector('[data-test="items-bar"]')).toBeNull();
    tick('4');
    tick('6');
    const asks = http.match(r => r.url.endsWith('/runItems/selection'));
    expect(asks.map(a => a.request.body)).toEqual([{ jobQueueId: 8814, refs: ['4'] }, { jobQueueId: 8814, refs: ['4', '6'] }]);
    asks.forEach(a => a.flush(answer(2, 1)));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="bar-count"]')?.textContent?.trim()).toBe('2 selected');
    expect(el.querySelector('[data-test="bar-retry"]')?.textContent?.trim()).toBe('Retry 1 failed');
    expect(el.querySelector('[data-test="bar-zip"]')?.textContent?.trim()).toBe('Download zip (2 items)');
    expect(el.querySelector('tr[data-ref="4"]')?.classList).toContain('is-picked');

    // "Select all 9 matching": the list's filter and search, every page, less what is unticked.
    (el.querySelector('[data-test="bar-select-all"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick('13');
    const all = http.match(r => r.url.endsWith('/runItems/selection'));
    expect(all.map(a => a.request.body)).toEqual([{ jobQueueId: 8814, all: true, status: 'all' },
      { jobQueueId: 8814, all: true, status: 'all', except: ['13'] }]);
    all.forEach(a => a.flush(answer(8, 2)));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="bar-count"]')?.textContent?.trim()).toBe('8 selected');
    expect(el.querySelector('[data-test="bar-select-all"]')).toBeNull();

    (el.querySelector('[data-test="bar-clear"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="items-bar"]')).toBeNull();
  });

  it('ticks a whole page from the header, which shows some when only some are', () => {
    const { http, el, fixture, tick } = mount();
    tick('4');
    http.match(r => r.url.endsWith('/runItems/selection')).forEach(a => a.flush(answer(1, 0)));
    fixture.detectChanges();
    const head = el.querySelector('[data-test="items-pick-page"]') as HTMLInputElement;
    expect(head.indeterminate).toBe(true);
    head.click();
    fixture.detectChanges();
    const asks = http.match(r => r.url.endsWith('/runItems/selection'));
    expect(asks.at(-1)!.request.body).toEqual({ jobQueueId: 8814, refs: ['4', '6', '10', '13'] });
    asks.forEach(a => a.flush(answer(4, 1)));
    fixture.detectChanges();
    expect(head.checked).toBe(true);
  });

  it('retries only the failed items of the selection, after asking, and reads the list again', async () => {
    const { http, el, fixture, tick, toasts } = mount(true);
    tick('4');
    tick('6');
    http.match(r => r.url.endsWith('/runItems/selection')).forEach(a => a.flush(answer(2, 1)));
    fixture.detectChanges();
    (el.querySelector('[data-test="bar-retry"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const retry = http.expectOne(r => r.url.endsWith('/retryRunItems'));
    expect(retry.request.body).toEqual({ jobQueueId: 8814, refs: ['4', '6'], onlyFailed: true, from: 'failed_step' });
    retry.flush({ status: API_SUCCESS, message: 'Retrying 1 item from AI prompt: attempt 2.', data: { jobQueueId: 8814, attempt: 2, items: 1, from: 'failed_step' } });
    expect(toasts).toEqual(['Retrying 1 item from AI prompt: attempt 2.']);
    expect(http.match(r => r.url.endsWith('/sourceJob.json/runItems'))).toHaveLength(1);
  });

  it('downloads the selected items as one zip through a signed link, and their rows as CSV', () => {
    const { http, el, fixture, tick } = mount();
    tick('4');
    tick('10');
    http.match(r => r.url.endsWith('/runItems/selection')).forEach(a => a.flush(answer(2, 0)));
    fixture.detectChanges();
    (el.querySelector('[data-test="bar-zip"]') as HTMLButtonElement).click();
    const link = http.expectOne(r => r.url.endsWith('/runItems/zipLink'));
    expect(link.request.params.getAll('refs')).toEqual(['4', '10']);
    expect(link.request.params.get('ref')).toBeNull();
    link.flush({ status: API_SUCCESS, data: { token: 'tok', items: 2, files: 5 } });
    const zip = http.expectOne(r => r.url.endsWith('/runItems/zip'));
    expect(zip.request.params.get('token')).toBe('tok');
    zip.flush(new Blob(['PK']), { headers: { 'content-disposition': 'attachment; filename="run-8814-2-items.zip"' } });

    (el.querySelector('[data-test="bar-csv"]') as HTMLButtonElement).click();
    const csv = http.expectOne(r => r.url.endsWith('/runItems/csv'));
    expect(csv.request.params.getAll('refs')).toEqual(['4', '10']);
    csv.flush(new Blob(['#,item']));
  });

  it('sends the selection to a team as a Task inbox task', () => {
    const { http, el, fixture, tick, opened, toasts } = mount({ reviewers: { kind: 'team', value: '1063' }, note: 'Check the risk' });
    tick('6');
    http.match(r => r.url.endsWith('/runItems/selection')).forEach(a => a.flush(answer(1, 1)));
    fixture.detectChanges();
    (el.querySelector('[data-test="bar-review"]') as HTMLButtonElement).click();
    expect((opened[0] as { c: unknown }).c).toBe(RunItemsReview);
    const sent = http.expectOne(r => r.url.endsWith('/reviewRunItems'));
    expect(sent.request.body).toEqual({ jobQueueId: 8814, refs: ['6'], reviewers: { kind: 'team', value: '1063' }, note: 'Check the risk' });
    sent.flush({ status: API_SUCCESS, message: 'Sent 1 item to review: a Task inbox task for the team.', data: { jobQueueId: 8814, items: 1, requestId: 7 } });
    fixture.detectChanges();
    expect(toasts).toEqual(['Sent 1 item to review: a task in Review › Approvals.']);
    expect(el.querySelector('[data-test="items-bar"]')).toBeNull();
  });
});
