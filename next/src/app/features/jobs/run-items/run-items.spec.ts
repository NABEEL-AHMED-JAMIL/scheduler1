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

/**
 * MIG-420, the run page's Items tab: the chips, the search and the pages ask Core for exactly that list; Retry failed
 * items asks first, then retries every failed item from the step it failed at, and reads the list again.
 */
const item = (n: number, status: RunItem['status'] = 'done'): RunItem => ({
  ref: String(n), key: `call-${n}.m4a`, label: `call-${n}.m4a`, folder: 'voice-intake/', position: n, status,
  failedStep: status === 'failed' ? { index: 3, key: 'ai', name: 'AI prompt' } : null, durationMs: 72_000,
  cells: { transcribe: { status: 'done', hasData: true }, ai: status === 'failed' ? { status: 'failed', hasData: true } : { status: 'done', hasData: true },
    pages: { status: 'done', files: 40 }, report: status === 'failed' ? { status: 'not_run' } : { status: 'done', files: 1 } },
});

const PAGE = (over: Partial<ItemsPage> = {}): ItemsPage => ({
  jobQueueId: 8814, itemRun: true,
  summary: { items: 120, done: 118, failed: 2, running: 0, failedItems: 2, files: 146, averageMs: 118_000,
    failedAt: [{ step: 'AI prompt', count: 2 }], runStatus: 'Completed', retryable: true, source: 'Read S3' },
  steps: [
    { index: 0, key: 'read', name: 'Read S3', task: 'read_s3', role: 'source' },
    { index: 1, key: 'transcribe', name: 'Transcribe', task: 'transcribe', role: 'each' },
    { index: 2, key: 'pages', name: 'Page images', task: 'split', role: 'fan_out' },
    { index: 3, key: 'ai', name: 'AI prompt', task: 'ai_prompt', role: 'each' },
    { index: 4, key: 'report', name: 'Report', task: 'render_pdf', role: 'each' },
  ],
  fields: ['risk', 'patient_name'], masked: ['patient_name'], total: 120, page: 0, size: 50,
  items: [item(1), item(2, 'failed'), item(3)], ...over,
});

function mount(first: ItemsPage | null = PAGE(), confirm = true, canRetry = true) {
  const toasts: string[] = [];
  const opened: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItems], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: Dialog, useValue: { open: (c: unknown, config: unknown) => { opened.push({ c, config }); return { closed: of(confirm) }; } } },
    { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), info: () => {}, error: (m: string) => toasts.push(`error: ${m}`) } }] });
  const fixture = TestBed.createComponent(RunItems);
  fixture.componentRef.setInput('jobQueueId', '8814');
  fixture.componentRef.setInput('first', first);
  fixture.componentRef.setInput('canRetry', canRetry);
  fixture.componentRef.setInput('runDuration', '1 h 38 min');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, http, el, toasts, opened, component: fixture.componentInstance };
}

const lists = (http: HttpTestingController) => http.match(r => r.url.endsWith('/sourceJob.json/runItems'));

describe('Run items tab', () => {
  it('draws the page\'s first answer without asking again: the summary, the chips with counts, a column per step', () => {
    const { http, el } = mount();
    expect(lists(http)).toHaveLength(0);
    expect(el.querySelector('[data-test="items-summary"]')?.textContent).toContain('both at AI prompt');
    expect(el.querySelector('[data-filter="failed"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Failed 2');
    expect([...el.querySelectorAll('thead th[data-step]')].map(th => th.getAttribute('data-step'))).toEqual(['transcribe', 'pages', 'ai', 'report']);
    const failed = el.querySelector('tr[data-ref="2"]')!;
    expect(failed.querySelector('[data-test="item-status"]')?.textContent?.trim()).toBe('Failed at AI prompt');
    expect(failed.querySelector('[data-cell="report"]')?.textContent?.trim()).toBe('—');
    expect(el.querySelector('tr[data-ref="1"] [data-cell="pages"]')?.textContent?.trim()).toBe('40 files ›');
  });

  it('asks for the failed ones, a search and the next page, and says the status for the address', () => {
    const { http, el, fixture, component } = mount();
    const statuses: string[] = [];
    component.statusChange.subscribe(s => statuses.push(s));
    (el.querySelector('[data-filter="failed"]') as HTMLButtonElement).click();
    let asks = lists(http);
    expect(asks.map(a => a.request.body)).toEqual([{ jobQueueId: 8814, status: 'failed', page: 0, size: 50 }]);
    expect(statuses).toEqual(['failed']);
    asks[0].flush({ status: API_SUCCESS, data: PAGE({ total: 2, items: [item(2, 'failed')] }) });
    fixture.detectChanges();
    expect(el.querySelector('[data-filter="failed"]')?.getAttribute('aria-pressed')).toBe('true');

    component.typed('risk = High');
    component.searchNow();
    asks = lists(http);
    expect(asks[0].request.body).toEqual({ jobQueueId: 8814, status: 'failed', search: 'risk = High', page: 0, size: 50 });
    asks[0].flush({ status: API_SUCCESS, data: PAGE() });

    component.goTo(1);
    expect(lists(http)[0].request.body).toEqual({ jobQueueId: 8814, status: 'failed', search: 'risk = High', page: 1, size: 50 });
  });

  it('adds a field as a column on request, marking a masked one', () => {
    const { http, fixture, el, component } = mount();
    component.toggleField('patient_name');
    const ask = lists(http)[0];
    expect(ask.request.body).toEqual({ jobQueueId: 8814, status: 'all', page: 0, size: 50, fields: ['patient_name'] });
    ask.flush({ status: API_SUCCESS, data: PAGE({ items: [{ ...item(1), fields: { patient_name: '••••' } }] }) });
    fixture.detectChanges();
    const th = el.querySelector('th[data-field-col="patient_name"]')!;
    expect(th.querySelector('app-icon')).not.toBeNull();
    expect(el.querySelector('tr[data-ref="1"]')?.textContent).toContain('••••');
  });

  it('asks before retrying the failed items, then retries them from their failed step and reads the list again', async () => {
    const { http, el, fixture, toasts, opened } = mount();
    let retried = 0;
    fixture.componentInstance.retried.subscribe(() => retried++);
    const button = el.querySelector('[data-test="items-retry-failed"]') as HTMLButtonElement;
    expect(button.textContent).toContain('Retry failed items (2)');
    button.click();
    await new Promise(r => setTimeout(r));
    expect(opened).toHaveLength(1);
    const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRunItems'));
    expect(ask.request.body).toEqual({ jobQueueId: 8814, failed: true, from: 'failed_step' });
    ask.flush({ status: API_SUCCESS, message: 'Retrying 2 items from AI prompt: attempt 2.', data: { jobQueueId: 8814, attempt: 2, items: 2, from: 'failed_step', fromStep: 'AI prompt' } });
    expect(toasts).toEqual(['Retrying 2 items from AI prompt: attempt 2.']);
    expect(retried).toBe(1);
    expect(lists(http)).toHaveLength(1);
  });

  it('retries nothing when the reader cancels, and says why it cannot when Core says no', async () => {
    const cancelled = mount(PAGE(), false);
    (cancelled.el.querySelector('[data-test="items-retry-failed"]') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
    cancelled.http.expectNone(r => r.url.endsWith('/sourceJob.json/retryRunItems'));

    const refused = mount(PAGE({ summary: { ...PAGE().summary, retryable: false } }));
    expect((refused.el.querySelector('[data-test="items-retry-failed"]') as HTMLButtonElement).disabled).toBe(true);
    expect(refused.el.querySelector('[data-test="items-retry-why"]')?.textContent).toContain('cannot be retried');
    expect(mount(PAGE(), true, false).el.querySelector('[data-test="items-retry-failed"]')).toBeNull();
  });

  it('opens a document\'s pages, the failed ones on request, with Retry page for a failed page', () => {
    const doc: RunItem = { ...item(5), label: 'referral-0412.pdf', children: { total: 40, done: 39, failed: 1 } };
    const { http, el, fixture } = mount(PAGE({ items: [doc] }));
    expect(el.querySelector('tr[data-ref="5"] [data-test="item-status"]')?.textContent?.trim()).toBe('1 page failed');
    (el.querySelector('[data-test="item-expand"]') as HTMLButtonElement).click();
    let ask = lists(http)[0];
    expect(ask.request.body).toEqual({ jobQueueId: 8814, status: 'all', parent: '5', page: 0, size: 15 });
    ask.flush({ status: API_SUCCESS, data: PAGE({ total: 40, items: [{ ...item(1), ref: '5.1', label: 'Page 1' }, { ...item(3, 'failed'), ref: '5.3', label: 'Page 3' }] }) });
    fixture.detectChanges();
    expect(el.querySelectorAll('tr[data-child]').length).toBe(2);
    (el.querySelector('[data-test="children-failed"]') as HTMLButtonElement).click();
    ask = lists(http)[0];
    expect(ask.request.body).toMatchObject({ status: 'failed', parent: '5', page: 0 });
    ask.flush({ status: API_SUCCESS, data: PAGE({ total: 1, items: [{ ...item(3, 'failed'), ref: '5.3', label: 'Page 3' }] }) });
    fixture.detectChanges();
    (el.querySelector('[data-test="child-retry"]') as HTMLButtonElement).click();
    expect(http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRunItems')).request.body).toEqual({ jobQueueId: 8814, refs: ['5.3'], from: 'item' });
  });

  it('asks for its first page itself when the page had none to give', () => {
    const { http } = mount(null);
    expect(lists(http).map(a => a.request.body)).toEqual([{ jobQueueId: 8814, status: 'all', page: 0, size: 50 }]);
  });
});
